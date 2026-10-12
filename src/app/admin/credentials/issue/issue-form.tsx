"use client";

import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { issueAction, planIssueAction, type PlanState } from "../actions";
import {
  CREDENTIAL_TYPE_DEFINITIONS,
  CREDENTIAL_TYPES,
  INTERNSHIP_MODE_LABELS,
  INTERNSHIP_MODES,
  OFFER_TYPE_LABELS,
  OFFER_TYPES,
  type CredentialType,
} from "@/src/modules/credentials/credential-types";
import { calendarDuration } from "@/src/modules/credentials/duration";
import { parseISODate } from "@/src/modules/credentials/dates";

type Program = { id: string; name: string; type: CredentialType; ready: boolean; reason: string | null; cohorts: { id: string; name: string }[] };

/** The same calculation the server snapshots; shown live so nobody has to work it out. */
function durationPreview(start: string, end: string): { ok: true; label: string; days: number } | { ok: false; message: string } | null {
  const s = parseISODate(start);
  const e = parseISODate(end);
  if (!s || !e) return null;
  if (e.getTime() < s.getTime()) return { ok: false, message: "The end date is before the start date." };
  const d = calendarDuration(s, e);
  return { ok: true, label: d.label, days: d.days };
}

const input =
  "h-10 w-full rounded-msc border border-brand-navy/15 bg-surface px-3 text-sm text-ink focus-visible:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/20 disabled:bg-canvas";

const newKey = () => `issue-${crypto.randomUUID()}`;

