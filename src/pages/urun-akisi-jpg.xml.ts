import type { APIRoute } from 'astro';
import { GET as googleAkisi } from './urun-akisi.xml';

/*
 * /urun-akisi-jpg.xml — Cimri ve Akakçe başvurusunda verilecek ürün akışı.
 * İçerik /urun-akisi.xml (Google Merchant RSS 2.0) ile birebir aynı; Cimri bu biçimi resmî olarak kabul ediyor
 * (cimri.com/google-feed-doc.pdf). Tek fark görseller: Cimri .jpg/.png istiyor, sitedeki görseller WebP,
 * bu yüzden görsel adresleri /jpg/... dönüştürücüsüne çevrilir. Google akışı WebP ile kalır (Google kabul ediyor).
 */
const GORSEL = /(<g:(?:additional_)?image_link>)(https?:\/\/[^/<]+)\/((?:img|medya)\/[^<]+?)\.(?:webp|png|jpe?g)(<\/g:(?:additional_)?image_link>)/g;

export const GET: APIRoute = async (ctx) => {
  const yanit = await googleAkisi(ctx);
  if (!yanit.ok) return yanit;
  const xml = (await yanit.text()).replace(GORSEL, (_t, ac: string, kok: string, yol: string, kapa: string) => `${ac}${kok}/jpg/${yol}.jpg${kapa}`);
  return new Response(xml, { status: yanit.status, headers: new Headers(yanit.headers) });
};
