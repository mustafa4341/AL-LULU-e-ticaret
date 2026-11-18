-- Al Lulu Home — Supabase Veritabanı Şeması, RLS Politikaları ve RPC Fonksiyonları
-- Proje: yrbvywobqnrqqvkndvqj (allulu)

-- 1. Sunucu yetkilendirme kontrol fonksiyonu (SHA-256 doğrulamalı, SECURITY INVOKER)
create or replace function public.sunucu_yetkili_mi()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    current_user in ('postgres', 'service_role', 'supabase_admin')
    or pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          coalesce(
            (nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb ->> 'x-sunucu-anahtari'),
            ''
          ),
          'UTF8'
        )
      ),
      'hex'
    ) = 'c4c955764df2266a86c44567ad5ea7b2e1819f182effb8b5fbe7400a74cd4df8';
$$;

-- 2. Site ve Ana Sayfa Ayarları Tablosu (Tekil kayıt: id = 1)
create table if not exists public.site_ayarlari (
  id integer primary key default 1 check (id = 1),
  surum integer not null default 1 check (surum >= 1),
  guncelleme timestamptz not null default now(),
  site jsonb not null,
  ana_sayfa jsonb not null,
  paytr_stok_islemleri jsonb not null default '[]'::jsonb
);

-- 3. Kategoriler Tablosu
create table if not exists public.kategoriler (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  ad text not null,
  aciklama text not null default '',
  ikon text not null default 'kutu',
  sira integer not null default 10,
  menude_goster boolean not null default true,
  ana_sayfada_goster boolean not null default true,
  yakinda_goster boolean not null default false,
  aktif boolean not null default true,
  guncelleme_tarihi timestamptz not null default now()
);
create index if not exists kategoriler_sira_idx on public.kategoriler (sira);

-- 4. Ürünler Tablosu
create table if not exists public.urunler (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  durum text not null default 'taslak' check (durum in ('yayinda', 'taslak', 'gizli')),
  marka text not null,
  ad text not null,
  kisa_ad text not null,
  kategoriler jsonb not null default '[]'::jsonb,
  fiyat integer not null check (fiyat > 0),
  fiyat_gecmisi jsonb not null default '[]'::jsonb,
  kampanya jsonb default null,
  sepette_indirim integer not null default 0 check (sepette_indirim between 0 and 50),
  firsat jsonb default null,
  stok integer not null default 0 check (stok >= 0),
  max_adet integer not null default 5 check (max_adet between 1 and 50),
  sku text not null default '',
  gorseller jsonb not null default '[]'::jsonb,
  ozet text not null default '',
  one_cikan_bilgiler jsonb not null default '[]'::jsonb,
  rozetler jsonb not null default '[]'::jsonb,
  garanti text default null,
  hediye text default null,
  faydalar jsonb not null default '[]'::jsonb,
  pisirme jsonb not null default '[]'::jsonb,
  pisirme_notu text default null,
  teknik jsonb not null default '[]'::jsonb,
  kutu_icerigi jsonb not null default '[]'::jsonb,
  sss jsonb not null default '[]'::jsonb,
  birlikte_iyi_gider jsonb not null default '[]'::jsonb,
  one_cikan boolean not null default false,
  cok_satan boolean not null default false,
  oncelik integer not null default 0,
  dogrula jsonb not null default '[]'::jsonb,
  sira_no integer not null default 0,
  aktif boolean not null default true,
  guncelleme_tarihi timestamptz not null default now()
);
create index if not exists urunler_durum_oncelik_idx on public.urunler (durum, oncelik desc);
create index if not exists urunler_sira_no_idx on public.urunler (sira_no);

-- 5. Setler Tablosu
create table if not exists public.setler (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  durum text not null default 'taslak' check (durum in ('yayinda', 'taslak', 'gizli')),
  ad text not null,
  aciklama text not null default '',
  kalemler jsonb not null default '[]'::jsonb,
  fiyatlama jsonb not null,
  gorsel jsonb default null,
  rozet text default null,
  one_cikan boolean not null default false,
  sira_no integer not null default 0,
  aktif boolean not null default true,
  guncelleme_tarihi timestamptz not null default now()
);
create index if not exists setler_sira_no_idx on public.setler (sira_no);

-- 6. Siparişler Tablosu
create table if not exists public.siparisler (
  no text primary key,
  token text not null,
  tarih timestamptz not null default now(),
  durum text not null check (durum in ('odeme-bekliyor', 'odendi', 'hazirlaniyor', 'kargoda', 'teslim-edildi', 'iptal')),
  musteri jsonb not null,
  musteri_ad_soyad text generated always as (coalesce(musteri->>'ad', '') || ' ' || coalesce(musteri->>'soyad', '')) stored,
  musteri_tel text generated always as (musteri->>'tel') stored,
  teslimat jsonb not null,
  fatura jsonb not null,
  kalemler jsonb not null,
  urunler_toplami integer not null check (urunler_toplami >= 0),
  set_indirimi integer not null default 0 check (set_indirimi >= 0),
  sepet_indirimi integer not null default 0 check (sepet_indirimi >= 0),
  kampanya_indirimi integer not null default 0 check (kampanya_indirimi >= 0),
  kargo integer not null default 0 check (kargo >= 0),
  toplam integer not null check (toplam >= 0),
  kargo_takip text default null,
  kargo_firma text default null,
  yonetici_notu text default null,
  iptal_notu text default null,
  stok_dusuldu boolean not null default false,
  paytr jsonb default null,
  paytr_ref text generated always as (paytr->>'ref') stored,
  sozlesme_surumu text default null,
  gecmis jsonb not null default '[]'::jsonb,
  guncelleme_tarihi timestamptz not null default now()
);
create unique index if not exists siparisler_paytr_ref_uidx on public.siparisler (paytr_ref) where paytr_ref is not null;
create index if not exists siparisler_tarih_idx on public.siparisler (tarih desc);
create index if not exists siparisler_durum_idx on public.siparisler (durum);
create index if not exists siparisler_musteri_tel_idx on public.siparisler (musteri_tel);

