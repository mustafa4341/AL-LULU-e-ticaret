/**
 * Pazaryeri (Trendyol, Hepsiburada) sipariş motoru — saf mantık, dosya/veritabanı/ağ erişimi YOK.
 *
 * Siparişler iki yoldan gelir, ikisi de aynı biçime ("GelenSiparis") çevrilir:
 *  1. Resmî API (ücretsiz; anahtarlar Vercel ortam değişkenlerinde) → trendyolPaketi / hepsiburadaSatirlari
 *  2. Satıcı panelinden indirilen Excel/CSV → sutunlariBul + tablodanSiparisler
 *
 * Sonra birlestir() mevcut kayıtlarla karşılaştırır ve stok planını çıkarır:
 *  • Aktif sipariş (onay bekleyen dahil, aşırı satışı önlemek için) stoktan BİR KEZ düşer.
 *  • İptal / bölünen paket → düşülen stok geri eklenir.
 *  • İade / teslim edilemedi → ürün depoya dönüp kontrol edilmeden stok artmaz; panel "stoğa al" ister.
 *  • Stok yetmiyorsa düşülebilen kadar düşer, eksik kısım "fazla satış" olarak işaretlenir.
 *  • Kanalın "stok başlangıç tarihinden" önceki siparişler yalnız listelenir, stoğu etkilemez
 *    (o güne kadarki satışlar mağaza sahibinin saydığı stokta zaten düşülmüş sayılır).
 * Aynı paket tekrar gelirse güncellenir; stok durumu kalem kalem saklandığı için iki kez düşülmez.
 */
import { z } from 'astro/zod';
import type { Magaza, Urun } from './sema';
import { urunGtin } from './urunKimlik';

export const KANALLAR = { trendyol: 'Trendyol', hepsiburada: 'Hepsiburada' } as const;
export type Kanal = keyof typeof KANALLAR;
export const KANAL_LISTESI = Object.keys(KANALLAR) as Kanal[];
export const kanalMi = (v: unknown): v is Kanal => typeof v === 'string' && Object.hasOwn(KANALLAR, v);

export const PY_DURUMLAR = [
  'onay-bekliyor', 'yeni', 'hazirlaniyor', 'kargoda', 'teslim-edildi', 'iptal', 'bolundu', 'iade', 'teslim-edilemedi', 'bilinmiyor',
] as const;
export type PyDurum = (typeof PY_DURUMLAR)[number];
export const PY_DURUM_ADLARI: Record<PyDurum, string> = {
  'onay-bekliyor': 'Ödeme onayı bekliyor',
  yeni: 'Hazırlanacak',
  hazirlaniyor: 'Hazırlanıyor',
  kargoda: 'Kargoda',
  'teslim-edildi': 'Teslim edildi',
  iptal: 'İptal',
  bolundu: 'Paket bölündü',
  iade: 'İade',
  'teslim-edilemedi': 'Teslim edilemedi',
  bilinmiyor: 'Durum tanınmadı',
};
export const PY_DURUM_RENK: Record<PyDurum, 'yesil' | 'turuncu' | 'kirmizi' | 'gri'> = {
  'onay-bekliyor': 'gri', yeni: 'turuncu', hazirlaniyor: 'turuncu', kargoda: 'yesil', 'teslim-edildi': 'yesil',
  iptal: 'gri', bolundu: 'gri', iade: 'kirmizi', 'teslim-edilemedi': 'kirmizi', bilinmiyor: 'kirmizi',
};
/** Stoktan düşen durumlar. "bilinmiyor" da düşer: tanınmayan durumda stoğu fazla göstermek aşırı satışa yol açar. */
export const STOK_AKTIF = new Set<PyDurum>(['onay-bekliyor', 'yeni', 'hazirlaniyor', 'kargoda', 'teslim-edildi', 'bilinmiyor']);
/** Satış (ciro) sayılan durumlar */
export const SATIS_DURUMLARI = new Set<PyDurum>(['yeni', 'hazirlaniyor', 'kargoda', 'teslim-edildi', 'bilinmiyor']);
const GERI_EKLE = new Set<PyDurum>(['iptal', 'bolundu']);
const DONUS = new Set<PyDurum>(['iade', 'teslim-edilemedi']);
/** Paket durumu için aktif aşamaların sırası. */
const SIRA: PyDurum[] = ['bilinmiyor', 'onay-bekliyor', 'yeni', 'hazirlaniyor', 'kargoda', 'teslim-edildi'];

/* ---------------- Ortak yardımcılar ---------------- */

/** Türkçe karakterleri sadeleştirip yalnız harf-rakam bırakır: "Sipariş Tarihi" → "siparistarihi" */
export function normal(v: unknown): string {
  return String(v ?? '').toLocaleLowerCase('tr').normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replaceAll('ı', 'i').replace(/[^a-z0-9]/g, '');
}
/** Ürün kodu karşılaştırması: büyük/küçük harf, boşluk, tire ve eğik çizgi fark etmez */
export const kodNormal = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/[\s\-_/.]/g, '');

/** "1.299,90 TL", "1299.9", "₺12.999" → kuruş (tam sayı). Anlaşılmazsa undefined. */
export function kurusOku(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : undefined;
  let s = String(v ?? '').replace(/[\s ₺]|TL|TRY/gi, '');
  if (!s) return undefined;
  const eksi = s.startsWith('-');
  s = s.replace(/^[-+]/, '');
  const virgul = s.lastIndexOf(','), nokta = s.lastIndexOf('.');
  if (virgul >= 0 && nokta >= 0) {
    s = virgul > nokta ? s.replaceAll('.', '').replace(',', '.') : s.replaceAll(',', '');
  } else if (virgul >= 0) {
    s = (s.match(/,/g)!.length > 1 ? s.replaceAll(',', '') : s.replace(',', '.'));
  } else if (nokta >= 0 && (s.match(/\./g)!.length > 1 || /^\d{1,3}\.\d{3}$/.test(s))) {
    s = s.replaceAll('.', ''); // 12.999 → binlik ayırıcı
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Math.round(Number(s) * 100);
  return eksi ? -n : n;
}

/** Kuruşu "1.299,90 TL" biçiminde yazar (tam liraysa kuruşsuz) */
export function kurusTL(k: number): string {
  const tam = k % 100 === 0;
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: tam ? 0 : 2, maximumFractionDigits: 2 }).format(k / 100) + ' TL';
}

const IST = '+03:00'; // Türkiye 2016'dan beri yıl boyu UTC+3
const iki = (n: number) => String(n).padStart(2, '0');
/**
 * Tarih okur, ISO döndürür. Desteklenen: Excel seri sayısı (45980.6), "19.11.2026 14:32[:05]", "19/11/2026",
 * "2026-11-19 14:32", ISO (saat dilimli/dilimsiz — dilimsiz ise Türkiye saati), 13 haneli ms zaman damgası.
 */
