/**
 * IndexNow: panelde bir ürünün fiyatı, stok durumu, adı, fotoğrafları veya yayın durumu değişince
 * değişen sayfa adresini Bing, Yandex, Seznam, Naver ve Yep'e anında bildirir (indexnow.org protokolü;
 * bildirim tüm katılımcı arama motorlarıyla paylaşılır). Google bu protokole katılmaz; Google için
 * site haritası + Search Console yeterlidir.
 *
 * - Anahtar herkese açıktır (doğrulama dosyası: public/<ANAHTAR>.txt). Değiştirirseniz dosya adını ve içeriğini de değiştirin.
 * - Yalnız canlı sitede (Vercel production) çalışır; yerel testler ve önizlemeler bildirim göndermez.
 * - Hata, zaman aşımı ya da arama motorunun reddi kaydı ASLA bozmaz; en fazla 3 sn bekler.
 * - Dizine ekleme veya sıralama garantisi yoktur; yalnızca "bu adres değişti" haberidir.
 */
import type { Magaza, Urun } from './sema';

export const INDEXNOW_ANAHTARI = '237cdb8bf076256eb8be47b16718cdbf';
const UC_NOKTA = 'https://api.indexnow.org/indexnow';

const ortam = (ad: string): string | undefined =>
  process.env[ad] ?? ((import.meta.env ?? {}) as Record<string, string | undefined>)[ad];

/** Müşterinin gördüğü ve arama motorunun önemsediği alanlar (stok adedi değil, yalnız var/yok) */
function urunImzasi(u: Urun): string {
  return JSON.stringify([u.durum, u.marka, u.ad, u.fiyat, u.stok > 0, u.gorseller.map((g) => g.src), u.ozet, u.kampanya, u.sepetteIndirim, u.teknik]);
}

/** İki mağaza sürümü arasında arama motoruna bildirilmesi gereken ürün adresleri */
export function degisenUrunAdresleri(onceki: Magaza, sonraki: Magaza): string[] {
  const kok = sonraki.site.url.replace(/\/$/, '');
  const eski = new Map(onceki.urunler.map((u) => [u.id, u]));
  const yeni = new Map(sonraki.urunler.map((u) => [u.id, u]));
  const adresler: string[] = [];
  for (const id of new Set([...eski.keys(), ...yeni.keys()])) {
    const a = eski.get(id);
    const b = yeni.get(id);
    // Hiç yayına çıkmamış (taslak/gizli) ürünler bildirilmez; yayından kalkan ya da silinen bildirilir
    if (a?.durum !== 'yayinda' && b?.durum !== 'yayinda') continue;
    if (!a || !b || urunImzasi(a) !== urunImzasi(b)) adresler.push(`${kok}/urun/${id}`);
  }
  return adresler;
}

/** Panel kaydından sonra çağrılır: değişen ürün sayfalarını bildirir. Asla hata fırlatmaz. */
export async function magazaDegisikliginiBildir(onceki: Magaza, sonraki: Magaza): Promise<string> {
  try {
    return await indexNowBildir(degisenUrunAdresleri(onceki, sonraki), sonraki.site.url);
  } catch (e) {
    return `atlandı: ${(e as Error).message}`;
  }
}

/** Adresleri bildirir. Asla hata fırlatmaz; sonucu (HTTP kodu ya da neden) döndürür. */
export async function indexNowBildir(adresler: string[], siteUrl: string): Promise<string> {
  if (!adresler.length) return 'değişiklik yok';
  if (ortam('VERCEL_ENV') !== 'production' && ortam('INDEXNOW_ZORLA') !== '1') return 'canlı ortam değil';
  try {
    const host = new URL(siteUrl).hostname;
    const yanit = await fetch(UC_NOKTA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key: INDEXNOW_ANAHTARI, keyLocation: `https://${host}/${INDEXNOW_ANAHTARI}.txt`, urlList: adresler.slice(0, 100) }),
      signal: AbortSignal.timeout(3000),
    });
    return `HTTP ${yanit.status}`;
  } catch (e) {
    return `gönderilemedi: ${(e as Error).message}`;
  }
}
