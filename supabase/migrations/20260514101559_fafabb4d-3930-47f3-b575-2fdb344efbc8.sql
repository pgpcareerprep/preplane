CREATE TABLE public.feedback_form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience text NOT NULL UNIQUE CHECK (audience IN ('student','poc')),
  title text NOT NULL DEFAULT '',
  subtitle text NOT NULL DEFAULT '',
  submit_label text NOT NULL DEFAULT 'Submit feedback',
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE public.feedback_form_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read feedback templates"
  ON public.feedback_form_templates FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "Admins can manage feedback templates"
  ON public.feedback_form_templates FOR ALL
  TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Authenticated can update feedback templates"
  ON public.feedback_form_templates FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER feedback_form_templates_updated_at
  BEFORE UPDATE ON public.feedback_form_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.feedback_form_templates (audience, title, subtitle, submit_label, fields) VALUES
('student', 'How was your session?', 'Takes 2 minutes · helps us match you better', 'Submit feedback',
 '[
   {"id":"vibe","type":"vibe","label":"Overall vibe","required":true,
    "options":[{"value":1,"emoji":"😞","label":"Not great"},{"value":2,"emoji":"😐","label":"Okay"},{"value":3,"emoji":"🙂","label":"Good"},{"value":4,"emoji":"😄","label":"Great"},{"value":5,"emoji":"🤩","label":"Excellent"}]},
   {"id":"mentor_ratings","type":"rating_group","label":"Rate your mentor","required":true,
    "options":[{"key":"clarity","label":"Clarity of explanations"},{"key":"responsiveness","label":"Responsiveness & engagement"},{"key":"relevance","label":"Relevance to my prep goals"}]},
   {"id":"comments","type":"textarea","label":"Any comments?","required":false,"placeholder":"Share anything about the session — what went well, what could be better, or anything else on your mind."},
   {"id":"recommend","type":"toggle","label":"Would recommend this mentor","required":false},
   {"id":"confirm","type":"confirm","label":"I confirm this session took place and the feedback is genuine","required":true}
 ]'::jsonb),
('poc', 'Session Feedback', 'Rate this session to generate the student link', 'Submit Feedback & Generate Student Link',
 '[
   {"id":"overall","type":"rating","label":"Overall Mentor Rating","required":true},
   {"id":"quality","type":"rating","label":"Session Quality","required":true},
   {"id":"responsiveness","type":"rating","label":"Mentor Responsiveness","required":true},
   {"id":"relevance","type":"rating","label":"Relevance to Goals","required":true},
   {"id":"recommend","type":"toggle","label":"Would Recommend","required":true},
   {"id":"strengths","type":"textarea","label":"Mentor Strengths","required":true,"minChars":50},
   {"id":"improvement","type":"textarea","label":"Areas for Improvement","required":false,"placeholder":"Optional"},
   {"id":"notes","type":"textarea","label":"Session Notes / Summary","required":true,"minChars":100},
   {"id":"outcome","type":"select","label":"Session Outcome","required":true,
    "options":[{"value":"Goal Met","label":"Goal Met"},{"value":"Partial","label":"Partial"},{"value":"Not Met","label":"Not Met"}]},
   {"id":"confirm","type":"confirm","label":"I confirm this session is complete","required":true}
 ]'::jsonb);