import { afterEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => ({ getBucket: vi.fn(), createBucket: vi.fn(), from: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({ supabaseAdmin: () => ({ storage }) }));
import { SupabaseStorage } from "../../src/modules/credentials/storage";
afterEach(() => vi.resetAllMocks());
describe("private credential storage", () => {
  it("does not treat a failed privacy check as a missing bucket", async () => {
    storage.getBucket.mockResolvedValue({ data: null, error: { statusCode: "503" } });
    await expect(new SupabaseStorage().get("certificates/test/file.pdf")).rejects.toThrow("privacy");
    expect(storage.createBucket).not.toHaveBeenCalled();
    expect(storage.from).not.toHaveBeenCalled();
  });
  it("rechecks privacy after a concurrent bucket creation", async () => {
    storage.getBucket.mockResolvedValueOnce({ data: null, error: { statusCode: "404" } })
      .mockResolvedValueOnce({ data: { public: true }, error: null });
    storage.createBucket.mockResolvedValue({ error: { message: "already exists" } });
    await expect(new SupabaseStorage().put("template-assets/test.pdf", new Uint8Array(), "application/pdf")).rejects.toThrow("private bucket");
    expect(storage.from).not.toHaveBeenCalled();
  });
  it("checks privacy again when an existing client is reused", async () => {
    storage.getBucket.mockResolvedValueOnce({ data: { public: false }, error: null })
      .mockResolvedValueOnce({ data: { public: true }, error: null });
    storage.from.mockReturnValue({ download: async () => ({ data: new Blob(["pdf"]), error: null }) });
    const client = new SupabaseStorage();
    await expect(client.get("certificates/test/file.pdf")).resolves.toBeInstanceOf(Uint8Array);
    await expect(client.get("certificates/test/file.pdf")).rejects.toThrow("private bucket");
    expect(storage.from).toHaveBeenCalledTimes(1);
  });
});
