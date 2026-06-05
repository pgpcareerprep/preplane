ALTER TABLE public.feedback_form_templates
ADD COLUMN IF NOT EXISTS theme jsonb NOT NULL DEFAULT '{"mode":"dark","accent":"#F97316","surface":"#141414","text":"#FFFFFF"}'::jsonb;

UPDATE public.feedback_form_templates
SET theme = '{"mode":"light","accent":"#F97316","surface":"#FFFFFF","text":"#0F172A"}'::jsonb
WHERE audience = 'poc' AND theme->>'mode' = 'dark';