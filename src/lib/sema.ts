/**
 * Al Lulu Home — veri şeması (tek doğruluk kaynağı)
 * Yönetim panelinden gelen her kayıt bu şemayla doğrulanır; geçersiz veri kaydedilmez.
 */
import { z } from 'astro/zod';
import { bosIseVarsayilan } from './zodUyum';

export const IKONLAR = [
  'canta', 'menu', 'kapat', 'sol', 'sag', 'asagi', 'tik', 'arti', 'eksi', 'kargo', 'kalkan', 'iade', 'kilit', 'belge',
  'sohbet', 'telefon', 'konum', 'tencere', 'duduklu', 'tava', 'kase', 'kasik', 'kutu', 'ates', 'gosterge', 'yildiz',
  'hediye', 'saat', 'kullanici', 'etiket', 'grid', 'ev', 'whatsapp', 'eposta', 'buyutec', 'trend', 'ayar', 'cop', 'yukari',
] as const;
export const IkonSema = z.enum(IKONLAR);
export type IkonAdi = z.infer<typeof IkonSema>;

const id = z.string().regex(/^[a-z0-9-]+$/, 'Sadece küçük harf, rakam ve tire');
const metin = z.string().trim();
const tl = z.number().int().nonnegative();

export const DurumSema = z.enum(['yayinda', 'taslak', 'gizli']);
export type Durum = z.infer<typeof DurumSema>;

export const GorselSema = z.object({ src: metin.min(1), alt: metin.default('') });
export type Gorsel = z.infer<typeof GorselSema>;

export const FiyatKaydiSema = z.object({ tarih: z.string(), fiyat: tl.positive(), dogrulandi: z.boolean().optional() });
export type FiyatKaydi = z.infer<typeof FiyatKaydiSema>;

export const KategoriSema = z.object({
  id,
  ad: metin.min(1),
  aciklama: metin.default(''),
  ikon: IkonSema.default('kutu'),
  sira: z.number().int().default(10),
  menudeGoster: z.boolean().default(true),
  anaSayfadaGoster: z.boolean().default(true),
  yakindaGoster: z.boolean().default(false),
});
export type Kategori = z.infer<typeof KategoriSema>;

export const SSSSema = z.object({ soru: metin.min(1), cevap: metin.min(1) });
export type SSSMaddesi = z.infer<typeof SSSSema>;

