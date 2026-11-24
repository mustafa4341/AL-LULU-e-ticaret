import { createHmac } from 'node:crypto';
import { KANALLAR, hepsiburadaSatirlari, tarihOku, trendyolPaketi, type GelenSiparis, type Kanal } from './pazaryeri';

export const pazaryeriOrtam = (ad: string) =>
  (process.env[ad] ?? (import.meta.env as Record<string, string | undefined> | undefined)?.[ad])?.trim() || undefined;

type ApiDurumu = 'kapali' | 'eksik' | 'test' | 'canli';
type ApiAyari = { kanal: Kanal; durum: ApiDurumu } & Partial<Baglanti>;
type Baglanti = { kimlik: string; kullanici: string; sifre: string; temsilci: string; canli: boolean };
type Ham = Record<string, unknown>;

function apiAyari(kanal: Kanal): ApiAyari {
  const trendyol = kanal === 'trendyol';
  const kimlik = pazaryeriOrtam(trendyol ? 'TRENDYOL_SATICI_ID' : 'HEPSIBURADA_MERCHANT_ID');
  const kullanici = pazaryeriOrtam(trendyol ? 'TRENDYOL_API_KEY' : 'HEPSIBURADA_KULLANICI');
  const sifre = pazaryeriOrtam(trendyol ? 'TRENDYOL_API_SECRET' : 'HEPSIBURADA_PAROLA');
  const temsilci = trendyol ? (kimlik && `${kimlik} - SelfIntegration`) : pazaryeriOrtam('HEPSIBURADA_USER_AGENT');
  const ortam = pazaryeriOrtam(trendyol ? 'TRENDYOL_ORTAM' : 'HEPSIBURADA_ORTAM');
  if (!kimlik && !kullanici && !sifre && !temsilci) return { kanal, durum: 'kapali' };
  const kimlikGecerli = trendyol ? /^\d+$/.test(kimlik ?? '') : /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(kimlik ?? '');
  if (!kimlik || !kimlikGecerli || !kullanici || !sifre || !temsilci
    || /[^\x20-\x7E]/.test(temsilci) || (ortam && ![trendyol ? 'stage' : 'test', 'canli'].includes(ortam))) {
    return { kanal, durum: 'eksik' };
  }
  const canli = ortam === 'canli';
  return { kanal, durum: canli ? 'canli' : 'test', kimlik, kullanici, sifre, temsilci, canli };
}

export const pazaryeriApiDurumu = (kanal: Kanal) => apiAyari(kanal).durum;
export const otomatikStokYazmaAcik = () => pazaryeriOrtam('PAZARYERI_STOK_YAZ') === '1';

/**
 * Anlık sipariş bildirimi (webhook) anahtarı: kanal "x-api-key" başlığında geri yollar.
 * Ayrı bir ortam değişkeni gerekmez; sunucudaki zamanlayıcı sırrından kanal adına türetilir (HMAC-SHA256).
 * Sır yoksa bildirim kapalıdır.
 */
export function bildirimAnahtari(kanal: Kanal): string | undefined {
  const sir = [pazaryeriOrtam('PAZARYERI_BILDIRIM_ANAHTARI'), pazaryeriOrtam('ZAMANLAYICI_ANAHTARI'), pazaryeriOrtam('CRON_SECRET')]
    .find((x): x is string => !!x && x.length >= 32);
  if (!sir) return undefined;
  return createHmac('sha256', sir).update('kanal-bildirim:' + kanal).digest('base64url').slice(0, 40);
}
/** Kanalın bildirim göndereceği adres. Trendyol kuralı: adres "trendyol", "dolap", "localhost" içeremez. */
export const BILDIRIM_YOLU: Record<Kanal, string> = { trendyol: '/api/kanal-bildirim/ty', hepsiburada: '/api/kanal-bildirim/hb' };

export class PazaryeriApiHatasi extends Error {
  constructor(mesaj: string, readonly status?: number) { super(mesaj); }
}

function baglanti(kanal: Kanal): Baglanti {
  const a = apiAyari(kanal);
  if (!a.kimlik || !a.kullanici || !a.sifre || !a.temsilci || a.canli === undefined) {
    throw new PazaryeriApiHatasi(`${KANALLAR[kanal]} API bağlantı ayarları eksik.`);
  }
  return { kimlik: a.kimlik, kullanici: a.kullanici, sifre: a.sifre, temsilci: a.temsilci, canli: a.canli };
}

const trendyolAdres = (a: Baglanti) => a.canli ? 'https://apigw.trendyol.com' : 'https://stageapigw.trendyol.com';
const hbAdres = (a: Baglanti, servis: 'oms' | 'listing' | 'mpfinance') =>
  `https://${servis}-external${a.canli ? '' : '-sit'}.hepsiburada.com`;
const nesne = (v: unknown): Ham => v && typeof v === 'object' && !Array.isArray(v) ? v as Ham : {};
const alan = (o: Ham, ad: string) => o[ad] ?? o[Object.keys(o).find((k) => k.toLowerCase() === ad.toLowerCase()) ?? ''];
const metin = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim()
  : typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : undefined;
