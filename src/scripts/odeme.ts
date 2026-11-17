/* Al Lulu Home — tek sayfa ödeme: doğrulama, özet, ön bilgilendirme, sunucuya sipariş gönderimi */
import { DEGISTI, adetAyarla, sepetKalemleri, sepetOzeti, satirHtml, toplamlarHtml } from './sepet';
import { formatTL, katalog, urunBul } from './katalog';
import { track } from './analitik';
import { mesafeliSatisSozlesmesi, onBilgilendirmeFormu, type YasalSite, type YasalSiparis } from '../lib/yasal';

const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll<T>(s));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const ILLER = ['Adana','Adıyaman','Afyonkarahisar','Ağrı','Aksaray','Amasya','Ankara','Antalya','Ardahan','Artvin','Aydın','Balıkesir','Bartın','Batman','Bayburt','Bilecik','Bingöl','Bitlis','Bolu','Burdur','Bursa','Çanakkale','Çankırı','Çorum','Denizli','Diyarbakır','Düzce','Edirne','Elazığ','Erzincan','Erzurum','Eskişehir','Gaziantep','Giresun','Gümüşhane','Hakkari','Hatay','Iğdır','Isparta','İstanbul','İzmir','Kahramanmaraş','Karabük','Karaman','Kars','Kastamonu','Kayseri','Kilis','Kırıkkale','Kırklareli','Kırşehir','Kocaeli','Konya','Kütahya','Malatya','Manisa','Mardin','Mersin','Muğla','Muş','Nevşehir','Niğde','Ordu','Osmaniye','Rize','Sakarya','Samsun','Şanlıurfa','Siirt','Sinop','Şırnak','Sivas','Tekirdağ','Tokat','Trabzon','Tunceli','Uşak','Van','Yalova','Yozgat','Zonguldak'];
const satici = JSON.parse($('#satici-veri')?.textContent || '{}') as YasalSite;
const kok = $('[data-odeme-kok]')!;
const form = $<HTMLFormElement>('[data-odeme-form]')!;

function bosSepet(): void {
  const hero = urunBul(katalog.heroId);
  kok.innerHTML = `
    <div class="container" style="padding-block:64px;text-align:center">
      <h1 style="font-size:36px">Sepetiniz boş</h1>
      <p class="muted" style="margin-top:8px">Ödeme adımına geçmek için önce sepetinize ürün ekleyin.</p>
      ${hero ? `<button class="btn btn--sepet" type="button" style="margin-top:24px" data-sepete-ekle data-tip="urun" data-id="${hero.id}" data-sessiz>${esc(hero.kisaAd)} ekle · ${formatTL(hero.fiyat)}</button>` : ''}
      <p style="margin-top:16px"><a href="/urunler">Ürünlere göz atın</a></p>
    </div>`;
}

if (!sepetKalemleri().length) {
  bosSepet();
  document.addEventListener(DEGISTI, () => { if (sepetKalemleri().length) location.reload(); });
} else baslat();

