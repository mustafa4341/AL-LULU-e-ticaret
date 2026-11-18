-- Sipariş e-posta kayıtları (18.11.2026)
-- NEDEN: Aynı e-posta iki kez gitmesin (PayTR bildirimi tekrar gelebilir, panelde iki kez basılabilir)
-- ve panelde her siparişin e-postalarının durumu (gönderildi / hata) görünsün, gerekirse yeniden gönderilsin.
-- Anahtar: "<tür>:<sipariş no>", ör. "alindi:AL-251118-4821", "durum-kargoda:AL-251118-4821".

create table if not exists public.eposta_kayitlari (
  anahtar text primary key check (char_length(anahtar) between 3 and 160),
  siparis_no text not null,
  tur text not null,
  alici text not null,
  durum text not null default 'gonderiliyor' check (durum in ('gonderiliyor', 'gonderildi', 'hata')),
  deneme integer not null default 0,
  son_hata text,
  mesaj_id text,
  olusturma timestamptz not null default now(),
  gonderim timestamptz,
  guncelleme timestamptz not null default now()
);

create index if not exists eposta_kayitlari_siparis_idx on public.eposta_kayitlari (siparis_no);

alter table public.eposta_kayitlari enable row level security;

drop policy if exists eposta_kayitlari_sunucu_erisim on public.eposta_kayitlari;
create policy eposta_kayitlari_sunucu_erisim on public.eposta_kayitlari
  for all using ((select public.sunucu_yetkili_mi())) with check ((select public.sunucu_yetkili_mi()));

-- Gönderim hakkını atomik olarak alır. true dönerse çağıran e-postayı gönderir.
-- Gönderilmişse (zorla değilse) veya başka bir istek şu an gönderiyorsa (5 dk içinde) false döner.
create or replace function public.eposta_gonderim_al(
  p_anahtar text, p_siparis_no text, p_tur text, p_alici text, p_zorla boolean default false
)
 returns boolean
 language plpgsql
 set search_path to ''
as $function$
declare
  kayit public.eposta_kayitlari%rowtype;
begin
  if not public.sunucu_yetkili_mi() then
    raise exception 'Yetkisiz işlem' using errcode = '42501';
  end if;

  insert into public.eposta_kayitlari (anahtar, siparis_no, tur, alici, durum, deneme)
  values (p_anahtar, p_siparis_no, p_tur, p_alici, 'gonderiliyor', 1)
  on conflict (anahtar) do nothing;
  if found then
    return true;
  end if;

  select * into kayit from public.eposta_kayitlari where anahtar = p_anahtar for update;
  if kayit.durum = 'gonderildi' and not coalesce(p_zorla, false) then
    return false;
  end if;
  if kayit.durum = 'gonderiliyor' and kayit.guncelleme > now() - interval '5 minutes' then
    return false;
  end if;

  update public.eposta_kayitlari
     set durum = 'gonderiliyor', deneme = deneme + 1, alici = p_alici, son_hata = null, guncelleme = now()
   where anahtar = p_anahtar;
  return true;
end;
$function$;

revoke all on function public.eposta_gonderim_al(text, text, text, text, boolean) from public;
grant execute on function public.eposta_gonderim_al(text, text, text, text, boolean) to anon, authenticated, service_role;
