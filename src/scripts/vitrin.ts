/* Vitrin sayfaları doğal bağlantılarla gezinir. Gecikince hedef sayfaya özel skeleton (iskelet) yükleme görünür. */
const iskelet = document.querySelector<HTMLElement>('[data-sayfa-yukleme]');
if (iskelet) {
  const ekranlar = Array.from(iskelet.querySelectorAll<HTMLElement>('[data-iskelet-ekran]'));
  const header = document.querySelector<HTMLElement>('[data-header], .site-header');
  const ekranTuru = (yol: string): string | null => {
    if (yol === '/') return 'ana';
    if (/^\/urun\/[^/]+$/.test(yol)) return 'urun';
    if (yol === '/urunler' || /^\/kategori\/[^/]+$/.test(yol)) return 'liste';
    if (yol === '/setler') return 'setler';
    if (yol === '/siparis-takip' || /^\/siparis\/[^/]+$/.test(yol)) return 'takip';
    if (yol === '/odeme') return 'odeme';
    return null;
  };
  let goster: number | undefined, gizle: number | undefined;
  const temizle = () => {
    window.clearTimeout(goster);
    window.clearTimeout(gizle);
    iskelet.hidden = true;
    iskelet.classList.remove('is-acik');
    ekranlar.forEach((el) => el.classList.remove('is-aktif'));
  };

  window.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!(e.target instanceof Element)) return;
    const a = e.target.closest<HTMLAnchorElement>('a[href]');
    if (!a || a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
    const hedef = new URL(a.href, location.href);
    if (hedef.origin !== location.origin) return;
    if (hedef.pathname === location.pathname && hedef.search === location.search) return;
    const tur = ekranTuru(hedef.pathname);
    if (!tur) return;

    temizle();
    goster = window.setTimeout(() => {
      const ust = header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0;
      iskelet.style.top = `${ust}px`;
      ekranlar.forEach((el) => el.classList.toggle('is-aktif', el.dataset.iskeletEkran === tur));
      iskelet.hidden = false;
      iskelet.scrollTop = 0;
      requestAnimationFrame(() => iskelet.classList.add('is-acik'));
    }, 90);
    // Tarayıcıda iptal edilen bir gezinme iskeleti açık bırakmasın.
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

/* Listeleme kartlarında fare fotoğraf üzerinde biraz bekleyince (~400 ms) eni boyunca yumuşak geçişle fotoğraflar değişir */
if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  document.querySelectorAll<HTMLElement>('[data-kart-galeri]').forEach((kutu) => {
    const img = kutu.querySelector<HTMLImageElement>('[data-kart-img]');
    const cizgiler = Array.from(kutu.querySelectorAll<HTMLElement>('[data-kart-cizgiler] > span'));
    if (!img) return;
    let liste: string[] = [];
    try { liste = JSON.parse(kutu.dataset.kartGaleri || '[]'); } catch { return; }
    if (liste.length < 2) return;

    let hazir = false;
    let zaman: number | undefined;
    let onyukleZaman: number | undefined;
    let temizleZaman: number | undefined;
    let aktif = 0;
    let sonX: number | null = null;
    let istekNo = 0;
    let katmanlar: (HTMLImageElement | null)[] | null = null;

    const katmanlariHazirla = () => {
      if (katmanlar) return katmanlar;
      katmanlar = [null];
      const frag = document.createDocumentFragment();
      for (let i = 1; i < liste.length; i++) {
        const el = document.createElement('img');
        el.className = 'kart__galeri-katman';
        el.alt = '';
        el.setAttribute('aria-hidden', 'true');
        el.decoding = 'async';
        el.src = liste[i]!;
        katmanlar.push(el);
        frag.append(el);
      }
      img.after(frag);
      return katmanlar;
    };

    const goster = (idx: number) => {
      const i = Math.max(0, Math.min(liste.length - 1, idx));
      if (i === aktif) return;
      aktif = i;
      const no = ++istekNo;
      cizgiler.forEach((c, j) => c.classList.toggle('is-active', j === i));
      const listeKatman = katmanlariHazirla();
      window.clearTimeout(temizleZaman);

      if (i === 0) {
        listeKatman.forEach((k) => {
          if (!k) return;
          k.classList.remove('is-aktif');
        });
        temizleZaman = window.setTimeout(() => {
          if (istekNo !== no) return;
          listeKatman.forEach((k) => k?.classList.remove('is-ust'));
        }, 440);
        return;
      }

      const hedef = listeKatman[i];
      if (!hedef) return;

      const uygula = () => {
        if (istekNo !== no) return;
        listeKatman.forEach((k, j) => {
          if (!k || j === i) return;
          k.classList.remove('is-ust');
        });
        if (!hedef.classList.contains('is-aktif')) {
          hedef.classList.add('is-ust');
          // Tarayıcı yeni z-index ile opacity:0 durumunu işlesin ki geçiş yumuşak başlasın
          void hedef.offsetWidth;
          hedef.classList.add('is-aktif');
        } else {
          // Hızlı geri dönüşte hedef zaten arkada görünürse üsttekileri yumuşakça indir
          listeKatman.forEach((k, j) => {
            if (k && j !== i) k.classList.remove('is-aktif');
          });
        }
        temizleZaman = window.setTimeout(() => {
          if (istekNo !== no) return;
          listeKatman.forEach((k, j) => {
            if (!k) return;
            if (j === i) {
              k.classList.remove('is-ust');
            } else {
              k.classList.remove('is-aktif', 'is-ust');
            }
          });
        }, 440);
      };

      if (hedef.complete && hedef.naturalWidth) {
        uygula();
      } else {
        const coz = typeof hedef.decode === 'function'
          ? hedef.decode().catch(() => {})
          : new Promise<void>((res) => hedef.addEventListener('load', () => res(), { once: true }));
        coz.then(uygula);
      }
    };

    const konumdanGoster = (clientX: number) => {
      const r = kutu.getBoundingClientRect();
      if (r.width <= 0) return;
      const oran = Math.max(0, Math.min(0.999, (clientX - r.left) / r.width));
      goster(Math.floor(oran * liste.length));
    };

    kutu.addEventListener('pointerenter', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      sonX = e.clientX;
      window.clearTimeout(zaman);
      window.clearTimeout(onyukleZaman);
      onyukleZaman = window.setTimeout(katmanlariHazirla, 220);
      zaman = window.setTimeout(() => {
        hazir = true;
        kutu.classList.add('is-galeri-aktif');
        katmanlariHazirla();
        if (sonX !== null) konumdanGoster(sonX);
      }, 420);
    });

    kutu.addEventListener('pointermove', (e) => {
      sonX = e.clientX;
      if (!hazir) return;
      konumdanGoster(e.clientX);
    });

    kutu.addEventListener('pointerleave', () => {
      window.clearTimeout(zaman);
      window.clearTimeout(onyukleZaman);
      hazir = false;
      sonX = null;
      kutu.classList.remove('is-galeri-aktif');
      goster(0);
    });
  });
}
