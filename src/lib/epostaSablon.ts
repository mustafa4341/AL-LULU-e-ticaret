/**
 * Müşteriye ve mağazaya giden e-postaların görünümü.
 * Tüm e-posta programlarında (Gmail, Outlook, iPhone Mail) aynı görünsün diye tablo + satır içi stil kullanılır.
 * Her şablon { konu, html, metin } döndürür; metin, HTML göstermeyen programlar içindir.
 *
 * Tasarım: koyu antrasit başlık + altın logo, beyaz kart, serif başlıklar, sipariş adım çubuğu,
 * fotoğraflı ürün satırları ve sakin bir alt bilgi. Reklam/indirim içeriği yok (İYS kapsamına girmesin).
 */
import type { Siparis, SiteAyarlari } from './sema';
import { formatTL } from './fiyat';
import { siparisKargoBaglantisi } from './kargoTakip';

export interface Eposta { konu: string; html: string; metin: string; ekler?: { dosyaAdi: string; icerik: string; tur: string }[] }
/** Ürün/set kimliğinden fotoğraf yolu (ör. "/medya/..."); yoksa satır fotoğrafsız çizilir */
export type GorselBul = (id: string) => string | undefined;

const R = {
  zemin: '#F3EFE7', kart: '#FFFFFF', koyu: '#17140F', koyu2: '#241F18', yazi: '#1B1916', soluk: '#736B60', cizgi: '#ECE6DB',
  altin: '#C9A04A', altinKoyu: '#8A6416', altinAcik: '#FAF4E4', yesil: '#0A7F3F', yesilAcik: '#E9F6EE', kirmizi: '#A22825', kirmiziAcik: '#FCEEEC',
};
const YAZI = `font-family:'Helvetica Neue',Helvetica,Arial,sans-serif`;
const SERIF = `font-family:Georgia,'Times New Roman',Times,serif`;

export const kacis = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const kok = (site: SiteAyarlari) => site.url.replace(/\/$/, '');
const mutlak = (site: SiteAyarlari, yol: string) => /^https?:\/\//.test(yol) ? yol : kok(site) + (yol.startsWith('/') ? '' : '/') + yol;
const tarihYaz = (iso: string) => new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function buton(metin: string, href: string, renk = R.koyu, yaziRengi = '#FFFFFF'): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:26px auto 4px"><tr><td align="center" bgcolor="${renk}" style="border-radius:999px">
<a href="${kacis(href)}" target="_blank" style="display:inline-block;padding:15px 34px;${YAZI};font-size:15px;font-weight:bold;letter-spacing:.3px;color:${yaziRengi};text-decoration:none;border-radius:999px">${kacis(metin)}&nbsp;&nbsp;&rarr;</a></td></tr></table>`;
}

function kutu(icerik: string, zemin = R.altinAcik, kenar = '#EFE3C4'): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0"><tr><td bgcolor="${zemin}" style="padding:18px 20px;border-radius:12px;border:1px solid ${kenar};${YAZI};font-size:14px;line-height:1.6;color:${R.yazi}">${icerik}</td></tr></table>`;
}

const baslikSatiri = (metin: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 6px"><tr>
<td style="${YAZI};font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${R.altinKoyu};white-space:nowrap;padding-right:12px">${kacis(metin)}</td>
<td width="100%" style="border-bottom:1px solid ${R.cizgi};font-size:0;line-height:0">&nbsp;</td></tr></table>`;

/** Sipariş numarası + tarih "kartı"; durum etiketi altta (telefonda numara ikiye bölünmesin diye yan yana değil) */
const siparisKarti = (s: Siparis, durum?: string) => kutu(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="${YAZI}"><span style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${R.soluk}">Sipariş No</span><br>
<strong style="${SERIF};font-size:21px;letter-spacing:.5px;color:${R.yazi};white-space:nowrap">${kacis(s.no)}</strong><br>
<span style="font-size:13px;color:${R.soluk}">${kacis(tarihYaz(s.tarih))}</span>
${durum ? `<div style="margin-top:10px;font-size:12px">${durum}</div>` : ''}</td>
</tr></table>`);

