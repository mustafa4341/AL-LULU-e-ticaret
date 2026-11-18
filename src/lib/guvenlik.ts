/**
 * Güvenlik yardımcıları:
 *  - istemciIp: Site Cloudflare arkasında. Vercel'in verdiği adres Cloudflare sunucusunun adresidir;
 *    gerçek ziyaretçi adresi yalnızca istek gerçekten Cloudflare'den geldiyse `cf-connecting-ip` başlığından alınır
 *    (başka yerden gelen sahte başlık dikkate alınmaz).
 *  - denemeSay: IP başına deneme sayaçları Supabase'te tutulur (Vercel'de sunucu belleği istekler arasında paylaşılmaz).
 *    Supabase'e ulaşılamazsa bellekteki yedek sayaç kullanılır. Ham IP saklanmaz, HMAC özeti saklanır.
 */
import crypto from 'node:crypto';
import net from 'node:net';
import { supabaseIstemci } from './depo';

// https://www.cloudflare.com/ips-v4 ve /ips-v6 (18.11.2026 tarihinde kontrol edildi)
const CF_V4 = ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22'];
const CF_V6 = ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32'];

const cloudflareAglari = new net.BlockList();
for (const ag of CF_V4) { const [adres, on] = ag.split('/'); cloudflareAglari.addSubnet(adres!, Number(on), 'ipv4'); }
for (const ag of CF_V6) { const [adres, on] = ag.split('/'); cloudflareAglari.addSubnet(adres!, Number(on), 'ipv6'); }

const sadeIp = (ip: string) => ip.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');

function cloudflareAdresi(ip: string): boolean {
  const tur = net.isIP(ip);
  if (!tur) return false;
  try { return cloudflareAglari.check(ip, tur === 4 ? 'ipv4' : 'ipv6'); } catch { return false; }
}

/** Ziyaretçinin gerçek IP adresi (sözleşme kaydı ve deneme sınırları için). */
export function istemciIp(request: Request, clientAddress: string | undefined): string {
  const baglanan = sadeIp(String(clientAddress ?? '').split(',')[0] ?? '');
  const cf = sadeIp(request.headers.get('cf-connecting-ip') ?? '');
  if (cf && net.isIP(cf) && cloudflareAdresi(baglanan)) return cf;
  return baglanan || 'bilinmiyor';
}

const ortam = (ad: string): string | undefined => process.env[ad] ?? (import.meta.env as Record<string, string | undefined>)[ad];

export const SINIRLAR = {
  /** Yönetim girişi: IP başına 15 dakikada 5 hatalı parola */
  giris: { limit: 5, pencereSn: 15 * 60 },
  /** Yönetim girişi: tüm IP'lerden toplam saatte 30 hatalı parola (dağıtık deneme saldırısına karşı) */
  girisGenel: { limit: 30, pencereSn: 60 * 60 },
  /** Sipariş oluşturma: IP başına saatte 10 */
  siparis: { limit: 10, pencereSn: 60 * 60 },
  /** Sipariş takip formu: IP başına 10 dakikada 10 */
  takip: { limit: 10, pencereSn: 10 * 60 },
} as const;
export type SinirTuru = keyof typeof SINIRLAR;

function anahtar(tur: SinirTuru, deger: string): string {
  const gizli = ortam('OTURUM_GIZLI') || 'al-lulu-home';
  return `${tur}:${crypto.createHmac('sha256', gizli).update(deger).digest('base64url').slice(0, 32)}`;
}

const yedekSayac = new Map<string, { sayi: number; bas: number }>();
function yerelSay(a: string, pencereSn: number, artir: 0 | 1 | null): number {
  const simdi = Date.now();
  if (artir === null) { yedekSayac.delete(a); return 0; }
  let k = yedekSayac.get(a);
  if (!k || simdi - k.bas > pencereSn * 1000) { k = { sayi: 0, bas: simdi }; yedekSayac.set(a, k); }
  k.sayi += artir;
  if (yedekSayac.size > 5000) for (const [x, v] of yedekSayac) if (simdi - v.bas > 86_400_000) yedekSayac.delete(x);
  return k.sayi;
}

/** artir: 0 = yalnız oku, 1 = bir deneme say, null = sıfırla. Penceredeki deneme sayısını döndürür. */
export async function denemeSay(tur: SinirTuru, deger: string, artir: 0 | 1 | null): Promise<number> {
  const a = anahtar(tur, deger);
  const { pencereSn } = SINIRLAR[tur];
  const sb = supabaseIstemci();
  if (sb) {
    const { data, error } = await sb.rpc('istek_say', { p_anahtar: a, p_pencere_sn: pencereSn, p_artir: artir });
    if (!error && typeof data === 'number') return data;
    console.error('[güvenlik] İstek sınırı kaydı okunamadı, bellekteki sayaç kullanılıyor:', error?.message);
  }
  return yerelSay(a, pencereSn, artir);
}

/** Bu istek sayılır; sınır aşıldıysa true döner. */
export async function sinirAsildi(tur: SinirTuru, deger: string): Promise<boolean> {
  return (await denemeSay(tur, deger, 1)) > SINIRLAR[tur].limit;
}

/** Sayılmadan, sınıra ulaşılmış mı? */
export async function sinirda(tur: SinirTuru, deger: string): Promise<boolean> {
  return (await denemeSay(tur, deger, 0)) >= SINIRLAR[tur].limit;
}
