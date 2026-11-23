/**
 * Yönetim paneline özel ikon adları (PanelIkonlar.astro sprite'ı).
 * Mağaza ikon şemasına (lib/sema.ts IKONLAR) dokunmaz; panelde <PIkon> ile ikisi birlikte kullanılır.
 */
import type { IkonAdi } from '../../lib/sema';

export const PANEL_IKONLARI = [
  'sepet', 'zincir', 'grafik', 'magaza', 'zil', 'soru', 'simsek', 'takvim', 'takvim-tik', 'yenile', 'indir', 'yukle',
  'uyari', 'bilgi', 'goz', 'kalem', 'filtre', 'katman', 'para', 'cuzdan', 'yazici', 'kopya', 'dis-baglanti', 'liste',
  'fatura', 'banka', 'yuzde', 'resim', 'klasor', 'barkod', 'cikis', 'hedef', 'veritabani', 'ok-sag', 'ok-sol',
  'tik-daire', 'carpi-daire', 'pano', 'gecmis', 'degistir', 'ayarlar-cubuk', 'duzen', 'ekran', 'gonder', 'anahtar',
  'terazi', 'kategori', 'set', 'paket-tik',
] as const;

export type PanelIkonAdi = IkonAdi | (typeof PANEL_IKONLARI)[number];
