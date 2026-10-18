-- 번역 이력과 논문 분석 (docs/api/data-model.md 3.8, 3.9)
create table public.archi_translations (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  paper_id        uuid references public.papers (id) on delete cascade,
  source_text     text not null,
  translated_text text not null,
  type            text not null check (type in ('word', 'sentence')),
  created_at      timestamptz not null default now()
);
create index archi_translations_user_created_at_idx on public.archi_translations (user_id, created_at desc);
create index archi_translations_user_source_text_idx on public.archi_translations (user_id, source_text);
create index archi_translations_paper_id_idx on public.archi_translations (paper_id) where paper_id is not null;

create table public.archi_analyses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  paper_id   uuid not null references public.papers (id) on delete cascade,
  result     jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, paper_id)
);

alter table public.archi_translations enable row level security;
alter table public.archi_analyses enable row level security;
