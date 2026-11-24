/* Al Lulu Home — arayüz davranışları: çekmeceler, galeri, kargo sayacı, alt çubuk, animasyonlar */
import { katalog } from './katalog';
import { track } from './analitik';

const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll<T>(s));

export const azHareket = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (/[?&]dev\b/.test(location.search)) document.documentElement.classList.add('dev');

/* ---------------- Toast ---------------- */
let toastZaman: number | undefined;
export function toast(mesaj: string, baglanti?: { metin: string; href?: string; cekmece?: string }): void {
  const el = $('[data-toast]');
  if (!el) return;
  el.innerHTML = '';
  const s = document.createElement('span');
  s.textContent = mesaj;
  el.appendChild(s);
  if (baglanti) {
    const a = document.createElement(baglanti.href ? 'a' : 'button');
    a.className = 'toast__link';
    a.textContent = baglanti.metin;
    if (baglanti.href) (a as HTMLAnchorElement).href = baglanti.href;
    else { (a as HTMLButtonElement).type = 'button'; a.setAttribute('data-cekmece-ac', baglanti.cekmece ?? 'sepet'); }
    el.appendChild(a);
  }
  el.classList.add('is-visible');
  window.clearTimeout(toastZaman);
  toastZaman = window.setTimeout(() => el.classList.remove('is-visible'), 3200);
}

/* ---------------- Çekmeceler (kategori paneli + sepet) ---------------- */
const perde = $('[data-perde]');
let acik: HTMLElement | null = null;
let oncekiOdak: HTMLElement | null = null;

const odaklanabilir = (kok: HTMLElement) =>
  $$<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])', kok).filter((e) => e.offsetParent !== null);

/* Çekmece açıkken arkadaki sayfa ekran okuyucu ve klavye için erişilemez olur (inert) — denetim AUD-025 */
let arkaPlan: HTMLElement[] = [];
function arkaPlaniKapat(el: HTMLElement): void {
  arkaPlan = $$<HTMLElement>('body > *').filter((x) => x !== el && x !== perde && !x.contains(el) && !x.inert
    && !x.matches('script, style, template, [aria-live], [role="status"], [role="alert"]'));
  arkaPlan.forEach((x) => { x.inert = true; });
}
function arkaPlaniAc(): void {
  arkaPlan.forEach((x) => { x.inert = false; });
  arkaPlan = [];
}

