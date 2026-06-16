-- Canonical POC assignment count view.
-- Counts distinct LMPs per POC from active lmp_poc_links where role is
-- one of prep / support / outreach.  Allocator and admin_owner text columns
-- in lmp_processes are intentionally excluded.
--
-- total_assigned_lmp_count : distinct linked LMPs regardless of process status
-- active_assigned_lmp_count: those same links where the process is still open
-- prep_count, support_count, outreach_count: per-role distinct LMP counts
--
-- A POC holding both prep and support on the same LMP counts as one
-- LMP in total_assigned_lmp_count (DISTINCT lmp_id across roles).

CREATE OR REPLACE VIEW public.poc_lmp_assignment_counts
WITH (security_invoker = true)
AS
SELECT
  pp.id                   AS poc_id,
  pp.name,
  pp.email,
  pp.role_type,
  pp.access_level,
  pp.status               AS poc_status,

  -- All active operational links, regardless of the linked LMP's status
  COUNT(DISTINCT
    CASE WHEN pl.is_active = true
          AND pl.role IN ('prep', 'support', 'outreach')
         THEN pl.lmp_id END
  )::int                  AS total_assigned_lmp_count,

  -- Only links whose LMP is still in an open (non-terminal) status
  COUNT(DISTINCT
    CASE WHEN pl.is_active = true
          AND pl.role IN ('prep', 'support', 'outreach')
          AND lp.status NOT IN (
                'converted', 'not-converted', 'closed',
                'other-reasons', 'dormant'
              )
         THEN pl.lmp_id END
  )::int                  AS active_assigned_lmp_count,

  COUNT(DISTINCT
    CASE WHEN pl.is_active = true AND pl.role = 'prep'
         THEN pl.lmp_id END
  )::int                  AS prep_count,

  COUNT(DISTINCT
    CASE WHEN pl.is_active = true AND pl.role = 'support'
         THEN pl.lmp_id END
  )::int                  AS support_count,

  COUNT(DISTINCT
    CASE WHEN pl.is_active = true AND pl.role = 'outreach'
         THEN pl.lmp_id END
  )::int                  AS outreach_count

FROM  poc_profiles  pp
LEFT  JOIN lmp_poc_links  pl ON pl.poc_id = pp.id
LEFT  JOIN lmp_processes  lp ON lp.id     = pl.lmp_id
GROUP BY pp.id, pp.name, pp.email, pp.role_type, pp.access_level, pp.status;

GRANT SELECT ON public.poc_lmp_assignment_counts TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