const tamsayi = (v: unknown) => {
  const deger = metin(v);
  const n = deger && /^\d+$/.test(deger) ? Number(deger) : NaN;
  return Number.isSafeInteger(n) ? n : undefined;
};
const bekle = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function istek(a: Baglanti, url: URL, islem: string, sinyal: AbortSignal, govde?: unknown): Promise<unknown> {
  const headers = {
    Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': a.temsilci,
    Authorization: `Basic ${Buffer.from(`${a.kullanici}:${a.sifre}`).toString('base64')}`,
  };
  for (let deneme = 0; ; deneme++) {
    if (sinyal.aborted) throw new PazaryeriApiHatasi(`${islem} zaman sınırını aştı.`);
    try {
      const yanit = await fetch(url, {
        method: govde === undefined ? 'GET' : 'POST', headers, redirect: 'error',
        body: govde === undefined ? undefined : JSON.stringify(govde),
        cache: 'no-store', signal: AbortSignal.any([sinyal, AbortSignal.timeout(8000)]),
      });
      if (!yanit.ok) {
        await yanit.body?.cancel().catch(() => undefined);
        throw new PazaryeriApiHatasi(`${islem} HTTP ${yanit.status} döndürdü.`, yanit.status);
      }
      return await yanit.json();
    } catch (e) {
      const hata = e instanceof PazaryeriApiHatasi ? e : new PazaryeriApiHatasi(`${islem} tamamlanamadı.`);
      if (govde !== undefined || deneme > 0 || sinyal.aborted
        || (hata.status !== undefined && hata.status < 500 && ![408, 429].includes(hata.status))) throw hata;
      await bekle(800);
    }
  }
}

function liste(v: unknown, islem: string, ...alanlar: string[]): Ham[] {
  const govde = nesne(v);
  // Hepsiburada boş listede diziyi null döndürür: {"totalCount":0,"items":null} (SIT ortamında doğrulandı, 24.11.2026)
  const toplam = alan(govde, 'totalCount');
  const bos = (toplam === undefined || toplam === 0) && alanlar.some((k) => alan(govde, k) === null);
  const dizi = Array.isArray(v) ? v : bos ? [] : alanlar.map((k) => alan(govde, k)).find(Array.isArray);
  if (!Array.isArray(dizi) || dizi.some((x) => !x || typeof x !== 'object' || Array.isArray(x))) {
    throw new PazaryeriApiHatasi(`${islem} beklenen listeyi döndürmedi.`);
  }
  return dizi as Ham[];
}

async function trendyolSiparisleri(a: Baglanti, baslangic: number, bitis: number, sinyal: AbortSignal) {
  const islem = 'Trendyol sipariş akışı';
  const url = new URL(`/integration/order/sellers/${a.kimlik}/orders/stream`, trendyolAdres(a));
  url.searchParams.set('size', '200');
  url.searchParams.set('lastModifiedStartDate', String(baslangic));
  url.searchParams.set('lastModifiedEndDate', String(bitis));
  const paketler = new Map<string, GelenSiparis>();
  const imlecler = new Set<string>();
  while (true) {
    const yanit = nesne(await istek(a, url, islem, sinyal));
    for (const ham of liste(yanit, islem, 'content')) {
      const paket = trendyolPaketi(ham);
      if (!paket) throw new PazaryeriApiHatasi('Trendyol sipariş paketinde kimlik, tarih veya adet geçersiz.');
      // Akış sabit şekilde güncelden eskiye sıralıdır; aynı paket iki sayfada görünürse ilki geçerlidir.
      if (!paketler.has(paket.anahtar)) paketler.set(paket.anahtar, paket);
    }
    if (yanit.hasMore === false) return [...paketler.values()];
    const imlec = metin(yanit.nextCursor);
    if (yanit.hasMore !== true || !imlec || imlecler.has(imlec) || paketler.size >= 5000) {
      throw new PazaryeriApiHatasi('Trendyol sipariş akışı tamamlanamadı. Veri aralığını kontrol edin.');
    }
    imlecler.add(imlec);
    url.searchParams.set('nextCursor', imlec);
    await bekle(5000); // Trendyol akış servisi için önerilen istek aralığı.
  }
}

function hbYol(a: Baglanti, kaynak: 'orders' | 'packages' | 'listings', ek = '') {
  return `/${kaynak}/merchantid/${encodeURIComponent(a.kimlik)}${ek}`;
}

async function hbSayfalari(a: Baglanti, yol: string, alanlar: string[], sinyal: AbortSignal) {
  const islem = 'Hepsiburada sipariş listesi';
  const url = new URL(yol, hbAdres(a, 'oms'));
  const limit = 50;
  const tumu: Ham[] = [];
  for (let offset = 0; offset < 5000; offset += limit) {
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(limit));
    const yanit = await istek(a, url, islem, sinyal);
    const sayfa = liste(yanit, islem, ...alanlar);
    const toplam = tamsayi(alan(nesne(yanit), 'totalCount'));
    if (toplam !== undefined && toplam > 5000) break;
    tumu.push(...sayfa);
    if (toplam !== undefined ? tumu.length >= toplam : sayfa.length < limit) return tumu;
    if (!sayfa.length) break;
  }
  throw new PazaryeriApiHatasi('Hepsiburada sipariş listesi tamamlanamadı. Satıcı panelinden siparişleri kontrol edin.');
}

