/**
 * Trendyol satıcı entegrasyonu — ürün, fiyat, paket, fatura ve cari hesap servisleri.
 * Yollar developers.trendyol.com (Ürün Entegrasyonu V2, Sipariş, Fatura, Yurtiçi Cari Hesap Ekstresi) belgelerinden
 * 21.11.2026'da doğrulandı. Bağlantı bilgileri ve istek altyapısı pazaryeriApi.ts'dedir.
 */
import { PazaryeriApiHatasi, trendyolCagir } from './pazaryeriApi';

type Ham = Record<string, unknown>;
const nesne = (v: unknown): Ham => v && typeof v === 'object' && !Array.isArray(v) ? v as Ham : {};
const dizi = (v: unknown): Ham[] => Array.isArray(v) ? v.map(nesne) : [];
const yazi = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined;
const tam = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined;
const sinyal = (ms = 25_000) => AbortSignal.timeout(ms);

/* ---------------- Katalog: kategori, özellik, marka, adres ---------------- */

export type TyKategori = { id: number; ad: string; yol: string };

/** getCategoryTree ?name= — yalnız en alt seviye (ürün açılabilen) kategoriler, tam yol adıyla. */
export async function tyKategoriAra(ad: string): Promise<TyKategori[]> {
  const aranan = ad.trim();
  if (aranan.length < 2) return [];
  const agac = await trendyolCagir(() => '/product/product-categories', 'Trendyol kategori araması', sinyal(), { sorgu: { name: aranan } });
  const sonuc: TyKategori[] = [];
  const gez = (dugumler: Ham[], ust: string[]) => {
    for (const d of dugumler) {
      const id = tam(d.id);
      const isim = yazi(d.name);
      if (!id || !isim) continue;
      const alt = dizi(d.subCategories);
      if (alt.length) gez(alt, [...ust, isim]);
      else sonuc.push({ id, ad: isim, yol: [...ust, isim].join(' › ') });
    }
  };
  gez(Array.isArray(agac) ? agac.map(nesne) : dizi(nesne(agac).categories), []);
  const gorulen = new Set<number>();
  return sonuc.filter((k) => !gorulen.has(k.id) && gorulen.add(k.id)).slice(0, 60);
}

export type TyOzellik = {
  id: number; ad: string; zorunlu: boolean; ozelDeger: boolean; coklu: boolean; varyant: boolean;
  degerler: { id: number; ad: string }[];
};
const ozellikOnbellegi = new Map<number, { zaman: number; veri: TyOzellik[] }>();

/** getCategoryAttributes + getCategoryAttributeValues (zorunlu ve değer listesi olanlar için). */
export async function tyKategoriOzellikleri(kategoriId: number): Promise<TyOzellik[]> {
  const onbellek = ozellikOnbellegi.get(kategoriId);
  if (onbellek && Date.now() - onbellek.zaman < 3600_000) return onbellek.veri;
  const s = sinyal(40_000);
  const yanit = nesne(await trendyolCagir(() => `/product/categories/${kategoriId}/attributes`, 'Trendyol kategori özellikleri', s));
  const ozellikler: TyOzellik[] = dizi(yanit.categoryAttributes).map((x) => {
    const o = nesne(x.attribute);
    return {
      id: tam(o.id) ?? 0, ad: yazi(o.name) ?? 'Özellik', zorunlu: x.required === true, ozelDeger: x.allowCustom === true,
      coklu: x.allowMultipleAttributeValues === true, varyant: x.varianter === true, degerler: [],
    };
  }).filter((o) => o.id > 0);
  // Değer listesi: zorunlu olanlar ve özel değer kabul etmeyenler (seçim zorunlu). 6'şar paralel istek.
  const degerGereken = ozellikler.filter((o) => o.zorunlu || !o.ozelDeger).slice(0, 60);
  for (let i = 0; i < degerGereken.length; i += 6) {
    await Promise.all(degerGereken.slice(i, i + 6).map(async (o) => {
      const degerler: { id: number; ad: string }[] = [];
      for (let sayfa = 0; sayfa < 5; sayfa++) {
        const v = nesne(await trendyolCagir(() => `/product/categories/${kategoriId}/attributes/${o.id}/values`,
          'Trendyol özellik değerleri', s, { sorgu: { page: sayfa, size: 1000 } }));
        for (const d of dizi(v.content)) {
          const id = tam(d.attributeValueId);
          // Belge (Kategori Özellik Değerleri Listesi v2): { attributeValueId, attributeValue }. Eski ad: attributeValueName.
          const ad = yazi(d.attributeValue) ?? yazi(d.attributeValueName) ?? yazi(d.name);
          if (id && ad) degerler.push({ id, ad });
        }
        const toplamSayfa = tam(v.totalPages) ?? 1;
        if (sayfa + 1 >= toplamSayfa) break;
      }
      o.degerler = degerler;
    }));
  }
  ozellikler.sort((a, b) => Number(b.zorunlu) - Number(a.zorunlu) || a.ad.localeCompare(b.ad, 'tr'));
  ozellikOnbellegi.set(kategoriId, { zaman: Date.now(), veri: ozellikler });
  return ozellikler;
}

