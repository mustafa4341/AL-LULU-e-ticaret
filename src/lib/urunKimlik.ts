/**
 * Ürün kimliği: barkod (GTIN / EAN-13).
 *
 * Barkod, panelde ürünün "Teknik özellikler" tablosuna "Barkod (EAN)" satırı olarak girilir.
 * Böylece müşteri sayfada da görür (Google: yapısal veri görünen içerikle aynı olmalı) ve
 * ayrı bir panel alanına gerek kalmaz.
 *
 * Uydurma barkod asla yazılmaz: satır yoksa ya da kontrol hanesi tutmuyorsa hiçbir yerde kullanılmaz.
 * Doğru barkod KUTUNUN ÜZERİNDEKİ çizgili kodun altındaki 13 haneli sayıdır.
 */
import type { Urun } from './sema';

const BARKOD_ETIKETI = /barkod|ean|gtin/i;

/** GS1 kontrol hanesi (8, 12, 13 ve 14 haneli GTIN için aynı kural) */
export function gtinGecerli(kod: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(kod)) return false;
  const rakamlar = [...kod].map(Number);
  const kontrol = rakamlar.pop()!;
  const toplam = rakamlar.reverse().reduce((t, r, i) => t + r * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (toplam % 10)) % 10 === kontrol;
}

/** Ürünün doğrulanmış barkodu (yalnız rakamlar) ya da undefined */
export function urunGtin(u: Pick<Urun, 'teknik'>): string | undefined {
  const satir = u.teknik.find(([etiket]) => BARKOD_ETIKETI.test(etiket));
  if (!satir) return undefined;
  const kod = satir[1].replace(/[\s-]/g, '');
  return gtinGecerli(kod) ? kod : undefined;
}

/** schema.org alan adı: 13 hane → gtin13, 8 → gtin8, 12 → gtin12, 14 → gtin14 */
export function gtinAlani(kod: string): 'gtin8' | 'gtin12' | 'gtin13' | 'gtin14' {
  return `gtin${kod.length}` as 'gtin8' | 'gtin12' | 'gtin13' | 'gtin14';
}
