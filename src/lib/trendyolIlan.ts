/**
 * Sitedeki ürün kartı → Trendyol ürün isteği (createProducts V2).
 * Ürünün sitedeki bilgileri tek kaynaktır; panelde yalnız Trendyol'a özel alanlar (kategori, marka, özellikler, desi) tutulur.
 */
import { kanalFiyati, type KanalAyari, type KanalIlanTaslagi } from './pazaryeri';
import type { Urun } from './sema';
import type { TyOzellik, TyUrunIstegi } from './trendyolApi';
import { markaliUrunAdi, urunGtin } from './urunKimlik';

export const SITE_ADRESI = 'https://alluluhome.com';
/** HTML kaçışı; sitedeki "başlık|alt metin" ayracı satır sonuna çevrilir */
const kacis = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
  .split('|').map((x) => x.trim()).filter(Boolean).join('<br>');
const sade = (s: string) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Ürün için ilk taslak: barkod, stok kodu, başlık sitedeki karttan. */
export function ilanVarsayilani(u: Urun, desi?: number): KanalIlanTaslagi {
  const kod = (u.sku || u.id).slice(0, 40);
  return {
    durum: 'taslak', barkod: urunGtin(u) ?? '', stokKodu: (u.sku || u.id).slice(0, 100), anaKod: kod,
    baslik: markaliUrunAdi(u).slice(0, 100), ozellikler: [], kdv: 20, desi, mesajlar: [],
  };
}

/** Trendyol açıklaması: özet, öne çıkanlar, teknik özellik tablosu, kutu içeriği, garanti (HTML, en fazla 30.000 karakter). */
export function ilanAciklamasi(u: Urun): string {
  const p: string[] = [];
  if (u.ozet) p.push(`<p>${kacis(u.ozet)}</p>`);
  if (u.oneCikanBilgiler.length) p.push('<ul>' + u.oneCikanBilgiler.map((b) => `<li>${kacis(b.metin)}</li>`).join('') + '</ul>');
  for (const f of u.faydalar.slice(0, 6)) p.push(`<p><strong>${kacis(f.baslik)}</strong><br>${kacis(f.metin)}</p>`);
  const teknik = u.teknik.filter(([e]) => !/barkod|ean|gtin/i.test(e));
  if (teknik.length) p.push('<p><strong>Teknik özellikler</strong></p><table>' + teknik.map(([e, d]) => `<tr><td>${kacis(e)}</td><td>${kacis(d)}</td></tr>`).join('') + '</table>');
  if (u.kutuIcerigi.length) p.push('<p><strong>Kutu içeriği</strong></p><ul>' + u.kutuIcerigi.map((x) => `<li>${kacis(x)}</li>`).join('') + '</ul>');
  if (u.garanti) p.push(`<p><strong>Garanti:</strong> ${kacis(u.garanti)}</p>`);
  return (p.join('') || `<p>${kacis(markaliUrunAdi(u))}</p>`).slice(0, 30000);
}

