import { formatTL, sepetteFiyat, setToplamlari } from '../lib/fiyat';
import { kod, sayiCoz } from '../lib/form';

const root = document.documentElement;
const menuDugmeleri = [...document.querySelectorAll<HTMLButtonElement>('[data-menu-ac]')];
const scrim = document.querySelector<HTMLElement>('[data-menu-kapat]');
const dar = matchMedia('(max-width: 999px)');
const arama = document.querySelector<HTMLDialogElement>('[data-panel-arama]');
let menuOdak: HTMLButtonElement | undefined;

function mobilMenu(acik: boolean) {
  root.dataset.yMobile = acik ? 'acik' : 'kapali';
  if (scrim) scrim.hidden = !acik;
  for (const dugme of menuDugmeleri) dugme.setAttribute('aria-expanded', String(acik));
}
function menuDurumu() {
  mobilMenu(false);
  if (!dar.matches) menuDugmeleri[0]?.setAttribute('aria-expanded', String(root.dataset.yMenu !== 'kapali'));
}
menuDurumu();
dar.addEventListener('change', menuDurumu);
window.addEventListener('pageshow', (e) => { if (e.persisted) menuDurumu(); });
for (const dugme of menuDugmeleri) dugme.addEventListener('click', () => {
  if (dar.matches) {
    menuOdak = dugme;
    mobilMenu(root.dataset.yMobile !== 'acik');
    if (root.dataset.yMobile === 'acik') document.querySelector<HTMLElement>('.y-sidebar .is-grup, .y-sidebar .y-nav-link')?.focus();
    return;
  }
  root.dataset.yMenu = root.dataset.yMenu === 'kapali' ? 'acik' : 'kapali';
  try { localStorage.setItem('y-menu', root.dataset.yMenu); } catch {}
  menuDurumu();
});
function mobilMenuKapat() { mobilMenu(false); menuOdak?.focus(); }
scrim?.addEventListener('click', mobilMenuKapat);
document.querySelector('.y-sidebar')?.addEventListener('click', (e) => {
  if (dar.matches && (e.target as Element).closest('a')) mobilMenu(false);
});

function aramayiAc() {
  const yerel = document.querySelector<HTMLInputElement>('.y-toolbar input[type="search"]');
  if (yerel) { yerel.focus(); yerel.select(); return; }
  if (!arama?.open) arama?.showModal();
  arama?.querySelector('input')?.focus();
}
document.querySelector('[data-panel-ara]')?.addEventListener('click', aramayiAc);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); aramayiAc(); }
  if (e.key === 'Escape' && root.dataset.yMobile === 'acik') mobilMenuKapat();
});

const degistir = (el: Element | null) => el?.closest('form')?.dispatchEvent(new Event('input', { bubbles: true }));
document.addEventListener('click', (e) => {
  const hedef = e.target as Element;
  const dialogId = hedef.closest<HTMLElement>('[data-y-dialog]')?.dataset.yDialog;
  const dialog = dialogId && document.getElementById(dialogId);
  if (dialog instanceof HTMLDialogElement && !dialog.open) {
    dialog.showModal();
    dialog.querySelector<HTMLElement>('input:not([type="hidden"]), select')?.focus();
  }
  const kopya = hedef.closest<HTMLButtonElement>('[data-kopyala]');
  if (kopya?.dataset.kopyala) {
    const deger = kopya.dataset.kopyala;
    const tamam = (ok: boolean) => {
      if (ok) bildirim('Kopyalandı: ' + deger);
      else if (!kopya.querySelector('svg')) kopya.textContent = deger;
    };
    if (navigator.clipboard) void navigator.clipboard.writeText(deger).then(() => tamam(true), () => tamam(false));
    else tamam(false);
  }
  const onay = hedef.closest<HTMLElement>('[data-onayla]')?.dataset.onayla;
  if (onay && !confirm(onay)) { e.preventDefault(); return; }
  const ekle = hedef.closest('[data-tekrar-ekle]');
  const sablon = ekle?.parentElement?.querySelector('template');
  if (ekle && sablon?.content.firstElementChild) {
    const satir = sablon.content.firstElementChild.cloneNode(true) as HTMLElement;
    ekle.before(satir);
    satir.querySelector<HTMLElement>('input, textarea, select')?.focus();
    degistir(satir);
  }
  const sil = hedef.closest('[data-tekrar-sil]');
  if (sil) {
    const form = sil.closest('form');
    sil.closest('.y-tekrar__satir')?.remove();
    degistir(form);
  }
  const ana = hedef.closest('[data-ana-foto]');
  if (ana) {
    const gorsel = ana.closest('.y-gorsel');
    if (!gorsel) return;
    gorsel.parentElement?.prepend(gorsel);
    const yeniAna = gorsel.closest('form')?.querySelector<HTMLInputElement>('[name="yeniAnaFoto"]');
    if (yeniAna) yeniAna.value = '';
    gorsel.closest('form')?.querySelectorAll('[data-yeni-ana]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    gorsel.parentElement?.querySelectorAll('.y-gorsel').forEach((node, i) => {
      const girdi = node.querySelector<HTMLInputElement>('[name="gorsel_sira"]');
      if (girdi) girdi.value = String(i + 1);
      node.classList.toggle('y-gorsel--ana', i === 0);
    });
    degistir(gorsel);
  }
});

document.querySelectorAll<HTMLDialogElement>('dialog[data-hata-ac="1"]').forEach((d) => d.showModal());

