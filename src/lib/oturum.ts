/**
 * Yönetim paneli oturumu.
 * Parola ve imza anahtarı .env dosyasından okunur (YONETIM_PAROLA, OTURUM_GIZLI).
 * Çerez: HttpOnly + SameSite=Strict + (canlıda) Secure; 12 saat geçerli; HMAC ile imzalı.
 */
import crypto from 'node:crypto';
import type { AstroCookies } from 'astro';

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

/* Giriş denemesi sınırı: IP başına 10 dakikada 5 deneme */
const denemeler = new Map<string, { sayi: number; sifirla: number }>();
export function girisEngelliMi(ip: string): boolean {
  const d = denemeler.get(ip);
  return !!d && d.sifirla > Date.now() && d.sayi >= 5;
}
export function basarisizGiris(ip: string): void {
  const simdi = Date.now();
  const d = denemeler.get(ip);
  if (!d || d.sifirla < simdi) denemeler.set(ip, { sayi: 1, sifirla: simdi + 10 * 60 * 1000 });
  else d.sayi++;
}
export function basariliGiris(ip: string): void {
  denemeler.delete(ip);
}
