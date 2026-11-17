/* Yönetim paneli etkileşimleri */
import { formatTL, pencereFiyatlari } from '../lib/fiyat';
import type { FiyatKaydi } from '../lib/sema';

/* Tekrarlanan satırlar: "+ ekle" şablondan kopyalar, çöp kutusu satırı siler */
document.addEventListener('click', (e) => {
  const t = e.target as Element;
  const ekle = t.closest<HTMLButtonElement>('[data-tekrar-ekle]');
  if (ekle) {
    const kap = ekle.parentElement!;
    const sablon = kap.querySelector('template');
    if (!sablon) return;
    const yeni = sablon.content.firstElementChild!.cloneNode(true) as HTMLElement;
    kap.insertBefore(yeni, ekle);
    yeni.querySelector<HTMLElement>('input, textarea, select')?.focus();
    return;
  }
  const sil = t.closest('[data-tekrar-sil]');
  if (sil) sil.closest('.y-tekrar__satir')?.remove();
});

/* Silme gibi geri alınamaz işlemlerde onay */
document.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLElement>('[data-onayla]');
  if (b && !confirm(b.dataset.onayla!)) e.preventDefault();
});

/* Görsel seçince önizleme */
document.querySelectorAll<HTMLInputElement>('[data-gorsel-sec]').forEach((girdi) => {
  const alan = document.querySelector<HTMLElement>('[data-gorsel-onizleme]');
  girdi.addEventListener('change', () => {
    if (!alan) return;
    alan.innerHTML = '';
    Array.from(girdi.files ?? []).forEach((f) => {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(f);
      img.alt = f.name;
      alan.appendChild(img);
    });
  });
});

/* Fiyat / indirim önizlemesi: sitede ne görüneceğini kaydetmeden önce gösterir */
document.querySelectorAll<HTMLElement>('[data-fiyat-kutu]').forEach((kutu) => {
  const fiyatG = kutu.querySelector<HTMLInputElement>('[data-fiyat-girdi]')!;
  const kampanyaG = kutu.querySelector<HTMLInputElement>('[data-kampanya-girdi]')!;
  const cikti = kutu.querySelector<HTMLElement>('[data-indirim-onizleme]')!;
  const gecmis: FiyatKaydi[] = JSON.parse(kutu.querySelector('[data-fiyat-gecmisi]')?.textContent || '[]');
  const mevcut = Number(kutu.dataset.mevcut) || 0;
  const gun = Number(kutu.dataset.gun) || 30;
  const aktifOnceki = Number(kutu.dataset.aktifOnceki) || 0;
  const goster = (sinif: string, html: string) => { cikti.className = `y-indirim-onizleme ${sinif}`; cikti.innerHTML = html; };

  const guncelle = () => {
    const yeni = Number(fiyatG.value.replace(/\D/g, '')) || 0;
    if (!kampanyaG.checked) {
      goster('', yeni && mevcut && yeni !== mevcut
        ? `Fiyat <strong>${formatTL(mevcut)}</strong> → <strong>${formatTL(yeni)}</strong> olacak. İndirim olarak gösterilmeyecek.`
        : 'İndirim gösterimi kapalı.');
      return;
    }
    if (yeni === mevcut && aktifOnceki > yeni) {
      goster('is-iyi', `Sitede: <s>${formatTL(aktifOnceki)}</s> → <strong>${formatTL(yeni)}</strong> (%${Math.round(((aktifOnceki - yeni) / aktifOnceki) * 100)} indirim) gösteriliyor.`);
      return;
    }
    const simdi = Date.now();
    const fiyatlar = pencereFiyatlari(gecmis, simdi - gun * 864e5, simdi + 1, true);
    if (!fiyatlar) {
      const ilk = gecmis.length ? Math.min(...gecmis.map((g) => Date.parse(g.tarih))) : simdi;
      const kalan = Math.max(1, Math.ceil((ilk + gun * 864e5 - simdi) / 864e5));
      goster('is-uyari', `Bu ürün sitede henüz ${gun} günden kısa süredir satışta. Üstü çizili indirim, yasal kural gereği en erken <strong>${kalan} gün sonra</strong> gösterilebilir. Bu sürede "Sepette %X indirim" veya set indirimi kullanabilirsiniz.`);
      return;
    }
    const referans = fiyatlar.length ? Math.min(...fiyatlar) : 0;
    if (yeni && referans > yeni) {
      goster('is-iyi', `Kaydedince sitede: <s>${formatTL(referans)}</s> → <strong>${formatTL(yeni)}</strong> · <strong>%${Math.round(((referans - yeni) / referans) * 100)} indirim</strong> ve "Son ${gun} günün en düşük fiyatı" etiketi görünecek.`);
    } else {
      goster('is-uyari', `Son ${gun} günde sitede <strong>${formatTL(referans || yeni)}</strong> fiyatından daha yüksek bir fiyat uygulanmadığı için üstü çizili fiyat <strong>gösterilmez</strong>. Örneğin 14.000 TL'den 13.000 TL'ye indirim göstermek için ürün en az ${gun} gün boyunca gerçekten 14.000 TL'den satışta olmalı; sonra fiyatı düşürüp bu kutuyu işaretleyin.`);
    }
  };
  fiyatG.addEventListener('input', guncelle);
  kampanyaG.addEventListener('change', guncelle);
  guncelle();
});
