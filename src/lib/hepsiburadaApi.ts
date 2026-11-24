/**
 * Hepsiburada sipariş işlemleri (OMS): paketleme, ortak kargo barkodu, fatura bağlantısı, paket bozma, kalem iptali.
 * Uç noktalar ve gövdeler developers.hepsiburada.com "Sipariş Entegrasyonu" belgesinden alındı ve
 * 24.11.2026'da HB test (SIT) ortamında gerçek test siparişiyle uçtan uca denendi (scratchpad hb/siparis2.mjs).
 *
 * Akış: ödemesi tamamlanmış kalem "Open" gelir → paketlenir (HB otomatik paketleme açıksa 15 dk içinde kendisi yapar)
 * → paket numarası + kargo barkodu oluşur → kargo firması alınca "Shipped/InTransit" → "Delivered".
 * Paketli kalem iptal edilemez: önce paket bozulur (unpack), sonra iptal gönderilir.
 */
import { PazaryeriApiHatasi, hepsiburadaCagir } from './pazaryeriApi';

type Ham = Record<string, unknown>;
const nesne = (v: unknown): Ham => v && typeof v === 'object' && !Array.isArray(v) ? v as Ham : {};
const yazi = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined;
const sinyal = (ms = 20_000) => AbortSignal.timeout(ms);
const kod = (v: string) => encodeURIComponent(v);

export type HbKalemDurumu = { id: string; adet: number; durum: string; paketNo?: string; kargo?: string; paketlenebilir: boolean; iptalEdilebilir: boolean; ad?: string };

/** Siparişin kalemleri anlık (paket numaraları dahil). Kayıtlı veride paket numarası yalnız ilk kalem için tutulur. */
export async function hbSiparisKalemleri(siparisNo: string): Promise<HbKalemDurumu[]> {
  const { govde } = await hepsiburadaCagir('oms', `/orders/merchantid/{M}/ordernumber/${kod(siparisNo)}`, 'Hepsiburada sipariş detayı', sinyal());
  const kalemler = nesne(govde).items;
  if (!Array.isArray(kalemler)) throw new PazaryeriApiHatasi('Hepsiburada sipariş detayı kalem listesi döndürmedi.');
  return kalemler.map(nesne).map((k) => ({
    id: yazi(k.id) ?? '', adet: Number(k.quantity) || 0, durum: yazi(k.status) ?? '',
    paketNo: yazi(k.packageNumber), kargo: yazi(k.cargoCompany) ?? yazi(nesne(k.cargoCompanyModel).name),
    paketlenebilir: k.canCreatePackage === true, iptalEdilebilir: k.isCancellable === true, ad: yazi(k.name),
  })).filter((k) => k.id && k.adet > 0);
}

/** Siparişin paket numaraları (fatura bağlantısı ve etiket için). */
export async function hbSiparisPaketleri(siparisNo: string): Promise<string[]> {
  return [...new Set((await hbSiparisKalemleri(siparisNo)).map((k) => k.paketNo).filter((x): x is string => !!x))];
}

/**
 * Siparişin paketlenmemiş ("Open"/"Unpacked") kalemlerini paketler. Aynı pakete girebilecek kalemler
 * HB'nin "packageablewith" yanıtına göre gruplanır (farklı kargo/depo ise ayrı paket). Oluşan paket numaralarını döndürür.
 */
export async function hbPaketle(siparisNo: string, desi?: number): Promise<{ paketNo: string; barkod?: string }[]> {
  const kalemler = (await hbSiparisKalemleri(siparisNo)).filter((k) => !k.paketNo && ['Open', 'Unpacked'].includes(k.durum) && k.paketlenebilir);
  if (!kalemler.length) throw new PazaryeriApiHatasi('Paketlenecek kalem yok: sipariş zaten paketlenmiş, iptal edilmiş ya da Hepsiburada otomatik paketlemiş olabilir.');
  const kalan = new Map(kalemler.map((k) => [k.id, k]));
  const sonuc: { paketNo: string; barkod?: string }[] = [];
  for (let tur = 0; kalan.size && tur < 20; tur++) {
    const ilk = kalan.values().next().value!;
    // 404 = bu kalemle aynı pakete girebilecek başka kalem yok (HB belgesi; tek kalemli siparişte de böyle döner)
    const govde = kalan.size === 1 ? {} : await hepsiburadaCagir('oms', `/lineitems/merchantid/{M}/packageablewith/lineitemid/${kod(ilk.id)}`, 'Hepsiburada paketlenebilir kalemler', sinyal())
      .then((r) => r.govde, (e) => { if (e instanceof PazaryeriApiHatasi && e.status === 404) return {}; throw e; });
    const birlikte = new Set((Array.isArray(nesne(govde).lineItems) ? nesne(govde).lineItems as unknown[] : []).map((x) => yazi(nesne(x).lineItemId)));
    const grup = [ilk, ...[...kalan.values()].filter((k) => k.id !== ilk.id && birlikte.has(k.id))];
    const istek: Ham = { lineItemRequests: grup.map((k) => ({ id: k.id, quantity: k.adet })), parcelQuantity: 1 };
    if (desi && desi > 0) istek.deci = Math.round(desi * 100) / 100;
    const r = nesne((await hepsiburadaCagir('oms', '/packages/merchantid/{M}', 'Hepsiburada paketleme', sinyal(), { json: istek })).govde);
    const paketNo = yazi(r.packageNumber);
    if (!paketNo) throw new PazaryeriApiHatasi('Hepsiburada paketleme yanıtında paket numarası yok.');
    sonuc.push({ paketNo, barkod: yazi(r.barcode) });
    for (const k of grup) kalan.delete(k.id);
  }
  return sonuc;
}

