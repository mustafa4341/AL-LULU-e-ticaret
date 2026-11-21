import type { APIRoute } from 'astro';
import { faturaEki } from '../../../lib/finansDepo';
import { dosyaYaniti } from '../../../lib/finansDisari';

export const prerender = false;

/** Kayıtlı fatura dosyasını indirir (yalnız yönetici; /yonetim altı oturum ister). */
export const GET: APIRoute = async ({ url }) => {
  const ek = await faturaEki(url.searchParams.get('id') ?? '');
  if (!ek?.kayit.ek) return new Response('Fatura dosyası bulunamadı.', { status: 404 });
  return dosyaYaniti(ek.veri, ek.kayit.ek.tur, ek.kayit.ek.ad, true);
};
