DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='lmp_processes_company_role_key'
  ) THEN
    -- Deduplicate first (keep oldest row per company+role)
    DELETE FROM public.lmp_processes a
    USING public.lmp_processes b
    WHERE a.ctid < b.ctid
      AND lower(trim(a.company)) = lower(trim(b.company))
      AND lower(trim(a.role)) = lower(trim(b.role));

    CREATE UNIQUE INDEX lmp_processes_company_role_key
      ON public.lmp_processes (company, role);
  END IF;
END $$;