function hbAcikSatir(satir: Ham, durum: string): Ham {
  const o = nesne(alan(satir, 'order'));
  const adres = nesne(alan(satir, 'shippingAddress') ?? alan(satir, 'deliveryAddress'));
  const kargo = nesne(alan(satir, 'cargoCompanyModel'));
  const para = (v: unknown) => alan(nesne(v), 'amount') ?? v;
  return {
    orderNumber: alan(satir, 'orderNumber') ?? alan(o, 'orderNumber'),
    orderDate: alan(satir, 'orderDate') ?? alan(o, 'orderDate'),
    lastStatusUpdateDate: alan(satir, 'lastStatusUpdateDate'),
    lineItemId: alan(satir, 'lineItemId') ?? alan(satir, 'id'),
    dueDate: alan(satir, 'dueDate'), sku: alan(satir, 'sku'), merchantSku: alan(satir, 'merchantSku'),
    productName: alan(satir, 'productName') ?? alan(satir, 'name'), productBarcode: alan(satir, 'productBarcode'),
    quantity: alan(satir, 'quantity'), unitPrice: para(alan(satir, 'unitPrice') ?? alan(satir, 'price')), totalPrice: para(alan(satir, 'totalPrice')),
    customerName: alan(satir, 'customerName'),
    shippingAddress: { city: alan(adres, 'city'), town: alan(adres, 'town'), district: alan(adres, 'district'), name: alan(adres, 'name') },
    cargoCompanyModel: { name: alan(kargo, 'name'), shortName: alan(kargo, 'shortName') }, cargoCompany: alan(satir, 'cargoCompany'),
    packageNumber: alan(satir, 'packageNumber'), barcode: alan(satir, 'barcode'),
    trackingNumber: alan(satir, 'trackingNumber'), status: metin(alan(satir, 'status')) ?? durum,
    // Fatura kesmek için alıcı bilgisi (alan adları ilk gerçek bağlantıda doğrulanacak)
    invoice: alan(satir, 'invoice'), invoiceAddress: alan(satir, 'invoiceAddress') ?? alan(satir, 'billingAddress'),
    customer: alan(satir, 'customer'),
  };
}

async function hbSiparisleri(a: Baglanti, baslangic: number, sinyal: AbortSignal) {
  const akislar = [
    { yol: hbYol(a, 'orders', '/paymentawaiting'), durum: 'Awaiting' },
    { yol: hbYol(a, 'orders'), durum: 'Open' },
    { yol: hbYol(a, 'packages'), durum: 'Packaged' },
    { yol: hbYol(a, 'packages', '/shipped'), durum: 'Shipped', tarih: 'shippedDate' },
    { yol: hbYol(a, 'packages', '/delivered'), durum: 'Delivered', tarih: 'deliveredDate' },
    { yol: hbYol(a, 'packages', '/undelivered'), durum: 'UnDelivered', tarih: 'unDeliveredDate' },
    { yol: hbYol(a, 'orders', '/cancelled'), durum: 'Cancelled', tarih: 'cancelDate' },
  ];
  const sayfalar = await Promise.all(akislar.map(({ yol }) => hbSayfalari(a, yol, ['items', 'packages', 'orders'], sinyal)));
  const bekleyen = new Map<string, Ham>();
  const detaylar = new Map<string, string>();
  for (const [i, akis] of akislar.entries()) {
    for (const kayit of sayfalar[i]!) {
      const olay = tarihOku(akis.tarih ? alan(kayit, akis.tarih) : undefined);
      if (olay && Date.parse(olay) < baslangic) continue;
      const alt = alan(kayit, 'items') ?? alan(kayit, 'orders') ?? alan(kayit, 'lineItems');
      const satirlar = Array.isArray(alt) && alt.length ? alt.map(nesne) : [kayit];
      for (const satir of satirlar) {
        const no = metin(alan(satir, 'orderNumber') ?? alan(kayit, 'orderNumber'));
        if (!no) throw new PazaryeriApiHatasi('Hepsiburada sipariş listesinde sipariş numarası eksik.');
        if (akis.durum === 'Awaiting') {
          const kalem = hbAcikSatir({ ...kayit, ...satir, orderNumber: no }, 'Awaiting');
          kalem.status = 'Awaiting';
          const satirId = metin(kalem.lineItemId);
          if (!satirId) throw new PazaryeriApiHatasi('Hepsiburada bekleyen siparişinde kalem kimliği eksik.');
          bekleyen.set(`${no}:${satirId}`, kalem);
        } else detaylar.set(no, akis.durum);
      }
    }
  }
  const siparisler: Ham[] = [...bekleyen.values()].filter((s) => !detaylar.has(String(s.orderNumber)));
  if (detaylar.size > 500) {
    throw new PazaryeriApiHatasi('Hepsiburada sipariş sayısı bir aktarımın kapasitesini aştı. Satıcı panelinden siparişleri kontrol edin.');
  }
  const sirali = [...detaylar];
  for (let i = 0; i < sirali.length; i += 8) {
    const grup = await Promise.all(sirali.slice(i, i + 8).map(async ([no, durum]) => {
      const islem = 'Hepsiburada sipariş detayı';
      const yol = hbYol(a, 'orders', `/ordernumber/${encodeURIComponent(no)}`);
      const detay = nesne(await istek(a, new URL(yol, hbAdres(a, 'oms')), islem, sinyal));
      const kalemler = liste(detay, islem, 'items', 'lineItems');
      if (!kalemler.length) throw new PazaryeriApiHatasi('Hepsiburada sipariş detayı kalem içermiyor.');
      return kalemler.map((k) => {
        // Sipariş genelindeki iptal durumunu diğer satırlara yayma. Kalem durumu detaydan gelmeli.
        const kimlik = alan(k, 'lineItemId') ?? alan(k, 'id');
        const kalemDurumu = metin(alan(k, 'status') ?? alan(k, 'lineItemStatus'));
        if (!metin(kimlik) || (!kalemDurumu && kalemler.length > 1)) {
          throw new PazaryeriApiHatasi('Hepsiburada sipariş detayında kalem durumu veya kimliği eksik.');
        }
        return hbAcikSatir({
          ...k, lineItemId: kimlik, status: kalemDurumu ?? durum, orderNumber: no,
          orderDate: alan(k, 'orderDate') ?? alan(detay, 'orderDate'),
          customerName: alan(k, 'customerName') ?? alan(nesne(alan(detay, 'customer')), 'name'),
          shippingAddress: alan(k, 'shippingAddress') ?? alan(detay, 'shippingAddress'),
          invoice: alan(k, 'invoice') ?? alan(detay, 'invoice'),
          invoiceAddress: alan(k, 'invoiceAddress') ?? alan(detay, 'invoiceAddress') ?? alan(detay, 'billingAddress'),
          customer: alan(k, 'customer') ?? alan(detay, 'customer'),
        }, durum);
      });
    }));
    siparisler.push(...grup.flat());
  }
  return hepsiburadaSatirlari(siparisler);
}