export function tarihOku(v: unknown): string | undefined {
  const s = String(v ?? '').trim();
  if (!s) return undefined;
  let iso: string | undefined;
  const tr = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  const isoYerel = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/.exec(s);
  if (tr) iso = `${tr[3]}-${iki(+tr[2]!)}-${iki(+tr[1]!)}T${iki(+(tr[4] ?? 0))}:${tr[5] ?? '00'}:${tr[6] ?? '00'}${IST}`;
  else if (isoYerel) iso = `${isoYerel[1]}-${isoYerel[2]}-${isoYerel[3]}T${isoYerel[4] ?? '00'}:${isoYerel[5] ?? '00'}:${isoYerel[6] ?? '00'}${IST}`;
  else if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) iso = s;
  else if (/^\d{12,14}$/.test(s)) iso = new Date(Number(s)).toISOString();
  else if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n < 20000 || n > 90000) return undefined;
    // Excel seri günü: 1899-12-30'dan beri gün; ondalık kısım saat. Ekranda görünen Türkiye saatidir.
    const ms = Math.round((n - Math.floor(n)) * 864e5);
    const g = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 864e5 + ms);
    iso = `${g.getUTCFullYear()}-${iki(g.getUTCMonth() + 1)}-${iki(g.getUTCDate())}T${iki(g.getUTCHours())}:${iki(g.getUTCMinutes())}:${iki(g.getUTCSeconds())}${IST}`;
  }
  if (!iso) return undefined;
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || t < Date.UTC(2015, 0, 1) || t > Date.now() + 400 * 864e5) return undefined;
  return new Date(t).toISOString();
}

/** Ham durum metni → ortak durum. Kanal önemli: Trendyol "UnPacked" = paket bölündü, Hepsiburada "Unpacked" = henüz paketlenmedi. */
export function durumCoz(ham: unknown, kanal: Kanal): PyDurum {
  const d = normal(ham);
  if (!d) return 'yeni';
  const var_ = (...k: string[]) => k.some((x) => d.includes(x));
  if (d === 'unpacked') return kanal === 'trendyol' ? 'bolundu' : 'yeni';
  if (var_('awaiting', 'verified', 'onaybek', 'odemebek', 'odemeonay', 'beklemede')) return 'onay-bekliyor';
  if (var_('bolun', 'split')) return 'bolundu';
  if (var_('cancel', 'iptal', 'unsupplied', 'tedarikedilemedi', 'rejected', 'reddedildi')) return 'iptal';
  if (var_('undelivered', 'teslimedilemedi', 'ulastirilamadi', 'teslimatbasarisiz')) return 'teslim-edilemedi';
  if (var_('return', 'iade', 'claim')) return 'iade';
  if (var_('kargoyateslim', 'kargoyaverildi', 'shipped', 'intransit', 'kargoda', 'dagitim', 'yolda', 'atcollectionpoint', 'teslimatnoktasi', 'transfer')) return 'kargoda';
  if (var_('hazirlanacak', 'paketlenecek', 'islemebekliyor')) return 'yeni';
  if (d === 'packed' || d === 'package' || var_('kargoyaverilecek', 'kargoyahazir', 'packaged', 'paketlendi', 'picking', 'invoiced', 'faturalan', 'hazirlan', 'islemealin', 'toplan', 'preparing')) return 'hazirlaniyor';
  if (var_('delivered', 'teslimedildi', 'tamamlandi', 'completed')) return 'teslim-edildi';
  if (var_('created', 'yeni', 'open', 'olusturuldu', 'paketlenecek', 'onaylandi', 'approved', 'new')) return 'yeni';
  return 'bilinmiyor';
}

/** Veritabanı kimliğine uygun parça: harf, rakam, nokta, alt çizgi, tire (en fazla 80) */
export const kimlikParcasi = (v: unknown) => String(v ?? '').trim().replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
export function pazaryeriKimligi(kanal: Kanal, anahtar: string): string {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(anahtar)) throw new Error('Pazaryeri sipariş veya paket numarası geçersiz.');
  return `${kanal}-${anahtar}`;
}

/* ---------------- Ortak sipariş biçimi ---------------- */

export interface GelenKalem {
  satirId?: string;
  barkod?: string;
  stokKodu?: string;
  ad: string;
  adet: number;
  /** Kalemin satıcının faturalayacağı tutarı (kuruş, indirim sonrası) */
  tutar: number;
  hamDurum?: string;
}
export interface GelenSiparis {
  kanal: Kanal;
  /** Kayıt anahtarı: Trendyol'da paket numarası, Hepsiburada'da sipariş numarası */
  anahtar: string;
  siparisNo: string;
  paketNo?: string;
  tarih: string;
  guncelleme?: string;
  asilPaketler?: string[];
  hamDurum: string;
  musteri?: string;
  il?: string;
  ilce?: string;
  kargoFirma?: string;
  kargoTakip?: string;
  sonKargoTarihi?: string;
  /** Paket toplamı (kuruş). Yoksa kalemlerin toplamı. */
  toplam?: number;
  kalemler: GelenKalem[];
}

const kalemStok = z.enum(['yok', 'dusuldu', 'geri-alindi', 'hasarli']);
export const PazaryeriKalemSema = z.object({
  anahtar: z.string(),
  satirId: z.string().optional(),
  barkod: z.string().optional(),
  stokKodu: z.string().optional(),
  ad: z.string(),
  adet: z.number().int().min(1),
  tutar: z.number().int(),
  durum: z.enum(PY_DURUMLAR),
  hamDurum: z.string().optional(),
  urunId: z.string().optional(),
  /** yok: stoğa dokunulmadı · dusuldu: stoktan düşüldü · geri-alindi: iptal/iade ile geri eklendi · hasarli: iade geldi, stoğa eklenmedi */
  stok: kalemStok.default('yok'),
  /** Şu an stoktan düşülmüş adet (geri eklenirken bu kadar eklenir) */
  dusulen: z.number().int().min(0).default(0),
  /** Stok yetmediği için düşülemeyen adet — aşırı satış uyarısı */
  eksik: z.number().int().min(0).default(0),
  donusKontrolu: z.boolean().optional(),
});
export type PazaryeriKalem = z.infer<typeof PazaryeriKalemSema>;