export function cekmeceAc(id: string, odak?: HTMLElement | null): void {
  const el = document.getElementById(id);
  if (!el || !perde) return;
  if (acik === el) return;
  if (acik) cekmeceKapat(true);
  oncekiOdak = document.activeElement as HTMLElement;
  el.hidden = false;
  perde.hidden = false;
  void el.offsetWidth;
  el.classList.add('is-open');
  perde.classList.add('is-open');
  document.documentElement.classList.add('kilitli');
  $$(`[data-cekmece-ac="${id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'true'));
  acik = el;
  arkaPlaniKapat(el);
  const hedef: HTMLElement = odak ?? $<HTMLElement>('[data-cekmece-kapat]', el) ?? el;
  hedef.focus({ preventScroll: true });
  el.dispatchEvent(new CustomEvent('cekmece:acildi'));
}

export function cekmeceKapat(hemen = false): void {
  const el = acik;
  if (!el || !perde) return;
  acik = null;
  arkaPlaniAc();
  el.classList.remove('is-open');
  perde.classList.remove('is-open');
  document.documentElement.classList.remove('kilitli');
  $$(`[data-cekmece-ac="${el.id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'false'));
  const bitir = () => { if (acik !== el) { el.hidden = true; if (!acik) perde.hidden = true; } };
  if (hemen || azHareket) bitir(); else window.setTimeout(bitir, 300);
  if (!hemen) oncekiOdak?.focus?.({ preventScroll: true });
}

document.addEventListener('click', (e) => {
  const t = (e.target as Element).closest<HTMLElement>('[data-cekmece-ac], [data-cekmece-kapat], [data-perde], .cekmece a[href]');
  if (!t) return;
  if (t.hasAttribute('data-cekmece-ac')) {
    const id = t.getAttribute('data-cekmece-ac')!;
    if (acik?.id === id) cekmeceKapat(); else cekmeceAc(id);
    if (id === 'kategori-paneli') track('menu_open');
  } else if (t.hasAttribute('data-cekmece-kapat') || t.hasAttribute('data-perde')) {
    cekmeceKapat();
  } else {
    const url = new URL((t as HTMLAnchorElement).href, location.href);
    if (url.pathname === location.pathname && url.hash) cekmeceKapat(true);
  }
});

document.addEventListener('keydown', (e) => {
  if (!acik) return;
  if (e.key === 'Escape') { cekmeceKapat(); return; }
  if (e.key === 'Tab') {
    const f = odaklanabilir(acik);
    if (!f.length) return;
    const ilk = f[0]!, son = f[f.length - 1]!;
    if (e.shiftKey && document.activeElement === ilk) { e.preventDefault(); son.focus(); }
    else if (!e.shiftKey && document.activeElement === son) { e.preventDefault(); ilk.focus(); }
  }
});

// Mobilde alttan açılan panelleri aşağı kaydırarak kapat
$$('.cekmece').forEach((el) => {
  let y0 = 0, d = 0, aktif = false;
  $$('.cekmece__tutamac, .cekmece__bas', el).forEach((z) => {
    z.addEventListener('touchstart', (e) => { y0 = e.touches[0]!.clientY; d = 0; aktif = window.innerWidth < 700; if (aktif) el.style.transition = 'none'; }, { passive: true });
    z.addEventListener('touchmove', (e) => { if (!aktif) return; d = Math.max(0, e.touches[0]!.clientY - y0); el.style.transform = `translateY(${d}px)`; }, { passive: true });
    z.addEventListener('touchend', () => { if (!aktif) return; aktif = false; el.style.transition = ''; el.style.transform = ''; if (d > 80) cekmeceKapat(); });
  });
});

/* ---------------- Duyuru şeridi ---------------- */
(() => {
  const m = $$('.duyuru__madde');
  if (m.length < 2 || azHareket) return;
  let i = 0;
  window.setInterval(() => {
    if (document.hidden) return;
    m[i]!.classList.remove('is-active'); m[i]!.setAttribute('aria-hidden', 'true');
    i = (i + 1) % m.length;
    m[i]!.classList.add('is-active'); m[i]!.removeAttribute('aria-hidden');
  }, 3800);
})();

/* ---------------- Header: mobilde aşağı kayarken gizle ---------------- */
(() => {
  const h = $('[data-header]');
  if (!h) return;
  const mobil = window.matchMedia('(max-width: 899px)');
  let sonY = window.scrollY, bekliyor = false;
  window.addEventListener('scroll', () => {
    if (bekliyor) return;
    bekliyor = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      h.classList.toggle('is-golgeli', y > 8);
      const altMenu = $('[data-alt-menu]');
      if (mobil.matches && !acik) {
        if (y > sonY + 6 && y > 160) { h.classList.add('is-hidden'); altMenu?.classList.add('is-gizli'); }
        else if (y < sonY - 6) { h.classList.remove('is-hidden'); altMenu?.classList.remove('is-gizli'); }
      } else { h.classList.remove('is-hidden'); altMenu?.classList.remove('is-gizli'); }
      sonY = y; bekliyor = false;
    });
  }, { passive: true });
})();

/* ---------------- Kaydırınca beliren içerik ---------------- */
(() => {
  if (azHareket || !('IntersectionObserver' in window)) return;
  const ogeler = $$('[data-reveal]').filter((el) => el.getBoundingClientRect().top >= window.innerHeight);
  if (!ogeler.length) return;
  const g = new IntersectionObserver((girdiler) => {
    girdiler.forEach((gi, i) => {
      if (!gi.isIntersecting) return;
      const el = gi.target as HTMLElement;
      el.style.setProperty('--giris-gecikmesi', `${Math.min(i, 3) * 32}ms`);
      el.classList.add('gorundu');
      g.unobserve(el);
    });
  });
  ogeler.forEach((o) => g.observe(o));
})();

