/* Tarayıcı tarafı katalog: sayfaya gömülü JSON'dan okunur (Katalog.istemci()). */
import type { IstemciKatalog } from '../lib/fiyat';
export { formatTL } from '../lib/fiyat';

const ham = document.getElementById('katalog-veri')?.textContent;
export const katalog: IstemciKatalog = ham
  ? JSON.parse(ham)
  : { urunler: {}, setler: {}, heroId: '', kargo: { ucret: 0, ucretsizEsik: 0, kesimSaati: 14, teslimGun: [1, 3] }, whatsapp: '' };

export const urunBul = (id: string) => katalog.urunler[id];
export const setBul = (id: string) => katalog.setler[id];
export const waLink = (mesaj: string) => `https://wa.me/${katalog.whatsapp}?text=${encodeURIComponent(mesaj)}`;
