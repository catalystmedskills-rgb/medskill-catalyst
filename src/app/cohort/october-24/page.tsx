import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import { MASTERCLASS_EVENT, PRIVACY_POLICY_PATH, SITE_URL, SUPPORT_EMAIL } from "@/src/modules/masterclass/event";
import { cookies } from "next/headers";
import { HOLD_COOKIE, readHoldValue } from "@/src/modules/masterclass/hold";
import {
  holdEnabled,
  formatDeadline,
  masterclassReadiness,
  pricingAt,
  readMasterclassConfig,
  timeLabel,
} from "@/src/modules/masterclass/config";
import { RegistrationForm } from "./registration-form";
import { LandingViewTracker, RegisterCta, StickyRegisterBar } from "./client-bits";

export const dynamic = "force-dynamic";

const TITLE = "Do You Know? Medtech 101 Masterclass — 24 October 2026 | MedSkills Catalyst";
const DESCRIPTION =
  "A live Zoom masterclass for life-science, biotech and pharmacy students and graduates: how the medical-device industry works, the roles your degree can lead to, and how to start preparing.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}${MASTERCLASS_EVENT.path}` },
  openGraph: {
    title: `${MASTERCLASS_EVENT.sessionTitle} — 24 October 2026`,
    description: DESCRIPTION,
    url: `${SITE_URL}${MASTERCLASS_EVENT.path}`,
    type: "website",
    images: [{ url: `${SITE_URL}/assets/og-home-v3.jpg` }],
  },
};

// ── Verified fallback content ────────────────────────────────────────
// Used only when the CMS has nothing published. Copied from the live site
// (index.html faculty + success-story sections); keep the two in step.

type Mentor = { name: string; role: string; photo: string; tags: string[]; bio: string };

const FALLBACK_MENTORS: Mentor[] = [
  {
    name: "Gagan Victor",
    role: "Co-Founder & Program Director",
    photo: "/assets/gagan_victor.jpg",
    tags: ["Ex-Pfizer, BMS, Medtronic & Stryker", "Career Coach"],
    bio: "Former leader at Pfizer, BMS, Medtronic India and Stryker, overseeing cardiovascular and surgical device portfolios. Went from Medical Rep to corporate MedTech leader before moving full-time into training and mentoring.",
  },
  {
    name: "Shilpi Babbar",
    role: "Co-Founder & Skills Enhancement Coach",
    photo: "/assets/shilpi_babbar.jpg",
    tags: ["ICBI-NABET Certified", "11+ Years Experience"],
    bio: "More than a decade in coaching and career counselling. Specialises in the communication, emotional intelligence and resilience that high-pressure MedTech roles demand.",
  },
  {
    name: "Dr. Vincent Keny, PhD",
    role: "Executive Coach & Leadership Mentor",
    photo: "/assets/vincent_keny.png",
    tags: ["Ex-Boston Scientific", "ICF Certified Coach", "MIT Sloan Alumnus"],
    bio: "25+ years of global corporate leadership. Coaches candidates on executive communication and the interpersonal dynamics that shape performance in MedTech.",
  },
  {
    name: "Tabish",
    role: "L&D Specialist & Corporate Mentor",
    photo: "/assets/tabish.jpg",
    tags: ["Ex-3M, BD & Abbott Vascular", "20+ Years Experience"],
    bio: "20+ years in healthcare and MedTech, designing learning programmes that build the behavioural competencies MedTech careers need.",
  },
];

type Story = { name: string; photo: string | null; transition: string; quote: string };

