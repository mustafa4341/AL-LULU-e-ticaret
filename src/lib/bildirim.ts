/**
 * Sipariş bildirimleri — e-posta (SMTP) ve SMS.
 * Ayar yoksa bildirim gönderilmez, sadece sunucu günlüğüne yazılır; sipariş yine kaydedilir.
 *
 * E-posta için .env:
 *   SMTP_HOST, SMTP_PORT (465/587), SMTP_KULLANICI, SMTP_PAROLA, SMTP_GONDEREN
 *   (Gmail kullanacaksanız Google hesabınızda "Uygulama şifresi" oluşturup SMTP_PAROLA'ya yazın.)
 * SMS için: SMS sağlayıcısı (Netgsm, İletimerkezi vb.) seçildiğinde smsGonder() doldurulacak.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import type { Siparis, SiteAyarlari } from './sema';
import { SIPARIS_DURUM_ADLARI } from './sema';
import { formatTL } from './fiyat';

const ortam = (ad: string): string | undefined => process.env[ad] ?? (import.meta.env as Record<string, string | undefined>)[ad];

let tasiyici: Transporter | null | undefined;
function eposta(): Transporter | null {
  if (tasiyici !== undefined) return tasiyici;
  const host = ortam('SMTP_HOST');
  if (!host) return (tasiyici = null);
  const port = Number(ortam('SMTP_PORT') || 465);
  tasiyici = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user: ortam('SMTP_KULLANICI'), pass: ortam('SMTP_PAROLA') },
  });
  return tasiyici;
}

async function epostaGonder(kime: string, konu: string, metin: string, html?: string): Promise<void> {
  const t = eposta();
  if (!t) { console.info(`[bildirim] E-posta ayarı yok, gönderilmedi → ${kime}: ${konu}`); return; }
  try {
    await t.sendMail({ from: ortam('SMTP_GONDEREN') || ortam('SMTP_KULLANICI'), to: kime, subject: konu, text: metin, ...(html ? { html } : {}) });
  } catch (e) {
    console.error('[bildirim] E-posta gönderilemedi:', (e as Error).message);
  }
}

async function smsGonder(tel: string, metin: string): Promise<void> {
  // SMS sağlayıcısı seçildiğinde burada API çağrısı yapılacak.
  console.info(`[bildirim] SMS sağlayıcısı ayarlı değil, gönderilmedi → ${tel}: ${metin.slice(0, 60)}…`);
}

function ozet(s: Siparis): string {
  return [
    ...s.kalemler.map((k) => `• ${k.adet} × ${k.ad} — ${formatTL(k.toplam)}`),
    s.setIndirimi ? `Set indirimi: −${formatTL(s.setIndirimi)}` : '',
    s.sepetIndirimi ? `Sepette indirim: −${formatTL(s.sepetIndirimi)}` : '',
    `Kargo: ${s.kargo ? formatTL(s.kargo) : 'Bedava'}`,
    `Toplam: ${formatTL(s.toplam)}`,
  ].filter(Boolean).join('\n');
}

const htmlKacis = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function siparisAlindi(
  s: Siparis, site: SiteAyarlari, takipUrl: string,
  belgeler?: { onBilgilendirme: string; mesafeliSatis: string; baglanti: string },
): Promise<void> {
  const govde = `Merhaba ${s.musteri.ad},\n\n${s.no} numaralı siparişiniz alındı.\n\n${ozet(s)}\n\nSiparişinizi takip edin: ${takipUrl}\n${belgeler ? `Onayladığınız Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi: ${belgeler.baglanti}\n` : ''}Sorunuz olursa WhatsApp: ${site.telefonGorunen}\n\n${site.ad}`;
  // Sözleşmeler e-postanın HTML bölümünde de yer alır (kalıcı veri saklayıcısı ile teslim)
  const html = belgeler ? `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222;max-width:720px">
    <p>Merhaba ${htmlKacis(s.musteri.ad)},</p><p><strong>${htmlKacis(s.no)}</strong> numaralı siparişiniz alındı.</p>
    <pre style="font-family:inherit;white-space:pre-wrap">${htmlKacis(ozet(s))}</pre>
    <p><a href="${htmlKacis(takipUrl)}">Siparişinizi takip edin</a> · WhatsApp: ${htmlKacis(site.telefonGorunen)}</p>
    <hr><h1 style="font-size:20px">Ön Bilgilendirme Formu</h1>${belgeler.onBilgilendirme}
    <hr><h1 style="font-size:20px">Mesafeli Satış Sözleşmesi</h1>${belgeler.mesafeliSatis}
    <hr><p>${htmlKacis(site.ad)}</p></div>` : undefined;
  await Promise.all([
    s.musteri.eposta ? epostaGonder(s.musteri.eposta, `${site.ad} — Siparişiniz alındı (${s.no})`, govde, html) : Promise.resolve(),
    smsGonder(s.musteri.tel, `${site.ad}: ${s.no} numaralı siparişiniz alındı. Toplam ${formatTL(s.toplam)}. Takip: ${takipUrl}`),
    epostaGonder(site.eposta, `Yeni sipariş: ${s.no} — ${formatTL(s.toplam)}`,
      `${s.musteri.ad} ${s.musteri.soyad} · ${s.musteri.tel}${s.musteri.eposta ? ' · ' + s.musteri.eposta : ''}\n${s.teslimat.adres} ${s.teslimat.ilce} / ${s.teslimat.il}\n\n${ozet(s)}`),
  ]);
}

export async function durumDegisti(s: Siparis, site: SiteAyarlari, takipUrl: string): Promise<void> {
  const durum = SIPARIS_DURUM_ADLARI[s.durum];
  const ek = s.durum === 'kargoda' && s.kargoTakip ? ` Kargo takip no: ${s.kargoTakip}.` : '';
  const metin = `${site.ad}: ${s.no} numaralı siparişinizin durumu: ${durum}.${ek} Takip: ${takipUrl}`;
  await Promise.all([
    smsGonder(s.musteri.tel, metin),
    s.musteri.eposta ? epostaGonder(s.musteri.eposta, `${site.ad} — Siparişiniz: ${durum} (${s.no})`, metin) : Promise.resolve(),
  ]);
}
