import { z } from 'astro/zod';
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
const belge = z.object({
  id: z.string().uuid(), siparisNo: z.string(), tur: siparisTuru,
  durum: z.enum(['hazirlaniyor', 'duzenlendi', 'gonderildi', 'hata', 'iptal']),
  olusturma: z.string(), guncelleme: z.string(), olaylar: z.array(olay),
  /** Muhasebe sıra numarası, ör. SO-2026-00001 (eski kayıtlarda yok) */
  belgeNo: z.string().max(40).optional(),
  /** Bu belgeye özel not ve "fiyatları gizle" (hediye paketi) seçimi */
  not: z.string().max(400).optional(),
  fiyatGizle: z.boolean().optional(),
});
const onek = z.string().trim().toUpperCase().regex(/^[A-Z]{1,5}$/, 'Önek 1–5 harf olmalı');
const notMetni = z.string().max(400);
export const BelgeAyarSema = z.object({
  logo: z.boolean().default(true),
  satici: z.boolean().default(true),
  fisFiyat: z.boolean().default(true),
  barkod: z.boolean().default(true),
  onekler: z.object({ ozet: onek.default('SO'), fis: onek.default('SF'), paket: onek.default('PL'), iade: onek.default('IF') }).default({}),
  notlar: z.object({
    ozet: notMetni.default(''),
    fis: notMetni.default('Bizi tercih ettiğiniz için teşekkür ederiz. Sorularınız için bize WhatsApp’tan yazabilirsiniz.'),
    paket: notMetni.default(''),
    iade: notMetni.default(''),
  }).default({}),
});
export type BelgeAyarlari = z.infer<typeof BelgeAyarSema>;
const trendyol = z.object({
  id: z.string().min(1).max(100), tarih, brut: k, indirim: k, iade: k, komisyon: k,
  hizmet: k, kargo: k, diger: k, banka: k.optional(),
});
export const FinansSema = z.object({
  belgeler: z.array(belge), giderler: z.array(gider), trendyol: z.array(trendyol), olaylar: z.array(olay),
  ayarlar: BelgeAyarSema.default({}),
  /** Belge türü ve yıla göre son verilen sıra numarası, ör. { "ozet-2026": 12 } */
  sayaclar: z.record(z.string(), z.number().int().nonnegative()).default({}),
});
export type Finans = z.infer<typeof FinansSema>;
export type Gider = z.infer<typeof gider>;
export type Belge = z.infer<typeof belge>;
export type TrendyolSatiri = z.infer<typeof trendyol>;
export const giderSema = gider;
export const trendyolSema = trendyol;

const trGun = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });
export const finansGunu = (d: number | Date = Date.now()) => trGun.format(d);
export function gecerliGun(s: string) {
  return ISO_GUN.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
}
export const finansPara = (kurus: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(kurus / 100);
export function paraOku(v: string) {
  const s = v.trim().replace(/\s/g, '');
  const duz = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  if (!/^\d+(?:\.\d{1,2})?$/.test(duz)) throw new Error('Tutarı TL olarak girin. Örnek 249,90.');
  const tutar = Math.round(Number(duz) * 100);
  if (!Number.isSafeInteger(tutar) || tutar > 1_000_000_000_000) throw new Error('Tutar geçerli aralıkta değil.');
  return tutar;
}
export function hakEdis(s: TrendyolSatiri) {
  return s.brut - s.indirim - s.iade - s.komisyon - s.hizmet - s.kargo - s.diger;
}
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
  const kategori = Object.fromEntries(Object.keys(GIDER_KATEGORILERI).map((ad) => [ad, 0])) as Record<Gider['kategori'], number>;
  giderler.forEach((x) => { kategori[x.kategori] += x.tutar; });
  const gider = giderler.reduce((t, x) => t + x.tutar, 0);
  const belge = f.belgeler.filter((x) => aralikta(gunu(x.olusturma), bas, son));
  return {
    satislar, iadeler, giderler, kategori, gider, belge, trendyol, webSatis, webIade, webIndirim, kargo, trendyolBeklenen,
    tahmini: kategori.urun > 0 || (!satislar.length && !trendyol.length) ? webSatis - webIade + trendyolBeklenen - gider : undefined,
  };
}
