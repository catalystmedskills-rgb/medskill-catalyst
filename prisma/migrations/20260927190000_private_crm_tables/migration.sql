-- Website routes authenticate with the server-only service role. No browser
-- role should read or modify leads, applications, invoices or migration history.
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.leads, public.career_applications, public.invoices,
  public.invoice_items, public.invoice_counters, public._prisma_migrations
  FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads, public.career_applications,
  public.invoices, public.invoice_items, public.invoice_counters TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
