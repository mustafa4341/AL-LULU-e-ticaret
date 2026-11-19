/**
 * Ürün değerlendirmeleri (Supabase "yorumlar" tablosu, migration 20261119120000).
 * Kural (Yön. m.28/B): yalnızca ürünü gerçekten satın almış müşteri yorum yazar → her yorum bir siparişe bağlı,
 * müşteri yalnız sipariş takip bağlantısıyla (token) ve sipariş "teslim edildi" olduktan sonra yazabilir.
 * Panelde onaylanan yorumlar ürün sayfasında ve Google yapısal verisinde (aggregateRating/review) görünür.
 * Olumsuz yorum gizlenmez; yalnız hakaret, kişisel veri veya ürünle ilgisiz içerik reddedilir.
 */
import { supabaseIstemci } from './depo';
import type { Siparis } from './sema';

export type YorumDurumu = 'bekliyor' | 'yayinda' | 'reddedildi';
export interface Yorum {
  id: string; siparisNo: string; urunId: string; ad: string; puan: number; metin: string;
  durum: YorumDurumu; yanit?: string; tarih: string;
}
type Satir = { id: string; siparis_no: string; urun_id: string; ad: string; puan: number; metin: string; durum: string; yanit: string | null; olusturma: string };

const donustur = (r: Satir): Yorum => ({
  id: r.id, siparisNo: r.siparis_no, urunId: r.urun_id, ad: r.ad, puan: r.puan, metin: r.metin,
  durum: r.durum as YorumDurumu, yanit: r.yanit ?? undefined, tarih: r.olusturma,
});

/** "Ayşe Yılmaz" → "Ayşe Y." (tam soyad yayınlanmaz) */
export const gorunenAd = (ad: string, soyad: string) =>
  `${ad.trim().split(/\s+/)[0] ?? ''} ${soyad.trim().charAt(0).toLocaleUpperCase('tr')}.`.trim().slice(0, 40);

/** Siparişteki değerlendirilebilir ürünler (setler parçalarına açılır) */
export function siparisUrunleri(s: Siparis, adBul?: (id: string) => string | undefined): { id: string; ad: string }[] {
  const harita = new Map<string, string>();
  for (const k of s.kalemler) {
    if (k.tip === 'urun') harita.set(k.id, k.ad);
    else for (const p of k.parcalar) harita.set(p.urunId, adBul?.(p.urunId) ?? k.ad);
  }
  return [...harita].map(([id, ad]) => ({ id, ad }));
}

export const yorumYazilabilir = (s: Siparis) => s.durum === 'teslim-edildi';

/** Ürün sayfası: yayındaki yorumlar (yeniden eskiye) */
export async function urunYorumlari(urunId: string): Promise<Yorum[]> {
  const sb = supabaseIstemci();
  if (!sb) return [];
  const { data, error } = await sb.from('yorumlar').select('*').eq('urun_id', urunId).eq('durum', 'yayinda').order('olusturma', { ascending: false }).limit(200);
  if (error || !data) return [];
  return data.map(donustur);
}

export function ozet(yorumlar: Yorum[]) {
  const adet = yorumlar.length;
  const ortalama = adet ? Math.round((yorumlar.reduce((t, y) => t + y.puan, 0) / adet) * 10) / 10 : 0;
  return { adet, ortalama };
}

/** Müşterinin bu siparişteki yorumları (durum dahil) */
export async function siparisYorumlari(no: string): Promise<Yorum[]> {
  const sb = supabaseIstemci();
  if (!sb) return [];
  const { data } = await sb.from('yorumlar').select('*').eq('siparis_no', no);
  return (data ?? []).map(donustur);
}

/** Müşteri yorumu kaydeder; aynı sipariş+ürün için yeniden yazılırsa günceller ve tekrar onaya düşer */
export async function yorumKaydet(s: Siparis, girdi: { urunId: string; puan: number; metin: string }): Promise<void> {
  const sb = supabaseIstemci();
  if (!sb) throw new Error('Değerlendirmeler şu anda kaydedilemiyor.');
  if (!yorumYazilabilir(s)) throw new Error('Siparişiniz teslim edildikten sonra değerlendirme yazabilirsiniz.');
  if (!siparisUrunleri(s).some((u) => u.id === girdi.urunId)) throw new Error('Bu ürün siparişinizde yok.');
  const { error } = await sb.from('yorumlar').upsert({
    siparis_no: s.no, urun_id: girdi.urunId, ad: gorunenAd(s.musteri.ad, s.musteri.soyad),
    puan: girdi.puan, metin: girdi.metin, durum: 'bekliyor', guncelleme: new Date().toISOString(),
  }, { onConflict: 'siparis_no,urun_id' });
  if (error) throw new Error('Değerlendirme kaydedilemedi: ' + error.message);
}

/** Panel: tüm yorumlar (en yeni önce) */
export async function tumYorumlar(): Promise<Yorum[]> {
  const sb = supabaseIstemci();
  if (!sb) return [];
  const { data } = await sb.from('yorumlar').select('*').order('olusturma', { ascending: false }).limit(500);
  return (data ?? []).map(donustur);
}

export async function yorumGuncelle(id: string, d: { durum?: YorumDurumu; yanit?: string | null }): Promise<void> {
  const sb = supabaseIstemci();
  if (!sb) throw new Error('Supabase bağlı değil.');
  const { error } = await sb.from('yorumlar').update({ ...d, guncelleme: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}
