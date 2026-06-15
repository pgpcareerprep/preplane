-- ─── 1. Add feedback_by_outreach column to lmp_processes ───────────────────
alter table public.lmp_processes
  add column if not exists feedback_by_outreach text;

-- ─── 2. Create lmp_outreach_feedback history table ─────────────────────────
create table if not exists public.lmp_outreach_feedback (
  id              uuid primary key default gen_random_uuid(),
  lmp_id          uuid not null references public.lmp_processes(id) on delete cascade,
  feedback        text not null,
  created_by      uuid references public.poc_profiles(id),
  created_by_name text,
  created_at      timestamptz not null default now()
);

-- ─── 3. RLS on lmp_outreach_feedback ────────────────────────────────────────
alter table public.lmp_outreach_feedback enable row level security;

-- Admins and allocators: full CRUD
create policy "admin_allocator_full_access_outreach_feedback"
  on public.lmp_outreach_feedback
  for all
  to authenticated
  using (
    exists (
      select 1 from public.poc_profiles p
      where p.user_id = auth.uid()
        and p.role in ('admin', 'allocator')
    )
  )
  with check (
    exists (
      select 1 from public.poc_profiles p
      where p.user_id = auth.uid()
        and p.role in ('admin', 'allocator')
    )
  );

-- POCs assigned to the LMP: view feedback
create policy "poc_view_outreach_feedback"
  on public.lmp_outreach_feedback
  for select
  to authenticated
  using (
    exists (
      select 1 from public.poc_profiles p
      join   public.lmp_processes lp on lp.id = lmp_outreach_feedback.lmp_id
      where  p.user_id = auth.uid()
        and  p.role = 'poc'
        and  (
          lp.prep_poc_id = p.id
          or lp.support_poc_id = p.id
          or p.id = any(lp.outreach_poc_ids)
        )
    )
  );

-- POCs assigned to the LMP: insert feedback
create policy "poc_insert_outreach_feedback"
  on public.lmp_outreach_feedback
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.poc_profiles p
      join   public.lmp_processes lp on lp.id = lmp_outreach_feedback.lmp_id
      where  p.user_id = auth.uid()
        and  p.role = 'poc'
        and  (
          lp.prep_poc_id = p.id
          or lp.support_poc_id = p.id
          or p.id = any(lp.outreach_poc_ids)
        )
    )
  );

-- ─── 4. Refresh lmp_full_view to expose feedback_by_outreach ────────────────
-- We read the current definition and recreate the view with the new column
-- injected. The EXCEPTION block ensures a regex failure won't abort the migration.
do $$
declare
  v_def      text;
  v_new_col  text := ',
    lmp_processes.feedback_by_outreach';
  -- If the view uses an alias "p", the last SELECT column ends before "FROM public.lmp_processes p"
  -- or "FROM public.lmp_processes". We inject just before the top-level FROM.
  -- pg_get_viewdef (pretty=true) returns the canonical SQL for the SELECT body.
  v_new_def  text;
begin
  select pg_get_viewdef('public.lmp_full_view'::regclass, true)
  into   v_def;

  if v_def is null then
    raise notice 'lmp_full_view not found – skipping view update';
    return;
  end if;

  if v_def like '%feedback_by_outreach%' then
    raise notice 'lmp_full_view already contains feedback_by_outreach – skipping';
    return;
  end if;

  -- The canonical form ends the column list with something just before
  -- "   FROM public.lmp_processes". We match the first top-level FROM clause.
  -- Using a greedy match up to "FROM public.lmp_processes" handles aliases too.
  v_new_def := regexp_replace(
    v_def,
    '(\n\s+FROM\s+public\.lmp_processes)',
    v_new_col || E'\1',
    'i'
  );

  execute 'create or replace view public.lmp_full_view as ' || v_new_def;
  raise notice 'lmp_full_view updated with feedback_by_outreach';

exception when others then
  raise notice 'Could not auto-update lmp_full_view (%), run manually: alter view public.lmp_full_view add column feedback_by_outreach', sqlerrm;
end $$;
