
-- Add source column to activity_log for tracking UI vs Copilot actions
ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ui';

-- Allow authenticated users to insert audit log entries
CREATE POLICY "Authenticated can insert activity logs"
ON public.activity_log
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow anon (edge functions) to insert audit log entries
CREATE POLICY "Anon can insert activity logs"
ON public.activity_log
FOR INSERT
TO anon
WITH CHECK (true);