/** getBrandsByName — büyük/küçük harf duyarlı; yazıldığı gibi ve büyük harfle denenir. */
export async function tyMarkaAra(ad: string): Promise<{ id: number; ad: string }[]> {
  const aranan = ad.replace(/[®™©]/g, '').trim();
  if (!aranan) return [];
  const adaylar = [...new Set([aranan, aranan.toLocaleUpperCase('tr'), aranan.toLocaleUpperCase('en')])];
  const sonuc = new Map<number, string>();
  for (const aday of adaylar) {
    const yanit = await trendyolCagir(() => '/product/brands/by-name', 'Trendyol marka araması', sinyal(), { sorgu: { name: aday } })
      .catch((e) => { if (e instanceof PazaryeriApiHatasi && e.status === 404) return []; throw e; });
    for (const m of Array.isArray(yanit) ? yanit.map(nesne) : dizi(nesne(yanit).brands)) {
      const id = tam(m.id);
      const isim = yazi(m.name);
      if (id && isim) sonuc.set(id, isim);
    }
  }
  return [...sonuc].map(([id, isim]) => ({ id, ad: isim })).slice(0, 30);
}

export type TyAdresler = { sevkiyat?: { id: number; ad: string }; iade?: { id: number; ad: string }; hepsi: { id: number; tur: string; ad: string; varsayilan: boolean }[] };

/** getSuppliersAddresses — ürün açarken sevkiyat ve iade adresi kimlikleri. */
export async function tyAdresler(): Promise<TyAdresler> {
  const y = nesne(await trendyolCagir((id) => `/sellers/${id}/addresses`, 'Trendyol adres bilgileri', sinyal()));
  const hepsi = dizi(y.supplierAddresses).map((a) => ({
    id: tam(a.id) ?? 0, tur: yazi(a.addressType) ?? '', varsayilan: a.isDefault === true,
    ad: [yazi(a.district), yazi(a.city)].filter(Boolean).join(' / ') || yazi(a.fullAddress) || 'Adres',
    sevk: a.isShipmentAddress === true, iade: a.isReturningAddress === true,
  })).filter((a) => a.id > 0);
  const sec = (f: (a: (typeof hepsi)[number]) => boolean) => {
    const a = hepsi.find((x) => f(x) && x.varsayilan) ?? hepsi.find(f);
    return a ? { id: a.id, ad: a.ad } : undefined;
  };
  return {
    sevkiyat: sec((a) => a.sevk), iade: sec((a) => a.iade),
    hepsi: hepsi.map(({ id, tur, ad, varsayilan }) => ({ id, tur, ad, varsayilan })),
  };
}

/* ---------------- Ürün gönderme ve onay takibi ---------------- */

export type TyUrunIstegi = {
  barcode: string; title: string; productMainId: string; brandId: number; categoryId: number; quantity: number;
  stockCode: string; dimensionalWeight: number; description: string; listPrice: number; salePrice: number; vatRate: number;
  images: { url: string }[];
  attributes: { attributeId: number; attributeValueIds?: number[]; attributeValue?: string }[];
  shipmentAddressId?: number; returningAddressId?: number;
};

/** createProducts V2 — kuyruk kimliği döner (sonuç 4 saat sorgulanabilir). */
export async function tyUrunGonder(urunler: TyUrunIstegi[]): Promise<string> {
  if (!urunler.length || urunler.length > 1000) throw new PazaryeriApiHatasi('Bir seferde 1–1000 ürün gönderilebilir.');
  const y = nesne(await trendyolCagir((id) => `/product/sellers/${id}/v2/products`, 'Trendyol ürün gönderimi', sinyal(), { json: { items: urunler } }));
  const kimlik = yazi(y.batchRequestId);
  if (!kimlik) throw new PazaryeriApiHatasi('Trendyol ürün gönderimi takip numarası döndürmedi.');
  return kimlik;
}

export type TyKuyrukSonucu = { bitti: boolean; satirlar: { barkod?: string; basarili: boolean; sebepler: string[] }[] };

/** getBatchRequestResult — ürün, fiyat ve stok kuyrukları için ortak. */
export async function tyKuyrukSonucu(batchId: string): Promise<TyKuyrukSonucu> {
  const y = nesne(await trendyolCagir((id) => `/product/sellers/${id}/products/batch-requests/${encodeURIComponent(batchId)}`, 'Trendyol işlem sonucu', sinyal()));
  const satirlar = dizi(y.items).map((x) => ({
    barkod: yazi(nesne(x.requestItem).barcode) ?? yazi(nesne(nesne(x.requestItem).product).barcode),
    basarili: x.status === 'SUCCESS',
    sebepler: (Array.isArray(x.failureReasons) ? x.failureReasons : []).map((r) => yazi(r) ?? yazi(nesne(r).message) ?? '').filter(Boolean).slice(0, 10),
  }));
  return { bitti: y.status === 'COMPLETED' || (y.status !== 'IN_PROGRESS' && satirlar.length > 0), satirlar };
}

