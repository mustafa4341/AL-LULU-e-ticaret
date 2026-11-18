import { paytrAyari } from './paytr';

/**
 * Hangi dış hizmetler GERÇEKTEN bağlı? Sitedeki vaatler buna göre değişir:
 * bağlı olmayan bir hizmet için müşteriye söz verilmez ("SMS ile gelir", "3D Secure", "Siparişiniz alındı" gibi).
 *
 * - sms:   SMS sağlayıcısı (Netgsm, İletimerkezi vb.) lib/bildirim.ts → smsGonder() içine bağlanınca true yapılacak.
 * - eposta: .env'de SMTP_HOST tanımlıysa otomatik açılır.
 */
const ortam = (ad: string): string | undefined =>
  process.env[ad] ?? (import.meta.env as Record<string, string | undefined>)[ad];

export const ODEME_BAGLI = () => !!paytrAyari();
export const SMS_BAGLI = false;
export const epostaBagli = (): boolean => !!ortam('SMTP_HOST');

/** Müşteriye bildirim hangi kanaldan gider? ("SMS", "SMS ve e-posta", "e-posta" ya da hiçbiri) */
export function bildirimKanali(musteriEpostaVerdi: boolean): string | undefined {
  const k: string[] = [];
  if (SMS_BAGLI) k.push('SMS');
  if (epostaBagli() && musteriEpostaVerdi) k.push('e-posta');
  return k.length ? k.join(' ve ') : undefined;
}