const FALLBACK_STORIES: Story[] = [
  {
    name: "Shivam Tiwari",
    photo: "/assets/shivam_tiwari.png",
    transition: "Clinical Support → Territory Manager",
    quote:
      "Coming from a clinical background, the commercial side of MedTech felt like a different language. The founders of MedSkills Catalyst taught me how to think like a Territory Manager. The training on cardiovascular devices and commercial strategy directly prepared me for my current role at Abbott.",
  },
  {
    name: "Garvita Khurana",
    photo: "/assets/garvita_khurana.png",
    transition: "Senior Territory Sales Manager → Product Manager",
    quote:
      "I spent years in sales and assumed product management was an entirely different world. The founders of MedSkills Catalyst helped me see the connection. That grounding is why I was able to make the switch to a Product Manager role at Teleflex.",
  },
];

// This release has no CMS, so the page uses the verified content above. When
// the CMS lands, read faculty, stories and the cohort date from site-content.
async function loadContent() {
  return { mentors: FALLBACK_MENTORS, storyCards: FALLBACK_STORIES, nextCohort: "14 November 2026" };
}

// ── Icons (thin stroke, inherit currentColor) ────────────────────────
const Icon = {
  check: (c = "h-4 w-4") => (
    <svg viewBox="0 0 24 24" fill="none" className={c} aria-hidden>
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  calendar: (c = "h-5 w-5") => (
    <svg viewBox="0 0 24 24" fill="none" className={c} aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  clock: (c = "h-5 w-5") => (
    <svg viewBox="0 0 24 24" fill="none" className={c} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  video: (c = "h-5 w-5") => (
    <svg viewBox="0 0 24 24" fill="none" className={c} aria-hidden>
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m15.5 10.5 6-3.5v10l-6-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
};

// The six "Do you know?" questions the session answers (owner-supplied, verbatim).
const LEARN = [
  {
    title: "You could be sitting on a goldmine of opportunities in MedTech!",
    body: "Discover a side of healthcare most graduates never hear about in college — and where someone with your background fits in.",
  },
  {
    title: "Do you know how many career paths exist beyond Pharma sales?",
    body: "We'll walk you through the career functions in MedTech — clinical, commercial, product and more — and what each one involves.",
  },
  {
    title: "Do you know that medical devices and pharmaceuticals follow different business models?",
    body: "See how the device industry works differently from pharma, and why that knowledge gap holds so many candidates back.",
  },
  {
    title: "Do you know what MedTech hiring managers look for beyond your degree?",
    body: "The industry-relevant skills recruiters expect, and how to start building them now.",
  },
  {
    title: "Do you know why good Pharma professionals sometimes struggle to transition into MedTech?",
    body: "Why understanding the MedTech ecosystem matters as much as experience — and how to close that gap.",
  },
  {
    title: "Do you know how to take your first step into MedTech?",
    body: "Leave with a clear next step, including what our upcoming 6-week cohort offers if you want structured preparation.",
  },
];

const AUDIENCE = [
  {
    title: "Life-science students",
    body: "B.Sc / M.Sc in life sciences, zoology, microbiology, biochemistry and related subjects — wondering what lies beyond lab and research roles.",
  },
  {
    title: "Biotechnology & biomedical students",
    body: "B.Tech / M.Tech / B.Sc biotech and biomedical learners curious how their training applies to medical devices.",
  },
  {
    title: "Pharmacy students",
    body: "B.Pharm, M.Pharm and Pharm.D students who want to compare pharma careers with the medical-device side of healthcare.",
  },
  {
    title: "Recent graduates & career explorers",
    body: "Pass-outs and aspiring MedTech professionals deciding on their first move — no device experience needed.",
  },
];

const WHY_ATTEND = [
  { title: "See the path", body: "Understand the MedTech roles open to someone with your degree." },
  { title: "Hear it from practitioners", body: "Learn from people who have built, sold and hired across MedTech." },
  { title: "Get clarity in one session", body: "Leave with a clearer idea of your options — no long commitment." },
  { title: "Join from anywhere", body: "Live on Zoom. Your joining link arrives by email." },
];

function SectionHeading({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-blue">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-bold leading-[1.15] tracking-tight text-brand-navy sm:text-4xl">
        {title}
      </h2>
      {intro && <p className="mt-4 text-base leading-relaxed text-muted">{intro}</p>}
    </div>
  );
}

/**
 * Local photos go through next/image (resized, modern formats); remote CMS
 * uploads fall back to a plain lazy <img> so no remotePatterns config is needed.
 */
function Photo({ src, alt, size, className, eager }: { src: string; alt: string; size: number; className: string; eager?: boolean }) {
  if (src.startsWith("/")) {
    return <Image src={src} alt={alt} width={size} height={size} sizes={`${size}px`} priority={eager} className={className} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} loading={eager ? "eager" : "lazy"} decoding="async" className={className} />;
}

function initials(name: string) {
  return name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default async function MasterclassLandingPage() {
  const config = readMasterclassConfig();
  const holdStart = holdEnabled(config)
    ? readHoldValue((await cookies()).get(HOLD_COOKIE)?.value, config.holdSecret!)
    : null;
  const pricingNow = pricingAt(config, new Date(), holdStart);
  // Registration also closes once the session has started.
  const open = masterclassReadiness(config).open && pricingNow.phase !== "closed";
  const pricing = {
    initialPhase: pricingNow.phase === "paid" ? ("paid" as const) : ("free" as const),
    freeUntilISO: config.freeUntil?.toISOString() ?? null,
    freeUntilLabel: config.freeUntil ? formatDeadline(config.freeUntil) : null,
    holdEnabled: holdEnabled(config),
    holdMinutes: config.holdMinutes,
    holdEndsISO: pricingNow.holdEndsAt?.toISOString() ?? null,
  };
  const time = timeLabel(config);
  const { mentors, storyCards, nextCohort } = await loadContent();
  const lead = mentors[0];

  const FAQ: { q: string; a: ReactNode }[] = [
    {
      q: "Who can attend?",
      a: "Students in their first, second or third year and recent pass-outs from life-science, biotechnology, biomedical and pharmacy backgrounds — and anyone seriously exploring a MedTech career.",
    },
    {
      q: "Do I need any medical-device experience?",
      a: "No. The masterclass is designed as an introduction for people who are new to the industry.",
    },
    {
      q: "When is it, and how long is it?",
      a: time
        ? `${MASTERCLASS_EVENT.dayDateLabel}, ${time}.`
        : `${MASTERCLASS_EVENT.dayDateLabel}. The exact time will be included in your confirmation email.`,
    },
    {
      q: "How do I join?",
      a: "The masterclass runs live on Zoom. After you register, we email your Zoom joining link to the address you give us — keep that email handy for the day.",
    },
    {
      q: "What happens after I register?",
      a: "You'll see a confirmation screen straight away, and your joining details arrive by email. You'll also be invited to our WhatsApp community for reminders and announcements.",
    },
    {
      q: "I registered but can't find the email. What should I do?",
      a: (
        <>
          Check your spam or promotions folder first. If it isn&rsquo;t there, submit the form again with the same email
          address — we&rsquo;ll resend your link without creating a duplicate registration — or write to{" "}
          <a className="font-semibold text-brand-blue underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </>
      ),
    },
    {
      q: "Is this the same as the MedSkills Catalyst cohort?",
      a: `No. The masterclass is a single live session. The 6-week, mentor-led MedSkills Catalyst cohort is a separate programme — the next one starts ${nextCohort}. You can ask about it on the day, with no obligation.`,
    },
    {
      q: "Does attending guarantee a job?",
      a: "No. MedSkills Catalyst provides learning and career-readiness support; hiring decisions rest with employers and depend on each candidate.",
    },
  ];

  return (
    <div className="relative min-h-screen bg-canvas font-body text-ink antialiased">
      <LandingViewTracker />

      {/* ── Header: logo only, no exits from the page ── */}
      <header className="sticky top-0 z-40 border-b border-brand-navy/10 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <a href="/" className="flex items-center gap-3" aria-label="MedSkills Catalyst home">
            <Image src="/brand/logo/MedSkills-Catalyst_Logo-01.svg" alt="" width={36} height={36} priority className="h-9 w-9" />
            <span className="leading-none">
              <span className="block font-display text-[1.05rem] font-bold text-brand-navy">MedSkills Catalyst</span>
              <span className="mt-1 block text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-muted">
                Upskill to Upscale
              </span>
            </span>
          </a>
          <RegisterCta
            location="header"
            className="hidden h-10 items-center rounded-pill bg-brand-blue px-5 text-sm font-bold text-white shadow-msc-glow transition hover:bg-emerald-dark sm:inline-flex"
          >
            Register for the Masterclass
          </RegisterCta>
        </div>
      </header>

      <main>
        {/* ── Hero + form ── */}
        <section className="relative overflow-hidden border-b border-brand-navy/5">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 [background:radial-gradient(60%_60%_at_15%_0%,rgba(0,88,158,0.10),transparent_70%),radial-gradient(40%_50%_at_95%_20%,rgba(74,208,255,0.10),transparent_70%)]"
          />
          <div className="relative mx-auto grid max-w-6xl gap-8 px-5 pb-14 pt-8 sm:pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:pb-20 lg:pt-16">
            <div className="lg:pt-6">
              <p className="inline-flex items-center gap-2 rounded-full bg-brand-blue/10 px-3.5 py-1 text-xs font-bold uppercase tracking-[0.1em] text-brand-blue">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-blue" aria-hidden />
                Live Masterclass · {MASTERCLASS_EVENT.dateLabel}
              </p>
              <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-brand-navy/60">
                MedSkills Catalyst presents
              </p>
              <p className="mt-1 font-display text-3xl font-bold uppercase tracking-tight text-brand-blue sm:text-4xl">
                Do you know?
              </p>
              <div aria-hidden className="mt-4 h-px max-w-xl bg-brand-navy/15" />
              <h1 className="mt-4 font-display text-[1.95rem] font-bold leading-[1.1] tracking-tight text-brand-navy sm:text-[2.6rem] lg:text-[3rem]">
                You could be sitting on a goldmine of opportunities in <span className="text-brand-blue">MedTech!</span>
              </h1>
              <p className="mt-4 max-w-xl text-base font-semibold leading-relaxed text-ink sm:text-lg">
                Discover the career possibilities beyond Pharma.
              </p>
              <p className="mt-2 max-w-xl text-[0.95rem] leading-relaxed text-muted">
                <span className="font-semibold text-brand-navy">{MASTERCLASS_EVENT.sessionTitle}</span> — a live
                masterclass for life-science, biotech and pharmacy students, graduates and professionals.
              </p>
              <p className="mt-3 text-sm font-bold tracking-wide text-brand-blue/90">
                Your Potential. Your Skills. Your MedTech Journey.
              </p>

              <dl className="mt-6 grid max-w-xl grid-cols-3 gap-2 sm:mt-7 sm:gap-3">
                {[
                  { icon: Icon.calendar(), label: "Date", value: "Sat, 24 Oct 2026" },
                  { icon: Icon.clock(), label: "Time", value: time ? time.replace(" IST", "") + " IST" : "Announced soon" },
                  { icon: Icon.video(), label: "Where", value: "Live on Zoom" },
                ].map((f) => (
                  <div key={f.label} className="flex items-center gap-3 rounded-msc-md border border-brand-navy/[0.07] bg-surface/80 px-2.5 py-2.5 shadow-msc-sm sm:px-3 sm:py-3">
                    <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-msc bg-brand-pale text-brand-blue sm:flex">
                      {f.icon}
                    </span>
                    <div className="min-w-0">
                      <dt className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted">{f.label}</dt>
                      <dd className="text-sm font-bold leading-snug text-brand-navy">{f.value}</dd>
                    </div>
                  </div>
                ))}
              </dl>

              {lead && (
                <div className="mt-7 hidden items-center gap-4 lg:flex">
                  <div className="flex -space-x-3">
                    {mentors.slice(0, 4).map((m) =>
                      m.photo ? (
                        <Photo
                          key={m.name}
                          src={m.photo}
                          alt=""
                          size={44}
                          eager
                          className="h-11 w-11 rounded-full border-2 border-surface object-cover object-top"
                        />
                      ) : (
                        <span key={m.name} className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-surface bg-brand-navy text-xs font-bold text-white">
                          {initials(m.name)}
                        </span>
                      ),
                    )}
                  </div>
                  <p className="text-sm leading-snug text-muted">
                    <span className="font-semibold text-brand-navy">Mentor-led by MedSkills Catalyst faculty</span>
                    <br />
                    with experience at Pfizer, BMS, Medtronic, Stryker and more
                  </p>
                </div>
              )}
            </div>

            {/* Registration card — first thing after the headline on phones. */}
            <div id="register" className="scroll-mt-20">
              <div className="rounded-msc-lg border border-brand-navy/[0.08] bg-surface p-5 shadow-msc-float sm:p-7">
                <div className="mb-5">
                  <h2 className="font-display text-2xl font-bold text-brand-navy">Register for the Masterclass</h2>
                  <p className="mt-1.5 text-sm text-muted">
                    {MASTERCLASS_EVENT.dayDateLabel} · Joining link sent to your email
                  </p>
                </div>
                <RegistrationForm registrationOpen={open} pricing={pricing} closed={pricingNow.phase === "closed"} />
              </div>
            </div>
          </div>
        </section>

        {/* ── Why attend (value) ── */}
        <section aria-labelledby="why-attend" className="border-b border-brand-navy/5 bg-surface">
          <h2 id="why-attend" className="sr-only">
            Why attend
          </h2>
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-px bg-brand-navy/[0.06] sm:grid-cols-2 lg:grid-cols-4">
            {WHY_ATTEND.map((w) => (
              <div key={w.title} className="flex gap-3 bg-surface px-5 py-6">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-blue text-white">
                  {Icon.check("h-3.5 w-3.5")}
                </span>
                <div>
                  <p className="font-bold text-brand-navy">{w.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{w.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── What you'll learn ── */}
        <section className="border-b border-brand-navy/5 px-5 py-16 md:py-24">
          <div className="mx-auto max-w-5xl">
            <SectionHeading
              eyebrow="Do you know?"
              title="Six questions this masterclass answers"
              intro="Grounded in the industry knowledge our programmes are built on — shaped with MedTech leaders around what they wish new hires already knew."
            />
            <ol className="mt-12 grid gap-4 md:grid-cols-2">
              {LEARN.map((l, i) => (
                <li
                  key={l.title}
                  className="flex gap-4 rounded-msc-lg border border-brand-navy/[0.07] bg-surface p-6 shadow-msc-sm"
                >
                  <span className="font-display text-2xl font-bold leading-none text-brand-blue/80" aria-hidden>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-bold text-brand-navy">{l.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{l.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Who is it for ── */}
        <section className="border-b border-brand-navy/5 bg-surface px-5 py-16 md:py-24">
          <div className="mx-auto max-w-5xl">
            <SectionHeading
              eyebrow="Who it's for"
              title="Built for students who want more options"
              intro="Whether you're in your first year or have just graduated, you'll leave with a clearer picture of where your degree can take you."
            />
            <div className="mt-12 grid gap-5 sm:grid-cols-2">
              {AUDIENCE.map((a) => (
                <div key={a.title} className="rounded-msc-lg border border-brand-navy/[0.07] border-t-4 border-t-brand-blue bg-canvas p-6">
                  <h3 className="font-display text-lg font-bold text-brand-navy">{a.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Why MedSkills Catalyst ── */}
        <section className="border-b border-brand-navy/5 px-5 py-16 md:py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-blue">Why MedSkills Catalyst</p>
              <h2 className="mt-3 font-display text-3xl font-bold leading-[1.15] tracking-tight text-brand-navy sm:text-4xl">
                Mentored by MedTech leaders, not just lecturers
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted">
                MedSkills Catalyst was built to give life-science graduates the map into MedTech that most never get —
                how the device world really works, and how to break into it.
              </p>
              <ul className="mt-7 space-y-4">
                {[
                  ["Industry practitioners", "Our faculty have spent decades building, selling and hiring at companies including Pfizer, BMS, Medtronic, Stryker, Boston Scientific, 3M, BD and Abbott."],
                  ["Shaped with industry", "Our curriculum was developed with MedTech leaders around the skills they expect from new hires."],
                  ["Practical and career-first", "Live, mentor-led sessions and real-world case studies — focused on the skills that get you interview-ready."],
                ].map(([t, b]) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-pale text-brand-blue">
                      {Icon.check("h-3.5 w-3.5")}
                    </span>
                    <p className="text-sm leading-relaxed text-muted">
                      <span className="font-bold text-brand-navy">{t}.</span> {b}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-xs text-muted">
                Company names describe our faculty&rsquo;s past experience. They are not partnerships or placement
                guarantees.
              </p>
            </div>
            {lead?.photo && (
              <figure className="mx-auto w-full max-w-sm">
                <div className="relative rotate-[1.25deg] rounded-[28px] border border-brand-navy/10 bg-white p-1.5 shadow-[0_30px_70px_rgba(4,16,26,0.18)]">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-[22px]">
                    {lead.photo.startsWith("/") ? (
                      <Image
                        src={lead.photo}
                        alt={`${lead.name}, ${lead.role}, MedSkills Catalyst`}
                        fill
                        sizes="(min-width: 1024px) 384px, 90vw"
                        className="object-cover object-[center_15%]"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={lead.photo}
                        alt={`${lead.name}, ${lead.role}, MedSkills Catalyst`}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover object-[center_15%]"
                      />
                    )}
                    <figcaption className="absolute inset-0 flex flex-col justify-end p-6 [background:linear-gradient(to_top,rgba(6,14,18,0.85)_0%,rgba(6,14,18,0.3)_40%,transparent_100%)]">
                      <span className="font-display text-xl font-bold text-white">{lead.name}</span>
                      <span className="mt-1 text-[0.72rem] font-bold uppercase tracking-[0.06em] text-brand-cyan">{lead.role}</span>
                      <span className="mt-1 text-sm font-semibold text-white">MedSkills Catalyst</span>
                    </figcaption>
                  </div>
                </div>
              </figure>
            )}
          </div>
        </section>

        {/* ── Mentors ── */}
        <section className="border-b border-brand-navy/5 bg-surface px-5 py-16 md:py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHeading
              eyebrow="The faculty"
              title="Learn from people who have done the work"
              intro="The mentors behind MedSkills Catalyst bring decades of experience across MedTech, pharma, coaching and corporate learning."
            />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {mentors.map((m) => (
                <article key={m.name} className="flex flex-col rounded-msc-lg border border-brand-navy/[0.07] bg-canvas p-5">
                  <div className="flex items-center gap-3">
                    {m.photo ? (
                      <Photo src={m.photo} alt="" size={56} className="h-14 w-14 rounded-full object-cover object-top" />
                    ) : (
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-navy text-sm font-bold text-white">
                        {initials(m.name)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-bold leading-tight text-brand-navy">{m.name}</h3>
                      <p className="mt-0.5 text-xs font-semibold text-brand-blue">{m.role}</p>
                    </div>
                  </div>
                  {m.bio && <p className="mt-4 text-sm leading-relaxed text-muted">{m.bio}</p>}
                  {m.tags.length > 0 && (
                    <ul className="mt-4 flex flex-wrap gap-1.5">
                      {m.tags.map((t) => (
                        <li key={t} className="rounded-full border border-brand-navy/10 bg-surface px-2.5 py-1 text-[0.68rem] font-semibold text-brand-navy">
                          {t}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Stories ── */}
        <section className="border-b border-brand-navy/5 px-5 py-16 md:py-24">
          <div className="mx-auto max-w-5xl">
            <SectionHeading
              eyebrow="Real career stories"
              title="People who made the move into MedTech"
              intro="In their own words, from the MedSkills Catalyst community."
            />
            <div className={`mt-12 grid gap-5 ${storyCards.length > 2 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
              {storyCards.map((s) => (
                <figure key={s.name} className="flex flex-col rounded-msc-lg border border-brand-navy/[0.07] bg-surface p-6 shadow-msc-sm">
                  <blockquote className="flex-1 text-[0.95rem] leading-relaxed text-ink">&ldquo;{s.quote}&rdquo;</blockquote>
                  <figcaption className="mt-6 flex items-center gap-3 border-t border-brand-navy/[0.07] pt-5">
                    {s.photo ? (
                      <Photo src={s.photo} alt="" size={48} className="h-12 w-12 rounded-full object-cover object-top" />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-navy text-xs font-bold text-white">
                        {initials(s.name)}
                      </span>
                    )}
                    <span>
                      <span className="block font-bold text-brand-navy">{s.name}</span>
                      {s.transition && <span className="block text-xs font-semibold text-brand-blue">{s.transition}</span>}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className="mt-6 text-center text-xs text-muted">
              Individual experiences, not typical or guaranteed outcomes. Hiring depends on many factors.
            </p>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="border-b border-brand-navy/5 bg-surface px-5 py-16 md:py-24">
          <div className="mx-auto max-w-3xl">
            <SectionHeading eyebrow="Questions" title="Before you register" />
            <div className="mt-10 divide-y divide-brand-navy/10 rounded-msc-lg border border-brand-navy/[0.07] bg-canvas px-5">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-1">
                  <summary className="flex cursor-pointer select-none items-center justify-between gap-4 py-4 text-left text-[0.95rem] font-semibold text-brand-navy marker:content-none [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span
                      aria-hidden
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-pale text-brand-blue transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <div className="pb-4 pr-8 text-sm leading-relaxed text-muted">{f.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="relative overflow-hidden bg-brand-navy px-5 py-16 text-center md:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 [background:radial-gradient(50%_70%_at_50%_0%,rgba(74,208,255,0.16),transparent_70%)]"
          />
          <div className="relative mx-auto max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-cyan">
              {MASTERCLASS_EVENT.dayDateLabel} · Live on Zoom
            </p>
            <h2 className="mt-4 font-display text-3xl font-bold leading-[1.15] text-white sm:text-4xl">
              Find out where your degree can take you.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/75">
              Register in under a minute. Your Zoom joining link arrives by email.
            </p>
            <RegisterCta
              location="final_cta"
              className="mt-8 inline-flex h-14 items-center justify-center gap-2 rounded-pill bg-white px-8 text-base font-bold text-brand-navy shadow-msc-lg transition hover:bg-brand-pale"
            >
              Register for the Masterclass <span aria-hidden>→</span>
            </RegisterCta>
          </div>
        </section>
      </main>

      <footer className="bg-[#071F33] px-5 pb-28 pt-8 text-center text-xs text-white/60 lg:pb-8">
        <p>© 2026 MedSkills Catalyst Pvt. Ltd. · Gurgaon, India</p>
        <p className="mt-2 space-x-3">
          <a href={PRIVACY_POLICY_PATH} className="hover:text-white">Privacy Policy</a>
          <span aria-hidden>·</span>
          <a href="/terms-of-use" className="hover:text-white">Terms of Use</a>
          <span aria-hidden>·</span>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-white">Contact</a>
        </p>
      </footer>

      <StickyRegisterBar dateLabel="Sat, 24 Oct" />
    </div>
  );
}
