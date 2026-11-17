/* Ürün görseli büyüteci
   • Masaüstü: fareyle üzerine gelince görsel imleç noktasından 2.2× büyür.
   • Tıklama / dokunma: tam ekran büyüteç — iki parmakla yakınlaştırma, çift dokunma (2.5×),
     fare tekerleği, sürükleyerek gezinme, 1×'te sağa-sola kaydırarak diğer görsele geçiş. */
import { track } from './analitik';

const ince = window.matchMedia('(hover: hover) and (pointer: fine)');

/* ---------------- Masaüstü: üzerine gelince yakınlaştır ---------------- */
document.querySelectorAll<HTMLButtonElement>('.galeri__buyut').forEach((btn) => {
  const img = btn.querySelector<HTMLImageElement>('img[data-zoom]');
  if (!img) return;
  btn.addEventListener('mousemove', (e) => {
    if (!ince.matches) return;
    const r = btn.getBoundingClientRect();
    img.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
    btn.classList.add('is-zoom');
  });
  btn.addEventListener('mouseleave', () => btn.classList.remove('is-zoom'));
});

/* ---------------- Tam ekran büyüteç ---------------- */
const dlg = document.querySelector<HTMLDialogElement>('[data-buyutec]');
if (dlg) {
  const gorseller: { src: string; alt: string }[] = JSON.parse(dlg.querySelector('[data-buyutec-veri]')?.textContent || '[]');
  const sahne = dlg.querySelector<HTMLElement>('[data-buyutec-sahne]')!;
  const img = dlg.querySelector<HTMLImageElement>('[data-buyutec-img]')!;
  const sayac = dlg.querySelector<HTMLElement>('[data-buyutec-sayac]');
  let i = 0, s = 1, tx = 0, ty = 0;
  const MAKS = 4;

  const sinirla = () => {
    const mx = Math.max(0, (img.clientWidth * s - sahne.clientWidth) / 2);
    const my = Math.max(0, (img.clientHeight * s - sahne.clientHeight) / 2);
    tx = Math.min(mx, Math.max(-mx, tx));
    ty = Math.min(my, Math.max(-my, ty));
  };
  const uygula = (yumusak = false) => {
    sinirla();
    img.style.transition = yumusak ? 'transform .25s cubic-bezier(.2,.7,.2,1)' : 'none';
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    dlg.classList.toggle('is-yakin', s > 1.01);
  };
  /** (px, py) noktasını sabit tutarak ölçeği değiştir (sahne merkezine göre koordinat) */
  const olcekle = (yeni: number, px: number, py: number, yumusak = false) => {
    yeni = Math.min(MAKS, Math.max(1, yeni));
    tx = px - ((px - tx) * yeni) / s;
    ty = py - ((py - ty) * yeni) / s;
    s = yeni;
    if (s === 1) { tx = 0; ty = 0; }
    uygula(yumusak);
  };
  const merkezeGore = (x: number, y: number) => {
    const r = sahne.getBoundingClientRect();
    return [x - (r.left + r.width / 2), y - (r.top + r.height / 2)] as const;
  };
  const goster = (n: number) => {
    i = (n + gorseller.length) % gorseller.length;
    img.src = gorseller[i]!.src;
    img.alt = gorseller[i]!.alt;
    s = 1; tx = 0; ty = 0; uygula();
    if (sayac) sayac.textContent = `${i + 1} / ${gorseller.length}`;
  };

  document.querySelectorAll<HTMLElement>('[data-buyutec-ac]').forEach((b) =>
    b.addEventListener('click', () => {
      goster(Number(b.dataset.buyutecAc) || 0);
      dlg.showModal();
      document.documentElement.classList.add('kilitli');
      track('open_image_zoom');
    }),
  );
  dlg.addEventListener('close', () => document.documentElement.classList.remove('kilitli'));
  dlg.querySelector('[data-buyutec-kapat]')?.addEventListener('click', () => dlg.close());
  dlg.querySelector('[data-buyutec-onceki]')?.addEventListener('click', () => goster(i - 1));
  dlg.querySelector('[data-buyutec-sonraki]')?.addEventListener('click', () => goster(i + 1));
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') goster(i + 1);
    if (e.key === 'ArrowLeft') goster(i - 1);
  });

  // Fare tekerleği
  sahne.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [px, py] = merkezeGore(e.clientX, e.clientY);
    olcekle(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), px, py);
  }, { passive: false });

  // Çift tıklama / çift dokunma
  let sonDokunma = 0;
  const ciftDokunma = (x: number, y: number) => {
    const [px, py] = merkezeGore(x, y);
    olcekle(s > 1.01 ? 1 : 2.5, px, py, true);
  };
  sahne.addEventListener('dblclick', (e) => ciftDokunma(e.clientX, e.clientY));

  // İşaretçi olayları: sürükleme, iki parmak, kaydırarak geçiş
  const noktalar = new Map<number, { x: number; y: number }>();
  let bas = { s: 1, tx: 0, ty: 0, mesafe: 0, ox: 0, oy: 0, x: 0, y: 0 };
  const mesafe = () => { const [a, b] = [...noktalar.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
  const orta = () => { const v = [...noktalar.values()]; return [v.reduce((t, p) => t + p.x, 0) / v.length, v.reduce((t, p) => t + p.y, 0) / v.length] as const; };

  sahne.addEventListener('pointerdown', (e) => {
    sahne.setPointerCapture(e.pointerId);
    noktalar.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [mx, my] = orta();
    bas = { s, tx, ty, mesafe: mesafe(), ox: mx, oy: my, x: e.clientX, y: e.clientY };
    if (e.pointerType === 'touch' && noktalar.size === 1) {
      const simdi = Date.now();
      if (simdi - sonDokunma < 280) { ciftDokunma(e.clientX, e.clientY); sonDokunma = 0; } else sonDokunma = simdi;
    }
  });
  sahne.addEventListener('pointermove', (e) => {
    if (!noktalar.has(e.pointerId)) return;
    noktalar.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [mx, my] = orta();
    if (noktalar.size === 2 && bas.mesafe) {
      const yeni = Math.min(MAKS, Math.max(1, (bas.s * mesafe()) / bas.mesafe));
      const [px, py] = merkezeGore(bas.ox, bas.oy);
      s = bas.s; tx = bas.tx; ty = bas.ty;
      olcekle(yeni, px, py);
      tx += mx - bas.ox; ty += my - bas.oy; uygula();
    } else if (noktalar.size === 1 && s > 1.01) {
      tx = bas.tx + (mx - bas.ox); ty = bas.ty + (my - bas.oy); uygula();
    } else if (noktalar.size === 1) {
      img.style.transition = 'none';
      img.style.transform = `translateX(${(mx - bas.ox) * 0.6}px)`;
    }
  });
  const birak = (e: PointerEvent) => {
    if (!noktalar.has(e.pointerId)) return;
    const tekli = noktalar.size === 1;
    noktalar.delete(e.pointerId);
    if (tekli && s <= 1.01) {
      const dx = e.clientX - bas.x;
      if (Math.abs(dx) > 60 && gorseller.length > 1) goster(i + (dx < 0 ? 1 : -1));
      else uygula(true);
    }
    if (noktalar.size) { const [mx, my] = orta(); bas = { ...bas, s, tx, ty, mesafe: mesafe(), ox: mx, oy: my }; }
  };
  sahne.addEventListener('pointerup', birak);
  sahne.addEventListener('pointercancel', birak);
}
