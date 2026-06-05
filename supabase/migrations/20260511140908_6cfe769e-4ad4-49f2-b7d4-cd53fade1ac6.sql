
CREATE OR REPLACE FUNCTION public.mirror_alumni_to_mentors()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_skills text[];
  v_haystack text;
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

  v_haystack := lower(
    COALESCE(NEW.current_role_title,'') || ' ' ||
    COALESCE(NEW.domain_1,'') || ' ' ||
    COALESCE(NEW.domain_2,'') || ' ' ||
    COALESCE(NEW.industry,'')
  );

  SELECT COALESCE(array_agg(DISTINCT kw), ARRAY[]::text[])
    INTO v_skills
  FROM unnest(ARRAY[
    'product management','product strategy','growth','analytics','marketing',
    'branding','seo','sem','performance marketing','b2b','b2c','saas',
    'fintech','edtech','healthtech','ecommerce','go-to-market','gtm',
    'customer success','data analysis','market research','ux','ui','figma',
    'design','engineering','python','sql','machine learning','finance',
    'accounting','fundraising','operations','supply chain','sales',
    'business development','consulting','strategy','leadership'
  ]) AS kw
  WHERE v_haystack LIKE '%' || kw || '%';

  IF v_email IS NOT NULL THEN
    INSERT INTO public.mentors (
      name, email, linkedin, industry, functional_domain,
      designation, role, company, skill_tags, source, availability, sync_source
    ) VALUES (
      NEW.student_name, v_email, NEW.linkedin_profile, NEW.industry,
      COALESCE(NEW.domain_1, NEW.domain_2),
      NEW.current_role_title, NEW.current_role_title, NEW.current_company,
      v_skills, 'ALU', 'available', 'alumni_mirror'
    )
    ON CONFLICT (email) WHERE (email IS NOT NULL AND email <> '')
    DO UPDATE SET
      name              = EXCLUDED.name,
      linkedin          = EXCLUDED.linkedin,
      industry          = EXCLUDED.industry,
      functional_domain = EXCLUDED.functional_domain,
      designation       = EXCLUDED.designation,
      role              = EXCLUDED.role,
      company           = EXCLUDED.company,
      skill_tags        = EXCLUDED.skill_tags,
      source            = 'ALU',
      sync_source       = 'alumni_mirror',
      updated_at        = now();
  ELSE
    INSERT INTO public.mentors (
      name, email, linkedin, industry, functional_domain,
      designation, role, company, skill_tags, source, availability, sync_source
    ) VALUES (
      NEW.student_name, NULL, NEW.linkedin_profile, NEW.industry,
      COALESCE(NEW.domain_1, NEW.domain_2),
      NEW.current_role_title, NEW.current_role_title, NEW.current_company,
      v_skills, 'ALU', 'available', 'alumni_mirror'
    )
    ON CONFLICT (sync_source, name)
      WHERE sync_source = 'alumni_mirror' AND (email IS NULL OR email = '')
    DO UPDATE SET
      linkedin          = EXCLUDED.linkedin,
      industry          = EXCLUDED.industry,
      functional_domain = EXCLUDED.functional_domain,
      designation       = EXCLUDED.designation,
      role              = EXCLUDED.role,
      company           = EXCLUDED.company,
      skill_tags        = EXCLUDED.skill_tags,
      source            = 'ALU',
      updated_at        = now();
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_alumni_mentor_mirror()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  WITH kw_list AS (
    SELECT unnest(ARRAY[
      'product management','product strategy','growth','analytics','marketing',
      'branding','seo','sem','performance marketing','b2b','b2c','saas',
      'fintech','edtech','healthtech','ecommerce','go-to-market','gtm',
      'customer success','data analysis','market research','ux','ui','figma',
      'design','engineering','python','sql','machine learning','finance',
      'accounting','fundraising','operations','supply chain','sales',
      'business development','consulting','strategy','leadership'
    ]) AS kw
  ),
  alu_skills AS (
    SELECT a.id,
      COALESCE((
        SELECT array_agg(DISTINCT k.kw)
        FROM kw_list k
        WHERE lower(
          COALESCE(a.current_role_title,'') || ' ' ||
          COALESCE(a.domain_1,'') || ' ' ||
          COALESCE(a.domain_2,'') || ' ' ||
          COALESCE(a.industry,'')
        ) LIKE '%' || k.kw || '%'
      ), ARRAY[]::text[]) AS skills
    FROM public.alumni_records a
  )
  -- With email
  INSERT INTO public.mentors (
    name, email, linkedin, industry, functional_domain,
    designation, role, company, skill_tags, source, availability, sync_source
  )
  SELECT
    a.student_name,
    NULLIF(trim(a.mu_email_id), ''),
    a.linkedin_profile,
    a.industry,
    COALESCE(a.domain_1, a.domain_2),
    a.current_role_title,
    a.current_role_title,
    a.current_company,
    s.skills,
    'ALU', 'available', 'alumni_mirror'
  FROM public.alumni_records a
  JOIN alu_skills s ON s.id = a.id
  WHERE NULLIF(trim(a.mu_email_id), '') IS NOT NULL
  ON CONFLICT (email) WHERE (email IS NOT NULL AND email <> '')
  DO UPDATE SET
    name              = EXCLUDED.name,
    linkedin          = EXCLUDED.linkedin,
    industry          = EXCLUDED.industry,
    functional_domain = EXCLUDED.functional_domain,
    designation       = EXCLUDED.designation,
    role              = EXCLUDED.role,
    company           = EXCLUDED.company,
    skill_tags        = EXCLUDED.skill_tags,
    source            = 'ALU',
    sync_source       = 'alumni_mirror',
    updated_at        = now();

  WITH kw_list AS (
    SELECT unnest(ARRAY[
      'product management','product strategy','growth','analytics','marketing',
      'branding','seo','sem','performance marketing','b2b','b2c','saas',
      'fintech','edtech','healthtech','ecommerce','go-to-market','gtm',
      'customer success','data analysis','market research','ux','ui','figma',
      'design','engineering','python','sql','machine learning','finance',
      'accounting','fundraising','operations','supply chain','sales',
      'business development','consulting','strategy','leadership'
    ]) AS kw
  ),
  alu_skills AS (
    SELECT a.id,
      COALESCE((
        SELECT array_agg(DISTINCT k.kw)
        FROM kw_list k
        WHERE lower(
          COALESCE(a.current_role_title,'') || ' ' ||
          COALESCE(a.domain_1,'') || ' ' ||
          COALESCE(a.domain_2,'') || ' ' ||
          COALESCE(a.industry,'')
        ) LIKE '%' || k.kw || '%'
      ), ARRAY[]::text[]) AS skills
    FROM public.alumni_records a
  )
  INSERT INTO public.mentors (
    name, email, linkedin, industry, functional_domain,
    designation, role, company, skill_tags, source, availability, sync_source
  )
  SELECT
    a.student_name, NULL, a.linkedin_profile, a.industry,
    COALESCE(a.domain_1, a.domain_2),
    a.current_role_title, a.current_role_title, a.current_company,
    s.skills, 'ALU', 'available', 'alumni_mirror'
  FROM public.alumni_records a
  JOIN alu_skills s ON s.id = a.id
  WHERE NULLIF(trim(a.mu_email_id), '') IS NULL
  ON CONFLICT (sync_source, name)
    WHERE sync_source = 'alumni_mirror' AND (email IS NULL OR email = '')
  DO UPDATE SET
    linkedin          = EXCLUDED.linkedin,
    industry          = EXCLUDED.industry,
    functional_domain = EXCLUDED.functional_domain,
    designation       = EXCLUDED.designation,
    role              = EXCLUDED.role,
    company           = EXCLUDED.company,
    skill_tags        = EXCLUDED.skill_tags,
    source            = 'ALU',
    updated_at        = now();
END;
$function$;

SELECT public.refresh_alumni_mentor_mirror();
