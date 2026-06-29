-- Verification queries for cohort/program migration.
-- Run after applying 20260701000000 and 20260701000001 migrations.

-- 1. All students should have cohort_id set (C6)
SELECT
  count(*) AS total_students,
  count(*) FILTER (WHERE cohort_id IS NOT NULL) AS with_cohort_id,
  count(*) FILTER (WHERE cohort_id IS NULL) AS missing_cohort_id
FROM public.students;

-- 2. Program resolution coverage
SELECT
  count(*) FILTER (WHERE program_id IS NOT NULL) AS with_program,
  count(*) FILTER (WHERE program_id IS NULL) AS without_program
FROM public.students;

-- 3. lmp_candidates integrity — no orphan student_id
SELECT count(*) AS orphan_candidate_links
FROM public.lmp_candidates c
WHERE c.student_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = c.student_id);

-- 4. Row counts (compare before/after migration snapshots)
SELECT 'students' AS entity, count(*)::bigint AS row_count FROM public.students
UNION ALL
SELECT 'lmp_candidates', count(*)::bigint FROM public.lmp_candidates
UNION ALL
SELECT 'lmp_processes', count(*)::bigint FROM public.lmp_processes
UNION ALL
SELECT 'cohorts', count(*)::bigint FROM public.cohorts
UNION ALL
SELECT 'programs', count(*)::bigint FROM public.programs;

-- 5. C6 cohort and programs exist
SELECT c.code AS cohort_code, p.code AS program_code, p.aliases
FROM public.cohorts c
LEFT JOIN public.programs p ON p.cohort_id = c.id
ORDER BY c.code, p.code;
