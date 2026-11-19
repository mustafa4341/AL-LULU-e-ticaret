-- Ürün bazlı Fayda Bölümü başlıkları (fayda_ust_baslik, fayda_baslik, fayda_alt_baslik)
alter table public.urunler
  add column if not exists fayda_ust_baslik text default null,
  add column if not exists fayda_baslik text default null,
  add column if not exists fayda_alt_baslik text default null;

create or replace function public.magaza_oku()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  ayar public.site_ayarlari%rowtype;
  sonuc jsonb;
begin
  if not public.sunucu_yetkili_mi() then
    raise exception 'Yetkisiz erisim';
  end if;

  select * into ayar from public.site_ayarlari where id = 1;
  if not found then
    return null;
  end if;

  sonuc := jsonb_build_object(
    'surum', ayar.surum,
    'guncelleme', to_char(ayar.guncelleme at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'site', ayar.site,
    'anaSayfa', ayar.ana_sayfa,
    'paytrStokIslemleri', coalesce(ayar.paytr_stok_islemleri, '[]'::jsonb),
    'kategoriler', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', k.id,
            'ad', k.ad,
            'aciklama', k.aciklama,
            'ikon', k.ikon,
            'sira', k.sira,
            'menudeGoster', k.menude_goster,
            'anaSayfadaGoster', k.ana_sayfada_goster,
            'yakindaGoster', k.yakinda_goster
          )
          order by k.sira asc, k.id asc
        )
        from public.kategoriler k
        where k.aktif = true
      ),
      '[]'::jsonb
    ),
    'urunler', coalesce(
      (
        select jsonb_agg(
          (
            jsonb_build_object(
              'id', u.id,
              'durum', u.durum,
              'marka', u.marka,
              'ad', u.ad,
              'kisaAd', u.kisa_ad,
              'kategoriler', u.kategoriler,
              'fiyat', u.fiyat,
              'fiyatGecmisi', u.fiyat_gecmisi,
              'kampanya', u.kampanya,
              'sepetteIndirim', u.sepette_indirim,
              'firsat', u.firsat,
              'stok', u.stok,
              'maxAdet', u.max_adet,
              'sku', u.sku,
              'gorseller', u.gorseller,
              'ozet', u.ozet,
              'oneCikanBilgiler', u.one_cikan_bilgiler,
              'rozetler', u.rozetler,
              'faydalar', u.faydalar,
              'pisirme', u.pisirme,
              'teknik', u.teknik,
              'kutuIcerigi', u.kutu_icerigi,
              'sss', u.sss,
              'birlikteIyiGider', u.birlikte_iyi_gider,
              'oneCikan', u.one_cikan,
              'cokSatan', u.cok_satan,
              'oncelik', u.oncelik,
              'dogrula', u.dogrula
            ) || jsonb_strip_nulls(
              jsonb_build_object(
                'garanti', u.garanti,
                'hediye', u.hediye,
                'faydaUstBaslik', u.fayda_ust_baslik,
                'faydaBaslik', u.fayda_baslik,
                'faydaAltBaslik', u.fayda_alt_baslik,
                'pisirmeNotu', u.pisirme_notu
              )
            )
          )
          order by u.sira_no asc, u.id asc
        )
        from public.urunler u
        where u.aktif = true
      ),
      '[]'::jsonb
    ),
    'setler', coalesce(
      (
        select jsonb_agg(
          (
            jsonb_build_object(
              'id', s.id,
              'durum', s.durum,
              'ad', s.ad,
              'aciklama', s.aciklama,
              'kalemler', s.kalemler,
              'fiyatlama', s.fiyatlama,
              'oneCikan', s.one_cikan
            ) || jsonb_strip_nulls(
              jsonb_build_object(
                'gorsel', s.gorsel,
                'rozet', s.rozet
              )
            )
          )
          order by s.sira_no asc, s.id asc
        )
        from public.setler s
        where s.aktif = true
      ),
      '[]'::jsonb
    )
  );

  return sonuc;
end;
$$;

create or replace function public.magaza_kaydet(yeni_magaza jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
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
    fayda_ust_baslik, fayda_baslik, fayda_alt_baslik,
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
    u.elem->>'faydaUstBaslik',
    u.elem->>'faydaBaslik',
    u.elem->>'faydaAltBaslik',
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
    fayda_ust_baslik = excluded.fayda_ust_baslik,
    fayda_baslik = excluded.fayda_baslik,
    fayda_alt_baslik = excluded.fayda_alt_baslik,
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
$$;