for (const alan of document.querySelectorAll<HTMLElement>('[data-panel-secim]')) {
  const kayitlar = [...alan.querySelectorAll<HTMLElement>('[data-panel-kayit]')];
  const dugmeler = [...alan.querySelectorAll<HTMLElement>('[data-panel-sec]')];
  const bos = alan.querySelector<HTMLElement>('[data-panel-bos]');
  const kaydiBirak = () => {
    const form = kayitlar.find((x) => !x.hidden)?.querySelector<HTMLFormElement>('form[data-editor]');
    if (!form || !degisenler.has(form)) return true;
    if (!confirm('Kaydedilmemiş değişiklikler silinsin mi?')) return false;
    form.reset();
    form.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
  const sec = (id?: string, adresGuncelle = false) => {
    const aktifKayit = kayitlar.find((k) => k.id === id);
    for (const kayit of kayitlar) kayit.hidden = kayit.id !== id;
    for (const dugme of dugmeler) {
      const secili = dugme.dataset.panelSec === id;
      dugme.setAttribute('aria-expanded', String(secili));
      dugme.closest('tr')?.classList.toggle('is-inceleme', secili);
    }
    if (bos) bos.hidden = !!id;
    alan.classList.toggle('has-secim', !!id);
    if (adresGuncelle && alan.classList.contains('sm-calisma-duzeni')) {
      const u = new URL(location.href);
      u.searchParams.delete('hizli');
      if (aktifKayit?.dataset.siparisAnahtar) u.searchParams.set('sec', aktifKayit.dataset.siparisAnahtar);
      else u.searchParams.delete('sec');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    }
  };
  const ilk = kayitlar.find((x) => !x.hidden);
  sec(ilk?.id);
  alan.dataset.panelHazir = '1';
  for (const dugme of dugmeler) {
    if (dugme instanceof HTMLButtonElement) dugme.hidden = false;
    dugme.addEventListener('click', (e) => {
      if (e instanceof MouseEvent && (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0)) return;
      const kayit = kayitlar.find((x) => x.id === dugme.dataset.panelSec);
      if (!kayit) return;
      e.preventDefault();
      if (!kaydiBirak()) return;
      sec(kayit.hidden ? kayit.id : undefined, true);
      if (!kayit.hidden) {
        if (matchMedia('(max-width: 1199px)').matches) kayit.scrollIntoView({ block: 'start' });
        kayit.querySelector<HTMLElement>('[data-panel-kapat]')?.focus({ preventScroll: true });
      }
    });
  }
  for (const kayit of kayitlar) {
    kayit.querySelector('[data-panel-kapat]')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (!kaydiBirak()) return;
      sec(undefined, true);
      dugmeler.find((x) => x.dataset.panelSec === kayit.id)?.focus();
    });
    kayit.querySelectorAll<HTMLButtonElement>('[data-panel-gecis]').forEach((gecis) => {
      gecis.addEventListener('click', () => {
        const hedefId = gecis.dataset.panelGecis;
        if (!hedefId || !kaydiBirak()) return;
        sec(hedefId, true);
      });
    });
    const sekmeDugmeleri = [...kayit.querySelectorAll<HTMLButtonElement>('[data-sp-sekme]')];
    const sekmeIcerikleri = [...kayit.querySelectorAll<HTMLElement>('[data-sp-icerik]')];
    const sekmeAc = (ad: string) => {
      for (const b of sekmeDugmeleri) b.setAttribute('aria-selected', String(b.dataset.spSekme === ad));
      for (const c of sekmeIcerikleri) c.hidden = c.dataset.spIcerik !== ad;
    };
    for (const b of sekmeDugmeleri) {
      b.addEventListener('click', () => { if (b.dataset.spSekme) sekmeAc(b.dataset.spSekme); });
    }
    kayit.querySelectorAll<HTMLButtonElement>('[data-sp-odak]').forEach((odakBtn) => {
      odakBtn.addEventListener('click', () => {
        if (odakBtn.dataset.spHedefSekme) sekmeAc(odakBtn.dataset.spHedefSekme);
        const kutu = odakBtn.dataset.spOdak ? document.getElementById(odakBtn.dataset.spOdak) : null;
        if (kutu) {
          kutu.classList.add('is-vurgulu');
          kutu.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          kutu.querySelector<HTMLElement>('input:not([type="hidden"]), select, button')?.focus({ preventScroll: true });
          window.setTimeout(() => kutu.classList.remove('is-vurgulu'), 1800);
        }
      });
    });
  }
}

/* ---------- Çift tıklama koruması: tek-gönderimli işlem formları ---------- */
document.addEventListener('submit', (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-tek-gonder')) return;
  if (form.dataset.gonderiliyor === '1') { e.preventDefault(); return; }
  form.dataset.gonderiliyor = '1';
  const gonderen = (e as SubmitEvent).submitter;
  if (gonderen instanceof HTMLButtonElement) {
    window.setTimeout(() => { gonderen.disabled = true; }, 0);
  }
});

/* ---------- Sipariş listesi: toplu işlem çubuğu (yalnızca seçim yapınca görünür) ---------- */
const toplu = document.querySelector<HTMLElement>('[data-y-toplu]');
if (toplu) {
  const kutular = [...document.querySelectorAll<HTMLInputElement>('[data-y-secim-kutusu]')];
  const tumu = document.querySelector<HTMLInputElement>('[data-y-tumu]');
  const sayac = toplu.querySelector<HTMLElement>('[data-y-secim]');
  const onizleme = toplu.querySelector<HTMLElement>('[data-y-secim-onizleme]');
  const topluOnay = document.querySelector<HTMLDialogElement>('[data-y-toplu-onay]');
  const islemOzeti = topluOnay?.querySelector<HTMLElement>('[data-y-toplu-ozet]');
  const siparisOzeti = topluOnay?.querySelector<HTMLElement>('[data-y-toplu-siparisler]');
  let bekleyenIslem: HTMLButtonElement | undefined;
  const secili = () => kutular.filter((x) => x.checked).map((x) => x.value);
  const secimDurumu = () => {
    const n = secili().length;
    toplu.hidden = n === 0;
    if (sayac) sayac.textContent = n + ' sipariş seçili';
    if (onizleme) onizleme.textContent = secili().join(' · ');
    kutular.forEach((x) => x.closest('tr')?.classList.toggle('is-secili', x.checked));
    if (tumu) { tumu.checked = n > 0 && n === Math.min(30, kutular.length); tumu.indeterminate = n > 0 && !tumu.checked; }
  };
  tumu?.addEventListener('change', () => { kutular.forEach((box, i) => { box.checked = tumu.checked && i < 30; }); secimDurumu(); });
  kutular.forEach((x) => x.addEventListener('change', () => {
    if (secili().length > 30) { x.checked = false; bildirim('En fazla 30 sipariş seçebilirsiniz.', true); }
    secimDurumu();
  }));
  toplu.querySelector('[data-y-toplu-temizle]')?.addEventListener('click', () => { kutular.forEach((x) => { x.checked = false; }); secimDurumu(); });
  const calistir = (b: HTMLButtonElement) => {
    const form = document.createElement('form');
    const alan = (ad: string, deger: string) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = ad; i.value = deger; form.append(i); };
    secili().forEach((no) => alan('no', no));
    if (b.dataset.yTopluEylem === 'belge') {
      form.method = 'post'; form.action = '/yonetim/finans/belge';
      alan('islem', 'olustur'); alan('tur', toplu.querySelector<HTMLSelectElement>('[data-y-toplu-tur]')?.value ?? 'ozet');
      alan('geri', location.pathname + location.search);
    } else {
      form.method = 'get'; form.action = '/yonetim/finans/etiket'; form.target = '_blank';
      if (b.dataset.yTopluEylem === 'toplama') alan('tur', 'toplama'); else alan('bicim', b.dataset.bicim ?? 'a4');
    }
    document.body.append(form);
    form.submit();
    form.remove();
  };
  toplu.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-y-toplu-eylem]');
    if (!b || !secili().length) return;
    if (!topluOnay || !islemOzeti || !siparisOzeti) { calistir(b); return; }
    bekleyenIslem = b;
    const tur = toplu.querySelector<HTMLSelectElement>('[data-y-toplu-tur]')?.selectedOptions[0]?.textContent;
    islemOzeti.textContent = b.dataset.yTopluEylem === 'belge' ? `${tur ?? 'Belge'} · PDF / ZIP hazırlanacak.`
      : `${b.textContent?.trim()} · PDF hazırlanacak.`;
    siparisOzeti.textContent = secili().join(' · ');
    topluOnay.showModal();
  });
  topluOnay?.addEventListener('submit', (e) => {
    const b = bekleyenIslem;
    bekleyenIslem = undefined;
    if (b && ((e as SubmitEvent).submitter as HTMLButtonElement | null)?.value === 'indir') calistir(b);
  });
  secimDurumu();
}

