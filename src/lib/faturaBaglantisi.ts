/**
 * Faturanın herkese açık, imzalı bağlantısı: /fatura/{id}?i={imza}
 * Hepsiburada faturayı dosya olarak değil bağlantı olarak alır (Fatura Linki Gönderme; içerik application/pdf olmalı).
 * İmza sunucudaki zamanlayıcı sırrından fatura kimliğine özel türetilir (HMAC-SHA256); kimlik + imza bilinmeden dosya açılmaz.
 * Sır yoksa bağlantı üretilmez (fatura elle yüklenir).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { pazaryeriOrtam } from './pazaryeriApi';

function sir() {
  return [pazaryeriOrtam('FATURA_BAGLANTI_ANAHTARI'), pazaryeriOrtam('ZAMANLAYICI_ANAHTARI'), pazaryeriOrtam('CRON_SECRET')]
    .find((x): x is string => !!x && x.length >= 32);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function faturaImzasi(id: string): string | undefined {
  const s = sir();
  if (!s || !UUID.test(id)) return undefined;
  return createHmac('sha256', s).update('fatura-baglanti:' + id.toLowerCase()).digest('base64url').slice(0, 43);
}

export function faturaImzasiGecerli(id: string, imza: string): boolean {
  const beklenen = faturaImzasi(id);
  if (!beklenen || imza.length !== beklenen.length) return false;
  return timingSafeEqual(Buffer.from(imza), Buffer.from(beklenen));
}

/** Herkese açık adres; yalnız https kökenlerde (canlı site) üretilir. */
export function faturaHerkeseAcikAdres(origin: string, id: string): string | undefined {
  const imza = faturaImzasi(id);
  if (!imza || !origin.startsWith('https://')) return undefined;
  return `${origin.replace(/\/+$/, '')}/fatura/${id}?i=${imza}`;
}
