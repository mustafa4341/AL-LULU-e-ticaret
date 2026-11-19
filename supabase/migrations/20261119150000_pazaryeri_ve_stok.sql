-- Pazaryeri siparişleri (Trendyol, Hepsiburada), stok hareket defteri ve envanter ayarları (19.11.2026)
--
-- NEDEN (pazaryeri): API veya satıcı panelinden alınan siparişler ortak bir yapıda kaydedilir.
--   Kayıt kimliği "<kanal>-<paket no>"dur: aynı dosya ya da güncel hali tekrar yüklenirse kayıt güncellenir,
--   iki kez sayılmaz. Stok düşümü (urunler) ve sipariş kaydı TEK işlemde yazılır; biri yarım kalmaz.
--   Müşterinin yalnız adı ve il/ilçesi tutulur (adres, telefon pazaryeri panelinde kalır — KVKK: gereken kadar veri).
--
-- NEDEN (stok defteri): urunler.stok her değiştiğinde tetikleyici eski/yeni değeri ve sebebi yazar.
--   Kod yolu ne olursa olsun (panel, web siparişi, PayTR, pazaryeri aktarımı) hiçbir değişiklik kaçmaz.
--   Sebebi işlemi başlatan fonksiyon set_config('app.stok_sebep', ..., true) ile verir (yalnız o işlem için geçerli).
--
-- Tüm yazmalar mevcut düzende olduğu gibi sunucu anahtarıyla (sunucu_yetkili_mi) yapılır; çakışma kodu PT409
-- (40001 KULLANILMAZ: PostgREST onu sonsuz tekrar dener — bkz. 20261118121000_surum_cakisma_hata_kodu.sql).

-- 1. Tablolar ------------------------------------------------------------------------------------------
create table if not exists public.pazaryeri_siparisleri (
  id text primary key check (id ~ '^(trendyol|hepsiburada)-[A-Za-z0-9._-]{1,80}$'),
  kanal text not null check (kanal in ('trendyol', 'hepsiburada')),
  tarih timestamptz not null,
  durum text not null check (char_length(durum) <= 40),
  surum integer not null default 1 check (surum >= 1),
  veri jsonb not null,
  siparis_no text generated always as (veri->>'siparisNo') stored,
  guncelleme timestamptz not null default now()
);
alter table public.pazaryeri_siparisleri add column if not exists siparis_no text generated always as (veri->>'siparisNo') stored;
create index if not exists pazaryeri_siparisleri_tarih_idx on public.pazaryeri_siparisleri (tarih desc);
create index if not exists pazaryeri_siparisleri_kanal_idx on public.pazaryeri_siparisleri (kanal, durum);
create index if not exists pazaryeri_siparisleri_no_idx on public.pazaryeri_siparisleri (kanal, siparis_no, id);

create table if not exists public.stok_hareketleri (
  id bigint generated always as identity primary key,
  tarih timestamptz not null default now(),
  urun_id text not null,
  onceki integer not null,
  sonraki integer not null,
  sebep text not null default 'Panel' check (char_length(sebep) <= 200)
);
create index if not exists stok_hareketleri_urun_idx on public.stok_hareketleri (urun_id, tarih desc);
create index if not exists stok_hareketleri_tarih_idx on public.stok_hareketleri (tarih desc);

-- Tek kayıt: kritik stok eşikleri, pazaryeri sütun eşleştirmeleri, ürün kodu eşleştirmeleri, kanal stokları
create table if not exists public.envanter_ayarlari (
  id integer primary key default 1 check (id = 1),
  surum integer not null default 1 check (surum >= 1),
  veri jsonb not null default '{}'::jsonb,
  guncelleme timestamptz not null default now()
);
insert into public.envanter_ayarlari (id) values (1) on conflict (id) do nothing;

alter table public.pazaryeri_siparisleri enable row level security;
alter table public.stok_hareketleri enable row level security;
alter table public.envanter_ayarlari enable row level security;

drop policy if exists pazaryeri_siparisleri_sunucu_erisim on public.pazaryeri_siparisleri;
create policy pazaryeri_siparisleri_sunucu_erisim on public.pazaryeri_siparisleri
  for all using ((select public.sunucu_yetkili_mi())) with check ((select public.sunucu_yetkili_mi()));
drop policy if exists stok_hareketleri_sunucu_erisim on public.stok_hareketleri;
create policy stok_hareketleri_sunucu_erisim on public.stok_hareketleri
  for all using ((select public.sunucu_yetkili_mi())) with check ((select public.sunucu_yetkili_mi()));
drop policy if exists envanter_ayarlari_sunucu_erisim on public.envanter_ayarlari;
create policy envanter_ayarlari_sunucu_erisim on public.envanter_ayarlari
  for all using ((select public.sunucu_yetkili_mi())) with check ((select public.sunucu_yetkili_mi()));

grant select, insert, update on public.pazaryeri_siparisleri, public.envanter_ayarlari to anon, authenticated, service_role;
grant select, insert on public.stok_hareketleri to anon, authenticated, service_role;