export function kanalSiparisAl(kanal: Kanal, baslangic: number, bitis: number, sinyal: AbortSignal) {
  const a = baglanti(kanal);
  return kanal === 'trendyol' ? trendyolSiparisleri(a, baslangic, bitis, sinyal) : hbSiparisleri(a, baslangic, sinyal);
}

export type StokKalemi = { urunId: string; kod: string; stok: number };
/** Kanaldaki ilanın anlık hali. fiyat = satış fiyatı, listeFiyati = üstü çizili fiyat (TL, KDV dahil). */
export type KanalIlani = { stok: number; hbSku?: string; fiyat?: number; listeFiyati?: number };
const tutar = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
};

export async function kanalStokOku(kanal: Kanal, kodlar: string[], sinyal: AbortSignal): Promise<Map<string, KanalIlani>> {
  const a = baglanti(kanal);
  const sonuc = new Map<string, KanalIlani>();
  if (kanal === 'trendyol') {
    const islem = 'Trendyol stok sorgusu';
    for (let i = 0; i < kodlar.length; i += 50) {
      const url = new URL(`/integration/product/sellers/${a.kimlik}/products/approved/inventory-and-price`, trendyolAdres(a));
      url.searchParams.set('barcodes', kodlar.slice(i, i + 50).join(','));
      url.searchParams.set('size', '100');
      for (const urun of liste(await istek(a, url, islem, sinyal), islem, 'content')) {
        for (const varyant of liste(urun, islem, 'variants')) {
          const kod = metin(varyant.barcode);
          const stok = tamsayi(varyant.quantity);
          // Belge (filterApprovedProductsInventoryAndPrice): salePrice/listPrice varyantta; eski yanıtta price nesnesinde.
          const fiyat = nesne(varyant.price);
          if (kod && stok !== undefined) sonuc.set(kod, {
            stok, fiyat: tutar(varyant.salePrice) ?? tutar(fiyat.salePrice), listeFiyati: tutar(varyant.listPrice) ?? tutar(fiyat.listPrice),
          });
        }
      }
    }
    return sonuc;
  }
  const islem = 'Hepsiburada stok sorgusu';
  // Filtre parametresi "merchantSkuList" (virgülle ayrılmış). Eski "merchantSku" parametresini HB yok sayıp
  // tüm ilanları döndürüyordu (SIT ortamında doğrulandı, 24.11.2026). HB satıcı stok kodunu büyük harfe çevirir.
  const sorgulanabilir = [...new Set(kodlar.filter((k) => k && !k.includes(',')))];
  for (let i = 0; i < sorgulanabilir.length; i += 20) {
    const parca = sorgulanabilir.slice(i, i + 20);
    const url = new URL(hbYol(a, 'listings'), hbAdres(a, 'listing'));
    url.searchParams.set('merchantSkuList', parca.join(','));
    url.searchParams.set('limit', '50');
    url.searchParams.set('offset', '0');
    const kayitlar = liste(await istek(a, url, islem, sinyal), islem, 'listings', 'items');
    for (const kod of parca) {
      const kayit = kayitlar.filter((u) => metin(alan(u, 'merchantSku'))?.toLocaleUpperCase('en-US') === kod.toLocaleUpperCase('en-US'));
      if (kayit.length !== 1) continue;
      const stok = tamsayi(alan(kayit[0]!, 'availableStock'));
      const hbSku = metin(alan(kayit[0]!, 'hepsiburadaSku'));
      if (stok !== undefined && hbSku) sonuc.set(kod, { stok, hbSku, fiyat: tutar(alan(kayit[0]!, 'price')) });
    }
  }
  return sonuc;
}

