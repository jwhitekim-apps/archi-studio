-- Zotero 동기화 결과를 한 트랜잭션으로 반영 (archi-studio-zotero-connection 결정 7)
-- folio_papers(비서가 읽는 캐시), papers(앱 중심 테이블), archi_collections, 동기화 상태를 함께 쓴다.
-- 중간에 하나라도 실패하면(예: item_version null) 전체가 되돌려져 절반만 반영된 상태가 남지 않는다.
-- papers.s2_paper_id와 created_at은 갱신하지 않는다. 삭제 키는 두 표에서 지우고, papers를 지우면 번역·분석 이력이 연쇄로 지워진다.
-- 서버(service_role)만 호출한다.
create function public.archi_apply_zotero_sync(
  p_user_id uuid,
  p_items jsonb,
  p_deleted text[],
  p_collections jsonb,
  p_version bigint,
  p_failed text[],
  p_synced_at timestamptz
)
returns jsonb
language plpgsql
as $$
declare
  v_added integer := 0;
  v_updated integer := 0;
  v_removed integer := 0;
  v_item jsonb;
  v_key text;
begin
  -- 같은 사용자의 동기화 반영은 한 번에 하나씩 한다.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 1));

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_key := v_item->>'item_key';

    if exists (select 1 from public.folio_papers where user_id = p_user_id and item_key = v_key) then
      v_updated := v_updated + 1;
    else
      v_added := v_added + 1;
    end if;

    insert into public.folio_papers
      (user_id, item_key, item_version, title, authors, year, attachment_key, attachment_type, collections, synced_at)
    values (
      p_user_id,
      v_key,
      (v_item->>'item_version')::bigint,
      v_item->>'title',
      coalesce(v_item->'authors', '[]'::jsonb),
      v_item->>'year',
      v_item->>'attachment_key',
      v_item->>'attachment_type',
      coalesce(v_item->'collections', '[]'::jsonb),
      p_synced_at
    )
    on conflict (user_id, item_key) do update set
      item_version    = excluded.item_version,
      title           = excluded.title,
      authors         = excluded.authors,
      year            = excluded.year,
      attachment_key  = excluded.attachment_key,
      attachment_type = excluded.attachment_type,
      collections     = excluded.collections,
      synced_at       = excluded.synced_at;

    insert into public.papers
      (user_id, item_key, item_version, title, authors, year, collections,
       attachment_key, attachment_type, has_memo, synced_at)
    values (
      p_user_id,
      v_key,
      (v_item->>'item_version')::bigint,
      v_item->>'title',
      coalesce(v_item->'authors', '[]'::jsonb),
      v_item->>'year',
      coalesce(v_item->'collections', '[]'::jsonb),
      v_item->>'attachment_key',
      v_item->>'attachment_type',
      coalesce((v_item->>'has_memo')::boolean, false),
      p_synced_at
    )
    on conflict (user_id, item_key) do update set
      item_version    = excluded.item_version,
      title           = excluded.title,
      authors         = excluded.authors,
      year            = excluded.year,
      collections     = excluded.collections,
      attachment_key  = excluded.attachment_key,
      attachment_type = excluded.attachment_type,
      has_memo        = excluded.has_memo,
      synced_at       = excluded.synced_at;
  end loop;

  -- 삭제: 둘 중 한 표에라도 있던 키만 센다.
  select count(distinct k) into v_removed
    from unnest(coalesce(p_deleted, '{}'::text[])) as k
   where exists (select 1 from public.folio_papers where user_id = p_user_id and item_key = k)
      or exists (select 1 from public.papers where user_id = p_user_id and item_key = k);

  delete from public.folio_papers
   where user_id = p_user_id and item_key = any (coalesce(p_deleted, '{}'::text[]));
  delete from public.papers
   where user_id = p_user_id and item_key = any (coalesce(p_deleted, '{}'::text[]));

  -- 컬렉션: 받은 목록과 같아지도록 맞춘다. null이면 건드리지 않는다.
  if p_collections is not null then
    delete from public.archi_collections
     where user_id = p_user_id
       and key not in (select c->>'key' from jsonb_array_elements(p_collections) c);

    insert into public.archi_collections (user_id, key, name, parent_key)
    select p_user_id, c->>'key', c->>'name', nullif(c->>'parent_key', '')
      from jsonb_array_elements(p_collections) c
    on conflict (user_id, key) do update set
      name = excluded.name,
      parent_key = excluded.parent_key;
  end if;

  insert into public.folio_sync_state (user_id, key, value) values
    (p_user_id, 'lastVersion', p_version::text),
    (p_user_id, 'lastSyncedAt', to_char(p_synced_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    (p_user_id, 'failedItemKeys', to_json(coalesce(p_failed, '{}'::text[]))::text)
  on conflict (user_id, key) do update set value = excluded.value;

  return jsonb_build_object('added', v_added, 'updated', v_updated, 'removed', v_removed);
end;
$$;

revoke execute on function public.archi_apply_zotero_sync(uuid, jsonb, text[], jsonb, bigint, text[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.archi_apply_zotero_sync(uuid, jsonb, text[], jsonb, bigint, text[], timestamptz)
  to service_role;
