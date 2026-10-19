"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/src/lib/cn";

/**
 * Searchable university field (WAI-ARIA 1.2 combobox, list autocomplete).
 *
 * The directory is a vendored AISHE list (public/data/indian-universities.json,
 * built by scripts/build-university-directory.ts) fetched on first focus, so it
 * costs nothing until a student reaches the field.
 *
 * Typing is never blocked: the field is a free-text input first. Picking a
 * suggestion records source "directory"; anything typed and kept — or the
 * explicit "not listed" option — records source "manual". Nothing is ever
 * auto-selected on the student's behalf.
 */

type Uni = { n: string; s: string };
type Indexed = Uni & { key: string; words: string[]; initials: string };
export type UniversitySource = "directory" | "manual";

const MAX_RESULTS = 8;
const DIRECTORY_URL = "/data/indian-universities.json";

// Common short names students actually type, mapped to the AISHE name.
const ALIASES: Record<string, string> = {
  du: "University of Delhi",
  "delhi university": "University of Delhi",
  bhu: "Banaras Hindu University",
  amu: "Aligarh Muslim University",
  jnu: "Jawaharlal Nehru University",
  jmi: "Jamia Millia Islamia",
  ipu: "Guru Gobind Singh Indraprastha University",
  ggsipu: "Guru Gobind Singh Indraprastha University",
  mahe: "Manipal Academy of Higher Education",
  manipal: "Manipal Academy of Higher Education",
  iisc: "Indian Institute of Science",
  "mumbai university": "University of Mumbai",
  mu: "University of Mumbai",
  "pune university": "Savitribai Phule Pune University",
  sppu: "Savitribai Phule Pune University",
  "calcutta university": "University of Calcutta",
  "madras university": "University of Madras",
  "anna university": "Anna University",
};

const STOP = new Set(["of", "and", "the", "for", "in", "at", "&"]);

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function index(list: Uni[]): Indexed[] {
  return list.map((u) => {
    const key = norm(u.n);
    const words = key.split(" ");
    const initials = words
      .filter((w) => !STOP.has(w))
      .map((w) => w[0])
      .join("");
    return { ...u, key, words, initials };
  });
}

function search(all: Indexed[], query: string): Indexed[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const tokens = q.split(" ");
  const compact = q.replace(/ /g, "");
  const alias = ALIASES[q];
  const scored: { u: Indexed; score: number }[] = [];
  for (const u of all) {
    let score = 0;
    if (alias && u.n.toLowerCase().startsWith(alias.toLowerCase())) score = 100;
    else if (u.key.startsWith(q)) score = 80;
    else if (tokens.every((t) => u.words.some((w) => w.startsWith(t)))) score = 60;
    else if (compact.length >= 2 && !compact.includes(" ") && u.initials.startsWith(compact)) score = 50;
    else if (u.key.includes(q)) score = 30;
    if (score) scored.push({ u, score: score - u.n.length / 1000 });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_RESULTS).map((s) => s.u);
}

// Module-level cache: one fetch per page load, shared across mounts.
let directoryPromise: Promise<Indexed[]> | null = null;
function loadDirectory(): Promise<Indexed[]> {
  directoryPromise ??= fetch(DIRECTORY_URL)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<{ universities: Uni[] }>;
    })
    .then((d) => index(d.universities ?? []))
    .catch((err) => {
      directoryPromise = null; // allow a later retry
      throw err;
    });
  return directoryPromise;
}