/* Son seçilen liste filtresi (kanal, sıralama) çerezde saklanır; sunucu adres boşken onu okur.
 * Eskiden tarayıcı sayfayı açtıktan sonra filtreli adrese ikinci kez gidiyordu (her açılış iki kat sürüyordu). */
const filtreCerezi = (ad: string, deger: string) => {
  document.cookie = `${ad}=${encodeURIComponent(deger)}; path=/yonetim; max-age=7776000; samesite=strict${location.protocol === 'https:' ? '; secure' : ''}`;
};
document.querySelectorAll<HTMLFormElement>('[data-filtre-form]').forEach((form) => {
  const ad = 'y-filtre-' + form.dataset.filtreForm;
  const alanlar = [...form.querySelectorAll<HTMLSelectElement>('select[name]')];
  try {
    // Eski yöntemle (tarayıcı depolaması) kaydedilmiş filtreyi bir kez çereze taşı
    const eski = localStorage.getItem(ad);
    if (eski !== null) { if (!document.cookie.includes(ad + '=')) filtreCerezi(ad, eski); localStorage.removeItem(ad); }
  } catch { /* depolama kapalı */ }
  form.addEventListener('submit', () => filtreCerezi(ad, new URLSearchParams(alanlar.map((a) => [a.name, a.value])).toString()));
});

const formlar = [...document.querySelectorAll<HTMLFormElement>('form[data-editor]')];
const degisenler = new Set<HTMLFormElement>();
let gonderiliyor = false;
window.addEventListener('beforeunload', (e) => {
  if (!gonderiliyor && degisenler.size) e.preventDefault();
});
window.addEventListener('pageshow', () => { gonderiliyor = false; });

function alanOzeti(alan: ParentNode) {
  return JSON.stringify([...alan.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input[name]:not([name="aktifBolum"]), textarea[name], select[name]')].map((x) => [
    x.name,
    x instanceof HTMLInputElement && x.type === 'file' ? [...(x.files ?? [])].map((f) => [f.name, f.size, f.lastModified]) :
      x instanceof HTMLInputElement && ['checkbox', 'radio'].includes(x.type) ? [x.value, x.checked] : x.value,
  ]));
}
for (const form of formlar) {
  const bolumler = [...form.querySelectorAll<HTMLElement>('[data-bolum]')];
  const butonlar = [...form.querySelectorAll<HTMLButtonElement>('[data-sekme]')];
  const aktif = form.querySelector<HTMLInputElement>('[name="aktifBolum"]');
  const durum = form.querySelector<HTMLElement>('[data-kayit-durum]');
  const onceki = alanOzeti(form);
  const oncekiBolumler = bolumler.map(alanOzeti);
  const teyit = () => {
    const degisti = alanOzeti(form) !== onceki;
    if (degisti) degisenler.add(form);
    else degisenler.delete(form);
    if (durum) durum.textContent = degisti ? 'Kaydedilmemiş değişiklikler' : '';
  };
  const ac = (id: string) => {
    if (!butonlar.some((b) => b.dataset.sekme === id)) return;
    bolumler.forEach((b) => { b.hidden = b.dataset.bolum !== id; });
    for (const b of butonlar) {
      b.setAttribute('aria-selected', String(b.dataset.sekme === id));
      b.tabIndex = b.dataset.sekme === id ? 0 : -1;
    }
    if (aktif) aktif.value = id;
    form.dispatchEvent(new CustomEvent('y-sekme-degisti', { detail: id }));
  };
  const secim = new URL(location.href).searchParams.get('bolum');
  if (secim) ac(secim);
  form.addEventListener('input', teyit);
  form.addEventListener('change', teyit);
  form.addEventListener('invalid', (e) => {
    const hedef = e.target as HTMLElement;
    const bolum = hedef.closest<HTMLElement>('[data-bolum]');
    if (bolum?.hidden && bolum.dataset.bolum) ac(bolum.dataset.bolum);
  }, true);
  form.addEventListener('formdata', (e) => {
    if (form.dataset.onizlemeForm !== 'site') return;
    for (const [i, b] of bolumler.entries()) {
      if (b.dataset.bolum && alanOzeti(b) !== oncekiBolumler[i]) e.formData.append('degisen', b.dataset.bolum);
    }
  });
  form.addEventListener('submit', (e) => {
    if (e.defaultPrevented) return;
    gonderiliyor = true;
    if (durum) durum.textContent = 'Kaydediliyor…';
    const b = e.submitter;
    if (b) {
      b.setAttribute('aria-busy', 'true');
      b.textContent = 'Kaydediliyor…';
    }
  });
  form.querySelectorAll<HTMLElement>('[data-alan-ipucu]').forEach((alan) => {
    const kap = alan.closest('.y-alan');
    if (!kap || kap.querySelector('.y-help') || !alan.dataset.alanIpucu) return;
    const detay = document.createElement('details');
    detay.className = 'y-help';
    const baslik = document.createElement('summary');
    baslik.textContent = 'Alan yardımı';
    const p = document.createElement('p');
    p.textContent = alan.dataset.alanIpucu;
    detay.append(baslik, p);
    kap.append(detay);
  });
  butonlar.forEach((b, i) => {
    b.addEventListener('click', () => ac(b.dataset.sekme!));
    b.addEventListener('keydown', (e) => {
      const sayi = butonlar.length;
      const yon = e.key === 'ArrowRight' ? (i + 1) % sayi : e.key === 'ArrowLeft' ? (i + sayi - 1) % sayi : e.key === 'Home' ? 0 : e.key === 'End' ? sayi - 1 : -1;
      if (yon >= 0) { e.preventDefault(); butonlar[yon]?.click(); butonlar[yon]?.focus(); }
    });
  });
}
window.addEventListener('pagehide', () => { gonderiliyor = false; });

