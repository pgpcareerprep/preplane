ALTER TABLE public.mentors ADD COLUMN IF NOT EXISTS years_of_experience numeric;

CREATE OR REPLACE VIEW public.mentors_union_view AS
SELECT id, name, source, email, phone, seniority, linkedin, availability, role, company, layer,
       rating, reviews, outcome_pct, score_role, score_skills, score_company, score_industry,
       score_seniority, overall_score, skill_tags, company_experience, decision_tags, mentor_union,
       remuneration_inr, past_experience, mentorship_history, sync_source, created_at, updated_at,
       designation, industry, functional_domain, rate, currency, payment_type, mentor_code,
       sync_source = 'alumni_mirror'::text AS is_alumni_mirror,
       CASE WHEN sync_source = 'alumni_mirror'::text THEN 'From Alumni'::text
            ELSE 'Mentor Union'::text END AS source_label,
       years_of_experience
FROM public.mentors m;