/* ---------------- Galeri ---------------- */
$$('[data-galeri]').forEach((gal) => {
  const ray = $('[data-galeri-ray]', gal)!;
  const slaytlar = $$('.galeri__slayt', ray);
  if (slaytlar.length < 2) return;
  const kucukRay = $('[data-galeri-kucukler]', gal);
  const kucukler = $$('[data-galeri-kucuk]', gal);
  const noktalar = $$('.galeri__noktalar span', gal);
  const sayac = $('[data-galeri-sayac]', gal);
  let aktif = 0, secilen: number | undefined, goruldu = false;
  const isaretle = (i: number) => {
    aktif = i;
    noktalar.forEach((n, j) => n.classList.toggle('is-active', j === i));
    kucukler.forEach((b, j) => b.setAttribute('aria-current', j === i ? 'true' : 'false'));
    const kucuk = kucukler[i];
    if (kucukRay && kucuk) {
      const alan = kucukRay.getBoundingClientRect(), dugme = kucuk.getBoundingClientRect();
      const kayma = (bas: number, son: number, sinirBas: number, sinirSon: number) =>
        bas < sinirBas ? bas - sinirBas : Math.max(0, son - sinirSon);
      const left = kayma(dugme.left, dugme.right, alan.left, alan.right);
      const top = kayma(dugme.top, dugme.bottom, alan.top, alan.bottom);
      if (left || top) kucukRay.scrollBy({ left, top, behavior: 'instant' });
    }
    if (sayac) sayac.textContent = `${i + 1} / ${slaytlar.length}`;
    gal.dataset.aktif = String(i);
    if (i > 0 && !goruldu) { goruldu = true; track('view_item_gallery'); }
  };
  const git = (i: number) => {
    i = (i + slaytlar.length) % slaytlar.length;
    const sol = slaytlar[i]!.getBoundingClientRect().left - slaytlar[0]!.getBoundingClientRect().left;
    secilen = i;
    ray.scrollTo({ left: sol, behavior: azHareket ? 'auto' : 'smooth' });
  };
  let raf = 0;
  ray.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (!ray.clientWidth) return;
      const i = Math.round(ray.scrollLeft / ray.clientWidth);
      if (i === secilen && Math.abs(ray.scrollLeft - i * ray.clientWidth) < 1.5) secilen = undefined;
      if (i !== aktif) isaretle(Math.max(0, Math.min(slaytlar.length - 1, i)));
    });
  }, { passive: true });
  const secimiBirak = () => { secilen = undefined; };
  ray.addEventListener('pointerdown', secimiBirak, { passive: true });
  ray.addEventListener('wheel', secimiBirak, { passive: true });
  ray.addEventListener('scrollend', secimiBirak);
  kucukler.forEach((b, i) => b.addEventListener('click', () => git(i)));
  $('[data-galeri-onceki]', gal)?.addEventListener('click', () => git((secilen ?? aktif) - 1));
  $('[data-galeri-sonraki]', gal)?.addEventListener('click', () => git((secilen ?? aktif) + 1));
  ray.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); git((secilen ?? aktif) + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); git((secilen ?? aktif) - 1); }
  });
});