function siralama(liste: HTMLElement, secici: string, yenile: () => void) {
  let tasinan: HTMLElement | undefined;
  function sirayiBildir() { yenile(); degistir(liste); }
  liste.querySelectorAll<HTMLElement>(secici).forEach((x) => { x.draggable = true; });
  liste.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-sira], [data-bolum-yukari], [data-bolum-asagi]');
    const satir = b?.closest(secici);
    if (!b || !satir) return;
    if (b.dataset.sira === 'yukari' || b.hasAttribute('data-bolum-yukari')) {
      satir.previousElementSibling?.before(satir);
    } else {
      satir.nextElementSibling?.after(satir);
    }
    sirayiBildir();
    b.focus();
  });
  liste.addEventListener('dragstart', (e) => {
    const hedef = e.target as Element;
    if (hedef.matches('input,select,textarea,button')) return;
    tasinan = hedef.closest<HTMLElement>(secici) ?? undefined;
    if (tasinan) e.dataTransfer?.setData('text/plain', 'sira');
  });
  liste.addEventListener('dragend', () => { tasinan = undefined; });
  liste.addEventListener('dragover', (e) => { if (tasinan) e.preventDefault(); });
  liste.addEventListener('drop', (e) => {
    const hedef = (e.target as Element).closest<HTMLElement>(secici);
    if (!tasinan || !hedef || hedef === tasinan) return;
    e.preventDefault();
    const r = hedef.getBoundingClientRect();
    if (e.clientY > r.top + r.height / 2) hedef.after(tasinan);
    else hedef.before(tasinan);
    tasinan = undefined;
    sirayiBildir();
  });
}
document.querySelectorAll<HTMLElement>('[data-sirala]').forEach((el) => siralama(el, '[data-sira-satir]', () => {
  el.querySelectorAll('[data-sira-no]').forEach((x, i) => { x.textContent = String(i + 1); });
  const kaydet = el.closest('form')?.querySelector<HTMLElement>('[data-sira-kaydet]');
  if (kaydet) kaydet.hidden = false;
}));
document.querySelectorAll<HTMLElement>('[data-bolum-siralayici]').forEach((el) => siralama(el, '[data-bolum-oge]', () => {
  el.querySelectorAll('[data-bolum-oge]').forEach((x, i) => {
    const sayi = String(i + 1);
    const sira = x.querySelector<HTMLInputElement>('[data-bolum-sira-girdi]');
    const no = x.querySelector('[data-bolum-no]');
    if (sira) sira.value = sayi;
    if (no) no.textContent = sayi;
  });
}));
document.querySelectorAll<HTMLSelectElement>('[data-kargo-sablon]').forEach((sec) => {
  sec.addEventListener('change', () => {
    const ad = sec.form?.querySelector<HTMLInputElement>('[name="kargoFirma"]');
    const url = sec.form?.querySelector<HTMLInputElement>('[name="takipUrl"]');
    const secilen = sec.selectedOptions[0];
    if (!secilen?.value || !ad || !url) return;
    ad.value = secilen.dataset.ad ?? '';
    url.value = secilen.value;
    degistir(sec);
  });
});

/* ---------- Büyük fotoğrafları göndermeden önce küçült ----------
 * Canlı sunucu (Vercel) tek istekte en fazla ~4,5 MB kabul eder; telefon fotoğrafları çoğu zaman bundan büyüktür.
 * Fotoğraf tarayıcıda en uzun kenarı 2000 px olacak şekilde küçültülür (sunucu zaten 1600 px'e indirir, kalite kaybı olmaz). */
const KUCULTME_ESIGI = 900 * 1024;
const ISTEK_SINIRI = 4 * 1024 * 1024;
const kucultulebilir = (f: File) => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type) && f.size > KUCULTME_ESIGI;
/** Alan WebP kabul ediyor mu? (Fiş/fatura alanları yalnız PDF/JPG/PNG kabul eder; oraya WebP gönderilmez.) */
const webpKabul = (input: HTMLInputElement) => {
  const kabul = input.accept.toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  return !kabul.length || kabul.some((t) => t === 'image/webp' || t === 'image/*' || t === '.webp');
};
async function gorselKucult(f: File, webp = true): Promise<File> {
  if (!kucultulebilir(f)) return f;
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
    const olcek = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const tuval = document.createElement('canvas');
    tuval.width = Math.max(1, Math.round(bmp.width * olcek));
    tuval.height = Math.max(1, Math.round(bmp.height * olcek));
    tuval.getContext('2d')!.drawImage(bmp, 0, 0, tuval.width, tuval.height);
    bmp.close();
    const blob = (r: string) => new Promise<Blob | null>((ok) => tuval.toBlob(ok, r, 0.88));
    // Saydam PNG'de arka plan kararmasın: önce WebP (saydamlığı korur), desteklenmiyorsa ya da alan WebP kabul etmiyorsa PNG/JPEG
    let sonuc = webp ? await blob('image/webp') : null;
    if (!sonuc || sonuc.type !== 'image/webp') sonuc = f.type === 'image/png' ? await blob('image/png') : await blob('image/jpeg');
    if (!sonuc || sonuc.size >= f.size) return f;
    const uzanti = sonuc.type === 'image/webp' ? '.webp' : sonuc.type === 'image/png' ? '.png' : '.jpg';
    return new File([sonuc], f.name.replace(/\.[^.]+$/, '') + uzanti, { type: sonuc.type, lastModified: f.lastModified });
  } catch {
    return f;
  }
}
document.addEventListener('change', async (e) => {
  const input = e.target;
  if (!(input instanceof HTMLInputElement) || input.type !== 'file' || input.dataset.kucultuldu) return;
  const dosyalar = [...(input.files ?? [])];
  if (!dosyalar.some(kucultulebilir)) { setTimeout(() => toplamKontrol(input)); return; }
  e.stopImmediatePropagation(); // asıl işleyiciler küçültülmüş dosyalarla tekrar çalışır
  input.form?.setAttribute('aria-busy', 'true');
  const webp = webpKabul(input);
  const yeni = await Promise.all(dosyalar.map((f) => gorselKucult(f, webp)));
  input.form?.removeAttribute('aria-busy');
  const dt = new DataTransfer();
  yeni.forEach((f) => dt.items.add(f));
  input.dataset.kucultuldu = '1';
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  delete input.dataset.kucultuldu;
  setTimeout(() => toplamKontrol(input));
}, true);
function toplamKontrol(input: HTMLInputElement) {
  const form = input.form;
  if (!form) return;
  const toplam = [...form.querySelectorAll<HTMLInputElement>('input[type="file"]')]
    .reduce((t, i) => t + [...(i.files ?? [])].reduce((a, f) => a + f.size, 0), 0);
  if (toplam > ISTEK_SINIRI) {
    input.setCustomValidity('Seçilen dosyalar birlikte çok büyük (en fazla 4 MB). Fotoğrafları birkaç seferde ekleyin.');
    input.reportValidity();
  } else if (input.validationMessage.startsWith('Seçilen dosyalar birlikte')) {
    input.setCustomValidity('');
  }
}

