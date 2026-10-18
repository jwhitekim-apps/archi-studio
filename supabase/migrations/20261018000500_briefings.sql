-- 브리핑 기록 (docs/api/data-model.md 3.10)
create table public.archi_briefings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       date not null,
  summary    text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
create index archi_briefings_user_date_idx on public.archi_briefings (user_id, date desc);

create table public.archi_briefing_papers (
  briefing_id uuid not null references public.archi_briefings (id) on delete cascade,
  paper_id    uuid not null references public.papers (id) on delete cascade,
  primary key (briefing_id, paper_id)
);

alter table public.archi_briefings enable row level security;
alter table public.archi_briefing_papers enable row level security;
