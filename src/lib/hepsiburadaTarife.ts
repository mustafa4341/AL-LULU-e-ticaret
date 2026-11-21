import { KARGO_ACIK_SINIR, KARGO_SON_DESI, KARGO_TABLOSU, KARGO_TABLO_TARIHI } from './hepsiburadaKargoTablosu';

/**
 * Hepsiburada satış hesabı. Kaynaklar (kullanıcının Hepsiburada'dan indirdiği belgeler):
 *  - EK.4 Kategori bazlı komisyon oranları (V13): "Tüm komisyonlar listeleme fiyatı üzerinden +KDV olarak hesaplanacaktır."
 *  - Kargo desi/fiyat tablosu, 05.10.2026'dan itibaren, KDV hariç.
 *  - Hepsiburada Platform Kılavuzu: gecikme, tedarik edememe ve yanlış gönderim ceza tabloları.
 * İşlem bedeli ve hizmet bedeli bu belgelerde yok; sözleşmedeki tutar elle girilir ya da
 * muhasebe servisinden gelen gerçek kayıtların ortalaması kullanılır.
 * Tüm tutarlar kuruş (tam sayı).
 */

export const HIZMET_KDV = 20;
export { KARGO_TABLO_TARIHI };

export type HbKategori = { kod: string; ad: string; kapsam: string; oranBp: number };

/** EK.4 tablosundan ev ürünleriyle ilgili satırlar. oranBp: 1800 = %18,00 (KDV hariç). Vade hepsinde "Teslimat +24 iş günü". */
export const HB_KATEGORILER: HbKategori[] = [
  { kod: 'zuccaciye', ad: 'Züccaciye › Sofra & Mutfak Gereçleri', kapsam: 'Tencere, tava, düdüklü tencere, yemek takımı, çatal-kaşık-bıçak takımı, çaydanlık, pratik ev gereçleri', oranBp: 1800 },
  { kod: 'sda-mutfak', ad: 'SDA › Mutfak Gereçleri & Pişirme-Hazırlama', kapsam: 'Elektrikli: blender, doğrayıcı/rondo, kahve-çay makinesi, elektrikli tencere/tava, fritöz, mikser', oranBp: 1300 },
  { kod: 'sda-endustriyel', ad: 'SDA › Endüstriyel Mutfak, Mutfak Tartıları', kapsam: 'Endüstriyel mutfak ürün ve gereçleri, mutfak tartıları', oranBp: 1500 },
  { kod: 'sda-aksesuar', ad: 'SDA › Aksesuar, Yedek Parça', kapsam: 'Elektrikli mutfak aleti yedek parça ve aksesuarları, süpürge aksesuarları', oranBp: 1800 },
  { kod: 'ev-temizlik', ad: 'Ev Bakım ve Temizlik', kapsam: 'Deterjan, yüzey temizleyici, mop ve temizlik setleri, kağıt havlu, peçete, kullan at ürünler', oranBp: 1500 },
  { kod: 'tekstil-banyo', ad: 'Ev Tekstili › Banyo Tekstili', kapsam: 'Bornoz setleri, banyo klozet takımları, havlular', oranBp: 1800 },
  { kod: 'tekstil-mutfak', ad: 'Ev Tekstili › Mutfak Tekstil', kapsam: 'Mutfak tekstili, masa örtüleri, fırın eldivenleri, runner', oranBp: 1800 },
  { kod: 'tekstil-yatak', ad: 'Ev Tekstili › Yatak Odası Tekstili', kapsam: 'Nevresim, yastık, yorgan, perde, battaniye, dekoratif kırlent', oranBp: 1800 },
  { kod: 'tekstil-hali', ad: 'Ev Tekstili › Halı & Kilim', kapsam: 'Halı, kilim, yer paspasları, yolluklar', oranBp: 1800 },
  { kod: 'mobilya-dekorasyon', ad: 'Mobilya › Dekorasyon', kapsam: 'Dekorasyon, tekstil saklama ürünleri', oranBp: 2200 },
  { kod: 'mobilya-ev', ad: 'Mobilya › Ev Mobilya', kapsam: 'Mobilya, sandalye, koltuk, tabure', oranBp: 1800 },
  { kod: 'yapi-banyo', ad: 'Yapı Market › Banyo & Ev Gereçleri', kapsam: 'Batarya, musluk, duş sistemleri, vitrifiye, duşa kabin', oranBp: 1500 },
  { kod: 'yapi-banyo-aksesuar', ad: 'Yapı Market › Banyo Dolap, Banyo Aksesuar', kapsam: 'Banyo dolabı ve banyo aksesuarları', oranBp: 1600 },
  { kod: 'yapi-aydinlatma', ad: 'Yapı Market › Aydınlatma Ürünleri', kapsam: 'Avize, aplik, lambader, masa lambası, gece lambası', oranBp: 1800 },
  { kod: 'bahce-mangal', ad: 'Bahçe › Mangal / Barbekü', kapsam: 'Mangal, barbekü, mangal aksesuarları, piknik seti', oranBp: 1500 },
];