/* ---------------- Kargo sayacı (gerçek kesim saatine göre, Türkiye saati) ---------------- */
(() => {
  const kutular = $$('[data-kargo-sayac]');
  if (!kutular.length) return;
  /* Saat her zaman Türkiye saatine göre (UTC+3, yaz saati yok): tarayıcının saat dilimi farklı olsa da sayaç doğru kalır.
   * "tr" tarihlerinin UTC alanları Türkiye yerel saatini taşır. Resmî tatillerde kargo çıkmaz (denetim AUD-027). */
  const TR_FARK = 3 * 3600_000;
  const trSimdi = () => new Date(Date.now() + TR_FARK);
  const gunKodu = (d: Date) => d.toISOString().slice(0, 10);
  const SABIT_TATILLER = ['01-01', '04-23', '05-01', '05-19', '07-15', '08-30', '10-29'];
  // Dini bayramlar (Diyanet takvimi). Yeni yıl gelince eklenmeli.
  const DINI_BAYRAMLAR = new Set([
    '2026-03-20', '2026-03-21', '2026-03-22', '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30',
    '2027-03-09', '2027-03-10', '2027-03-11', '2027-05-16', '2027-05-17', '2027-05-18', '2027-05-19',
  ]);
  const tatilMi = (d: Date) => SABIT_TATILLER.includes(gunKodu(d).slice(5)) || DINI_BAYRAMLAR.has(gunKodu(d));
  const haftaSonu = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
  const isGunu = (d: Date) => !haftaSonu(d) && !tatilMi(d);
  const isGunuEkle = (d: Date, n: number) => { const x = new Date(d); while (n > 0) { x.setUTCDate(x.getUTCDate() + 1); if (isGunu(x)) n--; } return x; };
  const gunAy = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const gunAdi = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', timeZone: 'UTC' });
  const { kesimSaati, teslimGun } = katalog.kargo;
  const guncelle = () => {
    const simdi = trSimdi();
    const kesim = new Date(simdi); kesim.setUTCHours(kesimSaati, 0, 0, 0);
    const bugun = isGunu(simdi) && simdi < kesim;
    const kargoGunu = bugun ? simdi : isGunuEkle(simdi, 1);
    let satir: string;
    if (bugun) {
      const dk = Math.max(1, Math.ceil((kesim.getTime() - simdi.getTime()) / 60000));
      const sa = Math.floor(dk / 60), kalan = dk % 60;
      satir = `<span class="sayac-sure"><strong>${sa ? `${sa} saat ${kalan} dakika` : `${kalan} dakika`}</strong></span> içinde sipariş verirsen <span class="gun-rozet">Bugün</span> kargoda`;
    } else {
      const yarin = new Date(simdi); yarin.setUTCDate(yarin.getUTCDate() + 1);
      const gun = gunKodu(kargoGunu) === gunKodu(yarin) ? 'Yarın' : gunAdi.format(kargoGunu);
      // "14:00'e kadar aynı gün kargo" duyurusuyla çelişmesin: neden bugün değil, açıkça söyle
      const neden = tatilMi(simdi) ? 'Bugün resmî tatil, kargo çıkmıyor.'
        : haftaSonu(simdi) ? 'Hafta sonu kargo çıkmıyor.' : `Bugünkü kargo ${kesimSaati}:00'te çıktı.`;
      satir = `${neden} Şimdi sipariş verirsen <span class="gun-rozet">${gun}</span> kargoda`;
    }
    const bas = isGunuEkle(kargoGunu, teslimGun[0]), son = isGunuEkle(kargoGunu, teslimGun[1]);
    const aralik = bas.getUTCMonth() === son.getUTCMonth() ? `${bas.getUTCDate()}–${gunAy.format(son)}` : `${gunAy.format(bas)} – ${gunAy.format(son)}`;
    kutular.forEach((k) => {
      const s = $('[data-kargo-satir]', k); if (s) s.innerHTML = satir;
      const t = $('[data-teslim-aralik]', k); if (t) t.textContent = aralik;
      const t2 = $('[data-teslim-tarih]', k); if (t2) t2.textContent = aralik;
    });
  };
  guncelle();
  window.setInterval(guncelle, 30000);
})();