const dosyaUrl = new WeakMap<HTMLInputElement, string[]>();
const dosyaTurleri = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
document.querySelectorAll<HTMLInputElement>('[data-gorsel-sec]').forEach((input) => {
  const yukle = input.closest<HTMLElement>('[data-dosya-birak]');
  const galeri = input.form?.querySelector<HTMLElement>('[data-gorsel-onizleme]');
  const ana = input.form?.querySelector<HTMLInputElement>('[name="yeniAnaFoto"]');
  input.addEventListener('change', () => {
    if (ana) ana.value = '';
    dosyaUrl.get(input)?.forEach((url) => URL.revokeObjectURL(url));
    const dosyalar = [...(input.files ?? [])];
    const hatali = dosyalar.some((f) => !dosyaTurleri.has(f.type) || f.size > 12 * 1024 * 1024);
    input.setCustomValidity(hatali ? 'JPG, PNG, WebP veya GIF türünde, en fazla 12 MB boyutlu fotoğraflar seçin.' : '');
    if (hatali) input.reportValidity();
    const urller = hatali ? [] : dosyalar.map((f) => URL.createObjectURL(f));
    dosyaUrl.set(input, urller);
    if (galeri) galeri.replaceChildren(...urller.map((url, i) => {
      const img = document.createElement('img');
      img.src = url;
      img.alt = dosyalar[i]?.name ?? '';
      if (!ana) return img;
      const kart = document.createElement('div');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'y-icon-button';
      b.textContent = 'Ana fotoğraf yap';
      b.dataset.yeniAna = '';
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        ana.value = String(i + 1);
        galeri?.querySelectorAll('[data-yeni-ana]').forEach((el) => el.setAttribute('aria-pressed', String(el === b)));
        input.form?.querySelectorAll('.y-gorsel--ana').forEach((el) => el.classList.remove('y-gorsel--ana'));
        degistir(input);
      });
      kart.append(img, b);
      return kart;
    }));
    degistir(input);
  });
  yukle?.addEventListener('dragover', (e) => { e.preventDefault(); yukle.classList.add('is-drag'); });
  yukle?.addEventListener('dragleave', () => yukle.classList.remove('is-drag'));
  yukle?.addEventListener('drop', (e) => {
    e.preventDefault();
    yukle.classList.remove('is-drag');
    if (e.dataTransfer?.files.length) { input.files = e.dataTransfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); }
  });
});

const urunForm = document.querySelector<HTMLFormElement>('form[data-onizleme-form="urun"]');
if (urunForm) {
  const duzenle = () => {
    const f = new FormData(urunForm);
    const adres = urunForm.querySelector('[data-url-onizleme]');
    if (adres && !urunForm.dataset.kayit) adres.textContent = '/urun/' + kod([f.get('marka'), f.get('kisaAd') || f.get('ad')].join(' '));
    const ozet = urunForm.querySelector('[data-indirim-onizleme]');
    if (ozet) {
      const fiyat = sayiCoz(String(f.get('fiyat') ?? '')) ?? 0;
      const oran = Math.min(50, Math.max(0, Number(f.get('sepetteIndirim'))));
      ozet.textContent = fiyat > 0 && oran > 0 ? 'Sepette ' + formatTL(sepetteFiyat(fiyat, oran)) : '';
    }
  };
  urunForm.addEventListener('input', duzenle);
  duzenle();
}

const setForm = document.querySelector<HTMLFormElement>('form[data-onizleme-form="set"]');
if (setForm) {
  const tip = setForm.querySelector<HTMLSelectElement>('[name="fiyat_tip"]');
  const hedef = setForm.querySelector<HTMLElement>('[data-kalem-hedef]');
  const ozet = setForm.querySelector<HTMLOutputElement>('[data-set-toplam]');
  function hesaplaSet() {
    if (hedef) hedef.hidden = tip?.value !== 'kalem';
    const f = new FormData(setForm!);
    const secilenler = [...setForm!.querySelectorAll<HTMLSelectElement>('[name="kalem_urun"]')];
    const hedefId = String(f.get('kalem_hedef') || secilenler.filter((x) => x.value).at(-1)?.value || '');
    const deger = Math.round(sayiCoz(String(f.get('deger') ?? '')) ?? NaN);
    const adetler = f.getAll('kalem_adet');
    const satirlar = secilenler.flatMap((x, i) => {
      const birim = Number(x.selectedOptions[0]?.dataset.fiyat);
      const adet = Number(adetler[i]) || 1;
      if (!x.value || !Number.isFinite(birim)) return [];
      return [{ adet, birim, indirimliBirim: tip?.value === 'kalem' && x.value === hedefId ? birim - Math.round(birim * deger / 100) : undefined }];
    });
    const fiyatlama = tip?.value === 'kalem' ? { tip: 'kalem' as const }
      : tip?.value === 'sabit' ? { tip: 'sabit' as const, fiyat: deger } : { tip: 'yuzde' as const, oran: deger };
    const { ayriAyri, fiyat, kazanc } = setToplamlari(satirlar, fiyatlama);
    if (ozet) ozet.textContent = satirlar.length >= 2 && Number.isFinite(fiyat) ?
      'Ayrı ayrı ' + formatTL(ayriAyri) + ' · Set ' + formatTL(fiyat) + ' · Tasarruf ' + formatTL(kazanc) : 'Hesap için en az iki ürün seçin.';
  }
  setForm.addEventListener('input', hesaplaSet);
  setForm.addEventListener('change', hesaplaSet);
  hesaplaSet();
}

