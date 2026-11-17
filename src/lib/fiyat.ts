/**
 * Fiyat hesapları — hem sunucuda hem tarayıcıda AYNI kod çalışır,
 * böylece sepette gördüğünüz tutar ile siparişe yazılan tutar asla ayrışmaz.
 */
import type { FiyatKaydi } from './sema';

const GUN = 24 * 60 * 60 * 1000;

export function formatTL(n: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' TL';
}

/** [bas, son) aralığında yürürlükte olan fiyatlar (aralığın başında geçerli olan fiyat dahil).
 *  tamKapsam: ürün aralığın tamamında satıştaysa (ilk kayıt aralık başından önceyse) fiyatları, değilse null döner. */
export function pencereFiyatlari(gecmis: FiyatKaydi[], bas: number, son: number, tamKapsam: true): number[] | null;
export function pencereFiyatlari(gecmis: FiyatKaydi[], bas: number, son: number, tamKapsam?: false): number[];
export function pencereFiyatlari(gecmis: FiyatKaydi[], bas: number, son: number, tamKapsam = false): number[] | null {
  const sirali = [...gecmis].sort((a, b) => Date.parse(a.tarih) - Date.parse(b.tarih));
  const sonuc: number[] = [];
  let baslangictaGecerli: number | undefined;
  for (const k of sirali) {
    const t = Date.parse(k.tarih);
    if (t <= bas) baslangictaGecerli = k.fiyat;
    else if (t < son) sonuc.push(k.fiyat);
  }
  if (baslangictaGecerli !== undefined) sonuc.unshift(baslangictaGecerli);
  else if (tamKapsam) return null;
  return sonuc;
}

/**
 * İndirimde gösterilecek "önceki fiyat":
 * kampanya başlangıcından önceki `gun` gün içinde uygulanan EN DÜŞÜK fiyat.
 * Mevzuata uygun hesap budur; elle "eski fiyat" girilemez.
 */
export function oncekiFiyat(gecmis: FiyatKaydi[], kampanyaBaslangic: string, gun: number, guncelFiyat: number): number | undefined {
  const bas = Date.parse(kampanyaBaslangic);
  if (Number.isNaN(bas)) return undefined;
  // Ürün referans süresinin tamamında satışta değilse (yeni ürün) indirim gösterilmez.
  const fiyatlar = pencereFiyatlari(gecmis, bas - gun * GUN, bas, true);
  if (!fiyatlar?.length) return undefined;
  const enDusuk = Math.min(...fiyatlar);
  return enDusuk > guncelFiyat ? enDusuk : undefined;
}

/** "Son N günün en düşük fiyatı": şu anki fiyat son N gündeki en düşük VE arada daha yüksek bir fiyat uygulanmış. */
export function sonGunlerinEnDusugu(gecmis: FiyatKaydi[], gun: number, guncelFiyat: number, simdi = Date.now()): boolean {
  const fiyatlar = pencereFiyatlari(gecmis, simdi - gun * GUN, simdi + 1, true);
  if (!fiyatlar || fiyatlar.length < 2) return false;
  return guncelFiyat <= Math.min(...fiyatlar) && Math.max(...fiyatlar) > guncelFiyat;
}

export function sepetteFiyat(fiyat: number, yuzde: number): number {
  return yuzde > 0 ? fiyat - Math.round((fiyat * yuzde) / 100) : fiyat;
}

/* ------------------------------------------------------------------
   Sepet hesabı (tarayıcı + sunucu ortak)
   ------------------------------------------------------------------ */
export interface IstemciUrun {
  id: string;
  marka: string;
  kisaAd: string;
  fiyat: number;
  /** Fiyat geçmişinden doğrulanmış önceki fiyat (yalnız gerçek indirimde; sepette "X TL avantaj" bilgisi için) */
  onceki?: number;
  sepetteIndirim: number;
  /** Fırsat bitişi (ISO). Geçince sepette indirim tarayıcıda da sunucuda da 0 olur. */
  firsatBitis?: string;
  maxAdet: number;
  sku: string;
  gorsel?: string;
  ikon: string;
  birlikte: string[];
}
export interface IstemciSet {
  id: string;
  ad: string;
  kalemler: { urunId: string; adet: number }[];
  fiyat: number;
  ayriAyri: number;
  gorsel?: string;
}
export interface IstemciKatalog {
  urunler: Record<string, IstemciUrun>;
  setler: Record<string, IstemciSet>;
  heroId: string;
  kargo: { ucret: number; ucretsizEsik: number; kesimSaati: number; teslimGun: [number, number] };
  whatsapp: string;
}

