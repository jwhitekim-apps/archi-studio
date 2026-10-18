-- 번역 이력과 논문 분석 (docs/api/data-model.md 3.8, 3.9)
create table public.archi_translations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  paper_id        uuid references public.papers (id) on delete cascade,
  source_text     text not null,
  translated_text text not null,
  type            text not null check (type in ('word', 'sentence')),
  created_at      timestamptz not null default now()
);
create index archi_translations_user_created_at_idx on public.archi_translations (user_id, created_at desc);
-- 원문 전체를 B-tree에 넣으면 5,000자 원문이 인덱스 행 크기 한도(약 2.7KB)를 넘는다. 해시로 후보를 좁히고 원문 일치는 조회 쪽에서 함께 확인한다.
create index archi_translations_user_source_hash_idx on public.archi_translations (user_id, md5(source_text));
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
