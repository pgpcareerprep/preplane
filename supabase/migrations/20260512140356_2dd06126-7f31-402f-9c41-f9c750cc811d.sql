-- 1) Move dependents from older duplicates onto the surviving row, then drop the old rows.
WITH ranked AS (
  SELECT
    id,
    lower(trim(company)) AS ck,
    lower(trim(role))    AS rk,
    ROW_NUMBER() OVER (
      PARTITION BY lower(trim(company)), lower(trim(role))
      ORDER BY updated_at DESC, created_at DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY lower(trim(company)), lower(trim(role))
      ORDER BY updated_at DESC, created_at DESC
    ) AS keep_id
  FROM public.lmp_processes
  WHERE company IS NOT NULL AND role IS NOT NULL
),
losers AS (
  SELECT id, keep_id FROM ranked WHERE rn > 1
)
UPDATE public.poc_lmp_assignments a
SET lmp_id = l.keep_id
FROM losers l
WHERE a.lmp_id = l.id;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(trim(company)), lower(trim(role))
      ORDER BY updated_at DESC, created_at DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY lower(trim(company)), lower(trim(role))
      ORDER BY updated_at DESC, created_at DESC
    ) AS keep_id
  FROM public.lmp_processes
  WHERE company IS NOT NULL AND role IS NOT NULL
),
losers AS (SELECT id, keep_id FROM ranked WHERE rn > 1)
UPDATE public.lmp_candidates c
SET lmp_id = l.keep_id
FROM losers l
WHERE c.lmp_id = l.id;

WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(trim(company)), lower(trim(role))
      ORDER BY updated_at DESC, created_at DESC
    ) AS rn
  FROM public.lmp_processes
  WHERE company IS NOT NULL AND role IS NOT NULL
)
DELETE FROM public.lmp_processes p
USING ranked r
WHERE p.id = r.id AND r.rn > 1;

-- 2) Unique constraint on normalized company+role.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lmp_processes_company_role_ci
  ON public.lmp_processes (lower(trim(company)), lower(trim(role)));