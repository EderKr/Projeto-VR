create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  username text not null unique,
  display_name text not null,
  email text,
  age integer,
  sex text not null default 'male',
  role text not null default 'user',
  gender text not null default 'male',
  password_hash text not null,
  password_salt text not null
);

create table if not exists invite_tokens (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  token text not null unique,
  type text not null default 'standard',
  created_by uuid references app_users(id) on delete set null,
  used_by uuid references app_users(id) on delete set null,
  used_at timestamptz
);

create table if not exists performance_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references app_users(id) on delete cascade,
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

create index if not exists app_users_username_idx
  on app_users (lower(username));

create unique index if not exists app_users_email_unique_idx
  on app_users (lower(email))
  where email is not null;

create index if not exists invite_tokens_created_at_idx
  on invite_tokens (created_at desc);

create index if not exists performance_history_user_created_at_idx
  on performance_history (user_id, created_at desc);

create index if not exists performance_history_created_at_idx
  on performance_history (created_at desc);

create index if not exists performance_history_phase_idx
  on performance_history (phase);

create index if not exists performance_history_status_idx
  on performance_history (status);