/** filterUnapprovedProducts ?barcode= — onay bekleyen / reddedilen ürün ve red sebepleri. */
export async function tyOnaysizUrun(barkod: string): Promise<{ reddedildi: boolean; sebepler: string[] } | undefined> {
  const y = nesne(await trendyolCagir((id) => `/product/sellers/${id}/products/unapproved`, 'Trendyol onay durumu', sinyal(), { sorgu: { barcode: barkod, size: 10 } }));
  const kayit = dizi(y.content).find((x) => yazi(x.barcode) === barkod);
  if (!kayit) return undefined;
  const sebepler = dizi(kayit.rejectReasonDetails).map((r) => [yazi(r.rejectReason), yazi(r.rejectReasonDetail)].filter(Boolean).join(': ')).filter(Boolean);
  return { reddedildi: sebepler.length > 0, sebepler };
}

/** Onaylı ürünün satıştaki stok ve fiyatı (filterApprovedProductsInventoryAndPrice). */
export async function tyOnayliUrun(barkod: string): Promise<{ stok?: number; fiyat?: number } | undefined> {
  const y = nesne(await trendyolCagir((id) => `/product/sellers/${id}/products/approved/inventory-and-price`, 'Trendyol onaylı ürün', sinyal(), { sorgu: { barcodes: barkod, size: 10 } }));
  for (const icerik of dizi(y.content)) {
    for (const v of dizi(icerik.variants)) {
      if (yazi(v.barcode) !== barkod) continue;
      const fiyat = nesne(v.price);
      const satisFiyati = [fiyat.salePrice, v.salePrice].find((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0);
      return { stok: tam(v.quantity), fiyat: satisFiyati };
    }
  }
  return undefined;
}

/* ---------------- Onaylı ilanların tam bilgisi (ürün çekme) ---------------- */

export type TyIcerik = {
  barkod: string; stokKodu?: string; anaKod?: string; baslik: string; aciklama?: string;
  marka?: { id: number; ad: string }; kategori?: { id: number; ad: string };
  gorseller: string[]; ozellikler: { id?: number; degerIdler?: number[]; ad: string; deger: string }[];
  fiyat?: number; listeFiyati?: number; stok?: number; desi?: number; kdv?: number; url?: string;
  satista: boolean; kilit?: string; arsiv: boolean;
  /** Bu ilan için Trendyol komisyon oranı (%, ör. 13) — filterApprovedProducts variants[].commission */
  komisyon?: number;
};

function ozellikOku(a: Ham): TyIcerik['ozellikler'][number] | undefined {
  const ad = yazi(a.attributeName) ?? yazi(nesne(a.attribute).name) ?? '';
  const altDegerler = dizi(a.attributeValues);
  const deger = yazi(a.attributeValue)
    ?? yazi(a.customAttributeValue)
    ?? altDegerler.map((v) => yazi(v.attributeValue) ?? yazi(v.value) ?? yazi(v.name)).filter(Boolean).join(', ');
  if (!ad || !deger) return undefined;
  const id = tam(a.attributeId) ?? tam(nesne(a.attribute).id);
  const tekId = tam(a.attributeValueId);
  const cokluId = altDegerler.map((v) => tam(v.attributeValueId) ?? tam(v.id)).filter((n): n is number => !!n && n > 0);
  const degerIdler = tekId ? [tekId] : cokluId.length ? cokluId : undefined;
  return { ...(id ? { id } : {}), ...(degerIdler ? { degerIdler } : {}), ad, deger };
}

function icerikSatirlari(c: Ham): TyIcerik[] {
  const markaNesne = nesne(c.brand), kategoriNesne = nesne(c.category);
  const markaId = tam(markaNesne.id) ?? tam(c.brandId);
  const markaAd = yazi(markaNesne.name) ?? (typeof c.brand === 'string' ? yazi(c.brand) : undefined);
  const kategoriId = tam(kategoriNesne.id) ?? tam(c.pimCategoryId) ?? tam(c.categoryId);
  const kategoriAd = yazi(kategoriNesne.name) ?? yazi(c.categoryName);
  const para = (x: unknown) => {
    const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x.replace(',', '.')) : NaN;
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
  };
  const pozitifPara = (x: unknown) => {
    const p = para(x);
    return p !== undefined && p > 0 ? p : undefined;
  };
  const ortak = {
    anaKod: yazi(c.productMainId), baslik: yazi(c.title) ?? 'Ürün', aciklama: yazi(c.description),
    marka: markaId && markaAd ? { id: markaId, ad: markaAd } : markaAd ? { id: 0, ad: markaAd } : undefined,
    kategori: kategoriId && kategoriAd ? { id: kategoriId, ad: kategoriAd } : undefined,
    gorseller: dizi(c.images).map((g) => yazi(g.url)).filter((x): x is string => !!x).slice(0, 12),
    ozellikler: dizi(c.attributes).map(ozellikOku).filter((o): o is NonNullable<typeof o> => !!o).slice(0, 40),
  };
  const varyantlar = dizi(c.variants);
  const kaynaklar = varyantlar.length ? varyantlar : yazi(c.barcode) ? [c] : [];
  return kaynaklar.flatMap((v) => {
    const barkod = yazi(v.barcode);
    if (!barkod) return [];
    const fiyat = nesne(v.price);
    const varyantOz = v === c ? [] : dizi(v.attributes).map(ozellikOku).filter((o): o is NonNullable<typeof o> => !!o);
    return [{
      ...ortak, ozellikler: [...ortak.ozellikler, ...varyantOz].slice(0, 40),
      barkod, stokKodu: yazi(v.stockCode) ?? yazi(c.stockCode),
      fiyat: pozitifPara(v.salePrice) ?? pozitifPara(fiyat.salePrice) ?? pozitifPara(c.salePrice),
      listeFiyati: pozitifPara(v.listPrice) ?? pozitifPara(fiyat.listPrice) ?? pozitifPara(c.listPrice),
      stok: tam(v.quantity) ?? tam(c.quantity),
      desi: para(v.dimensionalWeight) ?? para(c.dimensionalWeight),
      kdv: tam(v.vatRate) ?? tam(c.vatRate),
      url: yazi(v.productUrl) ?? yazi(c.productUrl),
      satista: v.onSale !== false && v.archived !== true && v.locked !== true && v.blacklisted !== true,
      kilit: v.locked === true ? (yazi(v.lockReason) ?? 'Kilitli') : undefined, arsiv: v.archived === true,
      komisyon: (() => { const k = para(v.commission) ?? para(c.commission); return k !== undefined && k <= 60 ? k : undefined; })(),
    }];
  });
}