/** Ürün görselleri → herkese açık JPG adresleri (Trendyol en fazla 8 görsel). */
export function ilanGorselleri(u: Urun): string[] {
  return u.gorseller.slice(0, 8).map((g) => {
    const src = g.src.trim();
    if (/^https?:\/\//i.test(src)) return src;
    const yol = src.replace(/^\/+/, '');
    return /^(?:img|medya)\//.test(yol) ? `${SITE_ADRESI}/jpg/${yol.replace(/\.(?:webp|png|jpe?g)$/i, '')}.jpg` : `${SITE_ADRESI}/${yol}`;
  });
}

export const ilanFiyati = (u: Urun, t: KanalIlanTaslagi | undefined, k: KanalAyari) => t?.fiyat ?? kanalFiyati(u.fiyat, k);

/**
 * Sitedeki teknik özelliklerden Trendyol özelliklerine öneri: etiket adı eşleşirse değer listesinde aynı adı arar,
 * yoksa özel değer kabul eden özelliğe metni yazar. Marka/menşei gibi sık alanlar da denenir.
 */
export function ozellikOnerileri(u: Urun, ozellikler: TyOzellik[]): KanalIlanTaslagi['ozellikler'] {
  const teknik = new Map(u.teknik.map(([e, d]) => [sade(e), d]));
  const esAnlam: Record<string, string[]> = {
    materyal: ['malzeme', 'materyal', 'govde malzemesi', 'malzemesi'], renk: ['renk'], hacim: ['hacim', 'kapasite'],
    mense: ['mense', 'uretim yeri', 'uretim ulkesi', 'mensei'], garanti: ['garanti suresi', 'garanti'],
  };
  const sonuc: KanalIlanTaslagi['ozellikler'] = [];
  for (const o of ozellikler) {
    const ad = sade(o.ad);
    const adaylar = [ad, ...Object.entries(esAnlam).filter(([k]) => ad.includes(k)).flatMap(([, v]) => v)];
    let deger = adaylar.map((a) => teknik.get(a)).find(Boolean);
    if (!deger && /garanti/.test(ad) && u.garanti) deger = u.garanti;
    if (!deger) continue;
    const eslesen = o.degerler.find((d) => sade(d.ad) === sade(deger!)) ?? o.degerler.find((d) => sade(deger!).includes(sade(d.ad)) && sade(d.ad).length > 1);
    if (eslesen) sonuc.push({ attributeId: o.id, ad: o.ad, attributeValueIds: [eslesen.id], degerAdi: eslesen.ad });
    else if (o.ozelDeger) sonuc.push({ attributeId: o.id, ad: o.ad, attributeValue: deger.slice(0, 400) });
  }
  return sonuc;
}

export type IlanHazirlik = { istek?: TyUrunIstegi; eksikler: string[] };

export function ilanIstegi(
  u: Urun, t: KanalIlanTaslagi, k: KanalAyari, stok: number, ozellikler: TyOzellik[] | undefined,
  adres: { sevkiyat?: number; iade?: number },
): IlanHazirlik {
  const eksikler: string[] = [];
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(t.barkod)) eksikler.push('barkod (kutudaki 13 haneli EAN; en fazla 40 harf/rakam)');
  if (!t.stokKodu) eksikler.push('stok kodu');
  if (!t.anaKod) eksikler.push('ana ürün kodu');
  if (!t.baslik) eksikler.push('başlık');
  if (!t.kategoriId) eksikler.push('Trendyol kategorisi');
  if (!t.markaId) eksikler.push('Trendyol markası');
  if (t.desi === undefined || t.desi <= 0) eksikler.push('desi');
  const gorseller = ilanGorselleri(u);
  if (!gorseller.length) eksikler.push('en az bir ürün görseli');
  if (!ozellikler) eksikler.push('kategori özellikleri (kategori seçip sayfayı yenileyin)');
  for (const o of ozellikler ?? []) {
    if (!o.zorunlu) continue;
    const g = t.ozellikler.find((x) => x.attributeId === o.id);
    if (!g || (!g.attributeValueIds?.length && !g.attributeValue)) eksikler.push(`“${o.ad}” özelliği`);
  }
  const fiyat = ilanFiyati(u, t, k);
  if (!(fiyat > 0)) eksikler.push('satış fiyatı');
  if (eksikler.length) return { eksikler };
  return {
    eksikler,
    istek: {
      barcode: t.barkod, title: t.baslik, productMainId: t.anaKod, brandId: t.markaId!, categoryId: t.kategoriId!,
      quantity: Math.max(0, Math.min(20_000, stok)), stockCode: t.stokKodu, dimensionalWeight: t.desi!,
      description: ilanAciklamasi(u),
      // Üstü çizili fiyat yalnız gerçek indirimde gösterilebilir (Ticari Reklam ve Haksız Ticari Uygulamalar Yön. m.14):
      // liste fiyatı satış fiyatıyla aynı gönderilir. Kampanya Trendyol'un kendi indirim araçlarıyla yapılmalı.
      listPrice: fiyat, salePrice: fiyat, vatRate: t.kdv,
      images: gorseller.map((url) => ({ url })),
      attributes: t.ozellikler
        .filter((o) => (ozellikler ?? []).some((x) => x.id === o.attributeId) && (o.attributeValueIds?.length || o.attributeValue))
        .map((o) => o.attributeValueIds?.length ? { attributeId: o.attributeId, attributeValueIds: o.attributeValueIds } : { attributeId: o.attributeId, attributeValue: o.attributeValue }),
      ...(adres.sevkiyat ? { shipmentAddressId: adres.sevkiyat } : {}),
      ...(adres.iade ? { returningAddressId: adres.iade } : {}),
    },
  };
}
