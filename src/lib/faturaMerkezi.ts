/**
 * Fatura merkezi — web, Trendyol ve Hepsiburada siparişlerinin faturası tek listede.
 *
 * Faturayı mağaza sahibi GİB e-Arşiv Portalı'nda (earsivportal.efatura.gov.tr) elle keser. Bu dosya her sipariş için
 * portala yazılacak alıcı ve satır bilgilerini hazırlar: KDV dahil satış tutarından KDV hariç tutar ve KDV ayrılır.
 * 1.1.2026'dan beri e-Fatura/e-Arşiv'e geçmemiş mükellefler tüm faturaları GİB portalından e-Arşiv olarak düzenler
 * (basit usul ve işletme hesabı için 1.1.2027). Kağıt fatura yalnız bu istisnada geçerlidir.
 */
import type { EnvanterAyarlari, FaturaAlicisi, PazaryeriSiparisi } from './pazaryeri';
import { KANALLAR, PY_DURUM_ADLARI, SATIS_DURUMLARI } from './pazaryeri';
import type { Finans, FaturaKaydi } from './finans';
import { SIPARIS_DURUM_ADLARI, type Siparis } from './sema';
import { onayliSatis } from './yonetimRapor';

export type FaturaKanali = 'web' | 'trendyol' | 'hepsiburada';
export const FATURA_KANAL_ADLARI: Record<FaturaKanali, string> = { web: 'Web sitesi', ...KANALLAR };
/** Bireysel alıcının TCKN'si bilinmiyorsa e-Arşiv'de kullanılan genel numara */
export const GENEL_TCKN = '11111111111';
export const GIB_PORTAL = 'https://earsivportal.efatura.gov.tr/intragiris.html';

export type FaturaSatiri = {
  ad: string; adet: number; kdvOrani: number;
  /** kuruş */
  dahil: number; haric: number; kdv: number;
  /** TL, 4 haneye kadar (portal birim fiyatı KDV hariç ister) */
  birimHaric: number; birimDahil: number;
};
export type FaturaAdayi = {
  anahtar: string; kanal: FaturaKanali; kayit: string; siparisNo: string; paketNo?: string;
  tarih: string; durumAdi: string;
  alici: { tip: 'bireysel' | 'kurumsal'; ad: string; tckn?: string; firma?: string; vergiDairesi?: string; vergiNo?: string; adres: string; il?: string; ilce?: string; eposta?: string; tcknBilinmiyor: boolean };
  satirlar: FaturaSatiri[];
  toplam: { matrah: number; kdv: number; genel: number; oranlar: { oran: number; matrah: number; kdv: number }[] };
  aciklama: string;
  /** Kanalın verdiği bilgi eksikse */
  eksikler: string[];
  fatura?: FaturaKaydi;
  web?: Siparis;
  py?: PazaryeriSiparisi;
};

const yuvarla4 = (n: number) => Math.round(n * 10_000) / 10_000;
export function satirHesapla(ad: string, adet: number, dahil: number, kdvOrani: number): FaturaSatiri {
  const haric = Math.round(dahil * 100 / (100 + kdvOrani));
  return {
    ad: ad.slice(0, 200), adet, kdvOrani, dahil, haric, kdv: dahil - haric,
    birimHaric: yuvarla4(haric / 100 / adet), birimDahil: yuvarla4(dahil / 100 / adet),
  };
}
function toplamlar(satirlar: FaturaSatiri[]) {
  const oran = new Map<number, { oran: number; matrah: number; kdv: number }>();
  for (const s of satirlar) {
    const o = oran.get(s.kdvOrani) ?? { oran: s.kdvOrani, matrah: 0, kdv: 0 };
    o.matrah += s.haric; o.kdv += s.kdv;
    oran.set(s.kdvOrani, o);
  }
  return {
    matrah: satirlar.reduce((t, s) => t + s.haric, 0), kdv: satirlar.reduce((t, s) => t + s.kdv, 0),
    genel: satirlar.reduce((t, s) => t + s.dahil, 0), oranlar: [...oran.values()].sort((a, b) => b.oran - a.oran),
  };
}

/** Ürünün KDV oranı: Trendyol ilanı → Hepsiburada ayarı → %20 (mutfak eşyası genel oran). */
export const kdvBulucu = (f: Finans, ayar?: EnvanterAyarlari) => (urunId?: string): number =>
  (urunId ? ayar?.kanallar.trendyol.ilanlar[urunId]?.kdv ?? f.hbUrunler[urunId]?.kdv : undefined) ?? 20;

/** Kuruşu satırlara orantılı dağıtır (yuvarlama farkı en büyük satıra). */
function dagit(toplam: number, agirliklar: number[]): number[] {
  const t = agirliklar.reduce((a, b) => a + b, 0);
  if (!t) return agirliklar.map(() => 0);
  const parca = agirliklar.map((a) => Math.floor(toplam * a / t));
  const fark = toplam - parca.reduce((a, b) => a + b, 0);
  const en = agirliklar.indexOf(Math.max(...agirliklar));
  parca[en] = (parca[en] ?? 0) + fark;
  return parca;
}

