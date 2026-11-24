/**
 * Yasal metinler — tek kaynak.
 * Sunucuda (yasal sayfalar, sipariş kaydı, e-posta) ve tarayıcıda (ödeme adımındaki pencere) aynı metin üretilir.
 *
 * Dayanak: 6502 sayılı Tüketicinin Korunması Hakkında Kanun, Mesafeli Sözleşmeler Yönetmeliği
 * (RG 27.11.2014/29188; 23.08.2022/31932 ve 24.05.2025/32909 değişiklikleri dahil — sonuncusu 01.01.2026'da yürürlüğe girdi),
 * 6698 sayılı KVKK. Satıcı lehine düzenlemeler yalnızca bu mevzuatın izin verdiği ölçüdedir; kanuna aykırı
 * (tüketici aleyhine) hükümler zaten geçersiz sayılır ve idari para cezasına yol açar.
 *
 * ÖNEMLİ: Metinler yayına almadan önce bir avukat tarafından kontrol edilmelidir.
 */
import { formatTL, YASAL_INDIRIM_GUN } from './fiyat';

export const SOZLESME_SURUMU = '2026-11-18';

export interface YasalSite {
  ad: string;
  url: string;
  eposta: string;
  telefonGorunen: string;
  calismaSaatleri?: string;
  satici: { unvan: string; adres: string; mersis: string; vergiDairesiNo: string; kep: string; etbis: string };
  kargo: { firma: string; ucret: number; ucretsizEsik: number; kesimSaati: number; teslimGun: [number, number] };
  iadeGun: number;
}

export interface YasalSatir {
  ad: string;
  sku?: string;
  icerik?: string;
  adet: number;
  birimFiyat: number;
  indirim: number;
  toplam: number;
}

export interface YasalSiparis {
  no?: string;
  tarih?: string;
  alici: { adSoyad: string; tel: string; eposta?: string; adres: string };
  fatura: { tip: 'bireysel' | 'kurumsal'; firma?: string; vd?: string; vno?: string; adres?: string };
  satirlar: YasalSatir[];
  urunlerToplami: number;
  setIndirimi: number;
  sepetIndirimi: number;
  kargo: number;
  toplam: number;
}

/** Site ayarlarından yalnızca yasal metinlerin ihtiyaç duyduğu alanlar (sayfaya gömmek için) */
export function yasalSite(s: YasalSite): YasalSite {
  return {
    ad: s.ad, url: s.url, eposta: s.eposta, telefonGorunen: s.telefonGorunen, calismaSaatleri: s.calismaSaatleri,
    satici: { ...s.satici },
    kargo: { firma: s.kargo.firma, ucret: s.kargo.ucret, ucretsizEsik: s.kargo.ucretsizEsik, kesimSaati: s.kargo.kesimSaati, teslimGun: s.kargo.teslimGun },
    iadeGun: s.iadeGun,
  };
}

/* ---------------- yardımcılar ---------------- */
const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const bos = (v?: string) => !v || !v.trim() || /^\[.*\]$/.test(v.trim()) || /^[—-]+$/.test(v.trim());

/** Satıcı bilgisi panelde boşsa metinde hiç görünmez (yer tutucu yazılmaz); unvan yerine mağaza adı kullanılır */
const saticiAdi = (s: YasalSite) => (bos(s.satici.unvan) ? esc(s.ad) : esc(s.satici.unvan));
const satir = (etiket: string, v?: string) => (bos(v) ? '' : `<dt>${etiket}</dt><dd>${esc(v)}</dd>`);

const tarihMetni = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'long', timeStyle: 'short' }) : '';

const yer = (metin: string) => `<mark class="yer">${esc(metin)}</mark>`;

function saticiBlok(s: YasalSite): string {
  const st = s.satici;
  return `<dl class="belge-dl">
    ${bos(st.unvan) ? `<dt>Satıcı</dt><dd>${esc(s.ad)}</dd>` : satir('Ticari unvan', st.unvan)}
    ${satir('Adres', st.adres)}
    ${satir('MERSİS no', st.mersis)}
    ${satir('Vergi dairesi / no', st.vergiDairesiNo)}
    <dt>İletişim</dt><dd>WhatsApp Destek Hattı${s.calismaSaatleri ? ` (${esc(s.calismaSaatleri)})` : ''}</dd>
    <dt>E-posta</dt><dd>${esc(s.eposta)}</dd>
    ${bos(st.kep) ? '' : `<dt>KEP adresi</dt><dd>${esc(st.kep)}</dd>`}
    <dt>İnternet sitesi</dt><dd>${esc(s.url.replace(/^https?:\/\//, ''))}</dd>
  </dl>`;
}

function aliciBlok(sip?: YasalSiparis): string {
  if (!sip) return `<p>${yer('Alıcının adı soyadı, adresi, telefonu ve e-postası sipariş sırasında girilen bilgilerle doldurulur.')}</p>`;
  const a = sip.alici;
  const f = sip.fatura;
  return `<dl class="belge-dl">
    <dt>Ad soyad</dt><dd>${esc(a.adSoyad)}</dd>
    <dt>Teslimat adresi</dt><dd>${esc(a.adres)}</dd>
    <dt>Telefon</dt><dd>${esc(a.tel)}</dd>
    <dt>E-posta</dt><dd>${a.eposta ? esc(a.eposta) : '—'}</dd>
    <dt>Fatura</dt><dd>${f.tip === 'kurumsal' ? `Kurumsal · ${esc(f.firma)} · ${esc(f.vd)} / ${esc(f.vno)}` : 'Bireysel'}${f.adres ? ` · ${esc(f.adres)}` : ' · teslimat adresiyle aynı'}</dd>
  </dl>`;
}

function urunTablosu(sip?: YasalSiparis): string {
  if (!sip) {
    return `<p>${yer('Sipariş edilen ürünlerin adı, model kodu, adedi, birim ve toplam satış fiyatı (KDV dahil), indirimler ve kargo ücreti sipariş sırasında bu bölüme eklenir.')}</p>`;
  }
  const satirlar = sip.satirlar.map((r) => `<tr>
      <td>${esc(r.ad)}${r.sku ? `<br><small>Model: ${esc(r.sku)}</small>` : ''}${r.icerik ? `<br><small>İçerik: ${esc(r.icerik)}</small>` : ''}</td>
      <td class="sayi">${r.adet}</td>
      <td class="sayi">${formatTL(r.birimFiyat)}</td>
      <td class="sayi">${r.indirim ? '−' + formatTL(r.indirim) : '—'}</td>
      <td class="sayi">${formatTL(r.toplam)}</td>
    </tr>`).join('');
  return `<div class="belge-tablo-kap"><table class="belge-tablo">
    <thead><tr><th>Ürün</th><th class="sayi">Adet</th><th class="sayi">Birim fiyat</th><th class="sayi">İndirim</th><th class="sayi">Tutar</th></tr></thead>
    <tbody>${satirlar}</tbody>
    <tfoot>
      ${sip.setIndirimi ? `<tr><td colspan="4">Set indirimi (fiyatlara yansıtılmıştır)</td><td class="sayi">−${formatTL(sip.setIndirimi)}</td></tr>` : ''}
      <tr><td colspan="4">Kargo ücreti</td><td class="sayi">${sip.kargo ? formatTL(sip.kargo) : 'Ücretsiz'}</td></tr>
      <tr><th colspan="4">Toplam (tüm vergiler dahil)</th><th class="sayi">${formatTL(sip.toplam)}</th></tr>
    </tfoot>
  </table></div>`;
}

