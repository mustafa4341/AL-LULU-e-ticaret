import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { TAKSIT_ACIK } from './taksit';
import type { Siparis } from './sema';

const ayar = (ad: string) => process.env[ad] ?? (import.meta.env as Record<string, string | undefined>)[ad];
export const PAYTR_BILDIRIM = '/api/odeme/paytr';
export const PAYTR_ORIGIN = 'https://www.paytr.com';
export const PAYTR_SURE_DK = 15;

export function paytrAyari() {
  const mod = ayar('PAYTR_MOD');
  if (mod !== 'test' && mod !== 'canli') return null;
  const id = ayar('PAYTR_MERCHANT_ID');
  const key = ayar('PAYTR_MERCHANT_KEY');
  const salt = ayar('PAYTR_MERCHANT_SALT');
  const adres = URL.parse(ayar('PAYTR_SITE_URL') ?? '');
  if (!id || !/^\d+$/.test(id) || !key || !salt || adres?.protocol !== 'https:' ||
    adres.username || adres.password || adres.pathname !== '/' || adres.search || adres.hash) return null;
  return { id, key, salt, origin: adres.origin, test: mod === 'test' };
}

export function paytrIstendi(): boolean {
  const mod = ayar('PAYTR_MOD');
  return !!mod && mod !== 'kapali';
}

type PaytrAyari = NonNullable<ReturnType<typeof paytrAyari>>;
const imza = (key: string, veri: string) => createHmac('sha256', key).update(veri).digest('base64');

export async function paytrFormUrl(a: PaytrAyari, siparis: Siparis, ip: string): Promise<string> {
  const odeme = siparis.paytr!;
  const eposta = siparis.musteri.eposta!;
  const kullaniciIp = ip.replace(/^::ffff:/, '');
  if (!isIP(kullaniciIp)) throw new Error('Ödeme için geçerli istemci adresi gerekli.');
  const sepet: [string, string, number][] = siparis.kalemler.map((k) => [k.ad, (k.toplam / k.adet).toFixed(2), k.adet]);
  if (siparis.kargo) sepet.push(['Kargo', siparis.kargo.toFixed(2), 1]);
  const sepetKod = Buffer.from(JSON.stringify(sepet)).toString('base64');
  const kurus = String(Math.round(siparis.toplam * 100)); // 19.99*100 = 1998.9999… olmasın
  const test = odeme.test ? '1' : '0';
  const taksitYok = TAKSIT_ACIK ? '0' : '1';
  const enCokTaksit = '0';
  const donus = new URL('/odeme/sonuc', a.origin);
  donus.searchParams.set('ref', odeme.ref);
  const teslimat = siparis.teslimat;
  const govde = new URLSearchParams({
    merchant_id: a.id, user_ip: kullaniciIp, merchant_oid: odeme.ref, email: eposta,
    payment_amount: kurus, user_basket: sepetKod, no_installment: taksitYok, max_installment: enCokTaksit,
    currency: 'TL', test_mode: test, debug_on: '0', timeout_limit: String(PAYTR_SURE_DK), lang: 'tr',
    user_name: Array.from(`${siparis.musteri.ad} ${siparis.musteri.soyad}`).slice(0, 60).join(''),
    user_address: Array.from(`${teslimat.il} / ${teslimat.ilce}, ${teslimat.adres}`).slice(0, 400).join(''),
    user_phone: siparis.musteri.tel, merchant_ok_url: donus.href, merchant_fail_url: donus.href,
    paytr_token: imza(a.key, a.id + kullaniciIp + odeme.ref + eposta + kurus + sepetKod + taksitYok + enCokTaksit + 'TL' + test + a.salt),
  });
  const yanit = await fetch(`${PAYTR_ORIGIN}/odeme/api/get-token`, {
    method: 'POST', body: govde, redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  if (!yanit.ok) throw new Error(`PayTR API HTTP ${yanit.status}`);
  const veri = await yanit.json();
  if (veri?.status !== 'success' || typeof veri.token !== 'string' || !/^[a-zA-Z0-9_-]{8,256}$/.test(veri.token)) {
    throw new Error('PayTR ödeme formu oluşturulamadı.');
  }
  return `${PAYTR_ORIGIN}/odeme/guvenli/${veri.token}`;
}

export function paytrBildirimDogrula(a: PaytrAyari, form: FormData) {
  const alan = (ad: string) => {
    const deger = form.get(ad);
    return typeof deger === 'string' && form.getAll(ad).length === 1 ? deger : '';
  };
  const ref = alan('merchant_oid');
  const durum = alan('status');
  const tutar = alan('total_amount');
  const hash = alan('hash');
  if (!/^AL[a-f0-9]{32}$/.test(ref) || (durum !== 'success' && durum !== 'failed') ||
    !/^\d{1,15}$/.test(tutar) || !/^[a-zA-Z0-9+/]{43}=$/.test(hash)) return null;
  const beklenen = imza(a.key, ref + a.salt + durum + tutar);
  if (!timingSafeEqual(Buffer.from(hash), Buffer.from(beklenen))) return null;
  const test = alan('test_mode');
  if (form.has('test_mode') && test !== '0' && test !== '1') return null;
  return { ref, basarili: durum === 'success', kurus: Number(tutar), test: test === '1',
    siparisTutari: alan('payment_amount'), tur: alan('payment_type'), paraBirimi: alan('currency') };
}