export const PazaryeriSiparisSema = z.object({
  id: z.string(),
  kanal: z.enum(['trendyol', 'hepsiburada']),
  siparisNo: z.string(),
  paketNo: z.string().optional(),
  tarih: z.string(),
  durum: z.enum(PY_DURUMLAR),
  hamDurum: z.string().default(''),
  musteri: z.string().optional(),
  il: z.string().optional(),
  ilce: z.string().optional(),
  kargoFirma: z.string().optional(),
  kargoTakip: z.string().optional(),
  sonKargoTarihi: z.string().optional(),
  toplam: z.number().int(),
  kalemler: z.array(PazaryeriKalemSema).min(1),
  kaynak: z.enum(['api', 'excel']),
  /** Kanalın stok başlangıç tarihinden önceki sipariş: yalnız listelenir */
  stokDisi: z.boolean().default(false),
  ilkAktarim: z.string(),
  sonAktarim: z.string(),
  kanalGuncelleme: z.string().optional(),
  not: z.string().max(1000).optional(),
  gecmis: z.array(z.object({ tarih: z.string(), durum: z.enum(PY_DURUMLAR), not: z.string().optional() })).default([]),
  /** Veritabanı sürümü (çakışma denetimi); kayıtta saklanmaz, okurken eklenir */
  surum: z.number().int().min(0).default(0),
});
export type PazaryeriSiparisi = z.infer<typeof PazaryeriSiparisSema>;

/* ---------------- Envanter / pazaryeri ayarları ---------------- */

const KanalAyarSema = z.object({
  /** Kanalın siparişlerinin stoğu etkilemeye başladığı an (ISO). Boşsa ilk aktarımda "şimdi" yazılır. */
  stokBaslangic: z.string().optional(),
  sonAktarim: z.string().optional(),
  sonAktarimOzet: z.string().optional(),
  sonApi: z.string().optional(),
  sonApiHata: z.string().optional(),
  sonStokHata: z.string().optional(),
  bekleyenStok: z.object({
    id: z.string(), tarih: z.string(),
    kalemler: z.array(z.object({ urunId: z.string(), kod: z.string(), stok: z.number().int().min(0) })),
  }).optional(),
  /** Excel sütun eşleştirmesi: alan → başlığın normal() hali */
  sutunlar: z.record(z.string()).default({}),
  /** Pazaryerine bildirilen stok = gerçek stok − güvenlik payı (aktarımlar arası aşırı satışa karşı) */
  guvenlikPayi: z.number().int().min(0).max(1000).default(1),
  /** Ürün bazında: pazaryerinde satışta mı, en son oraya hangi stok yazıldı */
  urunler: z.record(z.object({
    satista: z.boolean().default(true),
    kod: z.string().trim().min(1).max(120).optional(),
    bildirilen: z.number().int().min(0).optional(),
    sonHedef: z.number().int().min(0).optional(),
    tarih: z.string().optional(),
  })).default({}),
});
export type KanalAyari = z.infer<typeof KanalAyarSema>;

export const EnvanterAyarSema = z.object({
  /** Tüm ürünler için kritik stok eşiği (ürüne özel eşik yoksa) */
  kritikVarsayilan: z.number().int().min(0).max(100000).default(3),
  urunKritik: z.record(z.number().int().min(0).max(100000)).default({}),
  /** Pazaryeri ürün kodu (kodNormal) → mağaza ürün kimliği */
  eslesmeler: z.record(z.string()).default({}),
  epostaBildirimi: z.boolean().default(true),
  kanallar: z.object({ trendyol: KanalAyarSema.default({}), hepsiburada: KanalAyarSema.default({}) }).default({}),
});
export type EnvanterAyarlari = z.infer<typeof EnvanterAyarSema>;
export const bosAyarlar = (): EnvanterAyarlari => EnvanterAyarSema.parse({});

export const kritikEsik = (a: EnvanterAyarlari, urunId: string) => a.urunKritik[urunId] ?? a.kritikVarsayilan;

/* ---------------- Excel / CSV sütunları ---------------- */

export const ALANLAR = {
  siparisNo: { ad: 'Sipariş no', es: ['siparisno', 'siparisnumarasi', 'siparisnum', 'ordernumber', 'orderno', 'siparis', 'siparisid'] },
  paketNo: { ad: 'Paket no', es: ['paketno', 'paketnumarasi', 'paketid', 'shipmentpackageid', 'packagenumber', 'kargopaketno', 'paket', 'paketkodu'] },
  tarih: { ad: 'Sipariş tarihi', es: ['siparistarihi', 'tarih', 'orderdate', 'siparisolusturmatarihi', 'olusturmatarihi', 'siparisverilmetarihi', 'siparistarihisaati'] },
  durum: { ad: 'Durum', es: ['siparisstatusu', 'siparisdurumu', 'durum', 'statu', 'status', 'paketstatusu', 'paketdurumu', 'kalemstatusu', 'kalemdurumu', 'shipmentpackagestatus', 'siparisstatu'] },
  barkod: { ad: 'Barkod', es: ['barkod', 'barcode', 'urunbarkodu', 'barkodno', 'barkodnumarasi'] },
  stokKodu: { ad: 'Stok kodu', es: ['stokkodu', 'saticistokkodu', 'merchantsku', 'sku', 'urunkodu', 'saticiurunkodu', 'stockcode', 'modelkodu'] },
  urunAdi: { ad: 'Ürün adı', es: ['urunadi', 'urun', 'productname', 'urunismi', 'urunbasligi', 'urunaciklamasi', 'name'] },
  adet: { ad: 'Adet', es: ['adet', 'miktar', 'quantity', 'urunadedi', 'satisadedi', 'adeti'] },
  birimFiyat: { ad: 'Birim fiyat', es: ['birimfiyat', 'birimfiyati', 'satisfiyati', 'fiyat', 'price', 'unitprice', 'birimsatisfiyati', 'lineunitprice'] },
  tutar: { ad: 'Tutar', es: ['faturalanacaktutar', 'faturalandirilacaktutar', 'faturalandirilacaksatisfiyati', 'satistutari', 'toplamtutar', 'tutar', 'toplam', 'odenentutar', 'amount', 'totalprice', 'packagetotalprice'] },
  musteri: { ad: 'Müşteri / alıcı', es: ['alici', 'aliciadi', 'musteri', 'musteriadi', 'musteriadsoyad', 'adsoyad', 'customername', 'aliciadsoyad', 'musteriismi', 'aliciismi'] },
  il: { ad: 'İl', es: ['il', 'sehir', 'city', 'teslimatili', 'aliciil', 'teslimatsehri'] },
  ilce: { ad: 'İlçe', es: ['ilce', 'district', 'town', 'teslimatilcesi', 'aliciilce'] },
  kargoFirma: { ad: 'Kargo firması', es: ['kargofirmasi', 'kargo', 'cargoprovidername', 'tasiyicifirma', 'kargofirma', 'cargocompany'] },
  kargoTakip: { ad: 'Kargo takip no', es: ['kargokodu', 'kargotakipno', 'kargotakipnumarasi', 'takipno', 'takipnumarasi', 'cargotrackingnumber', 'gonderikodu', 'kargobarkodu', 'trackingnumber'] },
  sonKargo: { ad: 'Son kargolama tarihi', es: ['termin', 'terminsuresi', 'terminsuresininbittigitarih', 'kargoyasonteslimtarihi', 'sonkargoteslimtarihi', 'agreeddeliverydate', 'duedate', 'kargolamasontarihi'] },
} as const;
export type Alan = keyof typeof ALANLAR;
export const ALAN_LISTESI = Object.keys(ALANLAR) as Alan[];

