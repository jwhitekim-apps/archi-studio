-- 논문 목록·검색·커서와 컬렉션 개수 (archi-studio-papers 결정 3, 4)
-- 서버(service_role)만 호출한다. 모든 쿼리에 user_id 조건이 들어 있다.

-- 최근 동기화 순((synced_at, id) 내림차순). 커서는 직전 페이지 마지막 행의 (synced_at, id)다.
-- 검색어의 \, %, _는 글자 그대로 찾는다. 제목과 저자(jsonb 문자열 배열) 어느 쪽에든 있으면 일치한다.
create function public.archi_list_papers(
  p_user_id uuid,
  p_query text,
  p_collection text,
  p_limit integer,
  p_cursor_synced_at timestamptz,
  p_cursor_id uuid
)
returns setof public.papers
language sql
stable
as $$
  select p.*
    from public.papers p
   where p.user_id = p_user_id
     and (
       p_query is null or p_query = ''
       or p.title ilike '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
       or exists (
         select 1
           from jsonb_array_elements_text(p.authors) a
          where a ilike '%' || replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
       )
     )
     and (p_collection is null or p_collection = '' or p.collections @> jsonb_build_array(p_collection))
     and (p_cursor_synced_at is null or (p.synced_at, p.id) < (p_cursor_synced_at, p_cursor_id))
   order by p.synced_at desc, p.id desc
   limit p_limit;
$$;

-- 컬렉션과 그 컬렉션 키를 가진 논문 수.
create function public.archi_collection_counts(p_user_id uuid)
returns table (key text, name text, parent_key text, paper_count bigint)
language sql
stable
as $$
  select c.key, c.name, c.parent_key,
         (select count(*) from public.papers p
           where p.user_id = c.user_id and p.collections @> jsonb_build_array(c.key))
    from public.archi_collections c
   where c.user_id = p_user_id
   order by c.name, c.key;
$$;

revoke execute on function public.archi_list_papers(uuid, text, text, integer, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.archi_collection_counts(uuid) from public, anon, authenticated;
grant execute on function public.archi_list_papers(uuid, text, text, integer, timestamptz, uuid) to service_role;
grant execute on function public.archi_collection_counts(uuid) to service_role;
