CREATE TABLE IF NOT EXISTS public._internal_cron_auth (
  id boolean PRIMARY KEY DEFAULT true,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT _internal_cron_auth_singleton CHECK (id = true)
);

ALTER TABLE public._internal_cron_auth ENABLE ROW LEVEL SECURITY;

-- No policies: only service role (which bypasses RLS) can access. Deny all otherwise.

INSERT INTO public._internal_cron_auth (id, token)
VALUES (true, encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;