function webAdayi(s: Siparis, kdv: (id?: string) => number): Omit<FaturaAdayi, 'fatura'> {
  const satirlar0 = s.kalemler.map((k) => ({ ad: k.ad + (k.sku ? ` (${k.sku})` : ''), adet: k.adet, dahil: Math.round(k.toplam * 100), oran: kdv(k.tip === 'urun' ? k.id : k.parcalar[0]?.urunId) }));
  const siparisIndirimi = Math.round((s.setIndirimi + s.sepetIndirimi) * 100);
  const dusum = dagit(siparisIndirimi, satirlar0.map((x) => x.dahil));
  const satirlar = satirlar0.map((x, i) => satirHesapla(x.ad, x.adet, Math.max(0, x.dahil - dusum[i]!), x.oran));
  if (s.kargo > 0) satirlar.push(satirHesapla('Kargo bedeli', 1, Math.round(s.kargo * 100), 20));
  // Sipariş toplamıyla kuruş farkı kalırsa ilk satıra yansıt (portalda toplam müşterinin ödediğiyle aynı olmalı)
  const fark = Math.round(s.toplam * 100) - satirlar.reduce((t, x) => t + x.dahil, 0);
  if (fark && satirlar[0]) satirlar[0] = satirHesapla(satirlar[0].ad, satirlar[0].adet, satirlar[0].dahil + fark, satirlar[0].kdvOrani);
  const kurumsal = s.fatura.tip === 'kurumsal';
  const adres = s.fatura.adres || `${s.teslimat.adres} ${s.teslimat.ilce}/${s.teslimat.il}`;
  const eksikler: string[] = [];
  if (kurumsal && (!s.fatura.vno || !s.fatura.vd)) eksikler.push('kurumsal alıcının vergi dairesi / numarası');
  return {
    anahtar: 'web:' + s.no, kanal: 'web', kayit: s.no, siparisNo: s.no, tarih: s.tarih,
    durumAdi: SIPARIS_DURUM_ADLARI[s.durum],
    alici: {
      tip: kurumsal ? 'kurumsal' : 'bireysel', ad: `${s.musteri.ad} ${s.musteri.soyad}`.trim(),
      tckn: kurumsal ? undefined : GENEL_TCKN, tcknBilinmiyor: !kurumsal,
      firma: s.fatura.firma, vergiDairesi: s.fatura.vd, vergiNo: s.fatura.vno,
      adres, il: s.teslimat.il, ilce: s.teslimat.ilce, eposta: s.musteri.eposta,
    },
    satirlar, toplam: toplamlar(satirlar), eksikler,
    aciklama: `alluluhome.com sipariş no: ${s.no}`,
    web: s,
  };
}

function pyAdayi(s: PazaryeriSiparisi, kdv: (id?: string) => number): Omit<FaturaAdayi, 'fatura'> {
  const kalemler = s.kalemler.filter((k) => SATIS_DURUMLARI.has(k.durum));
  const satirlar = kalemler.map((k) => satirHesapla(k.ad + (k.barkod ? ` (${k.barkod})` : ''), k.adet, k.tutar, kdv(k.urunId)));
  const fa: FaturaAlicisi = s.fatura ?? {};
  const kurumsal = Boolean(fa.vergiNo && fa.vergiNo.length === 10);
  const eksikler: string[] = [];
  if (!fa.adres) eksikler.push(`fatura adresi (${KANALLAR[s.kanal]} siparişinde gelmedi; satıcı panelinden bakın)`);
  return {
    anahtar: s.kanal + ':' + s.id, kanal: s.kanal, kayit: s.id, siparisNo: s.siparisNo, paketNo: s.paketNo, tarih: s.tarih,
    durumAdi: PY_DURUM_ADLARI[s.durum],
    alici: {
      tip: kurumsal ? 'kurumsal' : 'bireysel', ad: fa.ad ?? s.musteri ?? '',
      tckn: kurumsal ? undefined : fa.tckn || GENEL_TCKN, tcknBilinmiyor: !kurumsal && !fa.tckn,
      firma: fa.firma, vergiDairesi: fa.vergiDairesi, vergiNo: fa.vergiNo,
      adres: fa.adres ?? '', il: fa.il ?? s.il, ilce: fa.ilce ?? s.ilce, eposta: fa.eposta,
    },
    satirlar, toplam: toplamlar(satirlar), eksikler,
    aciklama: `${KANALLAR[s.kanal]} sipariş no: ${s.siparisNo}${s.paketNo && s.paketNo !== s.siparisNo ? ` · paket no: ${s.paketNo}` : ''}`,
    py: s,
  };
}

/**
 * Faturası kesilmesi gereken (ve kesilmiş) siparişler.
 * Web: ödemesi onaylı, iptal/iade olmamış. Pazaryeri: satış sayılan kalemi olan, stok başlangıcından sonraki paketler.
 */
export function faturaAdaylari(f: Finans, web: Siparis[], pazaryeri: PazaryeriSiparisi[], ayar?: EnvanterAyarlari): FaturaAdayi[] {
  const kdv = kdvBulucu(f, ayar);
  const kayitlar = new Map(f.faturalar.filter((x) => !x.iptal).map((x) => [x.kanal + ':' + x.kayit, x]));
  const adaylar: FaturaAdayi[] = [];
  for (const s of web) {
    const kesilen = kayitlar.get('web:' + s.no);
    if (!onayliSatis(s) && !kesilen) continue;
    adaylar.push({ ...webAdayi(s, kdv), fatura: kesilen });
  }
  for (const s of pazaryeri) {
    const kesilen = kayitlar.get(s.kanal + ':' + s.id);
    const satis = s.kalemler.some((k) => SATIS_DURUMLARI.has(k.durum)) && s.durum !== 'onay-bekliyor';
    if (!kesilen && (!satis || s.stokDisi)) continue;
    adaylar.push({ ...pyAdayi(s, kdv), fatura: kesilen });
  }
  return adaylar.sort((a, b) => Number(!!a.fatura) - Number(!!b.fatura) || Date.parse(a.tarih) - Date.parse(b.tarih));
}

/** TL metni (portala yazılacak biçim, ör. 10.832,50) */
export const tlYaz = (kurus: number) => (kurus / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const sayiYaz = (tl: number) => tl.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
