
-- 1. Docstrings on tables
COMMENT ON TABLE public.entity_registry IS 'Unified lookup of all named entities (students, POCs, mentors, alumni, LMP processes, domains) used by Copilot @mention autocomplete and entity-search. Kept in sync via per-table triggers + rebuild_entity_registry() + reconcile_poc_entity_registry().';
COMMENT ON TABLE public.lmp_processes IS 'Canonical LMP process records. Synced bidirectionally with the LMP tracker sheet via sync-ingest + sheets-lmp edge functions.';
COMMENT ON TABLE public.lmp_poc_links IS 'Resolved many-to-many link between an LMP process and POC profiles, populated by resolve_lmp_poc_links() from prep_poc/support_poc/outreach_poc text fields.';
COMMENT ON TABLE public.lmp_timeline IS 'Append-only event log per LMP (event_type: update | remark | checklist | status_change). Powers the activity timeline + progress cards.';
COMMENT ON TABLE public.poc_profiles IS 'Canonical POC roster + live load/conversion stats. Replaces the deprecated POC_CAPABILITIES static array.';
COMMENT ON TABLE public.copilot_threads IS 'Per-user Copilot chat threads. RLS scoped to owning user_id (or admin).';
COMMENT ON TABLE public.copilot_messages IS 'Messages within a copilot_thread. Inherits RLS from parent thread.';
COMMENT ON TABLE public.sync_conflicts IS 'Open conflicts detected when sheet value differs from system value. Surfaced in admin LastSyncConflictBanner.';
COMMENT ON TABLE public.unmapped_items IS 'Sheet values (POC names, domains, statuses) that did not resolve to a known entity. Reviewed in admin AliasesAdminPage.';

-- 2. Docstrings on helper functions
COMMENT ON FUNCTION public.rebuild_entity_registry() IS 'Full rebuild: re-upserts every student, poc, mentor, alumni, lmp, domain into entity_registry. Idempotent. Run on demand from admin.';
COMMENT ON FUNCTION public.reconcile_poc_entity_registry() IS 'Drops orphan POC rows + refreshes from poc_profiles. Logged into sheet_sync_events.';
COMMENT ON FUNCTION public.resolve_lmp_poc_links(uuid) IS 'Parses prep_poc/support_poc/outreach_poc text on an LMP, matches against poc_profiles aliases, and rebuilds lmp_poc_links + lmp_processes.*_poc_id columns.';

-- 3. Cleanup orphan entity_registry rows
DELETE FROM public.entity_registry er WHERE er.entity_type = 'student' AND NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id::text = er.entity_id);
DELETE FROM public.entity_registry er WHERE er.entity_type = 'poc'     AND NOT EXISTS (SELECT 1 FROM public.poc_profiles p WHERE p.id::text = er.entity_id);
DELETE FROM public.entity_registry er WHERE er.entity_type = 'mentor'  AND NOT EXISTS (SELECT 1 FROM public.mentors m WHERE m.id::text = er.entity_id);
DELETE FROM public.entity_registry er WHERE er.entity_type = 'alumni'  AND NOT EXISTS (SELECT 1 FROM public.alumni_records a WHERE a.id::text = er.entity_id);
DELETE FROM public.entity_registry er WHERE er.entity_type = 'lmp'     AND NOT EXISTS (SELECT 1 FROM public.lmp_processes l WHERE l.id::text = er.entity_id);
DELETE FROM public.entity_registry er WHERE er.entity_type = 'domain'  AND NOT EXISTS (SELECT 1 FROM public.domains d WHERE d.slug = er.entity_id);

-- 4. LSIS confirmation flag
INSERT INTO public.system_settings (key, value, updated_by)
VALUES ('lsis.bidirectional_enabled', jsonb_build_object('enabled', true, 'confirmed_at', now()::text, 'note', 'Sheet <-> DB <-> UI bidirectional sync verified in Phase 5.'), 'phase5_migration')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = 'phase5_migration';
