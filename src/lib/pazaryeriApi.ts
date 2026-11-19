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
const hbAdres = (a: Baglanti, servis: 'oms' | 'listing') =>
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
  const dizi = Array.isArray(v) ? v : alanlar.map((k) => alan(govde, k)).find(Array.isArray);
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
    { yol: hbYol(a, 'orders', '/cancelled'), durum: 'Cancelled', tarih: 'cancelledDate' },
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
type KanalIlani = { stok: number; hbSku?: string };

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
          if (kod && stok !== undefined) sonuc.set(kod, { stok });
        }
      }
    }
    return sonuc;
  }
  const islem = 'Hepsiburada stok sorgusu';
  for (let i = 0; i < kodlar.length; i += 8) {
    const grup = await Promise.all(kodlar.slice(i, i + 8).map(async (kod) => {
      const url = new URL(hbYol(a, 'listings'), hbAdres(a, 'listing'));
      url.searchParams.set('merchantSku', kod);
      url.searchParams.set('limit', '50');
      url.searchParams.set('offset', '0');
      const kayit = liste(await istek(a, url, islem, sinyal), islem, 'listings', 'items')
        .filter((u) => metin(alan(u, 'merchantSku')) === kod);
      if (kayit.length !== 1) return;
      const stok = tamsayi(alan(kayit[0]!, 'availableStock'));
      const hbSku = metin(alan(kayit[0]!, 'hepsiburadaSku'));
      if (stok !== undefined && hbSku) return { kod, stok, hbSku };
    }));
    for (const kayit of grup) if (kayit) sonuc.set(kayit.kod, kayit);
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
    const govde = kalemler.map((k) => ({ MerchantSku: k.kod, HepsiburadaSku: ilanlar.get(k.kod)?.hbSku, AvailableStock: k.stok }));
    id = metin(alan(nesne(await istek(a, url, islem, sinyal, govde)), 'id'));
  }
  if (!id) throw new PazaryeriApiHatasi(`${islem} takip kimliği döndürmedi.`);
  return id;
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
