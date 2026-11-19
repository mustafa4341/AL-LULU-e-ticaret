/**
 * Al Lulu Home — sepet (tarayıcıda; fiyat saklanmaz, her seferinde katalogdan hesaplanır).
 * Hesap lib/fiyat.ts → sepetHesapla ile yapılır; sunucu siparişi alırken AYNI fonksiyonla yeniden hesaplar.
 */
import { formatTL, katalog, setBul, urunBul } from './katalog';
import { kampanyaIndirimi, satirKampanyaIndirimi, sepetHesapla, urunKullanimi, type HesapSatiri, type KalemTipi, type SepetKalemi } from '../lib/fiyat';
import { cekmeceAc, toast } from './ui';
import { satirlardanUrunler, track } from './analitik';

export type { KalemTipi, SepetKalemi };
const ANAHTAR = 'allulu_sepet_v2';
export const DEGISTI = 'sepet:degisti';

const anahtar = (k: { tip: KalemTipi; id: string }) => `${k.tip}:${k.id}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const ikonSvg = (ad: string, b = 20) => `<svg width="${b}" height="${b}" aria-hidden="true"><use href="#i-${ad}"/></svg>`;

/* ---------------- Durum ---------------- */
function oku(): SepetKalemi[] {
  try {
    const ham = JSON.parse(localStorage.getItem(ANAHTAR) || '[]');
    if (!Array.isArray(ham)) return [];
    return ham.filter((k) => k && (k.tip === 'urun' || k.tip === 'set') && typeof k.id === 'string' && Number.isInteger(k.adet) && k.adet > 0)
      .filter((k) => (k.tip === 'urun' ? !!urunBul(k.id) : !!setBul(k.id)));
  } catch { return []; }
}
let kalemler: SepetKalemi[] = oku();

function kaydet(): void {
  try { localStorage.setItem(ANAHTAR, JSON.stringify(kalemler)); } catch { /* gizli sekme */ }
  yansit();
  document.dispatchEvent(new CustomEvent(DEGISTI));
}
window.addEventListener('storage', (e) => { if (e.key === ANAHTAR) { kalemler = oku(); yansit(); document.dispatchEvent(new CustomEvent(DEGISTI)); } });

export const sepetKalemleri = (): readonly SepetKalemi[] => kalemler;
export const sepetOzeti = () => sepetHesapla(kalemler, katalog);
export function sepetiBosalt(): void { kalemler = []; kaydet(); }

export function eklenebilir(tip: KalemTipi, id: string, taban: readonly SepetKalemi[] = kalemler): number {
  const kul = urunKullanimi(taban, katalog);
  if (tip === 'urun') { const u = urunBul(id); return u ? Math.max(0, u.maxAdet - (kul.get(id) ?? 0)) : 0; }
  const s = setBul(id);
  if (!s) return 0;
  const gereken = urunKullanimi([{ tip: 'set', id, adet: 1 }], katalog);
  return Math.min(...Array.from(gereken, ([urunId, adet]) => {
    const u = urunBul(urunId);
    return u ? Math.floor(Math.max(0, u.maxAdet - (kul.get(urunId) ?? 0)) / adet) : 0;
  }));
}

export function ekle(tip: KalemTipi, id: string, adet = 1, taban = kalemler): number {
  const n = Math.min(adet, eklenebilir(tip, id, taban));
  if (n <= 0) { toast('Bu üründen daha fazla ekleyemezsiniz (stok/sipariş limiti).'); return 0; }
  kalemler = taban;
  const m = kalemler.find((k) => k.tip === tip && k.id === id);
  if (m) m.adet += n; else kalemler.push({ tip, id, adet: n });
  kaydet();
  const s = sepetHesapla([{ tip, id, adet: n }], katalog).satirlar[0];
  if (s) track('add_to_cart', { currency: 'TRY', value: s.toplam, items: satirlardanUrunler([s]) });
  return n;
}

export function adetAyarla(tip: KalemTipi, id: string, adet: number): void {
  const k = kalemler.find((x) => x.tip === tip && x.id === id);
  if (!k) return;
  const yeni = Math.max(0, Math.min(k.adet + eklenebilir(tip, id), adet));
  if (yeni === 0) {
    const s = sepetHesapla([k], katalog).satirlar[0];
    kalemler = kalemler.filter((x) => x !== k);
    if (s) track('remove_from_cart', { currency: 'TRY', value: s.toplam, items: satirlardanUrunler([s]) });
  }
  else k.adet = yeni;
  kaydet();
}

/* ---------------- Görünüm ---------------- */
/**
 * Ürün satırının açık dökümü (sepet çekmecesi ve ödeme ekranı ortak): indirim varsa indirimsiz tutar,
 * kampanya indirimi ve sepette indirim ayrı satırlarda. Satırların toplamı sağdaki satır tutarına eşittir.
 */
function dokumHtml(s: HesapSatiri): string {
  const satir = (sol: string, sag: string, sinif = '') => `<li${sinif ? ` class="${sinif}"` : ''}><span>${sol}</span><span>${sag}</span></li>`;
  const kampanya = satirKampanyaIndirimi(s, katalog);
  if (!kampanya && !s.indirim) return '';
  const indirimsizBirim = s.birimFiyat + kampanya / s.adet;
  return `<ul class="kalem__dokum" aria-label="Fiyat dökümü">
    ${satir(`${s.adet} × ${formatTL(indirimsizBirim)}`, formatTL(indirimsizBirim * s.adet))}
    ${kampanya ? satir('İndirim', `−${formatTL(kampanya)}`, 'kalem__dokum-indirim') : ''}
    ${s.indirim ? satir(`Sepette %${s.sepetteYuzde} indirim`, `−${formatTL(s.indirim)}`, 'kalem__dokum-indirim') : ''}
  </ul>`;
}

export function satirHtml(s: HesapSatiri, duzenlenebilir = true): string {
  const anah = anahtar(s);
  const eklenir = eklenebilir(s.tip, s.id) > 0;
  // Üstü çizili tutar = indirimlerden önceki tutar (set: ayrı ayrı fiyat; ürün: kampanya öncesi fiyat + sepette indirim)
  const indirimsiz = s.birimAyriAyri ? s.birimAyriAyri * s.adet : s.birimFiyat * s.adet + satirKampanyaIndirimi(s, katalog);
  const once = indirimsiz > s.toplam ? indirimsiz : 0;
  const altSatir = `
        <div class="kalem__satir">
          ${duzenlenebilir ? `<div class="adet adet--kucuk" role="group" aria-label="${esc(s.ad)} adet">
            <button type="button" data-kalem-eksi="${anah}" aria-label="${s.adet > 1 ? 'Adedi azalt' : 'Sepetten çıkar'}">${ikonSvg(s.adet > 1 ? 'eksi' : 'cop', 16)}</button>
            <span class="adet__deger" aria-live="polite">${s.adet}</span>
            <button type="button" data-kalem-arti="${anah}" aria-label="Adedi artır"${eklenir ? '' : ' disabled'}>${ikonSvg('arti', 16)}</button>
          </div>` : `<span class="muted small">${s.adet} adet</span>`}
          <div class="kalem__fiyat">${once ? `<s>${formatTL(once)}</s>` : ''}<span class="${once ? 'fiyat--indirimli' : ''}">${formatTL(s.toplam)}</span></div>
        </div>`;
  if (s.tip === 'set') return setSatirHtml(s, altSatir, once);
  return `
    <div class="kalem">
      <a class="kalem__gorsel" href="${s.href}" tabindex="-1" aria-hidden="true">${s.gorsel ? `<img src="${s.gorsel}" alt="" width="72" height="88">` : ikonSvg(s.ikon, 28)}</a>
      <div>
        <a class="kalem__ad" href="${s.href}">${esc(s.ad)}</a>
        ${dokumHtml(s)}
        ${altSatir}
      </div>
    </div>`;
}

/**
 * Set satırı: tek bir çerçeve içinde set adı, içindeki her ürün kendi fotoğrafıyla (yoksa kategori ikonuyla)
 * tek tek, ardından set indirimi ve setin adet/tutar satırı.
 */
function setSatirHtml(s: HesapSatiri, altSatir: string, once: number): string {
  const set = setBul(s.id);
  const urunler = set?.kalemler.map((x) => ({ x, u: urunBul(x.urunId) })) ?? [];
  const urunSayisi = s.parcalar.reduce((t, p) => t + p.adet, 0);
  const yuzde = s.birimAyriAyri ? Math.round(((s.birimAyriAyri - s.birimFiyat) * 100) / s.birimAyriAyri) : 0;
  // Setteki bir ürün katalogda görünmüyorsa (taslak vb.) kısa içerik metnine dönülür
  const liste = urunler.length && urunler.every((k) => k.u)
    ? urunler.map(({ x, u }) => `
        <li class="set-kalem__urun">
          <span class="set-kalem__gorsel" aria-hidden="true">${u!.gorsel ? `<img src="${u!.gorsel}" alt="" width="44" height="52" loading="lazy">` : ikonSvg(u!.ikon, 20)}</span>
          <span class="set-kalem__bilgi"><span class="set-kalem__ad">${esc(`${u!.marka} ${u!.kisaAd}`)}</span><span class="set-kalem__adet">${x.adet * s.adet} adet</span></span>
          <span class="set-kalem__fiyat">${formatTL(u!.fiyat * x.adet * s.adet)}</span>
        </li>`).join('')
    : s.icerik ? `<li class="set-kalem__urun set-kalem__urun--metin">${esc(s.icerik)}</li>` : '';
  return `
    <div class="kalem kalem--set">
      <div class="set-kalem">
        <div class="set-kalem__ust">
          <span class="kalem__rozet">${ikonSvg('etiket', 12)}Set · ${urunSayisi} ürün</span>
          <a class="kalem__ad" href="${s.href}">${esc(s.ad)}</a>
        </div>
        <ul class="set-kalem__liste" aria-label="${esc(s.ad)} içindeki ürünler">${liste}</ul>
        ${once ? `<div class="set-kalem__indirim"><span>Set indirimi${yuzde ? ` (%${yuzde})` : ''}</span><span>−${formatTL(once - s.toplam)}</span></div>` : ''}
        ${altSatir}
      </div>
    </div>`;
}

export function toplamlarHtml(o: ReturnType<typeof sepetOzeti>): string {
  // Kampanya indirimi (fiyat geçmişinden doğrulanmış önceki fiyata göre). "Ürünler" indirimsiz tutarı gösterir,
  // indirim ayrı satırda düşülür: Ürünler − indirimler + kargo = Toplam (ödenen tutar değişmez).
  const kampanya = kampanyaIndirimi(o.satirlar, katalog);
  const avantaj = o.setIndirimi + o.sepetIndirimi + kampanya;
  return `
    <div class="toplamlar__detay"><span>Ürünler</span><span>${formatTL(o.urunlerToplami + kampanya)}</span></div>
    ${kampanya ? `<div class="kazanc toplamlar__detay"><span>İndirim</span><span>−${formatTL(kampanya)}</span></div>` : ''}
    ${o.setIndirimi ? `<div class="kazanc toplamlar__detay"><span>Set indirimi</span><span>−${formatTL(o.setIndirimi)}</span></div>` : ''}
    ${o.sepetIndirimi ? `<div class="kazanc toplamlar__detay"><span>Sepette indirim</span><span>−${formatTL(o.sepetIndirimi)}</span></div>` : ''}
    <div class="toplamlar__kargo"><span>Kargo</span><span>${o.kargo ? formatTL(o.kargo) : '<strong class="yesil">Bedava</strong>'}</span></div>
    <div class="genel"><span>Toplam${!o.kargo ? ' <small class="toplamlar__kargo-etiket">· Kargo bedava</small>' : ''}</span><span>${formatTL(o.toplam)}</span></div>
    ${avantaj > 0 ? `<p class="toplam-kazanc">${ikonSvg('etiket', 16)}<span>Toplam <strong>${formatTL(avantaj)}</strong> indirim kazandınız</span></p>` : ''}`;
}

function oneriBul() {
  const kul = urunKullanimi(kalemler, katalog);
  for (const id of kul.keys()) {
    const aday = urunBul(id)?.birlikte.map(urunBul).find((x) => !!x && !kul.has(x.id) && eklenebilir('urun', x.id) > 0);
    if (aday) return aday;
  }
  return undefined;
}

const birlikteKutulari = Array.from(document.querySelectorAll<HTMLElement>('[data-birlikte]'), (kutu) => ({
  id: kutu.dataset.birlikte!,
  buton: kutu.querySelector<HTMLButtonElement>('[data-sepete-ekle]')!,
  etiket: kutu.querySelector<HTMLElement>('[data-etiket]')!,
  not: kutu.querySelector<HTMLElement>('[data-birlikte-sepet-notu]')!,
}));

function seteGecis(id: string) {
  if (!setBul(id)) return;
  const gereken = urunKullanimi([{ tip: 'set', id, adet: 1 }], katalog);
  let aktarilan = 0;
  const taban = kalemler.flatMap((kalem) => {
    if (kalem.tip !== 'urun') return [kalem];
    const al = Math.min(kalem.adet, gereken.get(kalem.id) ?? 0);
    gereken.set(kalem.id, (gereken.get(kalem.id) ?? 0) - al);
    aktarilan += al;
    return al === kalem.adet ? [] : [{ ...kalem, adet: kalem.adet - al }];
  });
  if (aktarilan && eklenebilir('set', id, taban) > 0) return { taban, aktarilan };
}

function setleriYansit(): void {
  for (const { id, buton, etiket, not } of birlikteKutulari) {
    const gecis = seteGecis(id);
    const metin = gecis ? 'Sepette Bu Sete Geç' : 'Seti Sepete Ekle';
    buton.dataset.etiketMetni = metin;
    buton.toggleAttribute('data-sete-gec', !!gecis);
    if (!buton.classList.contains('is-added')) etiket.textContent = metin;
    not.hidden = !gecis;
    not.textContent = gecis ? `Sepetteki ${gecis.aktarilan} uygun ürün bu sete aktarılır.` : '';
  }
}

function yansit(): void {
  const o = sepetOzeti();
  setleriYansit();
  document.querySelectorAll<HTMLElement>('[data-sepet-sayi]').forEach((el) => {
    const once = el.textContent;
    el.textContent = String(o.adet);
    el.dataset.bos = o.adet ? 'false' : 'true';
    if (once !== String(o.adet) && o.adet) { el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump'); }
  });
  document.querySelectorAll('[data-cekmece-ac="sepet"]').forEach((b) => b.setAttribute('aria-label', o.adet ? `Sepeti aç, ${o.adet} ürün` : 'Sepeti aç, sepet boş'));

  const govde = document.querySelector<HTMLElement>('[data-sepet-govde]');
  const alt = document.querySelector<HTMLElement>('[data-sepet-alt]');
  const sayi = document.querySelector<HTMLElement>('[data-sepet-baslik-sayi]');
  if (!govde || !alt) return;
  if (sayi) sayi.textContent = o.adet ? `(${o.adet})` : '';

  if (!o.satirlar.length) {
    const hero = urunBul(katalog.heroId);
    govde.innerHTML = `
      <div class="bos-sepet">
        <div class="bos-sepet__ikon">${ikonSvg('canta', 40)}</div>
        <p><strong>Sepetiniz boş</strong></p>
        ${hero ? `<button class="btn btn--sepet" type="button" data-sepete-ekle data-tip="urun" data-id="${hero.id}" data-konum="bos-sepet">${esc(hero.kisaAd)} ekle · ${formatTL(hero.fiyat)}</button>` : ''}
        <p style="margin-top:12px"><a href="/urunler">Tüm ürünlere göz atın</a></p>
      </div>`;
    alt.hidden = true;
    return;
  }
  alt.hidden = false;
  const esik = katalog.kargo.ucretsizEsik;
  const kargoKutusu = o.kargoyaKalan > 0
    ? `<div class="kargo-ilerleme"><span>${ikonSvg('kargo', 18)} Kargo bedava için <strong>${formatTL(o.kargoyaKalan)}</strong> daha ekleyin</span><div class="kargo-ilerleme__bar"><span style="width:${Math.min(100, Math.round((o.araToplam / esik) * 100))}%"></span></div></div>`
    : `<div class="kargo-ilerleme is-tamam">${ikonSvg('tik', 18)} <span><strong>Kargo bedava!</strong></span></div>`;
  const oneri = oneriBul();
  const oneriHtml = oneri ? `
    <div class="oneri"><p class="oneri__baslik">Bununla iyi gider</p>
      <div class="oneri__oge">
        ${oneri.gorsel ? `<img src="${oneri.gorsel}" alt="" width="48" height="56">` : `<span class="oneri__yok">${ikonSvg(oneri.ikon, 22)}</span>`}
        <div><div class="oneri__ad">${esc(oneri.kisaAd)}</div><div class="oneri__fiyat">${formatTL(oneri.fiyat)}</div></div>
        <button class="btn btn--sepet btn--kucuk" type="button" data-sepete-ekle data-tip="urun" data-id="${oneri.id}" data-konum="sepet-oneri" data-sessiz>${ikonSvg('arti', 16)}Ekle</button>
      </div></div>` : '';

  govde.innerHTML = kargoKutusu + o.satirlar.map((s) => satirHtml(s)).join('') + oneriHtml;
  alt.innerHTML = `
    <div class="toplamlar">${toplamlarHtml(o)}</div>
    <a class="btn btn--sepet btn--block btn--buyuk" href="/odeme" data-odemeye-gec>${ikonSvg('kilit', 18)}Ödemeye Geç</a>
    <button class="btn btn--ghost btn--block" type="button" data-cekmece-kapat>Alışverişe devam et</button>`;
}

/* ---------------- Tıklamalar ---------------- */
let mesgul = false;
const bildirimZamanlari = new WeakMap<HTMLElement, number>();
function adetKaynagi(btn: HTMLElement): number {
  const el = btn.dataset.adetKaynak ? document.querySelector<HTMLElement>(btn.dataset.adetKaynak) : null;
  const n = el ? parseInt(el.textContent || '1', 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}
function geriBildirim(btn: HTMLElement, mesaj: string): void {
  const et = btn.querySelector<HTMLElement>('[data-etiket]');
  const eski = btn.dataset.etiketMetni ?? et?.textContent;
  if (eski) btn.dataset.etiketMetni = eski;
  btn.classList.add('is-added');
  if (et) et.textContent = `${mesaj} ✓`;
  window.clearTimeout(bildirimZamanlari.get(btn));
  bildirimZamanlari.set(btn, window.setTimeout(() => {
    btn.classList.remove('is-added');
    if (et && btn.dataset.etiketMetni) et.textContent = btn.dataset.etiketMetni;
  }, 1400));
}

document.addEventListener('click', (e) => {
  const t = (e.target as Element).closest<HTMLElement>('[data-sepete-ekle], [data-hemen-al], [data-kalem-arti], [data-kalem-eksi], [data-odemeye-gec]');
  if (!t) return;

  if (t.hasAttribute('data-sepete-ekle')) {
    if (mesgul) return;
    mesgul = true; window.setTimeout(() => (mesgul = false), 500);
    const tip = (t.dataset.tip as KalemTipi) || 'urun', id = t.dataset.id!;
    const gecis = t.hasAttribute('data-sete-gec') ? seteGecis(id) : undefined;
    if (t.hasAttribute('data-sete-gec') && !gecis) { setleriYansit(); return; }
    const n = ekle(tip, id, gecis ? 1 : adetKaynagi(t), gecis?.taban);
    if (!n) return;
    geriBildirim(t, gecis ? 'Sete geçildi' : 'Eklendi');
    // Sepet içindeki öneriden ekleniyorsa sepet zaten açıktır; diğer tüm "Sepete Ekle" tıklamalarında sepet çekmecesi doğrudan açılır.
    if (t.hasAttribute('data-sessiz')) return;
    cekmeceAc('sepet', tip === 'set' ? undefined : document.querySelector<HTMLElement>('[data-odemeye-gec]'));
    return;
  }

  if (t.hasAttribute('data-hemen-al')) {
    const tip = (t.dataset.tip as KalemTipi) || 'urun', id = t.dataset.id!;
    const istenen = adetKaynagi(t);
    const mevcut = kalemler.find((k) => k.tip === tip && k.id === id)?.adet ?? 0;
    if (mevcut < istenen) ekle(tip, id, istenen - mevcut);
    track('quick_buy_click', { item_id: id });
    if (kalemler.length) { t.classList.add('is-yukleniyor'); location.href = '/odeme'; }
    return;
  }

  const ana = t.dataset.kalemArti || t.dataset.kalemEksi;
  if (ana) {
    const [tip, ...p] = ana.split(':');
    const k = kalemler.find((x) => x.tip === tip && x.id === p.join(':'));
    if (k) {
      adetAyarla(k.tip, k.id, k.adet + (t.hasAttribute('data-kalem-arti') ? 1 : -1));
      // Tutar değişimini görünür kıl
      document.querySelectorAll(`[data-kalem-arti="${ana}"]`).forEach((b) => {
        b.closest('.kalem')?.querySelector('.kalem__fiyat')?.classList.add('is-guncellendi');
      });
      document.querySelectorAll('.toplamlar .genel span:last-child').forEach((el) => el.classList.add('is-guncellendi'));
    }
    return;
  }

  // begin_checkout ödeme sayfası açılınca gönderilir (scripts/odeme.ts); iki kez sayılmasın
});

document.getElementById('sepet')?.addEventListener('cekmece:acildi', () => {
  const o = sepetOzeti();
  if (o.satirlar.length) track('view_cart', { currency: 'TRY', value: o.toplam, items: satirlardanUrunler(o.satirlar) });
  window.setTimeout(() => document.querySelector('[data-sepet-bildirim]')?.classList.remove('is-visible'), 3500);
});

/* Ürün sayfası adet seçici */
document.querySelectorAll<HTMLElement>('[data-adet-secici]').forEach((kutu) => {
  const deger = kutu.querySelector<HTMLElement>('[data-adet-deger]')!;
  const azalt = kutu.querySelector<HTMLButtonElement>('[data-adet-azalt]')!;
  const artir = kutu.querySelector<HTMLButtonElement>('[data-adet-artir]')!;
  const maks = parseInt(kutu.dataset.maks || '5', 10);
  let n = 1;
  const goster = () => { deger.textContent = String(n); azalt.disabled = n <= 1; artir.disabled = n >= maks; };
  azalt.addEventListener('click', () => { n = Math.max(1, n - 1); goster(); });
  artir.addEventListener('click', () => { n = Math.min(maks, n + 1); goster(); });
  goster();
});

yansit();

/* ---------------- Sepet hatırlatma: geri gelen ziyaretçiye nazik bir kart ---------------- */
(() => {
  if (/^\/(odeme|siparis)/.test(location.pathname) || !kalemler.length) return;
  let gosterildi = false;
  try { gosterildi = !!sessionStorage.getItem('sepet-hatirlatma'); } catch { /* yok */ }
  const dahili = document.referrer && new URL(document.referrer).host === location.host;
  if (gosterildi || dahili) return;
  window.setTimeout(() => {
    const o = sepetOzeti();
    if (!o.satirlar.length) return;
    try { sessionStorage.setItem('sepet-hatirlatma', '1'); } catch { /* yok */ }
    const ilk = o.satirlar[0]!;
    const kart = document.createElement('div');
    kart.className = 'hatirlatma';
    kart.setAttribute('role', 'status');
    kart.innerHTML = `
      ${ilk.gorsel ? `<img src="${ilk.gorsel}" alt="">` : `<span class="oneri__yok">${ikonSvg(ilk.ikon, 22)}</span>`}
      <div class="hatirlatma__metin"><strong>Sepetin seni bekliyor</strong>${o.adet} ürün · ${formatTL(o.toplam)}</div>
      <button class="btn btn--sepet btn--kucuk" type="button" data-cekmece-ac="sepet">Tamamla</button>
      <button class="hatirlatma__kapat" type="button" aria-label="Kapat">${ikonSvg('kapat', 14)}</button>`;
    document.body.appendChild(kart);
    requestAnimationFrame(() => kart.classList.add('is-visible'));
    const kapat = () => { kart.classList.remove('is-visible'); window.setTimeout(() => kart.remove(), 400); };
    kart.addEventListener('click', (e) => { if ((e.target as Element).closest('.hatirlatma__kapat, [data-cekmece-ac]')) kapat(); });
    window.setTimeout(kapat, 12000);
  }, 2500);
})();
