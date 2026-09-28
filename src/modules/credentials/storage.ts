import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CREDENTIAL_BUCKET, storageMode } from "./config";

/**
 * Private object storage for certificate PDFs and template assets.
 *
 * Paths are content-addressed (they contain the sha256 of the bytes), so a
 * write is either new or byte-identical to what is already there. put() never
 * overwrites different content: that is how "never silently replace an issued
 * certificate file" is enforced at the storage layer.
 */
export interface CredentialStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}

export class StorageConflictError extends Error {}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function certificatePdfKey(credentialId: string, sha256: string): string {
  return `certificates/${credentialId}/${sha256}.pdf`;
}

export function templateAssetKey(sha256: string, ext: string): string {
  return `template-assets/${sha256}.${ext}`;
}

const SAFE_KEY = /^[a-z0-9-]+(\/[A-Za-z0-9._-]+)+$/;
function assertSafeKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error("Unsafe storage key");
}

// ── Local filesystem (development/tests only; refused on Vercel) ──
export class LocalStorage implements CredentialStorage {
  constructor(private root = path.join(process.cwd(), ".data", "credential-storage")) {}

  private resolve(key: string) {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Unsafe storage key");
    return full;
  }

  async put(key: string, bytes: Uint8Array, _contentType?: string): Promise<void> {
    void _contentType;
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    try {
      await writeFile(full, bytes, { flag: "wx" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const existing = await readFile(full);
      if (sha256Hex(existing) !== sha256Hex(bytes)) throw new StorageConflictError(`Refusing to overwrite ${key}`);
    }
  }

  async get(key: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.resolve(key)));
  }
}

// ── Supabase Storage (private bucket) ──
export class SupabaseStorage implements CredentialStorage {
  private async client() {
    const { supabaseAdmin } = await import("@/src/lib/supabase");
    const admin = supabaseAdmin();
    let bucket = await admin.storage.getBucket(CREDENTIAL_BUCKET);
    if (bucket.error) {
      const status = "statusCode" in bucket.error ? String(bucket.error.statusCode) : "";
      if (status !== "404") throw new Error("Cannot verify credential bucket privacy.");
      const { error } = await admin.storage.createBucket(CREDENTIAL_BUCKET, { public: false, fileSizeLimit: "20MB" });
      if (error && !/already exists/i.test(error.message)) throw new Error("Cannot create private credential bucket.");
      // Another worker may have created the bucket. Never assume it is private.
      bucket = await admin.storage.getBucket(CREDENTIAL_BUCKET);
    }
    if (bucket.error || !bucket.data || bucket.data.public !== false) {
      throw new Error("Credential storage requires a verified private bucket.");
    }
    return admin;
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    assertSafeKey(key);
    const admin = await this.client();
    const { error } = await admin.storage.from(CREDENTIAL_BUCKET).upload(key, bytes, { contentType, upsert: false });
    if (!error) return;
    if (!/exists|duplicate/i.test(error.message)) throw error;
    const existing = await this.get(key);
    if (sha256Hex(existing) !== sha256Hex(bytes)) throw new StorageConflictError(`Refusing to overwrite ${key}`);
  }

  async get(key: string): Promise<Uint8Array> {
    assertSafeKey(key);
    const admin = await this.client();
    const { data, error } = await admin.storage.from(CREDENTIAL_BUCKET).download(key);
    if (error || !data) throw error ?? new Error("Download failed");
    return new Uint8Array(await data.arrayBuffer());
  }
}

let defaultStorage: CredentialStorage | null = null;

export function credentialStorage(): CredentialStorage {
  if (!defaultStorage) defaultStorage = storageMode() === "local" ? new LocalStorage() : new SupabaseStorage();
  return defaultStorage;
}
