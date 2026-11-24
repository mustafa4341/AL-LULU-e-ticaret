/**
 * Hazırlık ve paketleme (24.11.2026): web + Trendyol + Hepsiburada siparişlerinden hazırlanacak olanlar tek listede,
 * toplu toplama listesi ve barkodla paket kontrolü için ortak biçim. Saf mantık (veritabanı/ağ yok).
 */
import { STOK_AKTIF, kodNormal, type PazaryeriSiparisi } from './pazaryeri';
import type { Magaza, Siparis, Urun } from './sema';
import { urunGtin } from './urunKimlik';

export type HazirlikKanali = 'web' | 'trendyol' | 'hepsiburada';
export type HazirlikKalemi = {
  urunId?: string;
  ad: string;
  adet: number;
  sku?: string;
  /** Okutulduğunda bu kaleme sayılan kodlar (kodNormal ile) */
  kodlar: string[];
  /** Ekranda gösterilecek ana barkod */
  barkod?: string;
  gorsel?: string;
};
export type HazirlikKaydi = {
  /** web:NO · trendyol-<paket> · hepsiburada-<sipariş> */
  anahtar: string;
  kanal: HazirlikKanali;
  no: string;
  tarih: string;
  musteri?: string;
  yer?: string;
  /** Hazırlanacak · Hazırlanıyor */
  asama: 'hazirlanacak' | 'hazirlaniyor';
  sonKargo?: string;
  kargoFirma?: string;
  kargoTakip?: string;
  kalemler: HazirlikKalemi[];
  href: string;
  /** Eşleşmeyen veya stok açığı olan kalem var: paketlemeden önce düzeltilmeli */
  sorun?: string;
};

const benzersiz = (x: (string | undefined)[]) => [...new Set(x.map((k) => kodNormal(k)).filter(Boolean))];

function urunKalemi(u: Urun | undefined, ad: string, adet: number, ek: (string | undefined)[] = []): HazirlikKalemi {
  const gtin = u ? urunGtin(u) : undefined;
  return {
    urunId: u?.id, ad: u ? `${u.marka} ${u.kisaAd}` : ad, adet, sku: u?.sku || undefined,
    kodlar: benzersiz([gtin, u?.sku, ...ek]), barkod: gtin ?? ek.find(Boolean) ?? u?.sku, gorsel: u?.gorseller[0]?.src,
  };
}

/** Aynı ürünün kalemlerini birleştirir (set parçası + tekil ürün aynı pakette olabilir) */
function birlestir(kalemler: HazirlikKalemi[]): HazirlikKalemi[] {
  const m = new Map<string, HazirlikKalemi>();
  for (const k of kalemler) {
    const anahtar = k.urunId ?? 'kod:' + (k.kodlar[0] ?? k.ad);
    const v = m.get(anahtar);
    if (v) { v.adet += k.adet; v.kodlar = benzersiz([...v.kodlar, ...k.kodlar]); }
    else m.set(anahtar, { ...k, kodlar: [...k.kodlar] });
  }
  return [...m.values()];
}

export function webHazirlik(s: Siparis, m: Pick<Magaza, 'urunler'>): HazirlikKaydi | undefined {
  if (s.paytr?.test || !['odendi', 'hazirlaniyor'].includes(s.durum)) return undefined;
  const urunler = new Map(m.urunler.map((u) => [u.id, u]));
  const kalemler: HazirlikKalemi[] = [];
  for (const k of s.kalemler) {
    const parcalar = k.parcalar.length ? k.parcalar : [{ urunId: k.id, adet: 1 }];
    for (const p of parcalar) kalemler.push(urunKalemi(urunler.get(p.urunId), k.ad, p.adet * k.adet, [k.tip === 'urun' ? k.sku : undefined]));
  }
  return {
    anahtar: 'web:' + s.no, kanal: 'web', no: s.no, tarih: s.tarih, musteri: `${s.musteri.ad} ${s.musteri.soyad}`.trim(),
    yer: [s.teslimat.ilce, s.teslimat.il].filter(Boolean).join(' / '), asama: s.durum === 'odendi' ? 'hazirlanacak' : 'hazirlaniyor',
    kargoFirma: s.kargoFirma, kargoTakip: s.kargoTakip, kalemler: birlestir(kalemler), href: '/yonetim/siparisler/' + encodeURIComponent(s.no),
    sorun: s.paytr?.stokEksik ? 'Ödeme alındı ama stok ayrılamadı' : undefined,
  };
}

