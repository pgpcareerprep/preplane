# Cron Fix Report

**Date:** 2026-06-09  
**Migration:** `supabase/migrations/20260609200000_fix_cron_urls_and_embed_trigger.sql`

---

## Old URL Found In

### Active DB functions (calling dead project)

| File | Object | Old URL |
|------|--------|---------|
| `20260604085925_*.sql` | `trigger_embed_sync()` | `yhzcheqjzmikeczzoeih.supabase.co/functions/v1/embed-sync` |

### Cron jobs (stale command strings in `cron.job`)

| Job name | Source migration | Old endpoint |
|----------|-----------------|--------------|
| `sheets-retry-sweeper` | `20260529092513_*.sql` | `.../sheets-retry-sweeper` |
| `progress-reminder-daily` | `20260507140900_*.sql` | `.../progress-reminder-cron` |
| `embed-sync-daily` | `20260609100000_cron_schedules.sql` | `.../embed-sync` *(fixed in that file but may not have been applied)* |

### Historical migrations (already ran — URLs only in SQL history, not live objects)

These ran against the old project and are not re-executed. The objects they created either no longer exist (old project is dead) or have been superseded. No action needed:

- `20260519092051`, `20260518085016`, `20260518120120`, `20260518135945`
- `20260529070138`, `20260529070552`
- `20260605040219`, `20260605104916`, `20260605123448`
- `20260519092051` (sheets-lmp trigger — superseded by `20260607030000`)

---

## Fixes Applied

### 1. `sheets-retry-sweeper` — recreated
- **Schedule:** `*/2 * * * *` (every 2 minutes, unchanged)
- **URL:** `https://sgqwnjajvgjcwqergnsr.supabase.co/functions/v1/sheets-retry-sweeper`
- **Auth:** `apikey` + `Authorization: Bearer <anon-key>` (current project)

### 2. `progress-reminder-daily` — recreated
- **Schedule:** `0 8 * * *` (08:00 UTC = 13:30 IST)
  - Was `30 5 * * *` in original migration; updated to 08:00 UTC per G5 spec
- **URL:** `https://sgqwnjajvgjcwqergnsr.supabase.co/functions/v1/progress-reminder-cron`
- **Auth:** `apikey` + `Authorization: Bearer <anon-key>` (current project)

### 3. `embed-sync-daily` — recreated
- **Schedule:** `0 2 * * *` (02:00 UTC)
- **URL:** `https://sgqwnjajvgjcwqergnsr.supabase.co/functions/v1/embed-sync`
- **Auth:** `apikey` + `x-embed-trigger: <token>` fetched live from `_internal_cron_auth`

### 4. `trigger_embed_sync()` — recreated
- DB trigger function attached to: `lmp_processes`, `students`, `poc_profiles`, `mentors`, `alumni_records`, `lmp_daily_logs`
- **URL:** `https://sgqwnjajvgjcwqergnsr.supabase.co/functions/v1/embed-sync`
- **Auth:** `apikey` + `Authorization: Bearer <anon-key>` + `x-embed-trigger: <token>`
- Re-granted `EXECUTE` to `authenticated, service_role`

---

## reconcile-poc-entity-registry Investigation

**Cron command:** `SELECT public.reconcile_poc_entity_registry();` — pure SQL, no HTTP.

**Root cause analysis:**

The function schema is correct:
- `entity_registry` has all referenced columns (`entity_type`, `entity_id`, `display_name`, `email`, `domain`, `source_table`, `source_priority`, `metadata`, `updated_at`)
- `poc_profiles` has all referenced columns (`role_type`, `active_load`, `domain_tags`, `conversion_rate`, `primary_domain`)
- `sheet_sync_events` has all referenced columns (`direction`, `field_count`, `synced_by`)
- `UNIQUE(entity_type, entity_id)` constraint exists for the `ON CONFLICT` clause

**Most likely failure cause:**

Migration `20260605080220_051406a0-2fc1-45f2-8a16-e5753135c59a.sql` ran:
```sql
REVOKE EXECUTE ON FUNCTION public.reconcile_poc_entity_registry() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.reconcile_poc_entity_registry() TO authenticated, service_role;
```

This revoked the default `PUBLIC` grant. If Supabase's pg_cron worker uses a role other than `postgres` (superuser) for the job, it would get `ERROR: permission denied for function reconcile_poc_entity_registry`.

**Fix applied:**
- Added `GRANT EXECUTE ... TO postgres, authenticated, service_role`
- Wrapped the `sheet_sync_events` audit INSERT in its own `EXCEPTION` block so any future schema drift in that table cannot abort an otherwise-successful reconcile
- Recreated the cron job (idempotent unschedule → reschedule)

---

## Verification SQL

Run these in the Supabase SQL editor after applying the migration:

```sql
-- 1. Confirm all cron job commands use the correct project URL
SELECT jobname, schedule, LEFT(command, 120) AS command_preview
FROM cron.job
ORDER BY jobname;

-- 2. Confirm NO job still references the old dead project
SELECT jobname, command
FROM cron.job
WHERE command LIKE '%yhzcheqjzmikeczzoeih%';
-- Expected: 0 rows

-- 3. Check recent run history for all four jobs
SELECT jobid, jobname, start_time, end_time, status, return_message
FROM cron.job_run_details
WHERE jobname IN (
  'sheets-retry-sweeper',
  'progress-reminder-daily',
  'embed-sync-daily',
  'reconcile-poc-entity-registry'
)
ORDER BY start_time DESC
LIMIT 20;

-- 4. Confirm trigger_embed_sync() uses new URL
SELECT prosrc
FROM pg_proc
WHERE proname = 'trigger_embed_sync'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
-- Should contain 'sgqwnjajvgjcwqergnsr' and NOT 'yhzcheqjzmikeczzoeih'
```

---

## Tokens Used

| Token | Project | Role | Expiry |
|-------|---------|------|--------|
| `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...Wp_S69FO8IwZVog5VpPx2uS4ARdH6ZNiRlMEufmZxi4` | `sgqwnjajvgjcwqergnsr` | `anon` | 2095-09-08 |
| ~~`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...QNcI87Zi23Xl94RJrm16h5HCvnFZR2ATCKWnOwVNP8Q`~~ | ~~`yhzcheqjzmikeczzoeih`~~ | ~~`anon`~~ | **DEAD — do not use** |