-- 2. Stok hareket defteri tetikleyicisi -----------------------------------------------------------------
-- magaza_kaydet önce tüm ürünleri aktif=false yapar (stok sütununa dokunmaz → tetiklenmez),
-- sonra upsert ile stok yazar: yalnız gerçekten değişen stok için satır eklenir.
create or replace function public.stok_hareketi_tetikleyici()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  sebep text := nullif(pg_catalog.current_setting('app.stok_sebep', true), '');
begin
  if tg_op = 'INSERT' then
    if new.stok <> 0 then
      insert into public.stok_hareketleri (urun_id, onceki, sonraki, sebep)
      values (new.id, 0, new.stok, left(coalesce(sebep, 'Yeni ürün'), 200));
    end if;
  elsif new.stok is distinct from old.stok then
    insert into public.stok_hareketleri (urun_id, onceki, sonraki, sebep)
    values (new.id, old.stok, new.stok, left(coalesce(sebep, 'Panel'), 200));
  end if;
  return null;
end;
$function$;

drop trigger if exists trg_stok_hareketi on public.urunler;
create trigger trg_stok_hareketi
  after insert or update of stok on public.urunler
  for each row execute function public.stok_hareketi_tetikleyici();

-- 3. Sebepli mağaza kaydı (panelden elle stok düzeltme vb.) -----------------------------------------------
create or replace function public.panel_magaza_kaydet_sebep(yeni_magaza jsonb, beklenen_surum integer, sebep text)
returns jsonb
language plpgsql
set search_path = ''
as $function$
begin
  if not public.sunucu_yetkili_mi() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;
  perform pg_catalog.set_config('app.stok_sebep', left(coalesce(sebep, ''), 200), true);
  return public.panel_magaza_kaydet(yeni_magaza, beklenen_surum);
end;
$function$;