const panel = document.querySelector<HTMLElement>('[data-onizleme]');
const onizlemeFormu = document.querySelector<HTMLFormElement>('form[data-onizleme-form]');
const acma = document.querySelector<HTMLButtonElement>('[data-onizleme-ac]');
if (panel && onizlemeFormu && acma) {
  const duzen = panel.closest('[data-editor-duzen]');
  const iframe = panel.querySelector('iframe')!;
  const sahne = panel.querySelector<HTMLElement>('[data-onizleme-sahne]')!;
  const mesaj = panel.querySelector<HTMLElement>('[data-onizleme-mesaj]')!;
  const genislet = panel.querySelector<HTMLButtonElement>('[data-onizleme-genis]')!;
  const odak = panel.querySelector<HTMLButtonElement>('[data-onizleme-odak]')!;
  const hedefler: Record<string, string> = {
    marka: '.urun-eyebrow', ad: '.urun-ad', kisaAd: '.kirinti li:last-child', ozet: '.urun-deger',
    kategori: '.kirinti', fiyat: '.urun-fiyat', sepetteIndirim: '.urun-fiyat', kampanyaEtiket: '.urun-fiyat',
    stok: '.stok, .stok-yok, .satin-al', galeri: '.urun-galeri-kap', rozetler: '.urun-guven-satir',
    ozellikler: '.urun-bilgi', faydalar: '.faydalar', pisirme: '.pisirme-panel',
    teknik: '.teknik-tablo', kutu: '[aria-label="Teknik bilgiler"]', sss: '#sss, [aria-labelledby="urun-sss"]',
  };
  let odakSecici = '';
  let en = 1280;
  let zamanlayici: number | undefined;
  let istek: AbortController | undefined;
  let boyutIzle: ResizeObserver | undefined;
  function odagiYenile() {
    const belge = iframe.contentDocument;
    const isaret = belge?.querySelector<HTMLElement>('[data-y-preview-focus]');
    if (isaret) {
      isaret.style.removeProperty('outline');
      isaret.style.removeProperty('outline-offset');
      isaret.removeAttribute('data-y-preview-focus');
    }
    const hedef = odakSecici && belge?.querySelector<HTMLElement>(odakSecici);
    odak.hidden = !hedef;
    if (!hedef) return;
    hedef.setAttribute('data-y-preview-focus', '');
    hedef.style.outline = '2px solid #aa812e';
    hedef.style.outlineOffset = '3px';
  }

  function olcek() {
    const oran = Math.min(1, sahne.clientWidth / en);
    iframe.style.width = en + 'px';
    const belge = iframe.contentDocument;
    const h = Math.max(680, belge?.body?.scrollHeight ?? 0, belge?.documentElement?.scrollHeight ?? 0);
    iframe.style.height = h + 'px';
    iframe.style.transform = 'translateX(-50%) scale(' + oran + ')';
    sahne.style.height = Math.round(h * oran) + 'px';
  }
  new ResizeObserver(olcek).observe(sahne);
  iframe.addEventListener('load', () => {
    boyutIzle?.disconnect();
    const belge = iframe.contentDocument;
    if (!belge?.body) return;
    belge.addEventListener('click', (e) => {
      if ((e.target as Element).closest('a, button')) e.preventDefault();
    });
    iframe.style.height = '680px';
    for (const img of belge.images) img.loading = 'eager';
    boyutIzle = new ResizeObserver(olcek);
    boyutIzle.observe(belge.body);
    olcek();
    odagiYenile();
  });
  onizlemeFormu.addEventListener('focusin', (e) => {
    const alan = (e.target as Element).closest<HTMLElement>('[data-hedef-eleman]');
    odakSecici = hedefler[alan?.dataset.hedefEleman ?? ''] ?? '';
    if (!panel.hidden) odagiYenile();
  });
  odak.addEventListener('click', () => {
    const hedef = iframe.contentDocument?.querySelector<HTMLElement>('[data-y-preview-focus]');
    if (!hedef) return;
    const oran = Math.min(1, sahne.clientWidth / en);
    window.scrollTo({ top: window.scrollY + iframe.getBoundingClientRect().top + hedef.getBoundingClientRect().top * oran - 150 });
  });
  function iste() {
    if (!panel || !onizlemeFormu || panel.hidden) return;
    window.clearTimeout(zamanlayici);
    istek?.abort();
    zamanlayici = window.setTimeout(async () => {
      if (!panel || !onizlemeFormu || panel.hidden) return;
      const controller = new AbortController();
      istek = controller;
      const f = new FormData(onizlemeFormu);
      f.set('_tur', panel.dataset.onizleme ?? '');
      f.set('_id', panel.dataset.kayit ?? '');
      for (const input of onizlemeFormu.querySelectorAll<HTMLInputElement>('input[type="file"]')) {
        f.delete(input.name);
        for (const url of dosyaUrl.get(input) ?? []) f.append('_gorsel', url);
      }
      try {
        const response = await fetch('/yonetim/onizleme', { method: 'POST', body: f, signal: controller.signal });
        if (!response.ok || response.redirected) throw new Error();
        const html = await response.text();
        if (controller.signal.aborted) return;
        const belge = new DOMParser().parseFromString(html, 'text/html');
        belge.querySelectorAll('script').forEach((el) => el.remove());
        const bolum = f.get('aktifBolum');
        const hedef = bolum === 'iletisim' ? belge.querySelector('footer') : bolum === 'sss' ? belge.querySelector('#sss-baslik')?.closest('section') : undefined;
        if (hedef && belge.body.contains(hedef)) {
          const main = belge.querySelector('main');
          if (main && !main.contains(hedef)) { main.replaceChildren(); }
          else if (main) { main.replaceChildren(hedef); }
        }
        iframe.srcdoc = '<!doctype html>' + belge.documentElement.outerHTML;
        mesaj.textContent = decodeURIComponent(response.headers.get('X-Preview-Note') ?? '');
      } catch {
        if (!controller.signal.aborted) mesaj.textContent = 'Önizleme yüklenemedi. Tekrar açarak yeniden deneyin.';
      }
    }, 230);
  }

  acma.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    duzen?.classList.toggle('is-preview', !panel.hidden);
    acma.setAttribute('aria-expanded', String(!panel.hidden));
    acma.textContent = panel.hidden ? 'Önizle' : 'Önizlemeyi kapat';
    if (panel.hidden) { istek?.abort(); window.clearTimeout(zamanlayici); }
    else { mesaj.textContent = 'Yükleniyor…'; iste(); }
  });
  genislet.addEventListener('click', () => {
    const aktif = duzen?.classList.toggle('is-wide') ?? false;
    genislet.setAttribute('aria-pressed', String(aktif));
    genislet.textContent = aktif ? 'Yan yana' : 'Genişlet';
  });
  const ekranlar = [...panel.querySelectorAll<HTMLButtonElement>('[data-ekran]')];
  ekranlar.forEach((b) => b.addEventListener('click', () => {
    en = b.dataset.ekran === 'mobil' ? 390 : 1280;
    ekranlar.forEach((el) => el.setAttribute('aria-pressed', String(el === b)));
    iframe.style.height = '680px';
    olcek();
  }));
  onizlemeFormu.addEventListener('input', iste);
  onizlemeFormu.addEventListener('change', iste);
  onizlemeFormu.addEventListener('y-sekme-degisti', iste);
}