/** filterApprovedProducts (Ürün V2) — onaylı ilanların başlık, açıklama, görsel, marka, kategori ve özellikleri. */
export async function tyOnayliIcerikler(barkod?: string, enFazla = 2000): Promise<TyIcerik[]> {
  const s = sinyal(45_000);
  const ara = async (alanAdi: 'barcode' | 'barcodes') => {
    const sonuc: TyIcerik[] = [];
    for (let sayfa = 0; sayfa < 100 && sonuc.length < enFazla; sayfa++) {
      const y = nesne(await trendyolCagir((id) => `/product/sellers/${id}/products/approved`, 'Trendyol ilan bilgileri', s, {
        sorgu: { page: sayfa, size: 100, ...(barkod ? { [alanAdi]: barkod } : {}) },
      }));
      const icerik = dizi(y.content);
      for (const c of icerik) sonuc.push(...icerikSatirlari(c));
      if (!icerik.length || sayfa + 1 >= (tam(y.totalPages) ?? 0)) break;
    }
    return barkod ? sonuc.filter((x) => x.barkod === barkod) : sonuc;
  };
  const ilk = await ara('barcode');
  if (barkod && !ilk.length) return ara('barcodes').catch(() => ilk);
  return ilk;
}

/* ---------------- Buybox (aynı ürünü satan başka mağazalar) ---------------- */

export type TyBuybox = { barkod: string; sira?: number; fiyat?: number; cokSatici: boolean };

/** getBuyboxInformation — POST, istek başına en fazla 10 barkod (1000 istek/dk). Yalnız okuma: fiyat değiştirmez. */
export async function tyBuybox(barkodlar: string[]): Promise<Map<string, TyBuybox>> {
  const sonuc = new Map<string, TyBuybox>();
  const liste = [...new Set(barkodlar.filter(Boolean))].slice(0, 200);
  const s = sinyal(40_000);
  for (let i = 0; i < liste.length; i += 10) {
    const y = nesne(await trendyolCagir((id) => `/product/sellers/${id}/products/buybox-information`, 'Trendyol buybox', s, {
      json: { barcodes: liste.slice(i, i + 10) },
    }));
    for (const b of dizi(y.buyboxInfo)) {
      const barkod = yazi(b.barcode);
      if (!barkod) continue;
      sonuc.set(barkod, {
        barkod, sira: tam(b.buyboxOrder), fiyat: typeof b.buyboxPrice === 'number' ? Math.round(b.buyboxPrice * 100) / 100 : undefined,
        cokSatici: b.hasMultipleSeller === true,
      });
    }
  }
  return sonuc;
}

/* ---------------- Anlık sipariş bildirimi (webhook) ---------------- */

export type TyWebhook = { id: string; url: string; durum: string; dogrulama?: string };

/** getWebhooks — kayıtlı abonelikler (en fazla 15). */
export async function tyWebhooklar(): Promise<TyWebhook[]> {
  const y = await trendyolCagir((id) => `/webhook/sellers/${id}/webhooks`, 'Trendyol bildirim abonelikleri', sinyal());
  const liste = Array.isArray(y) ? y.map(nesne) : dizi(nesne(y).webhooks ?? nesne(y).content);
  return liste.map((w) => ({
    id: yazi(w.id) ?? '', url: yazi(w.url) ?? '', durum: yazi(w.status) ?? (w.active === false ? 'PASSIVE' : 'ACTIVE'),
    dogrulama: yazi(w.authenticationType),
  })).filter((w) => w.id);
}

