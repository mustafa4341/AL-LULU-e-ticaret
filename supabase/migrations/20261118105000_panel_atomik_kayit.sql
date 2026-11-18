-- Sipariş ve ona bağlı stok değişikliğini aynı veritabanı işlemi içinde kaydeder.
-- Mevcut mağaza/sipariş RPC'leri ve RLS politikaları kullanılmaya devam eder.
create or replace function public.panel_magaza_kaydet(yeni_magaza jsonb, beklenen_surum integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  kayitli_surum integer;
begin
  if not public.sunucu_yetkili_mi() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;
  select surum into kayitli_surum from public.site_ayarlari where id = 1 for update;
  if kayitli_surum is distinct from beklenen_surum then
    raise exception 'Mağaza sürümü değişti' using errcode = '40001';
  end if;
  return public.magaza_kaydet(yeni_magaza);
end;
$$;

create or replace function public.panel_siparis_kaydet(
  yeni_siparis jsonb, eski_siparis jsonb, yeni_magaza jsonb, beklenen_surum integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  kayit public.siparisler%rowtype;
  sonuc jsonb;
begin
  if not public.sunucu_yetkili_mi() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;

  -- Mağaza kilidi önce alınır. Alttaki kontrollerden biri başarısız olursa
  -- katalog ve stok dahil olmak üzere bu işlemin tamamı geri alınır.
  if yeni_magaza is not null and yeni_magaza <> 'null'::jsonb then
    sonuc := public.panel_magaza_kaydet(yeni_magaza, beklenen_surum);
  end if;

  select * into kayit from public.siparisler where no = eski_siparis->>'no' for update;
  if not found
    or kayit.no is distinct from (yeni_siparis->>'no')
    or kayit.durum is distinct from (eski_siparis->>'durum')
    or kayit.stok_dusuldu is distinct from (eski_siparis->>'stokDusuldu')::boolean
    or kayit.gecmis is distinct from (eski_siparis->'gecmis')
    or kayit.paytr is distinct from nullif(eski_siparis->'paytr', 'null'::jsonb)
    or kayit.yonetici_notu is distinct from (eski_siparis->>'yoneticiNotu')
    or kayit.kargo_firma is distinct from (eski_siparis->>'kargoFirma')
    or kayit.kargo_takip is distinct from (eski_siparis->>'kargoTakip')
  then
    raise exception 'Sipariş değişti' using errcode = '40001';
  end if;

  perform public.siparis_kaydet(yeni_siparis);
  return sonuc;
end;
$$;

revoke all on function public.panel_magaza_kaydet(jsonb, integer) from public;
revoke all on function public.panel_siparis_kaydet(jsonb, jsonb, jsonb, integer) from public;
grant execute on function public.panel_magaza_kaydet(jsonb, integer) to anon, authenticated, service_role;
grant execute on function public.panel_siparis_kaydet(jsonb, jsonb, jsonb, integer) to anon, authenticated, service_role;
