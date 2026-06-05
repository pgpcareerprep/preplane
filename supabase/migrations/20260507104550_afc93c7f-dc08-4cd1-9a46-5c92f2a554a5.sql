
-- Drop existing text defaults first
ALTER TABLE public.lmp_processes
  ALTER COLUMN prep_doc_shared DROP DEFAULT,
  ALTER COLUMN next_progress_date DROP DEFAULT,
  ALTER COLUMN mentor_aligned DROP DEFAULT,
  ALTER COLUMN assignment_review DROP DEFAULT,
  ALTER COLUMN one_to_one_mock DROP DEFAULT;

-- Convert checklist text columns to boolean
ALTER TABLE public.lmp_processes
  ALTER COLUMN mentor_aligned TYPE boolean
    USING COALESCE(mentor_aligned IN ('TRUE', '1', 'true', 'yes'), false),
  ALTER COLUMN assignment_review TYPE boolean
    USING COALESCE(assignment_review IN ('TRUE', '1', 'true', 'yes'), false),
  ALTER COLUMN prep_doc_shared TYPE boolean
    USING COALESCE(prep_doc_shared IN ('TRUE', '1', 'true', 'yes'), false),
  ALTER COLUMN one_to_one_mock TYPE boolean
    USING COALESCE(one_to_one_mock IN ('TRUE', '1', 'true', 'yes'), false);

-- Set boolean defaults
ALTER TABLE public.lmp_processes
  ALTER COLUMN mentor_aligned SET DEFAULT false,
  ALTER COLUMN assignment_review SET DEFAULT false,
  ALTER COLUMN prep_doc_shared SET DEFAULT false,
  ALTER COLUMN one_to_one_mock SET DEFAULT false;

-- Convert next_progress_date from text to date
ALTER TABLE public.lmp_processes
  ALTER COLUMN next_progress_date TYPE date
    USING NULLIF(next_progress_date, '')::date;
