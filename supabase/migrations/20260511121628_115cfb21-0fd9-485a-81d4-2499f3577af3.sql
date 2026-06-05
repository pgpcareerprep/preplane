DROP INDEX IF EXISTS public.alumni_records_email_uniq;
DROP INDEX IF EXISTS public.alumni_records_linkedin_uniq;

CREATE UNIQUE INDEX alumni_records_email_uniq
  ON public.alumni_records (mu_email_id)
  WHERE mu_email_id IS NOT NULL AND mu_email_id <> '';

CREATE UNIQUE INDEX alumni_records_linkedin_uniq
  ON public.alumni_records (linkedin_profile)
  WHERE linkedin_profile IS NOT NULL AND linkedin_profile <> '';

ALTER TABLE public.alumni_records DROP CONSTRAINT IF EXISTS alumni_unique_name_cohort;
ALTER TABLE public.alumni_records
  ADD CONSTRAINT alumni_unique_name_cohort UNIQUE NULLS NOT DISTINCT (student_name, cohort);