export const UrunSema = z.object({
  id,
  durum: DurumSema.default('taslak'),
  marka: metin.min(1),
  ad: metin.min(1),
  kisaAd: metin.min(1),
  kategoriler: z.array(id).min(1, 'En az bir kategori seçin'),
  fiyat: tl.positive('Fiyat 0’dan büyük olmalı'),
  /** Her fiyat değişikliği buraya otomatik eklenir. "Eski fiyat" ve "son 30 günün en düşüğü" buradan hesaplanır. */
  fiyatGecmisi: z.array(FiyatKaydiSema).default([]),
  /** Fiyat düşüşünü indirim olarak göster (önceki fiyat otomatik hesaplanır, elle girilemez). */
  kampanya: z.object({ baslangic: z.string(), etiket: metin.optional(), oncekiFiyat: tl.positive().optional() }).nullable().default(null),
  /** Sepette ek indirim (%), 0 = yok */
  sepetteIndirim: z.number().int().min(0).max(50).default(0),
  /** Fırsat ürünü: vitrinde öne çıkar. bitis verilirse gerçek geri sayım gösterilir ve
   *  sepette indirim o an otomatik biter (sahte, kendini yenileyen sayaç yok). */
  firsat: z.object({ etiket: metin.optional(), bitis: z.string().optional(), stil: z.enum(['firsat', 'flas', 'ozel']).optional() }).nullable().default(null),
  stok: z.number().int().min(0),
  maxAdet: z.number().int().min(1).max(50).default(5),
  sku: metin.default(''),
  gorseller: z.array(GorselSema).default([]),
  ozet: metin.default(''),
  oneCikanBilgiler: z.array(z.object({ ikon: IkonSema, metin: metin.min(1) })).default([]),
  rozetler: z.array(metin.min(1)).default([]),
  garanti: metin.optional(),
  hediye: metin.optional(),
  /** Fayda bölümü üst/ana/alt başlığı (boşsa ürün kategorisine göre akıllı varsayılan kullanılır) */
  faydaUstBaslik: metin.optional(),
  faydaBaslik: metin.optional(),
  faydaAltBaslik: metin.optional(),
  /** Fayda bölümleri: büyük başlık + kısa açıklama (+ isteğe bağlı görsel ve kaynak notu) */
  faydalar: z.array(z.object({
    baslik: metin.min(1), metin: metin.min(1), ikon: IkonSema.optional(), gorsel: metin.optional(), kaynak: metin.optional(),
  })).default([]),
  /** "Bu tencerede neler pişer?" — yalnızca üreticinin resmi tablosundan doğrulanmış süreler */
  pisirme: z.array(z.object({
    yemek: metin.min(1), sure: metin.min(1), kademe: metin.optional(), miktar: metin.optional(),
  })).default([]),
  pisirmeNotu: metin.optional(),
  teknik: z.array(z.tuple([metin.min(1), metin.min(1)])).default([]),
  kutuIcerigi: z.array(metin.min(1)).default([]),
  sss: z.array(SSSSema).default([]),
  birlikteIyiGider: z.array(id).default([]),
  oneCikan: z.boolean().default(false),
  /** "En Çok Satan" rozeti: sitedeki satış eşiği dolmadan önce, mağaza sahibinin başka kanallardaki
   *  (pazar yeri, mağaza, sosyal medya) GERÇEK satışlarına dayanarak panelden açılır. */
  cokSatan: z.boolean().default(false),
  oncelik: z.number().int().default(0),
  dogrula: z.array(metin).default([]),
});
export type Urun = z.infer<typeof UrunSema>;

export const SetSema = z.object({
  id,
  durum: DurumSema.default('taslak'),
  ad: metin.min(1),
  aciklama: metin.default(''),
  kalemler: z.array(z.object({ urunId: id, adet: z.number().int().min(1) })).min(2, 'Sette en az 2 ürün olmalı'),
  fiyatlama: z.discriminatedUnion('tip', [
    z.object({ tip: z.literal('yuzde'), oran: z.number().min(1).max(80) }),
    z.object({ tip: z.literal('sabit'), fiyat: tl.positive() }),
    /** Belirli bir ürüne indirim: "Vitaquick alana buhar aparatı %50 indirimli" */
    z.object({ tip: z.literal('kalem'), urunId: id, oran: z.number().min(1).max(100) }),
  ]),
  gorsel: GorselSema.optional(),
  rozet: metin.optional(),
  oneCikan: z.boolean().default(false),
});
export type UrunSeti = z.infer<typeof SetSema>;

export const BOLUMLER = ['hero', 'firsatlar', 'guven', 'kategoriler', 'oneCikanlar', 'setler', 'amiralHikaye', 'nedenBiz', 'sss'] as const;
export const BOLUM_ADLARI: Record<(typeof BOLUMLER)[number], string> = {
  hero: 'Öne çıkan ürün (en üst)',
  firsatlar: 'Fırsat ürünleri (geri sayımlı)',
  guven: 'Güvence şeridi',
  kategoriler: 'Kategoriler',
  oneCikanlar: 'Öne çıkan ürünler',
  setler: 'Setler & fırsatlar',
  amiralHikaye: 'Amiral ürün hikâyesi',
  nedenBiz: 'Neden biz?',
  sss: 'Sık sorulan sorular',
};

export const AnaSayfaSema = z.object({
  bolumler: z.array(z.enum(BOLUMLER)),
  hero: z.object({
    urunId: id, ustBaslik: metin, baslik: metin.min(1), altBaslik: metin,
    /** İlk ekranda fiyatın üstünde 3 kısa fayda maddesi */
    maddeler: z.array(metin.min(1)).default([]),
  }),
  oneCikanlarBaslik: metin.default('Öne çıkan ürünler'),
  setlerBaslik: metin.default('Setler & fırsatlar'),
  sss: z.array(SSSSema).default([]),
});
export type AnaSayfaAyarlari = z.infer<typeof AnaSayfaSema>;