export async function kanalStokGonder(
  kanal: Kanal, kalemler: StokKalemi[], ilanlar: Map<string, KanalIlani>, sinyal: AbortSignal,
): Promise<string> {
  const a = baglanti(kanal);
  const islem = `${KANALLAR[kanal]} stok gönderimi`;
  let id: string | undefined;
  if (kanal === 'trendyol') {
    const url = new URL(`/integration/inventory/sellers/${a.kimlik}/products/price-and-inventory`, trendyolAdres(a));
    const items = kalemler.map((k) => ({ barcode: k.kod, quantity: k.stok }));
    id = metin(nesne(await istek(a, url, islem, sinyal, { items })).batchRequestId);
  } else {
    const url = new URL(hbYol(a, 'listings', '/stock-uploads'), hbAdres(a, 'listing'));
    const govde = kalemler.map((k) => ({ merchantSku: k.kod, hepsiburadaSku: ilanlar.get(k.kod)?.hbSku, availableStock: k.stok }));
    id = metin(alan(nesne(await istek(a, url, islem, sinyal, govde)), 'id'));
  }
  if (!id) throw new PazaryeriApiHatasi(`${islem} takip kimliği döndürmedi.`);
  return id;
}

export type FiyatKalemi = { urunId: string; kod: string; fiyat: number };

/**
 * Yalnız fiyat gönderir (adet gönderilmez; stok eşitlemesi ayrı çalışır).
 * Trendyol updatePriceAndInventory: { items: [{ barcode, salePrice, listPrice }] } — yalnız barcode zorunlu, en fazla 1000;
 *   aynı istek 15 dk içinde tekrarlanamaz. Liste fiyatı = satış fiyatı (üstü çizili fiyat yok).
 * Hepsiburada listing price-uploads: [{ merchantSku, hepsiburadaSku, price }] (developers.hepsiburada.com, 23.11.2026).
 */
export async function kanalFiyatGonder(
  kanal: Kanal, kalemler: FiyatKalemi[], ilanlar: Map<string, KanalIlani>, sinyal: AbortSignal,
): Promise<string> {
  if (!kalemler.length || kalemler.length > 1000) throw new PazaryeriApiHatasi('Bir seferde 1–1000 fiyat gönderilebilir.');
  if (kalemler.some((k) => !(k.fiyat > 0))) throw new PazaryeriApiHatasi('Sıfır veya geçersiz fiyat gönderilemez.');
  const a = baglanti(kanal);
  const islem = `${KANALLAR[kanal]} fiyat gönderimi`;
  let id: string | undefined;
  if (kanal === 'trendyol') {
    const url = new URL(`/integration/inventory/sellers/${a.kimlik}/products/price-and-inventory`, trendyolAdres(a));
    const items = kalemler.map((k) => ({ barcode: k.kod, salePrice: k.fiyat, listPrice: k.fiyat }));
    id = metin(nesne(await istek(a, url, islem, sinyal, { items })).batchRequestId);
  } else {
    const url = new URL(hbYol(a, 'listings', '/price-uploads'), hbAdres(a, 'listing'));
    const govde = kalemler.map((k) => ({ merchantSku: k.kod, hepsiburadaSku: ilanlar.get(k.kod)?.hbSku, price: k.fiyat }));
    id = metin(alan(nesne(await istek(a, url, islem, sinyal, govde)), 'id'));
  }
  if (!id) throw new PazaryeriApiHatasi(`${islem} takip kimliği döndürmedi.`);
  return id;
}

/**
 * Fiyat gönderiminin sonucu. Reddedilen ilanlar sebebiyle döner.
 * Trendyol: toplu istek sonucu. Hepsiburada: price-uploads/id/{id} → status (Ready → Done), errors[] ve priceValidations[].
 * HB fiyatı platform aralığı dışında bulursa yüklemeyi yine "Done" yapar ama ilanı MinLock/MaxLock ile kilitler
 * ve satışa kapatır (SIT ortamında doğrulandı, 24.11.2026) — bu da ret sayılır.
 */
