-- 데모 예비 시드: Zotero 연결이 안 될 때 같은 공개 논문을 papers 테이블에 직접 넣는다.
-- 사용법: psql -v demo_email="'demo-presenter@example.com'" -f scripts/demo-seed.sql
-- 선행: 데모 계정(demo- 접두사)이 가입되어 auth.users에 있어야 한다. 운영 DB는 백업 후 적용한다.
-- 되돌리기: 맨 아래 주석의 delete 문을 실행한다 (번역·분석 이력도 연쇄로 지워진다).
\set ON_ERROR_STOP on
begin;
with demo as (
  select id from auth.users where email = :demo_email
)
insert into public.papers (user_id, item_key, s2_paper_id, title, authors, year)
select demo.id, v.item_key, v.s2, v.title, v.authors::jsonb, v.year
from demo, (values
  ('DEMO0001', 'arXiv:1706.03762', 'Attention Is All You Need',
   '["Ashish Vaswani","Noam Shazeer"]', '2017'),
  ('DEMO0002', 'arXiv:1810.04805', 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
   '["Jacob Devlin","Ming-Wei Chang"]', '2018'),
  ('DEMO0003', 'arXiv:1512.03385', 'Deep Residual Learning for Image Recognition',
   '["Kaiming He","Xiangyu Zhang"]', '2015')
) as v(item_key, s2, title, authors, year)
on conflict (user_id, item_key) do nothing;
-- 데모 계정이 없으면 0행이 들어가므로 여기서 멈춘다.
do $$ begin
  if (select count(*) from public.papers where item_key like 'DEMO%') = 0 then
    raise exception 'demo user not found or no rows seeded';
  end if;
end $$;
commit;
select count(*) as demo_papers from public.papers where item_key like 'DEMO%';
-- 되돌리기:
-- delete from public.papers where item_key like 'DEMO%'
--   and user_id = (select id from auth.users where email = :demo_email);
