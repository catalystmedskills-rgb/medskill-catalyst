"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { cn } from "@/src/lib/cn";
import {
  ACADEMIC_STATUS_OPTIONS,
  registrationFieldsSchema,
  type RegistrationFields,
} from "@/src/modules/masterclass/schema";
import { MASTERCLASS_EVENT, PRIVACY_POLICY_PATH } from "@/src/modules/masterclass/event";
import { PricingBanner, loadRazorpay, openCheckout, useOfferPhase, type PricingProps } from "./pricing";
import {
  captureAttribution,
  campaignProps,
  fbTrack,
  newEventId,
  trackMasterclass,
} from "@/src/modules/masterclass/analytics";
import type { Attribution } from "@/src/modules/masterclass/schema";
import { UniversityCombobox } from "./university-combobox";

type FormInput = z.input<typeof registrationFieldsSchema>;

const FIELD_ORDER = ["fullName", "email", "phone", "university", "academicStatus", "consent"] as const;

const inputClass = (invalid: boolean) =>
  cn(
    "flex h-12 w-full rounded-msc border bg-surface px-3.5 text-base text-ink placeholder:text-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
    invalid
      ? "border-danger focus-visible:border-danger focus-visible:ring-danger/20"
      : "border-brand-navy/15 focus-visible:border-brand-blue focus-visible:ring-brand-blue/20",
  );

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-xs font-medium text-danger">
      {message}
    </p>
  );
}

type RegisterResponse = {
  ok?: boolean;
  registrationId?: string | null;
  duplicate?: boolean;
  requiresPayment?: boolean;
  order?: { id: string; amount: number; currency: string; keyId: string };
  prefill?: { name: string; email: string; contact: string };
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
};

