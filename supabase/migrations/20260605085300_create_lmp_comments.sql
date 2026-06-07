
CREATE TABLE IF NOT EXISTS public.lmp_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lmp_id uuid NOT NULL REFERENCES public.lmp_processes(id) ON DELETE CASCADE,
  author_user_id uuid,
  author_name text NOT NULL,
  author_initials text,
  author_color text,
  body text NOT NULL,
  source text DEFAULT 'app',
  ts timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.lmp_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read comments" ON public.lmp_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert comments" ON public.lmp_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