/** Sitedeki kategori → Hepsiburada kategorisi için başlangıç önerisi. Kesin oran satıcı panelindeki üründe görünür. */
const SITE_KATEGORI_ONERISI: Record<string, string> = {
  'duduklu-tencere': 'zuccaciye', tencere: 'zuccaciye', tava: 'zuccaciye', aksesuar: 'zuccaciye',
  sofra: 'zuccaciye', 'mutfak-aletleri': 'zuccaciye', temizlik: 'ev-temizlik',
};
export const kategoriOnerisi = (siteKategorileri: string[]) =>
  siteKategorileri.map((k) => SITE_KATEGORI_ONERISI[k]).find(Boolean) ?? 'zuccaciye';
export const hbKategori = (kod: string) => HB_KATEGORILER.find((k) => k.kod === kod);

export const KARGO_FIRMALARI = KARGO_TABLOSU.map(({ kod, ad }) => ({ kod, ad }));

/** Desi tam sayıya yukarı yuvarlanır (tablo tam sayı desi). */
export const desiYuvarla = (desi: number) => Math.max(0, Math.ceil(desi - 1e-9));

/** Kargo ücreti, kuruş, KDV hariç. Tabloda olmayan firma/desi için undefined. */
export function kargoUcreti(firma: string, desi: number): number | undefined {
  const satir = KARGO_TABLOSU.find((k) => k.kod === firma);
  const d = desiYuvarla(desi);
  if (!satir || !Number.isFinite(desi) || d > KARGO_SON_DESI) return undefined;
  if (d < satir.acik.length) return satir.acik[d];
  if (satir.son === undefined) return undefined; // hepsiJET 60 desi üstünü taşımıyor
  const a = satir.acik[KARGO_ACIK_SINIR]!;
  const aralik = KARGO_SON_DESI - KARGO_ACIK_SINIR;
  const pay = a * aralik + (d - KARGO_ACIK_SINIR) * (satir.son - a);
  const tahmin = Math.floor((2 * pay + aralik) / (2 * aralik));
  const fark = satir.fark ? '-0+'.indexOf(satir.fark[d - KARGO_ACIK_SINIR]!) - 1 : 0;
  return tahmin + fark;
}
export const kargoUstSiniri = (firma: string) => {
  const satir = KARGO_TABLOSU.find((k) => k.kod === firma);
  return satir ? (satir.son === undefined ? satir.acik.length - 1 : KARGO_SON_DESI) : 0;
};

/** Platform kılavuzu ceza tabloları (TL, ürün/sipariş bedeline göre). */
const basamak = (tablo: [number, number][], ust: number) => (tutarKurus: number) => {
  const tl = tutarKurus / 100;
  return 100 * (tablo.find(([sinir]) => tl <= sinir)?.[1] ?? ust);
};
export const CEZALAR = {
  gecikme: { ad: 'Geç kargoya verme / takip kodunu girmeme', hesap: basamak([[50, 10], [200, 20], [1000, 50], [6000, 150]], 300) },
  iptal: { ad: 'Tedarik edememe (stok yok, iptal)', hesap: basamak([[50, 10], [100, 30], [200, 50], [1000, 100], [3000, 300], [6000, 600], [10000, 1000], [20000, 1500]], 2000) },
  yanlis: { ad: 'Yanlış/eksik/kusurlu ürün, faturasız gönderim, alıcıyı arama', hesap: basamak([[50, 10], [200, 20], [1000, 50], [6000, 150]], 400) },
} as const;