function kargoMetni(s: YasalSite): string {
  const k = s.kargo;
  return `${formatTL(k.ucretsizEsik)} ve üzeri siparişlerde kargo ücretsizdir; bu tutarın altındaki siparişlerde kargo ücreti ${formatTL(k.ucret)}'dir ve ödeme adımında toplam tutara ayrıca eklenerek gösterilir`;
}

/* ---------------- Ortak bölümler ---------------- */

function caymaBolumu(s: YasalSite, no: string): string {
  const k = s.kargo;
  return `
  <h3>${no}.1 Cayma süresi</h3>
  <p>ALICI, ürünün kendisine veya gösterdiği adresteki kişiye teslim edildiği günden itibaren <strong>${s.iadeGun} (${s.iadeGun === 14 ? 'on dört' : s.iadeGun}) gün</strong> içinde, herhangi bir gerekçe göstermeksizin ve cezai şart ödemeksizin sözleşmeden cayabilir. ALICI bu hakkı, sözleşmenin kurulmasından ürünün teslimine kadar geçen sürede de kullanabilir. Tek siparişte ayrı ayrı teslim edilen ürünlerde süre, son ürünün teslim alındığı gün başlar. Ürünün kargo şirketine verilmesi ALICI'ya teslim sayılmaz.</p>

  <h3>${no}.2 Cayma bildirimi</h3>
  <p>Cayma bildirimi, süre dolmadan önce SATICI'ya yazılı olarak veya kalıcı veri saklayıcısı ile yapılır: <strong>${esc(s.eposta)}</strong> adresine e-posta${bos(s.satici.kep) ? '' : `, ${esc(s.satici.kep)} KEP adresi`}, Site üzerindeki WhatsApp destek hattı üzerinden yazılı mesaj veya SATICI adresine posta yoluyla. Bildirimde sipariş numarası ve ALICI'nın adı soyadı belirtilmelidir; İptal ve İade Koşulları sayfasındaki örnek cayma formu kullanılabilir. Cayma hakkının süresi içinde kullanıldığını ispat yükü ALICI'ya aittir; bu nedenle bildirimin yazılı yapılması önerilir.</p>

  <h3>${no}.3 Ürünün geri gönderilmesi ve iade kargosu</h3>
  <p>ALICI, cayma bildirimini yönelttiği tarihten itibaren <strong>14 (on dört) gün içinde</strong> ürünü SATICI'ya geri göndermekle yükümlüdür. SATICI'nın iade için belirlediği taşıyıcı <strong>${esc(k.firma)}</strong>'dır. ALICI'ya cayma bildiriminden sonra bir iade kodu iletilir; ürün bu kodla ${esc(k.firma)} şubesine teslim edildiğinde ALICI'dan iade kargo ücreti alınmaz. ALICI'nın bulunduğu yerde ${esc(k.firma)} şubesi yoksa ürün, ALICI'dan ek ücret alınmaksızın SATICI tarafından teslim alınır. ALICI'nın kendi tercihiyle SATICI'nın belirlediği taşıyıcı dışında bir kargo şirketi kullanması halinde bu gönderimin ücreti SATICI tarafından karşılanmaz ve ödeme iade süresi ürünün SATICI'ya ulaştığı tarihten itibaren başlar.</p>

  <h3>${no}.4 Ödemenin iadesi</h3>
  <p>SATICI, ürünün iade için belirlenen taşıyıcıya teslim edildiği tarihten itibaren (cayma hakkı ürün teslim edilmeden kullanılmışsa cayma bildiriminin SATICI'ya ulaştığı tarihten itibaren) en geç <strong>14 (on dört) gün içinde</strong>, teslimat masrafları dahil tahsil edilen tüm ödemeleri, ALICI'nın satın alırken kullandığı ödeme aracına uygun şekilde, tek seferde ve ALICI'ya herhangi bir masraf veya yükümlülük getirmeden iade eder. Kredi kartıyla taksitli ödemelerde iade, kartı veren bankanın uygulamasına göre ALICI'nın kartına yansır; tutarın karta yansıma süresi bankaya bağlıdır.</p>

  <h3>${no}.5 İade edilecek ürünün durumu ve değer kaybı</h3>
  <p>Ürün; kutusu, ambalajı, varsa garanti belgesi, kullanım kılavuzu, tüm parça ve aksesuarlarıyla ve kampanya kapsamında verilen hediyelerle birlikte, taşıma sırasında zarar görmeyecek şekilde paketlenerek gönderilmelidir. ALICI, cayma süresi içinde ürünü işleyişine, teknik özelliklerine ve kullanım talimatlarına uygun şekilde kullanması nedeniyle oluşan değişiklik ve bozulmalardan sorumlu değildir. Buna karşılık ürünün kullanım talimatlarına aykırı kullanılması, düşürülmesi, darbe alması, yanması, çizilmesi, eksik parça veya aksesuarla ya da özensiz paketlenerek gönderilmesi gibi ALICI'nın kusurundan kaynaklanan değer kayıplarından ALICI sorumludur; SATICI bu değer kaybını belgeleyerek ALICI'dan talep etme hakkını saklı tutar. İade gelen ürünler SATICI tarafından fotoğraflanarak kayıt altına alınır.</p>

  <h3>${no}.6 Set, kampanya ve hediye ürünler</h3>
  <p>"Birlikte Al", set veya sepette indirim gibi bir kampanyayla birlikte satın alınan ürünlerin yalnızca bir kısmı iade edilirse, kampanya koşulu ortadan kalktığından kampanya indirimi geçerliliğini yitirir. Bu durumda iade tutarı, ALICI'da kalan ürün(ler)in kampanyasız satış fiyatı ödenen toplam tutardan düşülerek hesaplanır; ALICI'dan ödediği tutarın üzerinde bir bedel istenmez. Kampanya kapsamında ücretsiz verilen hediye ürünler, ana ürünle birlikte iade edilmelidir; edilmezse hediyenin satış fiyatı iade tutarından düşülür.</p>`;
}

function istisnalarBolumu(): string {
  return `<p>Mesafeli Sözleşmeler Yönetmeliği'nin 15. maddesi uyarınca, taraflarca aksi kararlaştırılmadıkça aşağıdaki sözleşmelerde cayma hakkı kullanılamaz:</p>
  <ol class="belge-liste">
    <li>ALICI'nın istekleri veya kişisel ihtiyaçları doğrultusunda hazırlanan, kişiye özel üretilen ya da üzerinde değişiklik yapılan ürünler (ör. isim yazdırılmış veya ölçüye göre hazırlanmış ürünler),</li>
    <li>Çabuk bozulabilen veya son kullanma tarihi geçebilecek ürünler,</li>
    <li>Tesliminden sonra ambalaj, bant, mühür, paket gibi koruyucu unsurları açılmış olan ve iadesi sağlık ve hijyen açısından uygun olmayan ürünler,</li>
    <li>Tesliminden sonra başka ürünlerle karışan ve doğası gereği ayrıştırılması mümkün olmayan ürünler,</li>
    <li>Koruyucu unsurları açılmış kitap, dijital içerik ve bilgisayar sarf malzemeleri; anında ifa edilen elektronik hizmetler ve tüketiciye anında teslim edilen gayrimaddi mallar,</li>
    <li>Yönetmelikte sayılan diğer hâller.</li>
  </ol>
  <p>Ürün sayfasında aksi belirtilmedikçe sitede satılan pişirme ve mutfak ürünleri bu istisnalara girmez ve cayma hakkına konudur.</p>`;
}

