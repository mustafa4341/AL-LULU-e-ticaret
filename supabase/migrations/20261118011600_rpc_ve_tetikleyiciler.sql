-- Al Lulu Home — RPC fonksiyonları ve tetikleyiciler
-- 18.11.2026'da canlı veritabanından (pg_get_functiondef / pg_get_triggerdef) birebir alındı.
-- Bu kodlar daha önce yalnızca canlı veritabanında vardı; veritabanı yeniden kurulursa bu dosya gerekir.
-- Çalıştırma sırası:
--   1) 20261118011500_al_lulu_home_sema.sql   (tablolar, RLS, sunucu_yetkili_mi, magaza_oku, görünümler)
--   2) bu dosya                                (siparisleri_oku, siparis_kaydet, magaza_kaydet, tetikleyiciler)
--   3) 20261118105000_panel_atomik_kayit.sql   (panel_magaza_kaydet, panel_siparis_kaydet)
--   4) 20261118120000_kargo_tetikleyici_odeme_kontrolu.sql
--   5) 20261118121000_surum_cakisma_hata_kodu.sql   (çakışma kodu 40001 → PT409)

-- 1. Tüm siparişleri tarihe göre azalan sırada SiparisSema biçiminde döndürür
CREATE OR REPLACE FUNCTION public.siparisleri_oku()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not public.sunucu_yetkili_mi() then
    raise exception 'Yetkisiz erisim';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        (
          jsonb_build_object(
            'no', sp.no,
            'token', sp.token,
            'tarih', to_char(sp.tarih at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'durum', sp.durum,
            'musteri', sp.musteri,
            'teslimat', sp.teslimat,
            'fatura', sp.fatura,
            'kalemler', sp.kalemler,
            'urunlerToplami', sp.urunler_toplami,
            'setIndirimi', sp.set_indirimi,
            'sepetIndirimi', sp.sepet_indirimi,
            'kampanyaIndirimi', sp.kampanya_indirimi,
            'kargo', sp.kargo,
            'toplam', sp.toplam,
            'stokDusuldu', sp.stok_dusuldu,
            'gecmis', sp.gecmis
          ) || jsonb_strip_nulls(
            jsonb_build_object(
              'kargoTakip', sp.kargo_takip,
              'kargoFirma', sp.kargo_firma,
              'yoneticiNotu', sp.yonetici_notu,
              'iptalNotu', sp.iptal_notu,
              'paytr', sp.paytr,
              'sozlesmeSurumu', sp.sozlesme_surumu
            )
          )
        )
        order by sp.tarih desc
      )
      from public.siparisler sp
    ),
    '[]'::jsonb
  );
end;
$function$;

