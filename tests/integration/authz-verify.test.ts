import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// ── Mocks: Next's cookie store and Clerk's session ────────────────
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => jar.set(n, v),
    delete: (n: string) => jar.delete(n),
  }),
  headers: async () => new Headers(),
}));
const clerk = { userId: null as string | null, emails: [] as { emailAddress: string; verification: { status: string } }[] };
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerk.userId }),
  currentUser: async () => (clerk.userId ? { firstName: "Test", lastName: "User", emailAddresses: clerk.emails } : null),
  clerkMiddleware: () => () => undefined,
  createRouteMatcher: () => () => false,
}));

import { db, deps, issueInput, program, staff } from "../helpers";
import { DEV_STAFF_COOKIE, requirePermission, requireStaff, SHARED_PASSCODE_IDENTITY, AuthError } from "@/src/lib/auth";
import { Permission } from "@/src/lib/permissions";
import { issueCredential, revokeCredential } from "@/src/modules/credentials/service";
import { verifyByCertificateId, verifyByToken, publicCertificatePdf } from "@/src/modules/credentials/verify";
import { addStaff, updateStaff } from "@/src/modules/staff/service";
import { POST as issueRoute } from "@/src/app/api/credentials/route";
import { POST as revokeRoute } from "@/src/app/api/credentials/[id]/revoke/route";
import { GET as detailRoute } from "@/src/app/api/credentials/[id]/route";
import { GET as publicVerifyRoute } from "@/src/app/api/verify/[token]/route";
import { POST as publicSearchRoute } from "@/src/app/api/verify/search/route";
import { GET as invoiceList } from "@/src/app/api/invoices/route";
import { GET as careersList } from "@/src/app/api/careers/admin/route";
import { denyLegacyClerkAuth } from "@/src/lib/legacy-clerk-auth";

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
  jar.clear();
  clerk.userId = null;
  clerk.emails = [];
});

function actAs(staffId: string) {
  process.env.ADMIN_AUTH_MODE = "dev";
  process.env.DEV_AUTH_ENABLE = "local-only";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  jar.set(DEV_STAFF_COOKIE, staffId);
}

const json = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/credentials", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3000", origin: "http://localhost:3000", ...headers },
    body: JSON.stringify(body),
  });

let P: Awaited<ReturnType<typeof program>>;
beforeAll(async () => {
  P = await program({ code: "AUZ" });
});

