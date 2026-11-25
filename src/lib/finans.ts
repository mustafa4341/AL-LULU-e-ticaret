import { z } from 'astro/zod';
import { bosIseVarsayilan } from './zodUyum';
import type { Siparis } from './sema';
import { iadeEdildi, IADE_ISLEMI } from './siparisAkisi';

export const BELGE_TURLERI = {
  ozet: 'Sipariş özeti', fis: 'Paket içi sipariş fişi', paket: 'Paketleme listesi', iade: 'İade talep formu',
} as const;
/** Belgenin üstünde yazan başlık */
export const BELGE_BASLIKLARI = {
  ozet: 'Sipariş Özeti', fis: 'Sipariş Fişi', paket: 'Paketleme Listesi', iade: 'İade Talep Formu',
} as const;
export const BELGE_DURUMLARI = {
  hazirlaniyor: 'Hazırlanıyor', duzenlendi: 'Düzenlendi', gonderildi: 'Gönderildi', hata: 'Hata oluştu', iptal: 'İptal (yenisi düzenlendi)',
} as const;
/** Etkin (geçerli) belge: iptal ve hata kayıtları sayılmaz */
export const belgeGecerli = (b: { durum: string }) => b.durum === 'duzenlendi' || b.durum === 'gonderildi';
export const GIDER_KATEGORILERI = {
  urun: 'Ürün alış maliyeti', kargo: 'Kargo', paket: 'Paketleme', komisyon: 'Trendyol komisyonu',
  hizmet: 'Pazaryeri hizmet bedeli', reklam: 'Reklam', iade: 'İade ve hasar', diger: 'Diğer',
} as const;
export const TRENDYOL_TUTARLARI = {
  brut: 'Brüt satış', indirim: 'Satıcı indirimi', iade: 'İadeler', komisyon: 'Komisyon',
  hizmet: 'Hizmet bedeli', kargo: 'Kargo kesintisi', diger: 'Diğer kesinti', banka: 'Bankaya geçen',
  stopaj: 'E-ticaret stopajı (%1, vergiden mahsup edilir)',
} as const;

export const ISO_GUN = /^\d{4}-\d{2}-\d{2}$/;
export const siparisTuru = z.enum(['ozet', 'fis', 'paket', 'iade']);
export type BelgeTuru = z.infer<typeof siparisTuru>;
const olay = z.object({ tarih: z.string(), islem: z.string() });
const dosya = z.object({ ad: z.string(), tur: z.enum(['application/pdf', 'image/jpeg', 'image/png']), boyut: z.number().int().positive() });
const k = z.number().int().nonnegative().max(1_000_000_000_000);
const tarih = z.string().regex(ISO_GUN);
const gider = z.object({
  id: z.string().uuid(), tarih, tutar: k, not: z.string().max(300),
  kategori: z.enum(['urun', 'kargo', 'paket', 'komisyon', 'hizmet', 'reklam', 'iade', 'diger']),
  ek: dosya.optional(), olusturma: z.string(),
});
/** PDF yazı tipi/şablon sürümü; eski sürümle (kutucuklu font) üretilmiş belgeler okunduğunda aynı numarayla yenilenir */
export const BELGE_SABLON_SURUMU = 2;

