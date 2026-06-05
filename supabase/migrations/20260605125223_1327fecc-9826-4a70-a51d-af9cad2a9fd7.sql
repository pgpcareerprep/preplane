DROP INDEX IF EXISTS public.students_email_key;
ALTER TABLE public.students ADD CONSTRAINT students_email_key UNIQUE (email);