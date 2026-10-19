"use client";

import { useEffect, useRef } from "react";
import { trackMasterclass } from "@/src/modules/masterclass/analytics";

/**
 * Thank-you page view. Deliberately NOT a conversion event: the conversion is
 * recorded once by the form on a successful submit, so refreshing or
 * revisiting this page can never double-count a registration.
 */
export function ThankYouViewTracker({ confirmed, returning }: { confirmed: boolean; returning: boolean }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackMasterclass("masterclass_thank_you_view", { confirmed, returning });
  }, [confirmed, returning]);
  return null;
}
