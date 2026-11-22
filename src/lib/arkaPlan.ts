/**
 * Yanıtı bekletmeyen işler (müşteri e-postası, stok uyarısı, arama motoru bildirimi).
 * Kayıt bittiği an panel sayfası açılır; bu işler arkada tamamlanır.
 * Vercel'de `waitUntil` işlev yanıt gittikten sonra da işi bitirene kadar açık kalmasını sağlar;
 * yerel sunucuda süreç zaten açık olduğundan iş kendiliğinden tamamlanır.
 */
import { waitUntil } from '@vercel/functions';

export function arkaPlanda(is: Promise<unknown>, ad: string): void {
  const korumali = is.catch((e) => console.error(`[arka plan] ${ad} tamamlanamadı:`, e));
  try { waitUntil(korumali); } catch { /* istek bağlamı yok (yerel): iş yine sürer */ }
}
