-- Allow authenticated users to read lmp_timeline entries.
-- Previously only INSERT was allowed; no SELECT policy meant all client reads
-- returned empty arrays, causing "No activity yet" in the Activity Timeline
-- and Recent Activity dashboard widgets.
CREATE POLICY "Authenticated can read lmp_timeline"
  ON public.lmp_timeline FOR SELECT TO authenticated
  USING (true);