/* ---------------- Ürün sayfası: mobil alt satın alma çubuğu ---------------- */
(() => {
  const cubuk = $('[data-alt-cubuk]');
  const cta = $('[data-ana-cta]');
  if (!cubuk || !cta || !('IntersectionObserver' in window)) return;
  let ctaGorunur = true, sonda = false;
  const guncelle = () => {
    const goster = !ctaGorunur && !sonda;
    cubuk.classList.toggle('is-visible', goster);
    cubuk.setAttribute('aria-hidden', goster ? 'false' : 'true');
    $$('button, a', cubuk).forEach((b) => (b.tabIndex = goster ? 0 : -1));
  };
  // Buton TAM görünmüyorsa (yarım kesikse) alttaki çubuk çıksın
  new IntersectionObserver(([e]) => { ctaGorunur = !!e && e.intersectionRatio >= 0.95; guncelle(); }, { threshold: [0, 0.5, 0.95, 1] }).observe(cta);
  const f = $('#footer');
  if (f) new IntersectionObserver(([e]) => { sonda = !!e?.isIntersecting; guncelle(); }).observe(f);
})();

/* ---------------- Fırsat geri sayımı (panelde girilen GERÇEK bitiş saati) ---------------- */
(() => {
  const sayaclar = $$('[data-firsat-sayac]').flatMap((kutu) => {
    const bitis = Date.parse(kutu.dataset.firsatSayac ?? '');
    const sure = $('[data-firsat-sure]', kutu), tarih = $('[data-firsat-bitis]', kutu);
    const gunBolumu = sure && $('[data-firsat-gun]', sure);
    const sayilar = sure ? $$('[data-firsat-deger]', sure) : [];
    return Number.isFinite(bitis) && sure && tarih && gunBolumu && sayilar.length === 4
      ? [{ kutu, bitis, sure, tarih, gunBolumu, sayilar }] : [];
  });
  if (!sayaclar.length) return;
  const iki = (n: number) => String(n).padStart(2, '0');
  let yenileniyor = false;
  const tik = () => {
    const simdi = Date.now();
    for (const { kutu, bitis, sure, tarih, gunBolumu, sayilar } of sayaclar) {
      if (kutu.hidden) continue;
      const kalan = bitis - simdi;
      if (kalan <= 0) {
        kutu.hidden = true;
        if (yenileniyor) continue;
        const anahtar = `firsat-yenile:${location.pathname}:${bitis}`;
        try {
          if (sessionStorage.getItem(anahtar)) continue;
          sessionStorage.setItem(anahtar, '1');
        } catch { /* Depolama kapalıyken yeniden yükleme döngüsü oluşturma. */
          continue;
        }
        yenileniyor = true;
        window.setTimeout(() => location.reload(), 600);
        continue;
      }
      const sn = Math.ceil(kalan / 1000), gun = Math.floor(sn / 86400);
      const degerler = [String(gun), iki(Math.floor((sn % 86400) / 3600)), iki(Math.floor((sn % 3600) / 60)), iki(sn % 60)];
      sayilar.forEach((el, i) => { if (el.textContent !== degerler[i]) el.textContent = degerler[i]!; });
      gunBolumu.hidden = gun === 0;
      if (sure.hidden) {
        sure.hidden = false;
        tarih.classList.add('visually-hidden');
      }
      kutu.classList.toggle('is-yaklasiyor', kalan <= 3600000);
    }
  };
  tik();
  window.setInterval(tik, 1000);
})();

/* ---------------- Pişirme kartları: dokununca detay ---------------- */
document.addEventListener('click', (e) => {
  const kart = (e.target as Element).closest<HTMLElement>('[data-pisirme-kart]');
  if (!kart) return;
  const acik = kart.getAttribute('aria-expanded') === 'true';
  kart.setAttribute('aria-expanded', String(!acik));
  if (!acik) track('cooking_time_open', { yemek: kart.querySelector('.pisirme-kucuk__yemek')?.textContent });
});

/* ---------------- SSS takibi ---------------- */
$$<HTMLDetailsElement>('[data-sss] details').forEach((d) => {
  d.addEventListener('toggle', () => { if (d.open) track('faq_open', { question: d.querySelector('summary')?.textContent?.trim() }); });
});
