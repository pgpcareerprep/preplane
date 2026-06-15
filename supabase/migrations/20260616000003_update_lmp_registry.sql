-- ─── Replace LMP Tracker field_mapping_registry ─────────────────────────────
-- Removes stale entries (old column names: r1_shortlisted, r2_shortlisted,
-- r3_shortlisted, final_convert, convert_names, prep_doc, and obsolete sheet
-- headers: R1 Shortlisted, R2 Shortlisted, R3 Shortlisted, Offer,
-- Converted Name(s)).
-- Inserts current 33-column mapping (A–AG) plus jd_url which is still wired
-- in DB_TO_SHEET.

DELETE FROM public.field_mapping_registry WHERE tab_name = 'LMP Tracker';

INSERT INTO public.field_mapping_registry
  (tab_name, sheet_column, app_field, sync_direction, is_mapped, notes, last_verified_at)
VALUES
  ('LMP Tracker', 'Date',                          'date',                    'db_to_sheet',   true, 'Col A',                                                    now()),
  ('LMP Tracker', 'Company',                       'company',                 'db_to_sheet',   true, 'Col B',                                                    now()),
  ('LMP Tracker', 'Role',                          'role',                    'db_to_sheet',   true, 'Col C',                                                    now()),
  ('LMP Tracker', 'Domain',                        'domain_raw',              'db_to_sheet',   true, 'Col D',                                                    now()),
  ('LMP Tracker', 'Status',                        'status',                  'db_to_sheet',   true, 'Col E',                                                    now()),
  ('LMP Tracker', 'Type',                          'type',                    'db_to_sheet',   true, 'Col F',                                                    now()),
  ('LMP Tracker', 'Daily Progress',                'daily_progress',          'db_to_sheet',   true, 'Col G',                                                    now()),
  ('LMP Tracker', 'Prep Doc Shared',               'prep_doc_shared',         'db_to_sheet',   true, 'Col H',                                                    now()),
  ('LMP Tracker', 'Mentor Aligned',                'mentor_aligned',          'db_to_sheet',   true, 'Col I',                                                    now()),
  ('LMP Tracker', 'Assignment Review',             'assignment_review',       'db_to_sheet',   true, 'Col J',                                                    now()),
  ('LMP Tracker', '1:1 mock completed',            'one_to_one_mock',         'db_to_sheet',   true, 'Col K',                                                    now()),
  ('LMP Tracker', 'Next Progress Date',            'next_progress_date',      'db_to_sheet',   true, 'Col L',                                                    now()),
  ('LMP Tracker', 'Next Progress Type',            'next_progress_type',      'db_to_sheet',   true, 'Col M',                                                    now()),
  ('LMP Tracker', 'Shortlisted (Pool) - Number',  'pool_count',              'computed',      true, 'Col N – lmp_full_view r1_count',                           now()),
  ('LMP Tracker', 'Shortlisted (Pool) - Name(s)', 'pool_names',              'computed',      true, 'Col O – lmp_processes.r1_names via calcMap',               now()),
  ('LMP Tracker', 'R1 - Numbers',                 'r1_count',                'computed',      true, 'Col P – lmp_full_view r2_count',                           now()),
  ('LMP Tracker', 'R1 - Names',                   'r1_names',                'db_to_sheet',   true, 'Col Q',                                                    now()),
  ('LMP Tracker', 'R2 - Numbers',                 'r2_count',                'computed',      true, 'Col R – lmp_full_view r3_count',                           now()),
  ('LMP Tracker', 'R2 - Names',                   'r2_names',                'db_to_sheet',   true, 'Col S',                                                    now()),
  ('LMP Tracker', 'R3 - Numbers',                 'r3_count',                'computed',      true, 'Col T – lmp_full_view offer_count',                        now()),
  ('LMP Tracker', 'R3 - Names',                   'r3_names',                'db_to_sheet',   true, 'Col U',                                                    now()),
  ('LMP Tracker', 'Final Converted Numbers',      'final_converted_numbers', 'db_to_sheet',   true, 'Col V',                                                    now()),
  ('LMP Tracker', 'Converted Names',              'final_converted_names',   'db_to_sheet',   true, 'Col W',                                                    now()),
  ('LMP Tracker', 'Prep Doc Link',                'prep_doc_link',           'db_to_sheet',   true, 'Col X',                                                    now()),
  ('LMP Tracker', 'Prep POC',                     'prep_poc',                'db_to_sheet',   true, 'Col Y – names resolved from poc_profiles',                 now()),
  ('LMP Tracker', 'Support POC',                  'support_poc',             'db_to_sheet',   true, 'Col Z – names resolved from poc_profiles',                 now()),
  ('LMP Tracker', 'Outreach POC',                 'outreach_poc',            'db_to_sheet',   true, 'Col AA – names resolved from poc_profiles',                now()),
  ('LMP Tracker', 'Closing Date',                 'closing_date',            'db_to_sheet',   true, 'Col AB',                                                   now()),
  ('LMP Tracker', 'Mentor Selected',              'mentor_selected',         'computed',      true, 'Col AC – resolved from lmp_mentors',                       now()),
  ('LMP Tracker', 'Mentor Rating',                'mentor_rating',           'computed',      true, 'Col AD – avg from mentor_session_feedback',                now()),
  ('LMP Tracker', 'Feedback by outreach',         'feedback_by_outreach',    'db_to_sheet',   true, 'Col AE',                                                   now()),
  ('LMP Tracker', 'Comment',                      'comments',                'bidirectional', true, 'Col AF – sheet edits sync back to DB',                     now()),
  ('LMP Tracker', 'LMP ID',                       'lmp_code',                'db_to_sheet',   true, 'Col AG',                                                   now()),
  -- jd_url is still wired in DB_TO_SHEET; keep it declared so CodeMapAudit
  -- does not flag it as undeclared.
  ('LMP Tracker', 'JD',                           'jd_url',                  'db_to_sheet',   true, 'JD link attached to LMP process',                          now());