/** createWebhook — API_KEY ile (Trendyol anahtarı "x-api-key" başlığında yollar). Adres "trendyol" kelimesi içeremez. */
export async function tyWebhookKur(url: string, anahtar: string): Promise<string> {
  if (/trendyol|dolap|localhost/i.test(url)) throw new PazaryeriApiHatasi('Bildirim adresi “trendyol”, “dolap” veya “localhost” içeremez.');
  const y = nesne(await trendyolCagir((id) => `/webhook/sellers/${id}/webhooks`, 'Trendyol bildirim aboneliği', sinyal(), {
    json: { url, authenticationType: 'API_KEY', apiKey: anahtar, subscribedStatuses: [] },
  }));
  const kimlik = yazi(y.id);
  if (!kimlik) throw new PazaryeriApiHatasi('Trendyol bildirim aboneliği kimlik döndürmedi.');
  return kimlik;
}

/** updateWebhook — mevcut aboneliğin adresini ve anahtarını yeniler. */
export async function tyWebhookGuncelle(webhookId: string, url: string, anahtar: string) {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(webhookId)) throw new PazaryeriApiHatasi('Bildirim kimliği geçersiz.');
  await trendyolCagir((id) => `/webhook/sellers/${id}/webhooks/${webhookId}`, 'Trendyol bildirim güncelleme', sinyal(), {
    yontem: 'PUT', json: { url, authenticationType: 'API_KEY', apiKey: anahtar, subscribedStatuses: [] },
  });
}

/** activate — pasife düşen (ör. sunucu hatası sonrası) aboneliği yeniden açar. */
export async function tyWebhookAktif(webhookId: string) {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(webhookId)) throw new PazaryeriApiHatasi('Bildirim kimliği geçersiz.');
  await trendyolCagir((id) => `/webhook/sellers/${id}/webhooks/${webhookId}/activate`, 'Trendyol bildirim aktifleştirme', sinyal(), { yontem: 'PUT' });
}

/* ---------------- Sipariş paketi: toplama, fatura ---------------- */

/** updatePackage — önce Picking, sonra Invoiced (fatura numarasıyla). */
export async function tyPaketDurumu(paketId: string, satirlar: { lineId: number; quantity: number }[], durum: 'Picking' | 'Invoiced', faturaNo?: string) {
  if (!/^\d{1,20}$/.test(paketId)) throw new PazaryeriApiHatasi('Trendyol paket numarası geçersiz.');
  if (!satirlar.length) throw new PazaryeriApiHatasi('Pakette satır bilgisi yok. Siparişi yeniden eşitleyin.');
  await trendyolCagir((id) => `/order/sellers/${id}/shipment-packages/${paketId}`, durum === 'Picking' ? 'Trendyol toplama bildirimi' : 'Trendyol fatura bildirimi', sinyal(), {
    yontem: 'PUT', json: { lines: satirlar, params: durum === 'Invoiced' && faturaNo ? { invoiceNumber: faturaNo } : {}, status: durum },
  });
}

/** seller-invoice-file — PDF/JPEG/PNG, en fazla 10 MB, ileri tarihli olamaz. */
export async function tyFaturaDosyasi(paketId: string, dosya: File) {
  if (!/^\d{1,20}$/.test(paketId)) throw new PazaryeriApiHatasi('Trendyol paket numarası geçersiz.');
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(dosya.type)) throw new PazaryeriApiHatasi('Fatura PDF, JPEG veya PNG olmalı.');
  if (dosya.size > 10 * 1024 * 1024) throw new PazaryeriApiHatasi('Fatura dosyası 10 MB’tan büyük olamaz.');
  const form = new FormData();
  form.set('shipmentPackageId', paketId);
  form.set('file', dosya, dosya.name || 'fatura.pdf');
  await trendyolCagir((id) => `/sellers/${id}/seller-invoice-file`, 'Trendyol fatura dosyası', sinyal(40_000), { form });
}

/** seller-invoice-links — e-Arşiv / e-Fatura bağlantısı (10 yıl erişilebilir olmalı). */
export async function tyFaturaLinki(paketId: string, link: string, faturaNo?: string, faturaTarihi?: number) {
  if (!/^\d{1,20}$/.test(paketId)) throw new PazaryeriApiHatasi('Trendyol paket numarası geçersiz.');
  const url = new URL(link);
  if (url.protocol !== 'https:') throw new PazaryeriApiHatasi('Fatura bağlantısı https:// ile başlamalı.');
  if (faturaNo && !/^[A-Z0-9]{3}20\d{2}\d{9}$/i.test(faturaNo)) throw new PazaryeriApiHatasi('Fatura numarası 16 karakter olmalı (ör. ABC2026000000123).');
  await trendyolCagir((id) => `/sellers/${id}/seller-invoice-links`, 'Trendyol fatura bağlantısı', sinyal(), {
    json: { invoiceLink: url.href, shipmentPackageId: Number(paketId), ...(faturaNo ? { invoiceNumber: faturaNo.toUpperCase() } : {}), ...(faturaTarihi ? { invoiceDateTime: faturaTarihi } : {}) },
  });
}