const belge = z.object({
  id: z.string().uuid(), siparisNo: z.string(), tur: siparisTuru,
  durum: z.enum(['hazirlaniyor', 'duzenlendi', 'gonderildi', 'hata', 'iptal']),
  olusturma: z.string(), guncelleme: z.string(), olaylar: z.array(olay),
  /** Muhasebe sıra numarası, ör. SO-2026-00001 (eski kayıtlarda yok) */
  belgeNo: z.string().max(40).optional(),
  /** Bu belgeye özel not ve "fiyatları gizle" (hediye paketi) seçimi */
  not: z.string().max(400).optional(),
  fiyatGizle: z.boolean().optional(),
  sablonSurumu: z.number().int().optional(),
});
const onek = z.string().trim().toUpperCase().regex(/^[A-Z]{1,5}$/, 'Önek 1–5 harf olmalı');
const notMetni = z.string().max(400);
export const BelgeAyarSema = z.object({
  logo: z.boolean().default(true),
  satici: z.boolean().default(true),
  fisFiyat: z.boolean().default(true),
  barkod: z.boolean().default(true),
  onekler: bosIseVarsayilan(z.object({ ozet: onek.default('SO'), fis: onek.default('SF'), paket: onek.default('PL'), iade: onek.default('IF') })),
  notlar: bosIseVarsayilan(z.object({
    ozet: notMetni.default(''),
    fis: notMetni.default('Bizi tercih ettiğiniz için teşekkür ederiz. Sorularınız için bize WhatsApp’tan yazabilirsiniz.'),
    paket: notMetni.default(''),
    iade: notMetni.default(''),
  })),
});
export type BelgeAyarlari = z.infer<typeof BelgeAyarSema>;
/** İşaretli kuruş: iadede komisyon/indirim/kargo geri döner, eski bir satışın iadesinde bankaya geçen eksi olabilir. */
const ki = z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000);
/** Trendyol cari hesabındaki tek işlem (satış, iade, kesinti…) — aynı işlem tekrar gelirse üstüne yazılır, iki kez sayılmaz. */
const trendyolParca = z.object({
  tarih: z.number().int().nonnegative(), tur: z.string().max(60).optional(), odenen: z.boolean(),
  brut: ki, indirim: ki, iade: ki, komisyon: ki, hizmet: ki, kargo: ki, diger: ki, banka: ki, stopaj: ki.default(0),
});
const trendyol = z.object({
  id: z.string().min(1).max(100), tarih, brut: ki, indirim: ki, iade: ki, komisyon: ki,
  hizmet: ki, kargo: ki, diger: ki, banka: ki.optional(),
  /** %1 e-ticaret stopajı: hakedişten düşülür ama gider değildir (gelir/kurumlar vergisinden mahsup edilir) */
  stopaj: k.optional(),
  /** API'den gelen satırlarda işlem kimliğine göre parçalar (sonraki çekimler eski satışı silmeden birleşir) */
  parcalar: z.record(z.string().max(120), trendyolParca).optional(),
});
/** Hepsiburada muhasebe servisinden gelen tek kayıt. tutar/kdv/net kuruş ve işaretsiz; yönü `gelir` belirler. */
const opsMetin = (n: number) => z.string().max(n).optional();
const hbKayit = z.object({
  id: z.string().min(1).max(100), tur: z.string().min(1).max(80), durum: z.string().max(30), gelir: z.boolean(),
  tutar: k, kdv: k, net: k,
  siparisNo: opsMetin(60), paketNo: opsMetin(60), sku: opsMetin(80), urun: opsMetin(300), adet: z.number().int().nonnegative().optional(),
  fatura: opsMetin(80), siparisTarihi: opsMetin(40), faturaTarihi: opsMetin(40), vade: opsMetin(40), odeme: opsMetin(40), aciklama: opsMetin(500),
});
/** Hepsiburada performans servisi: sipariş + ürün bazında hakediş. hakedis işaretli kuruş. */
const hbPerformans = z.object({
  anahtar: z.string().min(1).max(160), siparisNo: z.string().max(60), sku: z.string().max(80), urun: opsMetin(300),
  adet: z.number().int().nonnegative().optional(), birim: k.optional(), hakedis: z.number().int().min(-1e12).max(1e12),
  gelir: k, gider: k, siparisTarihi: opsMetin(40), vade: opsMetin(40),
  kalemler: z.array(z.object({ tur: z.string().max(80), tutar: z.number().int().min(-1e12).max(1e12) })).max(60),
});
/** Kesilen (elle, GİB e-Arşiv Portalı'nda) satış faturası kaydı. Tutarlar kuruş. */
const faturaKaydi = z.object({
  id: z.string().uuid(),
  kanal: z.enum(['web', 'trendyol', 'hepsiburada']),
  /** Web: sipariş no · pazaryeri: kayıt kimliği (trendyol-<paket>) */
  kayit: z.string().min(1).max(120),
  siparisNo: z.string().max(60),
  no: z.string().trim().min(1).max(40),
  tarih,
  alici: z.string().max(200),
  matrah: k, kdv: k, toplam: k,
  ek: dosya.optional(),
  iletim: z.object({
    durum: z.enum(['bekliyor', 'gonderildi', 'elle', 'hata', 'yok']),
    mesaj: z.string().max(500).optional(),
    tarih: z.string().optional(),
  }).default({ durum: 'bekliyor' }),
  iptal: z.boolean().default(false),
  olusturma: z.string(),
  /** Kanaldan (Trendyol) alınan faturanın kaynak bağlantısı; dosyası buradan indirilir */
  kanalLink: z.string().max(1000).optional(),
  /** Kanaldan dosya indirmenin son denendiği an (tekrar denemeyi seyreltmek için) */
  kanalDeneme: z.string().optional(),
});
export type FaturaKaydi = z.infer<typeof faturaKaydi>;
export const faturaKaydiSema = faturaKaydi;

