"use client";

import { useEffect, useRef, useState } from "react";
import { trackMasterclass } from "@/src/modules/masterclass/analytics";

const REDIRECT_SECONDS = 5;

/**
 * WhatsApp community call-to-action with a gentle auto-redirect.
 *
 * - The button works immediately and is the primary path.
 * - The countdown only runs when a real invite URL is configured AND the
 *   registration was confirmed; it can be cancelled (WCAG 2.2.1), and it runs
 *   once per registration so the Back button never bounces the student out
 *   again.
 * - Navigation uses a top-level location change, which hands off to the
 *   WhatsApp app on phones that have it.
 */
export function WhatsappJoin({ url, autoRedirect, registrationId }: { url: string; autoRedirect: boolean; registrationId: string | null }) {
  const [seconds, setSeconds] = useState<number | null>(null);
  const cancelled = useRef(false);
  const storageKey = `msc_mc_wa_redirected_${registrationId ?? "anon"}`;

  useEffect(() => {
    if (!autoRedirect) return;
    try {
      if (sessionStorage.getItem(storageKey)) return;
    } catch {
      /* storage blocked — still redirect once for this page view */
    }
    setSeconds(REDIRECT_SECONDS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRedirect]);

  useEffect(() => {
    if (seconds === null || cancelled.current) return;
    if (seconds <= 0) {
      try {
        sessionStorage.setItem(storageKey, "1");
      } catch {
        /* ignore */
      }
      trackMasterclass("masterclass_whatsapp_click", { trigger: "auto_redirect" });
      window.location.href = url;
      return;
    }
    const t = window.setTimeout(() => setSeconds((s) => (s === null ? s : s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [seconds, url, storageKey]);

  function stop() {
    cancelled.current = true;
    setSeconds(null);
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <a
        href={url}
        // Same tab: phones hand off to the WhatsApp app instead of leaving a blank tab behind.
        rel="noopener noreferrer"
        onClick={() => {
          stop();
          trackMasterclass("masterclass_whatsapp_click", { trigger: "button" });
        }}
        className="inline-flex h-14 w-full max-w-sm items-center justify-center gap-2.5 rounded-pill bg-wa px-8 text-base font-bold text-white shadow-[0_8px_30px_rgba(18,140,126,0.3)] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-wa/30"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
          <path d="M12.001 2.001C6.478 2.001 2 6.477 2 12c0 1.936.549 3.744 1.501 5.278L2 22l4.835-1.469A9.96 9.96 0 0 0 12 22c5.523 0 10-4.477 10-10S17.524 2.001 12.001 2.001zm0 18a7.969 7.969 0 0 1-4.065-1.112l-.291-.173-3.012.915.915-2.936-.19-.303A7.97 7.97 0 0 1 4 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.588 8-7.999 8z" />
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
        </svg>
        Join WhatsApp Community
      </a>

      <p className="min-h-[1.5rem] text-sm text-muted" role="status" aria-live="polite">
        {seconds !== null && seconds > 0 && (
          <>
            Taking you to WhatsApp in {seconds}s…{" "}
            <button type="button" onClick={stop} className="font-semibold text-brand-blue underline underline-offset-2">
              Stay on this page
            </button>
          </>
        )}
        {seconds === 0 && "Opening WhatsApp…"}
      </p>
    </div>
  );
}
