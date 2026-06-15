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
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'allocator'::public.app_role)
  )
  with check (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'allocator'::public.app_role)
  );

-- POCs assigned to the LMP: view feedback
create policy "poc_view_outreach_feedback"
  on public.lmp_outreach_feedback
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'poc'::public.app_role)
    and public.is_assigned_to_lmp(lmp_id)
  );

-- POCs assigned to the LMP: insert feedback
create policy "poc_insert_outreach_feedback"
  on public.lmp_outreach_feedback
  for insert
  to authenticated
  with check (
    public.has_role(auth.uid(), 'poc'::public.app_role)
    and public.is_assigned_to_lmp(lmp_id)
  );

-- ─── 4. Refresh lmp_full_view to expose feedback_by_outreach ────────────────
-- Read the current definition dynamically so we don't hard-code a possibly
-- stale view body. Injects the new column just before the top-level FROM.
do $$
declare
  v_def      text;
  v_new_col  text := ',
    lmp_processes.feedback_by_outreach';
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

  v_new_def := regexp_replace(
    v_def,
    '(\n\s+FROM\s+public\.lmp_processes)',
    v_new_col || E'\1',
    'i'
  );

  execute 'create or replace view public.lmp_full_view as ' || v_new_def;
  raise notice 'lmp_full_view updated with feedback_by_outreach';

exception when others then
  raise notice 'Could not auto-update lmp_full_view (%), please add feedback_by_outreach manually', sqlerrm;
end $$;

notify pgrst, 'reload schema';
