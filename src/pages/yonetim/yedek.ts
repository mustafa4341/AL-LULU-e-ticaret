import type { APIRoute } from 'astro';
import { yedekOlustur } from '../../lib/yedek';
import { dosyaYaniti } from '../../lib/finansDisari';

/** Panel: tüm sipariş/ürün/sözleşme/finans verisinin ZIP yedeği (giriş middleware'de denetlenir) */
export const GET: APIRoute = async () => {
  const { ad, veri } = await yedekOlustur();
  return dosyaYaniti(veri, 'application/zip', ad);
};
