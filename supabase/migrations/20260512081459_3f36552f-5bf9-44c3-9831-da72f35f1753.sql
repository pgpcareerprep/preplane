ALTER TABLE public.alumni_records
  ADD COLUMN IF NOT EXISTS current_city  text,
  ADD COLUMN IF NOT EXISTS current_state text,
  ADD COLUMN IF NOT EXISTS location      text,
  ADD COLUMN IF NOT EXISTS company_2     text,
  ADD COLUMN IF NOT EXISTS role_2        text,
  ADD COLUMN IF NOT EXISTS company_3     text,
  ADD COLUMN IF NOT EXISTS company_4     text,
  ADD COLUMN IF NOT EXISTS role_4        text,
  ADD COLUMN IF NOT EXISTS company_5     text,
  ADD COLUMN IF NOT EXISTS role_5        text,
  ADD COLUMN IF NOT EXISTS company_6     text,
  ADD COLUMN IF NOT EXISTS role_6        text;