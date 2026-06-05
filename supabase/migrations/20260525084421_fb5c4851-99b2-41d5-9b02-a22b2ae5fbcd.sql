-- Unique email indexes (case-insensitive) for ON CONFLICT targets
create unique index if not exists profiles_email_lower_key
  on public.profiles (lower(email)) where email is not null and email <> '';
create unique index if not exists poc_profiles_email_lower_key
  on public.poc_profiles (lower(email)) where email is not null and email <> '';

-- poc_profiles -> profiles
create or replace function public.sync_poc_to_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if (tg_op = 'DELETE') then
    if old.email is not null and old.email <> '' then
      delete from public.profiles where lower(email) = lower(old.email);
    end if;
    return old;
  end if;

  v_email := nullif(trim(new.email), '');
  if v_email is null then return new; end if;

  insert into public.profiles (display_name, email, role, access_status, is_active)
  values (new.name, v_email, 'poc', 'approved', coalesce(new.status, 'active') = 'active')
  on conflict (lower(email)) where email is not null and email <> ''
  do update set
    display_name = excluded.display_name,
    is_active    = (coalesce(new.status,'active') = 'active'),
    updated_at   = now();
  return new;
end $$;

-- profiles -> poc_profiles
create or replace function public.sync_profile_to_poc()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if (tg_op = 'DELETE') then
    if old.email is not null and old.email <> '' then
      delete from public.poc_profiles where lower(email) = lower(old.email);
    end if;
    return old;
  end if;

  v_email := nullif(trim(new.email), '');
  if v_email is null then return new; end if;

  insert into public.poc_profiles (name, email, role_type, access_level, status)
  values (new.display_name, v_email, 'prep_poc', 'poc',
          case when coalesce(new.is_active, true) then 'active' else 'inactive' end)
  on conflict (lower(email)) where email is not null and email <> ''
  do update set
    name       = excluded.name,
    status     = case when coalesce(new.is_active, true) then 'active' else 'inactive' end,
    updated_at = now();
  return new;
end $$;

drop trigger if exists trg_sync_poc_to_profile on public.poc_profiles;
create trigger trg_sync_poc_to_profile
  after insert or update or delete on public.poc_profiles
  for each row when (pg_trigger_depth() < 1)
  execute function public.sync_poc_to_profile();

drop trigger if exists trg_sync_profile_to_poc on public.profiles;
create trigger trg_sync_profile_to_poc
  after insert or update or delete on public.profiles
  for each row when (pg_trigger_depth() < 1)
  execute function public.sync_profile_to_poc();

-- Backfill
insert into public.poc_profiles (name, email, role_type, access_level, status)
select p.display_name, p.email, 'prep_poc', 'poc',
       case when coalesce(p.is_active, true) then 'active' else 'inactive' end
from public.profiles p
where p.email is not null and p.email <> ''
  and not exists (select 1 from public.poc_profiles pp where lower(pp.email) = lower(p.email));

insert into public.profiles (display_name, email, role, access_status, is_active)
select pp.name, pp.email, 'poc', 'approved', pp.status = 'active'
from public.poc_profiles pp
where pp.email is not null and pp.email <> ''
  and not exists (select 1 from public.profiles p where lower(p.email) = lower(pp.email));