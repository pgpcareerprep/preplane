DELETE FROM public.field_mapping_registry
WHERE tab_name = 'LMP Tracker' AND sheet_column IN ('Rating', 'JD');

INSERT INTO public.field_mapping_registry (tab_name, sheet_column, app_field, sync_direction, is_mapped, last_verified_at)
VALUES
  ('LMP Tracker', 'Prep Doc Shared',     'prep_doc_shared',    'bidirectional', true, now()),
  ('LMP Tracker', '1:1 mock completed',  'one_to_one_mock',    'bidirectional', true, now()),
  ('LMP Tracker', 'Next Progress Date',  'next_progress_date', 'bidirectional', true, now()),
  ('LMP Tracker', 'Next Progress Type',  'next_progress_type', 'bidirectional', true, now()),
  ('LMP Tracker', 'Converted Name(s)',   'convert_names',      'bidirectional', true, now()),
  ('LMP Tracker', 'Prep Doc Link',       'prep_doc_link',      'read',          true, now()),
  ('LMP Tracker', 'Mentor Rating',       'mentor_rating',      'bidirectional', true, now()),
  ('LMP Tracker', 'JD Upload',           'jd_url',             'bidirectional', true, now());