/** Ortak barkod yalnız Aras Kargo ve HepsiJet'te var (HB belgesi). Diğer firmalarda etiketi kargo firması verir. */
export const hbOrtakEtiketVar = (kargo?: string) => /aras|hepsi ?jet/i.test(kargo ?? '');

/** Paketin ortak kargo barkodu (PDF). HB base64 parçalar döndürür; birden çok koli varsa birleştirmeden ilkini veririz. */
export async function hbOrtakEtiket(paketNo: string): Promise<Buffer> {
  const { govde } = await hepsiburadaCagir('oms', `/packages/merchantid/{M}/packagenumber/${kod(paketNo)}/labels?format=pdf`, 'Hepsiburada kargo etiketi', sinyal(30_000));
  const veri = nesne(govde).data;
  const ilk = Array.isArray(veri) ? yazi(veri[0]) : undefined;
  if (!ilk) throw new PazaryeriApiHatasi('Hepsiburada etiket döndürmedi. Kargo firması ortak barkod vermiyor olabilir; etiketi Hepsiburada panelinden alın.');
  const pdf = Buffer.from(ilk, 'base64');
  if (pdf.subarray(0, 4).toString('latin1') !== '%PDF') throw new PazaryeriApiHatasi('Hepsiburada etiketi PDF olarak gelmedi.');
  return pdf;
}

/**
 * Faturanın bağlantısını pakete ekler. Bağlantı herkese açık olmalı ve "application/pdf" ya da "text/html" döndürmeli.
 * 409 = pakete zaten fatura eklenmiş (başarı sayılır).
 */
export async function hbFaturaLinki(paketNo: string, link: string): Promise<'gonderildi' | 'zaten-var'> {
  const url = new URL(link);
  if (url.protocol !== 'https:') throw new PazaryeriApiHatasi('Fatura bağlantısı https:// ile başlamalı.');
  try {
    await hepsiburadaCagir('oms', `/packages/merchantid/{M}/packagenumber/${kod(paketNo)}/invoice`, 'Hepsiburada fatura bağlantısı', sinyal(30_000),
      { yontem: 'PUT', json: { invoiceLink: url.toString() } });
    return 'gonderildi';
  } catch (e) {
    if (e instanceof PazaryeriApiHatasi && e.status === 409) return 'zaten-var';
    throw e;
  }
}

/** Paketi bozar (kalemler yeniden "Open/Unpacked" olur). */
export async function hbPaketBoz(paketNo: string) {
  await hepsiburadaCagir('oms', `/packages/merchantid/{M}/packagenumber/${kod(paketNo)}/unpack`, 'Hepsiburada paket bozma', sinyal(), { yontem: 'POST' });
}

/** İptal nedenleri (HB "Sipariş entegrasyonu önemli bilgiler"). İptal cezası uygulanabilir; günlük sınır 100. */
export const HB_IPTAL_NEDENLERI: Record<number, string> = {
  12: 'Stok yok', 80: 'Üründe fiyat hatası', 81: 'Yanlış barkod eşleşmesi', 82: 'Kargo çıkışı yapılamadı', 83: 'Ürün tedarik edilemedi',
};

/** Paketlenmemiş kalemi iptal eder. */
export async function hbKalemIptal(kalemId: string, nedenId: number) {
  if (!HB_IPTAL_NEDENLERI[nedenId]) throw new PazaryeriApiHatasi('Geçersiz iptal nedeni.');
  await hepsiburadaCagir('oms', `/lineitems/merchantid/{M}/id/${kod(kalemId)}/cancelbymerchant`, 'Hepsiburada kalem iptali', sinyal(), { json: { reasonId: nedenId } });
}

/** Fiyat kilidini (MinLock/MaxLock) kaldırır: satıcı fiyattan eminse ilan girilen fiyatla satışa açılır. */
export async function hbKilitKaldir(hbSkular: string[]) {
  if (!hbSkular.length) return;
  await hepsiburadaCagir('listing', '/listings/merchantid/{M}/bulk-unlock', 'Hepsiburada kilit kaldırma', sinyal(), { json: { hbSkuList: hbSkular.slice(0, 100) } });
}
