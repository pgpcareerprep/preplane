DROP TRIGGER IF EXISTS trg_mirror_alumni_to_mentors ON public.alumni_records;
CREATE TRIGGER trg_mirror_alumni_to_mentors
AFTER INSERT OR UPDATE OR DELETE ON public.alumni_records
FOR EACH ROW EXECUTE FUNCTION public.mirror_alumni_to_mentors();

-- Row-by-row backfill via trigger (avoids bulk ON CONFLICT collision)
UPDATE public.alumni_records SET updated_at = now();

SELECT public.refresh_data_source_status('alumni_db');
SELECT public.refresh_data_source_status('mentor_union');