/** Müşteri e-postalarında sipariş yolculuğu: Alındı → Hazırlanıyor → Kargoda → Teslim */
function adimCubugu(s: Siparis): string {
  if (s.durum === 'iptal') return '';
  const adimlar = ['Alındı', 'Hazırlanıyor', 'Kargoda', 'Teslim'];
  const aktif = s.durum === 'teslim-edildi' ? 3 : s.durum === 'kargoda' ? 2 : s.durum === 'hazirlaniyor' || s.durum === 'odendi' ? 1 : 0;
  // Negatif kenar boşluğu ve konumlandırma Gmail/Outlook'ta bozulur: dört parçalı çubuk + altında etiket
  const hucre = adimlar.map((ad, i) => {
    const tamam = i <= aktif;
    const simdiki = i === aktif;
    return `<td width="25%" valign="top" style="padding:0 3px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="5" bgcolor="${tamam ? R.altin : '#E7E0D2'}" style="height:5px;font-size:0;line-height:0;border-radius:3px">&nbsp;</td></tr></table>
<div style="margin-top:9px;${YAZI};font-size:12px;line-height:1.3;${simdiki ? `font-weight:bold;color:${R.yazi}` : tamam ? `color:${R.altinKoyu}` : `color:#A39A8C`}">${tamam && !simdiki ? '&#10003; ' : ''}${ad}</div></td>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 4px"><tr>${hucre}</tr></table>`;
}

/** Fotoğraflı ürün satırları + indirimler + toplam */
function urunTablosu(s: Siparis, site: SiteAyarlari, gorsel?: GorselBul): string {
  const kalemler = s.kalemler.map((k) => {
    const g = gorsel?.(k.id);
    const foto = g
      ? `<td width="68" valign="top" style="padding:14px 14px 14px 0"><img src="${kacis(mutlak(site, g))}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;border-radius:10px;border:1px solid ${R.cizgi};object-fit:cover;background:#F6F3EE"></td>`
      : `<td width="68" valign="top" style="padding:14px 14px 14px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="64" height="64" bgcolor="${R.altinAcik}" align="center" style="width:64px;height:64px;border-radius:10px;${SERIF};font-size:22px;color:${R.altin}">&#9670;</td></tr></table></td>`;
    const eski = k.oncekiBirim && k.oncekiBirim > k.birimFiyat ? `<br><s style="color:#A39A8C;font-size:12px;font-weight:normal">${kacis(formatTL(k.oncekiBirim * k.adet))}</s>` : '';
    return `<tr>${foto}
<td valign="top" style="padding:14px 0;border-bottom:1px solid ${R.cizgi};${YAZI};font-size:14px;line-height:1.45;color:${R.yazi}"><strong>${kacis(k.ad)}</strong><br>
<span style="color:${R.soluk};font-size:13px">Adet: ${k.adet}${k.icerik ? ' · ' + kacis(k.icerik) : ''}</span></td>
<td valign="top" align="right" style="padding:14px 0 14px 12px;border-bottom:1px solid ${R.cizgi};${YAZI};font-size:14px;font-weight:bold;white-space:nowrap;color:${R.yazi}">${kacis(formatTL(k.toplam))}${eski}</td></tr>`;
  }).join('');
  const satir = (sol: string, sag: string, renk = R.yazi) =>
    `<tr><td style="padding:5px 0;${YAZI};font-size:14px;color:${R.soluk}">${sol}</td><td align="right" style="padding:5px 0;${YAZI};font-size:14px;white-space:nowrap;color:${renk}">${sag}</td></tr>`;
  // Satır toplamları indirimli tutardır. Panel ve sipariş sayfasıyla aynı hesap:
  // Ürünler (liste fiyatı) = urunlerToplami + kampanyaIndirimi; ardından tüm indirimler düşülür.
  const ozet = [
    satir(indirimVar(s) ? 'Ürünler (liste fiyatı)' : 'Ürünler', kacis(formatTL(s.urunlerToplami + s.kampanyaIndirimi))),
    s.kampanyaIndirimi ? satir('Kampanya indirimi', `&minus;${kacis(formatTL(s.kampanyaIndirimi))}`, R.yesil) : '',
    s.setIndirimi ? satir('Set indirimi', `&minus;${kacis(formatTL(s.setIndirimi))}`, R.yesil) : '',
    s.sepetIndirimi ? satir('Sepette indirim', `&minus;${kacis(formatTL(s.sepetIndirimi))}`, R.yesil) : '',
    satir('Kargo', s.kargo ? kacis(formatTL(s.kargo)) : '<strong>Ücretsiz</strong>', s.kargo ? R.yazi : R.yesil),
  ].join('');
  const toplam = `<tr><td colspan="2" style="padding:12px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="border-top:1px solid ${R.cizgi};padding-top:14px;${YAZI};font-size:15px;font-weight:bold;color:${R.yazi}">Toplam${indirimVar(s) ? `<br><span style="font-size:12px;font-weight:normal;color:${R.yesil}">${kacis(formatTL(s.kampanyaIndirimi + s.setIndirimi + s.sepetIndirimi))} tasarruf ettiniz</span>` : ''}</td>
<td align="right" style="border-top:1px solid ${R.cizgi};padding-top:14px;${SERIF};font-size:24px;font-weight:bold;color:${R.yazi};white-space:nowrap">${kacis(formatTL(s.toplam))}</td></tr></table></td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${kalemler}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px">${ozet}${toplam}</table>`;
}

const indirimVar = (s: Siparis) => s.kampanyaIndirimi + s.setIndirimi + s.sepetIndirimi > 0;

const adresMetni = (s: Siparis) =>
  `<strong>${kacis(s.musteri.ad)} ${kacis(s.musteri.soyad)}</strong><br>${kacis(s.teslimat.adres)}<br>${kacis(s.teslimat.ilce)} / ${kacis(s.teslimat.il)}<br><span style="color:${R.soluk}">${kacis(s.musteri.tel)}</span>`;

/** Güven satırı: yalnız her siparişte doğru olan bilgiler */
const guvenSatiri = () => {
  const hucre = (ikon: string, metin: string) => `<td width="33%" align="center" valign="top" style="padding:0 6px;${YAZI};font-size:12px;line-height:1.4;color:${R.soluk}">
<div style="${SERIF};font-size:18px;color:${R.altin};margin-bottom:4px">${ikon}</div>${metin}</td>`;
  return `<tr><td bgcolor="${R.kart}" style="padding:20px 18px;border-top:1px solid ${R.cizgi}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${hucre('&#10022;', 'Orijinal ürün')}${hucre('&#9993;', 'Özenle paketlenir')}${hucre('&#9742;', 'Satış sonrası destek')}</tr></table></td></tr>`;
};

/** Ortak çerçeve: koyu başlık + altın logo, beyaz kart, alt bilgi */
function cerceve(site: SiteAyarlari, o: { onYazi: string; ust?: string; baslik: string; icerik: string; ek?: string; altNot?: string; guven?: boolean }): string {
  const url = kok(site);
  const wa = `https://wa.me/${site.whatsapp}`;
  return `<!doctype html>
<html lang="tr" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${kacis(o.baslik)}</title>
<style>@media only screen and (max-width:620px){.kap{padding:12px 8px!important}.ic{padding:28px 20px 26px!important}.bas{font-size:25px!important}}a{color:${R.altinKoyu}}</style></head>
<body style="margin:0;padding:0;background:${R.zemin};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${R.zemin}">${kacis(o.onYazi)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${R.zemin}"><tr><td align="center" class="kap" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td align="center" bgcolor="${R.koyu}" style="border-radius:18px 18px 0 0;padding:26px 20px 20px;background:${R.koyu};background-image:linear-gradient(180deg,${R.koyu2},${R.koyu})">
<a href="${kacis(url)}" target="_blank"><img src="${kacis(url)}/img/logo/eposta-logo.png" width="104" alt="${kacis(site.ad)}" style="display:block;width:104px;max-width:104px;height:auto;border:0;${SERIF};font-size:22px;color:${R.altin}"></a>
</td></tr>
<tr><td height="3" bgcolor="${R.altin}" style="font-size:0;line-height:0;height:3px;background:${R.altin};background-image:linear-gradient(90deg,#8A6416,#E6C773,#8A6416)">&nbsp;</td></tr>
<tr><td bgcolor="${R.kart}" class="ic" style="padding:36px 36px 32px">
${o.ust ? `<p style="margin:0 0 8px;${YAZI};font-size:11px;font-weight:bold;letter-spacing:2.5px;text-transform:uppercase;color:${R.altinKoyu}">${kacis(o.ust)}</p>` : ''}
<h1 class="bas" style="margin:0 0 16px;${SERIF};font-size:30px;line-height:1.2;font-weight:normal;color:${R.yazi}">${kacis(o.baslik)}</h1>
<div style="${YAZI};font-size:15px;line-height:1.7;color:${R.yazi}">${o.icerik}</div>
</td></tr>
${o.guven === false ? '' : guvenSatiri()}
<tr><td bgcolor="${R.kart}" style="border-radius:0 0 18px 18px;font-size:0;line-height:0;height:8px">&nbsp;</td></tr>
${o.ek ? `<tr><td style="height:16px"></td></tr><tr><td bgcolor="${R.kart}" style="border-radius:18px;padding:26px 30px;${YAZI};font-size:12px;line-height:1.55;color:${R.yazi}">${o.ek}</td></tr>` : ''}
<tr><td align="center" style="padding:28px 16px 6px;${YAZI};font-size:13px;line-height:1.8;color:${R.soluk}">
<strong style="color:${R.yazi}">Yardıma mı ihtiyacınız var?</strong><br>
Bu e-postayı yanıtlayın ya da <a href="${kacis(wa)}" style="color:${R.altinKoyu};font-weight:bold;text-decoration:none;white-space:nowrap">WhatsApp ${kacis(site.telefonGorunen)}</a> üzerinden yazın.
${site.calismaSaatleri ? `<br><span style="font-size:12px">${kacis(site.calismaSaatleri)}</span>` : ''}
</td></tr>
<tr><td align="center" style="padding:14px 16px 4px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="40" height="1" bgcolor="${R.altin}" style="font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>
<tr><td align="center" style="padding:10px 16px 0;${SERIF};font-size:14px;letter-spacing:2px;color:${R.altinKoyu}"><a href="${kacis(url)}" style="color:${R.altinKoyu};text-decoration:none">${kacis(site.ad.toLocaleUpperCase('tr'))}</a></td></tr>
<tr><td align="center" style="padding:6px 16px 0;${YAZI};font-size:12px;line-height:1.6;color:#9A9184">
<a href="${kacis(url)}" style="color:#9A9184;text-decoration:none">${kacis(url.replace(/^https?:\/\//, ''))}</a>${o.altNot ? `<br>${o.altNot}` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

const satirlarMetin = (s: Siparis) => [
  ...s.kalemler.map((k) => `• ${k.adet} × ${k.ad} — ${formatTL(k.toplam)}`),
  indirimVar(s) ? `Ürünler (liste fiyatı): ${formatTL(s.urunlerToplami + s.kampanyaIndirimi)}` : '',
  s.kampanyaIndirimi ? `Kampanya indirimi: −${formatTL(s.kampanyaIndirimi)}` : '',
  s.setIndirimi ? `Set indirimi: −${formatTL(s.setIndirimi)}` : '',
  s.sepetIndirimi ? `Sepette indirim: −${formatTL(s.sepetIndirimi)}` : '',
  `Kargo: ${s.kargo ? formatTL(s.kargo) : 'Ücretsiz'}`,
  `Toplam: ${formatTL(s.toplam)}`,
].filter(Boolean).join('\n');

const imza = (site: SiteAyarlari) => `\n\nSorunuz olursa bu e-postayı yanıtlayabilir ya da WhatsApp'tan yazabilirsiniz: ${site.telefonGorunen}\n${site.ad} · ${kok(site)}`;
const altNot = (s: Siparis) => `Bu e-posta ${kacis(s.no)} numaralı siparişiniz için gönderilmiştir.`;

/* ───────────────────────── Müşteri: Sipariş alındı ───────────────────────── */
export function siparisAlindiEpostasi(
  s: Siparis, site: SiteAyarlari, takipUrl: string,
  belgeler?: { onBilgilendirme: string; mesafeliSatis: string; baglanti: string },
  gorsel?: GorselBul,
): Eposta {
  const odemeBekliyor = s.durum === 'odeme-bekliyor';
  // Kartlı ödeme kapalıyken (PayTR kaydı yok) ödeme için mağaza müşteriye ulaşır
  const durumNotu = odemeBekliyor
    ? s.paytr
      ? 'Ödemeniz onaylandığında siparişiniz hemen hazırlanmaya başlar; kargoya verildiğinde takip numarasıyla size ayrıca yazacağız.'
      : 'Ödeme için kısa süre içinde sizinle iletişime geçeceğiz. Ödemeniz onaylanınca siparişiniz hemen hazırlanır; kargoya verildiğinde takip numarasıyla size ayrıca yazacağız.'
    : 'Ödemeniz başarıyla alındı. Siparişinizi özenle hazırlıyoruz; kargoya verildiğinde takip numarasıyla size ayrıca yazacağız.';
  const rozet = odemeBekliyor
    ? `<span style="display:inline-block;padding:5px 12px;border-radius:999px;background:#FFF4E0;color:#9A5B00;font-weight:bold;font-size:12px">Ödeme bekleniyor</span>`
    : `<span style="display:inline-block;padding:5px 12px;border-radius:999px;background:${R.yesilAcik};color:${R.yesil};font-weight:bold;font-size:12px">&#10003; Ödendi</span>`;
  const icerik = `<p style="margin:0 0 8px">Merhaba ${kacis(s.musteri.ad)},</p>
<p style="margin:0">Al Lulu Home'u tercih ettiğiniz için teşekkür ederiz. ${durumNotu}</p>
${adimCubugu(s)}
${siparisKarti(s, rozet)}
${baslikSatiri('Sipariş özeti')}${urunTablosu(s, site, gorsel)}
${baslikSatiri('Teslimat adresi')}<p style="margin:10px 0 0;font-size:14px;line-height:1.65">${adresMetni(s)}</p>
${buton('Siparişimi Takip Et', takipUrl)}
${belgeler ? sozlesmeKutusu(belgeler.baglanti) : ''}`;
  return {
    // Sözleşmeler ayrı e-postayla gitmez: sitedeki sayfaya bağlantı + kayıt için küçük bir ek dosya
    // (e-posta eki "kalıcı veri saklayıcısı"dır; site bağlantısı tek başına sayılmaz)
    ...(belgeler ? { ekler: [{ dosyaAdi: `Sozlesmeler-${s.no}.html`, icerik: sozlesmelerEpostasi(s, site, belgeler).html, tur: 'text/html' }] } : {}),
    konu: `Siparişiniz alındı — ${s.no}`,
    html: cerceve(site, {
      onYazi: `${s.no} numaralı siparişiniz alındı. Toplam ${formatTL(s.toplam)}.`,
      ust: 'Sipariş onayı', baslik: 'Teşekkürler, siparişiniz alındı', icerik, altNot: altNot(s),
    }),
    metin: `Merhaba ${s.musteri.ad},\n\n${s.no} numaralı siparişiniz alındı. ${durumNotu}\n\n${satirlarMetin(s)}\n\nTeslimat: ${s.teslimat.adres}, ${s.teslimat.ilce} / ${s.teslimat.il}\n\nSiparişinizi takip edin: ${takipUrl}${belgeler ? `\n\nSözleşmeleriniz (Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi): ${belgeler.baglanti}` : ''}${imza(site)}`,
  };
}

/** Sipariş e-postasının altında tek satırlık, küçük "Sözleşmeleriniz" bağlantısı (sitedeki sayfayı açar) */
function sozlesmeKutusu(baglanti: string): string {
  return `<p style="margin:26px 0 0;${YAZI};font-size:12.5px;line-height:1.6;color:${R.soluk};text-align:center"><a href="${kacis(baglanti)}" target="_blank" style="color:${R.altinKoyu};font-weight:bold;text-decoration:none">Sözleşmeleriniz&nbsp;&rarr;</a></p>`;
}

/* ───────────────────────── Müşteri: Sözleşmeler ───────────────────────── */
/**
 * Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi'nin onaylanan hâli, ayrı bir e-postayla.
 * E-posta "kalıcı veri saklayıcısı"dır (Mesafeli Sözleşmeler Yön. m.4/c); tam metin burada kalır,
 * sipariş onayı ise kısa ve okunaklı olur.
 */
export function sozlesmelerEpostasi(
  s: Siparis, site: SiteAyarlari,
  belgeler: { onBilgilendirme: string; mesafeliSatis: string; baglanti: string },
): Eposta {
  const belge = (sira: string, baslik: string, govde: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:34px 0 0"><tr>
<td style="padding:0 0 12px;border-bottom:2px solid ${R.altin}">
<p style="margin:0 0 4px;${YAZI};font-size:11px;font-weight:bold;letter-spacing:2px;color:${R.altinKoyu}">BELGE ${sira}</p>
<h2 style="margin:0;${SERIF};font-size:22px;line-height:1.25;font-weight:normal;color:${R.yazi}">${baslik}</h2></td></tr></table>
<div style="${YAZI};font-size:13px;line-height:1.7;color:#3A352D">${belgeyiBicimle(govde)}</div>`;
  const icindekiler = (sira: string, ad: string) => `<tr><td width="28" valign="top" style="${SERIF};font-size:15px;line-height:24px;color:${R.altin}">${sira}</td><td style="${YAZI};font-size:14px;line-height:24px;color:${R.yazi}">${ad}</td></tr>`;
  const icerik = `<p style="margin:0 0 8px">Merhaba ${kacis(s.musteri.ad)},</p>
<p style="margin:0">Siparişinizi verirken onayladığınız sözleşmeler aşağıdadır. Herhangi bir işlem yapmanız gerekmiyor; bu belgeyi kayıtlarınız için saklamanızı öneririz.</p>
${kutu(`<table role="presentation" cellpadding="0" cellspacing="0" border="0">${icindekiler('1', 'Ön Bilgilendirme Formu')}${icindekiler('2', 'Mesafeli Satış Sözleşmesi')}</table>
<p style="margin:10px 0 0;font-size:12.5px;color:${R.soluk}">Sipariş no <strong style="color:${R.yazi}">${kacis(s.no)}</strong> · ${kacis(tarihYaz(s.tarih))}</p>`)}
${buton('Sözleşmeleri Web\'de Aç', belgeler.baglanti, R.altinAcik, R.altinKoyu)}
${belge('1', 'Ön Bilgilendirme Formu', belgeler.onBilgilendirme)}
${belge('2', 'Mesafeli Satış Sözleşmesi', belgeler.mesafeliSatis)}`;
  return {
    konu: `Sözleşmeleriniz — ${s.no}`,
    html: cerceve(site, {
      onYazi: `${s.no} numaralı siparişinizin Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi.`,
      ust: 'Kayıtlarınız için', baslik: 'Onayladığınız sözleşmeler', icerik, altNot: altNot(s), guven: false,
    }),
    metin: `Merhaba ${s.musteri.ad},\n\n${s.no} numaralı siparişinizi verirken onayladığınız sözleşmeler aşağıdadır. Web'de görüntülemek için: ${belgeler.baglanti}\n\n` +
      `=== 1. ÖN BİLGİLENDİRME FORMU ===\n\n${htmldenMetin(belgeler.onBilgilendirme)}\n\n=== 2. MESAFELİ SATIŞ SÖZLEŞMESİ ===\n\n${htmldenMetin(belgeler.mesafeliSatis)}${imza(site)}`,
  };
}

/**
 * Sözleşme HTML'i (lib/yasal.ts, sitedeki CSS sınıflarıyla) e-posta programları için satır içi stile çevrilir:
 * başlıklar, paragraflar, listeler, tanım listeleri (tabloya) ve ürün tablosu. Metnin kendisine dokunulmaz.
 */
function belgeyiBicimle(html: string): string {
  const td = `padding:7px 10px;border-bottom:1px solid ${R.cizgi};vertical-align:top;font-size:12.5px;line-height:1.5`;
  return html
    .replace(/<p class="belge-ust">/g, `<p style="margin:12px 0 14px;font-size:12px;color:${R.soluk}">`)
    .replace(/<p>/g, `<p style="margin:0 0 11px">`)
    .replace(/<h2>/g, `<h3 style="margin:24px 0 8px;${SERIF};font-size:16px;font-weight:bold;color:${R.yazi}">`).replace(/<\/h2>/g, '</h3>')
    .replace(/<h3>/g, `<h4 style="margin:16px 0 6px;${YAZI};font-size:13px;font-weight:bold;color:${R.yazi}">`).replace(/<\/h3>/g, '</h4>')
    .replace(/<(ul|ol)( [^>]*)?>/g, `<$1 style="margin:0 0 12px;padding-left:20px">`)
    .replace(/<li>/g, `<li style="margin:0 0 5px">`)
    .replace(/<dl[^>]*>/g, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 14px;border-top:1px solid ${R.cizgi}">`)
    .replace(/<\/dl>/g, '</table>')
    .replace(/<dt>/g, `<tr><td width="34%" style="${td};color:${R.soluk}">`).replace(/<\/dt>/g, '</td>')
    .replace(/<dd>/g, `<td style="${td};color:${R.yazi}">`).replace(/<\/dd>/g, '</td></tr>')
    .replace(/<mark[^>]*>/g, `<span style="background:#FFF4D6;color:#8A5A00;padding:1px 5px;border-radius:4px">`).replace(/<\/mark>/g, '</span>')
    .replace(/<div class="belge-tablo-kap">/g, '<div>')
    .replace(/<table class="belge-tablo">/g, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 14px;border-collapse:collapse">`)
    .replace(/<(td|th)([^>]*)>/g, (_t, ad: string, oz: string) =>
      `<${ad}${oz.replace(/ class="[^"]*"/, '')} style="padding:8px 8px;border-bottom:1px solid ${R.cizgi};font-size:12.5px;line-height:1.45;vertical-align:top;${/sayi/.test(oz) ? 'text-align:right;white-space:nowrap;' : 'text-align:left;'}${ad === 'th' ? `font-weight:bold;color:${R.yazi};background:#FAF7F1;` : ''}">`);
}

/** Düz metin sürümü (HTML göstermeyen e-posta programları için) */
function htmldenMetin(html: string): string {
  return html
    .replace(/<\/(p|h2|h3|li|tr|dd|table)>/g, '\n').replace(/<br\s*\/?>/g, '\n').replace(/<\/(dt|td|th)>/g, ': ').replace(/<li[^>]*>/g, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n /g, '\n').replace(/: \n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ───────────────────────── Müşteri: Durum değişti ───────────────────────── */
/** Hangi durumlarda müşteriye e-posta gider? (Hazırlanıyor gereksiz e-posta olmasın diye gönderilmez.) */
export const EPOSTA_GIDEN_DURUMLAR = ['odendi', 'kargoda', 'teslim-edildi', 'iptal'] as const;

export function durumEpostasi(s: Siparis, site: SiteAyarlari, takipUrl: string, gorsel?: GorselBul): Eposta | undefined {
  const ad = kacis(s.musteri.ad);
  const takipButonu = buton('Siparişimi Görüntüle', takipUrl);
  const kucukTakip = `<p style="margin:12px 0 0;text-align:center;font-size:13px"><a href="${kacis(takipUrl)}" style="color:${R.altinKoyu}">Sipariş detaylarını görüntüle</a></p>`;
  const no = `<strong>${kacis(s.no)}</strong>`;

  if (s.durum === 'kargoda') {
    const kargo = siparisKargoBaglantisi(s, site.kargo);
    const firma = s.kargoFirma || site.kargo.firma;
    const icerik = `<p style="margin:0 0 8px">Merhaba ${ad},</p>
<p style="margin:0">Güzel haber! ${no} numaralı siparişiniz özenle paketlendi ve kargoya teslim edildi.</p>
${adimCubugu(s)}
${kutu(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="${YAZI};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${R.soluk};padding-bottom:4px">Kargo firması</td><td style="${YAZI};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${R.soluk};padding-bottom:4px">Takip numarası</td></tr>
<tr><td style="${YAZI};font-size:16px;font-weight:bold;color:${R.yazi}">${kacis(firma)}</td><td style="${SERIF};font-size:18px;font-weight:bold;color:${R.yazi};letter-spacing:.5px">${kacis(s.kargoTakip ?? '—')}</td></tr></table>`, R.yesilAcik, '#CDEBD8')}
<p style="margin:0">Kargonuz genellikle 1–3 iş günü içinde adresinize ulaşır. Teslim alırken paketin hasarsız olduğunu kontrol etmenizi öneririz; hasar varsa kargo görevlisine tutanak tutturun.</p>
${kargo ? buton('Kargomu Takip Et', kargo.url, R.yesil) + kucukTakip : takipButonu}
${baslikSatiri('Gönderilen ürünler')}${urunTablosu(s, site, gorsel)}`;
    return {
      konu: `Siparişiniz kargoya verildi — ${s.no}`,
      html: cerceve(site, { onYazi: `${firma} takip numaranız: ${s.kargoTakip ?? ''}`, ust: 'Kargoya verildi', baslik: 'Siparişiniz yola çıktı', icerik, altNot: altNot(s) }),
      metin: `Merhaba ${s.musteri.ad},\n\n${s.no} numaralı siparişiniz kargoya verildi.\nKargo firması: ${firma}\nTakip numarası: ${s.kargoTakip ?? '—'}\n${kargo ? `Kargo takibi: ${kargo.url}\n` : ''}Sipariş detayı: ${takipUrl}${imza(site)}`,
    };
  }

  if (s.durum === 'teslim-edildi') {
    const icerik = `<p style="margin:0 0 8px">Merhaba ${ad},</p>
<p style="margin:0">${no} numaralı siparişiniz teslim edildi. Ürününüzü güzel günlerde, afiyetle kullanmanızı dileriz.</p>
${adimCubugu(s)}
${kutu(`<strong style="${SERIF};font-size:16px;font-weight:normal">Küçük bir hatırlatma</strong><br>Faturanızı ve garanti belgenizi saklamanızı öneririz. Ürünle ilgili herhangi bir sorunuz olursa bu e-postayı yanıtlamanız yeterli; size hemen yardımcı oluruz.`)}
<p style="margin:22px 0 0;text-align:center">Ürünü biraz kullandıktan sonra görüşünüzü paylaşır mısınız? Yorumunuz diğer müşterilere yol gösterir.</p>
${buton('Ürünü Değerlendir ★', takipUrl + '#degerlendir')}`;
    return {
      konu: `Siparişiniz teslim edildi — ${s.no}`,
      html: cerceve(site, { onYazi: 'Siparişiniz teslim edildi. Bizi tercih ettiğiniz için teşekkürler.', ust: 'Teslim edildi', baslik: 'Afiyetle kullanın', icerik, altNot: altNot(s) }),
      metin: `Merhaba ${s.musteri.ad},\n\n${s.no} numaralı siparişiniz teslim edildi. Faturanızı ve garanti belgenizi saklamanızı öneririz.\nÜrünü değerlendirmek için: ${takipUrl}#degerlendir${imza(site)}`,
    };
  }

  if (s.durum === 'odendi') {
    const icerik = `<p style="margin:0 0 8px">Merhaba ${ad},</p>
<p style="margin:0">${no} numaralı siparişinizin ödemesi onaylandı. Siparişinizi hazırlamaya başlıyoruz; kargoya verildiğinde takip numarasını size e-postayla ileteceğiz.</p>
${adimCubugu(s)}
${baslikSatiri('Sipariş özeti')}${urunTablosu(s, site, gorsel)}${takipButonu}`;
    return {
      konu: `Ödemeniz onaylandı — ${s.no}`,
      html: cerceve(site, { onYazi: 'Ödemeniz onaylandı, siparişiniz hazırlanıyor.', ust: 'Ödeme onayı', baslik: 'Ödemeniz onaylandı', icerik, altNot: altNot(s) }),
      metin: `Merhaba ${s.musteri.ad},\n\n${s.no} numaralı siparişinizin ödemesi onaylandı; siparişiniz hazırlanıyor.\n\n${satirlarMetin(s)}\n\nSipariş detayı: ${takipUrl}${imza(site)}`,
    };
  }

  if (s.durum === 'iptal') {
    const odenmisti = !!s.paytr && s.paytr.sonuc === 'odendi' || s.gecmis.some((g) => g.durum === 'odendi');
    const iade = odenmisti ? 'Ödediğiniz tutar, ödeme yaptığınız karta/hesaba iade edilmiştir. Tutarın hesabınıza yansıma süresi bankanıza göre birkaç iş günü sürebilir.' : '';
    const icerik = `<p style="margin:0 0 8px">Merhaba ${ad},</p>
<p style="margin:0">${no} numaralı siparişiniz iptal edildi.${iade ? ' ' + iade : ''}</p>
${s.iptalNotu ? kutu(`<span style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${R.soluk}">Açıklama</span><br>${kacis(s.iptalNotu)}`, R.kirmiziAcik, '#F2D3CF') : ''}
<p style="margin:16px 0 0">Bir yanlışlık olduğunu düşünüyorsanız bu e-postayı yanıtlayın; hemen ilgilenelim.</p>${takipButonu}`;
    return {
      konu: `Siparişiniz iptal edildi — ${s.no}`,
      html: cerceve(site, { onYazi: `${s.no} numaralı siparişiniz iptal edildi.`, ust: 'Sipariş iptali', baslik: 'Siparişiniz iptal edildi', icerik, altNot: altNot(s), guven: false }),
      metin: `Merhaba ${s.musteri.ad},\n\n${s.no} numaralı siparişiniz iptal edildi. ${iade}${s.iptalNotu ? `\nAçıklama: ${s.iptalNotu}` : ''}\nSipariş detayı: ${takipUrl}${imza(site)}`,
    };
  }
  return undefined;
}

/* ───────────────────────── Mağaza: Yeni sipariş ───────────────────────── */
export function yeniSiparisEpostasi(s: Siparis, site: SiteAyarlari, gorsel?: GorselBul): Eposta {
  const panel = `${kok(site)}/yonetim/siparisler/${encodeURIComponent(s.no)}`;
  const odendi = s.paytr?.sonuc === 'odendi';
  const odeme = s.paytr ? (odendi ? 'Kartla ödendi' : 'Kart ödemesi bekleniyor') : 'Ödeme bekleniyor (manuel onay)';
  const fatura = s.fatura.tip === 'kurumsal'
    ? `Kurumsal: ${kacis(s.fatura.firma)} · VD ${kacis(s.fatura.vd)} · VKN ${kacis(s.fatura.vno)}${s.fatura.adres ? `<br>${kacis(s.fatura.adres)}` : ''}` : 'Bireysel';
  const rozet = `<span style="display:inline-block;padding:5px 12px;border-radius:999px;background:${odendi ? R.yesilAcik : '#FFF4E0'};color:${odendi ? R.yesil : '#9A5B00'};font-weight:bold;font-size:12px">${kacis(odeme)}</span>
<div style="margin-top:8px;${SERIF};font-size:22px;font-weight:bold;color:${R.yazi}">${kacis(formatTL(s.toplam))}</div>`;
  const icerik = `${siparisKarti(s, rozet)}
${baslikSatiri('Müşteri ve teslimat')}<p style="margin:10px 0 0;font-size:14px;line-height:1.65">${adresMetni(s)}${s.musteri.eposta ? `<br><span style="color:${R.soluk}">${kacis(s.musteri.eposta)}</span>` : ''}</p>
${s.teslimat.not ? kutu(`<strong>Müşteri notu:</strong> ${kacis(s.teslimat.not)}`) : ''}
${baslikSatiri('Fatura')}<p style="margin:10px 0 0;font-size:14px">${fatura}</p>
${baslikSatiri('Ürünler')}${urunTablosu(s, site, gorsel)}
${buton('Panelde Aç', panel, R.altinKoyu)}
<p style="margin:10px 0 0;text-align:center;font-size:12px;color:${R.soluk}">Bu e-postayı yanıtlarsanız doğrudan müşteriye gider.</p>`;
  return {
    konu: `Yeni sipariş: ${s.no} — ${formatTL(s.toplam)} (${s.musteri.ad} ${s.musteri.soyad})`,
    html: cerceve(site, { onYazi: `${s.musteri.ad} ${s.musteri.soyad} · ${s.teslimat.il} · ${formatTL(s.toplam)}`, ust: 'Mağaza bildirimi', baslik: 'Yeni sipariş geldi', icerik, guven: false }),
    metin: `Yeni sipariş: ${s.no}\n${odeme}\n\n${s.musteri.ad} ${s.musteri.soyad} · ${s.musteri.tel}${s.musteri.eposta ? ' · ' + s.musteri.eposta : ''}\n${s.teslimat.adres} ${s.teslimat.ilce} / ${s.teslimat.il}${s.teslimat.not ? `\nNot: ${s.teslimat.not}` : ''}\n\n${satirlarMetin(s)}\n\nPanel: ${panel}`,
  };
}
