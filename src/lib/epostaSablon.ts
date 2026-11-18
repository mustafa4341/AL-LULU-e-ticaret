/**
 * Müşteriye ve mağazaya giden e-postaların görünümü.
 * Tüm e-posta programlarında (Gmail, Outlook, iPhone Mail) aynı görünsün diye tablo + satır içi stil kullanılır.
 * Her şablon { konu, html, metin } döndürür; metin, HTML göstermeyen programlar içindir.
 */
import type { Siparis, SiteAyarlari } from './sema';
import { formatTL } from './fiyat';
import { siparisKargoBaglantisi } from './kargoTakip';

export interface Eposta { konu: string; html: string; metin: string }

const R = {
  zemin: '#F7F5F0', kart: '#FFFFFF', yazi: '#1B1916', soluk: '#6B655C', cizgi: '#E6E2DA',
  altin: '#C99A2E', altinKoyu: '#8A6416', altinAcik: '#FBF1D6', turuncu: '#E8650A', yesil: '#0A7F3F', yesilAcik: '#E7F5EC',
};
const YAZI = `font-family:Arial,'Helvetica Neue',Helvetica,sans-serif`;
const SERIF = `font-family:Georgia,'Times New Roman',serif`;

export const kacis = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const kok = (site: SiteAyarlari) => site.url.replace(/\/$/, '');
const tarihYaz = (iso: string) => new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function buton(metin: string, href: string, renk = R.turuncu): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 6px"><tr><td align="center" bgcolor="${renk}" style="border-radius:10px">
<a href="${kacis(href)}" target="_blank" style="display:inline-block;padding:14px 30px;${YAZI};font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:10px">${kacis(metin)}</a></td></tr></table>`;
}

function kutu(icerik: string, zemin = R.zemin): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0"><tr><td bgcolor="${zemin}" style="padding:16px 18px;border-radius:10px;${YAZI};font-size:14px;line-height:1.6;color:${R.yazi}">${icerik}</td></tr></table>`;
}

const baslikSatiri = (metin: string) =>
  `<p style="margin:26px 0 8px;${YAZI};font-size:12px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:${R.altinKoyu}">${kacis(metin)}</p>`;

