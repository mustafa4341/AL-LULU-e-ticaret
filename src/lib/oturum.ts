/**
 * Yönetim paneli oturumu.
 * Parola ve imza anahtarı .env dosyasından okunur (YONETIM_PAROLA, OTURUM_GIZLI).
 * Çerez: HttpOnly + SameSite=Strict + (canlıda) Secure; 12 saat geçerli; HMAC ile imzalı.
 */
import crypto from 'node:crypto';
import type { AstroCookies } from 'astro';
import { denemeSay, sinirda } from './guvenlik';

export const CEREZ = 'yonetim_oturum';
const SURE_SN = 12 * 60 * 60;

const ortam = (ad: string): string | undefined => process.env[ad] ?? (import.meta.env as Record<string, string | undefined>)[ad];

export function yonetimHazirMi(): boolean {
  return !!ortam('YONETIM_PAROLA') && (ortam('OTURUM_GIZLI')?.length ?? 0) >= 32;
}

const ozet = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest();
const imza = (veri: string) => crypto.createHmac('sha256', ortam('OTURUM_GIZLI') ?? '').update(veri).digest('base64url');

export function parolaDogruMu(girilen: string): boolean {
  const dogru = ortam('YONETIM_PAROLA');
  if (!dogru) return false;
  return crypto.timingSafeEqual(ozet(girilen), ozet(dogru));
}

export function oturumAc(cerezler: AstroCookies, guvenli: boolean): void {
  const bitis = Math.floor(Date.now() / 1000) + SURE_SN;
  const veri = `y.${bitis}`;
  cerezler.set(CEREZ, `${veri}.${imza(veri)}`, {
    httpOnly: true, sameSite: 'strict', secure: guvenli, path: '/', maxAge: SURE_SN,
  });
}

export function oturumKapat(cerezler: AstroCookies): void {
  cerezler.delete(CEREZ, { path: '/' });
}

export function oturumGecerli(deger: string | undefined): boolean {
  if (!deger || !yonetimHazirMi()) return false;
  const p = deger.split('.');
  if (p.length !== 3 || p[0] !== 'y') return false;
  const veri = `${p[0]}.${p[1]}`;
  const a = Buffer.from(p[2]!), b = Buffer.from(imza(veri));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(p[1]) > Date.now() / 1000;
}

/**
 * Gizli giriş adresi (.env / Vercel: YONETIM_GIRIS_YOLU, ör. "kapi-7f3k9q2m8x").
 * Tanımlıysa giriş sayfası yalnızca bu adreste açılır; /yonetim ile başlayan her adres,
 * giriş yapmamış ziyaretçiye sıradan "sayfa bulunamadı" sayfası gösterir (panelin varlığı belli olmaz).
 */
export function girisYolu(): string | undefined {
  const ham = ortam('YONETIM_GIRIS_YOLU')?.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  if (!ham) return undefined;
  if (!/^[a-z0-9][a-z0-9-]{11,63}$/.test(ham) || ham.startsWith('yonetim')) {
    console.error('[yönetim] YONETIM_GIRIS_YOLU geçersiz: en az 12 karakter, yalnız küçük harf, rakam ve tire olmalı. Varsayılan giriş adresi kullanılıyor.');
    return undefined;
  }
  return '/' + ham;
}

/* Giriş denemesi sınırı: IP başına 15 dakikada 5, tüm siteye saatte 30 hatalı parola (Supabase'te kalıcı sayaç) */
export async function girisEngelliMi(ip: string): Promise<boolean> {
  const [kisi, genel] = await Promise.all([sinirda('giris', ip), sinirda('girisGenel', 'tum')]);
  return kisi || genel;
}
export async function basarisizGiris(ip: string): Promise<void> {
  await Promise.all([denemeSay('giris', ip, 1), denemeSay('girisGenel', 'tum', 1)]);
}
export async function basariliGiris(ip: string): Promise<void> {
  await denemeSay('giris', ip, null);
}
