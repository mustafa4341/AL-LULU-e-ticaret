import type { APIRoute } from 'astro';
import { urunAkisi } from './urun-akisi.xml';

/*
 * /urun-akisi-jpg.xml — Cimri ve Akakçe başvurusunda verilecek ürün akışı.
 * Aynı katalog ve teklif verisini Cimri'nin g:description ve JPEG gereksinimleriyle sunar
 * (cimri.com/google-feed-doc.pdf). Görsel adresleri /jpg/... dönüştürücüsüne çevrilir.
 */
const GORSEL = /(<g:(?:additional_)?image_link>)(https?:\/\/[^/<]+)\/((?:img|medya)\/[^<]+?)\.(?:webp|png|jpe?g)(<\/g:(?:additional_)?image_link>)/g;

export const GET: APIRoute = async (ctx) => {
  const yanit = urunAkisi(ctx, 'karsilastirma');
  if (!yanit.ok) return yanit;
  const xml = (await yanit.text()).replace(GORSEL, (_t, ac: string, kok: string, yol: string, kapa: string) => `${ac}${kok}/jpg/${yol}.jpg${kapa}`);
  return new Response(xml, { status: yanit.status, headers: new Headers(yanit.headers) });
};