export interface SutunSonucu {
  baslikSatiri: number;
  basliklar: string[];
  /** alan → sütun sırası */
  eslesme: Partial<Record<Alan, number>>;
  eksik: string[];
}

/** Bir satırdaki başlıkları alanlarla eşler. Kayıtlı eşleştirme önce, sonra tam eşleşme, sonra "ile başlayan". */
function satiriEsle(basliklar: string[], kayitli: Record<string, string>): Partial<Record<Alan, number>> {
  const kodlar = basliklar.map(normal);
  const eslesme: Partial<Record<Alan, number>> = {};
  const kullanilan = new Set<number>();
  const ata = (alan: Alan, i: number) => { if (i >= 0 && !kullanilan.has(i) && eslesme[alan] === undefined) { eslesme[alan] = i; kullanilan.add(i); } };
  for (const alan of ALAN_LISTESI) if (kayitli[alan]) ata(alan, kodlar.indexOf(kayitli[alan]!));
  for (const alan of ALAN_LISTESI) for (const e of ALANLAR[alan].es) ata(alan, kodlar.findIndex((k, i) => k === e && !kullanilan.has(i)));
  for (const alan of ALAN_LISTESI) for (const e of ALANLAR[alan].es) {
    if (e.length < 5) continue;
    ata(alan, kodlar.findIndex((k, i) => !kullanilan.has(i) && k.startsWith(e)));
  }
  return eslesme;
}

export function zorunluEksikler(e: Partial<Record<Alan, number>>): string[] {
  const eksik: string[] = [];
  if (e.siparisNo === undefined && e.paketNo === undefined) eksik.push('Sipariş no veya paket no');
  if (e.barkod === undefined && e.stokKodu === undefined && e.urunAdi === undefined) eksik.push('Barkod, stok kodu veya ürün adı');
  if (e.adet === undefined) eksik.push('Adet');
  if (e.tarih === undefined) eksik.push('Sipariş tarihi');
  return eksik;
}

/** Başlık satırını bulur (ilk 15 satırda en çok alan eşleşen satır: rapor başlığı/boş satırlar atlanır) */
export function sutunlariBul(tablo: string[][], kayitli: Record<string, string> = {}): SutunSonucu {
  let en: SutunSonucu = { baslikSatiri: 0, basliklar: tablo[0] ?? [], eslesme: {}, eksik: [] };
  let enSayi = -1;
  for (let i = 0; i < Math.min(15, tablo.length); i++) {
    const basliklar = (tablo[i] ?? []).map((x) => String(x ?? '').trim());
    const eslesme = satiriEsle(basliklar, kayitli);
    const sayi = Object.keys(eslesme).length;
    if (sayi > enSayi) { en = { baslikSatiri: i, basliklar, eslesme, eksik: [] }; enSayi = sayi; }
  }
  en.eksik = zorunluEksikler(en.eslesme);
  return en;
}

/** Elle seçilen eşleştirmeyi (alan → sütun sırası) kayda uygun biçime çevirir (alan → başlık kodu) */
export const eslesmeKaydi = (basliklar: string[], e: Partial<Record<Alan, number>>) =>
  Object.fromEntries(Object.entries(e).filter(([, i]) => i !== undefined && basliklar[i!]).map(([a, i]) => [a, normal(basliklar[i!])]));

export interface TabloSonucu { siparisler: GelenSiparis[]; uyarilar: string[]; atlanan: number }

/** Excel/CSV satırlarını siparişlere çevirir. Aynı paket birden çok satırdaysa kalemler birleşir. */
export function tablodanSiparisler(kanal: Kanal, tablo: string[][], s: SutunSonucu): TabloSonucu {
  const e = s.eslesme;
  const al = (r: string[], a: Alan) => (e[a] === undefined ? '' : String(r[e[a]!] ?? '').trim());
  const gruplar = new Map<string, GelenSiparis>();
  const uyarilar: string[] = [];
  let atlanan = 0;
  let tutarsiz = 0;
  if (e.durum === undefined) uyarilar.push('Dosyada durum sütunu yok: siparişler "Hazırlanacak" sayıldı. İptaller stoğa ancak durumlu dosya yüklenince geri eklenir.');
  for (const [i, r] of tablo.slice(s.baslikSatiri + 1).entries()) {
    if (!r.some((x) => String(x ?? '').trim())) continue;
    const satir = s.baslikSatiri + i + 2;
    const siparisNo = al(r, 'siparisNo');
    const paketNo = al(r, 'paketNo');
    // Hepsiburada kaydı sipariş numarasıyla tutulur (API ile aynı anahtar); Trendyol'da paket numarası
    const anahtar = kanal === 'hepsiburada' ? siparisNo || paketNo : paketNo || siparisNo;
    if (!anahtar) { atlanan++; continue; } // toplam satırı, açıklama vb.
    const adet = Number(al(r, 'adet').replace(',', '.'));
    if (!Number.isInteger(adet) || adet < 1 || adet > 10000) { uyarilar.push(`${satir}. satır atlandı: adet okunamadı ("${al(r, 'adet')}").`); atlanan++; continue; }
    const tarih = tarihOku(al(r, 'tarih'));
    if (!tarih) { uyarilar.push(`${satir}. satır atlandı: tarih okunamadı ("${al(r, 'tarih')}").`); atlanan++; continue; }
    const barkod = al(r, 'barkod') || undefined;
    const stokKodu = al(r, 'stokKodu') || undefined;
    const ad = al(r, 'urunAdi') || stokKodu || barkod || 'Ürün';
    const birim = kurusOku(al(r, 'birimFiyat'));
    let tutar = kurusOku(al(r, 'tutar'));
    if (tutar === undefined) tutar = birim !== undefined ? birim * adet : 0;
    if (tutar === 0) tutarsiz++;
    let g = gruplar.get(anahtar);
    if (!g) {
      g = {
        kanal, anahtar, siparisNo: siparisNo || anahtar, paketNo: paketNo || undefined, tarih, hamDurum: al(r, 'durum'),
        musteri: al(r, 'musteri') || undefined, il: al(r, 'il') || undefined, ilce: al(r, 'ilce') || undefined,
        kargoFirma: al(r, 'kargoFirma') || undefined, kargoTakip: al(r, 'kargoTakip') || undefined,
        sonKargoTarihi: tarihOku(al(r, 'sonKargo')), kalemler: [],
      };
      gruplar.set(anahtar, g);
    }
    g.kalemler.push({ barkod, stokKodu, ad, adet, tutar, hamDurum: al(r, 'durum') || undefined });
  }
  if (tutarsiz) uyarilar.push(`${tutarsiz} kalemde tutar okunamadı (0 TL sayıldı). Tutar/fiyat sütununu kontrol edin.`);
  return { siparisler: [...gruplar.values()], uyarilar, atlanan };
}

