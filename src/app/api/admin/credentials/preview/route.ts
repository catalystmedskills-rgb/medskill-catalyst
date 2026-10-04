import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError, requirePermission } from "@/src/lib/auth";
import { Permission } from "@/src/lib/permissions";
import { CredentialError } from "@/src/modules/credentials/errors";
import { previewIssue } from "@/src/modules/credentials/service";
import { readIssueForm } from "@/src/app/admin/credentials/issue/read-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same checks as assertSameOrigin, for a form post (multipart, not JSON). */
function assertSameSiteForm(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new AuthError(403, "Cross-site request refused");
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    /* refused below */
  }
  if (!host || originHost !== host) throw new AuthError(403, "Cross-site request refused");
}

/**
 * Issue workflow "Certificate preview": the certificate exactly as it would be
 * issued from the submitted form, stamped PREVIEW. Nothing is stored. POST, so
 * learner details never appear in a URL, log line or browser history.
 */
export async function POST(req: Request) {
  try {
    assertSameSiteForm(req);
    await requirePermission(Permission.CredentialsIssue, { individual: true });
    const bytes = await previewIssue(readIssueForm(await req.formData()));
    return new NextResponse(Buffer.from(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="certificate-preview.pdf"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof AuthError) return new NextResponse("Unauthorized", { status: e.status });
    if (e instanceof CredentialError) return new NextResponse(e.message, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    if (e instanceof ZodError) return new NextResponse(e.issues.map((i) => i.message).join("; "), { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    console.error("[issue preview]", e);
    return new NextResponse("Preview failed", { status: 500 });
  }
}
