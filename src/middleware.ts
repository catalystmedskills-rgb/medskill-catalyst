import { NextResponse, type NextFetchEvent, type NextMiddleware, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { adminAuthMode, STAFF_SIGN_IN_PATH } from "@/src/lib/auth-mode";

/**
 * Admin authentication edge gate.
 *
 * In the default passcode mode this is a pass-through: nothing about the
 * current production behaviour changes until ADMIN_AUTH_MODE=clerk is set.
 *
 * In clerk mode, Clerk's middleware runs for admin surfaces so `auth()` works
 * in them, and signed-out requests are stopped here. This is only the outer
 * layer — every admin page, action and API route still authorizes itself
 * server-side through requireStaff()/requirePermission().
 */

const isAdminApi = createRouteMatcher(["/api/admin(.*)", "/api/credentials(.*)", "/api/invoices(.*)", "/api/careers/admin"]);
const isAdminPage = createRouteMatcher(["/admin(.*)"]);

let clerkHandler: NextMiddleware | null = null;

function clerkGate(): NextMiddleware {
  if (!clerkHandler) {
    clerkHandler = clerkMiddleware(
      async (auth, req) => {
        const { userId } = await auth();
        if (userId) return;
        if (isAdminApi(req)) {
          return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }
        if (isAdminPage(req)) {
          const url = new URL(STAFF_SIGN_IN_PATH, req.url);
          url.searchParams.set("redirect_url", req.nextUrl.pathname);
          return NextResponse.redirect(url);
        }
      },
      { signInUrl: STAFF_SIGN_IN_PATH },
    ) as NextMiddleware;
  }
  return clerkHandler;
}

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  if (adminAuthMode() !== "clerk") return NextResponse.next();
  return clerkGate()(req, ev);
}

export const config = {
  // Only the surfaces that need a staff session. Public pages (including
  // /verify) never pass through Clerk.
  matcher: [
    "/admin",
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/credentials/:path*",
    "/api/invoices",
    "/api/invoices/:path*",
    "/api/careers/admin",
    "/staff-sign-in/:path*",
    "/staff-sign-in",
  ],
};
