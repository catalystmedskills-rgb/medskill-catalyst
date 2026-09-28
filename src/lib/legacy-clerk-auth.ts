import "server-only";
import { NextResponse } from "next/server";
import { AuthError, requireStaff } from "./auth";
import { assertSameOrigin } from "../modules/credentials/api";
import { CredentialError } from "../modules/credentials/errors";
import type { StaffRole } from "../generated/prisma/enums";

/** Called only in Clerk mode; shared passcodes never authorize this path. */
export async function denyLegacyClerkAuth(request: Request, minRole: StaffRole): Promise<NextResponse | null> {
  try {
    await requireStaff(minRole);
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertSameOrigin(request);
    return null;
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof CredentialError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    return NextResponse.json({ error: "Staff authentication unavailable" }, { status: 503 });
  }
}
