/**
 * Yönetim paneli oturumu.
 * Parola ve imza anahtarı .env dosyasından okunur (YONETIM_PAROLA, OTURUM_GIZLI).
 * Çerez: HttpOnly + SameSite=Strict + (canlıda) Secure; 12 saat geçerli; HMAC ile imzalı.
 */
import crypto from 'node:crypto';
import type { AstroCookies } from 'astro';
import { denemeSay, sinirda } from './guvenlik';
import { supabaseIstemci } from './depo';

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

/* ---------- Çıkışta oturumu sunucuda da kapatma (denetim AUD-019) ----------
 * Her girişin kendine ait rastgele kimliği (jti) vardır. Çıkış yapılınca bu kimlik iptal listesine yazılır;
 * böylece kopyalanmış/çalınmış bir çerez, çıkıştan sonra 12 saat dolmadan da geçersiz olur.
 * Liste Supabase medya_dosyalari'nda "_oturum/iptal.json" (herkese açık /medya/ adresinden okunamaz: "_" ile başlar). */
const IPTAL_KAYDI = '_oturum/iptal.json';
let iptalOnbellek: { liste: Record<string, number>; zaman: number } | undefined;

async function iptalListesi(taze = false): Promise<Record<string, number>> {
  if (!taze && iptalOnbellek && Date.now() - iptalOnbellek.zaman < 20_000) return iptalOnbellek.liste;
  const sb = supabaseIstemci();
  if (!sb) return iptalOnbellek?.liste ?? {};
  const { data, error } = await sb.from('medya_dosyalari').select('veri_base64').eq('yol', IPTAL_KAYDI).eq('aktif', true).maybeSingle();
  // Veritabanına ulaşılamazsa son bilinen liste kullanılır (panel zaten veritabanısız çalışmaz)
  if (error) return iptalOnbellek?.liste ?? {};
  let liste: Record<string, number> = {};
  try { liste = data?.veri_base64 ? JSON.parse(Buffer.from(data.veri_base64, 'base64').toString('utf8')) : {}; } catch { liste = {}; }
  iptalOnbellek = { liste, zaman: Date.now() };
  return liste;
}

async function oturumuIptalEt(jti: string, bitis: number): Promise<void> {
  const simdi = Date.now() / 1000;
  const liste = Object.fromEntries(Object.entries(await iptalListesi(true)).filter(([, b]) => b > simdi));
  liste[jti] = bitis;
  iptalOnbellek = { liste, zaman: Date.now() };
  const sb = supabaseIstemci();
  if (!sb) return;
  const metin = JSON.stringify(liste);
  const { error } = await sb.from('medya_dosyalari').upsert({
    yol: IPTAL_KAYDI, icerik_turu: 'application/json', boyut: Math.max(1, Buffer.byteLength(metin)), veri_base64: Buffer.from(metin).toString('base64'), aktif: true,
  });
  if (error) console.error('[oturum] Çıkış kaydı yazılamadı:', error.message);
}

/** Çerez: y.<bitiş>.<oturum kimliği>.<imza> */
function cozumle(deger: string | undefined): { bitis: number; jti: string } | undefined {
  if (!deger || !yonetimHazirMi()) return undefined;
  const p = deger.split('.');
  if (p.length !== 4 || p[0] !== 'y' || !/^[A-Za-z0-9_-]{16,32}$/.test(p[2]!)) return undefined;
  const veri = `${p[0]}.${p[1]}.${p[2]}`;
  const a = Buffer.from(p[3]!), b = Buffer.from(imza(veri));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return undefined;
  const bitis = Number(p[1]);
  return bitis > Date.now() / 1000 ? { bitis, jti: p[2]! } : undefined;
}

export function oturumAc(cerezler: AstroCookies, guvenli: boolean): void {
  const bitis = Math.floor(Date.now() / 1000) + SURE_SN;
  const veri = `y.${bitis}.${crypto.randomBytes(16).toString('base64url')}`;
  cerezler.set(CEREZ, `${veri}.${imza(veri)}`, {
    httpOnly: true, sameSite: 'strict', secure: guvenli, path: '/', maxAge: SURE_SN,
  });
}

export async function oturumKapat(cerezler: AstroCookies): Promise<void> {
  const o = cozumle(cerezler.get(CEREZ)?.value);
  cerezler.delete(CEREZ, { path: '/' });
  if (o) await oturumuIptalEt(o.jti, o.bitis);
}

export async function oturumGecerli(deger: string | undefined): Promise<boolean> {
  const o = cozumle(deger);
  if (!o) return false;
  return !(o.jti in (await iptalListesi()));
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