-- 2. Siparişi ekler veya günceller (UPSERT)
CREATE OR REPLACE FUNCTION public.siparis_kaydet(s jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if not public.sunucu_yetkili_mi() then
    raise exception 'Yetkisiz erisim';
  end if;

  insert into public.siparisler (
    no, token, tarih, durum, musteri, teslimat, fatura, kalemler,
    urunler_toplami, set_indirimi, sepet_indirimi, kampanya_indirimi,
    kargo, toplam, kargo_takip, kargo_firma, yonetici_notu, iptal_notu,
    stok_dusuldu, paytr, sozlesme_surumu, gecmis, guncelleme_tarihi
  )
  values (
    s->>'no',
    s->>'token',
    coalesce((s->>'tarih')::timestamptz, now()),
    s->>'durum',
    s->'musteri',
    s->'teslimat',
    s->'fatura',
    s->'kalemler',
    coalesce((s->>'urunlerToplami')::integer, 0),
    coalesce((s->>'setIndirimi')::integer, 0),
    coalesce((s->>'sepetIndirimi')::integer, 0),
    coalesce((s->>'kampanyaIndirimi')::integer, 0),
    coalesce((s->>'kargo')::integer, 0),
    coalesce((s->>'toplam')::integer, 0),
    s->>'kargoTakip',
    s->>'kargoFirma',
    s->>'yoneticiNotu',
    s->>'iptalNotu',
    coalesce((s->>'stokDusuldu')::boolean, false),
    case when jsonb_typeof(s->'paytr') = 'object' then s->'paytr' else null end,
    s->>'sozlesmeSurumu',
    coalesce(s->'gecmis', '[]'::jsonb),
    now()
  )
  on conflict (no) do update set
    token = excluded.token,
    tarih = excluded.tarih,
    durum = excluded.durum,
    musteri = excluded.musteri,
    teslimat = excluded.teslimat,
    fatura = excluded.fatura,
    kalemler = excluded.kalemler,
    urunler_toplami = excluded.urunler_toplami,
    set_indirimi = excluded.set_indirimi,
    sepet_indirimi = excluded.sepet_indirimi,
    kampanya_indirimi = excluded.kampanya_indirimi,
    kargo = excluded.kargo,
    toplam = excluded.toplam,
    kargo_takip = excluded.kargo_takip,
    kargo_firma = excluded.kargo_firma,
    yonetici_notu = excluded.yonetici_notu,
    iptal_notu = excluded.iptal_notu,
    stok_dusuldu = excluded.stok_dusuldu,
    paytr = excluded.paytr,
    sozlesme_surumu = excluded.sozlesme_surumu,
    gecmis = excluded.gecmis,
    guncelleme_tarihi = now();
end;
$function$;

-- 3. Mağazayı yedekleyip site ayarları, kategoriler, ürünler ve setleri tek işlemde kaydeder.
--    Listeden çıkarılan kayıtlar silinmez, aktif = false yapılır.
CREATE OR REPLACE FUNCTION public.magaza_kaydet(yeni_magaza jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  mevcut jsonb;
begin
  if not public.sunucu_yetkili_mi() then
    raise exception 'Yetkisiz erisim';
  end if;

  mevcut := public.magaza_oku();
  if mevcut is not null then
    insert into public.magaza_yedekler (surum, kayit_tarihi, veri)
    values (coalesce((mevcut->>'surum')::integer, 1), now(), mevcut);
  end if;

  insert into public.site_ayarlari (id, surum, guncelleme, site, ana_sayfa, paytr_stok_islemleri)
  values (
    1,
    coalesce((yeni_magaza->>'surum')::integer, 1),
    coalesce((yeni_magaza->>'guncelleme')::timestamptz, now()),
    yeni_magaza->'site',
    yeni_magaza->'anaSayfa',
    coalesce(yeni_magaza->'paytrStokIslemleri', '[]'::jsonb)
  )
  on conflict (id) do update set
    surum = excluded.surum,
    guncelleme = excluded.guncelleme,
    site = excluded.site,
    ana_sayfa = excluded.ana_sayfa,
    paytr_stok_islemleri = excluded.paytr_stok_islemleri;

  update public.kategoriler set aktif = false where aktif = true;
  insert into public.kategoriler (
    id, ad, aciklama, ikon, sira, menude_goster, ana_sayfada_goster, yakinda_goster, aktif, guncelleme_tarihi
  )
  select
    k->>'id',
    k->>'ad',
    coalesce(k->>'aciklama', ''),
    coalesce(k->>'ikon', 'kutu'),
    coalesce((k->>'sira')::integer, 10),
    coalesce((k->>'menudeGoster')::boolean, true),
    coalesce((k->>'anaSayfadaGoster')::boolean, true),
    coalesce((k->>'yakindaGoster')::boolean, false),
    true,
    now()
  from jsonb_array_elements(coalesce(yeni_magaza->'kategoriler', '[]'::jsonb)) as k
  on conflict (id) do update set
    ad = excluded.ad,
    aciklama = excluded.aciklama,
    ikon = excluded.ikon,
    sira = excluded.sira,
    menude_goster = excluded.menude_goster,
    ana_sayfada_goster = excluded.ana_sayfada_goster,
    yakinda_goster = excluded.yakinda_goster,
    aktif = true,
    guncelleme_tarihi = now();

  update public.urunler set aktif = false where aktif = true;
  insert into public.urunler (
    id, durum, marka, ad, kisa_ad, kategoriler, fiyat, fiyat_gecmisi, kampanya, sepette_indirim,
    firsat, stok, max_adet, sku, gorseller, ozet, one_cikan_bilgiler, rozetler, garanti, hediye,
    faydalar, pisirme, pisirme_notu, teknik, kutu_icerigi, sss, birlikte_iyi_gider, one_cikan,
    cok_satan, oncelik, dogrula, sira_no, aktif, guncelleme_tarihi
  )
  select
    u.elem->>'id',
    coalesce(u.elem->>'durum', 'taslak'),
    u.elem->>'marka',
    u.elem->>'ad',
    u.elem->>'kisaAd',
    coalesce(u.elem->'kategoriler', '[]'::jsonb),
    (u.elem->>'fiyat')::integer,
    coalesce(u.elem->'fiyatGecmisi', '[]'::jsonb),
    case when jsonb_typeof(u.elem->'kampanya') = 'object' then u.elem->'kampanya' else null end,
    coalesce((u.elem->>'sepetteIndirim')::integer, 0),
    case when jsonb_typeof(u.elem->'firsat') = 'object' then u.elem->'firsat' else null end,
    coalesce((u.elem->>'stok')::integer, 0),
    coalesce((u.elem->>'maxAdet')::integer, 5),
    coalesce(u.elem->>'sku', ''),
    coalesce(u.elem->'gorseller', '[]'::jsonb),
    coalesce(u.elem->>'ozet', ''),
    coalesce(u.elem->'oneCikanBilgiler', '[]'::jsonb),
    coalesce(u.elem->'rozetler', '[]'::jsonb),
    u.elem->>'garanti',
    u.elem->>'hediye',
    coalesce(u.elem->'faydalar', '[]'::jsonb),
    coalesce(u.elem->'pisirme', '[]'::jsonb),
    u.elem->>'pisirmeNotu',
    coalesce(u.elem->'teknik', '[]'::jsonb),
    coalesce(u.elem->'kutuIcerigi', '[]'::jsonb),
    coalesce(u.elem->'sss', '[]'::jsonb),
    coalesce(u.elem->'birlikteIyiGider', '[]'::jsonb),
    coalesce((u.elem->>'oneCikan')::boolean, false),
    coalesce((u.elem->>'cokSatan')::boolean, false),
    coalesce((u.elem->>'oncelik')::integer, 0),
    coalesce(u.elem->'dogrula', '[]'::jsonb),
    u.ord::integer,
    true,
    now()
  from jsonb_array_elements(coalesce(yeni_magaza->'urunler', '[]'::jsonb)) with ordinality as u(elem, ord)
  on conflict (id) do update set
    durum = excluded.durum,
    marka = excluded.marka,
    ad = excluded.ad,
    kisa_ad = excluded.kisa_ad,
    kategoriler = excluded.kategoriler,
    fiyat = excluded.fiyat,
    fiyat_gecmisi = excluded.fiyat_gecmisi,
    kampanya = excluded.kampanya,
    sepette_indirim = excluded.sepette_indirim,
    firsat = excluded.firsat,
    stok = excluded.stok,
    max_adet = excluded.max_adet,
    sku = excluded.sku,
    gorseller = excluded.gorseller,
    ozet = excluded.ozet,
    one_cikan_bilgiler = excluded.one_cikan_bilgiler,
    rozetler = excluded.rozetler,
    garanti = excluded.garanti,
    hediye = excluded.hediye,
    faydalar = excluded.faydalar,
    pisirme = excluded.pisirme,
    pisirme_notu = excluded.pisirme_notu,
    teknik = excluded.teknik,
    kutu_icerigi = excluded.kutu_icerigi,
    sss = excluded.sss,
    birlikte_iyi_gider = excluded.birlikte_iyi_gider,
    one_cikan = excluded.one_cikan,
    cok_satan = excluded.cok_satan,
    oncelik = excluded.oncelik,
    dogrula = excluded.dogrula,
    sira_no = excluded.sira_no,
    aktif = true,
    guncelleme_tarihi = now();

  update public.setler set aktif = false where aktif = true;
  insert into public.setler (
    id, durum, ad, aciklama, kalemler, fiyatlama, gorsel, rozet, one_cikan, sira_no, aktif, guncelleme_tarihi
  )
  select
    s.elem->>'id',
    coalesce(s.elem->>'durum', 'taslak'),
    s.elem->>'ad',
    coalesce(s.elem->>'aciklama', ''),
    coalesce(s.elem->'kalemler', '[]'::jsonb),
    s.elem->'fiyatlama',
    case when jsonb_typeof(s.elem->'gorsel') = 'object' then s.elem->'gorsel' else null end,
    s.elem->>'rozet',
    coalesce((s.elem->>'oneCikan')::boolean, false),
    s.ord::integer,
    true,
    now()
  from jsonb_array_elements(coalesce(yeni_magaza->'setler', '[]'::jsonb)) with ordinality as s(elem, ord)
  on conflict (id) do update set
    durum = excluded.durum,
    ad = excluded.ad,
    aciklama = excluded.aciklama,
    kalemler = excluded.kalemler,
    fiyatlama = excluded.fiyatlama,
    gorsel = excluded.gorsel,
    rozet = excluded.rozet,
    one_cikan = excluded.one_cikan,
    sira_no = excluded.sira_no,
    aktif = true,
    guncelleme_tarihi = now();

  return public.magaza_oku();
end;
$function$;

-- 4. Tetikleyici fonksiyonları

-- Ürün fiyatı değişince fiyat geçmişine ekler (son kayıt aynı fiyatsa tekrar eklemez)
CREATE OR REPLACE FUNCTION public.urun_fiyat_gecmisi_tetikleyici()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  son_fiyat integer;
  simdi_iso text;
begin
  new.guncelleme_tarihi := now();
  simdi_iso := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  if jsonb_typeof(new.fiyat_gecmisi) <> 'array' or jsonb_array_length(new.fiyat_gecmisi) = 0 then
    new.fiyat_gecmisi := jsonb_build_array(jsonb_build_object('tarih', simdi_iso, 'fiyat', new.fiyat));
  elsif tg_op = 'UPDATE' and new.fiyat is distinct from old.fiyat then
    son_fiyat := (new.fiyat_gecmisi -> (jsonb_array_length(new.fiyat_gecmisi) - 1) ->> 'fiyat')::integer;
    if son_fiyat is distinct from new.fiyat then
      new.fiyat_gecmisi := new.fiyat_gecmisi || jsonb_build_array(jsonb_build_object('tarih', simdi_iso, 'fiyat', new.fiyat));
    end if;
  end if;

  return new;
end;
$function$;

-- Sipariş durumu değişince geçmişe ekler; takip no ilk girildiğinde "kargoda" yapar
-- (bu ilk sürümdür; ödeme bekleyen sipariş düzeltmesi 20261118120000 dosyasındadır)
CREATE OR REPLACE FUNCTION public.siparis_durum_gecmisi_tetikleyici()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  son_durum text;
  simdi_iso text;
begin
  new.guncelleme_tarihi := now();
  simdi_iso := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  -- Kargo takip numarası ilk kez girildiyse ve sipariş henüz kargoya geçmediyse otomatik 'kargoda' yap
  if tg_op = 'UPDATE'
     and nullif(btrim(coalesce(new.kargo_takip, '')), '') is not null
     and nullif(btrim(coalesce(old.kargo_takip, '')), '') is null
     and new.durum in ('odeme-bekliyor', 'odendi', 'hazirlaniyor') then
    new.durum := 'kargoda';
  end if;

  if jsonb_typeof(new.gecmis) <> 'array' or jsonb_array_length(new.gecmis) = 0 then
    new.gecmis := jsonb_build_array(jsonb_build_object('tarih', simdi_iso, 'durum', new.durum));
  elsif tg_op = 'UPDATE' and new.durum is distinct from old.durum then
    son_durum := new.gecmis -> (jsonb_array_length(new.gecmis) - 1) ->> 'durum';
    if son_durum is distinct from new.durum then
      new.gecmis := new.gecmis || jsonb_build_array(jsonb_build_object('tarih', simdi_iso, 'durum', new.durum));
    end if;
  end if;

  return new;
end;
$function$;

-- Ürün/kategori/set değişince mağazanın güncelleme zamanını yeniler
CREATE OR REPLACE FUNCTION public.magaza_degisiklik_tetikleyici()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  update public.site_ayarlari set guncelleme = now() where id = 1;
  return null;
end;
$function$;

-- 5. Tetikleyiciler
drop trigger if exists trg_urun_fiyat_gecmisi on public.urunler;
create trigger trg_urun_fiyat_gecmisi
  before insert or update on public.urunler
  for each row execute function public.urun_fiyat_gecmisi_tetikleyici();

drop trigger if exists trg_siparis_durum_gecmisi on public.siparisler;
create trigger trg_siparis_durum_gecmisi
  before insert or update on public.siparisler
  for each row execute function public.siparis_durum_gecmisi_tetikleyici();

drop trigger if exists trg_urunler_magaza_guncelleme on public.urunler;
create trigger trg_urunler_magaza_guncelleme
  after insert or update on public.urunler
  for each statement execute function public.magaza_degisiklik_tetikleyici();

drop trigger if exists trg_kategoriler_magaza_guncelleme on public.kategoriler;
create trigger trg_kategoriler_magaza_guncelleme
  after insert or update on public.kategoriler
  for each statement execute function public.magaza_degisiklik_tetikleyici();

drop trigger if exists trg_setler_magaza_guncelleme on public.setler;
create trigger trg_setler_magaza_guncelleme
  after insert or update on public.setler
  for each statement execute function public.magaza_degisiklik_tetikleyici();
