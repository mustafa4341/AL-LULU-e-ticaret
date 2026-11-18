/**
 * Analitik — yalnızca window.dataLayer'a yazar; kendi başına çerez bırakmaz, hiçbir yere veri göndermez.
 * Google Tag Manager, kullanıcı çerez penceresinde izin verirse yüklenir (components/CerezOnay.astro)
 * ve bu kuyruktaki olayları GA4'e iletir. Olay adları GA4 e-ticaret standardındadır.
 *
 * E-ticaret olayları GA4'ün beklediği biçimde gönderilir: önce { ecommerce: null } (önceki ürün verisi temizlensin),
 * sonra { event, ecommerce: { currency, value, items, ... } }. GTM'de GA4 olay etiketinde
 * "E-ticaret verilerini gönder → Data Layer" seçilmelidir.
 */
import type { HesapSatiri } from '../lib/fiyat';

declare global {
  interface Window {
    dataLayer: unknown[];
  }
}
window.dataLayer = window.dataLayer || [];

const ETICARET = new Set([
  'view_item_list', 'select_item', 'view_item', 'add_to_cart', 'remove_from_cart', 'view_cart',
  'begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase', 'refund',
]);

export interface Ga4Urun {
  item_id: string;
  item_name: string;
  item_brand?: string;
  item_category?: string;
  item_list_name?: string;
  index?: number;
  price: number;
  discount?: number;
  quantity: number;
}

export function track(event: string, params: Record<string, unknown> = {}): void {
  if (ETICARET.has(event)) {
    window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push({ event, ecommerce: params });
  } else {
    window.dataLayer.push({ event, ...params });
  }
}

/** Sepet satırlarını GA4 ürün listesine çevirir (fiyat: müşterinin ödediği birim fiyat) */
export function satirlardanUrunler(satirlar: readonly HesapSatiri[]): Ga4Urun[] {
  return satirlar.map((s) => ({
    item_id: s.sku ?? s.id,
    item_name: s.ad,
    ...(s.tip === 'set' ? { item_category: 'Set' } : {}),
    price: Math.round((s.toplam / s.adet) * 100) / 100,
    ...(s.indirim ? { discount: Math.round((s.indirim / s.adet) * 100) / 100 } : {}),
    quantity: s.adet,
  }));
}