export const TadilatSema = z.object({
  aktif: z.boolean().default(false),
  baslik: metin.default('Sitemiz kısa süreliğine bakımda'),
  aciklama: metin.default('Sizlere daha iyi hizmet verebilmek için mağazamızı güncelliyoruz. Çok yakında tekrar hizmetinizdeyiz.'),
  tahminiSure: metin.default(''),
  whatsappGoster: z.boolean().default(true),
  siparisTakipAcik: z.boolean().default(true),
});
export type TadilatAyarlari = z.infer<typeof TadilatSema>;

export const SOSYAL_AGLAR = ['instagram', 'facebook', 'tiktok', 'youtube', 'x', 'pinterest', 'linkedin'] as const;
export type SosyalAg = (typeof SOSYAL_AGLAR)[number];
export const SOSYAL_ADLARI: Record<SosyalAg, string> = {
  instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', x: 'X (Twitter)', pinterest: 'Pinterest', linkedin: 'LinkedIn',
};
const sosyalAdres = z.union([z.string().trim().url().startsWith('https://').max(300), z.literal('')]).default('');

export const SiteSema = z.object({
  ad: metin.min(1),
  slogan: metin.default(''),
  url: metin.url(),
  /** Müşteri hizmetleri adresi: sitede, sözleşmelerde, iade/cayma bildiriminde */
  eposta: metin.email(),
  /** Kurumsal / iş birliği adresi (isteğe bağlı, alt bilgide) */
  kurumsalEposta: z.union([metin.email(), z.literal('')]).default(''),
  /** +90 ile, boşluksuz */
  telefon: metin.regex(/^\+90\d{10}$/, '+90 ile başlayan 13 karakter'),
  telefonGorunen: metin.min(1),
  /** wa.me için: 90 ile başlayan, + olmadan */
  whatsapp: metin.regex(/^90\d{10}$/),
  calismaSaatleri: metin.default(''),
  /** Sosyal medya hesapları (https adresi). Boş olan görünmez; dolu olanlar alt bilgide ve arama motoru kimliğinde (sameAs) yer alır. */
  sosyal: bosIseVarsayilan(z.object({
    instagram: sosyalAdres, facebook: sosyalAdres, tiktok: sosyalAdres, youtube: sosyalAdres,
    x: sosyalAdres, pinterest: sosyalAdres, linkedin: sosyalAdres,
  })),
  satici: z.object({
    unvan: metin, adres: metin, mersis: metin, vergiDairesiNo: metin, kep: metin, etbis: metin,
  }),
  kargo: z.object({
    firma: metin,
    /** Kargo takip bağlantısı; {kod} yerine takip numarası yazılır */
    takipUrl: metin.default('https://www.yurticikargo.com/Tracking/Detail/{kod}'),
    ucret: tl,
    ucretsizEsik: tl,
    kesimSaati: z.number().int().min(0).max(23),
    teslimGun: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  }),
  taksit: z.object({ pesinFiyatinaTaksit: z.number().int().min(2).max(12).nullable(), genelMetin: metin }),
  duyurular: z.array(metin.min(1)).default([]),
  iadeGun: z.number().int().min(14).default(14),
  /** İndirimde "önceki fiyat" bu kadar günlük geçmişteki en düşük fiyattır. */
  indirimReferansGun: z.number().int().min(10).max(90).default(30),
  /** Son 30 günde bu adet ve üzeri satılan ürüne otomatik "Çok satan" etiketi */
  cokSatanEsik: z.number().int().min(1).default(10),
  /** Fiyat/indirim sunumu: A sade · B kampanya · C dengeli (önerilen) */
  fiyatSunumu: z.enum(['sade', 'kampanya', 'dengeli']).default('dengeli'),
  /** Tek adımda siteyi tadilata (bakıma) alma ayarları */
  tadilat: TadilatSema.default({
    aktif: false,
    baslik: 'Sitemiz kısa süreliğine bakımda',
    aciklama: 'Sizlere daha iyi hizmet verebilmek için mağazamızı güncelliyoruz. Çok yakında tekrar hizmetinizdeyiz.',
    tahminiSure: '',
    whatsappGoster: true,
    siparisTakipAcik: true,
  }),
});
export type SiteAyarlari = z.infer<typeof SiteSema>;

