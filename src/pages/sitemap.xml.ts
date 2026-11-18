import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals, site }) => {
  const k = locals.katalog;
  const kok = (site ?? new URL(k.site.url)).origin.replace(/\/$/, '');
  const tarih = k.magaza.guncelleme ? k.magaza.guncelleme.slice(0, 10) : new Date().toISOString().slice(0, 10);

  const yollar: { loc: string; priority: string }[] = [
    { loc: '/', priority: '1.0' },
    { loc: '/urunler', priority: '0.9' },
    { loc: '/setler', priority: '0.8' },
    { loc: '/bilgi', priority: '0.6' },
    { loc: '/siparis-takip', priority: '0.5' },
  ];

  for (const kat of k.magaza.kategoriler) {
    yollar.push({ loc: `/kategori/${kat.id}`, priority: '0.8' });
  }
  for (const u of k.magaza.urunler.filter((x) => x.durum === 'yayinda')) {
    yollar.push({ loc: `/urun/${u.id}`, priority: '0.9' });
  }

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
