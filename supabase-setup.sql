-- Bun Bun Manager: Supabase tables for shared data + shared audit log.
-- Safe to run more than once. Paste into Supabase > SQL Editor > New snippet > Run.

create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  device text,
  username text,
  role text,
  type text,
  what text,
  details text,
  page text
);

create index if not exists audit_log_type_id on public.audit_log (type, id desc);

alter table public.app_state enable row level security;
alter table public.audit_log enable row level security;

grant usage on schema public to anon;
grant select, insert, update on public.app_state to anon;
grant select, insert on public.audit_log to anon;

drop policy if exists "demo read state"   on public.app_state;
drop policy if exists "demo insert state" on public.app_state;
drop policy if exists "demo update state" on public.app_state;
drop policy if exists "demo read audit"   on public.audit_log;
drop policy if exists "demo insert audit" on public.audit_log;

create policy "demo read state"   on public.app_state for select to anon using (true);
create policy "demo insert state" on public.app_state for insert to anon with check (true);
create policy "demo update state" on public.app_state for update to anon using (true) with check (true);

create policy "demo read audit"   on public.audit_log for select to anon using (true);
create policy "demo insert audit" on public.audit_log for insert to anon with check (true);