/**
 * Siparişin paketlerine Trendyol'da yüklenmiş fatura bağlantıları (getShipmentPackages ?orderNumber= → invoiceLink).
 * Fatura satıcı panelinden elle yüklense de bu alan dolar (belge: Sipariş Paketlerini Çekme, invoiceLink).
 * Dönüş: paket no → bağlantı (yalnız https).
 */
export async function tyPaketFaturaLinkleri(siparisNo: string): Promise<Map<string, string>> {
  if (!/^\d{1,20}$/.test(siparisNo)) throw new PazaryeriApiHatasi('Trendyol sipariş numarası geçersiz.');
  const y = nesne(await trendyolCagir((id) => `/order/sellers/${id}/orders`, 'Trendyol fatura bilgisi', sinyal(), { sorgu: { orderNumber: siparisNo, size: 50 } }));
  const sonuc = new Map<string, string>();
  for (const p of dizi(y.content)) {
    const paket = yazi(p.shipmentPackageId) ?? yazi(p.id);
    const link = yazi(p.invoiceLink);
    if (!paket || !link || link.length > 1000) continue;
    try { if (new URL(link).protocol === 'https:') sonuc.set(paket, link); } catch { /* geçersiz bağlantı */ }
  }
  return sonuc;
}

/**
 * Tek ilanın Trendyol stoğunu 0 yapar (çift/fazla ilanı satıştan kaldırmak için). Fiyata dokunmaz.
 * updatePriceAndInventory yalnız barcode + quantity ile çağrılır; sonuç Trendyol kuyruğunda birkaç dakikada uygulanır.
 */
export async function tyIlanStokSifirla(barkodlar: string[]): Promise<string | undefined> {
  const temiz = [...new Set(barkodlar.map((b) => b.trim()).filter((b) => b && b.length <= 120 && !/[,\s]/.test(b)))];
  if (!temiz.length) throw new PazaryeriApiHatasi('Stoğu sıfırlanacak geçerli barkod yok.');
  const y = nesne(await trendyolCagir((id) => `/inventory/sellers/${id}/products/price-and-inventory`, 'Trendyol ilan stoğu sıfırlama', sinyal(), {
    json: { items: temiz.map((barcode) => ({ barcode, quantity: 0 })) },
  }));
  return yazi(y.batchRequestId);
}

/* ---------------- Cari hesap ekstresi (hakediş) ---------------- */

export const TY_SATIS_TURLERI = ['Sale', 'Return', 'Discount', 'DiscountCancel', 'Coupon', 'CouponCancel', 'ProvisionPositive', 'ProvisionNegative', 'ManualRefund', 'ManualRefundCancel', 'DeliveryFee', 'DeliveryFeeCancel'] as const;
export const TY_DIGER_TURLERI = ['Stoppage', 'DeductionInvoices', 'ReturnInvoice', 'CommissionAgreementInvoice', 'PaymentOrder', 'FinancialItem'] as const;

async function tyEkstreSayfalari(servis: 'settlements' | 'otherfinancials', turler: readonly string[], bas: number, son: number, s: AbortSignal) {
  const tumu: Ham[] = [];
  const parca = 15 * 86_400_000 - 1000; // belge: aralık 15 günden uzun olamaz
  for (let b = bas; b < son; b += parca) {
    const e = Math.min(son, b + parca);
    for (let sayfa = 0; sayfa < 100; sayfa++) {
      const y = nesne(await trendyolCagir((id) => `/finance/che/sellers/${id}/${servis}`, servis === 'settlements' ? 'Trendyol cari hesap (satışlar)' : 'Trendyol cari hesap (diğer)', s, {
        sorgu: { transactionTypes: turler.join(','), startDate: b, endDate: e, page: sayfa, size: 1000 },
      }));
      const icerik = dizi(y.content);
      tumu.push(...icerik);
      const toplamSayfa = tam(y.totalPages) ?? 0;
      if (sayfa + 1 >= toplamSayfa || !icerik.length) break;
    }
  }
  return tumu;
}

export async function trendyolEkstreCek(bas: number, son: number, s: AbortSignal) {
  const [satislar, diger] = await Promise.all([
    tyEkstreSayfalari('settlements', TY_SATIS_TURLERI, bas, son, s),
    tyEkstreSayfalari('otherfinancials', TY_DIGER_TURLERI, bas, son, s),
  ]);
  return { satislar, diger };
}

/* ---------------- İadeler (claims) ve müşteri soruları ---------------- */

export type TyIade = {
  id: string; siparisNo: string; tarih: number; musteri: string; kargo?: string; kargoTakip?: string; kargoLink?: string; paketId?: string;
  kalemler: { kalemId: string; urun: string; barkod?: string; fiyat?: number; sebep?: string; musteriNotu?: string; durum: string; otomatik?: boolean }[];
};

