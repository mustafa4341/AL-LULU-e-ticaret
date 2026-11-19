/**
 * /urun-akisi.xml — ürün akışı (Google Merchant Center RSS 2.0 biçimi).
 * Google Alışveriş, Akakçe, Cimri ve diğer fiyat karşılaştırma siteleri bu biçimi kabul eder.
 * Panel verisinden her istekte üretilir: fiyat (müşterinin ödediği), stok, görseller, kargo hep güncel.
 * Yalnız yayındaki ürünler; uydurma barkod (GTIN) yazılmaz — panelde yoksa marka + model kodu (MPN) kullanılır.
 *
 * Bilerek <g:sale_price> YOK: (1) Akakçe/Cimri gibi siteler <g:price>'ı müşterinin ödeyeceği fiyat olarak okur,
 * eski fiyatı oraya yazmak bizi pahalı gösterir; (2) indirimli satış reklamında önceki fiyat yalnız AYNI kanalda
 * (bu sitede) son 10 günde uygulanan en düşük fiyat olabilir (Ticari Reklam Yön. m.14/3 ve 14/5, RG 01.07.2026/33297).
 * Google fiyat düşüşünü kendi fiyat geçmişinden zaten hesaplar.
 */
import type { APIRoute } from 'astro';
import { urunGtin } from '../lib/urunKimlik';

const x = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const tl = (n: number) => `${n.toFixed(2)} TRY`;

export const GET: APIRoute = async ({ locals, site: astroSite }) => {
  const k = locals.katalog;
  const s = k.site;
  const kok = (astroSite ?? new URL(s.url)).origin;
  const kargo = s.kargo;

  const ogeler = k.tumUrunler().filter((u) => u.durum === 'yayinda' && u.gorseller.length).map((u) => {
    const b = k.fiyatBilgisi(u);
    const odenecek = b.sepette?.fiyat ?? b.fiyat;
    const katId = u.kategoriler[0]!;
    const kat = k.kategoriBul(katId);
    const googleKat: Record<string, string> = {
      'sofra': 'Home &amp; Garden &gt; Kitchen &amp; Dining &gt; Tableware &gt; Flatware',
      'mutfak-aletleri': 'Home &amp; Garden &gt; Kitchen &amp; Dining &gt; Kitchen Tools &amp; Utensils',
      'saklama': 'Home &amp; Garden &gt; Kitchen &amp; Dining &gt; Food Storage',
      'temizlik': 'Home &amp; Garden &gt; Household Supplies',
    };
    const gKat = googleKat[katId] ?? 'Home &amp; Garden &gt; Kitchen &amp; Dining &gt; Cookware &amp; Bakeware';
    const gorseller = u.gorseller.map((g) => new URL(g.src, kok).href);
    const kargoUcreti = odenecek >= kargo.ucretsizEsik ? 0 : kargo.ucret;
    const cumle = (v: string) => { const t = v.replace(/\*+/g, '').replace(/\s*\|\s*/g, ': ').trim(); return /[.!?]$/.test(t) ? t : t + '.'; };
    const aciklama = [u.ozet, ...u.oneCikanBilgiler.map((o) => o.metin)].filter(Boolean).map(cumle).join(' ');
    // Barkod yalnız panelde "Barkod (EAN)" teknik satırı girilmiş ve kontrol hanesi doğruysa (lib/urunKimlik.ts)
    const gtin = urunGtin(u);
    return `    <item>
      <g:id>${x(u.id)}</g:id>
      <g:title>${x(`${u.marka} ${u.ad}`)}</g:title>
      <g:description>${x(aciklama)}</g:description>
      <g:link>${x(`${kok}/urun/${u.id}`)}</g:link>
      <g:image_link>${x(gorseller[0])}</g:image_link>
${gorseller.slice(1, 10).map((g) => `      <g:additional_image_link>${x(g)}</g:additional_image_link>`).join('\n')}
      <g:availability>${k.stoktaMi(u) ? 'in_stock' : 'out_of_stock'}</g:availability>
      <g:price>${tl(odenecek)}</g:price>
      <g:brand>${x(u.marka)}</g:brand>
${gtin ? `      <g:gtin>${gtin}</g:gtin>\n` : ''}${u.sku ? `      <g:mpn>${x(u.sku)}</g:mpn>\n` : ''}      <g:identifier_exists>${gtin || u.sku ? 'yes' : 'no'}</g:identifier_exists>
      <g:condition>new</g:condition>
${kat ? `      <g:product_type>${x(`Ev ve Mutfak > ${kat.ad}`)}</g:product_type>\n` : ''}      <g:google_product_category>${gKat}</g:google_product_category>
      <g:quantity>${Math.max(0, u.stok)}</g:quantity>
      <g:shipping>
        <g:country>TR</g:country>
        <g:service>${x(kargo.firma || 'Kargo')}</g:service>
        <g:price>${tl(kargoUcreti)}</g:price>
        <g:min_handling_time>0</g:min_handling_time>
        <g:max_handling_time>1</g:max_handling_time>
        <g:min_transit_time>${kargo.teslimGun[0]}</g:min_transit_time>
        <g:max_transit_time>${kargo.teslimGun[1]}</g:max_transit_time>
      </g:shipping>
    </item>`;
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
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=1800' } });
};
