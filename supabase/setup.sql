create table if not exists public.teacher_progress (
  client_id text primary key,
  teacher_name text not null default '',
  lesson_title text not null default '',
  subject text not null default '',
  grade text not null default '',
  lesson_count text not null default '',
  design_mode text not null default '',
  active_step integer not null default 0,
  approved_count integer not null default 0,
  total_count integer not null default 44,
  progress_percent integer not null default 0,
  completed boolean not null default false,
  last_heartbeat_at timestamptz,
  last_seen_at timestamptz not null default now(),
  logged_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teacher_progress_last_seen_idx
  on public.teacher_progress(last_seen_at desc);

create index if not exists teacher_progress_teacher_name_idx
  on public.teacher_progress(teacher_name);

alter table public.teacher_progress enable row level security;
revoke all on table public.teacher_progress from anon;
revoke all on table public.teacher_progress from authenticated;
grant all on table public.teacher_progress to service_role;