function uyusmazlikBolumu(): string {
  return `<p>ALICI, şikâyet ve itirazlarını öncelikle SATICI'nın yukarıdaki iletişim kanallarına iletebilir. Uyuşmazlık hâlinde ALICI; Ticaret Bakanlığınca her yıl ilan edilen parasal sınırlar dahilinde, mal veya hizmeti satın aldığı ya da ikametgâhının bulunduğu yerdeki <strong>Tüketici Hakem Heyeti</strong>'ne, bu sınırların üzerindeki uyuşmazlıklarda ise 6502 sayılı Kanun'un 73/A maddesi uyarınca dava açılmadan önce <strong>arabulucuya başvurulması</strong> şartıyla <strong>Tüketici Mahkemesi</strong>'ne başvurabilir. Başvurular E-Devlet üzerinden Tüketici Bilgi Sistemi (TÜBİS) aracılığıyla da yapılabilir.</p>`;
}

/* ================================================================
   ÖN BİLGİLENDİRME FORMU
   ================================================================ */
export function onBilgilendirmeFormu(s: YasalSite, sip?: YasalSiparis): string {
  const k = s.kargo;
  return `
  <p class="belge-ust">Sürüm ${SOZLESME_SURUMU}${sip?.no ? ` · Sipariş no: ${esc(sip.no)}` : ''}${sip?.tarih ? ` · ${esc(tarihMetni(sip.tarih))}` : ''}</p>
  <p>İşbu Ön Bilgilendirme Formu, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca, mesafeli satış sözleşmesi kurulmadan ve ALICI ödeme yükümlülüğü altına girmeden önce ALICI'nın bilgisine sunulur. Bu form, Mesafeli Satış Sözleşmesi'nin ayrılmaz bir parçasıdır.</p>

  <h2>1. Satıcı bilgileri</h2>
  ${saticiBlok(s)}
  <p>Şikâyet ve talepler için de aynı iletişim bilgileri kullanılır.</p>

  <h2>2. Alıcı bilgileri</h2>
  ${aliciBlok(sip)}

  <h2>3. Sözleşme konusu ürünlerin temel nitelikleri ve fiyatı</h2>
  <p>Ürünlerin temel nitelikleri (marka, model, ölçü, malzeme, teknik özellikler, kutu içeriği) ${esc(s.url.replace(/^https?:\/\//, ''))} adresindeki ilgili ürün sayfasında yer alır ve bu formun parçasıdır. Fiyatlara KDV dahildir. İlan edilen fiyatlar ve kampanyalar güncelleme yapılana veya kampanya süresi bitene kadar geçerlidir; ALICI'nın onayladığı sipariş tutarı sonradan değiştirilemez.</p>
  ${urunTablosu(sip)}

  <h2>4. Ödeme</h2>
  <p>Ödeme, ödeme adımında sunulan yöntemlerle yapılır. Kartla ödemelerde kart bilgileri SATICI tarafından görülmez ve saklanmaz; ödeme lisanslı ödeme kuruluşu tarafından 3D Secure ile alınır. Taksitli ödemelerde taksit sayısı, vade farkı ve diğer koşullar kartı veren banka tarafından belirlenir ve ödeme ekranında gösterilir. ALICI'nın onayladığı toplam tutar dışında herhangi bir ek ödeme talep edilmez.</p>

  <h2>5. Teslimat</h2>
  <p>Ürünler, ALICI'nın bildirdiği teslimat adresine ${esc(k.firma)} ile gönderilir. Hafta içi saat ${k.kesimSaati}:00'e kadar ödemesi onaylanan siparişler genellikle aynı gün, sonrasında verilenler bir sonraki iş günü kargoya teslim edilir; kargo teslim süresi genellikle ${k.teslimGun[0]}–${k.teslimGun[1]} iş günüdür. Her durumda teslimat, sipariş tarihinden itibaren yasal üst sınır olan <strong>30 gün</strong>ü geçemez. ${kargoMetni(s)}. Ürün ALICI'ya teslim edilene kadar oluşan kayıp ve hasarlardan SATICI sorumludur.</p>

  <h2>6. Cayma hakkı</h2>
  ${caymaBolumu(s, '6')}

  <h2>7. Cayma hakkının kullanılamayacağı durumlar</h2>
  ${istisnalarBolumu()}

  <h2>8. Ayıplı ürün ve garanti</h2>
  <p>Ürünler orijinal ve faturalı olarak, varsa üretici/ithalatçı garanti belgesi ile teslim edilir. Ayıplı ürünlerde ALICI, 6502 sayılı Kanun'un 11. maddesindeki seçimlik haklarını (sözleşmeden dönme, bedel indirimi, ücretsiz onarım, ayıpsız misli ile değiştirme) kullanabilir. Ayrıntılar Mesafeli Satış Sözleşmesi ve Garanti Koşulları'nda yer alır.</p>

  <h2>9. Teminat ve depozito</h2>
  <p>ALICI'dan herhangi bir depozito veya mali teminat istenmez.</p>

  <h2>10. Şikâyet ve uyuşmazlıklar</h2>
  ${uyusmazlikBolumu()}

  <h2>11. Onay</h2>
  <p>ALICI, ödeme adımında bu formu okuyup elektronik ortamda onaylayarak; ürünlerin temel nitelikleri, tüm vergiler dahil satış fiyatı, ödeme ve teslimat bilgileri, cayma hakkı ve kullanılamayacağı durumlar ile şikâyet yolları hakkında sözleşme kurulmadan önce doğru ve eksiksiz bilgilendirildiğini ve siparişi onaylamasının ödeme yükümlülüğü doğurduğunu bildiğini kabul eder. Onaylanan form, sipariş kaydıyla birlikte SATICI tarafından saklanır ve ALICI'nın sipariş sayfasından (e-posta adresi verilmişse e-postayla da) erişimine sunulur.</p>`;
}

/* ================================================================
   MESAFELİ SATIŞ SÖZLEŞMESİ
   ================================================================ */