-- 7. Sözleşmeler Tablosu (Ön Bilgilendirme + Mesafeli Satış)
create table if not exists public.sozlesmeler (
  no text primary key references public.siparisler(no) on delete cascade,
  surum text not null,
  onay_tarihi timestamptz not null,
  ip text not null,
  tarayici text default null,
  on_bilgilendirme text not null,
  mesafeli_satis text not null,
  olusturulma_tarihi timestamptz not null default now()
);

-- 8. Mağaza Yedekler Tablosu
create table if not exists public.magaza_yedekler (
  id bigint generated always as identity primary key,
  surum integer not null,
  kayit_tarihi timestamptz not null default now(),
  veri jsonb not null
);
create index if not exists magaza_yedekler_kayit_tarihi_idx on public.magaza_yedekler (kayit_tarihi desc);

-- 9. Medya Dosyaları Tablosu
create table if not exists public.medya_dosyalari (
  yol text primary key,
  icerik_turu text not null default 'image/webp',
  boyut integer not null check (boyut > 0),
  veri_base64 text not null,
  aktif boolean not null default true,
  olusturulma_tarihi timestamptz not null default now()
);

-- 10. Storage Bucket ('medya') Kurulumu
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'medya',
  'medya',
  true,
  12582912,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 11. Row Level Security (RLS)
alter table public.site_ayarlari enable row level security;
alter table public.kategoriler enable row level security;
alter table public.urunler enable row level security;
alter table public.setler enable row level security;
alter table public.siparisler enable row level security;
alter table public.sozlesmeler enable row level security;
alter table public.magaza_yedekler enable row level security;
alter table public.medya_dosyalari enable row level security;

create policy "site_ayarlari_sunucu_erisim" on public.site_ayarlari
  for all using ((select public.sunucu_yetkili_mi())) with check ((select public.sunucu_yetkili_mi()));
create policy "kategoriler_sunucu_erisim" on public.kategoriler
  for all using ((select public.sunucu_yetkili_mi())) with check ((select public.sunucu_yetkili_mi()));
create policy "urunler_sunucu_erisim" on public.urunler
  for all using ((select public.sunucu_yetkili_mi())) with check ((select public.sunucu_yetkili_mi()));
create policy "setler_sunucu_erisim" on public.setler
  for all using ((select public.sunucu_yetkili_mi())) with check ((select public.sunucu_yetkili_mi()));
create policy "siparisler_sunucu_erisim" on public.siparisler
  for all using ((select public.sunucu_yetkili_mi())) with check ((select public.sunucu_yetkili_mi()));
create policy "sozlesmeler_sunucu_erisim" on public.sozlesmeler
  for all using ((select public.sunucu_yetkili_mi())) with check ((select public.sunucu_yetkili_mi()));
create policy "magaza_yedekler_sunucu_erisim" on public.magaza_yedekler
  for all using ((select public.sunucu_yetkili_mi())) with check ((select public.sunucu_yetkili_mi()));
create policy "medya_dosyalari_sunucu_erisim" on public.medya_dosyalari
  for all using ((select public.sunucu_yetkili_mi())) with check ((select public.sunucu_yetkili_mi()));

create policy "medya_public_select" on storage.objects
  for select using (bucket_id = 'medya');
create policy "medya_sunucu_insert" on storage.objects
  for insert with check (bucket_id = 'medya' and (select public.sunucu_yetkili_mi()));
create policy "medya_sunucu_update" on storage.objects
  for update using (bucket_id = 'medya' and (select public.sunucu_yetkili_mi()))
  with check (bucket_id = 'medya' and (select public.sunucu_yetkili_mi()));

-- 12. RPC Fonksiyonları (Atomik Okuma ve Kaydetme)
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

-- 13. Tetikleyiciler (Triggers) ve Rapor Görünümleri (Views)
create or replace view public.ozet_urun_stok_ve_fiyat
with (security_invoker = true)
as
select
  u.id, u.marka, u.ad, u.sku, u.durum,
  u.fiyat as guncel_fiyat_tl,
  u.sepette_indirim as sepette_indirim_yuzde,
  u.stok as kalan_stok,
  case when u.stok = 0 then 'Tükendi' when u.stok <= 3 then 'Kritik Stok' else 'Stokta' end as stok_durumu,
  u.one_cikan, u.cok_satan, u.guncelleme_tarihi
from public.urunler u
where u.aktif = true
order by u.sira_no asc, u.id asc;

create or replace view public.ozet_gunluk_siparis_ciro
with (security_invoker = true)
as
select
  (s.tarih at time zone 'Europe/Istanbul')::date as gun,
  count(*) as toplam_siparis,
  count(*) filter (where s.durum in ('odendi', 'hazirlaniyor', 'kargoda', 'teslim-edildi')) as onayli_siparis,
  count(*) filter (where s.durum = 'odeme-bekliyor') as odeme_bekleyen,
  count(*) filter (where s.durum = 'iptal') as iptal_edilen,
  coalesce(sum(s.toplam) filter (where s.durum in ('odendi', 'hazirlaniyor', 'kargoda', 'teslim-edildi')), 0) as onayli_ciro_tl,
  coalesce(sum(s.toplam) filter (where s.durum = 'odeme-bekliyor'), 0) as bekleyen_tutar_tl
from public.siparisler s
group by 1
order by 1 desc;
