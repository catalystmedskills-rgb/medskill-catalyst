const WHATSAPP_URL = "https://wa.me/918800665154";

/**
 * Brand header mirroring the marketing site nav (public/index.html): logo mark +
 * "MedSkills Catalyst / Upskill to Upscale" wordmark, hairline border, sticky.
 * Kept intentionally minimal (no nav links) so the enrollment page stays focused.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-brand-navy/10 bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a href="https://medskillscatalyst.com" className="flex items-center gap-3" aria-label="MedSkills Catalyst">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo/MedSkills-Catalyst_Logo-01.svg"
            alt="MedSkills Catalyst"
            className="h-9 w-auto"
          />
          <span className="leading-none">
            <span className="block font-display text-[1.05rem] font-bold leading-none text-brand-navy">
              MedSkills Catalyst
            </span>
            <span className="mt-1 block text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-muted">
              Upskill to Upscale
            </span>
          </span>
        </a>

        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden items-center gap-2 rounded-pill border border-brand-navy/15 px-4 py-2 text-sm font-semibold text-brand-navy transition-colors hover:border-wa hover:text-wa sm:inline-flex"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
            <path d="M12.001 2.001C6.478 2.001 2 6.477 2 12c0 1.936.549 3.744 1.501 5.278L2 22l4.835-1.469A9.96 9.96 0 0 0 12 22c5.523 0 10-4.477 10-10S17.524 2.001 12.001 2.001zm0 18a7.969 7.969 0 0 1-4.065-1.112l-.291-.173-3.012.915.915-2.936-.19-.303A7.97 7.97 0 0 1 4 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.588 8-7.999 8z" />
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          </svg>
          Chat with us
        </a>
      </div>
    </header>
  );
}
