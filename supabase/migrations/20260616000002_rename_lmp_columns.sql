-- ─── Rename 5 columns in lmp_processes ──────────────────────────────────────
-- Safe renames: data is preserved, only the column names change.
-- lmp_full_view is refreshed afterward so it exposes the new names.

alter table public.lmp_processes rename column r1_shortlisted to r1_names;
alter table public.lmp_processes rename column r2_shortlisted to r2_names;
alter table public.lmp_processes rename column r3_shortlisted to r3_names;
alter table public.lmp_processes rename column final_convert to final_converted_numbers;
alter table public.lmp_processes rename column convert_names to final_converted_names;

-- ─── Refresh lmp_full_view so its exposed column names update too ────────────
-- After RENAME COLUMN, the view's internal parse tree (OID-based) still works,
-- but the view's own column names in pg_attribute still carry the old labels.
-- CREATE OR REPLACE VIEW using pg_get_viewdef() (which already returns the
-- new names after the rename) forces the view column names to update.
do $$
declare
  v_def text;
begin
  select pg_get_viewdef('public.lmp_full_view'::regclass, true) into v_def;

  if v_def is null then
    raise notice 'lmp_full_view not found – skipping view refresh';
    return;
  end if;

  execute 'create or replace view public.lmp_full_view as ' || v_def;
  raise notice 'lmp_full_view refreshed with renamed columns';

exception when others then
  raise notice 'lmp_full_view refresh failed (%): %', sqlstate, sqlerrm;
end $$;

notify pgrst, 'reload schema';
