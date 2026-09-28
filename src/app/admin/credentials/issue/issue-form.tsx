"use client";

import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { issueAction, planIssueAction, type PlanState } from "../actions";

type Program = { id: string; name: string; ready: boolean; reason: string | null; cohorts: { id: string; name: string }[] };

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
  const [courseId, setCourseId] = useState("");
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="fullName" className="text-sm font-semibold text-brand-navy">Learner full name, as it should appear on the certificate</label>
            <input id="fullName" name="fullName" required maxLength={120} autoComplete="off" className={input} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="email" className="text-sm font-semibold text-brand-navy">Learner email</label>
            <input id="email" name="email" type="email" required maxLength={254} autoComplete="off" className={input} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="courseId" className="text-sm font-semibold text-brand-navy">Program</label>
            <select id="courseId" name="courseId" required value={courseId} onChange={(e) => setCourseId(e.target.value)} className={input}>
              <option value="">Choose a program</option>
              {programs.map((p) => (
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
          <div className="space-y-1.5">
            <label htmlFor="completionDate" className="text-sm font-semibold text-brand-navy">Completion date</label>
            <input id="completionDate" name="completionDate" type="date" required max={today} className={input} />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
            <input type="checkbox" name="sendEmail" className="h-4 w-4 accent-brand-blue" />
            Email the learner after issuing
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
                ["Name on certificate", state.summary.learnerName],
                ["Email", state.summary.email],
                ["Program", state.summary.program],
                ["Cohort", state.summary.cohort ?? "—"],
                ["Completed", state.summary.completionDate],
                ["Issue date", state.summary.issueDate],
                ["Expires", state.summary.expires],
                ["Template", state.summary.template],
                ["Email learner", state.summary.sendEmail ? "Yes" : "No"],
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
