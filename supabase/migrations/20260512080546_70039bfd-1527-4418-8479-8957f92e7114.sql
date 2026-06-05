-- Normalize empty strings to NULL
UPDATE public.alumni_records SET mu_email_id = NULL WHERE mu_email_id = '';
UPDATE public.alumni_records SET linkedin_profile = NULL WHERE linkedin_profile = '';

-- Drop partial unique indexes
DROP INDEX IF EXISTS public.alumni_records_email_uniq;
DROP INDEX IF EXISTS public.alumni_records_linkedin_uniq;

-- Add real UNIQUE constraints (NULLs allowed and distinct by default)
ALTER TABLE public.alumni_records
  ADD CONSTRAINT alumni_records_email_key UNIQUE (mu_email_id);
ALTER TABLE public.alumni_records
  ADD CONSTRAINT alumni_records_linkedin_key UNIQUE (linkedin_profile);