export function pazaryeriHazirlik(s: PazaryeriSiparisi, m: Pick<Magaza, 'urunler'>): HazirlikKaydi | undefined {
  if (s.stokDisi) return undefined;
  const bekleyen = s.kalemler.filter((k) => k.durum === 'yeni' || k.durum === 'hazirlaniyor');
  if (!bekleyen.length) return undefined;
  const urunler = new Map(m.urunler.map((u) => [u.id, u]));
  const eslesmeyen = bekleyen.filter((k) => !k.urunId).length;
  const eksik = bekleyen.filter((k) => STOK_AKTIF.has(k.durum)).reduce((t, k) => t + k.eksik, 0);
  return {
    anahtar: s.id, kanal: s.kanal, no: s.siparisNo, tarih: s.tarih, musteri: s.musteri, yer: [s.ilce, s.il].filter(Boolean).join(' / '),
    asama: bekleyen.some((k) => k.durum === 'yeni') ? 'hazirlanacak' : 'hazirlaniyor', sonKargo: s.sonKargoTarihi,
    kargoFirma: s.kargoFirma, kargoTakip: s.kargoTakip,
    kalemler: birlestir(bekleyen.map((k) => urunKalemi(k.urunId ? urunler.get(k.urunId) : undefined, k.ad, k.adet, [k.barkod, k.stokKodu]))),
    href: '/yonetim/siparisler/pazaryeri/' + encodeURIComponent(s.id),
    sorun: eslesmeyen ? `${eslesmeyen} ürün eşleşmedi` : eksik ? `${eksik} adet stok açığı` : undefined,
  };
}

/** Hazırlanacak tüm siparişler: en yakın son kargo tarihi (yoksa en eski sipariş) önce */
export function hazirlikListesi(web: Siparis[], py: PazaryeriSiparisi[], m: Pick<Magaza, 'urunler'>): HazirlikKaydi[] {
  const liste = [
    ...web.map((s) => webHazirlik(s, m)),
    ...py.map((s) => pazaryeriHazirlik(s, m)),
  ].filter((x): x is HazirlikKaydi => !!x);
  const sira = (x: HazirlikKaydi) => Date.parse(x.sonKargo ?? '') || Date.parse(x.tarih) + 3 * 86_400_000;
  return liste.sort((a, b) => Number(a.asama !== 'hazirlanacak') - Number(b.asama !== 'hazirlanacak') || sira(a) - sira(b));
}

export type ToplamaSatiri = HazirlikKalemi & { siparisler: { no: string; kanal: HazirlikKanali; adet: number }[] };

/** Seçilen siparişlerin ürünlerini depo toplama sırasına göre gruplar (aynı üründen kaç adet, hangi siparişlere) */
export function toplamaListesi(kayitlar: HazirlikKaydi[]): ToplamaSatiri[] {
  const m = new Map<string, ToplamaSatiri>();
  for (const s of kayitlar) for (const k of s.kalemler) {
    const anahtar = k.urunId ?? 'kod:' + (k.kodlar[0] ?? k.ad);
    const v = m.get(anahtar) ?? { ...k, adet: 0, kodlar: [...k.kodlar], siparisler: [] };
    v.adet += k.adet;
    v.siparisler.push({ no: s.no, kanal: s.kanal, adet: k.adet });
    m.set(anahtar, v);
  }
  return [...m.values()].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

export type OkutmaSonucu = { durum: 'tamam' | 'fazla' | 'tanimsiz'; indeks?: number };

/** Okutulan kodu kalemlerden birine sayar. `sayac` kalem başına okutulan adettir (değiştirilir). */
export function okut(kod: string, kalemler: Pick<HazirlikKalemi, 'kodlar' | 'adet'>[], sayac: number[]): OkutmaSonucu {
  const k = kodNormal(kod);
  if (!k) return { durum: 'tanimsiz' };
  const adaylar = kalemler.map((x, i) => ({ x, i })).filter(({ x }) => x.kodlar.includes(k));
  if (!adaylar.length) return { durum: 'tanimsiz' };
  const bos = adaylar.find(({ x, i }) => (sayac[i] ?? 0) < x.adet);
  if (!bos) return { durum: 'fazla', indeks: adaylar[0]!.i };
  sayac[bos.i] = (sayac[bos.i] ?? 0) + 1;
  return { durum: 'tamam', indeks: bos.i };
}
