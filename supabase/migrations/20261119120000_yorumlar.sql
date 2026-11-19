-- Ürün değerlendirmeleri (19.11.2026)
-- NEDEN: Ticari Reklam ve Haksız Ticari Uygulamalar Yön. m.28/B — yalnızca ürünü gerçekten satın almış
-- tüketicinin yorumu yayınlanır. Bu yüzden her yorum bir siparişe ve o siparişteki bir ürüne bağlıdır;
-- müşteri yorumu yalnızca sipariş takip bağlantısıyla (gizli token) ve sipariş teslim edildikten sonra yazabilir.
-- Aynı sipariş + ürün için tek yorum (müşteri sonradan düzeltebilir, yeniden onaya düşer).
-- Panelde onay: yalnız hakaret / kişisel veri / ürünle ilgisiz içerik reddedilir; olumsuz yorum gizlenmez.

create table if not exists public.yorumlar (
  id uuid primary key default gen_random_uuid(),
  siparis_no text not null,
  urun_id text not null check (urun_id ~ '^[a-z0-9-]{1,80}$'),
  ad text not null check (char_length(ad) between 1 and 40),
  puan smallint not null check (puan between 1 and 5),
  metin text not null default '' check (char_length(metin) <= 1500),
  durum text not null default 'bekliyor' check (durum in ('bekliyor', 'yayinda', 'reddedildi')),
  yanit text check (yanit is null or char_length(yanit) <= 1000),
  olusturma timestamptz not null default now(),
  guncelleme timestamptz not null default now(),
  unique (siparis_no, urun_id)
);

create index if not exists yorumlar_urun_idx on public.yorumlar (urun_id, durum);
create index if not exists yorumlar_durum_idx on public.yorumlar (durum, olusturma desc);

alter table public.yorumlar enable row level security;

drop policy if exists yorumlar_sunucu_erisim on public.yorumlar;
create policy yorumlar_sunucu_erisim on public.yorumlar
  for all using ((select public.sunucu_yetkili_mi())) with check ((select public.sunucu_yetkili_mi()));
