-- Headbutt Berserker: cadastro/login e historico por usuario no Supabase
-- Rode este arquivo no Supabase em SQL Editor > New query > Run.

create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  username text not null unique,
  display_name text not null,
  password_hash text not null,
  password_salt text not null
);

create table if not exists public.performance_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  user_id uuid references public.app_users(id) on delete cascade,
  player_name text,

  original_id text,
  phase integer,
  custom_mode boolean default false,
  difficulty_phase integer,
  status text,

  lives_left numeric,
  enemy_hits numeric default 0,
  enemy_hits_needed numeric,
  hits integer default 0,
  misses integer default 0,
  attempts integer default 0,
  accuracy numeric default 0,
  duration numeric default 0,
  avg_reaction numeric,

  actions jsonb default '[]'::jsonb,
  action_breakdown jsonb default '{}'::jsonb,
  raw_data jsonb default '{}'::jsonb
);

-- Migração segura caso a tabela já exista de uma versão anterior.
alter table public.app_users add column if not exists display_name text;
update public.app_users set display_name = username where display_name is null;
alter table public.app_users alter column display_name set not null;

alter table public.performance_history add column if not exists user_id uuid references public.app_users(id) on delete cascade;
alter table public.performance_history add column if not exists player_name text;
alter table public.performance_history add column if not exists original_id text;
alter table public.performance_history add column if not exists phase integer;
alter table public.performance_history add column if not exists custom_mode boolean default false;
alter table public.performance_history add column if not exists difficulty_phase integer;
alter table public.performance_history add column if not exists status text;
alter table public.performance_history add column if not exists lives_left numeric;
alter table public.performance_history add column if not exists enemy_hits numeric default 0;
alter table public.performance_history add column if not exists enemy_hits_needed numeric;
alter table public.performance_history add column if not exists hits integer default 0;
alter table public.performance_history add column if not exists misses integer default 0;
alter table public.performance_history add column if not exists attempts integer default 0;
alter table public.performance_history add column if not exists accuracy numeric default 0;
alter table public.performance_history add column if not exists duration numeric default 0;
alter table public.performance_history add column if not exists avg_reaction numeric;
alter table public.performance_history add column if not exists actions jsonb default '[]'::jsonb;
alter table public.performance_history add column if not exists action_breakdown jsonb default '{}'::jsonb;
alter table public.performance_history add column if not exists raw_data jsonb default '{}'::jsonb;

create index if not exists app_users_username_idx
  on public.app_users (lower(username));

create index if not exists performance_history_user_created_at_idx
  on public.performance_history (user_id, created_at desc);

create index if not exists performance_history_created_at_idx
  on public.performance_history (created_at desc);

create index if not exists performance_history_phase_idx
  on public.performance_history (phase);

create index if not exists performance_history_status_idx
  on public.performance_history (status);

alter table public.app_users enable row level security;
alter table public.performance_history enable row level security;

-- Segurança: o navegador não acessa diretamente estas tabelas.
-- O server.js usa SUPABASE_SERVICE_ROLE_KEY e controla cadastro/login/historico.
drop policy if exists "no_public_read_app_users" on public.app_users;
drop policy if exists "no_public_insert_app_users" on public.app_users;
drop policy if exists "no_public_update_app_users" on public.app_users;
drop policy if exists "no_public_delete_app_users" on public.app_users;
drop policy if exists "no_public_read_performance_history" on public.performance_history;
drop policy if exists "no_public_insert_performance_history" on public.performance_history;
drop policy if exists "no_public_update_performance_history" on public.performance_history;
drop policy if exists "no_public_delete_performance_history" on public.performance_history;

create policy "no_public_read_app_users"
  on public.app_users for select to anon, authenticated using (false);
create policy "no_public_insert_app_users"
  on public.app_users for insert to anon, authenticated with check (false);
create policy "no_public_update_app_users"
  on public.app_users for update to anon, authenticated using (false) with check (false);
create policy "no_public_delete_app_users"
  on public.app_users for delete to anon, authenticated using (false);

create policy "no_public_read_performance_history"
  on public.performance_history for select to anon, authenticated using (false);
create policy "no_public_insert_performance_history"
  on public.performance_history for insert to anon, authenticated with check (false);
create policy "no_public_update_performance_history"
  on public.performance_history for update to anon, authenticated using (false) with check (false);
create policy "no_public_delete_performance_history"
  on public.performance_history for delete to anon, authenticated using (false);