/** getClaims — son `gun` gün (en fazla 2 hafta parçalarla). claimItemStatus verilmezse tüm durumlar. */
export async function tyIadeler(gun = 30, durum?: string): Promise<TyIade[]> {
  const s = sinyal(40_000);
  const son = Date.now();
  const sonuc: TyIade[] = [];
  const parca = 14 * 86_400_000;
  for (let bas = son - gun * 86_400_000; bas < son; bas += parca) {
    for (let sayfa = 0; sayfa < 20; sayfa++) {
      const y = nesne(await trendyolCagir((id) => `/order/sellers/${id}/claims`, 'Trendyol iadeleri', s, {
        sorgu: { startDate: bas, endDate: Math.min(son, bas + parca), page: sayfa, size: 200, claimItemStatus: durum },
      }));
      for (const c of dizi(y.content)) {
        const kalemler = dizi(c.items).flatMap((i) => {
          const satir = nesne(i.orderLine);
          return dizi(i.claimItems).map((ci) => ({
            kalemId: yazi(ci.id) ?? '', urun: yazi(satir.productName) ?? 'Ürün', barkod: yazi(satir.barcode),
            fiyat: typeof satir.price === 'number' ? satir.price : undefined,
            sebep: yazi(nesne(ci.customerClaimItemReason).name), musteriNotu: yazi(ci.customerNote),
            durum: yazi(nesne(ci.claimItemStatus).name) ?? '', otomatik: ci.autoAccepted === true,
          }));
        }).filter((k) => k.kalemId);
        sonuc.push({
          id: yazi(c.id) ?? yazi(c.claimId) ?? '', siparisNo: yazi(c.orderNumber) ?? '',
          tarih: (tam(c.claimDate) ?? 0), musteri: [yazi(c.customerFirstName), yazi(c.customerLastName)].filter(Boolean).join(' '),
          kargo: yazi(c.cargoProviderName), kargoTakip: yazi(c.cargoTrackingNumber), kargoLink: yazi(c.cargoTrackingLink),
          paketId: yazi(c.orderShipmentPackageId), kalemler,
        });
      }
      if (sayfa + 1 >= (tam(y.totalPages) ?? 0)) break;
    }
  }
  const gorulen = new Set<string>();
  return sonuc.filter((c) => c.id && !gorulen.has(c.id) && gorulen.add(c.id)).sort((a, b) => b.tarih - a.tarih);
}

/** approveClaimLineItems — yalnız WaitingInAction (depoya ulaşmış) kalemler onaylanabilir. */
export async function tyIadeOnayla(claimId: string, kalemIdleri: string[]) {
  if (!/^[A-Za-z0-9-]{1,80}$/.test(claimId) || !kalemIdleri.length) throw new PazaryeriApiHatasi('İade kaydı geçersiz.');
  await trendyolCagir((id) => `/order/sellers/${id}/claims/${encodeURIComponent(claimId)}/items/approve`, 'Trendyol iade onayı', sinyal(), {
    yontem: 'PUT', json: { claimLineItemIdList: kalemIdleri, params: {} },
  });
}

export type TySoru = { id: number; urun: string; metin: string; tarih: number; durum: string; kullanici?: string; cevap?: string; webUrl?: string; gorsel?: string; redSebebi?: string };

/** questionsFilter — en fazla 2 haftalık aralık; durum: WAITING_FOR_ANSWER, ANSWERED, REJECTED... */
export async function tySorular(durum = 'WAITING_FOR_ANSWER', gun = 14): Promise<TySoru[]> {
  const s = sinyal(30_000);
  const son = Date.now();
  const bas = son - Math.min(gun, 14) * 86_400_000;
  const sonuc: TySoru[] = [];
  for (let sayfa = 0; sayfa < 10; sayfa++) {
    const y = nesne(await trendyolCagir((id) => `/qna/sellers/${id}/questions/filter`, 'Trendyol müşteri soruları', s, {
      sorgu: (saticiId) => ({ supplierId: saticiId, startDate: bas, endDate: son, status: durum, page: sayfa, size: 50, orderByField: 'CreatedDate', orderByDirection: 'DESC' }),
    }));
    for (const q of dizi(y.content)) {
      const id = tam(q.id);
      if (!id) continue;
      sonuc.push({
        id, urun: yazi(q.productName) ?? 'Ürün', metin: yazi(q.text) ?? '', tarih: tam(q.creationDate) ?? 0, durum: yazi(q.status) ?? durum,
        kullanici: q.showUserName === true ? yazi(q.userName) : undefined, cevap: yazi(nesne(q.answer).text),
        webUrl: yazi(q.webUrl), gorsel: yazi(q.imageUrl), redSebebi: yazi(nesne(q.rejectedAnswer).reason),
      });
    }
    if (sayfa + 1 >= (tam(y.totalPages) ?? 0)) break;
  }
  return sonuc;
}

/** createAnswer — 10–2000 karakter; yasaklı kelime denetiminden geçer. */
export async function tySoruCevapla(soruId: number, metin: string) {
  const t = metin.trim();
  if (t.length < 10 || t.length > 2000) throw new PazaryeriApiHatasi('Cevap 10 ile 2000 karakter arasında olmalı.');
  await trendyolCagir((id) => `/qna/sellers/${id}/questions/${soruId}/answers`, 'Trendyol soru cevabı', sinyal(), { json: { text: t } });
}

