-- lmp_mentors.mentor_name was added as NOT NULL but the TypeScript types were
-- never regenerated, so all app upserts omit it and hit the constraint.
-- Fix: make the column nullable (belt-and-suspenders alongside the app fix
-- that now always passes mentor_name explicitly).
-- Also ensure mentor_source exists (same generation gap).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'lmp_mentors'
      AND column_name  = 'mentor_name'
  ) THEN
    ALTER TABLE public.lmp_mentors ALTER COLUMN mentor_name DROP NOT NULL;
  ELSE
    ALTER TABLE public.lmp_mentors ADD COLUMN mentor_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'lmp_mentors'
      AND column_name  = 'mentor_source'
  ) THEN
    ALTER TABLE public.lmp_mentors ADD COLUMN mentor_source text;
  END IF;
END $$;