/* ---------------- Resmî API yanıtları ---------------- */

type Ham = Record<string, unknown>;
const nesne = (v: unknown): Ham => (v && typeof v === 'object' ? v as Ham : {});
const yazi = (...v: unknown[]) => { for (const x of v) if (x !== undefined && x !== null && String(x).trim() !== '') return String(x).trim(); return undefined; };
const sayi = (...v: unknown[]) => { for (const x of v) { const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x) : NaN; if (Number.isFinite(n)) return n; } return undefined; };
/** { amount: 12.5, currency: 'TRY' } ya da düz sayı → kuruş */
const paraKurus = (...v: unknown[]) => { for (const x of v) { const n = sayi(nesne(x).amount, x); if (n !== undefined) return Math.round(n * 100); } return undefined; };

/**
 * Trendyol getShipmentPackages (v2) paketi → ortak biçim.
 * Not: Trendyol orderDate değerini Türkiye saatini UTC gibi kodlayarak verir (belgede "GMT+3"); 3 saat düşülür.
 */
export function trendyolPaketi(p: Ham): GelenSiparis | undefined {
  const paketNo = yazi(p.shipmentPackageId, p.id);
  const siparisNo = yazi(p.orderNumber);
  const tarihMs = sayi(p.orderDate);
  const tarih = tarihMs === undefined ? undefined : tarihOku(tarihMs - 3 * 3600e3);
  if (!paketNo || !siparisNo || !tarih) return undefined;
  const adres = nesne(p.shipmentAddress);
  const satirlar = Array.isArray(p.lines) ? p.lines.map(nesne) : [];
  const kalemler: GelenKalem[] = [];
  for (const l of satirlar) {
    const adet = sayi(l.quantity);
    if (adet === undefined || !Number.isSafeInteger(adet) || adet < 1) return undefined;
    const netBirim = paraKurus(l.lineUnitPrice)
      ?? ((paraKurus(l.lineGrossAmount, l.price) ?? 0) - (paraKurus(l.lineSellerDiscount, l.discount) ?? 0));
    kalemler.push({
      barkod: yazi(l.barcode), stokKodu: yazi(l.stockCode, l.merchantSku), ad: yazi(l.productName) ?? 'Ürün',
      satirId: yazi(l.lineId, l.id), adet, tutar: Math.max(0, netBirim * adet), hamDurum: yazi(l.orderLineItemStatusName),
    });
  }
  if (!kalemler.length) return undefined;
  const sonKargo = sayi(p.agreedDeliveryDate);
  const asilPaketler = Array.isArray(p.originPackageIds)
    ? p.originPackageIds.map((x) => yazi(x)).filter((x): x is string => !!x) : undefined;
  return {
    kanal: 'trendyol', anahtar: paketNo, siparisNo, paketNo,
    tarih,
    guncelleme: tarihOku(p.lastModifiedDate),
    asilPaketler,
    hamDurum: yazi(p.shipmentPackageStatus, p.status) ?? '',
    musteri: yazi(adres.fullName, [p.customerFirstName, p.customerLastName].filter(Boolean).join(' ')),
    il: yazi(adres.city), ilce: yazi(adres.district),
    kargoFirma: yazi(p.cargoProviderName), kargoTakip: yazi(p.cargoTrackingNumber),
    sonKargoTarihi: tarihOku(sonKargo),
    toplam: paraKurus(p.packageTotalPrice, p.totalPrice),
    kalemler,
  };
}

/**
 * Hepsiburada OMS sipariş listesi kalem kalem gelir (her satır bir ürün satırı). Sipariş numarasına göre gruplanır.
 * Alan adları kaynaklar arasında farklı yazılabildiği için birden çok aday okunur.
 * Dikkat: Hepsiburada'da "barcode" ürün barkodu değil KARGO barkodudur; ürün kimliği merchantSKU'dur.
 */
export function hepsiburadaSatirlari(satirlar: Ham[]): GelenSiparis[] {
  const gruplar = new Map<string, GelenSiparis>();
  for (const l of satirlar) {
    const siparisNo = yazi(l.orderNumber, nesne(l.order).orderNumber);
    const tarih = tarihOku(yazi(l.orderDate, l.createdDate));
    const adet = sayi(l.quantity, l.qty);
    if (!siparisNo || !tarih || adet === undefined || !Number.isSafeInteger(adet) || adet < 1) {
      throw new Error('Hepsiburada sipariş kaleminde tarih, sipariş numarası veya adet geçersiz.');
    }
    const tutar = paraKurus(l.totalPrice) ?? (paraKurus(l.unitPrice, l.price) ?? 0) * adet;
    const adres = nesne(l.shippingAddress ?? l.deliveryAddress);
    const kargo = l.cargoCompany && typeof l.cargoCompany === 'object' ? nesne(l.cargoCompany).name : l.cargoCompany;
    let g = gruplar.get(siparisNo);
    if (!g) {
      g = {
        kanal: 'hepsiburada', anahtar: siparisNo, siparisNo, paketNo: yazi(l.packageNumber), tarih,
        hamDurum: yazi(l.status, l.packageStatus) ?? '',
        musteri: yazi(l.customerName, l.recipientName, adres.name, adres.fullName),
        il: yazi(adres.city), ilce: yazi(adres.town, adres.district),
        kargoFirma: yazi(kargo, nesne(l.cargoCompanyModel).name, nesne(l.cargoCompanyModel).shortName),
        kargoTakip: yazi(l.trackingInfoCode, l.trackingNumber, l.barcode),
        sonKargoTarihi: tarihOku(yazi(l.dueDate) ?? ''), kalemler: [],
      };
      gruplar.set(siparisNo, g);
    }
    const guncelleme = tarihOku(yazi(l.lastStatusUpdateDate, l.lastModifiedDate));
    if (guncelleme && (!g.guncelleme || guncelleme > g.guncelleme)) g.guncelleme = guncelleme;
    const sonKargo = tarihOku(yazi(l.dueDate));
    if (sonKargo && (!g.sonKargoTarihi || sonKargo < g.sonKargoTarihi)) g.sonKargoTarihi = sonKargo;
    g.kalemler.push({
      stokKodu: yazi(l.merchantSKU, l.merchantSku), barkod: yazi(l.productBarcode, l.ean),
      satirId: yazi(l.lineItemId, l.id),
      ad: yazi(l.productName, l.name) ?? yazi(l.merchantSKU, l.merchantSku, l.sku) ?? 'Ürün',
      adet, tutar: Math.max(0, tutar), hamDurum: yazi(l.status),
    });
  }
  for (const siparis of gruplar.values()) {
    const ilk = siparis.kalemler[0]?.hamDurum ?? '';
    // Hepsiburada siparişinde bir paket iptal olurken başka bir paket kargoda olabilir.
    siparis.hamDurum = siparis.kalemler.every((k) => k.hamDurum === ilk) ? ilk : 'Karma';
  }
  return [...gruplar.values()];
}