export type TyEtiketBilgisi = {
  siparisNo: string; paketNo: string; kargoFirma?: string; kargoTakip?: string; gondericiNo?: string; durum?: string;
  alici: { ad?: string; adres?: string; mahalle?: string; ilce?: string; il?: string; postaKodu?: string };
  kalemler: { ad: string; adet: number; barkod?: string }[];
};

/**
 * Kargo etiketi için paketin güncel hali (getShipmentPackages ?orderNumber=). Teslimat adresi sitede saklanmaz,
 * etiket her açıldığında Trendyol'dan okunur (kişisel veri yalnız gerektiği an işlenir).
 */
export async function tyEtiketBilgisi(siparisNo: string, paketNo: string): Promise<TyEtiketBilgisi> {
  if (!/^\d{1,20}$/.test(siparisNo) || !/^\d{1,20}$/.test(paketNo)) throw new PazaryeriApiHatasi('Sipariş veya paket numarası geçersiz.');
  const y = nesne(await trendyolCagir((id) => `/order/sellers/${id}/orders`, 'Trendyol paket bilgisi', sinyal(), { sorgu: { orderNumber: siparisNo, size: 50 } }));
  const p = dizi(y.content).find((x) => yazi(x.shipmentPackageId) === paketNo || yazi(x.id) === paketNo);
  if (!p) throw new PazaryeriApiHatasi('Paket Trendyol’da bulunamadı. Bölünmüş ya da iptal edilmiş olabilir; sayfayı yenileyin.');
  const a = nesne(p.shipmentAddress);
  return {
    siparisNo, paketNo, kargoFirma: yazi(p.cargoProviderName), kargoTakip: yazi(p.cargoTrackingNumber), gondericiNo: yazi(p.cargoSenderNumber),
    durum: yazi(p.shipmentPackageStatus) ?? yazi(p.status),
    alici: {
      ad: yazi(a.fullName) ?? ([yazi(a.firstName), yazi(a.lastName)].filter(Boolean).join(' ') || undefined),
      adres: yazi(a.fullAddress) ?? ([yazi(a.address1), yazi(a.address2)].filter(Boolean).join(' ') || undefined),
      mahalle: yazi(a.neighborhood), ilce: yazi(a.district), il: yazi(a.city), postaKodu: yazi(a.postalCode),
    },
    kalemler: dizi(p.lines).map((l) => ({ ad: yazi(l.productName) ?? 'Ürün', adet: tam(l.quantity) ?? 1, barkod: yazi(l.barcode) })),
  };
}

/**
 * Ortak etiket servisi yalnız Trendyol Express (TEX) ve Aras Kargo "Trendyol öder" gönderilerinde çalışır
 * (createCommonLabel belgesi, Sipariş Süreci Akışı 20.07.2026). Diğer firmalarda (DHL eCommerce, Yurtiçi, Sürat,
 * PTT...) etiketi kargo firması verir; satıcı panelinden yazdırılır. Trendyol adları: "Trendyol Express Marketplace",
 * "Aras Kargo Marketplace", "DHL eCommerce Marketplace".
 */
export function tyOrtakEtiketVar(kargoFirma: string | undefined): boolean {
  const ad = (kargoFirma ?? '').toLocaleLowerCase('tr').replace(/[^a-z0-9ıüşöçğ]/g, '');
  return ad.includes('trendyolexpress') || ad.startsWith('tex') || ad.includes('aras');
}

/** Ortak etiket (TEX / Aras, "Trendyol öder"): önce talep, sonra ZPL etiket(ler). Talep zaten yapılmışsa doğrudan alınır. */
export async function tyKargoEtiketi(takipNo: string, kargoFirma?: string): Promise<string[]> {
  if (!/^\d{5,30}$/.test(takipNo)) throw new PazaryeriApiHatasi('Kargo takip numarası geçersiz.');
  if (kargoFirma !== undefined && !tyOrtakEtiketVar(kargoFirma)) {
    throw new PazaryeriApiHatasi(`Bu paket ${kargoFirma} ile gidiyor. Trendyol hazır etiketi yalnız Trendyol Express ve Aras Kargo gönderilerinde verir; bu paketin etiketini Trendyol satıcı panelinden yazdırın.`);
  }
  const yol = (id: string) => `/sellers/${id}/common-label/${takipNo}`;
  const al = async () => dizi(nesne(await trendyolCagir(yol, 'Trendyol kargo etiketi', sinyal())).data).map((x) => yazi(x.label)).filter((x): x is string => !!x);
  try {
    const mevcut = await al();
    if (mevcut.length) return mevcut;
  } catch (e) { if (!(e instanceof PazaryeriApiHatasi) || (e.status ?? 0) >= 500) throw e; }
  await trendyolCagir(yol, 'Trendyol kargo etiketi talebi', sinyal(), { json: { format: 'ZPL', boxQuantity: 1 } });
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const etiket = await al().catch(() => []);
    if (etiket.length) return etiket;
  }
  throw new PazaryeriApiHatasi('Etiket henüz hazır değil. Bir dakika sonra tekrar deneyin.');
}
