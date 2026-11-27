/**
 * /urun-akisi.xml — ürün akışı (Google Merchant Center RSS 2.0 biçimi).
 * Google Alışveriş ve Cimri bu biçimi destekler.
 * Panel verisinden her istekte üretilir: fiyat (müşterinin ödediği), stok, görseller, kargo hep güncel.
 * Kimlik alanları, yayındaki ürünlerin teknik özelliklerinde kayıtlı GTIN ve MPN ile doldurulur.
 *
 * Bilerek <g:sale_price> YOK: (1) Akakçe/Cimri gibi siteler <g:price>'ı müşterinin ödeyeceği fiyat olarak okur,
 * eski fiyatı oraya yazmak bizi pahalı gösterir; (2) indirimli satış reklamında önceki fiyat yalnız AYNI kanalda
 * (bu sitede) son 10 günde uygulanan en düşük fiyat olabilir (Ticari Reklam Yön. m.14/3 ve 14/5, RG 01.07.2026/33297).
 * Google fiyat düşüşünü kendi fiyat geçmişinden zaten hesaplar.
 */
import type { APIContext, APIRoute } from 'astro';
import { markaliUrunAdi, urunGtin, urunMpn } from '../lib/urunKimlik';
import { urunSatisOzeti } from '../lib/urunTanitim';

const x = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const tl = (n: number) => `${n.toFixed(2)} TRY`;

// Google ürün taksonomisindeki sayısal kategori kimlikleri.
const GOOGLE_KATEGORI: Readonly<Record<string, number>> = {
  'duduklu-tencere': 660,
  tencere: 654,
  tava: 662,
  aksesuar: 4424,
  sofra: 675,
  'mutfak-aletleri': 668,
  saklama: 667,
  temizlik: 630,
};
const GOOGLE_URUN_KATEGORI: Readonly<Record<string, number>> = {
  'fissler-copenhagen-tencere-seti': 4721,
  'fissler-family-line-tencere-seti': 4721,
  'fissler-toronto-tencere-seti': 4721,
  'tefal-ingenio-black-stone-10-parca': 4721,
  'tefal-ingenio-essential-4-parca': 4721,
  'tefal-easy-cook-clean-tava-seti-24-28': 4721,
  'fissler-buhar-aparati-22': 4529,
  'zwilling-king-30-parca-catal-kasik': 5647,
};

export function urunAkisi({ locals, site: astroSite }: APIContext, hedef: 'google' | 'karsilastirma'): Response {
  const k = locals.katalog;
  const s = k.site;
  const kok = (astroSite ?? new URL(s.url)).origin;
  const kargo = s.kargo;

  const simdi = Date.now();
  const ogeler = k.tumUrunler().filter((u) => u.durum === 'yayinda' && u.gorseller.length).flatMap((u) => {
    const b = k.fiyatBilgisi(u, simdi);
    const odenecek = b.sepette?.fiyat ?? b.fiyat;
    if (!Number.isFinite(odenecek) || odenecek <= 0) return [];
    const katId = u.kategoriler[0]!;
    const kat = k.kategoriBul(katId);
    const gKat = GOOGLE_URUN_KATEGORI[u.id] ?? GOOGLE_KATEGORI[katId];
    const gorseller = u.gorseller.map((g) => new URL(g.src, kok).href);
    const kargoUcreti = odenecek >= kargo.ucretsizEsik ? 0 : kargo.ucret;
    const cumle = (v: string) => { const t = v.replace(/\*+/g, '').replace(/\s*\|\s*/g, ': ').trim(); return /[.!?]$/.test(t) ? t : t + '.'; };
    const ad = markaliUrunAdi(u);
    const satisOzeti = urunSatisOzeti(u);
    const metinler = hedef === 'google' ? [satisOzeti] : [satisOzeti, ...u.oneCikanBilgiler.map((o) => o.metin)];
    const aciklama = x((metinler.filter(Boolean).map(cumle).join(' ') || ad).slice(0, 5000));
    const aciklamaSatiri = hedef === 'google' && satisOzeti !== u.ozet.trim()
      ? `      <g:structured_description><g:digital_source_type>trained_algorithmic_media</g:digital_source_type><g:content>${aciklama}</g:content></g:structured_description>`
      : `      <g:description>${aciklama}</g:description>`;
    // Barkod yalnız panelde "Barkod (EAN)" teknik satırı girilmiş ve kontrol hanesi doğruysa (lib/urunKimlik.ts)
    const gtin = urunGtin(u);
    const mpn = urunMpn(u);
    const kimlikSatirlari = [
      gtin ? `      <g:gtin>${gtin}</g:gtin>` : '',
      mpn ? `      <g:mpn>${x(mpn)}</g:mpn>` : '',
    ].filter(Boolean).join('\n');
    const ekGorseller = gorseller.slice(1, 10).map((g) => `      <g:additional_image_link>${x(g)}</g:additional_image_link>`).join('\n');
    return [
      '    <item>',
      `      <g:id>${x(u.id)}</g:id>`,
      `      <g:title>${x(ad.slice(0, 150))}</g:title>`,
      aciklamaSatiri,
      `      <g:link>${x(`${kok}/urun/${u.id}`)}</g:link>`,
      `      <g:image_link>${x(gorseller[0])}</g:image_link>`,
      ...(ekGorseller ? [ekGorseller] : []),
      `      <g:availability>${k.stoktaMi(u) ? 'in_stock' : 'out_of_stock'}</g:availability>`,
      `      <g:price>${tl(odenecek)}</g:price>`,
      `      <g:brand>${x(u.marka)}</g:brand>`,
      ...(kimlikSatirlari ? [kimlikSatirlari] : []),
      '      <g:condition>new</g:condition>',
      ...(kat ? [`      <g:product_type>${x(`Ev ve Mutfak > ${kat.ad}`)}</g:product_type>`] : []),
      ...(gKat ? [`      <g:google_product_category>${gKat}</g:google_product_category>`] : []),
      `      <g:quantity>${Math.max(0, u.stok)}</g:quantity>`,
      '      <g:shipping>',
      '        <g:country>TR</g:country>',
      `        <g:service>${x(kargo.firma || 'Kargo')}</g:service>`,
      `        <g:price>${tl(kargoUcreti)}</g:price>`,
      '        <g:min_handling_time>0</g:min_handling_time>',
      '        <g:max_handling_time>1</g:max_handling_time>',
      `        <g:min_transit_time>${kargo.teslimGun[0]}</g:min_transit_time>`,
      `        <g:max_transit_time>${kargo.teslimGun[1]}</g:max_transit_time>`,
      '      </g:shipping>',
      '    </item>',
    ].join('\n');
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${x(s.ad)}</title>
    <link>${x(kok)}</link>
    <description>${x(s.slogan || s.ad)}</description>
${ogeler.join('\n')}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache' } });
}

export const GET: APIRoute = (ctx) => urunAkisi(ctx, 'google');
