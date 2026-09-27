"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Accordion, AccordionItem } from "@/src/components/ui/accordion";
import { SiteHeader } from "@/src/components/site-header";

const PAYMENT_URL = "https://rzp.io/rzp/sD5lWTEc";

/* ── Thin-stroke icons (inherit currentColor → stay on-palette) ───────── */
type IconProps = { className?: string };
const svgBase = "none";
function IconCheck({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={svgBase} className={className} aria-hidden>
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconLock({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={svgBase} className={className} aria-hidden>
      <rect x="4" y="10" width="16" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconReceipt({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={svgBase} className={className} aria-hidden>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconSeat({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={svgBase} className={className} aria-hidden>
      <path d="M7 10V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="5" y="10" width="14" height="5" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 15v3M17 15v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconShield({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={svgBase} className={className} aria-hidden>
      <path d="M12 3 5 6v6c0 4 3 6.5 7 9 4-2.5 7-5 7-9V6l-7-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconCalendar({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill={svgBase} className={className} aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/* Live HTML certificate embed — renders the real certificate template
   (public/certificate/foundation.html, native 1123×842) scaled to fit its
   container. scale() needs a unitless number, so container-query units can't
   drive it — a ResizeObserver sets the scale on resize. */
function CertificateEmbed() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const frame = frameRef.current;
    if (!wrap || !frame) return;
    const NATIVE_WIDTH = 1123;
    const fit = () => {
      frame.style.transform = `scale(${wrap.clientWidth / NATIVE_WIDTH})`;
    };
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    fit();
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden rounded-msc-lg border border-brand-navy/[0.08] bg-white shadow-[0_16px_50px_rgba(12,35,57,0.15)]"
      style={{ aspectRatio: "1123 / 842" }}
    >
      <iframe
        ref={frameRef}
        src="/certificate/foundation.html"
        title="Sample MedSkills Catalyst Certificate — Foundation Module"
        loading="lazy"
        scrolling="no"
        className="absolute left-0 top-0 border-0"
        style={{ width: "1123px", height: "842px", transformOrigin: "top left", pointerEvents: "none" }}
      />
    </div>
  );
}

export function FoundationLandingClient({ data }: { data: any }) {
  return (
    <div className="min-h-screen bg-[#F6F8FA] font-body text-ink antialiased relative">
      {/* Canvas grid texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.03] [background-image:linear-gradient(to_right,#000_1px,transparent_1px),linear-gradient(to_bottom,#000_1px,transparent_1px)] [background-size:40px_40px]"
      />

      <SiteHeader />

      {/* ── Urgent Top Notification Banner ── */}
      <div className="bg-brand-blue/10 border-b border-brand-blue/10 text-center py-2.5 px-4 text-xs font-semibold text-brand-navy relative z-20">
        ⚡ Orientation starting 14 November 2026. Only a few seats remaining for the upcoming cohort.
      </div>

      {/* ── 1. Hero Section ── */}
      <section className="relative z-10 px-5 pt-12 pb-16 md:pt-24 md:pb-24 border-b border-brand-navy/5">
        <div className="mx-auto max-w-4xl text-center space-y-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-blue/10 px-3.5 py-1 text-xs font-semibold tracking-wider text-brand-blue uppercase">
            🎓 Foundation Module
          </div>
          
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-brand-navy sm:text-6xl leading-[1.1] max-w-3xl mx-auto">
            Break Into The <span className="text-brand-blue">MedTech Industry</span>
          </h1>

          <p className="text-lg leading-relaxed text-muted max-w-2xl mx-auto">
            The essential playbook for life-science graduates to break into the MedTech industry. Master the device ecosystem, domestic manufacturing tracks, and MedTech recruitment frameworks.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <a
              href={PAYMENT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center rounded-pill bg-brand-blue px-8 text-base font-semibold text-white shadow-msc-glow transition hover:opacity-95"
            >
              Book Now — ₹4,999 securely →
            </a>
            <a
              href="#curriculum"
              className="inline-flex h-12 items-center justify-center rounded-pill border border-brand-navy/20 px-8 text-base font-semibold text-brand-navy hover:bg-brand-navy/5 transition"
            >
              Explore Curriculum
            </a>
          </div>

          {/* Stat bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-12 max-w-3xl mx-auto text-left border-t border-brand-navy/10 mt-12">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-msc bg-brand-pale text-brand-blue">
                <IconCalendar className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs text-muted block">Next Batch Starts</span>
                <span className="font-display font-bold text-brand-navy text-sm">{data.batch.startDate}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-msc bg-brand-pale text-brand-blue">
                <IconSeat className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs text-muted block">Cohort Limit</span>
                <span className="font-display font-bold text-brand-navy text-sm">Limited Seats Available</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-msc bg-brand-pale text-brand-blue">
                <IconShield className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs text-muted block">Program Level</span>
                <span className="font-display font-bold text-brand-navy text-sm">Foundation Module</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 1.5 Program Director Welcome (Gagan Victor) ── */}
      <section className="px-5 py-16 md:py-24 relative z-10 border-b border-brand-navy/5">
        <div className="mx-auto max-w-5xl grid md:grid-cols-2 gap-10 md:gap-14 items-center">
          {/* Welcome copy */}
          <div className="space-y-5 order-2 md:order-1">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-blue">Meet Your Program Director</span>
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-brand-navy sm:text-4xl leading-[1.15]">
              Learn from someone who has built, sold, and hired across MedTech
            </h2>
            <p className="text-base leading-relaxed text-muted">
              After years leading commercial teams at Pfizer, BMS, Medtronic and Stryker, Gagan Victor built MedSkills Catalyst to hand life-science graduates the map he wishes he had — how the device world really works, and how to break into it.
            </p>
            <p className="text-base leading-relaxed text-muted">
              The Foundation Module is where that journey starts: no jargon, no fluff — just the groundwork you need before you ever walk into an interview.
            </p>
          </div>

          {/* Media card — mirrors the main site's Gagan media hero */}
          <div className="order-1 md:order-2">
            <div className="relative mx-auto w-full max-w-sm rounded-[28px] border border-brand-navy/10 bg-white p-1.5 shadow-[0_30px_70px_rgba(4,16,26,0.18)] rotate-[1.25deg] transition-transform duration-500 hover:rotate-0">
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[22px]">
                <img
                  src="/assets/gagan_victor.jpg"
                  alt="Gagan Victor — Co-Founder & Program Director, MedSkills Catalyst"
                  loading="lazy"
                  className="h-full w-full object-cover object-[center_15%]"
                />
                <div className="absolute inset-0 flex flex-col justify-end p-6 text-left [background:linear-gradient(to_top,rgba(6,14,18,0.85)_0%,rgba(6,14,18,0.3)_40%,transparent_100%)]">
                  <p className="font-display text-xl font-extrabold text-white">Gagan Victor</p>
                  <p className="mt-1 text-[0.72rem] font-bold uppercase tracking-[0.06em] text-[#4AD0FF]">Co-Founder &amp; Program Director</p>
                  <p className="mt-1 text-sm font-semibold text-white">MedSkills Catalyst</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Who Should Enroll ── */}
      <section className="px-5 py-16 md:py-24 relative z-10 border-b border-brand-navy/5">
        <div className="mx-auto max-w-5xl space-y-12">
          <div className="text-center space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-blue">Who It&rsquo;s For</span>
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-brand-navy sm:text-4xl">
              Who Should Attend the Foundation Module
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: "Science & Pharma Graduates",
                body: "B.Sc, B.Pharm, Biotech, and Biomedical graduates looking to transition away from low-paying lab/research roles into corporate business tracks.",
              },
              {
                title: "Aspiring Medical Sales Reps",
                body: "Professionals currently working in general sales, insurance, or pharmaceuticals who want to break into the high-margin medical devices industry.",
              },
              {
                title: "Healthcare Practitioners",
                body: "Nurses, clinical support assistants, and technical hospital staff aiming to leverage their clinical familiarity for corporate MedTech roles.",
              },
            ].map((a, idx) => (
              <div key={idx} className="rounded-msc-lg border border-brand-navy/[0.06] bg-surface p-6 shadow-msc-sm border-t-4 border-t-brand-blue">
                <div className="font-display text-lg font-bold text-brand-navy mb-2">{a.title}</div>
                <p className="text-sm leading-relaxed text-muted">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. Curriculum Section ── */}
      <section id="curriculum" className="px-5 py-16 md:py-24 relative z-10 border-b border-brand-navy/5">
        <div className="mx-auto max-w-4xl space-y-10">
          <div className="text-center space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-blue">The Curriculum</span>
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-brand-navy sm:text-4xl">
              Designed by the people who matter in the MedTech industry
            </h2>
            <p className="text-base leading-relaxed text-muted max-w-2xl mx-auto pt-1">
              Every module of the Foundation was shaped in direct collaboration with MedTech leaders who told us exactly what they wish new hires already knew.
            </p>
          </div>

          {/* Website-style featured curriculum card — Foundation module only */}
          <div className="grid grid-cols-1 sm:grid-cols-[96px_1fr] rounded-[22px] border border-[#90A4B8] bg-white p-6 sm:p-8 shadow-[0_2px_8px_rgba(12,35,57,0.04)]">
            {/* Sidebar */}
            <div className="flex flex-row sm:flex-col items-center gap-3 sm:gap-2 sm:pr-5 mb-5 sm:mb-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-navy text-[1.05rem] font-extrabold text-white shadow-[0_4px_12px_rgba(10,42,67,0.2)]">
                1
              </div>
              <div className="flex shrink-0 items-center justify-center text-brand-navy opacity-30">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]" aria-hidden>
                  <path d="M4.5 16.5c-1.5 1.5-2 5-2 5s3.5-.5 5-2L4.5 16.5z" />
                  <path d="M13 6L7 12l5 5 6-6c2-2 3-5 3-8-3 0-6 1-8 3z" />
                  <circle cx="15" cy="9" r="1" />
                </svg>
              </div>
              <span className="text-[0.55rem] font-extrabold uppercase tracking-[0.1em] text-brand-navy/40 text-center leading-tight">
                Start Here
              </span>
            </div>

            {/* Body */}
            <div className="min-w-0">
              <div className="grid grid-cols-1 md:grid-cols-[1.15fr_1fr] gap-6 md:gap-10 md:items-center">
                {/* Left */}
                <div>
                  <div className="text-[0.64rem] font-extrabold uppercase tracking-[0.12em] text-brand-blue mb-2">
                    Foundation Module
                  </div>
                  <h3 className="text-2xl font-extrabold tracking-tight text-brand-navy leading-[1.15] mb-3">
                    Foundation to Break into the MedTech Industry
                  </h3>
                  <p className="text-sm font-medium leading-[1.55] text-brand-navy/[0.65]">
                    Move from pill volume to the device world — understand what you&rsquo;ll actually be selling and where it comes from.
                  </p>
                </div>
                {/* Right — badge chips */}
                <div className="flex flex-col gap-2.5">
                  {["Class A–D Devices", "Make in India / PLI", "Full Spectrum of Medical Devices"].map((b, i) => (
                    <div key={i} className="flex items-center gap-2.5 rounded-[30px] border-[1.4px] border-brand-navy/[0.18] px-4 py-2.5 text-[0.68rem] font-bold uppercase tracking-[0.04em] text-brand-navy">
                      <span className="h-[11px] w-[11px] shrink-0 rounded-full border-[1.5px] border-brand-navy/30" />
                      {b}
                    </div>
                  ))}
                </div>
              </div>

              {/* What you'll cover — module topics */}
              <div className="mt-6 pt-6 border-t border-brand-navy/10">
                <div className="text-[0.64rem] font-extrabold uppercase tracking-[0.12em] text-brand-navy/40 mb-3">
                  What you&rsquo;ll cover
                </div>
                <ul className="space-y-2.5">
                  {[
                    "The full device map: diagnostic, therapeutic, surgical, implantable, monitoring — and how Class A–D risk levels work",
                    "Devices across specialties: cardiology, ortho, neuro, radiology, critical care",
                    "Who makes what in India — manufacturers, MedTech parks, PLI schemes, and why it matters to your career",
                    "The import ecosystem: global MNCs, distributors, and where the high-value roles sit",
                  ].map((t, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed text-brand-navy/[0.72]">
                      <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3.5 What You Get ── */}
      <section className="px-5 py-16 md:py-24 bg-white/50 relative z-10 border-b border-brand-navy/5">
        <div className="mx-auto max-w-5xl space-y-12">
          <div className="text-center space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-blue">Program Benefits</span>
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-brand-navy sm:text-4xl">
              What You Get Upon Registration
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-4 sm:grid-cols-2">
            {[
              {
                title: "Interactive Live Training",
                desc: "Live orientation, pre-work reviews, and interactive weekend sessions directly mentored by corporate leadership.",
              },
              {
                title: "Baseline Skill Audit",
                desc: "Pre-program assessment to benchmark your clinical vocabulary, sales acumen, and target growth tracks.",
              },
              {
                title: "Actionable Mentorship",
                desc: "Real-world reflection assignments evaluated with 1-on-1 feedback from former MNC division managers.",
              },
              {
                title: "Verified Credentials",
                desc: "A shareable, verified MedSkills Catalyst Certificate of Competency to showcase on LinkedIn & resume.",
              },
            ].map((item, idx) => (
              <div key={idx} className="rounded-msc-lg border border-brand-navy/[0.06] bg-surface p-5 shadow-msc-sm flex flex-col justify-between">
                <div>
                  <div className="mb-3 text-brand-blue">
                    <IconCheck className="h-6 w-6" />
                  </div>
                  <div className="font-display font-bold text-brand-navy text-base mb-1">{item.title}</div>
                  <p className="text-xs leading-relaxed text-muted">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3.6 The Certificate You'll Earn ── */}
      <section className="px-5 py-16 md:py-24 relative z-10 border-b border-brand-navy/5">
        <div className="mx-auto max-w-6xl space-y-12">
          <div className="text-center space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-blue">Your Credential</span>
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-brand-navy sm:text-4xl">
              The certificate you&rsquo;ll earn
            </h2>
            <p className="text-base leading-relaxed text-muted max-w-2xl mx-auto pt-1">
              On completing the Foundation, every participant receives a MedSkills Catalyst Certificate of Completion &mdash; verifiable, uniquely numbered, and ready to share on LinkedIn and your resume.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-10 lg:gap-14 items-center">
            {/* Certificate — live HTML template embed */}
            <div className="relative">
              <CertificateEmbed />
              <span className="absolute top-3 left-3 z-10 rounded-full bg-brand-navy/85 px-3 py-1 text-[0.6rem] font-bold uppercase tracking-wider text-white backdrop-blur">
                Sample
              </span>
            </div>

            {/* Feature list */}
            <div className="space-y-5">
              {[
                {
                  title: "Independently verifiable",
                  desc: "A QR code and unique credential ID let anyone confirm authenticity at medskillscatalyst.com/verify.",
                },
                {
                  title: "Uniquely numbered",
                  desc: "Every certificate carries its own credential ID, tied to your name and the exact course you completed.",
                },
                {
                  title: "Built to share",
                  desc: "Add it to your LinkedIn profile and resume, or download a print-ready PDF in seconds.",
                },
                {
                  title: "Signed by the program director",
                  desc: "Issued and signed by Gagan Victor, Academic Director, on behalf of MedSkills Catalyst.",
                },
              ].map((f, i) => (
                <div key={i} className="flex gap-4">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue">
                    <IconShield className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-display font-bold text-brand-navy text-base leading-tight mb-1">{f.title}</div>
                    <p className="text-sm leading-relaxed text-muted">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. Mentors Section ── */}
      <section className="px-5 py-16 md:py-24 bg-white/50 relative z-10 border-b border-brand-navy/5">
        <div className="mx-auto max-w-5xl space-y-12">
          <div className="text-center space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-blue">The Faculty</span>
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-brand-navy sm:text-4xl">
              Mentored by MedTech Leaders
            </h2>
            <p className="text-base leading-relaxed text-muted max-w-2xl mx-auto pt-1">
              No academics. Just leaders who have spent decades building, selling, and hiring at the world&rsquo;s top medical device companies.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 max-w-6xl mx-auto">
            {[
              {
                name: "Gagan Victor",
                role: "Co-Founder & Program Director",
                photo: "/assets/gagan_victor.jpg",
                bio: "Former leader at Pfizer, BMS, Medtronic India and Stryker, overseeing Cardiovascular and Surgical device portfolios. Transitioned from Medical Rep to Corporate MedTech Leader to full-time training, coaching, and mentoring to build India's next generation of MedTech-ready professionals.",
                tags: ["Ex-Pfizer, BMS, Medtronic & Stryker", "Career Coach", "Podcaster"],
              },
              {
                name: "Shilpi Babbar",
                role: "Co-Founder & Skills Enhancement Coach",
                photo: "/assets/shilpi_babbar.jpg",
                bio: "Co-founder and Skills Enhancement Coach at MedSkills Catalyst, with more than a decade of experience in coaching and career counselling, certified by ICBI-NABET. Shilpi specialises in stress management, emotional intelligence, and the interpersonal skills required to thrive in high-pressure MedTech corporate environments.",
                tags: ["ICBI-NABET Certified", "Skills Enhancement Coach", "11+ Years Experience"],
              },
              {
                name: "Dr. Vincent Keny, PhD",
                role: "Executive Coach & Leadership Mentor",
                photo: "/assets/vincent_keny.png",
                bio: "With over 25 years of global corporate leadership experience, Dr. Keny brings executive-grade coaching to MedSkills. An ICF Certified Coach and MIT Sloan alumnus, he works with candidates on behavioral orientation, executive communication, and the interpersonal dynamics that determine performance in high-stakes MedTech environments.",
                tags: ["Ex-Boston Scientific", "ICF Certified Coach", "MIT Sloan Alumnus"],
              },
              {
                name: "Tabish",
                role: "L&D Specialist & Corporate Mentor",
                photo: "/assets/tabish.jpg",
                bio: "With 20+ years of experience in healthcare and MedTech, including roles at 3M, Becton Dickinson, and Abbott Vascular, and learning partnerships with global brands such as Cipla, Amazon, and PwC, Tabish combines deep industry expertise with her L&D qualifications to design learning programs that help learners build the behavioural competencies essential for successful MedTech careers.",
                tags: ["Ex-3M, BD & Abbott Vascular", "L&D Specialist", "20+ Years Experience"],
              },
            ].map((m, idx) => (
              <div key={idx} className="group rounded-msc-lg border border-brand-navy/[0.06] bg-surface p-6 shadow-msc-sm flex flex-col h-full">
                <div className="flex items-center gap-4 mb-4">
                  <img
                    src={m.photo}
                    alt={m.name}
                    loading="lazy"
                    className="h-16 w-16 shrink-0 rounded-full object-cover object-center ring-2 ring-brand-blue/15"
                  />
                  <div>
                    <h3 className="font-display text-lg font-bold text-brand-navy leading-tight">{m.name}</h3>
                    <p className="text-[0.68rem] font-semibold text-brand-blue uppercase mt-1 tracking-wider leading-snug">{m.role}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {m.tags.map((t, i) => (
                    <span key={i} className="text-[10px] font-semibold bg-brand-blue/10 text-brand-blue px-2 py-0.5 rounded">
                      {t}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-muted leading-relaxed">{m.bio}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. Bottom Registration Callout ── */}
      <section id="book-now" className="px-5 py-16 md:py-24 relative z-10 bg-brand-navy text-white text-center">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue/20 text-brand-blue">
            <IconSeat className="h-7 w-7 text-white" />
          </div>
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
            Secure Your Seat Today
          </h2>
          <p className="text-lg leading-relaxed text-white/80 max-w-2xl mx-auto">
            Book the **MedTech Foundation Program** for a special campaign fee of **₹4,999** (Standard price: ~~₹29,999~~ · You save 83%). Secure your seat immediately through the official Razorpay payment page.
          </p>

          <div className="pt-4">
            <a
              href={PAYMENT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-14 items-center justify-center rounded-pill bg-white px-10 text-lg font-bold text-brand-navy shadow-msc-glow transition hover:bg-brand-pale"
            >
              Book Now — ₹4,999 securely →
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-6 text-xs text-white/60">
            <span className="inline-flex items-center gap-1.5">
              <IconShield className="h-4 w-4" /> Secured by Razorpay
            </span>
            <span className="inline-flex items-center gap-1.5">
              <IconReceipt className="h-4 w-4" /> Instant GST Invoice
            </span>
            <span className="inline-flex items-center gap-1.5">
              <IconLock className="h-4 w-4" /> 100% Secure Checkout
            </span>
          </div>
        </div>
      </section>

      {/* ── 6. FAQs Section ── */}
      <section className="px-5 py-16 md:py-24 relative z-10">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="text-center space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-blue">FAQ</span>
            <h2 className="font-display text-3xl font-extrabold tracking-tight text-brand-navy">
              Common Questions &amp; Concerns
            </h2>
          </div>

          <Card className="overflow-hidden border border-brand-navy/[0.05] shadow-msc-sm">
            <CardContent className="p-6 sm:p-8">
              <Accordion>
                <AccordionItem question="Who is this programme for?">
                  MedSkills Catalyst is built for life-science and healthcare graduates, and for working professionals who want to build a career in the MedTech industry. Whether you are just starting out or making a switch, the programme prepares you for a range of MedTech roles, not a single job title.
                </AccordionItem>
                <AccordionItem question="Do I need prior MedTech experience?">
                  No. Prior MedTech or industry experience is not required. Fresh graduates and working professionals are equally welcome. We look for curiosity, coachability, communication, and a genuine willingness to learn, and we prepare you for multiple MedTech career paths, not only sales.
                </AccordionItem>
                <AccordionItem question="What career paths can I pursue after the programme?">
                  MedTech offers far more than sales. The programme prepares you for roles across clinical, commercial, and technical functions, including Medical Sales, Clinical, Product and Application Specialist roles, Marketing, Customer Success, Product Management, Regulatory and Quality, Market Access, and Medical Affairs. Our goal is to make you industry-ready, not just sales-ready.
                </AccordionItem>
                <AccordionItem question="How is this different from an MBA or PGDM?">
                  An MBA gives you an academic foundation. We focus on bridging the gap between classroom learning and what the MedTech industry actually expects. You build commercial understanding, practical business and communication skills, interview and resume readiness, LinkedIn branding, real industry exposure, and a clear career strategy, so you leave career-ready, not just qualified.
                </AccordionItem>
                <AccordionItem question="Do I need to quit my current job to join?">
                  No. Sessions are scheduled for evenings and weekends, so the programme is designed to fit alongside a full-time job. Many of our learners continue working while they complete it.
                </AccordionItem>
                <AccordionItem question="How much time should I set aside each week?">
                  Plan for a few hours each week across live sessions, plus time for practical projects and self-paced practice. The exact commitment varies week to week, but the schedule is built to be realistic for both working professionals and students.
                </AccordionItem>
                <AccordionItem question="Is the programme live or recorded, and will I get mentorship?">
                  Sessions are conducted live so you can ask questions and learn interactively. You also receive direct mentorship from experienced MedTech professionals who guide you through projects, career decisions, and interview preparation.
                </AccordionItem>
                <AccordionItem question="Do I receive a certificate?">
                  Yes. On successful completion you receive a certificate from MedSkills Catalyst recognising the skills and projects you have completed during the programme.
                </AccordionItem>
                <AccordionItem question="How does the admission process work?">
                  Admissions begin with a short registration, followed by a counselling call to understand your background and goals and confirm the programme is a good fit. Once confirmed, you complete enrolment to secure your seat in the cohort.
                </AccordionItem>
                <AccordionItem question="Does MedSkills Catalyst guarantee a job?">
                  No. We do not guarantee jobs or placements, as hiring decisions are always made by employers. What we do is make you industry-ready through structured learning, mentorship, practical projects, career guidance, interview preparation, and application strategy. We are an enabler that strengthens your chances, not a placement agency.
                </AccordionItem>
                <AccordionItem question="Do you offer EMI options?">
                  EMI availability depends on your payment method and your bank. If you pay with a supported credit card, your bank may offer EMI, with the tenure, interest, and eligibility decided entirely by them. You can check the available options at checkout or with your bank.
                </AccordionItem>
                <AccordionItem question="When does the next cohort start, and how many seats are available?">
                  The next cohort begins on 14 November 2026. We keep each batch deliberately small to protect the quality of mentorship, so seats are limited and registration closes once they are filled.
                </AccordionItem>
                <AccordionItem question="What is your refund policy?">
                  Because you receive immediate access to our learning resources, mentorship, and community, programme fees are non-refundable. We encourage you to review the programme details and speak with our team on your counselling call so you can enrol with full confidence.
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── 7. Footer ── */}
      <footer className="border-t border-brand-navy/10 bg-surface relative z-10">
        <div className="mx-auto max-w-6xl px-5 py-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-3">
              <img
                src="/brand/logo/MedSkills-Catalyst_Logo-01.svg"
                alt="MedSkills Catalyst"
                className="h-9 w-auto"
              />
              <div>
                <p className="font-display text-base font-bold leading-none text-brand-navy">
                  MedSkills Catalyst
                </p>
                <p className="mt-1 text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-muted">
                  Upskill to Upscale
                </p>
              </div>
            </div>
            <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted">
              <a href="/about-us.html" className="hover:text-brand-blue">About Us</a>
              <a href="/contact-us.html" className="hover:text-brand-blue">Contact Us</a>
              <a href="/privacy-policy.html" className="hover:text-brand-blue">Privacy Policy</a>
              <a href="/terms-of-use.html" className="hover:text-brand-blue">Terms of Use</a>
              <a href="/refund-policy.html" className="hover:text-brand-blue">Refund Policy</a>
              <a href="/cancellation-policy.html" className="hover:text-brand-blue">Cancellation Policy</a>
              <a href="/shipping-delivery.html" className="hover:text-brand-blue">Shipping &amp; Delivery</a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
