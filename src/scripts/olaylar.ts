/**
 * Sayfa düzeyindeki GA4 e-ticaret olayları: ürün listesi görüntüleme (view_item_list), listeden ürün seçme (select_item),
 * ürün sayfası görüntüleme (view_item). Sepet ve ödeme olayları scripts/sepet.ts ve scripts/odeme.ts içinde,
 * satın alma (purchase) ödeme onaylanınca sipariş sayfasındadır.
 */
import { katalog, urunBul } from './katalog';
import { sepetHesapla } from '../lib/fiyat';
import { satirlardanUrunler, track, type Ga4Urun } from './analitik';

function listeAdi(): string {
  const p = location.pathname;
  if (p === '/') return 'Ana sayfa';
  if (p === '/urunler') return 'Tüm ürünler';
  if (p.startsWith('/kategori/')) {
    // Bozuk kodlanmış adres (ör. "%E0") betiği durdurmasın (denetim AUD-037)
    try { return 'Kategori: ' + decodeURIComponent(p.slice(10)); } catch { return 'Kategori: ' + p.slice(10); }
  }
  if (p.startsWith('/urun/')) return 'Ürün sayfası önerileri';
  return 'Diğer';
}

function urunVerisi(id: string): Ga4Urun | undefined {
  if (!urunBul(id)) return undefined;
  return satirlardanUrunler(sepetHesapla([{ tip: 'urun', id, adet: 1 }], katalog).satirlar)[0];
}

/* Ürün sayfası */
const urunSayfasi = document.querySelector<HTMLElement>('[data-ga-urun]');
const sayfaUrunu = urunSayfasi?.dataset.gaUrun;
if (sayfaUrunu) {
  const u = urunVerisi(sayfaUrunu);
  if (u) track('view_item', { currency: 'TRY', value: u.price, items: [u] });
}

/* Ürün listeleri (kartlar). Ürün sayfasındaki ana ürün listede sayılmaz. */
const kartlar = Array.from(document.querySelectorAll<HTMLElement>('[data-urun-kart][data-urun-id]'));
const ad = listeAdi();
const gorulen = new Set<string>();
const listeUrunleri: Ga4Urun[] = [];
kartlar.forEach((k) => {
  const id = k.dataset.urunId!;
  if (gorulen.has(id) || id === sayfaUrunu) return;
  gorulen.add(id);
  const u = urunVerisi(id);
  if (u) listeUrunleri.push({ ...u, item_list_name: ad, index: listeUrunleri.length });
});
if (listeUrunleri.length) track('view_item_list', { item_list_name: ad, items: listeUrunleri });

document.addEventListener('click', (e) => {
  const kart = (e.target as Element).closest<HTMLElement>('[data-urun-kart][data-urun-id]');
  // Kart içindeki "Sepete ekle" düğmesi add_to_cart sayar; yalnız ürüne giden bağlantılar seçimdir
  if (!kart || !(e.target as Element).closest('a[href]')) return;
  const u = listeUrunleri.find((x) => x.item_id === urunVerisi(kart.dataset.urunId!)?.item_id);
  if (u) track('select_item', { item_list_name: ad, items: [u] });
});
