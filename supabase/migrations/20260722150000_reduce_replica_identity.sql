-- These four tables were set to REPLICA IDENTITY FULL in 20260515115736 and
-- 20260515121621 so realtime subscribers could "render without re-fetching."
-- That never happened: every current postgres_changes handler in src/ (all
-- routed through useRealtimeInvalidate, plus the handful of one-off
-- subscriptions) uses a payload-less callback and just invalidates/refetches
-- the query it cares about. FULL was broadcasting the entire before/after row
-- (including large text/jsonb columns) on every insert/update/delete for no
-- reader. DEFAULT still sends the primary key on every event, which is all
-- a refetch-triggered subscriber needs.
ALTER TABLE public.lmp_processes REPLICA IDENTITY DEFAULT;
ALTER TABLE public.lmp_candidates REPLICA IDENTITY DEFAULT;
ALTER TABLE public.students REPLICA IDENTITY DEFAULT;
ALTER TABLE public.mentors REPLICA IDENTITY DEFAULT;
