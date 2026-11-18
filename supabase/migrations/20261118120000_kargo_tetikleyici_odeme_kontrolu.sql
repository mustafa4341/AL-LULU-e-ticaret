-- Ödenmemiş sipariş, yalnızca kargo takip numarası girildi diye "kargoda" olmasın.
-- Önceki sürüm 'odeme-bekliyor' durumundaki siparişi de otomatik "kargoda" yapıyordu.
-- Panel bu geçişe hiç izin vermez (önce ödeme onayı ve stok düşümü gerekir); ancak Supabase
-- tablo düzenleyicisinden takip no yazılırsa ödeme alınmadan ve stok düşülmeden sipariş "Kargoda"
-- görünüyordu. Artık yalnızca ödenmiş ('odendi') veya hazırlanan siparişler otomatik kargoya geçer.
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

  -- Kargo takip numarası ilk kez girildiyse ve sipariş ÖDENMİŞ ama henüz kargoya geçmemişse otomatik 'kargoda' yap
  if tg_op = 'UPDATE'
     and nullif(btrim(coalesce(new.kargo_takip, '')), '') is not null
     and nullif(btrim(coalesce(old.kargo_takip, '')), '') is null
     and new.durum in ('odendi', 'hazirlaniyor') then
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
