/* Vitrin sayfaları doğal bağlantılarla gezinir. Yükleme durumu yalnızca gecikince görünür. */
const yukleme = document.querySelector<HTMLElement>('[data-sayfa-yukleme]');
const yuklemeMetni = yukleme?.querySelector<HTMLElement>('[data-sayfa-yukleme-metin]');
if (yukleme && yuklemeMetni) {
  const vitrinYolu = /^\/(?:urunler|setler|(?:urun|kategori)\/[^/]+)?$/;
  let goster: number | undefined, gizle: number | undefined;
  const temizle = () => {
    window.clearTimeout(goster);
    window.clearTimeout(gizle);
    yukleme.hidden = true;
    yuklemeMetni.textContent = '';
  };

  window.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!(e.target instanceof Element)) return;
    const a = e.target.closest<HTMLAnchorElement>('a[href]');
    if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
    const hedef = new URL(a.href);
    if (hedef.origin !== location.origin || !vitrinYolu.test(hedef.pathname)) return;
    if (hedef.pathname === location.pathname && hedef.search === location.search) return;

    temizle();
    goster = window.setTimeout(() => {
      yukleme.hidden = false;
      yuklemeMetni.textContent = 'Sayfa yükleniyor';
    }, 320);
    // Tarayıcıda iptal edilen bir gezinme göstergeyi açık bırakmasın.
    gizle = window.setTimeout(temizle, 7000);
  });
  window.addEventListener('pageswap', temizle);
  window.addEventListener('pagehide', temizle);
  window.addEventListener('pageshow', temizle);
}

function gorselDurumu(img: HTMLImageElement): void {
  const kutu = img.parentElement;
  if (!kutu) return;
  const tamamla = () => {
    if (img.naturalWidth) {
      kutu.dataset.gorselDurum = 'hazir';
      return;
    }
    kutu.dataset.gorselDurum = 'hata';
    img.hidden = true;
    if (kutu instanceof HTMLButtonElement) kutu.disabled = true;
    const yedek = document.createElement('span');
    yedek.className = 'gorsel-yukleme__yedek';
    yedek.textContent = 'Görsel yüklenemedi';
    kutu.append(yedek);
  };

  if (img.complete) {
    tamamla();
    return;
  }
  kutu.dataset.gorselDurum = 'bekliyor';
  img.addEventListener('load', tamamla, { once: true });
  img.addEventListener('error', tamamla, { once: true });
}

document.querySelectorAll<HTMLImageElement>('[data-yuklenen-gorsel]').forEach(gorselDurumu);
