import type { APIRoute } from 'astro';
import { Katalog } from '../lib/katalog';
import { xmlMetni } from '../lib/seo';
import { YASAL_SAYFALAR } from '../lib/yasal';

export const GET: APIRoute = async ({ locals, site }) => {
  const k = new Katalog(locals.katalog.magaza);
  const kok = (site ?? new URL(k.site.url)).origin;

  const kayitlar = [
    ...['/', '/urunler', '/bilgi', ...(k.tumSetler().length ? ['/setler'] : [])].map((yol) => ({ yol, gorseller: [] })),
    ...k.gorunurKategoriler().filter((kat) => k.kategoriUrunleri(kat.id).length).map((kat) => ({ yol: `/kategori/${kat.id}`, gorseller: [] })),
    ...k.tumUrunler().map((u) => ({ yol: `/urun/${u.id}`, gorseller: [...new Set(u.gorseller.map((g) => new URL(g.src, kok).href))].slice(0, 1000) })),
    ...YASAL_SAYFALAR.map((y) => ({ yol: `/yasal/${y.yol}`, gorseller: [] })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${kayitlar.map(({ yol, gorseller }) => [
    '  <url>',
    `    <loc>${xmlMetni(new URL(yol, kok).href)}</loc>`,
    ...gorseller.map((src) => `    <image:image><image:loc>${xmlMetni(src)}</image:loc></image:image>`),
    '  </url>',
  ].join('\n')).join('\n')}
</urlset>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
