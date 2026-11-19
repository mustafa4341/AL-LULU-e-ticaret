-- Dağıtık zamanlayıcı aynı stok hedefine eşzamanlı ve farklı sırada yazamasın.
create table if not exists public.pazaryeri_senkron_kilidi (
  id integer primary key check (id = 1),
  sahip uuid not null,
  bitis timestamptz not null
);

alter table public.pazaryeri_senkron_kilidi enable row level security;
revoke all on public.pazaryeri_senkron_kilidi from public, anon, authenticated;
grant select, insert, update, delete on public.pazaryeri_senkron_kilidi to anon, authenticated, service_role;
drop policy if exists pazaryeri_senkron_kilidi_sunucu on public.pazaryeri_senkron_kilidi;
create policy pazaryeri_senkron_kilidi_sunucu on public.pazaryeri_senkron_kilidi
  for all using ((select public.sunucu_yetkili_mi())) with check ((select public.sunucu_yetkili_mi()));

create or replace function public.pazaryeri_senkron_kilitle(sahip uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if not public.sunucu_yetkili_mi() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;
  insert into public.pazaryeri_senkron_kilidi as kilit (id, sahip, bitis)
  values (1, $1, pg_catalog.clock_timestamp() + interval '10 minutes')
  on conflict (id) do update
    set sahip = excluded.sahip, bitis = excluded.bitis
    where kilit.bitis < pg_catalog.clock_timestamp();
  return found;
end;
$function$;

create or replace function public.pazaryeri_senkron_kilidi_birak(sahip uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if not public.sunucu_yetkili_mi() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;
  delete from public.pazaryeri_senkron_kilidi as kilit where kilit.id = 1 and kilit.sahip = $1;
end;
$function$;

revoke all on function public.pazaryeri_senkron_kilitle(uuid) from public;
revoke all on function public.pazaryeri_senkron_kilidi_birak(uuid) from public;
grant execute on function public.pazaryeri_senkron_kilitle(uuid) to anon, authenticated, service_role;
grant execute on function public.pazaryeri_senkron_kilidi_birak(uuid) to anon, authenticated, service_role;