export const HbAyarSema = z.object({
  kargoFirmasi: z.string().max(30).default(''),
  islemBedeli: k.default(0),
  hizmetBedeli: k.default(0),
  stopajBp: z.number().int().min(0).max(1000).default(100),
});
export const HbUrunAyarSema = z.object({
  kategori: z.string().max(40),
  /** Kategori "elle" ise ya da panelde farklı oran görünüyorsa */
  oranBp: z.number().int().min(0).max(5000).optional(),
  desi: z.number().min(0).max(4500),
  maliyet: k.optional(),
  kdv: z.number().int().min(0).max(20),
  /** Komisyon oranının kaynağı: Hepsiburada API'sinden (Komisyon Bilgisi Sorgulama) ya da satıcı panelinden elle */
  oranKaynak: z.enum(['hepsiburada', 'elle']).optional(),
  oranTarih: z.string().optional(),
  /** Hepsiburada'nın bu ilan için verdiği ödeme vadesi (gün) */
  vadeGun: z.number().int().min(0).max(365).optional(),
});
export type HbKayit = z.infer<typeof hbKayit>;
export type HbPerformans = z.infer<typeof hbPerformans>;
export type HbAyar = z.infer<typeof HbAyarSema>;
export type HbUrunAyar = z.infer<typeof HbUrunAyarSema>;
export const hbKayitSema = hbKayit;
export const hbPerformansSema = hbPerformans;

export const FinansSema = z.object({
  belgeler: z.array(belge), giderler: z.array(gider), trendyol: z.array(trendyol), olaylar: z.array(olay),
  hepsiburada: z.array(hbKayit).default([]),
  hbPerformans: z.array(hbPerformans).default([]),
  hbSonCekim: z.object({ tarih: z.string(), bas: z.string(), son: z.string(), kayit: z.number().int(), performans: z.number().int() }).optional(),
  hbAyar: bosIseVarsayilan(HbAyarSema),
  hbUrunler: z.record(z.string(), HbUrunAyarSema).default({}),
  faturalar: z.array(faturaKaydi).default([]),
  ayarlar: bosIseVarsayilan(BelgeAyarSema),
  /** Belge türü ve yıla göre son verilen sıra numarası, ör. { "ozet-2026": 12 } */
  sayaclar: z.record(z.string(), z.number().int().nonnegative()).default({}),
});
export type Finans = z.infer<typeof FinansSema>;
export type Gider = z.infer<typeof gider>;
export type Belge = z.infer<typeof belge>;
export type TrendyolSatiri = z.infer<typeof trendyol>;
export type TrendyolParcasi = z.infer<typeof trendyolParca>;
export const giderSema = gider;
export const trendyolSema = trendyol;

const trGun = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });
export const finansGunu = (d: number | Date = Date.now()) => trGun.format(d);
export function gecerliGun(s: string) {
  return ISO_GUN.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
}
/** Panelin her yerinde aynı biçim: "12.999 TL", kuruşlu ise "12.999,50 TL" */
export const finansPara = (kurus: number) => {
  const tam = Math.round(kurus) % 100 === 0;
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: tam ? 0 : 2, maximumFractionDigits: 2 }).format(kurus / 100) + ' TL';
};
export function paraOku(v: string) {
  const s = v.trim().replace(/\s/g, '');
  const duz = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  if (!/^\d+(?:\.\d{1,2})?$/.test(duz)) throw new Error('Tutarı TL olarak girin. Örnek 249,90.');
  const tutar = Math.round(Number(duz) * 100);
  if (!Number.isSafeInteger(tutar) || tutar > 1_000_000_000_000) throw new Error('Tutar geçerli aralıkta değil.');
  return tutar;
}
export function hakEdis(s: TrendyolSatiri) {
  return s.brut - s.indirim - s.iade - s.komisyon - s.hizmet - s.kargo - s.diger - (s.stopaj ?? 0);
}
/** Hepsiburada kaydının hakedişe etkisi (kuruş, işaretli). "TotalPayment" bankaya aktarım özetidir, hakedişe eklenmez. */
export const hbIsaretli = (x: HbKayit) => x.tur === 'TotalPayment' ? 0 : (x.gelir ? x.tutar : -x.tutar);
export const hbKayitGunu = (x: HbKayit) => {
  const t = x.siparisTarihi ?? x.faturaTarihi ?? x.vade ?? x.odeme;
  return t && !Number.isNaN(Date.parse(t)) ? finansGunu(Date.parse(t)) : '';
};
/** Özet ve raporlardaki "kalan (tahmini)" */
export const kalanTutar = (r: { webSatis: number; webIade: number; trendyolBeklenen: number; hepsiburadaBeklenen: number; gider: number }) =>
  r.webSatis - r.webIade + r.trendyolBeklenen + r.hepsiburadaBeklenen - r.gider;
