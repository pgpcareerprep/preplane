
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- The cron runs daily at 5:30 UTC = 11:00 IST
-- The edge function itself checks the configured schedule (day/time) from system_settings
SELECT cron.schedule(
  'progress-reminder-daily',
  '30 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://yhzcheqjzmikeczzoeih.supabase.co/functions/v1/progress-reminder-cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloemNoZXFqem1pa2VjenpvZWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NjI2NTUsImV4cCI6MjA5MzUzODY1NX0.QNcI87Zi23Xl94RJrm16h5HCvnFZR2ATCKWnOwVNP8Q"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);
