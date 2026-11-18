-- Kalıcı istek sınırı (18.11.2026)
-- NEDEN: Vercel'de her istek ayrı bir sunucu kopyasında çalışabilir; bellekte tutulan
-- "IP başına 5 hatalı giriş" gibi sayaçlar kopyalar arasında paylaşılmaz ve etkisiz kalır.
-- Sayaç burada tutulur. Anahtar, sunucuda HMAC ile özetlenmiş IP'dir (ham IP saklanmaz).

create table if not exists public.istek_sinirlari (
  anahtar text primary key check (char_length(anahtar) between 8 and 120),
  pencere_bas timestamptz not null default now(),
  sayi integer not null default 0
);

alter table public.istek_sinirlari enable row level security;

drop policy if exists istek_sinirlari_sunucu_erisim on public.istek_sinirlari;
create policy istek_sinirlari_sunucu_erisim on public.istek_sinirlari
  for all using ((select public.sunucu_yetkili_mi())) with check ((select public.sunucu_yetkili_mi()));

-- p_artir: 0 = yalnız oku, 1 = say, null = sıfırla. Dönen değer: bu penceredeki deneme sayısı.
create or replace function public.istek_say(p_anahtar text, p_pencere_sn integer, p_artir integer)
 returns integer
 language plpgsql
 set search_path to ''
as $function$
declare
  kayit public.istek_sinirlari%rowtype;
begin
  if not public.sunucu_yetkili_mi() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;
  if p_anahtar is null or char_length(p_anahtar) not between 8 and 120 or p_pencere_sn not between 1 and 86400 then
    raise exception 'Geçersiz istek sınırı' using errcode = '22023';
  end if;

  if p_artir is null then
    delete from public.istek_sinirlari where anahtar = p_anahtar;
    return 0;
  end if;

  -- Ara sıra bir günden eski kayıtları temizle (tablo büyümesin)
  if random() < 0.02 then
    delete from public.istek_sinirlari where pencere_bas < now() - interval '1 day';
  end if;

  insert into public.istek_sinirlari (anahtar, pencere_bas, sayi)
  values (p_anahtar, now(), 0)
  on conflict (anahtar) do nothing;

  select * into kayit from public.istek_sinirlari where anahtar = p_anahtar for update;
  if kayit.pencere_bas < now() - make_interval(secs => p_pencere_sn) then
    kayit.sayi := 0;
    kayit.pencere_bas := now();
  end if;
  kayit.sayi := kayit.sayi + greatest(p_artir, 0);

  update public.istek_sinirlari
     set sayi = kayit.sayi, pencere_bas = kayit.pencere_bas
   where anahtar = p_anahtar;
  return kayit.sayi;
end;
$function$;

revoke all on function public.istek_say(text, integer, integer) from public;
grant execute on function public.istek_say(text, integer, integer) to anon, authenticated, service_role;
