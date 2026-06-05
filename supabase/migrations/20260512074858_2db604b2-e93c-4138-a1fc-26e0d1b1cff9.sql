ALTER TABLE public.poc_registry
  ADD COLUMN IF NOT EXISTS access_level text NOT NULL DEFAULT 'poc';

ALTER TABLE public.poc_registry
  DROP CONSTRAINT IF EXISTS poc_registry_access_level_check;
ALTER TABLE public.poc_registry
  ADD CONSTRAINT poc_registry_access_level_check
  CHECK (access_level IN ('admin','allocator','poc'));

ALTER TABLE public.poc_profiles
  ADD COLUMN IF NOT EXISTS access_level text NOT NULL DEFAULT 'poc';

ALTER TABLE public.poc_profiles
  DROP CONSTRAINT IF EXISTS poc_profiles_access_level_check;
ALTER TABLE public.poc_profiles
  ADD CONSTRAINT poc_profiles_access_level_check
  CHECK (access_level IN ('admin','allocator','poc'));

CREATE INDEX IF NOT EXISTS idx_poc_registry_type_access
  ON public.poc_registry (poc_type, access_level);

CREATE INDEX IF NOT EXISTS idx_poc_profiles_role_access
  ON public.poc_profiles (role_type, access_level);
