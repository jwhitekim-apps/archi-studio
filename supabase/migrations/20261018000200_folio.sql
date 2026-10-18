-- Zotero 연결과 메타데이터 캐시 (docs/api/data-model.md 3.3 ~ 3.5)
create table public.folio_users (
  id               uuid primary key references auth.users (id) on delete cascade,
  zotero_user_id   text unique,
  zotero_username  text not null default '',
  zotero_api_key   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.folio_sync_state (
  user_id uuid not null references public.folio_users (id) on delete cascade,
  key     text not null,
  value   text,
  primary key (user_id, key)
);

create table public.folio_papers (
  id              bigserial primary key,
  user_id         uuid not null references public.folio_users (id) on delete cascade,
  item_key        text not null,
  item_version    bigint not null,
  title           text,
  authors         jsonb not null default '[]',
  year            text,
  attachment_key  text,
  attachment_type text,
  collections     jsonb not null default '[]',
  synced_at       timestamptz not null default now(),
  unique (user_id, item_key)
);
create index folio_papers_user_synced_at_idx on public.folio_papers (user_id, synced_at desc);
create index folio_papers_user_title_idx on public.folio_papers (user_id, title);
create index folio_papers_collections_idx on public.folio_papers using gin (collections jsonb_path_ops);

alter table public.folio_users enable row level security;
alter table public.folio_sync_state enable row level security;
alter table public.folio_papers enable row level security;
