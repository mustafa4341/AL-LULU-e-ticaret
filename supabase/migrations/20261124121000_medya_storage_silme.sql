-- Panelden silinen ürün görselinin Storage'daki herkese açık kopyası da silinebilsin (denetim AUD-026).
-- Eskiden storage.objects için DELETE politikası yoktu; silinen görseller Storage'da sonsuza dek açık kalıyordu.
drop policy if exists "medya_sunucu_delete" on storage.objects;
create policy "medya_sunucu_delete" on storage.objects
  for delete using (bucket_id = 'medya' and (select public.sunucu_yetkili_mi()));