/** Ürün satırları + indirimler + toplam */
function urunTablosu(s: Siparis): string {
  const satir = (sol: string, sag: string, stil = '') =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid ${R.cizgi};${YAZI};font-size:14px;color:${R.yazi};${stil}">${sol}</td>
<td align="right" style="padding:10px 0 10px 12px;border-bottom:1px solid ${R.cizgi};${YAZI};font-size:14px;white-space:nowrap;color:${R.yazi};${stil}">${sag}</td></tr>`;
  const kalemler = s.kalemler.map((k) => satir(
    `<strong>${kacis(k.ad)}</strong><br><span style="color:${R.soluk};font-size:13px">${k.adet} adet${k.icerik ? ' · ' + kacis(k.icerik) : ''}</span>`,
    kacis(formatTL(k.toplam)),
  )).join('');
  // Satır toplamları indirimli tutardır; indirim satırları gösteriliyorsa hesap tutsun diye önce liste fiyatı toplamı yazılır
  const ek = [
    s.setIndirimi || s.sepetIndirimi ? satir('Ürünler (liste fiyatı)', kacis(formatTL(s.urunlerToplami)), `color:${R.soluk}`) : '',
    s.setIndirimi ? satir('Set indirimi', `−${kacis(formatTL(s.setIndirimi))}`, `color:${R.yesil}`) : '',
    s.sepetIndirimi ? satir('Sepette indirim', `−${kacis(formatTL(s.sepetIndirimi))}`, `color:${R.yesil}`) : '',
    satir('Kargo', s.kargo ? kacis(formatTL(s.kargo)) : '<span style="color:#0A7F3F;font-weight:bold">Ücretsiz</span>'),
  ].join('');
  const toplam = `<tr><td style="padding:14px 0 4px;${YAZI};font-size:16px;font-weight:bold;color:${R.yazi}">Toplam</td>
<td align="right" style="padding:14px 0 4px;${YAZI};font-size:20px;font-weight:bold;color:${R.yazi};white-space:nowrap">${kacis(formatTL(s.toplam))}</td></tr>`;
  const avantaj = s.kampanyaIndirimi
    ? `<tr><td colspan="2" align="right" style="${YAZI};font-size:13px;color:${R.yesil};padding-bottom:4px">Bu siparişte ${kacis(formatTL(s.kampanyaIndirimi))} avantaj sağladınız</td></tr>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${kalemler}${ek}${toplam}${avantaj}</table>`;
}

const adresMetni = (s: Siparis) =>
  `<strong>${kacis(s.musteri.ad)} ${kacis(s.musteri.soyad)}</strong><br>${kacis(s.teslimat.adres)}<br>${kacis(s.teslimat.ilce)} / ${kacis(s.teslimat.il)}<br><span style="color:${R.soluk}">${kacis(s.musteri.tel)}</span>`;

/** Ortak çerçeve: logo, beyaz kart, alt bilgi */
function cerceve(site: SiteAyarlari, o: { onYazi: string; ust?: string; baslik: string; icerik: string; ek?: string; altNot?: string }): string {
  const url = kok(site);
  const wa = `https://wa.me/${site.whatsapp}`;
  return `<!doctype html>
<html lang="tr" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${kacis(o.baslik)}</title></head>
<body style="margin:0;padding:0;background:${R.zemin};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${R.zemin}">${kacis(o.onYazi)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${R.zemin}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td align="center" style="padding:4px 0 18px"><a href="${kacis(url)}" target="_blank"><img src="${kacis(url)}/img/logo/eposta-logo.png" width="130" alt="${kacis(site.ad)}" style="display:block;width:130px;max-width:130px;height:auto;border:0;${SERIF};font-size:22px;color:${R.altinKoyu}"></a></td></tr>
<tr><td bgcolor="${R.kart}" style="border-radius:16px;border-top:4px solid ${R.altin};padding:30px 28px 28px">
${o.ust ? `<p style="margin:0 0 6px;${YAZI};font-size:13px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${R.altinKoyu}">${kacis(o.ust)}</p>` : ''}
<h1 style="margin:0 0 14px;${SERIF};font-size:27px;line-height:1.25;font-weight:bold;color:${R.yazi}">${kacis(o.baslik)}</h1>
<div style="${YAZI};font-size:15px;line-height:1.65;color:${R.yazi}">${o.icerik}</div>
</td></tr>
${o.ek ? `<tr><td bgcolor="${R.kart}" style="border-radius:16px;padding:24px 28px;${YAZI};font-size:12px;line-height:1.5;color:${R.yazi}">${o.ek}</td></tr><tr><td style="height:16px"></td></tr>` : ''}
<tr><td align="center" style="padding:24px 10px 8px;${YAZI};font-size:13px;line-height:1.7;color:${R.soluk}">
Sorunuz mu var? Bu e-postayı yanıtlayın ya da <a href="${kacis(wa)}" style="color:${R.altinKoyu};font-weight:bold;text-decoration:none">WhatsApp (${kacis(site.telefonGorunen)})</a> üzerinden yazın.<br>
${site.calismaSaatleri ? `${kacis(site.calismaSaatleri)}<br>` : ''}
<a href="${kacis(url)}" style="color:${R.altinKoyu};text-decoration:none;font-weight:bold">${kacis(url.replace(/^https?:\/\//, ''))}</a>
${o.altNot ? `<br><span style="font-size:12px">${o.altNot}</span>` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

const satirlarMetin = (s: Siparis) => [
  ...s.kalemler.map((k) => `• ${k.adet} × ${k.ad} — ${formatTL(k.toplam)}`),
  s.setIndirimi || s.sepetIndirimi ? `Ürünler (liste fiyatı): ${formatTL(s.urunlerToplami)}` : '',
  s.setIndirimi ? `Set indirimi: −${formatTL(s.setIndirimi)}` : '',
  s.sepetIndirimi ? `Sepette indirim: −${formatTL(s.sepetIndirimi)}` : '',
  `Kargo: ${s.kargo ? formatTL(s.kargo) : 'Ücretsiz'}`,
  `Toplam: ${formatTL(s.toplam)}`,
].filter(Boolean).join('\n');

const imza = (site: SiteAyarlari) => `\n\nSorunuz olursa bu e-postayı yanıtlayabilir ya da WhatsApp'tan yazabilirsiniz: ${site.telefonGorunen}\n${site.ad} · ${kok(site)}`;

/* ───────────────────────── Müşteri: Sipariş alındı ───────────────────────── */
export function siparisAlindiEpostasi(
  s: Siparis, site: SiteAyarlari, takipUrl: string,
  belgeler?: { onBilgilendirme: string; mesafeliSatis: string; baglanti: string },
): Eposta {
  const odemeBekliyor = s.durum === 'odeme-bekliyor';
  const durumNotu = odemeBekliyor
    ? 'Ödemeniz onaylandığında siparişiniz hemen hazırlanmaya başlar ve kargoya verildiğinde size ayrıca e-posta göndeririz.'
    : 'Ödemeniz başarıyla alındı. Siparişinizi özenle hazırlıyoruz; kargoya verildiğinde takip numarasıyla birlikte size e-posta göndereceğiz.';
  const icerik = `<p style="margin:0 0 6px">Merhaba ${kacis(s.musteri.ad)},</p>
<p style="margin:0">Bizi tercih ettiğiniz için teşekkür ederiz. ${durumNotu}</p>
${kutu(`<span style="color:${R.soluk}">Sipariş numarası</span><br><strong style="font-size:18px;letter-spacing:.5px">${kacis(s.no)}</strong><br><span style="color:${R.soluk};font-size:13px">${kacis(tarihYaz(s.tarih))}</span>`, R.altinAcik)}
${baslikSatiri('Sipariş özeti')}${urunTablosu(s)}
${baslikSatiri('Teslimat adresi')}<p style="margin:0;font-size:14px;line-height:1.6">${adresMetni(s)}</p>
${buton('Siparişimi Takip Et', takipUrl)}`;
  const ek = belgeler ? `<p style="margin:0 0 10px;${YAZI};font-size:13px;font-weight:bold;color:${R.altinKoyu}">ONAYLADIĞINIZ SÖZLEŞMELER</p>
<p style="margin:0 0 12px">Aşağıdaki metinler bilgileriniz için kalıcı olarak size iletilmiştir. Ayrıca <a href="${kacis(belgeler.baglanti)}" style="color:${R.altinKoyu}">buradan</a> görüntüleyebilirsiniz.</p>
<h2 style="${SERIF};font-size:17px;margin:18px 0 6px">Ön Bilgilendirme Formu</h2>${belgeler.onBilgilendirme}
<hr style="border:0;border-top:1px solid ${R.cizgi};margin:20px 0"><h2 style="${SERIF};font-size:17px;margin:18px 0 6px">Mesafeli Satış Sözleşmesi</h2>${belgeler.mesafeliSatis}` : undefined;
  return {
    konu: `Siparişiniz alındı — ${s.no}`,
    html: cerceve(site, {
      onYazi: `${s.no} numaralı siparişiniz alındı. Toplam ${formatTL(s.toplam)}.`,
      ust: 'Sipariş onayı', baslik: 'Siparişiniz alındı', icerik, ek,
      altNot: `Bu e-posta ${kacis(s.no)} numaralı siparişiniz için gönderilmiştir.`,
    }),
    metin: `Merhaba ${s.musteri.ad},\n\n${s.no} numaralı siparişiniz alındı. ${durumNotu}\n\n${satirlarMetin(s)}\n\nTeslimat: ${s.teslimat.adres}, ${s.teslimat.ilce} / ${s.teslimat.il}\n\nSiparişinizi takip edin: ${takipUrl}${belgeler ? `\nOnayladığınız sözleşmeler: ${belgeler.baglanti}` : ''}${imza(site)}`,
  };
}

/* ───────────────────────── Müşteri: Durum değişti ───────────────────────── */
/** Hangi durumlarda müşteriye e-posta gider? (Hazırlanıyor gereksiz e-posta olmasın diye gönderilmez.) */
export const EPOSTA_GIDEN_DURUMLAR = ['odendi', 'kargoda', 'teslim-edildi', 'iptal'] as const;

export function durumEpostasi(s: Siparis, site: SiteAyarlari, takipUrl: string): Eposta | undefined {
  const ad = kacis(s.musteri.ad);
  const takipButonu = buton('Siparişimi Görüntüle', takipUrl);
  const kucukTakip = `<p style="margin:14px 0 0;text-align:center;font-size:13px"><a href="${kacis(takipUrl)}" style="color:${R.altinKoyu}">Sipariş detaylarını görüntüle</a></p>`;
  const no = `<strong>${kacis(s.no)}</strong>`;

  if (s.durum === 'kargoda') {
    const kargo = siparisKargoBaglantisi(s, site.kargo);
    const firma = s.kargoFirma || site.kargo.firma;
    const icerik = `<p style="margin:0 0 6px">Merhaba ${ad},</p>
<p style="margin:0">Güzel haber! ${no} numaralı siparişiniz paketlendi ve kargoya teslim edildi.</p>
${kutu(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="${YAZI};font-size:13px;color:${R.soluk};padding-bottom:2px">Kargo firması</td><td style="${YAZI};font-size:13px;color:${R.soluk};padding-bottom:2px">Takip numarası</td></tr>
<tr><td style="${YAZI};font-size:16px;font-weight:bold;color:${R.yazi}">${kacis(firma)}</td><td style="${YAZI};font-size:16px;font-weight:bold;color:${R.yazi};letter-spacing:.5px">${kacis(s.kargoTakip ?? '—')}</td></tr></table>`, R.yesilAcik)}
<p style="margin:0">Kargonuz genellikle 1–3 iş günü içinde adresinize ulaşır. Teslim alırken paketin hasarsız olduğunu kontrol etmenizi öneririz; hasar varsa kargo görevlisine tutanak tutturun.</p>
${kargo ? buton('Kargomu Takip Et', kargo.url, R.yesil) + kucukTakip : takipButonu}
${baslikSatiri('Gönderilen ürünler')}${urunTablosu(s)}`;
    return {
      konu: `Siparişiniz kargoya verildi — ${s.no}`,
      html: cerceve(site, { onYazi: `${firma} takip numaranız: ${s.kargoTakip ?? ''}`, ust: 'Kargoya verildi', baslik: 'Siparişiniz yola çıktı', icerik,
        altNot: `Bu e-posta ${kacis(s.no)} numaralı siparişiniz için gönderilmiştir.` }),
      metin: `Merhaba ${s.musteri.ad},\n\n${s.no} numaralı siparişiniz kargoya verildi.\nKargo firması: ${firma}\nTakip numarası: ${s.kargoTakip ?? '—'}\n${kargo ? `Kargo takibi: ${kargo.url}\n` : ''}Sipariş detayı: ${takipUrl}${imza(site)}`,
    };
  }

  if (s.durum === 'teslim-edildi') {
    const icerik = `<p style="margin:0 0 6px">Merhaba ${ad},</p>
<p style="margin:0">${no} numaralı siparişiniz teslim edildi. Ürününüzü güzel günlerde kullanmanızı dileriz.</p>
${kutu(`Faturanızı ve garanti belgenizi saklamanızı öneririz. Ürünle ilgili herhangi bir sorunuz olursa bu e-postayı yanıtlamanız yeterli; size hemen yardımcı oluruz.`)}
${takipButonu}`;
    return {
      konu: `Siparişiniz teslim edildi — ${s.no}`,
      html: cerceve(site, { onYazi: 'Siparişiniz teslim edildi. Bizi tercih ettiğiniz için teşekkürler.', ust: 'Teslim edildi', baslik: 'Afiyetle kullanın!', icerik,
        altNot: `Bu e-posta ${kacis(s.no)} numaralı siparişiniz için gönderilmiştir.` }),
      metin: `Merhaba ${s.musteri.ad},\n\n${s.no} numaralı siparişiniz teslim edildi. Faturanızı ve garanti belgenizi saklamanızı öneririz.\nSipariş detayı: ${takipUrl}${imza(site)}`,
    };
  }

  if (s.durum === 'odendi') {
    const icerik = `<p style="margin:0 0 6px">Merhaba ${ad},</p>
<p style="margin:0">${no} numaralı siparişinizin ödemesi onaylandı. Siparişinizi hazırlamaya başlıyoruz; kargoya verildiğinde takip numarasını size e-postayla ileteceğiz.</p>
${baslikSatiri('Sipariş özeti')}${urunTablosu(s)}${takipButonu}`;
    return {
      konu: `Ödemeniz onaylandı — ${s.no}`,
      html: cerceve(site, { onYazi: 'Ödemeniz onaylandı, siparişiniz hazırlanıyor.', ust: 'Ödeme onayı', baslik: 'Ödemeniz onaylandı', icerik,
        altNot: `Bu e-posta ${kacis(s.no)} numaralı siparişiniz için gönderilmiştir.` }),
      metin: `Merhaba ${s.musteri.ad},\n\n${s.no} numaralı siparişinizin ödemesi onaylandı; siparişiniz hazırlanıyor.\n\n${satirlarMetin(s)}\n\nSipariş detayı: ${takipUrl}${imza(site)}`,
    };
  }

  if (s.durum === 'iptal') {
    const odenmisti = !!s.paytr && s.paytr.sonuc === 'odendi' || s.gecmis.some((g) => g.durum === 'odendi');
    const iade = odenmisti ? 'Ödediğiniz tutar, ödeme yaptığınız karta/hesaba iade edilmiştir. Tutarın hesabınıza yansıma süresi bankanıza göre birkaç iş günü sürebilir.' : '';
    const icerik = `<p style="margin:0 0 6px">Merhaba ${ad},</p>
<p style="margin:0">${no} numaralı siparişiniz iptal edildi.${iade ? ' ' + iade : ''}</p>
${s.iptalNotu ? kutu(`<span style="color:${R.soluk}">Açıklama</span><br>${kacis(s.iptalNotu)}`) : ''}
<p style="margin:14px 0 0">Bir yanlışlık olduğunu düşünüyorsanız bu e-postayı yanıtlayın; hemen ilgilenelim.</p>${takipButonu}`;
    return {
      konu: `Siparişiniz iptal edildi — ${s.no}`,
      html: cerceve(site, { onYazi: `${s.no} numaralı siparişiniz iptal edildi.`, ust: 'Sipariş iptali', baslik: 'Siparişiniz iptal edildi', icerik,
        altNot: `Bu e-posta ${kacis(s.no)} numaralı siparişiniz için gönderilmiştir.` }),
      metin: `Merhaba ${s.musteri.ad},\n\n${s.no} numaralı siparişiniz iptal edildi. ${iade}${s.iptalNotu ? `\nAçıklama: ${s.iptalNotu}` : ''}\nSipariş detayı: ${takipUrl}${imza(site)}`,
    };
  }
  return undefined;
}

/* ───────────────────────── Mağaza: Yeni sipariş ───────────────────────── */
export function yeniSiparisEpostasi(s: Siparis, site: SiteAyarlari): Eposta {
  const panel = `${kok(site)}/yonetim/siparisler/${encodeURIComponent(s.no)}`;
  const odeme = s.paytr ? (s.paytr.sonuc === 'odendi' ? 'Kartla ödendi' : 'Kart ödemesi bekleniyor') : 'Ödeme bekleniyor (manuel onay)';
  const fatura = s.fatura.tip === 'kurumsal'
    ? `Kurumsal: ${kacis(s.fatura.firma)} · VD ${kacis(s.fatura.vd)} · VKN ${kacis(s.fatura.vno)}${s.fatura.adres ? `<br>${kacis(s.fatura.adres)}` : ''}` : 'Bireysel';
  const icerik = `${kutu(`<strong style="font-size:18px">${kacis(s.no)}</strong> · ${kacis(formatTL(s.toplam))}<br><span style="color:${R.soluk};font-size:13px">${kacis(tarihYaz(s.tarih))} · ${kacis(odeme)}</span>`, R.altinAcik)}
${baslikSatiri('Müşteri ve teslimat')}<p style="margin:0;font-size:14px;line-height:1.6">${adresMetni(s)}${s.musteri.eposta ? `<br><span style="color:${R.soluk}">${kacis(s.musteri.eposta)}</span>` : ''}</p>
${s.teslimat.not ? kutu(`<strong>Müşteri notu:</strong> ${kacis(s.teslimat.not)}`) : ''}
${baslikSatiri('Fatura')}<p style="margin:0;font-size:14px">${fatura}</p>
${baslikSatiri('Ürünler')}${urunTablosu(s)}
${buton('Panelde Aç', panel, R.yazi)}`;
  return {
    konu: `Yeni sipariş: ${s.no} — ${formatTL(s.toplam)} (${s.musteri.ad} ${s.musteri.soyad})`,
    html: cerceve(site, { onYazi: `${s.musteri.ad} ${s.musteri.soyad} · ${s.teslimat.il} · ${formatTL(s.toplam)}`, ust: 'Mağaza bildirimi', baslik: 'Yeni sipariş geldi', icerik }),
    metin: `Yeni sipariş: ${s.no}\n${odeme}\n\n${s.musteri.ad} ${s.musteri.soyad} · ${s.musteri.tel}${s.musteri.eposta ? ' · ' + s.musteri.eposta : ''}\n${s.teslimat.adres} ${s.teslimat.ilce} / ${s.teslimat.il}${s.teslimat.not ? `\nNot: ${s.teslimat.not}` : ''}\n\n${satirlarMetin(s)}\n\nPanel: ${panel}`,
  };
}
