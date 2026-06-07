-- Add duration_min column to sessions table if it was created before this column existed.
-- The original CREATE TABLE IF NOT EXISTS migration silently skipped adding the column
-- when the table was already present from an earlier migration.
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS duration_min integer;