export const MagazaSema = z.object({
  surum: z.number().int().default(1),
  guncelleme: z.string().default(''),
  site: SiteSema,
  kategoriler: z.array(KategoriSema),
  urunler: z.array(UrunSema),
  setler: z.array(SetSema).default([]),
  anaSayfa: AnaSayfaSema,
  paytrStokIslemleri: z.array(z.string()).optional(),
});
export type Magaza = z.infer<typeof MagazaSema>;

/* ---------------- Siparişler ---------------- */
export const SIPARIS_DURUMLARI = ['odeme-bekliyor', 'odendi', 'hazirlaniyor', 'kargoda', 'teslim-edildi', 'iptal'] as const;
export const SIPARIS_DURUM_ADLARI: Record<(typeof SIPARIS_DURUMLARI)[number], string> = {
  'odeme-bekliyor': 'Ödeme bekleniyor',
  odendi: 'Ödendi',
  hazirlaniyor: 'Hazırlanıyor',
  kargoda: 'Kargoda',
  'teslim-edildi': 'Teslim edildi',
  iptal: 'İptal edildi',
};
export const SiparisDurumSema = z.enum(SIPARIS_DURUMLARI);
export type SiparisDurumu = z.infer<typeof SiparisDurumSema>;

export const SiparisKalemSema = z.object({
  tip: z.enum(['urun', 'set']),
  id,
  ad: metin,
  sku: metin.optional(),
  icerik: metin.optional(),
  /** Set ise içindeki ürünler (stok düşümü için) */
  parcalar: z.array(z.object({ urunId: id, adet: z.number().int() })).default([]),
  adet: z.number().int().min(1),
  birimFiyat: tl,
  indirim: tl.default(0),
  toplam: tl,
  /** Sipariş anındaki kampanya öncesi birim fiyat (yalnız gerçek indirimde; üstü çizili gösterim için) */
  oncekiBirim: tl.optional(),
});

export const SiparisSema = z.object({
  no: metin,
  token: metin,
  tarih: z.string(),
  durum: SiparisDurumSema,
  musteri: z.object({ ad: metin, soyad: metin, tel: metin, eposta: metin.optional() }),
  teslimat: z.object({ il: metin, ilce: metin, adres: metin, not: metin.optional() }),
  fatura: z.object({
    tip: z.enum(['bireysel', 'kurumsal']),
    firma: metin.optional(), vd: metin.optional(), vno: metin.optional(), adres: metin.optional(),
  }),
  kalemler: z.array(SiparisKalemSema).min(1),
  urunlerToplami: tl,
  setIndirimi: tl,
  sepetIndirimi: tl,
  /** Kampanya indirimi (önceki fiyat − satış fiyatı); urunlerToplami zaten indirimli fiyattır, bu yalnızca gösterim içindir */
  kampanyaIndirimi: tl.default(0),
  kargo: tl,
  toplam: tl,
  kargoTakip: metin.optional(),
  kargoFirma: metin.optional(),
  yoneticiNotu: metin.optional(),
  iptalNotu: metin.optional(),
  stokDusuldu: z.boolean().default(false),
  paytr: z.object({
    ref: z.string().regex(/^AL[a-f0-9]{32}$/),
    test: z.boolean(),
    beklemeBitis: z.number().int(),
    sonuc: z.enum(['bekliyor', 'odendi', 'basarisiz']),
    stokEksik: z.boolean().optional(),
  }).optional(),
  /** Onaylanan sözleşme sürümü (metin veri/sozlesmeler/ altında) */
  sozlesmeSurumu: metin.optional(),
  gecmis: z.array(z.object({
    tarih: z.string(), durum: SiparisDurumSema, not: metin.optional(), islem: metin.optional(), takipUrl: metin.optional(),
  })).default([]),
});
export type Siparis = z.infer<typeof SiparisSema>;
