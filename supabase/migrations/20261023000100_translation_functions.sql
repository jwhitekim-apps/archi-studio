-- 저장된 번역 찾기 (archi-studio-translation 결정 3)
-- 서버(service_role)만 호출한다. md5 해시로 색인(archi_translations_user_source_hash_idx)을 타 후보를 좁히고 원문 일치로 다시 대조한다.
-- 같은 원문이 없으면 0행이다. 있으면 가장 최근 번역문과, p_paper_id 논문에 같은 원문 행이 이미 있는지를 한 줄로 돌려준다.
create function public.archi_find_translation(p_user_id uuid, p_text text, p_paper_id uuid)
returns table (translated_text text, paper_linked boolean)
language sql
stable
as $$
  with matches as (
    select t.translated_text, t.paper_id, t.created_at
      from public.archi_translations t
     where t.user_id = p_user_id
       and md5(t.source_text) = md5(p_text)
       and t.source_text = p_text
  )
  select (select m.translated_text from matches m order by m.created_at desc limit 1),
         p_paper_id is not null and exists (select 1 from matches m where m.paper_id = p_paper_id)
   where exists (select 1 from matches);
$$;

revoke execute on function public.archi_find_translation(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.archi_find_translation(uuid, text, uuid) to service_role;