/* ---------- Anında tepki: basılan düğme ve üstte akan çizgi ----------
 * Sunucu yanıtı gelene kadar düğme "basıldı" görünür ve ikinci kez gönderilmez (çift kayıt olmaz);
 * sayfa değişirken ekranın üstünde ince altın çizgi akar. İndirme gibi sayfanın değişmediği
 * durumlarda birkaç saniye sonra kendiliğinden kapanır; geri tuşuyla dönülünce sıfırlanır. */
const yukleme = document.createElement('div');
yukleme.className = 'y-yukleme';
yukleme.setAttribute('aria-hidden', 'true');
document.body.append(yukleme);
let yuklemeZamani = 0;
function yuklemeBitti() {
  delete root.dataset.yYukleniyor;
  clearTimeout(yuklemeZamani);
  document.querySelectorAll('[data-y-basildi]').forEach((b) => { b.removeAttribute('data-y-basildi'); b.removeAttribute('aria-busy'); });
  document.querySelectorAll<HTMLFormElement>('form[data-y-gonderiliyor]').forEach((f) => { delete f.dataset.yGonderiliyor; });
}
function yuklemeBasla(sure: number) {
  root.dataset.yYukleniyor = '1';
  clearTimeout(yuklemeZamani);
  yuklemeZamani = window.setTimeout(yuklemeBitti, sure);
}
window.addEventListener('pageshow', yuklemeBitti);
/* Dosya indiren adresler: sayfa yerinde kalır, çizgi kısa sürede kapanır */
const indirmeAdresi = (u: URL) => /^\/yonetim\/(finans\/(rapor|belge|etiket|fatura-dosya)|yedek)$/.test(u.pathname) && !/[?&](goster|onizle)=1/.test(u.search);
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin || !/^https?:$/.test(u.protocol)) return;
  if (u.pathname === location.pathname && u.search === location.search) return; // aynı sayfa / sayfa içi bağlantı
  if (degisenler.size && !gonderiliyor) return; // "kaydedilmemiş değişiklik" uyarısı çıkacak
  yuklemeBasla(indirmeAdresi(u) ? 3000 : 20000);
});
document.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement;
  if (e.defaultPrevented || form.method === 'dialog') return;
  const b = (e as SubmitEvent).submitter as HTMLButtonElement | HTMLInputElement | null;
  if ((b?.getAttribute('formtarget') ?? form.target) === '_blank') return;
  if (form.dataset.yGonderiliyor) { e.preventDefault(); return; } // çift tıklama: ikinci gönderim yok
  form.dataset.yGonderiliyor = '1';
  if (b) { b.setAttribute('aria-busy', 'true'); b.dataset.yBasildi = ''; }
  const indirme = form.hasAttribute('data-indirme') || indirmeAdresi(new URL(b?.formAction || form.action, location.href));
  yuklemeBasla(indirme ? 5000 : 30000);
});

/* ---------- Küçük bildirimler ---------- */
function bildirim(mesaj: string, hata = false) {
  const el = document.createElement('p');
  el.className = 'y-toast' + (hata ? ' y-toast--hata' : '');
  el.setAttribute('role', hata ? 'alert' : 'status');
  el.textContent = mesaj;
  document.body.append(el);
  setTimeout(() => el.remove(), 4200);
}
document.querySelectorAll<HTMLElement>('[data-y-toast]').forEach((el) => {
  setTimeout(() => el.classList.add('is-gizli'), 4000);
  // Adres çubuğundaki ?ok= iletisini temizle: sayfa yenilenince bildirim tekrar çıkmasın
  try {
    const u = new URL(location.href);
    if (u.searchParams.has('ok')) { u.searchParams.delete('ok'); history.replaceState(null, '', u.pathname + u.search + u.hash); }
  } catch { /* önemli değil */ }
});

