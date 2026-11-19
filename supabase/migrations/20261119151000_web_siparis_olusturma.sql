-- Web siparişi, ödeme rezervasyonu ve sözleşme tek işlemde kaydedilir.
create index if not exists siparisler_paytr_bekleyen_idx on public.siparisler (durum)
  where paytr->>'sonuc' = 'bekliyor';

create or replace function public.web_siparis_olustur(yeni_siparis jsonb, belge jsonb)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  islem_isaretleri jsonb;
  odeme jsonb := yeni_siparis->'paytr';
  test_mi boolean := coalesce((odeme->>'test')::boolean, false);
  simdi_ms bigint;
begin
  if not public.sunucu_yetkili_mi() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;

  -- Ürün stoğunu değiştiren RPC'ler de aynı mağaza satırını kilitler.
  select paytr_stok_islemleri into islem_isaretleri from public.site_ayarlari where id = 1 for update;
  if not found then
    raise exception 'Mağaza hazır değil' using errcode = 'PT503';
  end if;
  if exists (select 1 from public.siparisler where no = yeni_siparis->>'no' or paytr_ref = odeme->>'ref') then
    raise exception 'Sipariş numarası kullanımda' using errcode = '23505';
  end if;

  simdi_ms := (extract(epoch from pg_catalog.clock_timestamp()) * 1000)::bigint;
  if odeme->>'sonuc' = 'bekliyor' and (odeme->>'beklemeBitis')::bigint <= simdi_ms then
    raise exception 'Ödeme süresi doldu' using errcode = 'PT422';
  end if;

  if exists (
    with istek as (
      select p->>'urunId' as urun, sum((k->>'adet')::integer * (p->>'adet')::integer) as adet
      from pg_catalog.jsonb_array_elements(yeni_siparis->'kalemler') as k
      cross join lateral pg_catalog.jsonb_array_elements(case
        when pg_catalog.jsonb_array_length(coalesce(k->'parcalar', '[]'::jsonb)) > 0 then k->'parcalar'
        when k->>'tip' = 'urun' then pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('urunId', k->>'id', 'adet', 1))
        else '[]'::jsonb end) as p
      group by p->>'urunId'
    ), ayrilan as (
      select p->>'urunId' as urun, sum((k->>'adet')::integer * (p->>'adet')::integer) as adet
      from public.siparisler as s
      cross join lateral pg_catalog.jsonb_array_elements(s.kalemler) as k
      cross join lateral pg_catalog.jsonb_array_elements(case
        when pg_catalog.jsonb_array_length(coalesce(k->'parcalar', '[]'::jsonb)) > 0 then k->'parcalar'
        when k->>'tip' = 'urun' then pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('urunId', k->>'id', 'adet', 1))
        else '[]'::jsonb end) as p
      where s.durum = 'odeme-bekliyor' and s.paytr->>'sonuc' = 'bekliyor'
        and (not coalesce((s.paytr->>'test')::boolean, false) or test_mi)
        and (s.paytr->>'beklemeBitis')::bigint > simdi_ms
        and not (islem_isaretleri ? s.paytr_ref)
      group by p->>'urunId'
    )
    select 1 from istek i
    left join public.urunler u on u.id = i.urun and u.aktif and u.durum = 'yayinda'
    left join ayrilan a on a.urun = i.urun
    where u.id is null or u.stok - coalesce(a.adet, 0) < i.adet
  ) then
    raise exception 'Yetersiz stok' using errcode = 'PT422';
  end if;

  perform public.siparis_kaydet(yeni_siparis);
  if belge is not null and belge <> 'null'::jsonb then
    insert into public.sozlesmeler (no, surum, onay_tarihi, ip, tarayici, on_bilgilendirme, mesafeli_satis)
    values (yeni_siparis->>'no', belge->>'surum', (belge->>'onayTarihi')::timestamptz,
      belge->>'ip', belge->>'tarayici', belge->>'onBilgilendirme', belge->>'mesafeliSatis');
  end if;

  -- Rezervasyondan önce hazırlanmış bir stok planı yeni rezervasyonu ezemez.
  if odeme->>'sonuc' = 'bekliyor' and not test_mi then
    update public.site_ayarlari set surum = surum + 1 where id = 1;
  end if;
end;
$function$;

revoke all on function public.web_siparis_olustur(jsonb, jsonb) from public;
grant execute on function public.web_siparis_olustur(jsonb, jsonb) to anon, authenticated, service_role;