function baslat(): void {
  /* ---------- Özet ---------- */
  const ciz = () => {
    const o = sepetOzeti();
    if (!o.satirlar.length) { bosSepet(); return; }
    $('[data-ozet-kalemler]')!.innerHTML = o.satirlar.map((s) => satirHtml(s)).join('');
    $('[data-ozet-toplamlar]')!.innerHTML = toplamlarHtml(o);
    $('[data-ozet-toplam]')!.textContent = formatTL(o.toplam);
    const taban = $<HTMLElement>('[data-gonder]')?.dataset.gonderTaban || 'Siparişi Tamamla';
    $('[data-gonder-etiket]')!.textContent = `${taban} · ${formatTL(o.toplam)}`;
  };
  ciz();
  document.addEventListener(DEGISTI, ciz);
  $('[data-ozet-kalemler]')!.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-kalem-arti], [data-kalem-eksi]');
    if (!b) return;
    e.stopPropagation();
    const [tip, ...p] = (b.dataset.kalemArti || b.dataset.kalemEksi)!.split(':');
    const k = sepetKalemleri().find((x) => x.tip === tip && x.id === p.join(':'));
    if (k) adetAyarla(k.tip, k.id, k.adet + (b.hasAttribute('data-kalem-arti') ? 1 : -1));
  }, true);
  const ac = $('[data-ozet-ac]')!, ozet = $('[data-ozet]')!;
  ac.addEventListener('click', () => {
    const acik = ac.getAttribute('aria-expanded') !== 'true';
    ac.setAttribute('aria-expanded', String(acik));
    ozet.classList.toggle('is-kapali', !acik);
  });
  track('begin_checkout', { currency: 'TRY', value: sepetOzeti().toplam });

  /* ---------- Alanlar ---------- */
  const il = $<HTMLSelectElement>('[data-il]')!;
  ILLER.forEach((ad) => il.add(new Option(ad, ad)));
  const tel = $<HTMLInputElement>('[data-telefon]')!;
  const rakam = (v: string) => { let d = v.replace(/\D/g, ''); if (d.startsWith('90') && d.length > 11) d = d.slice(2); if (d.length && d[0] !== '0') d = '0' + d; return d.slice(0, 11); };
  tel.addEventListener('input', () => { const d = rakam(tel.value); tel.value = [d.slice(0, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)].filter(Boolean).join(' '); });
  const kurumsal = $('[data-kurumsal]')!;
  $$<HTMLInputElement>('[data-fatura-tipi]').forEach((r) => r.addEventListener('change', () => {
    const acik = r.value === 'kurumsal' && r.checked;
    kurumsal.hidden = !acik;
    $$<HTMLInputElement>('input', kurumsal).forEach((i) => (i.required = acik));
  }));
  const ayni = $<HTMLInputElement>('[data-ayni-adres]')!, fAdres = $('[data-fatura-adres]')!;
  ayni.addEventListener('change', () => { fAdres.hidden = ayni.checked; $<HTMLTextAreaElement>('textarea', fAdres)!.required = !ayni.checked; });

  type Alan = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const gecerli = (el: Alan): boolean => {
    if (el.closest('[hidden]')) return true;
    let ok = el.checkValidity();
    if (ok && el === tel) ok = /^05\d{9}$/.test(rakam(el.value));
    if (ok && el.type === 'email' && el.value.trim()) ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(el.value.trim());
    const kap = el.closest('.alan') || el.closest('.onay');
    kap?.classList.toggle('hatali', !ok);
    kap?.classList.toggle('gecerli', ok && el.type !== 'checkbox' && !!el.value.trim());
    el.setAttribute('aria-invalid', String(!ok));
    const h = kap?.querySelector<HTMLElement>('.hata');
    if (h) { if (!h.id) h.id = `${el.id || el.name}-hata`; if (!ok) el.setAttribute('aria-describedby', h.id); else el.removeAttribute('aria-describedby'); }
    return ok;
  };
  $$<Alan>('input, select, textarea', form).forEach((el) => {
    el.addEventListener('blur', () => { if (el.value || el.type === 'checkbox') gecerli(el); });
    el.addEventListener('input', () => { if ((el.closest('.alan') || el.closest('.onay'))?.classList.contains('hatali')) gecerli(el); });
    el.addEventListener('change', () => { if (el.type === 'checkbox') gecerli(el); });
  });
  const deger = (ad: string) => ((form.elements.namedItem(ad) as Alan | null)?.value ?? '').trim();

  /* ---------- Ön bilgilendirme formu ve mesafeli satış sözleşmesi (siparişin güncel bilgileriyle) ---------- */
  const pencere = $<HTMLDialogElement>('[data-yasal-pencere]')!;
  const yasalVeri = (): YasalSiparis => {
    const o = sepetOzeti();
    const v = (ad: string) => deger(ad) || '—';
    const kurumsal = (form.elements.namedItem('fatura_tipi') as RadioNodeList).value === 'kurumsal';
    return {
      alici: { adSoyad: `${v('ad')} ${deger('soyad')}`.trim(), tel: v('tel'), eposta: deger('eposta') || undefined, adres: `${v('adres')}, ${v('ilce')} / ${v('il')}` },
      fatura: {
        tip: kurumsal ? 'kurumsal' : 'bireysel', firma: kurumsal ? v('firma') : undefined, vd: kurumsal ? v('vd') : undefined, vno: kurumsal ? v('vno') : undefined,
        adres: (form.elements.namedItem('ayni_adres') as HTMLInputElement).checked ? undefined : deger('fadres') || undefined,
      },
      satirlar: o.satirlar.map((r) => ({ ad: r.tip === 'set' ? `Set: ${r.ad}` : r.ad, sku: r.sku, icerik: r.icerik, adet: r.adet, birimFiyat: r.birimFiyat, indirim: r.indirim, toplam: r.toplam })),
      urunlerToplami: o.urunlerToplami, setIndirimi: o.setIndirimi, sepetIndirimi: o.sepetIndirimi, kargo: o.kargo, toplam: o.toplam,
    };
  };
  $$<HTMLButtonElement>('[data-yasal-ac]').forEach((b) => b.addEventListener('click', () => {
    const mss = b.dataset.yasalAc === 'mesafeli-satis';
    $('#yasal-baslik')!.textContent = mss ? 'Mesafeli Satış Sözleşmesi' : 'Ön Bilgilendirme Formu';
    $('[data-yasal-govde]')!.innerHTML = mss ? mesafeliSatisSozlesmesi(satici, yasalVeri()) : onBilgilendirmeFormu(satici, yasalVeri());
    pencere.showModal();
    $('[data-yasal-govde]')!.scrollTop = 0;
  }));
  $('[data-yasal-kapat]')!.addEventListener('click', () => pencere.close());
  pencere.addEventListener('click', (e) => { if (e.target === pencere) pencere.close(); });

  /* ---------- Gönderim ---------- */
  let gonderiliyor = false;
  const hataKutu = $('[data-hata-ozeti]')!;
  const btn = $<HTMLButtonElement>('[data-gonder]')!;
  const hataGoster = (m: string) => { hataKutu.innerHTML = `<strong>${esc(m)}</strong>`; hataKutu.classList.add('is-visible'); hataKutu.focus(); hataKutu.scrollIntoView({ block: 'center', behavior: 'smooth' }); };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (gonderiliyor) return;
    const alanlar = $$<Alan>('input, select, textarea', form).filter((el) => el.required || el.type === 'email');
    const hatalilar = alanlar.filter((el) => !gecerli(el));
    if (hatalilar.length) {
      hataKutu.innerHTML = `<strong>${hatalilar.length} alanı kontrol edin.</strong>`;
      hataKutu.classList.add('is-visible');
      hatalilar[0]!.focus();
      hatalilar[0]!.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    hataKutu.classList.remove('is-visible');
    gonderiliyor = true;
    btn.disabled = true;
    btn.classList.add('is-yukleniyor');
    $('[data-gonder-etiket]')!.textContent = 'Sipariş oluşturuluyor…';
    const o = sepetOzeti();
    const kurumsal = (form.elements.namedItem('fatura_tipi') as RadioNodeList).value === 'kurumsal';
    try {
      const yanit = await fetch('/api/siparis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kalemler: sepetKalemleri(),
          beklenenToplam: o.toplam,
          musteri: { ad: deger('ad'), soyad: deger('soyad'), tel: rakam(deger('tel')), eposta: deger('eposta') },
          teslimat: { il: deger('il'), ilce: deger('ilce'), adres: deger('adres'), not: deger('not') || undefined },
          fatura: {
            tip: kurumsal ? 'kurumsal' : 'bireysel',
            firma: kurumsal ? deger('firma') : undefined, vd: kurumsal ? deger('vd') : undefined, vno: kurumsal ? deger('vno') : undefined,
            adres: (form.elements.namedItem('ayni_adres') as HTMLInputElement).checked ? undefined : deger('fadres'),
          },
          onay: true,
        }),
      });
      const veri = await yanit.json().catch(() => ({}));
      if (!yanit.ok) {
        hataGoster(veri.hata || 'Sipariş oluşturulamadı. Lütfen tekrar deneyin.');
        if (veri.yenile) window.setTimeout(() => location.reload(), 2500);
        throw new Error('red');
      }
      track('purchase_intent', { transaction_id: veri.no, value: veri.toplam, currency: 'TRY' });
      location.href = `/siparis/${veri.no}?t=${veri.token}&yeni`;
    } catch (err) {
      if ((err as Error).message !== 'red') hataGoster('Bağlantı hatası. İnternetinizi kontrol edip tekrar deneyin.');
      gonderiliyor = false;
      btn.disabled = false;
      btn.classList.remove('is-yukleniyor');
      ciz();
    }
  });
}