function SubmitButton({
  children,
  className,
  formAction,
}: {
  children: React.ReactNode;
  className: string;
  formAction: (fd: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" formAction={formAction} disabled={pending} aria-disabled={pending} className={className}>
      {pending ? "Working…" : children}
    </button>
  );
}

export function IssueForm({ programs, today }: { programs: Program[]; today: string }) {
  const [state, review, reviewing] = useActionState<PlanState, FormData>(planIssueAction, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<CredentialType>("COURSE_COMPLETION");
  const [courseId, setCourseId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const duration = durationPreview(startDate, endDate);
  const typePrograms = programs.filter((p) => p.type === type);
  // One idempotency key per reviewed submission: a double-click or retried
  // request reuses it and can never create a second credential. Any edit
  // produces a new key and requires a fresh review.
  const [key, setKey] = useState(newKey);
  const [stale, setStale] = useState(false);
  const program = useMemo(() => programs.find((p) => p.id === courseId), [programs, courseId]);
  const canConfirm = state.status === "ready" && !stale;

  return (
    <form
      ref={formRef}
      className="grid gap-6 lg:grid-cols-[1fr_380px]"
      onChange={() => {
        setStale(true);
        setKey(newKey());
      }}
    >
      <input type="hidden" name="idempotencyKey" value={key} />
      <div className="space-y-4 rounded-msc-lg bg-surface p-5 shadow-msc-sm">
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-brand-navy">Credential type</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CREDENTIAL_TYPES.map((t) => {
              const available = programs.some((p) => p.type === t);
              return (
                <label
                  key={t}
                  className={`flex cursor-pointer items-start gap-3 rounded-msc border p-3 text-sm ${type === t ? "border-brand-blue bg-brand-blue/5" : "border-brand-navy/15"} ${available ? "" : "cursor-not-allowed opacity-60"}`}
                >
                  <input
                    type="radio"
                    name="credentialType"
                    aria-label={CREDENTIAL_TYPE_DEFINITIONS[t].label}
                    value={t}
                    checked={type === t}
                    disabled={!available}
                    onChange={() => {
                      setType(t);
                      setCourseId("");
                    }}
                    className="mt-0.5 h-4 w-4 accent-brand-blue"
                  />
                  <span>
                    <span className="block font-semibold text-ink">{CREDENTIAL_TYPE_DEFINITIONS[t].label}</span>
                    <span className="block text-xs text-muted">{available ? CREDENTIAL_TYPE_DEFINITIONS[t].publicLabel : "No program issues this type yet"}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="fullName" className="text-sm font-semibold text-brand-navy">{type === "OFFER_LETTER" ? "Recipient full name, as it should appear on the letter" : "Learner full name, as it should appear on the certificate"}</label>
            <input id="fullName" name="fullName" required maxLength={120} autoComplete="off" className={input} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="email" className="text-sm font-semibold text-brand-navy">{type === "OFFER_LETTER" ? "Recipient email" : "Learner email"}</label>
            <input id="email" name="email" type="email" required maxLength={254} autoComplete="off" className={input} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="courseId" className="text-sm font-semibold text-brand-navy">Program</label>
            <select id="courseId" name="courseId" required value={courseId} onChange={(e) => setCourseId(e.target.value)} className={input}>
              <option value="">Choose a program</option>
              {typePrograms.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.ready}>
                  {p.name}
                  {p.reason ? ` (${p.reason})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="batchId" className="text-sm font-semibold text-brand-navy">Cohort</label>
            <select id="batchId" name="batchId" className={input} disabled={!program}>
              <option value="">No cohort</option>
              {program?.cohorts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {type === "COURSE_COMPLETION" ? (
            <div className="space-y-1.5">
              <label htmlFor="completionDate" className="text-sm font-semibold text-brand-navy">Completion date</label>
              <input id="completionDate" name="completionDate" type="date" required max={today} className={input} />
            </div>
          ) : type === "OFFER_LETTER" ? (
            <>
              <div className="space-y-1.5">
                <label htmlFor="offerType" className="text-sm font-semibold text-brand-navy">Offer type</label>
                <select id="offerType" name="offerType" required defaultValue="" className={input}>
                  <option value="" disabled>Choose</option>
                  {OFFER_TYPES.map((t) => (
                    <option key={t} value={t}>{OFFER_TYPE_LABELS[t]}</option>
                  ))}
                </select>
                <p className="text-xs text-muted">Picks the letter&apos;s wording.</p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="role" className="text-sm font-semibold text-brand-navy">Role</label>
                <input id="role" name="role" required minLength={2} maxLength={80} autoComplete="off" placeholder="e.g. MedTech Sales Intern" className={input} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="institution" className="text-sm font-semibold text-brand-navy">
                  College / institution <span className="font-normal text-muted">(optional)</span>
                </label>
                <input id="institution" name="institution" maxLength={120} autoComplete="off" placeholder="e.g. K.K. Wagh College of Pharmacy, Nashik" className={input} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="offerStartDate" className="text-sm font-semibold text-brand-navy">Start date</label>
                <input id="offerStartDate" name="startDate" type="date" required className={input} />
              </div>
              <div className="space-y-1.5">
                <span className="text-sm font-semibold text-brand-navy">Duration</span>
                <div className="flex gap-2">
                  <input aria-label="Duration" name="durationCount" type="number" required min={1} max={104} step={1} defaultValue={2} className={input} />
                  <select aria-label="Duration unit" name="durationUnit" defaultValue="MONTHS" className={input}>
                    <option value="MONTHS">Months</option>
                    <option value="WEEKS">Weeks</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="offerMode" className="text-sm font-semibold text-brand-navy">Mode</label>
                <select id="offerMode" name="mode" required defaultValue="REMOTE" className={input}>
                  {INTERNSHIP_MODES.map((m) => (
                    <option key={m} value={m}>{INTERNSHIP_MODE_LABELS[m]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <span className="text-sm font-semibold text-brand-navy">
                  Stipend <span className="font-normal text-muted">(optional, INR)</span>
                </span>
                <div className="flex gap-2">
                  <input aria-label="Stipend amount in rupees" name="stipendRupees" type="number" min={1} step="0.01" inputMode="decimal" className={input} />
                  <select aria-label="Stipend period" name="stipendPeriod" defaultValue="PER_MONTH" className={input}>
                    <option value="PER_MONTH">per month</option>
                    <option value="TOTAL">total</option>
                  </select>
                </div>
                <p className="text-xs text-muted">Printed on the letter only, never on the public page.</p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="greetingName" className="text-sm font-semibold text-brand-navy">
                  Name in the greeting <span className="font-normal text-muted">(optional)</span>
                </label>
                <input id="greetingName" name="greetingName" maxLength={60} autoComplete="off" placeholder="Defaults to the first name: Dear Sejal," className={input} />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="internshipTitle" className="text-sm font-semibold text-brand-navy">Internship name</label>
                <input id="internshipTitle" name="internshipTitle" required minLength={2} maxLength={120} autoComplete="off" placeholder="Type the internship name, e.g. Clinical Research Internship" className={input} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="department" className="text-sm font-semibold text-brand-navy">
                  Department / specialization <span className="font-normal text-muted">(optional)</span>
                </label>
                <input id="department" name="department" maxLength={120} autoComplete="off" className={input} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="startDate" className="text-sm font-semibold text-brand-navy">Start date</label>
                <input id="startDate" name="startDate" type="date" required max={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} className={input} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="endDate" className="text-sm font-semibold text-brand-navy">End date</label>
                <input id="endDate" name="endDate" type="date" required min={startDate || undefined} max={today} value={endDate} onChange={(e) => setEndDate(e.target.value)} className={input} />
              </div>
              <div className="sm:col-span-2" aria-live="polite">
                <p className="text-sm font-semibold text-brand-navy">Duration</p>
                {duration === null && <p className="mt-1 text-sm text-muted">Calculated from the start and end dates.</p>}
                {duration?.ok === false && <p className="mt-1 text-sm text-danger">{duration.message}</p>}
                {duration?.ok && (
                  <p className="mt-1 text-sm text-ink">
                    <span className="font-semibold">{duration.label}</span> <span className="text-muted">({duration.days} calendar days, calculated, not editable)</span>
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="totalHours" className="text-sm font-semibold text-brand-navy">
                  Total hours <span className="font-normal text-muted">(optional)</span>
                </label>
                <input id="totalHours" name="totalHours" type="number" min={0.5} max={5000} step={0.5} inputMode="decimal" className={input} />
                <p className="text-xs text-muted">Only if recorded. Never estimated from the dates.</p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="supervisor" className="text-sm font-semibold text-brand-navy">
                  Supervisor <span className="font-normal text-muted">(optional, internal)</span>
                </label>
                <input id="supervisor" name="supervisor" maxLength={120} autoComplete="off" className={input} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="mode" className="text-sm font-semibold text-brand-navy">
                  Mode <span className="font-normal text-muted">(optional)</span>
                </label>
                <select id="mode" name="mode" className={input} defaultValue="">
                  <option value="">Not stated</option>
                  {INTERNSHIP_MODES.map((m) => (
                    <option key={m} value={m}>{INTERNSHIP_MODE_LABELS[m]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="location" className="text-sm font-semibold text-brand-navy">
                  Location <span className="font-normal text-muted">(optional)</span>
                </label>
                <input id="location" name="location" maxLength={120} autoComplete="off" className={input} />
              </div>
            </>
          )}
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
            <input type="checkbox" name="sendEmail" className="h-4 w-4 accent-brand-blue" />
            {type === "OFFER_LETTER" ? "Email the recipient after issuing" : "Email the learner after issuing"}
          </label>
        </div>
        {/* Review runs as a transition, not a form action: React resets a form
            after a form action completes, which would clear what was reviewed. */}
        <button
          type="button"
          disabled={reviewing}
          onClick={() => {
            const form = formRef.current;
            if (!form || !form.reportValidity()) return;
            setStale(false);
            const fd = new FormData(form);
            startTransition(() => review(fd));
          }}
          className="inline-flex h-10 items-center rounded-pill border border-brand-navy/15 bg-surface px-5 text-sm font-semibold text-brand-navy hover:border-brand-blue hover:text-brand-blue disabled:opacity-60"
        >
          {reviewing ? "Checking…" : state.status === "ready" ? "Review again" : "Review"}
        </button>
      </div>

      <aside className="space-y-4" aria-live="polite">
        {state.status === "idle" && (
          <div className="rounded-msc-lg border border-dashed border-brand-navy/20 p-5 text-sm text-muted">
            The review shows exactly what will be printed, checks for an existing credential, and confirms the name fits on the certificate.
          </div>
        )}
        {state.status === "error" && !stale && (
          <div role="alert" className="rounded-msc-lg border border-danger/30 bg-red-50 p-5 text-sm text-danger">
            <p className="font-semibold">Can’t issue yet</p>
            <p className="mt-1">{state.message}</p>
            {state.duplicate?.credentialId && (
              <a className="mt-2 inline-block font-semibold underline" href={`/admin/credentials/${state.duplicate.credentialId}`}>
                Open {state.duplicate.certificateId}
              </a>
            )}
          </div>
        )}
        {state.status !== "idle" && stale && (
          <div className="rounded-msc-lg border border-dashed border-brand-navy/20 p-5 text-sm text-muted">Details changed. Review again before issuing.</div>
        )}
        {canConfirm && state.status === "ready" && (
          <div className="rounded-msc-lg bg-surface p-5 shadow-msc-md">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-blue">Review</p>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                [type === "OFFER_LETTER" ? "Name on letter" : "Name on certificate", state.summary.learnerName],
                ["Email", state.summary.email],
                ["Type", state.summary.credentialType],
                ["Program", state.summary.program],
                ["Cohort", state.summary.cohort ?? "—"],
                ...(state.summary.internship ?? [["Completed", state.summary.completionDate]]),
                ["Issue date", state.summary.issueDate],
                ["Expires", state.summary.expires],
                ["Template", state.summary.template],
                [type === "OFFER_LETTER" ? "Email recipient" : "Email learner", state.summary.sendEmail ? "Yes" : "No"],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[120px_1fr] gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="break-words font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            {state.warnings.length > 0 && (
              <ul className="mt-4 space-y-1 rounded-msc bg-amber-50 p-3 text-xs text-amber-900">
                {state.warnings.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            )}
            <button
              type="submit"
              formAction="/api/admin/credentials/preview"
              formMethod="post"
              formEncType="multipart/form-data"
              formTarget="_blank"
              className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-pill border border-brand-navy/15 bg-surface text-sm font-semibold text-brand-navy hover:border-brand-blue hover:text-brand-blue"
            >
              {type === "OFFER_LETTER" ? "Preview letter (PDF)" : "Preview certificate (PDF)"}
            </button>
            <SubmitButton
              formAction={issueAction}
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-pill bg-brand-blue text-sm font-semibold text-white shadow-msc-sm hover:bg-brand-navy disabled:opacity-60"
            >
              Confirm and issue
            </SubmitButton>
            <p className="mt-2 text-xs text-muted">Issuing creates a permanent record. Mistakes are corrected with Reissue, never deleted.</p>
          </div>
        )}
      </aside>
    </form>
  );
}
