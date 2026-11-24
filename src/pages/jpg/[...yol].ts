import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { gorselOku } from '../../lib/depo';

/*
 * /jpg/{img|medya}/....jpg — ürün görselinin JPEG kopyası.
 * Cimri'nin akış belgesi görsellerin .jpg veya .png olmasını istiyor; sitedeki ürün görselleri WebP.
 * Örnek: /jpg/img/urunler/x/01-on.jpg  →  /img/urunler/x/01-on.webp dosyasından üretilir.
 *
 * Güvenlik (denetim AUD-009):
 *  - Yalnız sitenin KENDİ adresinden okunur (istekteki Host'a güvenilmez); başka siteye istek atılmaz.
 *  - Sorgu parametreli adresler (?r=1, ?r=2 … ile önbelleği atlatıp sunucuyu yorma) önce temiz adrese yönlendirilir.
 *  - Her okuma zaman aşımlı ve boyut sınırlı; bozuk görsel sunucuyu düşürmez, 404 döner.
 */
const IZINLI = /^(?:img|medya)\/[a-z0-9][a-z0-9/_.-]*\.jpg$/i;
const KAYNAK_UZANTILARI = ['webp', 'png', 'jpg', 'jpeg'];
const EN_BUYUK = 15 * 1024 * 1024;
const PIKSEL_SINIRI = 40_000_000;
const yerelMi = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '[::1]';

async function kaynakOku(yol: string, kokler: string[]): Promise<Buffer | undefined> {
  if (yol.startsWith('medya/')) {
    const s = await gorselOku(yol.slice('medya/'.length));
    return s && s.veri.length <= EN_BUYUK ? Buffer.from(s.veri) : undefined;
  }
  for (const kok of kokler) {
    try {
      const r = await fetch(new URL('/' + yol, kok), { redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) continue;
      if (Number(r.headers.get('content-length') ?? 0) > EN_BUYUK) continue;
      const veri = Buffer.from(await r.arrayBuffer());
      if (veri.length && veri.length <= EN_BUYUK) return veri;
    } catch { /* sıradaki adres denenir */ }
  }
  return undefined;
}

const bulunamadi = () => new Response('Bulunamadı', { status: 404, headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' } });

export const GET: APIRoute = async ({ params, url, redirect }) => {
  const yol = params.yol ?? '';
  if (!IZINLI.test(yol) || yol.includes('..') || yol.includes('//')) return bulunamadi();
  if (url.search) return redirect(url.pathname, 301);

  // Önce sitenin kendi adresi; Cloudflare engellerse Vercel'in doğrudan üretim adresi denenir. Yerelde yerel sunucu.
  const vercelAdresi = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const kokler = [
    ...(yerelMi(url.hostname) ? [url.origin] : []),
    import.meta.env.SITE,
    ...(vercelAdresi && /^[a-z0-9.-]+\.vercel\.app$/i.test(vercelAdresi) ? [`https://${vercelAdresi}`] : []),
  ].filter((k): k is string => Boolean(k));

  const govde = yol.slice(0, -'.jpg'.length);
  let kaynak: Buffer | undefined;
  for (const uzanti of KAYNAK_UZANTILARI) {
    kaynak = await kaynakOku(`${govde}.${uzanti}`, kokler);
    if (kaynak) break;
  }
  if (!kaynak) return bulunamadi();

  let jpg: Buffer;
  try {
    jpg = await sharp(kaynak, { failOn: 'error', limitInputPixels: PIKSEL_SINIRI })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }) // JPEG saydamlık taşımaz: saydam yerler beyaz olur
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
  } catch {
    return bulunamadi();
  }

  return new Response(new Uint8Array(jpg), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
    },
  });
};
