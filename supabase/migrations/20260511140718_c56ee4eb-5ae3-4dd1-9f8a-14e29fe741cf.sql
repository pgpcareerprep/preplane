
-- ──────────────────────────────────────────────────────────────────
-- Mirror alumni_records → mentors (source = 'ALU')
-- Lets the unified findMentors() include alumni without app changes.
-- ──────────────────────────────────────────────────────────────────

-- Helper unique index for alumni-mirror rows that have no email,
-- so we can upsert by (sync_source, name) for them.
CREATE UNIQUE INDEX IF NOT EXISTS mentors_alumni_mirror_name_unique
  ON public.mentors (sync_source, name)
  WHERE sync_source = 'alumni_mirror' AND (email IS NULL OR email = '');

-- ── Trigger function: insert/update/delete alumni → mirror row in mentors ──
CREATE OR REPLACE FUNCTION public.mirror_alumni_to_mentors()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.mentors
    WHERE sync_source = 'alumni_mirror'
      AND (
        (OLD.mu_email_id IS NOT NULL AND OLD.mu_email_id <> '' AND lower(email) = lower(OLD.mu_email_id))
        OR ((OLD.mu_email_id IS NULL OR OLD.mu_email_id = '') AND name = OLD.student_name)
      );
    RETURN OLD;
  END IF;

  -- On UPDATE, if email changed, remove the prior mirror row to avoid drift
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.mu_email_id, '') <> COALESCE(NEW.mu_email_id, '') THEN
    DELETE FROM public.mentors
    WHERE sync_source = 'alumni_mirror'
      AND (
        (OLD.mu_email_id IS NOT NULL AND OLD.mu_email_id <> '' AND lower(email) = lower(OLD.mu_email_id))
        OR ((OLD.mu_email_id IS NULL OR OLD.mu_email_id = '') AND name = OLD.student_name)
      );
  END IF;

  v_email := NULLIF(trim(NEW.mu_email_id), '');

  IF v_email IS NOT NULL THEN
    -- Upsert by email (matches partial unique index: email NOT NULL AND email <> '')
    INSERT INTO public.mentors (
      name, email, linkedin, industry, functional_domain,
      designation, company, skill_tags, source, availability, sync_source
    ) VALUES (
      NEW.student_name, v_email, NEW.linkedin_profile, NEW.industry,
      COALESCE(NEW.domain_1, NEW.domain_2),
      NEW.current_role_title, NEW.current_company,
      ARRAY[]::text[], 'ALU', 'available', 'alumni_mirror'
    )
    ON CONFLICT (email) WHERE (email IS NOT NULL AND email <> '')
    DO UPDATE SET
      name              = EXCLUDED.name,
      linkedin          = EXCLUDED.linkedin,
      industry          = EXCLUDED.industry,
      functional_domain = EXCLUDED.functional_domain,
      designation       = EXCLUDED.designation,
      company           = EXCLUDED.company,
      source            = 'ALU',
      sync_source       = 'alumni_mirror',
      updated_at        = now();
  ELSE
    -- No email: upsert by (sync_source, name)
    INSERT INTO public.mentors (
      name, email, linkedin, industry, functional_domain,
      designation, company, skill_tags, source, availability, sync_source
    ) VALUES (
      NEW.student_name, NULL, NEW.linkedin_profile, NEW.industry,
      COALESCE(NEW.domain_1, NEW.domain_2),
      NEW.current_role_title, NEW.current_company,
      ARRAY[]::text[], 'ALU', 'available', 'alumni_mirror'
    )
    ON CONFLICT (sync_source, name)
      WHERE sync_source = 'alumni_mirror' AND (email IS NULL OR email = '')
    DO UPDATE SET
      linkedin          = EXCLUDED.linkedin,
      industry          = EXCLUDED.industry,
      functional_domain = EXCLUDED.functional_domain,
      designation       = EXCLUDED.designation,
      company           = EXCLUDED.company,
      source            = 'ALU',
      updated_at        = now();
  END IF;

  RETURN NEW;
END;
$$;

-- ── Attach trigger ──
DROP TRIGGER IF EXISTS trg_mirror_alumni_to_mentors ON public.alumni_records;
CREATE TRIGGER trg_mirror_alumni_to_mentors
  AFTER INSERT OR UPDATE OR DELETE ON public.alumni_records
  FOR EACH ROW EXECUTE FUNCTION public.mirror_alumni_to_mentors();

-- ── RPC: belt-and-suspenders refresh used by uploadAlumniRecords() ──
CREATE OR REPLACE FUNCTION public.refresh_alumni_mentor_mirror()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- With email
  INSERT INTO public.mentors (
    name, email, linkedin, industry, functional_domain,
    designation, company, skill_tags, source, availability, sync_source
  )
  SELECT
    student_name,
    NULLIF(trim(mu_email_id), ''),
    linkedin_profile,
    industry,
    COALESCE(domain_1, domain_2),
    current_role_title,
    current_company,
    ARRAY[]::text[],
    'ALU',
    'available',
    'alumni_mirror'
  FROM public.alumni_records
  WHERE NULLIF(trim(mu_email_id), '') IS NOT NULL
  ON CONFLICT (email) WHERE (email IS NOT NULL AND email <> '')
  DO UPDATE SET
    name              = EXCLUDED.name,
    linkedin          = EXCLUDED.linkedin,
    industry          = EXCLUDED.industry,
    functional_domain = EXCLUDED.functional_domain,
    designation       = EXCLUDED.designation,
    company           = EXCLUDED.company,
    source            = 'ALU',
    sync_source       = 'alumni_mirror',
    updated_at        = now();

  -- Without email
  INSERT INTO public.mentors (
    name, email, linkedin, industry, functional_domain,
    designation, company, skill_tags, source, availability, sync_source
  )
  SELECT
    student_name, NULL, linkedin_profile, industry,
    COALESCE(domain_1, domain_2),
    current_role_title, current_company,
    ARRAY[]::text[], 'ALU', 'available', 'alumni_mirror'
  FROM public.alumni_records
  WHERE NULLIF(trim(mu_email_id), '') IS NULL
  ON CONFLICT (sync_source, name)
    WHERE sync_source = 'alumni_mirror' AND (email IS NULL OR email = '')
  DO UPDATE SET
    linkedin          = EXCLUDED.linkedin,
    industry          = EXCLUDED.industry,
    functional_domain = EXCLUDED.functional_domain,
    designation       = EXCLUDED.designation,
    company           = EXCLUDED.company,
    source            = 'ALU',
    updated_at        = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_alumni_mentor_mirror() TO authenticated;

-- ── One-time backfill ──
SELECT public.refresh_alumni_mentor_mirror();