export type HesapGirdisi = {
  fiyat: number;          // müşterinin ödediği, KDV dahil
  oranBp: number;         // komisyon oranı
  urunKdv: number;        // ürünün KDV oranı (%)
  desi: number;
  kargoFirmasi: string;
  islemBedeli: number;    // sipariş başına, KDV hariç
  hizmetBedeli: number;   // ürün başına, KDV hariç
  stopajBp: number;       // e-ticaret stopajı, KDV hariç satış üzerinden (100 = %1)
  maliyet?: number;       // ürün alış maliyeti, KDV hariç
};

const kdvEkle = (kurus: number) => Math.round(kurus * HIZMET_KDV / 100);

export function satisHesabi(g: HesapGirdisi) {
  const kdvHaricSatis = Math.round(g.fiyat * 100 / (100 + g.urunKdv));
  const satisKdv = g.fiyat - kdvHaricSatis;
  const komisyon = Math.round(g.fiyat * g.oranBp / 10_000);
  const kargo = kargoUcreti(g.kargoFirmasi, g.desi);
  const kargoNet = kargo ?? 0;
  const kalemler = [
    { ad: 'Komisyon', net: komisyon, kdv: kdvEkle(komisyon) },
    { ad: 'Kargo', net: kargoNet, kdv: kdvEkle(kargoNet) },
    { ad: 'İşlem bedeli', net: g.islemBedeli, kdv: kdvEkle(g.islemBedeli) },
    { ad: 'Hizmet bedeli', net: g.hizmetBedeli, kdv: kdvEkle(g.hizmetBedeli) },
  ];
  const kesintiNet = kalemler.reduce((t, k) => t + k.net, 0);
  const kesintiKdv = kalemler.reduce((t, k) => t + k.kdv, 0);
  const stopaj = Math.round(kdvHaricSatis * g.stopajBp / 10_000);
  const hesabaYatan = g.fiyat - kesintiNet - kesintiKdv - stopaj;
  const netKar = g.maliyet === undefined ? undefined : kdvHaricSatis - kesintiNet - g.maliyet;
  return {
    kdvHaricSatis, satisKdv, kalemler, kesintiNet, kesintiKdv, stopaj, hesabaYatan, netKar,
    kargoBulunamadi: kargo === undefined,
    marj: netKar === undefined || kdvHaricSatis <= 0 ? undefined : netKar / kdvHaricSatis,
    /** Devlete ödenecek KDV farkı (ürün alışındaki KDV hariç): satış KDV'si − kesintilerin KDV'si */
    kdvFarki: satisKdv - kesintiKdv,
    cezalar: (Object.keys(CEZALAR) as (keyof typeof CEZALAR)[]).map((k) => ({ ad: CEZALAR[k].ad, tutar: CEZALAR[k].hesap(g.fiyat) })),
  };
}

/**
 * Hedeflenen net kâr (KDV hariç) için gereken satış fiyatı. Kargo ve sabit bedeller fiyattan bağımsızdır.
 * net = F/(1+k) − F·o − sabitler − maliyet  ⇒  F = (hedef + sabitler + maliyet) / (1/(1+k) − o)
 * Sonuç tam liraya yukarı yuvarlanır ve yuvarlama sonrası tekrar doğrulanır.
 */
export function hedefFiyat(g: Omit<HesapGirdisi, 'fiyat'>, hedefKar: number): number | undefined {
  if (g.maliyet === undefined) return undefined;
  const pay = hedefKar + (kargoUcreti(g.kargoFirmasi, g.desi) ?? 0) + g.islemBedeli + g.hizmetBedeli + g.maliyet;
  const payda = 100 / (100 + g.urunKdv) - g.oranBp / 10_000;
  if (payda <= 0) return undefined;
  let fiyat = Math.ceil(pay / payda / 100) * 100;
  for (let i = 0; i < 5 && (satisHesabi({ ...g, fiyat }).netKar ?? -1) < hedefKar; i++) fiyat += 100;
  return fiyat;
}

/** Hafta sonunu atlayarak iş günü ekler. Resmi tatiller dahil değildir (tatil varsa ödeme birkaç gün kayar). */
export function isGunuEkle(tarih: Date, gun: number) {
  const d = new Date(tarih);
  let kalan = gun;
  while (kalan > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const g = d.getUTCDay();
    if (g !== 0 && g !== 6) kalan--;
  }
  return d;
}
export const ODEME_VADESI_IS_GUNU = 24;
