/**
 * Trendyol cari hesap ekstresi (settlements + otherfinancials) → Finans › Trendyol satırları.
 * Elle yüklenen "hakediş dosyası" ile aynı tabloya yazılır; böylece özet, rapor ve muhasebeci Excel'i değişmeden çalışır.
 *
 * Eşleme (belgeye göre, ilk gerçek kayıtlarda satıcı panelindeki ekstreyle karşılaştırılmalı):
 *  - Sale → brüt satış (alacak), komisyon = commissionAmount
 *  - Return / ManualRefund → iade (borç), iade komisyonu brütten değil komisyondan düşülür
 *  - Discount / Coupon (satıcı bütçeli) → satıcı indirimi; *Cancel kayıtları geri alır
 *  - DeliveryFee → kargo; Provision → diğer
 *  - DeductionInvoices (kesinti faturaları) → açıklamasına göre kargo / hizmet bedeli / diğer
 *  - Stoppage (e-ticaret stopajı) → diğer
 *  - PaymentOrder → bankaya ödenen (ayrı toplam; hakedişe eklenmez)
 *  - CommissionAgreementInvoice (komisyon mutabakat faturası) satış satırlarındaki komisyonun faturasıdır, tekrar sayılmaz.
 *  TyDiscount / TyCoupon (Trendyol bütçeli) bilerek çekilmez: satıcının hakedişini düşürmez.
 */
import { finansGunu, type TrendyolSatiri } from './finans';

type Ham = Record<string, unknown>;
const sayi = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : 0;
const yazi = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined;
const kurus = (tl: number) => Math.round(tl * 100);

type Toplam = { tarih: number; brut: number; indirim: number; iade: number; komisyon: number; hizmet: number; kargo: number; diger: number; banka: number; odenen: boolean; kayit: number };
const bos = (tarih: number): Toplam => ({ tarih, brut: 0, indirim: 0, iade: 0, komisyon: 0, hizmet: 0, kargo: 0, diger: 0, banka: 0, odenen: true, kayit: 0 });

export type TyEkstreOzeti = { satirlar: TrendyolSatiri[]; odenen: number; kayit: number; atlanan: number; turler: Record<string, number> };

export function trendyolEkstreSatirlari(satislar: Ham[], diger: Ham[]): TyEkstreOzeti {
  const siparisler = new Map<string, Toplam>();
  const turler: Record<string, number> = {};
  let atlanan = 0;
  for (const x of satislar) {
    const tur = yazi(x.transactionType) ?? '';
    turler[tur] = (turler[tur] ?? 0) + 1;
    const anahtar = yazi(x.orderNumber) ?? yazi(x.shipmentPackageId) ?? yazi(x.id);
    const tarih = sayi(x.transactionDate);
    if (!anahtar || !tarih) { atlanan++; continue; }
    const t = siparisler.get(anahtar) ?? bos(tarih);
    t.tarih = Math.min(t.tarih, tarih);
    t.kayit++;
    const borc = sayi(x.debt);
    const alacak = sayi(x.credit);
    const net = borc - alacak; // pozitif: satıcıdan düşen
    const komisyon = Math.abs(sayi(x.commissionAmount));
    const hakedis = Math.abs(sayi(x.sellerRevenue));
    if (!x.paymentOrderId) t.odenen = false;
    if (tur === 'Sale') { t.brut += alacak - borc; t.komisyon += komisyon; t.banka += hakedis; }
    else if (tur === 'Return') { t.iade += net; t.komisyon -= komisyon; t.banka -= hakedis; }
    else if (tur.startsWith('ManualRefund')) t.iade += net;
    else if (tur.startsWith('Discount') || tur.startsWith('Coupon')) t.indirim += net;
    else if (tur.startsWith('DeliveryFee')) t.kargo += net;
    else t.diger += net;
    siparisler.set(anahtar, t);
  }
  const satirlar: TrendyolSatiri[] = [];
  const pozitif = (n: number) => Math.max(0, kurus(n));
  for (const [no, t] of siparisler) {
    satirlar.push({
      id: ('TY-' + no).slice(0, 100), tarih: finansGunu(t.tarih),
      brut: pozitif(t.brut), indirim: pozitif(t.indirim), iade: pozitif(t.iade), komisyon: pozitif(t.komisyon),
      hizmet: pozitif(t.hizmet), kargo: pozitif(t.kargo), diger: pozitif(t.diger),
      // Bankaya geçen yalnız ödeme emri oluşmuş siparişte yazılır; diğerleri "beklenen" kalır.
      banka: t.odenen && t.kayit ? Math.round(t.banka * 100) : undefined,
    });
  }
  let odenen = 0;
  for (const x of diger) {
    const tur = yazi(x.transactionType) ?? '';
    turler[tur] = (turler[tur] ?? 0) + 1;
    const tarih = sayi(x.transactionDate);
    const id = yazi(x.id) ?? yazi(x.receiptId);
    if (!tarih || !id) { atlanan++; continue; }
    const net = sayi(x.debt) - sayi(x.credit);
    if (tur === 'PaymentOrder') { odenen += Math.abs(kurus(net)); continue; }
    if (tur !== 'DeductionInvoices' && tur !== 'Stoppage') continue;
    const aciklama = (yazi(x.description) ?? '').toLocaleLowerCase('tr');
    const tutar = pozitif(net);
    if (!tutar) continue;
    const alan = tur === 'Stoppage' ? 'diger' : /kargo|desi|gönderi|lojistik/.test(aciklama) ? 'kargo'
      : /hizmet|platform|işlem/.test(aciklama) ? 'hizmet' : 'diger';
    satirlar.push({
      id: ('TY-K-' + id).slice(0, 100), tarih: finansGunu(tarih),
      brut: 0, indirim: 0, iade: 0, komisyon: 0, hizmet: 0, kargo: 0, diger: 0, [alan]: tutar,
    });
  }
  return { satirlar, odenen, kayit: satislar.length + diger.length, atlanan, turler };
}