export function mesafeliSatisSozlesmesi(s: YasalSite, sip?: YasalSiparis): string {
  const k = s.kargo;
  const site = esc(s.url.replace(/^https?:\/\//, ''));
  return `
  <p class="belge-ust">Sürüm ${SOZLESME_SURUMU}${sip?.no ? ` · Sipariş no: ${esc(sip.no)}` : ''}${sip?.tarih ? ` · ${esc(tarihMetni(sip.tarih))}` : ''}</p>

  <h2>Madde 1 — Taraflar</h2>
  <h3>1.1 SATICI</h3>
  ${saticiBlok(s)}
  <h3>1.2 ALICI</h3>
  ${aliciBlok(sip)}

  <h2>Madde 2 — Tanımlar</h2>
  <p><strong>Kanun:</strong> 6502 sayılı Tüketicinin Korunması Hakkında Kanun; <strong>Yönetmelik:</strong> Mesafeli Sözleşmeler Yönetmeliği; <strong>Site:</strong> ${site} alan adlı internet sitesi; <strong>Ürün:</strong> Sözleşmeye konu taşınır mal; <strong>Kalıcı veri saklayıcısı:</strong> Gönderilen veya alınan bilginin, amacına uygun süre boyunca incelenmesine ve değiştirilmeden kopyalanmasına imkân veren e-posta, SMS ve benzeri araçlar.</p>

  <h2>Madde 3 — Konu</h2>
  <p>İşbu sözleşmenin konusu, ALICI'nın Site üzerinden elektronik ortamda sipariş verdiği aşağıda nitelikleri ve satış fiyatı belirtilen ürünlerin satışı ve teslimine ilişkin olarak Kanun ve Yönetmelik hükümleri uyarınca tarafların hak ve yükümlülüklerinin belirlenmesidir. ALICI'ya sözleşme kurulmadan önce sunulan Ön Bilgilendirme Formu bu sözleşmenin ayrılmaz parçasıdır; ikisi arasında çelişki olması hâlinde ALICI lehine olan hüküm uygulanır.</p>

  <h2>Madde 4 — Sözleşme konusu ürünler, fiyat ve ödeme</h2>
  ${urunTablosu(sip)}
  <p>Fiyatlara KDV dahildir. Ödeme, ödeme adımında sunulan yöntemlerle yapılır; taksit ve vade farkı koşulları kartı veren bankaya aittir. Ödemesi tamamlanmayan veya banka tarafından onaylanmayan siparişlerde SATICI'nın teslim yükümlülüğü doğmaz; ödeme 48 saat içinde tamamlanmazsa sipariş SATICI tarafından iptal edilebilir.</p>

  <h2>Madde 5 — Teslimat</h2>
  <p>5.1 Ürün, ALICI'nın bildirdiği teslimat adresine ${esc(k.firma)} aracılığıyla, sipariş tarihinden itibaren en geç 30 (otuz) gün içinde teslim edilir. Tahmini kargoya veriliş ve teslim süreleri Ön Bilgilendirme Formu'nda belirtilmiştir. ${kargoMetni(s)}.</p>
  <p>5.2 Ürün, ALICI'ya veya ALICI'nın gösterdiği adresteki kişiye teslim edilir. ALICI'nın adreste bulunmaması, adresin hatalı veya eksik bildirilmesi ya da teslimatın ALICI tarafından kabul edilmemesi nedeniyle teslim edilemeyen ve kargo şirketinin bekletme süresi sonunda SATICI'ya geri dönen siparişlerde SATICI, ALICI'ya ulaşarak yeniden gönderim yapar; ALICI'nın kusurundan kaynaklanan bu ikinci gönderimin kargo ücreti ALICI'dan talep edilebilir. ALICI dilerse bu durumda cayma hakkını kullanabilir.</p>
  <p>5.3 <strong>Teslimatta kontrol:</strong> ALICI, kargoyu teslim alırken paketi kontrol etmeli; ezik, yırtık, ıslak veya açılmış paketleri kargo görevlisine <strong>hasar tespit tutanağı</strong> tutturarak teslim almalı ya da teslim almayı reddetmelidir. Tutanak tutulmadan teslim alınan paketlerde taşıma hasarının kargo şirketinden tazmini güçleşeceğinden, ALICI'nın hasarı fark ettiği anda ve mümkünse 3 (üç) gün içinde fotoğraflarıyla SATICI'ya bildirmesi gerekir. Bu düzenleme, ALICI'nın Kanun'dan doğan ayıplı mal haklarını ortadan kaldırmaz.</p>
  <p>5.4 Ürün ALICI'ya teslim edilene kadar oluşan kayıp ve hasarlardan SATICI sorumludur. ALICI'nın SATICI'nın belirlediği taşıyıcı dışında bir taşıyıcı ile gönderim talep etmesi hâlinde, ürünün o taşıyıcıya tesliminden sonra oluşan kayıp ve hasardan SATICI sorumlu değildir.</p>

  <h2>Madde 6 — SATICI'nın beyan ve yükümlülükleri</h2>
  <p>6.1 SATICI, ürünü siparişte belirtilen niteliklere uygun, sağlam, eksiksiz, orijinal ve varsa garanti belgesi ile kullanım kılavuzuyla birlikte teslim etmekle yükümlüdür.</p>
  <p>6.2 Sipariş konusu ürünün tedarikinin, SATICI'nın öngöremeyeceği nedenlerle imkânsızlaşması hâlinde SATICI, bu durumu öğrendiği tarihten itibaren 3 (üç) gün içinde ALICI'ya yazılı olarak veya kalıcı veri saklayıcısı ile bildirir ve teslimat masrafları dahil tahsil edilen tüm ödemeleri bildirim tarihinden itibaren en geç 14 (on dört) gün içinde iade eder. Ürünün stokta bulunmaması tek başına ifa imkânsızlığı sayılmaz; bu durumda ALICI, 30 günlük teslim süresi içinde teslim edilmeyen siparişi iptal edebilir.</p>
  <p>6.3 <strong>Bariz fiyat ve ilan hataları:</strong> Site'de bir ürünün fiyatının teknik veya yazım hatası nedeniyle, makul bir alıcının da fark edebileceği ölçüde gerçek satış fiyatından açıkça farklı gösterilmesi hâlinde SATICI, Türk Borçlar Kanunu'nun yanılmaya ilişkin hükümleri çerçevesinde siparişi iptal etme hakkını saklı tutar; bu durumda ALICI derhâl bilgilendirilir ve tahsil edilen tutar en geç 14 gün içinde iade edilir.</p>
  <p>6.4 Site'deki ürünler nihai tüketiciye satılır. Olağan bireysel kullanımı açıkça aşan adetlerde verilen ve yeniden satış amacı taşıdığı anlaşılan siparişlerde SATICI, adet sınırlaması uygulama veya ALICI'yı bilgilendirerek siparişi iptal etme hakkını saklı tutar; bu durumda tahsil edilen tutar 14 gün içinde iade edilir.</p>
  <p>6.5 SATICI, mücbir sebepler (doğal afet, salgın, savaş, grev, resmî makam kararları, kargo şirketlerinin faaliyetini durdurması gibi tarafların kontrolü dışındaki olaylar) nedeniyle teslimatın gecikmesinden sorumlu tutulamaz; bu durumda ALICI'ya bilgi verilir. ALICI siparişin iptalini, benzer bir ürünle değiştirilmesini veya engel ortadan kalkana kadar teslimatın ertelenmesini seçebilir. İptal hâlinde ödenen tutar 14 gün içinde iade edilir.</p>

  <h2>Madde 7 — ALICI'nın beyan ve yükümlülükleri</h2>
  <p>7.1 ALICI, Ön Bilgilendirme Formu'nu ve işbu sözleşmeyi okuyup elektronik ortamda onayladığını; ürünlerin temel nitelikleri, satış fiyatı, ödeme ve teslimat bilgileri ile cayma hakkı konusunda sözleşme kurulmadan önce bilgilendirildiğini kabul eder.</p>
  <p>7.2 ALICI, sipariş sırasında verdiği ad, adres, telefon ve e-posta bilgilerinin doğru ve güncel olduğunu, yanlış veya eksik bilgiden doğacak gecikme ve masraflardan kendisinin sorumlu olduğunu kabul eder.</p>
  <p>7.3 <strong>Kartın yetkisiz kullanımı:</strong> Ürün teslim edildikten sonra ödemede kullanılan kartın yetkisiz kişilerce haksız ve hukuka aykırı olarak kullanıldığının tespit edilmesi ve ürün bedelinin ilgili banka veya ödeme kuruluşu tarafından SATICI'ya ödenmemesi ya da geri alınması hâlinde ALICI, kendisine teslim edilen ürünü 3 (üç) gün içinde, gönderim masrafı SATICI'ya ait olmak üzere SATICI'ya iade etmekle yükümlüdür; SATICI'nın diğer yasal hakları saklıdır.</p>
  <p>7.4 ALICI, kredi kartıyla yaptığı ödemelerde temerrüde düşmesi hâlinde kart sahibi bankayla arasındaki sözleşme çerçevesinde bankaya karşı sorumlu olduğunu kabul eder.</p>
  <p>7.5 ALICI, ürünü kullanım kılavuzuna ve üreticinin güvenlik talimatlarına uygun kullanmakla yükümlüdür. Talimatlara aykırı kullanımdan doğan zararlardan SATICI sorumlu tutulamaz.</p>

  <h2>Madde 8 — Cayma hakkı</h2>
  ${caymaBolumu(s, '8')}

  <h2>Madde 9 — Cayma hakkının kullanılamayacağı durumlar</h2>
  ${istisnalarBolumu()}

  <h2>Madde 10 — Ayıplı ürün ve garanti</h2>
  <p>10.1 Teslim edilen ürünün sözleşmeye aykırı (ayıplı) olması hâlinde ALICI, Kanun'un 11. maddesi uyarınca; satılanı geri vermeye hazır olduğunu bildirerek sözleşmeden dönme, satılanı alıkoyup ayıp oranında satış bedelinden indirim isteme, aşırı bir masraf gerektirmediği takdirde bütün masrafları SATICI'ya ait olmak üzere ücretsiz onarılmasını isteme veya imkân varsa satılanın ayıpsız bir misli ile değiştirilmesini isteme haklarından birini kullanabilir. Ayıplı ürünün iadesine ilişkin kargo masrafları SATICI'ya aittir.</p>
  <p>10.2 Ayıptan doğan sorumluluk, daha sonra ortaya çıkmış olsa bile ürünün teslim tarihinden itibaren 2 (iki) yıllık zamanaşımına tabidir. Ayıbın tespiti için ALICI'nın ayıbı fark ettikten sonra makul süre içinde ürünü kullanmayı bırakması ve fotoğraf/video ile SATICI'ya bildirmesi önerilir; SATICI gerektiğinde ürünü üretici yetkili servisine inceletme hakkına sahiptir.</p>
  <p>10.3 Kullanım kılavuzuna aykırı kullanım, darbe, düşürme, aşırı ısıtma, boş hâlde ısıtma, uygun olmayan temizlik maddesi kullanımı, yetkisiz kişilerce yapılan müdahale ve olağan aşınma (ör. conta gibi sarf parçalarının kullanımla yıpranması) ayıp ve garanti kapsamında değildir.</p>
  <p>10.4 Garanti süresi ve koşulları, ürünle birlikte verilen garanti belgesinde yer alır; garanti hakları Garanti Koşulları sayfasında ayrıca açıklanmıştır.</p>

  <h2>Madde 11 — Kişisel veriler</h2>
  <p>ALICI'ya ait kişisel veriler, 6698 sayılı Kişisel Verilerin Korunması Kanunu uyarınca ve Site'de yayımlanan KVKK Aydınlatma Metni'nde belirtilen amaçlarla, sözleşmenin kurulması ve ifası, fatura düzenlenmesi ve yasal yükümlülüklerin yerine getirilmesi için işlenir. ALICI'nın açık rızası olmadan ticari elektronik ileti gönderilmez.</p>

  <h2>Madde 12 — Kayıtlar ve delil</h2>
  <p>Taraflar, işbu sözleşmeden doğabilecek uyuşmazlıklarda SATICI'nın sipariş, onay, ödeme ve kargo kayıtlarının, e-posta ve SMS yazışmalarının, Hukuk Muhakemeleri Kanunu çerçevesinde delil olarak kullanılabileceğini kabul eder. SATICI, Yönetmelik uyarınca bilgilendirme, cayma hakkı ve teslimata ilişkin işlem kayıtlarını en az 3 (üç) yıl saklar.</p>

  <h2>Madde 13 — Uyuşmazlıkların çözümü</h2>
  ${uyusmazlikBolumu()}

  <h2>Madde 14 — Yürürlük</h2>
  <p>14 (on dört) maddeden oluşan işbu sözleşme, ALICI'nın ödeme adımında elektronik ortamda onay vermesi ve siparişi tamamlamasıyla kurulur ve yürürlüğe girer. Sözleşmenin ve Ön Bilgilendirme Formu'nun bir örneği ALICI'nın sipariş sayfasında saklanır; ALICI e-posta adresi vermişse ayrıca e-postayla gönderilir. SATICI, ürünle birlikte faturayı ALICI'ya iletir.</p>
  ${sip ? `<p><strong>Sipariş tarihi:</strong> ${esc(tarihMetni(sip.tarih) || 'Onay anında')}</p>` : ''}`;
}

/* ================================================================
   İPTAL, CAYMA VE İADE KOŞULLARI
   ================================================================ */
export function iptalIadeKosullari(s: YasalSite): string {
  const k = s.kargo;
  return `
  <p class="belge-ust">Sürüm ${SOZLESME_SURUMU}</p>
  <h2>1. Genel</h2>
  <ol class="belge-liste">
    <li>${esc(s.ad)} internet sitesi üzerinden verdiğiniz siparişlerde, ödeme adımında onayladığınız Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi geçerlidir. Bu sayfa, o metinlerdeki iptal, cayma ve iade hükümlerini adım adım açıklar.</li>
    <li>Satışlar 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği (RG 27.11.2014/29188, güncel değişiklikleriyle) ile yürürlükteki diğer mevzuata tabidir.</li>
    <li>Ürünler orijinal ve faturalıdır; eksiksiz, siparişte belirtilen niteliklere uygun ve varsa garanti belgesi ile kullanım kılavuzuyla birlikte teslim edilir.</li>
  </ol>

  <h2>2. Siparişin kargoya verilmeden önce iptali</h2>
  <p>Siparişiniz kargoya verilmeden önce ${esc(s.eposta)} adresine e-posta veya Site üzerindeki WhatsApp destek hattımız ile sipariş numaranızı yazarak iptal talep edebilirsiniz. İptal edilen siparişin ödemesi, talebin bize ulaştığı tarihten itibaren en geç 14 gün içinde, ödeme yaptığınız karta/araca tek seferde iade edilir. Kargoya verilmiş siparişlerde aşağıdaki cayma süreci uygulanır.</p>

  <h2>3. Cayma hakkı</h2>
  ${caymaBolumu(s, '3')}

  <h2>4. Adım adım iade</h2>
  <ol class="belge-liste">
    <li><strong>Bildirin:</strong> Teslimattan itibaren ${s.iadeGun} gün içinde ${esc(s.eposta)} adresine veya WhatsApp hattımıza sipariş numaranız ve adınız soyadınızla yazın (aşağıdaki cayma formunu kullanabilirsiniz).</li>
    <li><strong>İade kodunuzu alın:</strong> Size ${esc(k.firma)} iade kodu iletilir. Bu kodla yapılan gönderim sizin için ücretsizdir.</li>
    <li><strong>Paketleyin:</strong> Ürünü kutusu, tüm parçaları, aksesuarları, garanti belgesi ve varsa hediyesiyle, taşımada zarar görmeyecek şekilde paketleyin. Bireysel faturalarda fatura aslı gerekmez; kurumsal faturalı siparişlerde firmanızın düzenleyeceği iade faturasını pakete ekleyin.</li>
    <li><strong>Gönderin:</strong> Bildiriminizden itibaren en geç 14 gün içinde paketi iade koduyla herhangi bir ${esc(k.firma)} şubesine teslim edin ve gönderi belgesini saklayın.</li>
    <li><strong>Ödemeniz iade edilir:</strong> Ürünün kargoya teslim edildiği tarihten itibaren en geç 14 gün içinde ödemeniz kartınıza/ödeme aracınıza iade edilir.</li>
  </ol>

  <h2>5. Cayma hakkı kullanılamayacak ürünler</h2>
  ${istisnalarBolumu()}

  <h2>6. Hasarlı, eksik veya yanlış ürün</h2>
  <ol class="belge-liste">
    <li>Kargoyu teslim alırken paketi kontrol edin. Ezik, yırtık, ıslak veya açılmış paketleri kargo görevlisine <strong>hasar tespit tutanağı</strong> tutturarak teslim alın veya teslim almayın.</li>
    <li>Paketten hasarlı, eksik veya siparişinizden farklı ürün çıkarsa, fark ettiğiniz anda ve mümkünse 3 gün içinde fotoğraf veya videoyla bize bildirin. Bu durumlarda ürünün değişimi, eksiğin tamamlanması veya iadesi için tüm kargo masrafları tarafımızca karşılanır.</li>
    <li>Tutanaksız teslim alınan paketlerde taşıma hasarının kargo şirketinden tazmini güçleşir; bu nedenle tutanak tutturmanızı önemle rica ederiz. Bu öneri, Kanun'dan doğan ayıplı mal haklarınızı ortadan kaldırmaz.</li>
  </ol>

  <h2>7. Ayıplı ürün</h2>
  <p>Ürününüzde üretim veya malzeme kaynaklı bir ayıp ortaya çıkarsa, teslimden itibaren 2 yıl içinde Kanun'un 11. maddesindeki haklarınızı (sözleşmeden dönme, bedel indirimi, ücretsiz onarım veya ayıpsız misliyle değişim) kullanabilirsiniz. Ayıbın tespiti için ürün gerektiğinde üreticinin yetkili servisinde incelenir. Kullanım kılavuzuna aykırı kullanım, darbe, aşırı ısıtma ve olağan aşınma ayıp sayılmaz. Ayrıntılar için Garanti Koşulları sayfasına bakın.</p>

  <h2>8. Kartın yetkisiz kullanımı</h2>
  <p>Ürün teslim edildikten sonra ödemede kullanılan kartın yetkisiz kişilerce kullanıldığı tespit edilir ve ürün bedeli banka veya ödeme kuruluşu tarafından tarafımıza ödenmez ya da geri alınırsa, alıcı ürünü 3 gün içinde, gönderim masrafı tarafımıza ait olmak üzere iade etmekle yükümlüdür.</p>

  <h2>9. Örnek cayma formu</h2>
  <div class="belge-form">
    <p><strong>Kime:</strong> ${[saticiAdi(s), bos(s.satici.adres) ? '' : esc(s.satici.adres), esc(s.eposta)].filter(Boolean).join(' · ')}</p>
    <p>Bu formla aşağıdaki ürünlerin satışına ilişkin sözleşmeden cayma hakkımı kullandığımı bildiririm.</p>
    <p>Sipariş numarası: ……………………… &nbsp; Sipariş tarihi: ……………… &nbsp; Teslim tarihi: ………………</p>
    <p>İade edilen ürün(ler): ………………………………………………………………</p>
    <p>Alıcının adı soyadı: ……………………………… &nbsp; Telefonu: ………………………</p>
    <p>Alıcının adresi: ………………………………………………………………………</p>
    <p>Tarih: ……………… &nbsp; İmza (yalnızca kâğıt üzerinde gönderiliyorsa): ………………</p>
  </div>

  <h2>10. İletişim</h2>
  ${saticiBlok(s)}`;
}

/* ================================================================
   TESLİMAT VE KARGO
   ================================================================ */
export function teslimatKosullari(s: YasalSite): string {
  const k = s.kargo;
  return `
  <p class="belge-ust">Sürüm ${SOZLESME_SURUMU}</p>
  <h2>1. Kargo firması ve süreler</h2>
  <p>Siparişler ${esc(k.firma)} ile gönderilir. Hafta içi saat ${k.kesimSaati}:00'e kadar ödemesi onaylanan siparişler genellikle aynı gün, sonrasında verilenler bir sonraki iş günü kargoya teslim edilir. Kargo teslim süresi bulunduğunuz bölgeye göre genellikle ${k.teslimGun[0]}–${k.teslimGun[1]} iş günüdür. Hafta sonu ve resmî tatillerde kargo çıkışı yapılmaz. Yasal üst sınır, sipariş tarihinden itibaren 30 gündür.</p>
  <h2>2. Kargo ücreti</h2>
  <p>${kargoMetni(s)}. Ürün sayfasında "Kargo Bedava" ibaresi bulunan ürünlerde kargo ücreti alınmaz.</p>
  <h2>3. Takip</h2>
  <p>Siparişiniz kargoya verildiğinde kargo takip numaranız size iletilir (e-posta adresinizi verdiyseniz e-postayla). Siparişinizin durumunu ve takip numarasını "Sipariş takip" sayfasından da görebilirsiniz.</p>
  <h2>4. Teslim alırken</h2>
  <p>Paketi teslim alırken kontrol edin; hasarlı paketleri kargo görevlisine tutanak tutturarak teslim alın veya teslim almayın ve bize hemen bildirin. Adreste bulunamamanız durumunda kargo şirketi bilgilendirme bırakır; paket şubede bekletme süresi sonunda bize geri döner. Hatalı/eksik adres veya teslim alınmaması nedeniyle geri dönen siparişlerin yeniden gönderim ücreti alıcıdan talep edilebilir.</p>
  <h2>5. Teslimata kadar sorumluluk</h2>
  <p>Ürün size teslim edilene kadar oluşan kayıp ve hasardan satıcı sorumludur.</p>`;
}

/* ================================================================
   GARANTİ KOŞULLARI
   ================================================================ */
export function garantiKosullari(s: YasalSite): string {
  return `
  <p class="belge-ust">Sürüm ${SOZLESME_SURUMU}</p>
  <h2>1. Orijinal ve garantili ürün</h2>
  <p>${esc(s.ad)} üzerinden satılan ürünler orijinaldir ve faturalı gönderilir. Garanti süresi ve garantiyi veren üretici/ithalatçı firma bilgisi, ürünle birlikte verilen garanti belgesinde ve ürün sayfasında yer alır.</p>
  <h2>2. Garanti başvurusu</h2>
  <p>Garanti kapsamındaki talepleriniz için garanti belgesindeki yetkili servise başvurabilir veya bize ${esc(s.eposta)} ya da Site üzerindeki WhatsApp destek hattımız üzerinden ulaşabilirsiniz; süreci sizin adınıza takip ederiz. Başvuruda fatura ve garanti belgesi istenebilir; lütfen saklayın.</p>
  <h2>3. Garanti kapsamı dışındaki durumlar</h2>
  <ul class="belge-liste">
    <li>Kullanım kılavuzuna ve güvenlik talimatlarına aykırı kullanım (ör. düdüklü tencerede en az/en çok doldurma seviyelerine uyulmaması, boş hâlde ısıtma, emniyet valflerinin kurcalanması),</li>
    <li>Düşürme, darbe, aşırı ısınma, yanma ve uygun olmayan temizlik maddesi veya aşındırıcı kullanımı,</li>
    <li>Yetkisiz kişilerce yapılan tamir, değişiklik veya orijinal olmayan yedek parça kullanımı,</li>
    <li>Conta, valf contası gibi kullanımla doğal olarak yıpranan sarf parçalarının olağan aşınması ve renk değişimi gibi kullanımı etkilemeyen görünüş farklılıkları,</li>
    <li>Ticari veya profesyonel amaçlı kullanım.</li>
  </ul>
  <h2>4. Yasal haklarınız</h2>
  <p>Garanti, 6502 sayılı Kanun'dan doğan ayıplı mal haklarınızı sınırlamaz. Ayıplı ürünlerde teslimden itibaren 2 yıl içinde sözleşmeden dönme, bedel indirimi, ücretsiz onarım veya ayıpsız misliyle değişim haklarınızdan birini kullanabilirsiniz. Garanti süresi içinde arızalanan ürünün tamir süresi 20 iş gününü geçemez.</p>`;
}

/* ================================================================
   KVKK AYDINLATMA METNİ
   ================================================================ */
export function kvkkAydinlatma(s: YasalSite): string {
  return `
  <p class="belge-ust">Sürüm ${SOZLESME_SURUMU}</p>
  <p>6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") 10. maddesi uyarınca, veri sorumlusu sıfatıyla ${bos(s.satici.unvan) ? esc(s.ad) : `${esc(s.satici.unvan)} ("${esc(s.ad)}")`} olarak kişisel verilerinizi aşağıda açıklanan şekilde işlediğimizi bildiririz.</p>
  <h2>1. Veri sorumlusu</h2>
  ${saticiBlok(s)}
  <h2>2. İşlenen kişisel veriler</h2>
  <ul class="belge-liste">
    <li><strong>Kimlik:</strong> ad, soyad; kurumsal faturada firma unvanı, vergi dairesi ve numarası.</li>
    <li><strong>İletişim:</strong> cep telefonu, e-posta adresi, teslimat ve fatura adresi.</li>
    <li><strong>Müşteri işlem:</strong> sipariş içeriği, tutarı, tarihi, sipariş ve kargo durumu, talep, şikâyet ve iade kayıtları, WhatsApp/e-posta yazışmaları.</li>
    <li><strong>İşlem güvenliği:</strong> sipariş ve sözleşme onayı sırasında IP adresi ve onay zamanı.</li>
  </ul>
  <p>Kart bilgileriniz tarafımızca görülmez, işlenmez ve saklanmaz; ödeme lisanslı ödeme kuruluşu tarafından alınır.</p>
  <h2>3. İşleme amaçları</h2>
  <p>Siparişin alınması, ödemenin doğrulanması, ürünün teslimi ve kargo takibi; fatura düzenlenmesi ve muhasebe kayıtları; cayma, iade, ayıp ve garanti taleplerinin yürütülmesi; müşteri sorularının yanıtlanması; mesafeli satış mevzuatından doğan bilgilendirme ve kayıt saklama yükümlülüklerinin yerine getirilmesi; dolandırıcılık ve kötüye kullanımın önlenmesi, hukuki uyuşmazlıklarda hakların korunması.</p>
  <h2>4. Hukuki sebepler</h2>
  <p>Kişisel verileriniz KVKK m.5/2 kapsamında; (c) sözleşmenin kurulması ve ifasıyla doğrudan ilgili olması, (ç) veri sorumlusunun hukuki yükümlülüğünü yerine getirmesi (vergi, ticaret ve tüketici mevzuatı), (e) bir hakkın tesisi, kullanılması veya korunması ve (f) temel hak ve özgürlüklerinize zarar vermemek kaydıyla meşru menfaatlerimiz hukuki sebeplerine dayanılarak işlenir. Açık rızanız olmadan size reklam veya kampanya içerikli ticari elektronik ileti gönderilmez.</p>
  <h2>5. Aktarım</h2>
  <p>Kişisel verileriniz yalnızca yukarıdaki amaçlar için gerekli olduğu ölçüde; teslimat için kargo şirketine (${esc(s.kargo.firma)}), ödeme için lisanslı ödeme kuruluşuna ve bankalara, fatura ve muhasebe için e-fatura/e-arşiv hizmet sağlayıcısına ve mali müşavirimize, SMS ve e-posta gönderimi için ileti hizmet sağlayıcılarına, sitenin barındırılması ve veri saklama için bilişim altyapısı hizmet sağlayıcılarına ve talep hâlinde yetkili kamu kurum ve kuruluşlarına aktarılabilir. Altyapı hizmet sağlayıcılarının sunucuları yurt dışında bulunabilir; bu durumda aktarım KVKK m.9'da öngörülen güvencelerle yapılır.</p>
  <h2>6. Toplama yöntemi</h2>
  <p>Kişisel verileriniz; internet sitemizdeki sipariş ve iletişim formları, WhatsApp, e-posta ve telefon görüşmeleri aracılığıyla elektronik ortamda toplanır.</p>
  <h2>7. Saklama süresi</h2>
  <p>Sipariş, bilgilendirme ve sözleşme kayıtları mesafeli sözleşmeler mevzuatı gereği en az 3 yıl; fatura ve muhasebe kayıtları vergi ve ticaret mevzuatı gereği 10 yıl saklanır. Süre sonunda veriler silinir, yok edilir veya anonim hâle getirilir.</p>
  <h2>8. Haklarınız</h2>
  <p>KVKK m.11 uyarınca; kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini, şartları oluşmuşsa silinmesini veya yok edilmesini ve bu işlemlerin aktarılan üçüncü kişilere bildirilmesini isteme, otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuca itiraz etme ve kanuna aykırı işleme nedeniyle zarara uğramanız hâlinde zararın giderilmesini talep etme haklarına sahipsiniz.</p>
  <p>Başvurularınızı kimliğinizi doğrulayan bilgilerle birlikte yazılı olarak ${bos(s.satici.adres) ? '' : `${esc(s.satici.adres)} adresine, `}${bos(s.satici.kep) ? '' : `${esc(s.satici.kep)} KEP adresine veya `}sistemimizde kayıtlı e-posta adresinizden ${esc(s.eposta)} adresine iletebilirsiniz. Başvurular en geç 30 gün içinde ücretsiz olarak sonuçlandırılır.</p>`;
}

/* ================================================================
   GİZLİLİK VE ÇEREZ POLİTİKASI
   ================================================================ */
export function gizlilikCerez(s: YasalSite): string {
  return `
  <p class="belge-ust">Sürüm ${SOZLESME_SURUMU}</p>
  <h2>1. Gizlilik</h2>
  <p>${esc(s.ad)} olarak kişisel verilerinizi yalnızca siparişinizi yerine getirmek ve yasal yükümlülüklerimiz için kullanırız; satmayız veya kiralamayız. Ayrıntılar KVKK Aydınlatma Metni'nde yer alır. Sitemize bağlantıyla erişilen üçüncü taraf sitelerin (ör. kargo takip, WhatsApp) gizlilik uygulamalarından sorumlu değiliz.</p>
  <h2>2. Kullandığımız çerezler ve tarayıcı depolaması</h2>
  <ul class="belge-liste">
    <li><strong>Zorunlu tarayıcı depolaması (localStorage):</strong> Sepetinizdeki ürünler ve bu cihazdan verdiğiniz siparişlerin numaraları, siz silene kadar yalnızca kendi cihazınızda tutulur. Sitenin çalışması için gereklidir, onay gerektirmez.</li>
    <li><strong>Zorunlu oturum çerezi:</strong> Yalnızca yönetim paneline giriş yapan site yöneticileri için kullanılır.</li>
    <li><strong>Analitik çerezler (Google Analytics, Google Etiket Yöneticisi aracılığıyla):</strong> Sitenin hangi sayfalarının ziyaret edildiğini, ürünlerin ne sıklıkla görüntülendiğini ve sepete eklendiğini toplu istatistik olarak ölçmek için kullanılır. <strong>Yalnızca çerez penceresinde açıkça izin verirseniz</strong> çalışır; izin vermezseniz bu çerezler hiç yüklenmez ve sitenin tüm özelliklerini kullanmaya devam edersiniz. Bu veriler Google LLC'nin yurt dışındaki sunucularında işlenebilir. Tercihiniz bu cihazda 12 ay saklanır.</li>
    <li><strong>Reklam çerezleri:</strong> Kullanılmamaktadır.</li>
  </ul>
  <h2>3. Çerezleri yönetme</h2>
  <p>Tercihinizi istediğiniz zaman sayfanın altındaki <strong>"Çerez tercihleri"</strong> bağlantısından değiştirebilirsiniz; izninizi geri aldığınızda analitik çerezler silinir. Ayrıca tarayıcınızın ayarlarından çerezleri ve site verilerini silebilir veya engelleyebilirsiniz. Zorunlu depolamayı engellemeniz hâlinde sepet özelliği çalışmayabilir.</p>
  <h2>4. Güvenlik</h2>
  <p>Site HTTPS ile şifrelenir. Kart bilgileri yalnızca lisanslı ödeme kuruluşunun 3D Secure sayfasında girilir.</p>`;
}

/* ================================================================
   KULLANIM KOŞULLARI
   ================================================================ */
export function kullanimKosullari(s: YasalSite): string {
  return `
  <p class="belge-ust">Sürüm ${SOZLESME_SURUMU}</p>
  <ol class="belge-liste">
    <li>${esc(s.url.replace(/^https?:\/\//, ''))} ("Site") ${saticiAdi(s)} tarafından işletilir. Site'yi kullanan herkes bu koşulları kabul etmiş sayılır.</li>
    <li>Site'deki ürün açıklamaları, fotoğraflar ve teknik bilgiler mümkün olan en doğru şekilde hazırlanır; fotoğraflardaki renk ve görünüm ekran ayarlarına göre farklılık gösterebilir. Ürünlerin temel nitelikleri ürün sayfasında ve sipariş anında onaylanan Ön Bilgilendirme Formu'nda yer alır.</li>
    <li>Fiyatlar, kampanyalar ve stok bilgileri önceden haber verilmeksizin değiştirilebilir; siparişinizi onayladığınız andaki fiyat ve koşullar sizin için geçerlidir. İndirimli fiyatlarda gösterilen önceki fiyat, mevzuata uygun olarak indirimden önceki ${YASAL_INDIRIM_GUN} günlük dönemde bu sitede uygulanan en düşük satış fiyatıdır.</li>
    <li>Site'deki logo, metin, tasarım, fotoğraf ve diğer içerikler ${esc(s.ad)}'a veya ilgili hak sahiplerine aittir; izinsiz kopyalanamaz, çoğaltılamaz ve ticari amaçla kullanılamaz. Ürünlerdeki marka ve logolar ilgili üreticilere aittir.</li>
    <li>Site'nin güvenliğini tehlikeye atacak, işleyişini bozacak, otomatik yazılımlarla veri toplayacak veya başkalarının bilgileriyle sipariş verecek şekilde kullanılması yasaktır; bu tür kullanımlarda ilgili siparişler iptal edilebilir ve yasal yollara başvurulabilir.</li>
    <li>Site'deki bağlantılarla erişilen üçüncü taraf sitelerin içerik ve uygulamalarından ${esc(s.ad)} sorumlu değildir.</li>
    <li>Bu koşullar gerektiğinde güncellenebilir; güncel metin Site'de yayımlandığı tarihte yürürlüğe girer. Uyuşmazlıklarda Türkiye Cumhuriyeti hukuku uygulanır; tüketici uyuşmazlıklarında Mesafeli Satış Sözleşmesi'ndeki çözüm yolları geçerlidir.</li>
  </ol>`;
}

/* ================================================================
   Sayfa listesi
   ================================================================ */
export const YASAL_SAYFALAR = [
  { yol: 'iptal-iade-kosullari', baslik: 'İptal, Cayma ve İade Koşulları', uret: iptalIadeKosullari },
  { yol: 'mesafeli-satis-sozlesmesi', baslik: 'Mesafeli Satış Sözleşmesi', uret: (s: YasalSite) => mesafeliSatisSozlesmesi(s) },
  { yol: 'on-bilgilendirme-formu', baslik: 'Ön Bilgilendirme Formu', uret: (s: YasalSite) => onBilgilendirmeFormu(s) },
  { yol: 'teslimat-ve-kargo', baslik: 'Teslimat ve Kargo', uret: teslimatKosullari },
  { yol: 'garanti-kosullari', baslik: 'Garanti Koşulları', uret: garantiKosullari },
  { yol: 'kvkk-aydinlatma-metni', baslik: 'KVKK Aydınlatma Metni', uret: kvkkAydinlatma },
  { yol: 'gizlilik-ve-cerez-politikasi', baslik: 'Gizlilik ve Çerez Politikası', uret: gizlilikCerez },
  { yol: 'kullanim-kosullari', baslik: 'Kullanım Koşulları', uret: kullanimKosullari },
] as const;

/** Siparişten sözleşme verisi */
export function siparistenYasal(sip: {
  no: string; tarih: string;
  musteri: { ad: string; soyad: string; tel: string; eposta?: string };
  teslimat: { il: string; ilce: string; adres: string };
  fatura: YasalSiparis['fatura'];
  kalemler: { ad: string; sku?: string; icerik?: string; adet: number; birimFiyat: number; indirim: number; toplam: number }[];
  urunlerToplami: number; setIndirimi: number; sepetIndirimi: number; kargo: number; toplam: number;
}): YasalSiparis {
  return {
    no: sip.no, tarih: sip.tarih,
    alici: {
      adSoyad: `${sip.musteri.ad} ${sip.musteri.soyad}`, tel: sip.musteri.tel, eposta: sip.musteri.eposta,
      adres: `${sip.teslimat.adres}, ${sip.teslimat.ilce} / ${sip.teslimat.il}`,
    },
    fatura: sip.fatura,
    satirlar: sip.kalemler.map((k) => ({ ad: k.ad, sku: k.sku, icerik: k.icerik, adet: k.adet, birimFiyat: k.birimFiyat, indirim: k.indirim, toplam: k.toplam })),
    urunlerToplami: sip.urunlerToplami, setIndirimi: sip.setIndirimi, sepetIndirimi: sip.sepetIndirimi, kargo: sip.kargo, toplam: sip.toplam,
  };
}