export function UniversityCombobox({
  id,
  value,
  source,
  onChange,
  onBlur,
  invalid,
  describedBy,
  disabled,
}: {
  id: string;
  value: string;
  source: UniversitySource;
  onChange: (value: string, source: UniversitySource) => void;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [directory, setDirectory] = useState<Indexed[] | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [keptAsTyped, setKeptAsTyped] = useState(false);

  const ensureLoaded = useCallback(() => {
    if (loadState === "ready" || loadState === "loading") return;
    setLoadState("loading");
    loadDirectory()
      .then((d) => {
        setDirectory(d);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, [loadState]);

  // Warm the directory once the browser is idle, so the first keystroke is instant.
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const t = w.requestIdleCallback ? w.requestIdleCallback(() => ensureLoaded()) : window.setTimeout(ensureLoaded, 2500);
    return () => {
      if (!w.requestIdleCallback) window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = useMemo(
    () => (directory && source === "manual" ? search(directory, value) : []),
    [directory, value, source],
  );
  const showOther = value.trim().length >= 2 && source === "manual";
  // Options: suggestions, then the explicit "not listed" choice.
  const optionCount = results.length + (showOther ? 1 : 0);
  const expanded = open && optionCount > 0;

  useEffect(() => setActive(-1), [value]);

  const optionId = (i: number) => `${listId}-opt-${i}`;

  function choose(i: number) {
    if (i < results.length) {
      onChange(results[i].n, "directory");
    } else {
      onChange(value.replace(/\s+/g, " ").trim(), "manual");
      setKeptAsTyped(true);
    }
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((a) => (optionCount ? (a + 1) % optionCount : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((a) => (optionCount ? (a <= 0 ? optionCount - 1 : a - 1) : -1));
    } else if (e.key === "Enter") {
      if (expanded && active >= 0) {
        e.preventDefault(); // pick the option instead of submitting the form
        choose(active);
      }
    } else if (e.key === "Escape") {
      if (expanded) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    }
  }

  // Keep the highlighted option in view while arrowing through the list.
  useEffect(() => {
    if (active < 0) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const hint =
    source === "directory"
      ? "Selected from the university list."
      : keptAsTyped && value.trim()
        ? `We'll save “${value.trim()}” exactly as typed.`
        : loadState === "error"
        ? "Couldn't load the university list — just type your university's full name."
        : "Start typing to search. Not listed? Type the full name and choose “use as typed”.";

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={[describedBy, `${id}-hint`].filter(Boolean).join(" ")}
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint="next"
        disabled={disabled}
        placeholder="Search your university"
        value={value}
        maxLength={200}
        onFocus={() => {
          ensureLoaded();
          setOpen(true);
        }}
        onChange={(e) => {
          // Any edit turns a picked suggestion back into free text.
          onChange(e.target.value, "manual");
          setKeptAsTyped(false);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setOpen(false);
          onBlur?.();
        }}
        className={cn(
          "flex h-12 w-full rounded-msc border bg-surface px-3.5 pr-10 text-base text-ink placeholder:text-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
          invalid
            ? "border-danger focus-visible:border-danger focus-visible:ring-danger/20"
            : "border-brand-navy/15 focus-visible:border-brand-blue focus-visible:ring-brand-blue/20",
        )}
      />
      <span aria-hidden className="pointer-events-none absolute right-3 top-3.5 text-muted">
        {source === "directory" ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-success" fill="none">
            <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        )}
      </span>

      <ul
        id={listId}
        role="listbox"
        aria-label="University suggestions"
        hidden={!expanded}
        className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-72 overflow-auto rounded-msc-md border border-brand-navy/10 bg-surface p-1.5 shadow-msc-float"
      >
        {results.map((u, i) => (
          <li
            key={`${u.n}|${u.s}`}
            id={optionId(i)}
            role="option"
            aria-selected={active === i}
            // mousedown, not click: fires before the input blurs and closes the list.
            onMouseDown={(e) => {
              e.preventDefault();
              choose(i);
            }}
            onMouseMove={() => setActive(i)}
            className={cn(
              "cursor-pointer rounded-msc px-3 py-2.5 text-sm leading-snug",
              active === i ? "bg-brand-pale text-brand-navy" : "text-ink",
            )}
          >
            <span className="block font-medium">{u.n}</span>
            {u.s && <span className="block text-xs text-muted">{u.s}</span>}
          </li>
        ))}
        {showOther && (
          <li
            id={optionId(results.length)}
            role="option"
            aria-selected={active === results.length}
            onMouseDown={(e) => {
              e.preventDefault();
              choose(results.length);
            }}
            onMouseMove={() => setActive(results.length)}
            className={cn(
              "cursor-pointer rounded-msc border-t border-brand-navy/10 px-3 py-2.5 text-sm",
              results.length ? "mt-1" : "",
              active === results.length ? "bg-brand-pale text-brand-navy" : "text-ink",
            )}
          >
            <span className="block font-semibold text-brand-blue">Other / University not listed</span>
            <span className="block text-xs text-muted">Use “{value.trim()}” as typed</span>
          </li>
        )}
      </ul>

      <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
        {hint}
      </p>
      <p className="sr-only" aria-live="polite">
        {expanded ? `${results.length} suggestion${results.length === 1 ? "" : "s"} available.` : ""}
      </p>
    </div>
  );
}
