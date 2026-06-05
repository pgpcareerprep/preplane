ALTER TABLE public.copilot_turns
  ADD COLUMN IF NOT EXISTS scope_summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scope_applied_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scope_missing_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scope_broadened_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_copilot_turns_scope_summary
  ON public.copilot_turns USING GIN (scope_summary);