export function RegistrationForm({
  registrationOpen,
  pricing,
  closed = false,
}: {
  registrationOpen: boolean;
  pricing: PricingProps;
  /** The session has started; registration is over for good. */
  closed?: boolean;
}) {
  const router = useRouter();
  const offer = useOfferPhase(pricing);
  const { phase } = offer;
  const mountedAt = useRef(Date.now());
  const inFlight = useRef(false);
  const started = useRef(false);
  const attribution = useRef<Attribution>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [honeypot, setHoneypot] = useState("");

  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormInput, unknown, RegistrationFields>({
    resolver: zodResolver(registrationFieldsSchema),
    mode: "onTouched",
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      university: "",
      universitySource: "manual",
      academicStatus: "" as FormInput["academicStatus"],
      consent: false,
    },
  });

  useEffect(() => {
    attribution.current = captureAttribution();
  }, []);

  function markStarted() {
    if (started.current) return;
    started.current = true;
    trackMasterclass("masterclass_form_start", campaignProps(attribution.current));
  }

  async function onValid(values: RegistrationFields) {
    if (inFlight.current || !registrationOpen) return;
    inFlight.current = true;
    setSubmitting(true);
    setServerError(null);
    const fbEventId = newEventId();

    try {
      const res = await fetch("/api/masterclass/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          attribution: attribution.current,
          website: honeypot || undefined,
          elapsedMs: Date.now() - mountedAt.current,
          fbEventId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as RegisterResponse;

      if (res.ok && data.ok && data.requiresPayment && data.order && data.registrationId) {
        // The server decided this registration costs ₹999 (the free offer has
        // ended). Details are already saved; collect the payment.
        if (await payForRegistration(data.registrationId, data.order, data.prefill!, fbEventId)) return;
        inFlight.current = false;
        setSubmitting(false);
        return;
      }

      if (res.ok && data.ok) {
        if (!data.duplicate && data.registrationId) {
          // Fired here, once, rather than on the thank-you page — a refresh
          // there must never count a second registration.
          trackMasterclass("masterclass_registration_success", {
            academic_status: values.academicStatus,
            university_source: values.universitySource,
            ...campaignProps(attribution.current),
          });
          fbTrack("CompleteRegistration", { content_name: MASTERCLASS_EVENT.title }, fbEventId);
        }
        const q = new URLSearchParams();
        if (data.registrationId) q.set("r", data.registrationId);
        if (data.duplicate) q.set("existing", "1");
        router.push(`${MASTERCLASS_EVENT.thankYouPath}${q.size ? `?${q}` : ""}`);
        return; // keep the button disabled while navigating
      }

      if (res.status === 422 && data.fieldErrors) {
        let focused = false;
        for (const f of FIELD_ORDER) {
          const msg = data.fieldErrors[f]?.[0];
          if (msg) {
            setError(f, { type: "server", message: msg }, { shouldFocus: !focused });
            focused = true;
          }
        }
      }
      setServerError(data.error ?? "Something went wrong. Please try again.");
      trackMasterclass("masterclass_registration_error", { status: res.status });
    } catch {
      setServerError("We couldn't reach our server. Please check your connection and try again.");
      trackMasterclass("masterclass_registration_error", { status: "network" });
    }
    inFlight.current = false;
    setSubmitting(false);
  }

  /** Returns true when payment succeeded and the page is navigating away. */
  async function payForRegistration(
    registrationId: string,
    order: NonNullable<RegisterResponse["order"]>,
    prefill: NonNullable<RegisterResponse["prefill"]>,
    fbEventId: string,
  ): Promise<boolean> {
    trackMasterclass("masterclass_checkout_started", campaignProps(attribution.current));
    fbTrack("InitiateCheckout", { value: order.amount / 100, currency: "INR", content_name: MASTERCLASS_EVENT.title });
    try {
      await loadRazorpay();
    } catch {
      setServerError("Your details are saved, but the payment window couldn't load. Check your connection and press the button again.");
      return false;
    }
    const result = await openCheckout({ keyId: order.keyId, orderId: order.id, amount: order.amount, prefill });
    if (result.status !== "paid") {
      trackMasterclass("masterclass_payment_incomplete", { reason: result.status });
      setServerError(
        result.status === "failed"
          ? `Payment didn't go through (${result.reason}). Your details are saved — press the button to try again.`
          : "Payment not completed. Your details are saved — press the button whenever you're ready to pay.",
      );
      return false;
    }
    try {
      const res = await fetch("/api/masterclass/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, ...result.response, fbEventId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setServerError(
          `${data.error ?? "We couldn't confirm your payment."} If money was deducted, it's safe — write to info@medskillscatalyst.com with payment ID ${result.response.razorpay_payment_id}.`,
        );
        return false;
      }
    } catch {
      // The webhook still records the payment; send the student on with a note.
      router.push(`${MASTERCLASS_EVENT.thankYouPath}?r=${registrationId}&paid=1`);
      return true;
    }
    trackMasterclass("masterclass_payment_success", campaignProps(attribution.current));
    fbTrack("Purchase", { value: order.amount / 100, currency: "INR", content_name: MASTERCLASS_EVENT.title }, fbEventId);
    router.push(`${MASTERCLASS_EVENT.thankYouPath}?r=${registrationId}&paid=1`);
    return true;
  }

  function onInvalid() {
    trackMasterclass("masterclass_registration_error", { status: "client_validation" });
  }

  const universitySource = watch("universitySource") ?? "manual";
  const disabled = submitting || !registrationOpen;

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onValid, onInvalid)}
      onFocusCapture={markStarted}
      aria-describedby={serverError ? "mc-form-error" : undefined}
      className="space-y-4"
    >
      {registrationOpen && (
        <PricingBanner {...pricing} {...offer} />
      )}

      {!registrationOpen && (
        <div role="status" className="rounded-msc-md border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-ink">
          {closed ? (
            <>
              <strong className="font-semibold">Registration has closed.</strong> The masterclass has already started.
            </>
          ) : (
            <>
              <strong className="font-semibold">Registration opens shortly.</strong> We&rsquo;re finalising the session
              details — please check back soon.
            </>
          )}
        </div>
      )}

      <div>
        <label htmlFor="mc-name" className="mb-1.5 block text-sm font-semibold text-brand-navy">
          Full name
        </label>
        <input
          id="mc-name"
          type="text"
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="next"
          placeholder="Your full name"
          maxLength={100}
          aria-invalid={errors.fullName ? true : undefined}
          aria-describedby={errors.fullName ? "mc-name-error" : undefined}
          aria-required
          className={inputClass(Boolean(errors.fullName))}
          {...register("fullName")}
        />
        <FieldError id="mc-name-error" message={errors.fullName?.message} />
      </div>

      <div>
        <label htmlFor="mc-email" className="mb-1.5 block text-sm font-semibold text-brand-navy">
          Email address
        </label>
        <input
          id="mc-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="next"
          placeholder="you@example.com"
          maxLength={254}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={["mc-email-help", errors.email ? "mc-email-error" : ""].filter(Boolean).join(" ")}
          aria-required
          className={inputClass(Boolean(errors.email))}
          {...register("email")}
        />
        <p id="mc-email-help" className="mt-1.5 text-xs text-muted">
          We&rsquo;ll also email your joining link here.
        </p>
        <FieldError id="mc-email-error" message={errors.email?.message} />
      </div>

      <div>
        <label htmlFor="mc-phone" className="mb-1.5 block text-sm font-semibold text-brand-navy">
          Mobile number
        </label>
        <div className="flex">
          <span
            aria-hidden
            className="inline-flex h-12 items-center rounded-l-msc border border-r-0 border-brand-navy/15 bg-brand-pale px-3 text-sm font-semibold text-brand-navy"
          >
            +91
          </span>
          <input
            id="mc-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            enterKeyHint="next"
            placeholder="98765 43210"
            maxLength={16}
            aria-label="Mobile number, India +91"
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={errors.phone ? "mc-phone-error" : undefined}
            aria-required
            className={cn(inputClass(Boolean(errors.phone)), "rounded-l-none")}
            {...register("phone")}
          />
        </div>
        <FieldError id="mc-phone-error" message={errors.phone?.message} />
      </div>

      <div>
        <label htmlFor="mc-university" className="mb-1.5 block text-sm font-semibold text-brand-navy">
          University name
        </label>
        <Controller
          control={control}
          name="university"
          render={({ field, fieldState }) => (
            <UniversityCombobox
              id="mc-university"
              value={field.value ?? ""}
              source={universitySource}
              invalid={Boolean(fieldState.error)}
              describedBy={fieldState.error ? "mc-university-error" : undefined}
              onBlur={field.onBlur}
              onChange={(value, source) => {
                field.onChange(value);
                setValue("universitySource", source);
              }}
            />
          )}
        />
        <FieldError id="mc-university-error" message={errors.university?.message} />
      </div>

      <div>
        <label htmlFor="mc-status" className="mb-1.5 block text-sm font-semibold text-brand-navy">
          Current academic status
        </label>
        <select
          id="mc-status"
          aria-invalid={errors.academicStatus ? true : undefined}
          aria-describedby={errors.academicStatus ? "mc-status-error" : undefined}
          aria-required
          className={cn(inputClass(Boolean(errors.academicStatus)), "appearance-none bg-[length:16px] bg-[right_0.9rem_center] bg-no-repeat pr-10")}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233A4D60' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          }}
          {...register("academicStatus")}
        >
          <option value="" disabled>
            Select your current status
          </option>
          {ACADEMIC_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <FieldError id="mc-status-error" message={errors.academicStatus?.message} />
      </div>

      {/* Honeypot: invisible to people and assistive tech, irresistible to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="mc-website">Website</label>
        <input
          id="mc-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="mc-consent" className="flex cursor-pointer items-start gap-3 text-xs leading-relaxed text-muted">
          <input
            id="mc-consent"
            type="checkbox"
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? "mc-consent-error" : undefined}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-brand-navy/30 accent-brand-blue"
            {...register("consent")}
          />
          <span>
            I agree to MedSkills Catalyst contacting me about this masterclass by email, phone or WhatsApp, as described
            in the{" "}
            <a
              href={PRIVACY_POLICY_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-blue underline underline-offset-2"
            >
              Privacy Policy
            </a>
            .
          </span>
        </label>
        <FieldError id="mc-consent-error" message={errors.consent?.message} />
      </div>

      {serverError && (
        <div id="mc-form-error" role="alert" className="rounded-msc-md border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger">
          {serverError}
        </div>
      )}

      <button
        type="submit"
        disabled={disabled}
        aria-disabled={disabled}
        className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-pill bg-brand-blue px-6 text-base font-bold text-white shadow-msc-glow transition hover:bg-emerald-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-blue/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? (
          <>
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            {phase === "paid" ? "Please wait…" : "Registering…"}
          </>
        ) : phase === "paid" ? (
          <>
            Register &amp; pay {MASTERCLASS_EVENT.priceLabel}
            <span aria-hidden>→</span>
          </>
        ) : (
          <>
            Register free
            <span aria-hidden>→</span>
          </>
        )}
      </button>
      <p className="text-center text-xs text-muted">
        {phase === "paid" ? (
          <>
            Secure payment by Razorpay · Joining link shared on WhatsApp and by email after payment ·{" "}
            <a href="/refund-policy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Refund policy
            </a>
          </>
        ) : (
          "Takes under a minute · Joining link shared on WhatsApp on 24th morning and by email"
        )}
      </p>
    </form>
  );
}
