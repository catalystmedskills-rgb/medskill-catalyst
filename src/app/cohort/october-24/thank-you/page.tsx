import type { Metadata } from "next";
import Image from "next/image";
import { MASTERCLASS_EVENT, SUPPORT_EMAIL } from "@/src/modules/masterclass/event";
import { readMasterclassConfig, timeLabel } from "@/src/modules/masterclass/config";
import { getRegistrationSummary } from "@/src/modules/masterclass/service";
import { maskEmail } from "@/src/modules/masterclass/schema";
import { WhatsappJoin } from "./whatsapp-join";
import { ThankYouViewTracker } from "./view-tracker";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You're registered — MedSkills Catalyst Masterclass",
  robots: { index: false, follow: false },
};

export default async function MasterclassThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; existing?: string }>;
}) {
  const { r, existing } = await searchParams;
  const summary = typeof r === "string" ? await getRegistrationSummary(r) : null;
  const config = readMasterclassConfig();
  const time = timeLabel(config);
  const confirmed = Boolean(summary);

  return (
    <div className="flex min-h-screen flex-col bg-canvas font-body text-ink antialiased">
      <ThankYouViewTracker confirmed={confirmed} returning={existing === "1"} />
      <header className="border-b border-brand-navy/10 bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-5">
          <a href="/" className="flex items-center gap-3" aria-label="MedSkills Catalyst home">
            <Image src="/brand/logo/MedSkills-Catalyst_Logo-01.svg" alt="" width={36} height={36} priority className="h-9 w-9" />
            <span className="font-display text-[1.05rem] font-bold text-brand-navy">MedSkills Catalyst</span>
          </a>
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden px-5 py-12 sm:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(50%_50%_at_50%_0%,rgba(0,88,158,0.10),transparent_70%)]"
        />
        <div className="relative mx-auto max-w-xl">
          {confirmed ? (
            <section aria-labelledby="ty-title" className="rounded-msc-xl border border-brand-navy/[0.08] bg-surface p-7 text-center shadow-msc-float sm:p-10">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
                <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" aria-hidden>
                  <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h1 id="ty-title" className="mt-6 font-display text-3xl font-bold leading-tight text-brand-navy sm:text-4xl">
                Thank You for Registering! <span aria-hidden>🎉</span>
              </h1>
              <p className="mt-3 text-base leading-relaxed text-muted">
                {existing === "1" ? (
                  <>You&rsquo;re already registered for the {MASTERCLASS_EVENT.title}, {summary!.firstName} — no need to sign up again.</>
                ) : (
                  <>You&rsquo;re registered for the {MASTERCLASS_EVENT.title}, {summary!.firstName}.</>
                )}
              </p>

              <div className="mx-auto mt-6 inline-flex flex-col items-center rounded-msc-md border border-brand-navy/[0.08] bg-brand-pale/60 px-6 py-4">
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-brand-blue">Live on Zoom</span>
                <span className="mt-1 font-display text-2xl font-bold text-brand-navy">{MASTERCLASS_EVENT.dateLabel}</span>
                {time && <span className="mt-0.5 text-sm font-semibold text-muted">{time}</span>}
              </div>

              <p className="mt-6 text-sm leading-relaxed text-muted">
                Your masterclass joining details will be sent to your registered email address
                {summary ? (
                  <>
                    {" "}
                    (<span className="font-semibold text-brand-navy">{maskEmail(summary.email)}</span>)
                  </>
                ) : null}
                . If it isn&rsquo;t in your inbox within a few minutes, check spam or promotions.
              </p>
            </section>
          ) : (
            <section aria-labelledby="ty-title" className="rounded-msc-xl border border-brand-navy/[0.08] bg-surface p-7 text-center shadow-msc-float sm:p-10">
              <h1 id="ty-title" className="font-display text-3xl font-bold leading-tight text-brand-navy">
                {MASTERCLASS_EVENT.title}
              </h1>
              <p className="mt-3 text-base leading-relaxed text-muted">
                We couldn&rsquo;t find a registration from this link. If you&rsquo;ve just registered, your joining details
                are on their way to your email. Otherwise, it only takes a minute to sign up.
              </p>
              <a
                href={`${MASTERCLASS_EVENT.path}#register`}
                className="mt-6 inline-flex h-12 items-center justify-center rounded-pill bg-brand-blue px-7 text-sm font-bold text-white shadow-msc-glow"
              >
                Register for the Masterclass
              </a>
            </section>
          )}

          {confirmed && (
            <section aria-labelledby="wa-title" className="mt-6 rounded-msc-lg border border-wa/20 bg-surface p-7 text-center shadow-msc-md sm:p-8">
              <h2 id="wa-title" className="font-display text-2xl font-bold text-brand-navy">
                Join Our WhatsApp Community
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">
                Get daily updates, important announcements, session reminders and masterclass information directly
                through our WhatsApp community.
              </p>
              <div className="mt-6">
                {config.whatsappUrl ? (
                  <WhatsappJoin url={config.whatsappUrl} autoRedirect registrationId={r ?? null} />
                ) : (
                  <p className="text-sm font-medium text-muted">
                    The community invite link will be shared with you shortly.
                  </p>
                )}
              </div>
            </section>
          )}

          <p className="mt-8 text-center text-xs text-muted">
            Questions? Write to{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-brand-blue underline underline-offset-2">
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
