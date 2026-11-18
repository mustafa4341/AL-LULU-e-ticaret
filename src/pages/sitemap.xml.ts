import type { APIRoute } from 'astro';
import { YASAL_SAYFALAR } from '../lib/yasal';

export const GET: APIRoute = async ({ locals, site }) => {
  const k = locals.katalog;
  const kok = (site ?? new URL(k.site.url)).origin.replace(/\/$/, '');
  const tarih = k.magaza.guncelleme ? k.magaza.guncelleme.slice(0, 10) : new Date().toISOString().slice(0, 10);

  const yollar: { loc: string; priority: string }[] = [
    { loc: '/', priority: '1.0' },
    { loc: '/urunler', priority: '0.9' },
    // Boş sayfalar (ürünsüz kategori, setsiz setler sayfası) Google'a bildirilmez; o sayfalar "noindex" döner
    ...(k.tumSetler().length ? [{ loc: '/setler', priority: '0.8' }] : []),
    { loc: '/bilgi', priority: '0.6' },
    // /siparis-takip "noindex" döndüğü için burada yok (site haritası yalnız dizine eklenebilir adresleri içerir)
  ];

  for (const kat of k.magaza.kategoriler) {
    if (k.kategoriUrunleri(kat.id).length) yollar.push({ loc: `/kategori/${kat.id}`, priority: '0.8' });
  }
  for (const u of k.magaza.urunler.filter((x) => x.durum === 'yayinda')) {
    yollar.push({ loc: `/urun/${u.id}`, priority: '0.9' });
  }
  // İade, kargo, garanti ve sözleşme sayfaları: Merchant Center ve arama motorları politikaları buradan okur
  for (const y of YASAL_SAYFALAR) yollar.push({ loc: `/yasal/${y.yol}`, priority: '0.3' });

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    yollar
      .map(
        (y) =>
          `  <url>\n` +
          `    <loc>${kok}${y.loc}</loc>\n` +
          `    <lastmod>${tarih}</lastmod>\n` +
          `    <priority>${y.priority}</priority>\n` +
          `  </url>`,
      )
      .join('\n') +
    `\n</urlset>\n`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
