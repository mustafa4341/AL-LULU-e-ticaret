-- Finans kayıtları (_finans/kayitlar.json) için koşullu yazma (denetim AUD-001).
-- Sunucu kaydı okurken içeriğin md5 özetini alır; yazarken bu özet hâlâ aynıysa yazar, değilse PT409 döner.
-- Böylece aynı anda çalışan iki sunucu kopyası birbirinin kaydını sessizce ezemez.
-- p_eski_md5 null ise kayıt yalnız HİÇ YOKSA oluşturulur (boş finans, var olan kaydın üstüne yazılamaz).
-- Uygulama bu fonksiyon yoksa (PGRST202) eski yönteme (yazmadan hemen önce yeniden okuyup karşılaştırma) düşer.

create or replace function public.medya_kosullu_yaz(
  p_yol text,
  p_icerik_turu text,
  p_veri_base64 text,
  p_boyut integer,
  p_eski_md5 text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select public.sunucu_yetkili_mi()) then
    raise exception 'yetkisiz' using errcode = '42501';
  end if;
  if p_eski_md5 is null then
    insert into public.medya_dosyalari (yol, icerik_turu, boyut, veri_base64, aktif)
    values (p_yol, p_icerik_turu, greatest(1, p_boyut), p_veri_base64, true)
    on conflict (yol) do nothing;
    if not found then
      raise exception 'kayit-zaten-var' using errcode = 'PT409';
    end if;
    return true;
  end if;
  update public.medya_dosyalari
     set icerik_turu = p_icerik_turu,
         boyut = greatest(1, p_boyut),
         veri_base64 = p_veri_base64,
         aktif = true
   where yol = p_yol
     and aktif
     and pg_catalog.md5(veri_base64) = p_eski_md5;
  if not found then
    raise exception 'kayit-degisti' using errcode = 'PT409';
  end if;
  return true;
end;
$$;

revoke all on function public.medya_kosullu_yaz(text, text, text, integer, text) from public;
grant execute on function public.medya_kosullu_yaz(text, text, text, integer, text) to anon, authenticated, service_role;
