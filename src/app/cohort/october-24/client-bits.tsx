"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { captureAttribution, campaignProps, fbTrack, trackMasterclass } from "@/src/modules/masterclass/analytics";
import { MASTERCLASS_EVENT } from "@/src/modules/masterclass/event";

/** Fires the landing-page view once per mount (not per re-render). */
export function LandingViewTracker() {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const a = captureAttribution();
    trackMasterclass("masterclass_page_view", campaignProps(a));
    fbTrack("ViewContent", { content_name: MASTERCLASS_EVENT.title });
  }, []);
  return null;
}

/**
 * In-page link to the registration form. Moves focus to the first field so
 * keyboard and screen-reader users land where the button promised.
 */
export function RegisterCta({
  location,
  className,
  children,
}: {
  location: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href="#register"
      className={className}
      onClick={(e) => {
        trackMasterclass("masterclass_cta_click", { location });
        const target = document.getElementById("register");
        if (!target) return;
        e.preventDefault();
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        window.setTimeout(() => document.getElementById("mc-name")?.focus({ preventScroll: true }), reduce ? 0 : 450);
        history.replaceState(null, "", "#register");
      }}
    >
      {children}
    </a>
  );
}

/**
 * Discreet bottom bar on phones and tablets, shown whenever the form is off
 * screen (small phones on load, everyone after scrolling past it) and hidden
 * while it is visible so it never covers the fields.
 */
export function StickyRegisterBar({ dateLabel }: { dateLabel: string }) {
  const [formVisible, setFormVisible] = useState(true);

  useEffect(() => {
    const form = document.getElementById("register");
    const io = form
      ? new IntersectionObserver(([entry]) => setFormVisible(entry.isIntersecting), { threshold: 0.05 })
      : null;
    if (form && io) io.observe(form);
    return () => io?.disconnect();
  }, []);

  const show = !formVisible;

  return (
    <div
      // inert removes the hidden bar from the tab order and the accessibility tree.
      inert={!show}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-brand-navy/10 bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_rgba(10,42,67,0.12)] backdrop-blur transition-transform duration-300 lg:hidden ${
        show ? "translate-y-0" : "pointer-events-none translate-y-full"
      }`}
    >
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-brand-blue">Live Masterclass</p>
          <p className="truncate text-sm font-bold text-brand-navy">{dateLabel} · Zoom</p>
        </div>
        <RegisterCta
          location="sticky_mobile"
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-pill bg-brand-blue px-5 text-sm font-bold text-white shadow-msc-glow"
        >
          Register
        </RegisterCta>
      </div>
    </div>
  );
}
