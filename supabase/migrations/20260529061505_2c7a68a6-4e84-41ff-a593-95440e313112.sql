
-- Make LMP Tracker mapping unidirectional (DB → Sheet) and canonical to columns A–AA.
DELETE FROM public.field_mapping_registry WHERE tab_name = 'LMP Tracker';

INSERT INTO public.field_mapping_registry
  (tab_name, sheet_column, app_field, sync_direction, is_mapped, notes, last_verified_at)
VALUES
  ('LMP Tracker','Date','date','write',true,'Col A',now()),
  ('LMP Tracker','Company','company','write',true,'Col B',now()),
  ('LMP Tracker','Role','role','write',true,'Col C',now()),
  ('LMP Tracker','Domain','domain_raw','write',true,'Col D',now()),
  ('LMP Tracker','Status','status','write',true,'Col E',now()),
  ('LMP Tracker','Type','type','write',true,'Col F',now()),
  ('LMP Tracker','Daily Progress','daily_progress','write',true,'Col G',now()),
  ('LMP Tracker','Prep Doc Shared','prep_doc_shared','write',true,'Col H (bool → Yes/blank)',now()),
  ('LMP Tracker','Mentor Aligned','mentor_aligned','write',true,'Col I',now()),
  ('LMP Tracker','Assignment Review','assignment_review','write',true,'Col J',now()),
  ('LMP Tracker','1:1 mock completed','one_to_one_mock','write',true,'Col K',now()),
  ('LMP Tracker','Next Progress Date','next_progress_date','write',true,'Col L',now()),
  ('LMP Tracker','Next Progress Type','next_progress_type','write',true,'Col M',now()),
  ('LMP Tracker','R1 Shortlisted','r1_shortlisted','write',true,'Col N (calculated from lmp_candidates)',now()),
  ('LMP Tracker','R2 Shortlisted','r2_shortlisted','write',true,'Col O (calculated)',now()),
  ('LMP Tracker','R3 Shortlisted','r3_shortlisted','write',true,'Col P (calculated)',now()),
  ('LMP Tracker','Final Convert','final_convert','write',true,'Col Q',now()),
  ('LMP Tracker','Converted Name(s)','convert_names','write',true,'Col R',now()),
  ('LMP Tracker','Prep Doc Link','prep_doc_link','write',true,'Col S',now()),
  ('LMP Tracker','Prep POC','prep_poc','write',true,'Col T',now()),
  ('LMP Tracker','Support POC','support_poc','write',true,'Col U',now()),
  ('LMP Tracker','Outreach POC','outreach_poc','write',true,'Col V',now()),
  ('LMP Tracker','Closing Date','closing_date','write',true,'Col W',now()),
  ('LMP Tracker','Mentor Selected','mentor_selected','write',true,'Col X',now()),
  ('LMP Tracker','Mentor Rating','mentor_rating','write',true,'Col Y (derived from sessions)',now()),
  ('LMP Tracker','JD','jd_url','write',true,'Col Z',now()),
  ('LMP Tracker','LMP ID','lmp_code','write',true,'Col AA',now());
