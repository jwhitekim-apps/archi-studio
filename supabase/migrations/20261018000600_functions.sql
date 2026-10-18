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