describe("server-side authorization", () => {
  it("legacy routes refuse shared passcodes in Clerk mode", async () => {
    process.env.ADMIN_AUTH_MODE = "clerk";
    process.env.ADMIN_PASSCODE = "test-passcode";
    const req = new Request("http://localhost:3000/api/invoices", { headers: { "x-admin-passcode": "test-passcode" } });
    expect((await invoiceList(req)).status).toBe(401);
    expect((await careersList(req)).status).toBe(401);
  });

  it("credential issuers cannot use invoice or careers APIs", async () => {
    const issuer = await staff("ISSUER");
    process.env.ADMIN_AUTH_MODE = "clerk";
    clerk.userId = issuer.clerk_user_id;
    const req = new Request("http://localhost:3000/api/invoices");
    expect((await invoiceList(req)).status).toBe(403);
    expect((await careersList(req)).status).toBe(403);
  });

  it("authorized legacy writes still require a same-origin JSON request", async () => {
    const admin = await staff("ADMIN");
    process.env.ADMIN_AUTH_MODE = "clerk";
    clerk.userId = admin.clerk_user_id;
    expect(await denyLegacyClerkAuth(json({}), "ACCOUNTS")).toBeNull();
    expect((await denyLegacyClerkAuth(json({}, { origin: "https://evil.example" }), "ACCOUNTS"))?.status).toBe(403);
  });
  it("VIEWER cannot issue; ISSUER can; ACCOUNTS cannot revoke; ADMIN can", async () => {
    const viewer = await staff("VIEWER");
    const issuer = await staff("ISSUER");
    const accounts = await staff("ACCOUNTS");
    const admin = await staff("ADMIN");

    actAs(viewer.id);
    const denied = await issueRoute(json(issueInput(P)), undefined as never);
    expect(denied.status).toBe(403);

    actAs(issuer.id);
    const input = issueInput(P);
    const ok = await issueRoute(json(input, { "idempotency-key": input.idempotencyKey }), undefined as never);
    expect(ok.status).toBe(201);
    const body = await ok.json();
    expect(body.credential.status).toBe("VALID");
    const again = await issueRoute(json(input, { "idempotency-key": input.idempotencyKey }), undefined as never);
    expect(again.status).toBe(200); // idempotent replay
    expect((await again.json()).credential.id).toBe(body.credential.id);

    actAs(accounts.id);
    const ctx = { params: Promise.resolve({ id: body.credential.id }) };
    expect((await revokeRoute(json({ reason: "Should not be allowed" }), ctx)).status).toBe(403);

    actAs(admin.id);
    const revoked = await revokeRoute(json({ reason: "Admin revocation test" }), ctx);
    expect(revoked.status).toBe(200);
  });

  it("the shared passcode identity can browse but cannot issue or revoke", async () => {
    const shared = await db.staffUser.upsert({
      where: { clerk_user_id: SHARED_PASSCODE_IDENTITY },
      create: { clerk_user_id: SHARED_PASSCODE_IDENTITY, name: "Admin", email: `shared-${randomUUID()}@x.test`, role: "ADMIN" },
      update: {},
    });
    actAs(shared.id);
    await expect(requirePermission(Permission.CredentialsView)).resolves.toBeTruthy();
    await expect(requirePermission(Permission.CredentialsIssue, { individual: true })).rejects.toMatchObject({ status: 403 });
    const res = await issueRoute(json(issueInput(P), { "idempotency-key": `k-${randomUUID()}` }), undefined as never);
    expect(res.status).toBe(403);
  });

  it("deactivated staff are refused", async () => {
    const gone = await staff("ADMIN", { is_active: false });
    actAs(gone.id);
    await expect(requireStaff()).rejects.toMatchObject({ status: 403 });
    await expect(requirePermission(Permission.CredentialsView)).rejects.toMatchObject({ status: 403 });
  });

  it("dev impersonation is refused on Vercel or without the explicit flag", async () => {
    const admin = await staff("ADMIN");
    actAs(admin.id);
    process.env.VERCEL = "1";
    await expect(requireStaff()).rejects.toBeInstanceOf(AuthError);
    delete process.env.VERCEL;
    delete process.env.DEV_AUTH_ENABLE;
    await expect(requireStaff()).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects cross-site and non-JSON writes", async () => {
    const issuer = await staff("ISSUER");
    actAs(issuer.id);
    const cross = await issueRoute(json(issueInput(P), { origin: "https://evil.example", "idempotency-key": `k-${randomUUID()}` }), undefined as never);
    expect(cross.status).toBe(403);
    const site = await issueRoute(json(issueInput(P), { "sec-fetch-site": "cross-site", "idempotency-key": `k-${randomUUID()}` }), undefined as never);
    expect(site.status).toBe(403);
    const form = new Request("http://localhost:3000/api/credentials", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", host: "localhost:3000" }, body: "a=b" });
    expect((await issueRoute(form, undefined as never)).status).toBe(400);
  });

  it("VIEWER detail omits private fields; ADMIN sees the internal reason", async () => {
    const issuer = await staff("ISSUER");
    const admin = await staff("ADMIN");
    const c = (await issueCredential(issueInput(P), issuer, deps())).credential;
    await revokeCredential(c.id, "Internal-only reason xyz", admin, deps());
    const viewer = await staff("VIEWER");
    const ctx = { params: Promise.resolve({ id: c.id }) };
    const get = () => detailRoute(new Request(`http://localhost:3000/api/credentials/${c.id}`), ctx);
    actAs(viewer.id);
    const v = JSON.stringify(await (await get()).json());
    expect(v).not.toContain("@example.test");
    expect(v).not.toContain("Internal-only reason xyz");
    actAs(admin.id);
    const a = JSON.stringify(await (await get()).json());
    expect(a).toContain("@example.test");
    expect(a).toContain("Internal-only reason xyz");
  });
});

describe("clerk identity mapping", () => {
  it("binds a pending staff row on first sign-in with a VERIFIED matching email only", async () => {
    process.env.ADMIN_AUTH_MODE = "clerk";
    const admin = await staff("ADMIN");
    const email = `new-${randomUUID().slice(0, 6)}@medskills.test`;
    await addStaff({ name: "New Issuer", email, role: "ISSUER" }, admin);

    clerk.userId = `user_${randomUUID()}`;
    clerk.emails = [{ emailAddress: email, verification: { status: "unverified" } }];
    await expect(requireStaff()).rejects.toMatchObject({ status: 403 });

    clerk.emails = [{ emailAddress: email.toUpperCase(), verification: { status: "verified" } }];
    const s = await requireStaff();
    expect(s.email).toBe(email);
    expect(s.clerk_user_id).toBe(clerk.userId);
    expect(s.role).toBe("ISSUER");

    // A different Clerk account with the same email cannot take over the bound row.
    clerk.userId = `user_${randomUUID()}`;
    await expect(requireStaff()).rejects.toMatchObject({ status: 403 });
  });

  it("an unknown signed-in user gets nothing; bootstrap emails become the first admin", async () => {
    process.env.ADMIN_AUTH_MODE = "clerk";
    clerk.userId = `user_${randomUUID()}`;
    const email = `founder-${randomUUID().slice(0, 6)}@medskills.test`;
    clerk.emails = [{ emailAddress: email, verification: { status: "verified" } }];
    await expect(requireStaff()).rejects.toMatchObject({ status: 403 });
    process.env.BOOTSTRAP_ADMIN_EMAILS = `someone@x.test, ${email}`;
    const s = await requireStaff();
    expect(s.role).toBe("ADMIN");
  });

  it("a signed-out request is 401", async () => {
    process.env.ADMIN_AUTH_MODE = "clerk";
    await expect(requireStaff()).rejects.toMatchObject({ status: 401 });
  });
});

describe("last-admin lockout guard", () => {
  it("refuses to demote or deactivate the last live admin", async () => {
    // Make every other live admin inactive for this test's view of the world.
    await db.staffUser.updateMany({ where: { role: "ADMIN" }, data: { is_active: false } });
    const only = await staff("ADMIN");
    await expect(updateStaff(only.id, { role: "VIEWER" }, only)).rejects.toThrow(/last active admin/);
    await expect(updateStaff(only.id, { is_active: false }, only)).rejects.toThrow(/last active admin/);
    const second = await staff("ADMIN");
    await expect(updateStaff(only.id, { role: "VIEWER" }, second)).resolves.toMatchObject({ role: "VIEWER" });
    await expect(updateStaff(second.id, { is_active: false }, second)).rejects.toThrow(/last active admin/);
  });
});

describe("public verification", () => {
  it("token and certificate-ID lookups resolve to the same record with only public fields", async () => {
    const issuer = await staff("ISSUER");
    const c = (await issueCredential(issueInput(P, { fullName: "Meera Iyer" }), issuer, deps())).credential;
    const byToken = await verifyByToken(c.verification_token, `test:${randomUUID()}`);
    const byId = await verifyByCertificateId(` ${c.certificate_id.toLowerCase()} `, `test:${randomUUID()}`);
    expect(byToken.kind).toBe("found");
    expect(byId.kind === "found" && byId.token).toBe(c.verification_token);
    const res = await publicVerifyRoute(new Request("http://x/api/verify/t", { headers: { "x-real-ip": "203.0.113.9" } }), { params: Promise.resolve({ token: c.verification_token }) });
    const body = await res.json();
    expect(body.credential.learnerName).toBe("Meera Iyer");
    const text = JSON.stringify(body);
    expect(text).not.toContain("@example.test");
    expect(text).not.toContain(c.id);
    expect(text).not.toContain(c.student_id);
  });

  it("unknown, malformed, failed and not-yet-issued credentials all look the same", async () => {
    const k = `test:${randomUUID()}`;
    expect((await verifyByToken("A".repeat(22), k)).kind).toBe("not_found");
    expect((await verifyByToken("../../etc/passwd", k)).kind).toBe("not_found");
    expect((await verifyByCertificateId("MSC-2026-AUZ-222222", k)).kind).toBe("not_found");
    expect((await verifyByCertificateId("' OR 1=1 --", k)).kind).toBe("not_found");
    const res = await publicSearchRoute(new Request("http://x/api/verify/search", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "203.0.113.10" }, body: JSON.stringify({ certificateId: "nope" }) }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "Credential not found" });
  });

  it("rate-limits repeated misses per client, without affecting other clients", async () => {
    const attacker = `test:${randomUUID()}`;
    let last;
    for (let i = 0; i < 25; i++) last = await verifyByToken(`${"B".repeat(21)}${i % 10}`, attacker);
    expect(last!.kind).toBe("rate_limited");
    const issuer = await staff("ISSUER");
    const c = (await issueCredential(issueInput(P), issuer, deps())).credential;
    expect((await verifyByToken(c.verification_token, attacker)).kind).toBe("rate_limited"); // blocked client stays blocked
    expect((await verifyByToken(c.verification_token, `test:${randomUUID()}`)).kind).toBe("found");
  });

  it("revoked credentials still resolve publicly with REVOKED; the PDF is only offered while valid", async () => {
    const issuer = await staff("ISSUER");
    const admin = await staff("ADMIN");
    const c = (await issueCredential(issueInput(P), issuer, deps())).credential;
    expect((await publicCertificatePdf(c.verification_token, `t:${randomUUID()}`)).kind).toBe("found");
    await revokeCredential(c.id, "Revoked in test", admin, deps());
    const r = await verifyByToken(c.verification_token, `t:${randomUUID()}`);
    expect(r.kind === "found" && r.credential.status).toBe("REVOKED");
    expect((await publicCertificatePdf(c.verification_token, `t:${randomUUID()}`)).kind).toBe("not_found");
  });
});