export async function kanalFiyatSonucu(
  kanal: Kanal, id: string, sinyal: AbortSignal,
): Promise<{ bekliyor: boolean; reddedilen: { kod: string; sebep: string }[]; basarili: string[] }> {
  const a = baglanti(kanal);
  const islem = `${KANALLAR[kanal]} fiyat gönderim sonucu`;
  if (kanal === 'hepsiburada') {
    const url = new URL(hbYol(a, 'listings', `/price-uploads/id/${encodeURIComponent(id)}`), hbAdres(a, 'listing'));
    const yanit = nesne(await istek(a, url, islem, sinyal));
    const durum = metin(alan(yanit, 'status'))?.toLowerCase();
    if (durum !== 'done') return { bekliyor: !(durum && ['failed', 'error', 'cancelled'].includes(durum)), reddedilen: [], basarili: [] };
    const dizi = (v: unknown) => Array.isArray(v) ? v.map(nesne) : [];
    const reddedilen: { kod: string; sebep: string }[] = [];
    for (const h of dizi(alan(yanit, 'errors'))) {
      const kod = metin(alan(h, 'merchantSku')) ?? metin(alan(h, 'hepsiburadaSku'));
      const sebep = dizi(alan(h, 'errors')).map((x) => metin(alan(x, 'message')) ?? metin(alan(x, 'description'))).filter(Boolean).join('; ')
        || (Array.isArray(alan(h, 'errors')) ? (alan(h, 'errors') as unknown[]).map(String).join('; ') : '');
      if (kod) reddedilen.push({ kod, sebep: (sebep || 'Hepsiburada fiyatı kabul etmedi.').slice(0, 300) });
    }
    for (const v of dizi(alan(yanit, 'priceValidations'))) {
      const kod = metin(alan(v, 'merchantSku')) ?? metin(alan(v, 'hepsiburadaSku'));
      const tur = metin(alan(v, 'type'));
      if (!kod || reddedilen.some((r) => r.kod === kod)) continue;
      const sebep = tur === 'MinLock' ? 'Hepsiburada fiyatı platformdaki fiyat aralığının altında bulup ilanı kilitledi (satışa kapalı).'
        : tur === 'MaxLock' ? 'Hepsiburada fiyatı platformdaki fiyat aralığının üstünde bulup ilanı kilitledi (satışa kapalı).'
        : metin(alan(v, 'description')) ?? 'Hepsiburada fiyat denetimine takıldı.';
      reddedilen.push({ kod, sebep: (sebep + ' Fiyattan eminseniz Hepsiburada satıcı panelinde Envanter ekranından kilidi kaldırın.').slice(0, 300) });
    }
    return { bekliyor: false, reddedilen, basarili: [] };
  }
  const yol = `/integration/product/sellers/${a.kimlik}/products/batch-requests/${encodeURIComponent(id)}`;
  const yanit = nesne(await istek(a, new URL(yol, trendyolAdres(a)), islem, sinyal));
  if (yanit.status === 'IN_PROGRESS') return { bekliyor: true, reddedilen: [], basarili: [] };
  const reddedilen: { kod: string; sebep: string }[] = [];
  const basarili: string[] = [];
  for (const x of liste(yanit, islem, 'items')) {
    const kod = metin(nesne(x.requestItem).barcode);
    if (!kod) continue;
    if (x.status === 'SUCCESS') basarili.push(kod);
    else if (x.status === 'FAILED') {
      const sebepler = Array.isArray(x.failureReasons) ? x.failureReasons.map((r) => String(r)).join('; ') : '';
      reddedilen.push({ kod, sebep: (sebepler || 'Trendyol fiyatı kabul etmedi.').slice(0, 300) });
    } else return { bekliyor: true, reddedilen: [], basarili: [] };
  }
  return { bekliyor: false, reddedilen, basarili };
}

export type TrendyolIlanOzeti = { barkod: string; stokKodu?: string; anaKod?: string; fiyat?: number; listeFiyati?: number; stok?: number };

/** Trendyol'daki tüm onaylı ilanlar (barkod, stok kodu, fiyat, stok). Sayfa başına 100; en fazla 10.000 ilan. */
export async function trendyolTumIlanlar(sinyal: AbortSignal): Promise<TrendyolIlanOzeti[]> {
  const a = baglanti('trendyol');
  const islem = 'Trendyol ilan listesi';
  const sonuc = new Map<string, TrendyolIlanOzeti>();
  for (let sayfa = 0; sayfa < 100; sayfa++) {
    const url = new URL(`/integration/product/sellers/${a.kimlik}/products/approved/inventory-and-price`, trendyolAdres(a));
    url.searchParams.set('page', String(sayfa));
    url.searchParams.set('size', '100');
    const yanit = nesne(await istek(a, url, islem, sinyal));
    const icerik = liste(yanit, islem, 'content');
    for (const urun of icerik) {
      for (const v of liste(urun, islem, 'variants')) {
        const barkod = metin(v.barcode);
        if (!barkod) continue;
        const fiyat = nesne(v.price);
        sonuc.set(barkod, {
          barkod, stokKodu: metin(v.stockCode), anaKod: metin(urun.productMainId),
          fiyat: tutar(v.salePrice) ?? tutar(fiyat.salePrice), listeFiyati: tutar(v.listPrice) ?? tutar(fiyat.listPrice), stok: tamsayi(v.quantity),
        });
      }
    }
    const toplamSayfa = tamsayi(yanit.totalPages) ?? 0;
    if (!icerik.length || sayfa + 1 >= toplamSayfa) break;
  }
  return [...sonuc.values()];
}

export async function kanalStokSonucu(
  kanal: Kanal, id: string, kalemler: StokKalemi[], sinyal: AbortSignal,
): Promise<{ bekliyor: boolean; basarili: Set<string> }> {
  const a = baglanti(kanal);
  const islem = `${KANALLAR[kanal]} stok gönderim sonucu`;
  if (kanal === 'trendyol') {
    const yol = `/integration/product/sellers/${a.kimlik}/products/batch-requests/${encodeURIComponent(id)}`;
    const yanit = nesne(await istek(a, new URL(yol, trendyolAdres(a)), islem, sinyal));
    const kalem = liste(yanit, islem, 'items');
    const islenen = kalem.filter((k) => ['SUCCESS', 'FAILED'].includes(String(k.status)));
    if (islenen.length < kalemler.length || yanit.status === 'IN_PROGRESS') return { bekliyor: true, basarili: new Set() };
    const basarili = new Set<string>();
    for (const x of islenen) {
      const istekKalemi = nesne(x.requestItem);
      const kod = metin(istekKalemi.barcode);
      const adet = tamsayi(istekKalemi.quantity);
      if (x.status === 'SUCCESS' && kod && kalemler.some((k) => k.kod === kod && k.stok === adet)) basarili.add(kod);
    }
    return { bekliyor: false, basarili };
  }
  const url = new URL(hbYol(a, 'listings', `/stock-uploads/id/${encodeURIComponent(id)}`), hbAdres(a, 'listing'));
  const yanit = nesne(await istek(a, url, islem, sinyal));
  const durum = metin(alan(yanit, 'status'))?.toLowerCase();
  if (durum !== 'done') {
    if (durum && ['failed', 'error', 'cancelled'].includes(durum)) return { bekliyor: false, basarili: new Set() };
    return { bekliyor: true, basarili: new Set() };
  }
  const hatalar = alan(yanit, 'errors');
  // Kuyruğun tamamlanması tek başına satırların uygulandığını doğrulamaz.
  if (Object.keys(nesne(hatalar)).length || (Array.isArray(hatalar) && hatalar.length)) {
    return { bekliyor: false, basarili: new Set() };
  }
  const ilanlar = await kanalStokOku(kanal, kalemler.map((k) => k.kod), sinyal);
  return {
    bekliyor: false,
    basarili: new Set(kalemler.filter((k) => ilanlar.get(k.kod)?.stok === k.stok).map((k) => k.kod)),
  };
}