-- 4. Web siparişi stok sebebi: panel_siparis_kaydet aynı kalır, yalnız sebep satırı eklendi --------------
CREATE OR REPLACE FUNCTION public.panel_siparis_kaydet(yeni_siparis jsonb, eski_siparis jsonb, yeni_magaza jsonb, beklenen_surum integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  kayit public.siparisler%rowtype;
  sonuc jsonb;
begin
  if not public.sunucu_yetkili_mi() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;

  -- Stok hareket defterinde görünecek sebep: "Web siparişi AL261119-1234 · iptal"
  perform pg_catalog.set_config('app.stok_sebep', left('Web siparişi ' || coalesce(yeni_siparis->>'no', '') || ' · ' ||
    case when (yeni_siparis->'gecmis'->-1->>'islem') = 'iade-tamamlandi' then 'iade' else coalesce(yeni_siparis->>'durum', '') end, 200), true);

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
    raise exception 'Sipariş değişti' using errcode = 'PT409';
  end if;

  perform public.siparis_kaydet(yeni_siparis);
  return sonuc;
end;
$function$;

-- 5. Pazaryeri aktarımı: siparişler + stok + ayarlar tek işlemde ---------------------------------------------
create or replace function public.pazaryeri_aktarim_kayitlari_oku(p_kanal text, p_siparis_nolari text[], p_son_id text)
returns table (id text, surum integer, veri jsonb)
language plpgsql
stable
set search_path = ''
as $function$
begin
  if not public.sunucu_yetkili_mi() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;
  return query
    select s.id, s.surum, s.veri from public.pazaryeri_siparisleri s
    where s.kanal = p_kanal and s.siparis_no = any(p_siparis_nolari) and s.id > p_son_id
    order by s.id limit 200;
end;
$function$;

-- kayitlar: [{ id, kanal, tarih, durum, veri }]  ·  beklenen: { "<id>": <okunan sürüm, yeni kayıtta 0> }
-- yeni_magaza null ise stok değişmez; ayarlar null ise ayarlar değişmez.
create or replace function public.pazaryeri_kaydet(
  kayitlar jsonb, beklenen jsonb, yeni_magaza jsonb, beklenen_surum integer,
  ayarlar jsonb, ayar_surum integer, sebep text
)
returns jsonb
language plpgsql
set search_path = ''
as $function$
declare
  k jsonb;
  mevcut public.pazaryeri_siparisleri%rowtype;
  mevcut_ayar_surum integer;
  mevcut_magaza_surum integer;
  sonuc jsonb;
begin
  if not public.sunucu_yetkili_mi() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;
  if pg_catalog.jsonb_typeof(kayitlar) is distinct from 'array' or pg_catalog.jsonb_array_length(kayitlar) > 5000 then
    raise exception 'Geçersiz kayıt listesi' using errcode = '22023';
  end if;

  -- Aynı anda iki aktarım birbirini ezmesin: ayar satırı tüm aktarımlar için kilit görevi görür
  select surum into mevcut_ayar_surum from public.envanter_ayarlari where id = 1 for update;
  if mevcut_ayar_surum is null or mevcut_ayar_surum is distinct from ayar_surum then
    raise exception 'Ayarlar değişti' using errcode = 'PT409';
  end if;
  if ayarlar is not null and ayarlar <> 'null'::jsonb then
    if pg_catalog.jsonb_typeof(ayarlar) is distinct from 'object' then
      raise exception 'Geçersiz ayar' using errcode = '22023';
    end if;
    update public.envanter_ayarlari set veri = ayarlar, surum = surum + 1, guncelleme = now() where id = 1;
  end if;

  perform pg_catalog.set_config('app.stok_sebep', left(coalesce(nullif(sebep, ''), 'Pazaryeri'), 200), true);
  if yeni_magaza is not null and yeni_magaza <> 'null'::jsonb then
    sonuc := public.panel_magaza_kaydet(yeni_magaza, beklenen_surum);
  else
    -- Stoğu değişmeyen bir kaydın eşleşmesi veya stok açığı da bu katalog görünümüne dayanır.
    select surum into mevcut_magaza_surum from public.site_ayarlari where id = 1 for update;
    if mevcut_magaza_surum is null or mevcut_magaza_surum is distinct from beklenen_surum then
      raise exception 'Mağaza sürümü değişti' using errcode = 'PT409';
    end if;
  end if;

  for k in select value from pg_catalog.jsonb_array_elements(kayitlar) loop
    if (k->>'id') is distinct from (k->'veri'->>'id')
      or (k->>'kanal') is distinct from (k->'veri'->>'kanal')
      or nullif(k->'veri'->>'siparisNo', '') is null then
      raise exception 'Geçersiz sipariş kimliği' using errcode = '22023';
    end if;
    select * into mevcut from public.pazaryeri_siparisleri where id = k->>'id' for update;
    if coalesce(mevcut.surum, 0) is distinct from (beklenen->>(k->>'id'))::integer then
      raise exception 'Pazaryeri siparişi bu sırada değişti: %', k->>'id' using errcode = 'PT409';
    end if;
    if mevcut.id is not null and (mevcut.kanal <> k->>'kanal' or mevcut.siparis_no <> k->'veri'->>'siparisNo') then
      raise exception 'Pazaryeri sipariş kimliği çakıştı' using errcode = '22023';
    end if;
    insert into public.pazaryeri_siparisleri (id, kanal, tarih, durum, surum, veri, guncelleme)
    values (k->>'id', k->>'kanal', (k->>'tarih')::timestamptz, k->>'durum', coalesce(mevcut.surum, 0) + 1, k->'veri', now())
    on conflict (id) do update set
      tarih = excluded.tarih, durum = excluded.durum, surum = excluded.surum, veri = excluded.veri, guncelleme = now();
  end loop;

  return sonuc;
end;
$function$;

-- 6. Yalnız ayar kaydı (kritik stok eşiği, kanal stoğu "güncelledim" vb.) -----------------------------------
create or replace function public.envanter_ayar_kaydet(ayarlar jsonb, ayar_surum integer)
returns integer
language plpgsql
set search_path = ''
as $function$
declare
  mevcut integer;
begin
  if not public.sunucu_yetkili_mi() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;
  if pg_catalog.jsonb_typeof(ayarlar) is distinct from 'object' then
    raise exception 'Geçersiz ayar' using errcode = '22023';
  end if;
  select surum into mevcut from public.envanter_ayarlari where id = 1 for update;
  if mevcut is null or mevcut is distinct from ayar_surum then
    raise exception 'Ayarlar değişti' using errcode = 'PT409';
  end if;
  update public.envanter_ayarlari set veri = ayarlar, surum = surum + 1, guncelleme = now() where id = 1;
  return mevcut + 1;
end;
$function$;

revoke all on function public.stok_hareketi_tetikleyici() from public;
revoke all on function public.panel_magaza_kaydet_sebep(jsonb, integer, text) from public;
revoke all on function public.panel_siparis_kaydet(jsonb, jsonb, jsonb, integer) from public;
revoke all on function public.pazaryeri_aktarim_kayitlari_oku(text, text[], text) from public;
revoke all on function public.pazaryeri_kaydet(jsonb, jsonb, jsonb, integer, jsonb, integer, text) from public;
revoke all on function public.envanter_ayar_kaydet(jsonb, integer) from public;
grant execute on function public.panel_magaza_kaydet_sebep(jsonb, integer, text) to anon, authenticated, service_role;
grant execute on function public.panel_siparis_kaydet(jsonb, jsonb, jsonb, integer) to anon, authenticated, service_role;
grant execute on function public.pazaryeri_aktarim_kayitlari_oku(text, text[], text) to anon, authenticated, service_role;
grant execute on function public.pazaryeri_kaydet(jsonb, jsonb, jsonb, integer, jsonb, integer, text) to anon, authenticated, service_role;
grant execute on function public.envanter_ayar_kaydet(jsonb, integer) to anon, authenticated, service_role;