/* ---------- Üç noktalı menüler: dışarı tıklayınca / Esc ile kapanır ---------- */
document.addEventListener('click', (e) => {
  const hedef = e.target as Element;
  document.querySelectorAll<HTMLDetailsElement>('details.y-row-menu[open], details.y-tarih[open], details.y-ust-menu[open]').forEach((d) => {
    if (!d.contains(hedef) || (d.matches('.y-row-menu, .y-ust-menu') && hedef.closest('a'))) d.open = false;
  });
  const ac = hedef.closest<HTMLAnchorElement>('[data-ac]');
  const hedefDetay = ac && document.getElementById(ac.dataset.ac!);
  if (hedefDetay instanceof HTMLDetailsElement) { hedefDetay.open = true; hedefDetay.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll<HTMLDetailsElement>('details.y-row-menu[open], details.y-ust-menu[open]').forEach((d) => { d.open = false; });
});
/* Menü, tablonun kaydırılabilir kutusunun içinde kesilmesin ve tabloyu kaydırmasın:
 * açılınca ekrana sabitlenir; aşağıda yer yoksa yukarı doğru açılır. Sayfa kayınca kapanır. */
function satirMenusuKonumla(d: HTMLDetailsElement) {
  const menu = d.querySelector<HTMLElement>(':scope > div');
  const ozet = d.querySelector<HTMLElement>(':scope > summary');
  if (!menu || !ozet) return;
  if (!d.open) { menu.removeAttribute('style'); return; }
  Object.assign(menu.style, { position: 'fixed', top: '0px', left: '0px', right: 'auto', visibility: 'hidden', zIndex: '80', maxHeight: `${innerHeight - 16}px`, overflowY: 'auto' });
  const r = ozet.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  let sol = d.classList.contains('y-row-menu--sag') ? r.right - m.width : r.left;
  sol = Math.max(8, Math.min(sol, innerWidth - m.width - 8));
  let ust = r.bottom + 4;
  if (ust + m.height > innerHeight - 8 && r.top - m.height - 4 >= 8) ust = r.top - m.height - 4;
  ust = Math.max(8, Math.min(ust, innerHeight - m.height - 8));
  Object.assign(menu.style, { top: `${ust}px`, left: `${sol}px`, visibility: '' });
}
document.addEventListener('toggle', (e) => {
  if (e.target instanceof HTMLDetailsElement && e.target.classList.contains('y-row-menu')) satirMenusuKonumla(e.target);
}, true);
const satirMenuleriniKapat = (e: Event) => {
  document.querySelectorAll<HTMLDetailsElement>('details.y-row-menu[open]').forEach((d) => {
    if (!(e.target instanceof Node && d.contains(e.target))) d.open = false;
  });
};
addEventListener('scroll', satirMenuleriniKapat, { capture: true, passive: true });
addEventListener('resize', satirMenuleriniKapat, { passive: true });

/* ---------- Barkod okuyucu: panelde sipariş barkodu okutulunca sipariş açılır ---------- */
{
  let tampon = '';
  let son = 0;
  document.addEventListener('keydown', (e) => {
    if (!(e.target instanceof Element) || e.target.closest('input, textarea, select, [contenteditable="true"]') || e.ctrlKey || e.metaKey || e.altKey) return;
    const simdi = performance.now();
    if (simdi - son > 80) tampon = '';
    son = simdi;
    if (e.key === 'Enter') {
      const m = /^(?:AL)?(\d{6})-?(\d{4})$/i.exec(tampon.replace(/[*\s]/g, ''));
      tampon = '';
      if (m) { e.preventDefault(); location.href = '/yonetim/siparisler?tara=1&q=' + encodeURIComponent('AL' + m[1] + '-' + m[2]); }
      return;
    }
    if (e.key.length === 1) tampon = (tampon + e.key).slice(-30);
  });
}

/* ---------- Belge Oluştur penceresi: canlı önizleme ve indirme ---------- */
const belgeFormu = document.querySelector<HTMLFormElement>('[data-belge-form]');
if (belgeFormu) {
  const img = document.querySelector<HTMLImageElement>('[data-belge-onizleme]');
  const durum = document.querySelector<HTMLElement>('[data-belge-onizleme-durum]');
  const mevcutKutu = belgeFormu.querySelector<HTMLElement>('[data-belge-mevcut]');
  const fiyatSecenek = belgeFormu.querySelector<HTMLElement>('[data-fiyat-secenek]');
  let zamanlayici = 0;
  const guncelle = () => {
    const f = new FormData(belgeFormu);
    const tur = String(f.get('tur') ?? 'ozet');
    const secili = belgeFormu.querySelector<HTMLInputElement>('input[name="tur"]:checked');
    const mevcut = secili?.dataset.mevcut ?? '';
    if (mevcutKutu) {
      mevcutKutu.hidden = !mevcut;
      const no = mevcutKutu.querySelector('[data-belge-mevcut-no]');
      if (no) no.textContent = mevcut;
    }
    if (fiyatSecenek) fiyatSecenek.hidden = !(tur === 'ozet' || tur === 'fis');
    if (!img) return;
    const adres = '/yonetim/finans/belge?' + new URLSearchParams({
      onizle: '1', no: belgeFormu.dataset.no ?? '', tur, not: String(f.get('not') ?? ''),
      ...(f.get('fiyatGizle') && !fiyatSecenek?.hidden ? { fiyatGizle: '1' } : {}),
    });
    if (durum) durum.textContent = 'Önizleme hazırlanıyor…';
    img.classList.add('is-yukleniyor');
    img.onload = () => { img.classList.remove('is-yukleniyor'); if (durum) durum.textContent = 'Önizleme · belge numarası ve tarihi kayıt anında verilir'; };
    img.onerror = () => { img.classList.remove('is-yukleniyor'); if (durum) durum.textContent = 'Önizleme hazırlanamadı.'; };
    img.src = adres;
  };
  belgeFormu.addEventListener('change', () => { clearTimeout(zamanlayici); zamanlayici = window.setTimeout(guncelle, 150); });
  belgeFormu.addEventListener('input', (e) => {
    if ((e.target as Element).matches('textarea')) { clearTimeout(zamanlayici); zamanlayici = window.setTimeout(guncelle, 700); }
  });
  document.querySelectorAll('[data-y-dialog="belge-olustur"]').forEach((b) => b.addEventListener('click', guncelle));

  // İndir: dosyayı indir, ardından listeyi yenile (belge numarası ve durumu görünsün)
  belgeFormu.addEventListener('submit', async (e) => {
    const gonderen = (e as SubmitEvent).submitter as HTMLButtonElement | null;
    if (gonderen?.name === 'indir') return; // "Sadece kaydet" normal form gönderimi
    e.preventDefault();
    const dugme = belgeFormu.querySelector<HTMLButtonElement>('[data-belge-gonder]');
    if (dugme) { dugme.disabled = true; dugme.textContent = 'Hazırlanıyor…'; }
    try {
      const yanit = await fetch(belgeFormu.action, { method: 'POST', body: new FormData(belgeFormu) });
      const tur = yanit.headers.get('content-type') ?? '';
      if (yanit.ok && /pdf|zip/.test(tur)) {
        const baslik = yanit.headers.get('content-disposition') ?? '';
        const ad = decodeURIComponent(baslik.slice(baslik.indexOf("''") + 2) || 'belge.pdf');
        const url = URL.createObjectURL(await yanit.blob());
        const a = Object.assign(document.createElement('a'), { href: url, download: ad });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        const u = new URL(location.href);
        u.searchParams.set('ok', 'Belge hazır: ' + ad.replace(/\.pdf$/, ''));
        u.hash = 'belgeler';
        setTimeout(() => location.replace(u.href), 400);
        return;
      }
      location.href = yanit.url;
    } catch {
      bildirim('Belge oluşturulamadı. Bağlantınızı kontrol edip tekrar deneyin.', true);
      if (dugme) { dugme.disabled = false; dugme.textContent = 'Oluştur ve İndir'; }
    }
  });
}

/* ---------- Belge ayarları: canlı önizleme ---------- */
const ayarFormu = document.querySelector<HTMLFormElement>('[data-belge-ayar]');
if (ayarFormu) {
  const img = document.querySelector<HTMLImageElement>('[data-ayar-onizleme]');
  const tur = document.querySelector<HTMLSelectElement>('[data-ayar-onizleme-tur]');
  let z = 0;
  const yenile = () => {
    if (!img) return;
    const f = new FormData(ayarFormu);
    const p = new URLSearchParams({ onizle: '1', ayar: '1', tur: tur?.value ?? 'ozet' });
    for (const [k, v] of f) if (typeof v === 'string' && k !== 'islem' && k !== 'geri') p.set(k, v);
    img.classList.add('is-yukleniyor');
    img.onload = img.onerror = () => img.classList.remove('is-yukleniyor');
    img.src = '/yonetim/finans/belge?' + p;
  };
  ayarFormu.addEventListener('input', () => { clearTimeout(z); z = window.setTimeout(yenile, 500); });
  ayarFormu.addEventListener('change', () => { clearTimeout(z); z = window.setTimeout(yenile, 200); });
  tur?.addEventListener('change', yenile);
  document.querySelectorAll('[data-y-dialog="belge-ayar"]').forEach((b) => b.addEventListener('click', yenile));
  if (ayarFormu.closest('dialog')?.hasAttribute('open') || ayarFormu.closest('dialog')?.dataset.hataAc === '1') yenile();
}