/**
 * Trendyol'a tek bir istek (ürün, fiyat, paket, fatura, finans servisleri için; bkz. trendyolApi.ts).
 * `yol` /integration sonrasını içerir. Hata gövdesindeki Trendyol mesajı (errors[].message) okunur.
 * Yazma istekleri (POST/PUT) otomatik tekrar edilmez.
 */
export async function trendyolCagir(
  yol: (saticiId: string) => string, islem: string, sinyal: AbortSignal,
  secenek: { yontem?: 'GET' | 'POST' | 'PUT' | 'DELETE'; json?: unknown; form?: FormData; sorgu?: Record<string, string | number | undefined> | ((saticiId: string) => Record<string, string | number | undefined>) } = {},
): Promise<unknown> {
  const a = baglanti('trendyol');
  const url = new URL('/integration' + yol(a.kimlik), trendyolAdres(a));
  const sorgu = typeof secenek.sorgu === 'function' ? secenek.sorgu(a.kimlik) : secenek.sorgu;
  for (const [k, v] of Object.entries(sorgu ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  const yontem = secenek.yontem ?? (secenek.json !== undefined || secenek.form ? 'POST' : 'GET');
  const headers: Record<string, string> = {
    Accept: 'application/json', 'User-Agent': a.temsilci,
    Authorization: `Basic ${Buffer.from(`${a.kullanici}:${a.sifre}`).toString('base64')}`,
  };
  if (secenek.json !== undefined) headers['Content-Type'] = 'application/json';
  for (let deneme = 0; ; deneme++) {
    if (sinyal.aborted) throw new PazaryeriApiHatasi(`${islem} zaman sınırını aştı.`);
    let yanit: Response;
    try {
      yanit = await fetch(url, {
        method: yontem, headers, redirect: 'error', cache: 'no-store',
        body: secenek.form ?? (secenek.json === undefined ? undefined : JSON.stringify(secenek.json)),
        signal: AbortSignal.any([sinyal, AbortSignal.timeout(15_000)]),
      });
    } catch {
      if (yontem === 'GET' && deneme === 0 && !sinyal.aborted) { await bekle(800); continue; }
      throw new PazaryeriApiHatasi(`${islem} tamamlanamadı. Bağlantıyı kontrol edin.`);
    }
    const govde = await yanit.text().catch(() => '');
    if (!yanit.ok) {
      if (yontem === 'GET' && deneme === 0 && (yanit.status >= 500 || yanit.status === 429)) { await bekle(1500); continue; }
      let ayrinti = '';
      try {
        const h = nesne(JSON.parse(govde));
        // Trendyol hata gövdesi: { errors: [{ key, message, errorCode }] } ya da { message | detail | title | exception }
        const hatalar = Array.isArray(h.errors)
          ? h.errors.map((x) => { const o = nesne(x); return metin(o.message) ?? metin(o.errorMessage) ?? metin(o.key) ?? metin(o.errorCode); }).filter(Boolean) : [];
        ayrinti = (hatalar.length ? hatalar.join(' ')
          : metin(h.message) ?? metin(h.errorMessage) ?? metin(h.detail) ?? metin(h.title) ?? metin(h.error) ?? metin(h.exception) ?? '').slice(0, 400);
      } catch { /* gövde JSON değil */ }
      const genel = yanit.status === 401 || yanit.status === 403 ? ' API bilgilerini ve yetkisini kontrol edin.'
        : yanit.status === 429 ? ' Trendyol istek sınırına ulaşıldı, biraz sonra tekrar deneyin.' : '';
      throw new PazaryeriApiHatasi(`${islem} HTTP ${yanit.status} döndürdü.${ayrinti ? ' Trendyol: ' + ayrinti : ''}${genel}`, yanit.status);
    }
    if (!govde.trim()) return {};
    try { return JSON.parse(govde); } catch { return { metin: govde.slice(0, 2000) }; }
  }
}

/**
 * Hepsiburada'ya tek bir istek (paketleme, etiket, fatura bağlantısı, iptal; bkz. hepsiburadaApi.ts).
 * `yol` içindeki {M} satıcı kimliğiyle değiştirilir. Yazma istekleri otomatik tekrar edilmez.
 * Hata gövdesi: { message | defaultMessage | messageTR | errors } (SIT ortamında görüldü).
 */
export async function hepsiburadaCagir(
  servis: 'oms' | 'listing', yol: string, islem: string, sinyal: AbortSignal,
  secenek: { yontem?: 'GET' | 'POST' | 'PUT'; json?: unknown } = {},
): Promise<{ status: number; govde: unknown }> {
  const a = baglanti('hepsiburada');
  const url = new URL(yol.replaceAll('{M}', encodeURIComponent(a.kimlik)), hbAdres(a, servis));
  const yontem = secenek.yontem ?? (secenek.json !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = {
    Accept: 'application/json', 'User-Agent': a.temsilci,
    Authorization: `Basic ${Buffer.from(`${a.kullanici}:${a.sifre}`).toString('base64')}`,
  };
  if (secenek.json !== undefined) headers['Content-Type'] = 'application/json';
  for (let deneme = 0; ; deneme++) {
    if (sinyal.aborted) throw new PazaryeriApiHatasi(`${islem} zaman sınırını aştı.`);
    let yanit: Response;
    try {
      yanit = await fetch(url, {
        method: yontem, headers, redirect: 'error', cache: 'no-store',
        body: secenek.json === undefined ? undefined : JSON.stringify(secenek.json),
        signal: AbortSignal.any([sinyal, AbortSignal.timeout(15_000)]),
      });
    } catch {
      if (yontem === 'GET' && deneme === 0 && !sinyal.aborted) { await bekle(800); continue; }
      throw new PazaryeriApiHatasi(`${islem} tamamlanamadı. Bağlantıyı kontrol edin.`);
    }
    const metinGovde = await yanit.text().catch(() => '');
    let govde: unknown = {};
    if (metinGovde.trim()) { try { govde = JSON.parse(metinGovde); } catch { govde = { metin: metinGovde.slice(0, 2000) }; } }
    if (yanit.ok) return { status: yanit.status, govde };
    if (yontem === 'GET' && deneme === 0 && (yanit.status >= 500 || yanit.status === 429)) { await bekle(1500); continue; }
    const h = nesne(govde);
    const hatalar = Array.isArray(h.errors) ? h.errors.map((x) => metin(nesne(x).message) ?? metin(x)).filter(Boolean).join(' ') : '';
    const ayrinti = (metin(h.messageTR) ?? metin(h.message) ?? metin(h.defaultMessage) ?? (hatalar || metin(h.metin)) ?? '').slice(0, 400);
    const genel = yanit.status === 401 || yanit.status === 403 ? ' API bilgilerini ve yetkisini kontrol edin.'
      : yanit.status === 429 ? ' Hepsiburada istek sınırına ulaşıldı, biraz sonra tekrar deneyin.' : '';
    throw new PazaryeriApiHatasi(`${islem} HTTP ${yanit.status} döndürdü.${ayrinti ? ' Hepsiburada: ' + ayrinti : ''}${genel}`, yanit.status);
  }
}

/** Hepsiburada muhasebe servisi (mpfinance): sayfalı GET. Limit en fazla 100 (resmi belge). */
async function hbFinansSayfalari(a: Baglanti, yol: string, parametre: Record<string, string>, islem: string, sinyal: AbortSignal) {
  const url = new URL(yol, hbAdres(a, 'mpfinance'));
  for (const [k, v] of Object.entries(parametre)) url.searchParams.set(k, v);
  const limit = 100;
  const tumu: Ham[] = [];
  for (let offset = 0; offset < 20_000; offset += limit) {
    url.searchParams.set('Offset', String(offset));
    url.searchParams.set('Limit', String(limit));
    const yanit = await istek(a, url, islem, sinyal);
    const sayfa = liste(yanit, islem, 'items');
    const govde = nesne(yanit);
    const toplam = tamsayi(alan(govde, 'count') ?? alan(govde, 'totalCount'));
    tumu.push(...sayfa);
    if (toplam !== undefined ? tumu.length >= toplam : sayfa.length < limit) return tumu;
    if (!sayfa.length) break;
  }
  throw new PazaryeriApiHatasi(`${islem} tamamlanamadı. Daha kısa bir tarih aralığı seçin.`);
}

/** Hepsiburada finans kayıtları (kayıt tarihine göre) ve sipariş bazlı performans (sipariş tarihine göre).
 *  Aralık 31 günlük parçalara bölünür; her parça ayrı sorgulanır. */
export async function hepsiburadaFinansCek(baslangic: number, bitis: number, sinyal: AbortSignal) {
  const a = baglanti('hepsiburada');
  const kayitlar: Ham[] = [];
  const performans: Ham[] = [];
  const parca = 31 * 86_400_000;
  for (let bas = baslangic; bas < bitis; bas += parca) {
    const son = Math.min(bitis, bas + parca);
    const iso = (t: number) => new Date(t).toISOString();
    kayitlar.push(...await hbFinansSayfalari(a, `/transactions/merchantid/${encodeURIComponent(a.kimlik)}`,
      { RecordDateStart: iso(bas), RecordDateEnd: iso(son) }, 'Hepsiburada muhasebe kayıtları', sinyal));
    performans.push(...await hbFinansSayfalari(a, `/orders/merchantid/${encodeURIComponent(a.kimlik)}`,
      { OrderDateStart: iso(bas), OrderDateEnd: iso(son) }, 'Hepsiburada sipariş performansı', sinyal));
  }
  return { kayitlar, performans };
}
