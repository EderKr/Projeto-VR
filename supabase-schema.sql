create table if not exists public.performance_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

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

create index if not exists performance_history_created_at_idx
on public.performance_history (created_at desc);

create index if not exists performance_history_phase_idx
on public.performance_history (phase);

create index if not exists performance_history_status_idx
on public.performance_history (status);