export type KalemTipi = 'urun' | 'set';
export interface SepetKalemi { tip: KalemTipi; id: string; adet: number }

export interface HesapSatiri extends SepetKalemi {
  ad: string;
  sku?: string;
  gorsel?: string;
  ikon: string;
  href: string;
  icerik?: string;
  parcalar: { urunId: string; adet: number }[];
  birimFiyat: number;
  /** Set için ayrı ayrı birim toplam */
  birimAyriAyri?: number;
  /** Sepette indirim yüzdesi (yalnız ürün) */
  sepetteYuzde: number;
  /** Satırdaki toplam indirim (sepette indirim) */
  indirim: number;
  toplam: number;
}

/** Fırsat süresi dolduysa sepette indirim geçersizdir */
export function gecerliSepetteIndirim(u: { sepetteIndirim: number; firsatBitis?: string }, simdi = Date.now()): number {
  if (u.firsatBitis && simdi >= Date.parse(u.firsatBitis)) return 0;
  return u.sepetteIndirim;
}

export function satirCozumle(k: SepetKalemi, ik: IstemciKatalog): HesapSatiri | null {
  if (k.tip === 'urun') {
    const u = ik.urunler[k.id];
    if (!u) return null;
    const yuzde = gecerliSepetteIndirim(u);
    const birimIndirim = u.fiyat - sepetteFiyat(u.fiyat, yuzde);
    return {
      ...k, ad: `${u.marka} ${u.kisaAd}`, sku: u.sku || undefined, gorsel: u.gorsel, ikon: u.ikon, href: `/urun/${u.id}`,
      parcalar: [{ urunId: u.id, adet: 1 }], birimFiyat: u.fiyat, sepetteYuzde: yuzde,
      indirim: birimIndirim * k.adet, toplam: (u.fiyat - birimIndirim) * k.adet,
    };
  }
  const s = ik.setler[k.id];
  if (!s) return null;
  return {
    ...k, ad: s.ad, gorsel: s.gorsel, ikon: 'etiket', href: `/setler#set-${s.id}`,
    icerik: s.kalemler.map((x) => `${x.adet > 1 ? x.adet + '× ' : ''}${ik.urunler[x.urunId]?.kisaAd ?? ''}`).join(' + '),
    parcalar: s.kalemler, birimFiyat: s.fiyat, birimAyriAyri: s.ayriAyri, sepetteYuzde: 0,
    indirim: 0, toplam: s.fiyat * k.adet,
  };
}

export function sepetHesapla(kalemler: readonly SepetKalemi[], ik: IstemciKatalog) {
  const satirlar = kalemler.map((k) => satirCozumle(k, ik)).filter((x): x is HesapSatiri => !!x);
  /** İndirimsiz liste fiyatları toplamı (setler ayrı ayrı fiyatla) */
  const urunlerToplami = satirlar.reduce((t, s) => t + (s.birimAyriAyri ?? s.birimFiyat) * s.adet, 0);
  const setIndirimi = satirlar.reduce((t, s) => t + (s.birimAyriAyri ? (s.birimAyriAyri - s.birimFiyat) * s.adet : 0), 0);
  const sepetIndirimi = satirlar.reduce((t, s) => t + s.indirim, 0);
  const araToplam = urunlerToplami - setIndirimi - sepetIndirimi;
  const kargo = araToplam <= 0 ? 0 : araToplam >= ik.kargo.ucretsizEsik ? 0 : ik.kargo.ucret;
  return {
    satirlar,
    adet: satirlar.reduce((t, s) => t + s.adet, 0),
    urunlerToplami, setIndirimi, sepetIndirimi, araToplam, kargo,
    toplam: araToplam + kargo,
    kargoyaKalan: Math.max(0, ik.kargo.ucretsizEsik - araToplam),
  };
}

/** Sepetteki her ürünün toplam kullanımı (setlerin içindekiler dahil) */
export function urunKullanimi(kalemler: readonly SepetKalemi[], ik: IstemciKatalog): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of kalemler) {
    if (k.tip === 'urun') m.set(k.id, (m.get(k.id) ?? 0) + k.adet);
    else ik.setler[k.id]?.kalemler.forEach((s) => m.set(s.urunId, (m.get(s.urunId) ?? 0) + s.adet * k.adet));
  }
  return m;
}
