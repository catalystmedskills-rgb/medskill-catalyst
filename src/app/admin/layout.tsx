import Link from "next/link";
import type { ReactNode } from "react";
import { staffGate } from "@/src/lib/auth";
import { logoutAction } from "./auth-actions";
import { AdminLogin } from "./login-form";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const gate = await staffGate();

  // A backend failure is not a login failure. Re-prompting here would hide a
  // database outage behind what looks like a rejected passcode.
  if (!gate.ok) return <AdminLogin backendDown={gate.reason === "backend"} />;
  const staff = gate.staff;

  const nav = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/leads", label: "Leads" },
    { href: "/admin/masterclass", label: "Masterclass" },
    { href: "/admin/careers", label: "Careers" },
    { href: "/admin-legacy", label: "Invoices (legacy)" },
  ];

  return (
    <div className="min-h-screen bg-canvas font-body text-ink">
      <header className="border-b border-brand-navy/10 bg-brand-navy">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-display text-lg font-bold text-white">
              MedSkills <span className="text-brand-cyan">CRM</span>
            </Link>
            <nav className="flex items-center gap-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-msc px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-white/70 sm:block">{staff.name}</span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-msc px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