export function donem(q: URLSearchParams) {
  const bugun = finansGunu();
  const bas = q.get('baslangic') ?? bugun.slice(0, 7) + '-01';
  const son = q.get('bitis') ?? bugun;
  return gecerliGun(bas) && gecerliGun(son) && bas <= son ? { bas, son } : { bas: bugun.slice(0, 7) + '-01', son: bugun };
}
export const aralikta = (gun: string, bas: string, son: string) => gun >= bas && gun <= son;
const gunu = (t: string) => Number.isNaN(Date.parse(t)) ? '' : finansGunu(Date.parse(t));
export function raporla(f: Finans, siparisler: Siparis[], bas: string, son: string) {
  const satislar: { siparis: Siparis; gun: string }[] = [];
  const iadeler: { siparis: Siparis; gun: string; tutar: number }[] = [];
  for (const s of siparisler) {
    if (s.paytr?.test) continue;
    const odeme = s.gecmis.find((x) => x.durum === 'odendi');
    const iptal = s.durum === 'iptal' || iadeEdildi(s);
    const odendi = s.paytr ? s.paytr.sonuc === 'odendi' : Boolean(odeme || (!iptal && s.durum !== 'odeme-bekliyor'));
    const satisGunu = gunu(odeme?.tarih ?? s.tarih);
    if (odendi && aralikta(satisGunu, bas, son)) satislar.push({ siparis: s, gun: satisGunu });
    if (iptal) {
      const iadeGunu = gunu([...s.gecmis].reverse().find((x) => x.islem === IADE_ISLEMI || x.durum === 'iptal')?.tarih ?? s.tarih);
      if (aralikta(iadeGunu, bas, son)) iadeler.push({ siparis: s, gun: iadeGunu, tutar: odendi ? 100 * s.toplam : 0 });
    }
  }
  const giderler = f.giderler.filter((x) => aralikta(x.tarih, bas, son));
  const trendyol = f.trendyol.filter((x) => aralikta(x.tarih, bas, son));
  const kargo = 100 * satislar.reduce((t, x) => t + x.siparis.kargo, 0);
  const webIndirim = 100 * satislar.reduce((t, x) => t + x.siparis.setIndirimi + x.siparis.sepetIndirimi + x.siparis.kampanyaIndirimi, 0);
  const webSatis = 100 * satislar.reduce((t, x) => t + x.siparis.toplam, 0);
  const webIade = iadeler.reduce((t, x) => t + x.tutar, 0);
  const trendyolBeklenen = trendyol.reduce((t, x) => t + hakEdis(x), 0);
  const hepsiburada = f.hepsiburada.filter((x) => aralikta(hbKayitGunu(x), bas, son));
  const hepsiburadaBeklenen = hepsiburada.reduce((t, x) => t + hbIsaretli(x), 0);
  const kategori = Object.fromEntries(Object.keys(GIDER_KATEGORILERI).map((ad) => [ad, 0])) as Record<Gider['kategori'], number>;
  giderler.forEach((x) => { kategori[x.kategori] += x.tutar; });
  const gider = giderler.reduce((t, x) => t + x.tutar, 0);
  const belge = f.belgeler.filter((x) => aralikta(gunu(x.olusturma), bas, son));
  return {
    satislar, iadeler, giderler, kategori, gider, belge, trendyol, webSatis, webIade, webIndirim, kargo, trendyolBeklenen,
    hepsiburada, hepsiburadaBeklenen,
    tahmini: kategori.urun > 0 || (!satislar.length && !trendyol.length && !hepsiburada.length)
      ? webSatis - webIade + trendyolBeklenen + hepsiburadaBeklenen - gider : undefined,
  };
}
