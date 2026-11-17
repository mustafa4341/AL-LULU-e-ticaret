/**
 * Analitik — şimdilik sadece window.dataLayer'a yazar (çerez bırakmaz).
 * GA4 / Meta Pixel gibi bir araç eklenecekse, KVKK gereği kullanıcı onayı
 * alınmadan yüklenmemelidir. Olay adları GA4 e-ticaret standardıyla uyumludur.
 */
declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}
window.dataLayer = window.dataLayer || [];

export function track(event: string, params: Record<string, unknown> = {}): void {
  window.dataLayer.push({ event, ...params });
}
