
INSERT INTO public.lmp_daily_logs (lmp_id, entry_type, text, author_name, chips, metadata, created_at)
SELECT
  h.lmp_id,
  'progress',
  h.progress_text,
  COALESCE(h.created_by, 'System'),
  CASE WHEN h.reminder_type_snapshot IS NOT NULL
       THEN ARRAY[h.reminder_type_snapshot]
       ELSE '{}'::text[] END,
  jsonb_build_object(
    'progress_type', h.progress_type,
    'next_progress_date', h.next_progress_date_snapshot,
    'source', 'history_backfill'
  ),
  h.created_at
FROM public.lmp_progress_history h
WHERE NOT EXISTS (
  SELECT 1 FROM public.lmp_daily_logs d
  WHERE d.lmp_id = h.lmp_id
    AND d.entry_type = 'progress'
    AND d.created_at = h.created_at
    AND COALESCE(d.text,'') = COALESCE(h.progress_text,'')
);
