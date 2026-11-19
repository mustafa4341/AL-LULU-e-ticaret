import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { gorselOku } from '../../lib/depo';

/*
 * /jpg/{img|medya}/....jpg — ürün görselinin JPEG kopyası.
 * Cimri'nin akış belgesi görsellerin .jpg veya .png olmasını istiyor; sitedeki ürün görselleri WebP.
 * Örnek: /jpg/img/urunler/x/01-on.jpg  →  /img/urunler/x/01-on.webp dosyasından üretilir.
 * Yalnız kendi görsellerimiz dönüştürülür (başka siteye istek atılmaz).
 */
const IZINLI = /^(?:img|medya)\/[a-z0-9][a-z0-9/_.-]*\.jpg$/i;
const KAYNAK_UZANTILARI = ['webp', 'png', 'jpg', 'jpeg'];

async function kaynakOku(yol: string, origin: string): Promise<Buffer | undefined> {
  if (yol.startsWith('medya/')) {
    const s = await gorselOku(yol.slice('medya/'.length));
    return s ? Buffer.from(s.veri) : undefined;
  }
  // Önce sitenin kendi adresi; Cloudflare engellerse Vercel'in doğrudan üretim adresi denenir
  const vercelAdresi = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  for (const kok of [origin, ...(vercelAdresi ? [`https://${vercelAdresi}`] : [])]) {
    const r = await fetch(new URL('/' + yol, kok), { redirect: 'error' }).catch(() => undefined);
    if (r?.ok && (r.headers.get('content-type') ?? '').startsWith('image/')) return Buffer.from(await r.arrayBuffer());
  }
  return undefined;
}

export const GET: APIRoute = async ({ params, url }) => {
  const yol = params.yol ?? '';
  if (!IZINLI.test(yol) || yol.includes('..') || yol.includes('//')) return new Response('Bulunamadı', { status: 404 });

  const govde = yol.slice(0, -'.jpg'.length);
  let kaynak: Buffer | undefined;
  for (const uzanti of KAYNAK_UZANTILARI) {
    kaynak = await kaynakOku(`${govde}.${uzanti}`, url.origin);
    if (kaynak) break;
  }
  if (!kaynak) return new Response('Bulunamadı', { status: 404 });

  const jpg = await sharp(kaynak)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }) // JPEG saydamlık taşımaz: saydam yerler beyaz olur
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();

  return new Response(new Uint8Array(jpg), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
    },
  });
};
