/**
 * Sipariş bildirimleri — e-posta (Google Workspace SMTP) ve SMS.
 * Ayar yoksa bildirim gönderilmez, sadece sunucu günlüğüne yazılır; sipariş yine kaydedilir.
 * E-postaların görünümü: lib/epostaSablon.ts
 *
 * .env (ayrıntı: EPOSTA-VE-GOOGLE.md):
 *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465
 *   SMTP_KULLANICI=info@alluluhome.com (tek gerçek hesap)   SMTP_PAROLA=<Google "uygulama şifresi", 16 harf>
 *   SMTP_GONDEREN="Al Lulu Home <musteri@alluluhome.com>"  (takma ad; Gmail > Farklı gönder listesinde olmalı)
 *   EPOSTA_YANIT=info@alluluhome.com            (müşteri "Yanıtla"ya basınca buraya gider)
 *   SIPARIS_BILDIRIM_EPOSTA=<info@ dışı bir kutu>   (yeni sipariş bildirimi; virgülle birden çok adres)
 * SMS için: SMS sağlayıcısı (Netgsm, İletimerkezi vb.) seçildiğinde smsGonder() doldurulacak.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import type { Siparis, SiteAyarlari } from './sema';
import { SIPARIS_DURUM_ADLARI } from './sema';
import { formatTL } from './fiyat';
import { EPOSTA_GIDEN_DURUMLAR, durumEpostasi, siparisAlindiEpostasi, yeniSiparisEpostasi, type Eposta } from './epostaSablon';

const ortam = (ad: string): string | undefined => process.env[ad] ?? (import.meta.env as Record<string, string | undefined>)[ad];

let tasiyici: Transporter | null | undefined;
function eposta(): Transporter | null {
  if (tasiyici !== undefined) return tasiyici;
  const host = ortam('SMTP_HOST');
  if (!host || !ortam('SMTP_PAROLA')) return (tasiyici = null); // şifre girilene kadar gönderme denenmez
  const port = Number(ortam('SMTP_PORT') || 465);
  tasiyici = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user: ortam('SMTP_KULLANICI'), pass: ortam('SMTP_PAROLA') },
    // Sunucusuz ortamda (Vercel) istek uzun süre asılı kalmasın
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
  });
  return tasiyici;
}

async function epostaGonder(kime: string, e: Eposta, yanit?: string): Promise<void> {
  const t = eposta();
  if (!t) return;
  try {
    await t.sendMail({
      from: ortam('SMTP_GONDEREN') || ortam('SMTP_KULLANICI'),
      to: kime,
      replyTo: yanit || ortam('EPOSTA_YANIT') || undefined,
      subject: e.konu, text: e.metin, html: e.html,
    });
  } catch (h) {
    console.error('[bildirim] E-posta gönderilemedi:', (h as Error)?.message ?? h);
  }
}

async function smsGonder(_tel: string, _metin: string): Promise<void> {
  // SMS sağlayıcısı seçildiğinde burada API çağrısı yapılacak.
}

/** Yeni sipariş bildiriminin gideceği mağaza adres(ler)i */
const magazaAdresi = (site: SiteAyarlari) => ortam('SIPARIS_BILDIRIM_EPOSTA') || site.eposta;

export async function siparisAlindi(
  s: Siparis, site: SiteAyarlari, takipUrl: string,
  belgeler?: { onBilgilendirme: string; mesafeliSatis: string; baglanti: string },
): Promise<void> {
  await Promise.all([
    s.musteri.eposta ? epostaGonder(s.musteri.eposta, siparisAlindiEpostasi(s, site, takipUrl, belgeler)) : Promise.resolve(),
    smsGonder(s.musteri.tel, `${site.ad}: ${s.no} numaralı siparişiniz alındı. Toplam ${formatTL(s.toplam)}. Takip: ${takipUrl}`),
    // Mağazaya gelen bildirimde "Yanıtla" doğrudan müşteriye yazar
    epostaGonder(magazaAdresi(site), yeniSiparisEpostasi(s, site), s.musteri.eposta),
  ]);
}

export async function durumDegisti(s: Siparis, site: SiteAyarlari, takipUrl: string): Promise<void> {
  const durum = SIPARIS_DURUM_ADLARI[s.durum];
  const ek = s.durum === 'kargoda' && s.kargoTakip ? ` Kargo takip no: ${s.kargoTakip}.` : '';
  const ePosta = (EPOSTA_GIDEN_DURUMLAR as readonly string[]).includes(s.durum) ? durumEpostasi(s, site, takipUrl) : undefined;
  await Promise.all([
    smsGonder(s.musteri.tel, `${site.ad}: ${s.no} numaralı siparişinizin durumu: ${durum}.${ek} Takip: ${takipUrl}`),
    s.musteri.eposta && ePosta ? epostaGonder(s.musteri.eposta, ePosta) : Promise.resolve(),
  ]);
}
