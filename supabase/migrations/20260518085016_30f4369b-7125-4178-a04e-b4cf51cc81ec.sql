
-- Trigger: on lmp_processes AFTER DELETE, push delete to sheet immediately + enqueue backup
CREATE OR REPLACE FUNCTION public.tg_lmp_process_delete_sheet_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloemNoZXFqem1pa2VjenpvZWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NjI2NTUsImV4cCI6MjA5MzUzODY1NX0.QNcI87Zi23Xl94RJrm16h5HCvnFZR2ATCKWnOwVNP8Q';
  v_payload jsonb;
BEGIN
  v_payload := jsonb_build_object(
    'op', 'delete',
    'tab', 'LMP Tracker',
    'headerRow', 15,
    'id', OLD.id::text,
    'findBy', jsonb_build_object(
      'LMP ID', OLD.id::text,
      'Company', COALESCE(OLD.company, ''),
      'Role', COALESCE(OLD.role, '')
    )
  );

  -- Enqueue a backup row in case the live call below fails or 429s
  INSERT INTO public.sheet_write_queue (tab_name, operation, payload, status, next_retry_at, enqueued_by, last_error)
  VALUES (
    'LMP Tracker',
    'delete',
    v_payload,
    'pending',
    now() + interval '90 seconds',
    'db_trigger',
    'enqueued_by_delete_trigger'
  );

  -- Fire-and-forget instant call via pg_net
  PERFORM net.http_post(
    url := 'https://yhzcheqjzmikeczzoeih.supabase.co/functions/v1/sheets-lmp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon_key,
      'Authorization', 'Bearer ' || v_anon_key,
      'x-sheet-sweeper', '1'
    ),
    body := v_payload
  );

  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  -- Never block a DB delete because of sheet propagation problems
  RAISE WARNING 'tg_lmp_process_delete_sheet_sync failed: %', SQLERRM;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_lmp_process_delete_sheet_sync ON public.lmp_processes;
CREATE TRIGGER trg_lmp_process_delete_sheet_sync
  AFTER DELETE ON public.lmp_processes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_lmp_process_delete_sheet_sync();
