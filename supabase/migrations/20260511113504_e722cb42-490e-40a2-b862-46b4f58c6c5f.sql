create table public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  record_key jsonb not null default '{}'::jsonb,
  field_name text not null,
  system_value text,
  sheet_value text,
  sheet_tab text not null,
  sheet_row_number integer,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  resolution text check (resolution in ('keep_system','use_sheet','skip')),
  status text not null default 'open' check (status in ('open','resolved'))
);

create unique index sync_conflicts_open_uniq
  on public.sync_conflicts (table_name, record_id, field_name)
  where status = 'open';

create index sync_conflicts_status_idx on public.sync_conflicts (status, detected_at desc);

alter table public.sync_conflicts enable row level security;

create policy "Admins can manage sync_conflicts"
  on public.sync_conflicts for all
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Authenticated can view sync_conflicts"
  on public.sync_conflicts for select
  to authenticated
  using (true);

create policy "Service role manages sync_conflicts"
  on public.sync_conflicts for all
  to service_role
  using (true) with check (true);