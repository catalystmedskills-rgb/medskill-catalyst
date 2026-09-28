ALTER TABLE public.admin_auth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_auth_attempts FROM anon, authenticated;
