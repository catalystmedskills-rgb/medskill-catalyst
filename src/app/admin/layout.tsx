import Link from "next/link";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { staffGate } from "@/src/lib/auth";
import { adminAuthMode } from "@/src/lib/auth-mode";
import { can, Permission, ROLE_LABELS } from "@/src/lib/permissions";
import { logoutAction } from "./auth-actions";
import { AdminLogin } from "./login-form";
import { DevLogin } from "./dev-login";
import { ClerkAccountMenu, NotAuthorized } from "./clerk-ui";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const mode = process.env.ADMIN_AUTH_MODE === "dev" ? "dev" : adminAuthMode();
  const content = await AdminShell({ children, mode });
  // ClerkProvider only in clerk mode: in passcode mode there are no Clerk keys
  // and nothing on the page should try to load Clerk.
  return mode === "clerk" ? <ClerkProvider>{content}</ClerkProvider> : content;
}

async function AdminShell({ children, mode }: { children: ReactNode; mode: "passcode" | "clerk" | "dev" }) {
  const gate = await staffGate();

  if (!gate.ok) {
    // A backend failure is not a login failure. Re-prompting here would hide a
    // database outage behind what looks like a rejected login.
    if (gate.reason === "forbidden") return <NotAuthorized message={gate.message} clerk={mode === "clerk"} />;
    if (mode === "dev") return <DevLogin />;
    // Clerk mode: middleware redirects signed-out users before we get here; if
    // a request slips through, the passcode form is NOT shown (it no longer
    // grants access in this mode).
    if (mode === "clerk") return <NotAuthorized message="Sign in to continue." clerk />;
    return <AdminLogin backendDown={gate.reason === "backend"} />;
  }
  const staff = gate.staff;

  const nav = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/leads", label: "Leads" },
    { href: "/admin/masterclass", label: "Masterclass" },
    { href: "/admin/careers", label: "Careers" },
    { href: "/admin/credentials", label: "Credentials", show: can(staff.role, Permission.CredentialsView) },
    { href: "/admin/staff", label: "Staff", show: mode !== "passcode" && can(staff.role, Permission.StaffManage) },
    { href: "/admin-legacy", label: "Invoices (legacy)" },
  ].filter((item) => item.show !== false);

  return (
    <div className="min-h-screen bg-canvas font-body text-ink">
      <header className="border-b border-brand-navy/10 bg-brand-navy">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/admin" className="shrink-0 font-display text-lg font-bold text-white">
              MedSkills <span className="text-brand-cyan">CRM</span>
            </Link>
            <nav className="flex items-center gap-1 overflow-x-auto">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-msc px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-white/70 sm:block">
              {staff.name} · {ROLE_LABELS[staff.role]}
              {mode === "dev" && <span className="ml-1 text-amber-300">(dev identity)</span>}
            </span>
            {mode === "clerk" ? (
              <ClerkAccountMenu />
            ) : (
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="rounded-msc px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  Sign out
                </button>
              </form>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
