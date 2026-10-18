-- 승인 여부와 로그인 실패 기록 (docs/api/data-model.md 3.1, 3.2)
create table public.archi_profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  approved   boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.archi_login_attempts (
  id           bigint generated always as identity primary key,
  ip           text not null,
  attempted_at timestamptz not null default now()
);
create index archi_login_attempts_ip_attempted_at_idx
  on public.archi_login_attempts (ip, attempted_at desc);

alter table public.archi_profiles enable row level security;
alter table public.archi_login_attempts enable row level security;
