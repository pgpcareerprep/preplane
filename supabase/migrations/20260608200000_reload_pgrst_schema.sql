-- Force PostgREST to reload its schema cache so newly-added columns
-- (completed_at, student_feedback_token) are immediately visible without
-- waiting for the 10-minute auto-refresh window.
NOTIFY pgrst, 'reload schema';
