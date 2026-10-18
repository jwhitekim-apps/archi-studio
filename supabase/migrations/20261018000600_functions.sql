-- updated_at 자동 갱신 (docs/api/data-model.md 3.11)
create function public.folio_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger folio_users_touch_updated_at
  before update on public.folio_users
  for each row execute function public.folio_touch_updated_at();

-- 로그인 시도 예약과 해제 (docs/api/data-model.md 3.11, archi-studio-review-fixes 결정 3)
-- 같은 IP의 판정을 advisory lock으로 직렬화해 병렬 요청이 같은 실패 횟수를 보고 통과하지 못하게 한다.
-- 창 안의 시도(예약 포함)가 한도 이상이면 null, 아니면 행을 넣고 그 id를 돌려준다.
-- 24시간 지난 행은 같은 호출에서 지운다.
create function public.archi_reserve_login_attempt(
  p_ip text,
  p_max integer,
  p_window_seconds integer
)
returns bigint
language plpgsql
as $$
declare
  v_count integer;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_ip, 0));

  delete from public.archi_login_attempts
   where attempted_at < now() - interval '24 hours';

  select count(*) into v_count
    from public.archi_login_attempts
   where ip = p_ip
     and attempted_at >= now() - make_interval(secs => p_window_seconds);

  if v_count >= p_max then
    return null;
  end if;

  insert into public.archi_login_attempts (ip) values (p_ip) returning id into v_id;
  return v_id;
end;
$$;

-- 성공, 미승인 403, 예기치 못한 예외에서 예약을 지운다. 실패한 로그인은 지우지 않는다(실패로 센다).
create function public.archi_release_login_attempt(p_id bigint)
returns void
language sql
as $$
  delete from public.archi_login_attempts where id = p_id;
$$;

-- 서비스 키(서버)만 호출한다. PostgREST가 anon, authenticated에 노출하지 않게 한다.
revoke execute on function public.archi_reserve_login_attempt(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.archi_release_login_attempt(bigint) from public, anon, authenticated;
grant execute on function public.archi_reserve_login_attempt(text, integer, integer) to service_role;
grant execute on function public.archi_release_login_attempt(bigint) to service_role;
