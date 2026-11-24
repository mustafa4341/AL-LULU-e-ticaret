-- Vitrin "çok satan" hesabı için hafif özet (denetim AUD-015).
-- Eskiden her vitrin isteği siparisleri_oku() ile TÜM siparişleri (ad, telefon, adres…) okuyordu.
-- Bu fonksiyon yalnız ürün kimliği → satılan adet döndürür; müşteri bilgisi dönmez.
-- Kural lib/depo.ts satisAdetleri ile aynı: test ödemesi, ödeme bekleyen, iptal ve iadesi tamamlanan siparişler sayılmaz.

create or replace function public.satis_adetleri(p_gun integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(urun_id, adet), '{}'::jsonb)
  from (
    select p->>'urunId' as urun_id, sum((p->>'adet')::int * (k->>'adet')::int)::int as adet
    from public.siparisler s
    cross join lateral jsonb_array_elements(s.kalemler) k
    cross join lateral jsonb_array_elements(coalesce(k->'parcalar', '[]'::jsonb)) p
    where (select public.sunucu_yetkili_mi())
      and s.tarih >= now() - make_interval(days => greatest(1, least(p_gun, 365)))
      and s.durum not in ('odeme-bekliyor', 'iptal')
      and coalesce((s.paytr->>'test')::boolean, false) = false
      and not exists (select 1 from jsonb_array_elements(s.gecmis) g where g->>'islem' = 'iade-tamamlandi')
      and p->>'urunId' is not null
    group by p->>'urunId'
  ) t;
$$;

revoke all on function public.satis_adetleri(integer) from public;
grant execute on function public.satis_adetleri(integer) to anon, authenticated, service_role;
