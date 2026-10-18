-- 컬렉션과 앱의 중심 자원 (docs/api/data-model.md 3.6, 3.7)
create table public.archi_collections (
  user_id    uuid not null references public.folio_users (id) on delete cascade,
  key        text not null,
  name       text not null,
  parent_key text,
  primary key (user_id, key)
);

create table public.papers (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  item_key        text,
  item_version    bigint,
  s2_paper_id     text,
  title           text,
  authors         jsonb not null default '[]',
  year            text,
  collections     jsonb not null default '[]',
  attachment_key  text,
  attachment_type text check (attachment_type in ('pdf', 'html')),
  has_memo        boolean not null default false,
  synced_at       timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (user_id, item_key),
  check (item_key is not null or s2_paper_id is not null),
  check ((attachment_key is null) = (attachment_type is null))
);
create index papers_user_synced_at_idx on public.papers (user_id, synced_at desc, id);
create index papers_user_title_idx on public.papers (user_id, title);
create index papers_collections_idx on public.papers using gin (collections jsonb_path_ops);
create index papers_user_s2_paper_id_idx on public.papers (user_id, s2_paper_id) where s2_paper_id is not null;

alter table public.archi_collections enable row level security;
alter table public.papers enable row level security;