/* ---------------- Ürün eşleştirme ---------------- */

export function urunEsle(k: Pick<GelenKalem, 'barkod' | 'stokKodu'>, m: Pick<Magaza, 'urunler'>, a: EnvanterAyarlari, kanal?: Kanal): Urun | undefined {
  const listeKodu = kanal === 'trendyol' ? k.barkod : k.stokKodu;
  if (kanal && listeKodu) {
    const kayitlar = Object.entries(a.kanallar[kanal].urunler).filter(([, v]) => v.kod === listeKodu);
    if (kayitlar.length) return kayitlar.length === 1 ? m.urunler.find((u) => u.id === kayitlar[0]![0]) : undefined;
  }
  const kodlar = [k.barkod, k.stokKodu].filter(Boolean).map(kodNormal).filter(Boolean);
  const eslesenler = new Set<Urun>();
  for (const kd of kodlar) {
    const id = Object.hasOwn(a.eslesmeler, kd) ? a.eslesmeler[kd] : undefined;
    const u = id ? m.urunler.find((x) => x.id === id) : undefined;
    if (u) eslesenler.add(u);
    else for (const aday of m.urunler) {
      if (urunGtin(aday) === kd || (aday.sku && kodNormal(aday.sku) === kd)) eslesenler.add(aday);
    }
  }
  return eslesenler.size === 1 ? [...eslesenler][0] : undefined;
}
export const kalemKodu = (k: Pick<GelenKalem, 'barkod' | 'stokKodu' | 'ad'>) => kodNormal(k.barkod) || kodNormal(k.stokKodu) || normal(k.ad);

/* ---------------- Birleştirme ve stok planı ---------------- */

export interface BirlesimOzeti {
  yeni: number;
  guncellenen: number;
  degismeyen: number;
  stokDisi: number;
  /** urunId → stok değişimi (eksi: düşüş) */
  stok: Map<string, number>;
  eslesmeyen: Map<string, { kod: string; ad: string; adet: number; barkod?: string; stokKodu?: string }>;
  fazlaSatis: { id: string; urunId: string; adet: number }[];
  durumDegisen: { id: string; eski: PyDurum; yeni: PyDurum }[];
}
export interface Birlesim { kayitlar: PazaryeriSiparisi[]; ozet: BirlesimOzeti }

/** Karışık pakette en erken aktif aşama, hâlâ işlem bekleyen kalemi görünür tutar. */
export function paketDurumu(kalemler: Pick<PazaryeriKalem, 'durum'>[]): PyDurum {
  const d = kalemler.map((k) => k.durum);
  if (d.every((x) => x === d[0])) return d[0]!;
  const aktif = d.filter((x) => STOK_AKTIF.has(x));
  if (aktif.length) return aktif.sort((a, b) => SIRA.indexOf(a) - SIRA.indexOf(b))[0]!;
  return d.find((x) => DONUS.has(x)) ?? d[0]!;
}

/** Kalemin stok durumunu sipariş durumuna göre ilerletir; `stok` haritası mağazadaki güncel stoğu taşır ve değiştirilir */
export function kalemStokUygula(
  k: PazaryeriKalem, stokDisi: boolean, stok: Map<string, number>, degisim: Map<string, number>,
  ayrilan: ReadonlyMap<string, number> = new Map(), oncekiAdet = k.adet, eksigiTamamla = false,
): { eksik: number } {
  if (!k.urunId || stokDisi) return { eksik: 0 };
  const mevcut = stok.get(k.urunId);
  if (mevcut === undefined) return { eksik: 0 }; // ürün katalogdan silinmiş
  if (STOK_AKTIF.has(k.durum) && k.stok !== 'hasarli') {
    const dahaOnceDusulen = k.dusulen;
    const eldeki = Math.max(0, mevcut - (ayrilan.get(k.urunId) ?? 0));
    const istenen = k.stok !== 'dusuldu' || eksigiTamamla ? k.adet - dahaOnceDusulen : k.adet - oncekiAdet;
    const hedef = kargoyaCikti(k) ? Math.max(k.adet, dahaOnceDusulen) : k.adet;
    k.dusulen = Math.min(hedef, dahaOnceDusulen + Math.min(eldeki, Math.max(0, istenen)));
    const fark = dahaOnceDusulen - k.dusulen;
    stok.set(k.urunId, mevcut + fark);
    degisim.set(k.urunId, (degisim.get(k.urunId) ?? 0) + fark);
    k.stok = 'dusuldu';
    k.eksik = Math.max(0, k.adet - k.dusulen);
    return { eksik: k.eksik };
  }
  if (GERI_EKLE.has(k.durum) && k.stok === 'dusuldu' && !k.donusKontrolu) {
    stok.set(k.urunId, mevcut + k.dusulen);
    degisim.set(k.urunId, (degisim.get(k.urunId) ?? 0) + k.dusulen);
    k.stok = 'geri-alindi';
    k.dusulen = 0;
    k.eksik = 0;
  }
  return { eksik: 0 };
}

/** İade gelen ürün kontrol edilmeyi bekliyor mu (stok düşülmüş, sipariş iade/teslim edilemedi) */
export const kalemIadeBekliyor = (k: PazaryeriKalem) => (DONUS.has(k.durum) || k.donusKontrolu === true) && k.stok === 'dusuldu' && k.dusulen > 0;
export const iadeBekliyor = (s: PazaryeriSiparisi) => s.kalemler.some(kalemIadeBekliyor);
export const eslesmeyenVar = (s: PazaryeriSiparisi) => !s.stokDisi && s.kalemler.some((k) => !k.urunId && STOK_AKTIF.has(k.durum));
export const fazlaSatisVar = (s: PazaryeriSiparisi) => s.kalemler.some((k) => k.eksik > 0 && STOK_AKTIF.has(k.durum));
export const satisMi = (s: Pick<PazaryeriSiparisi, 'durum'>) => SATIS_DURUMLARI.has(s.durum);
/** Satış sayılan kalemlerin tutarı (kısmi iptalde iptal kalem düşer) */
export const satisTutari = (s: PazaryeriSiparisi) => {
  const kalem = s.kalemler.filter((k) => SATIS_DURUMLARI.has(k.durum));
  if (kalem.length === s.kalemler.length) return s.toplam;
  return kalem.reduce((t, k) => t + k.tutar, 0);
};

