-- Backfill approved_user_id from profile_id where missing (data hygiene only).
-- profile_id is the canonical link to profiles.id; approved_user_id is kept for legacy reads.
UPDATE public.poc_profiles
SET approved_user_id = profile_id
WHERE approved_user_id IS NULL
  AND profile_id IS NOT NULL;

-- Outreach POCs are informational only — clear operational capacity threshold.
UPDATE public.poc_profiles
SET max_threshold = NULL
WHERE role_type IN ('outreach_poc', 'outreach')
  AND max_threshold IS NOT NULL;
