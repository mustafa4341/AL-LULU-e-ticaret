/**
 * Trendyol ürün bazında kârlılık (24.11.2026). Kaynaklar:
 *  • Pazaryeri siparişleri (hangi siparişte hangi üründen kaç adet, kaç TL)
 *  • Trendyol cari hesap ekstresi (Finans › Trendyol; günde bir API'den): sipariş başına komisyon, kargo, indirim, iade, diğer
 *  • Ürün alış maliyeti (KDV hariç; Finans › Hepsiburada kâr hesaplayıcısında ürün için kaydedilen)
 * Sipariş düzeyindeki kesintiler ürünlere satış tutarı oranında dağıtılır. Ekstresi henüz gelmeyen siparişlerde komisyon,
 * ekstresi gelen siparişlerin ortalama oranıyla TAHMİN edilir ve işaretlenir.
 * Tutarlar kuruş. "Net kâr (tahmini)" KDV hariç hesaplanır: satış ve kesintilerdeki KDV düşülür (kesin kâr muhasebecinizden).
 */
import type { Finans, TrendyolSatiri } from './finans';
import { SATIS_DURUMLARI, type PazaryeriSiparisi } from './pazaryeri';
import type { Magaza } from './sema';

export type KarSatiri = {
  urunId?: string; ad: string; adet: number;
  brut: number; indirim: number; iade: number; komisyon: number; kargo: number; diger: number;
  hakedis: number; maliyet?: number; netKar?: number; marj?: number;
  tahmini: number; siparis: number;
};
export type KarRaporu = { satirlar: KarSatiri[]; toplam: KarSatiri; siparisDisi: number; ortalamaKomisyon?: number; ekstresiz: number };

const KDV_KESINTI = 1.2; // kargo kesinti faturaları %20 KDV dahil gelir

/**
 * `komisyonOrani`: ürünün Trendyol ilanındaki komisyon oranı (0,13 = %13, KDV dahil). Ekstresi gelmemiş siparişte ortalama yerine bu kullanılır.
 * Not: Trendyol'da komisyon KDV DAHİL kesilir (doğrulama: TY-11861062951 satış 1.100,00 TL − komisyon 31,90 TL = hakediş 1.068,10 TL);
 * komisyon mutabakat faturası ile gelen %20 KDV indirilecek KDV olduğu için net kâr hesabında 1,2'ye bölünür.
 */
export function trendyolKarlilik(
  py: PazaryeriSiparisi[], f: Pick<Finans, 'trendyol' | 'hbUrunler'>, m: Pick<Magaza, 'urunler'>, gun: number,
  kdvOrani = (_urunId?: string) => 20, komisyonOrani: (urunId?: string) => number | undefined = () => undefined,
): KarRaporu {
  const sinir = Date.now() - gun * 86_400_000;
  const ekstre = new Map<string, TrendyolSatiri>();
  for (const x of f.trendyol) if (x.id.startsWith('TY-') && !x.id.startsWith('TY-K-')) ekstre.set(x.id.slice(3), x);
  const siparisDisi = f.trendyol.filter((x) => x.id.startsWith('TY-K-') && Date.parse(x.tarih) >= sinir)
    .reduce((t, x) => t + x.hizmet + x.kargo + x.diger + x.komisyon, 0);
  const siparisler = py.filter((s) => s.kanal === 'trendyol' && !s.stokDisi && Date.parse(s.tarih) >= sinir
    && (SATIS_DURUMLARI.has(s.durum) || s.durum === 'iade' || ekstre.has(s.siparisNo)));
  // Ekstresi gelen siparişlerin ortalama komisyon oranı (tahmin için)
  const ekstreli = siparisler.map((s) => ekstre.get(s.siparisNo)).filter((x): x is TrendyolSatiri => !!x && x.brut > 0);
  const brutToplam = ekstreli.reduce((t, x) => t + x.brut, 0);
  const ortalamaKomisyon = brutToplam ? ekstreli.reduce((t, x) => t + x.komisyon, 0) / brutToplam : undefined;
  const urunler = new Map(m.urunler.map((u) => [u.id, u]));
  const satir = new Map<string, KarSatiri>();
  const bos = (urunId: string | undefined, ad: string): KarSatiri => ({ urunId, ad, adet: 0, brut: 0, indirim: 0, iade: 0, komisyon: 0, kargo: 0, diger: 0, hakedis: 0, tahmini: 0, siparis: 0 });
  let ekstresiz = 0;
  for (const s of siparisler) {
    const kalemler = s.kalemler.filter((k) => SATIS_DURUMLARI.has(k.durum) || k.durum === 'iade');
    if (!kalemler.length) continue;
    const toplamTutar = kalemler.reduce((t, k) => t + k.tutar, 0) || 1;
    const e = ekstre.get(s.siparisNo);
    if (!e) ekstresiz++;
    for (const k of kalemler) {
      const pay = k.tutar / toplamTutar;
      const anahtar = k.urunId ?? 'ad:' + k.ad;
      const u = k.urunId ? urunler.get(k.urunId) : undefined;
      const r = satir.get(anahtar) ?? bos(k.urunId, u ? `${u.marka} ${u.kisaAd}` : k.ad);
      r.siparis++;
      if (e) {
        r.adet += k.durum === 'iade' ? 0 : k.adet;
        r.brut += Math.round(e.brut * pay); r.indirim += Math.round(e.indirim * pay); r.iade += Math.round(e.iade * pay);
        r.komisyon += Math.round(e.komisyon * pay); r.kargo += Math.round(e.kargo * pay); r.diger += Math.round((e.hizmet + e.diger) * pay);
      } else {
        if (k.durum === 'iade') { satir.set(anahtar, r); continue; }
        r.adet += k.adet;
        r.brut += k.tutar;
        const oran = komisyonOrani(k.urunId) ?? ortalamaKomisyon;
        if (oran !== undefined) r.komisyon += Math.round(k.tutar * oran);
        r.tahmini++;
      }
      satir.set(anahtar, r);
    }
  }
  const tamamla = (r: KarSatiri) => {
    r.hakedis = r.brut - r.indirim - r.iade - r.komisyon - r.kargo - r.diger;
    const birimMaliyet = r.urunId ? f.hbUrunler[r.urunId]?.maliyet : undefined;
    if (birimMaliyet !== undefined && r.urunId) {
      r.maliyet = birimMaliyet * r.adet;
      const kdv = kdvOrani(r.urunId);
      const satisKdvHaric = (r.brut - r.indirim - r.iade) / (1 + kdv / 100);
      const kesintiKdvHaric = (r.komisyon + r.kargo) / KDV_KESINTI + r.diger;
      r.netKar = Math.round(satisKdvHaric - kesintiKdvHaric - r.maliyet);
      r.marj = satisKdvHaric > 0 ? r.netKar / satisKdvHaric : undefined;
    }
    return r;
  };
  const satirlar = [...satir.values()].map(tamamla).sort((a, b) => b.brut - a.brut);
  const toplam = bos(undefined, 'Toplam');
  for (const r of satirlar) {
    for (const a of ['adet', 'brut', 'indirim', 'iade', 'komisyon', 'kargo', 'diger', 'hakedis', 'tahmini', 'siparis'] as const) toplam[a] += r[a];
    if (r.maliyet !== undefined) toplam.maliyet = (toplam.maliyet ?? 0) + r.maliyet;
    if (r.netKar !== undefined) toplam.netKar = (toplam.netKar ?? 0) + r.netKar;
  }
  return { satirlar, toplam, siparisDisi, ortalamaKomisyon, ekstresiz };
}