const karsilastir = (s: PazaryeriSiparisi) => JSON.stringify({ ...s, surum: 0, sonAktarim: '', ilkAktarim: '' });

const eskiVeri = (g: GelenSiparis, s: PazaryeriSiparisi, kaynak: 'api' | 'excel') =>
  (kaynak === 'excel' && s.kaynak === 'api') || Boolean(s.kanalGuncelleme &&
    (!g.guncelleme || Date.parse(g.guncelleme) < Date.parse(s.kanalGuncelleme)));

const kargoyaCikti = (k: PazaryeriKalem) => k.donusKontrolu || k.durum === 'kargoda' || k.durum === 'teslim-edildi' || DONUS.has(k.durum);

/**
 * Gelen siparişleri mevcut kayıtlarla birleştirir ve stok planını çıkarır. Girdileri değiştirmez.
 * `mevcut`: kimliğe göre kayıtlar (aynı sipariş numaralı eski kayıt da bulunabilsin diye `siparisNoIle` ayrıca verilir).
 */
export function birlestir(
  gelenler: GelenSiparis[],
  mevcut: Map<string, PazaryeriSiparisi>,
  magaza: Pick<Magaza, 'urunler'>,
  ayar: EnvanterAyarlari,
  kaynak: 'api' | 'excel',
  simdi = new Date().toISOString(),
  siparisNoIle: Map<string, PazaryeriSiparisi[]> = new Map(),
  ayrilan: ReadonlyMap<string, number> = new Map(),
): Birlesim {
  const stok = new Map(magaza.urunler.map((u) => [u.id, u.stok]));
  const ozet: BirlesimOzeti = { yeni: 0, guncellenen: 0, degismeyen: 0, stokDisi: 0, stok: new Map(), eslesmeyen: new Map(), fazlaSatis: [], durumDegisen: [] };
  const kayitlar: PazaryeriSiparisi[] = [];
  const sonGelenler = new Map<string, GelenSiparis>();
  for (const g of gelenler) {
    const id = pazaryeriKimligi(g.kanal, g.anahtar);
    const onceki = sonGelenler.get(id);
    if (!onceki || (g.guncelleme && (!onceki.guncelleme || g.guncelleme > onceki.guncelleme))) sonGelenler.set(id, g);
  }
  const bolundu = (g: GelenSiparis) => durumCoz(g.hamDurum, g.kanal) === 'bolundu';
  const sirali = [...sonGelenler.values()]
    .sort((a, b) => Number(bolundu(b)) - Number(bolundu(a)) || a.tarih.localeCompare(b.tarih));
  const islenen = new Set<string>();
  for (const g of sirali) {
    let id = pazaryeriKimligi(g.kanal, g.anahtar);
    let eski = mevcut.get(id);
    if (!eski) {
      // Bir taraf paket numarasız geldiyse aynı sipariş numaralı kaydı güncelle (Excel ↔ API karışık kullanım)
      const ayni = (siparisNoIle.get(g.kanal + ':' + g.siparisNo) ?? []).filter((x) => !g.paketNo || !x.paketNo);
      if (ayni.length === 1) { eski = ayni[0]; id = eski!.id; }
    }
    if (islenen.has(id)) continue; // aynı dosyada iki kez
    islenen.add(id);
    if (eski && eskiVeri(g, eski, kaynak)) { ozet.degismeyen++; continue; }
    for (const asilPaket of g.asilPaketler ?? []) {
      const asilId = pazaryeriKimligi(g.kanal, asilPaket);
      if (asilId === id) continue;
      const asil = mevcut.get(asilId);
      if (!asil?.kalemler.some((k) => STOK_AKTIF.has(k.durum) && k.dusulen > 0)) continue;
      const yenilenen = kayitlar.find((s) => s.id === asilId);
      if (yenilenen?.durum !== 'bolundu') throw new Error(`${g.siparisNo} numaralı siparişin önceki paketinin durumu henüz doğrulanmadı.`);
    }
    const kanalAyar = ayar.kanallar[g.kanal];
    const baslangic = kanalAyar.stokBaslangic ? Date.parse(kanalAyar.stokBaslangic) : Date.parse(simdi);
    const stokDisi = eski ? eski.stokDisi : Date.parse(g.tarih) < baslangic;
    const paketHam = g.hamDurum;
    const paketHal = durumCoz(paketHam, g.kanal);
    const gercekPaketDurumu = kaynak === 'api' && g.kanal === 'trendyol';
    const paketKapandi = gercekPaketDurumu && (GERI_EKLE.has(paketHal) || DONUS.has(paketHal));
    const eskiKalemler = eski?.kalemler ?? [];
    const birlesik = new Map<string, GelenKalem & { durum: PyDurum }>();
    for (const k of g.kalemler) {
      const kalemHal = durumCoz(k.hamDurum ?? paketHam, g.kanal);
      const paketIleride = gercekPaketDurumu && STOK_AKTIF.has(kalemHal) && SIRA.indexOf(paketHal) > SIRA.indexOf(kalemHal);
      const durum = paketKapandi || paketIleride ? paketHal : kalemHal;
      const anahtar = k.satirId ? `satir:${encodeURIComponent(k.satirId)}` : `${kalemKodu(k)}|${durum}`;
      const v = birlesik.get(anahtar);
      if (!v) birlesik.set(anahtar, { ...k, durum });
      else if (!k.satirId) { v.adet += k.adet; v.tutar += k.tutar; }
      else if (v.adet !== k.adet || v.durum !== durum || kalemKodu(v) !== kalemKodu(k) || v.tutar !== k.tutar) {
        throw new Error(`${g.siparisNo} numaralı siparişin satırları çelişiyor.`);
      }
    }
    const kullanilan = new Set<PazaryeriKalem>();
    const eslesen = new Map<string, PazaryeriKalem>();
    for (const [anahtar, k] of birlesik) {
      const e = eskiKalemler.find((s) => !kullanilan.has(s) && (s.anahtar === anahtar ||
        (k.satirId ? k.satirId === s.satirId : !s.satirId && s.durum === k.durum && kalemKodu(s) === kalemKodu(k))));
      if (e) { kullanilan.add(e); eslesen.set(anahtar, e); }
    }
    for (const [anahtar, k] of birlesik) {
      if (eslesen.has(anahtar)) continue;
      const kod = kalemKodu(k);
      const adaylar = eskiKalemler.filter((e) => !kullanilan.has(e) && (!k.satirId || !e.satirId) && kalemKodu(e) === kod);
      if (!adaylar.length) continue;
      const rakipler = [...birlesik].filter(([a, satir]) => !eslesen.has(a) && kalemKodu(satir) === kod);
      if (adaylar.length !== 1 || rakipler.length !== 1) throw new Error(`${g.siparisNo} numaralı siparişte aynı ürüne ait satırlar doğrulanamadı.`);
      const e = adaylar[0]!;
      kullanilan.add(e);
      eslesen.set(anahtar, e);
    }
    const plan: { kalem: PazaryeriKalem; onceki?: PazaryeriKalem }[] = [];
    for (const [anahtar, k] of birlesik) {
      const e = eslesen.get(anahtar);
      const donusKontrolu = GERI_EKLE.has(k.durum) && e && kargoyaCikti(e) ? true : undefined;
      const degisti = e && (e.barkod && k.barkod && e.barkod !== k.barkod || e.stokKodu && k.stokKodu && e.stokKodu !== k.stokKodu);
      if (degisti && e.dusulen > 0) throw new Error(`${g.siparisNo} numaralı siparişin ürün kodu değişti. Kanal kaydını kontrol edin.`);
      const kalem = PazaryeriKalemSema.parse({
        anahtar, satirId: k.satirId ?? e?.satirId, barkod: k.barkod ?? e?.barkod, stokKodu: k.stokKodu ?? e?.stokKodu,
        ad: k.ad.slice(0, 300), adet: k.adet, tutar: k.tutar, durum: k.durum, hamDurum: k.hamDurum,
        urunId: (!degisti ? e?.urunId : undefined) ?? urunEsle(k, magaza, ayar, g.kanal)?.id,
        stok: e?.stok ?? 'yok', dusulen: e?.dusulen ?? 0, eksik: e?.eksik ?? 0, donusKontrolu,
      });
      plan.push({ kalem, onceki: e });
    }
    for (const e of eskiKalemler) if (!kullanilan.has(e)) {
      const donusKontrolu = GERI_EKLE.has(paketHal) && kargoyaCikti(e) ? true : e.donusKontrolu;
      plan.push({ kalem: paketKapandi ? { ...e, durum: paketHal, donusKontrolu } : { ...e }, onceki: e });
    }
    // Aynı paketin iptal satırları, yeni satır stok ayırmadan önce işlenir.
    const stokSirasi = [...plan].sort((a, b) => Number(GERI_EKLE.has(b.kalem.durum)) - Number(GERI_EKLE.has(a.kalem.durum)));
    for (const { kalem: k, onceki } of stokSirasi) {
      const { eksik } = kalemStokUygula(k, stokDisi, stok, ozet.stok, ayrilan, onceki?.adet);
      if (eksik) ozet.fazlaSatis.push({ id, urunId: k.urunId!, adet: eksik });
      if (!k.urunId && STOK_AKTIF.has(k.durum) && !stokDisi) {
        const kod = kalemKodu(k);
        const v = ozet.eslesmeyen.get(kod);
        if (v) v.adet += k.adet; else ozet.eslesmeyen.set(kod, { kod, ad: k.ad, adet: k.adet, barkod: k.barkod, stokKodu: k.stokKodu });
      }
    }
    const kalemler = plan.map(({ kalem }) => kalem);
    const durum = paketDurumu(kalemler);
    const toplam = g.toplam ?? kalemler.reduce((t, k) => t + k.tutar, 0);
    const kayit = PazaryeriSiparisSema.parse({
      id, kanal: g.kanal, siparisNo: g.siparisNo, paketNo: g.paketNo ?? eski?.paketNo, tarih: g.tarih, durum, hamDurum: paketHam,
      musteri: g.musteri?.slice(0, 120) ?? eski?.musteri, il: g.il ?? eski?.il, ilce: g.ilce ?? eski?.ilce,
      kargoFirma: g.kargoFirma ?? eski?.kargoFirma, kargoTakip: g.kargoTakip ?? eski?.kargoTakip,
      sonKargoTarihi: g.sonKargoTarihi ?? eski?.sonKargoTarihi, toplam, kalemler, kaynak, stokDisi,
      ilkAktarim: eski?.ilkAktarim ?? simdi, sonAktarim: simdi, not: eski?.not, kanalGuncelleme: g.guncelleme ?? eski?.kanalGuncelleme,
      gecmis: eski?.gecmis ?? [], surum: eski?.surum ?? 0,
    });
    if (!eski || eski.durum !== durum) {
      kayit.gecmis.push({ tarih: simdi, durum, not: eski ? `${PY_DURUM_ADLARI[eski.durum]} → ${PY_DURUM_ADLARI[durum]}` : (kaynak === 'api' ? 'API ile alındı' : 'Excel ile yüklendi') });
      if (eski) ozet.durumDegisen.push({ id, eski: eski.durum, yeni: durum });
    }
    if (stokDisi && !eski) ozet.stokDisi++;
    if (!eski) { ozet.yeni++; kayitlar.push(kayit); }
    else if (karsilastir(kayit) !== karsilastir(eski)) { ozet.guncellenen++; kayitlar.push(kayit); }
    else ozet.degismeyen++;
  }
  for (const [id, d] of ozet.stok) if (d === 0) ozet.stok.delete(id);
  return { kayitlar, ozet };
}

/** Panel işlemi sonrası tek kaydın stok planı (iade kararı, ürün eşleştirme): kayıt kopyası + stok değişimi */
export function kayitStokPlani(s: PazaryeriSiparisi, magaza: Pick<Magaza, 'urunler'>, ayrilan: ReadonlyMap<string, number> = new Map()): { kayit: PazaryeriSiparisi; stok: Map<string, number>; fazla: number } {
  const kayit = structuredClone(s);
  const stok = new Map(magaza.urunler.map((u) => [u.id, u.stok]));
  const degisim = new Map<string, number>();
  let fazla = 0;
  for (const k of kayit.kalemler) fazla += kalemStokUygula(k, kayit.stokDisi, stok, degisim, ayrilan, k.adet, true).eksik;
  for (const [id, d] of degisim) if (d === 0) degisim.delete(id);
  return { kayit, stok: degisim, fazla };
}

/** Pazaryerine yazılması gereken stok: gerçek stok − güvenlik payı (0'ın altına inmez) */
export const kanalHedefStok = (stok: number, a: KanalAyari) => Math.max(0, stok - a.guvenlikPayi);
