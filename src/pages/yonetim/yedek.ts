import type { APIRoute } from 'astro';
import { yedekOlustur } from '../../lib/yedek';
import { dosyaYaniti } from '../../lib/finansDisari';
import { onyuklemeMi } from '../../lib/istek';

/** Panel: tüm sipariş/ürün/sözleşme/finans verisinin ZIP yedeği (giriş middleware'de denetlenir) */
export const GET: APIRoute = async ({ request }) => {
  // Önyükleme isteği yedeği hazırlamaz ve "son yedek" tarihini değiştirmez (yedek alınmış gibi görünmesin)
  if (onyuklemeMi(request)) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  const { ad, veri } = await yedekOlustur();
  return dosyaYaniti(veri, 'application/zip', ad);
};
