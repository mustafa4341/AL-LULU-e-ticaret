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
 *  - Stoppage (%1 e-ticaret stopajı) → ayrı "stopaj" alanı: hakedişten düşer ama gider değildir (vergiden mahsup)
 *  - PaymentOrder → bankaya ödenen (ayrı toplam; hakedişe eklenmez)
 *  - CommissionAgreementInvoice (komisyon mutabakat faturası) satış satırlarındaki komisyonun faturasıdır, tekrar sayılmaz.
 *  TyDiscount / TyCoupon (Trendyol bütçeli) bilerek çekilmez: satıcının hakedişini düşürmez.
 */
import { finansGunu, type TrendyolParcasi, type TrendyolSatiri } from './finans';

type Ham = Record<string, unknown>;
const sayi = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : 0;
const yazi = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined;
const kurus = (tl: number) => Math.round(tl * 100);

type Parca = TrendyolParcasi;

/**
 * Trendyol ekstre yanıtında işlem türü TÜRKÇE gelir ("Satış", "İade", "Ödeme"…; belge: Cari Hesap Ekstresi Entegrasyonu
 * örnek yanıtı ve tür tablosu). İstekte İngilizce ad gönderilir. Kod İngilizce adlarla çalıştığı için yanıt adı çevrilir.
 * 25.11.2026'ya kadar yalnız "Sale" arandığı için satışlar "diğer" (eksi), komisyon 0 yazılıyordu.
 */
const TR_TURLER: Record<string, string> = {
  'satış': 'Sale', 'iade': 'Return', 'indirim': 'Discount', 'indirim iptal': 'DiscountCancel',
  'kupon': 'Coupon', 'kupon iptal': 'CouponCancel', 'provizyon +': 'ProvisionPositive', 'provizyon -': 'ProvisionNegative',
  'kurumsal fatura - ty promosyon': 'TyDiscount', 'kurumsal fatura - ty promosyon iptali': 'TyDiscountCancel',
  'kurumsal fatura - ty kupon': 'TyCoupon', 'kurumsal fatura - ty kupon iptali': 'TyCouponCancel',
  'kısmi iade': 'ManualRefund', 'kısmi iade iptal': 'ManualRefundCancel',
  'hakediş pozitif düzeltme': 'SellerRevenuePositive', 'hakediş negatif düzeltme': 'SellerRevenueNegative',
  'komisyon pozitif düzeltme': 'CommissionPositive', 'komisyon negatif düzeltme': 'CommissionNegative',
  'teslimat ücreti': 'DeliveryFee', 'teslimat ücreti iptal': 'DeliveryFeeCancel',
  'ödeme': 'PaymentOrder', 'stopaj': 'Stoppage', 'kesinti faturası': 'DeductionInvoices', 'kesinti faturaları': 'DeductionInvoices',
  'komisyon mutabakat faturası': 'CommissionAgreementInvoice', 'iade faturası': 'ReturnInvoice',
};
/** Ham işlem türü → İngilizce kod adı ("Discount Cancel" → "DiscountCancel", "ManuelRefund" → "ManualRefund") */
export function tyIslemTuru(ham: string): string {
  const tr = ham.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
  const bulunan = TR_TURLER[tr]
    ?? (tr.includes('stopaj') ? 'Stoppage' : tr.includes('kesinti') ? 'DeductionInvoices' : tr.includes('komisyon mutabakat') ? 'CommissionAgreementInvoice' : undefined);
  return (bulunan ?? ham.replace(/\s+/g, '')).replace(/^ManuelRefund/, 'ManualRefund');
}
const bosParca = (tarih: number, tur?: string): Parca => ({ tarih, tur, odenen: true, brut: 0, indirim: 0, iade: 0, komisyon: 0, hizmet: 0, kargo: 0, diger: 0, banka: 0, stopaj: 0 });

export type TyEkstreOzeti = { satirlar: TrendyolSatiri[]; odenen: number; kayit: number; atlanan: number; turler: Record<string, number> };

/**
 * Parçalardan sipariş satırı. Tutarlar işaretlidir: bir siparişte yalnız iade varsa (satışı daha önceki bir dönemde)
 * komisyon iadesi eksi komisyon, bankaya geçen eksi tutar olarak görünür; böylece hakediş Trendyol ekstresiyle aynı kalır.
 */
export function parcalardanSatir(id: string, parcalar: Record<string, Parca>): TrendyolSatiri {
  const p = Object.values(parcalar);
  const top = (alan: 'brut' | 'indirim' | 'iade' | 'komisyon' | 'hizmet' | 'kargo' | 'diger' | 'banka' | 'stopaj') => p.reduce((t, x) => t + x[alan], 0);
  const stopaj = top('stopaj');
  return {
    id, tarih: finansGunu(Math.min(...p.map((x) => x.tarih))),
    brut: top('brut'), indirim: top('indirim'), iade: top('iade'), komisyon: top('komisyon'),
    hizmet: top('hizmet'), kargo: top('kargo'), diger: top('diger'),
    ...(stopaj ? { stopaj: Math.max(0, stopaj) } : {}),
    // Bankaya geçen yalnız her işlemi için ödeme emri oluşmuş siparişte yazılır; diğerleri "beklenen" kalır.
    banka: p.length && p.every((x) => x.odenen) ? top('banka') : undefined,
    parcalar,
  };
}

/**
 * Yeni çekilen satırı kayıtlı satırla birleştirir (denetim AUD-003). Eskiden 15 günlük çekimde yalnız iade gelen bir sipariş
 * önceki satış kaydının üstüne yazılıyor, brüt satış ve tarih kayboluyordu.
 *  - İkisi de parçalı: işlem kimliğine göre birleşir (aynı işlem tekrar gelirse güncellenir, iki kez sayılmaz).
 *  - Kayıtlı satır eski biçimde (parçasız) ve yeni çekimde satış yok: eski toplamlar "_onceki" parçası olarak korunur.
 *  - Elle yüklenen hakediş dosyası (parçasız yeni satır): eskisi gibi üstüne yazar.
 */
export function trendyolBirlestir(eski: TrendyolSatiri | undefined, yeni: TrendyolSatiri): TrendyolSatiri {
  if (!eski || !yeni.parcalar) return yeni;
  const satisVar = Object.values(yeni.parcalar).some((x) => x.tur === 'Sale');
  const taban: Record<string, Parca> = eski.parcalar ?? (satisVar ? {} : {
    _onceki: {
      tarih: Date.parse(eski.tarih + 'T12:00:00+03:00') || Date.now(), tur: 'onceki', odenen: eski.banka !== undefined,
      brut: eski.brut, indirim: eski.indirim, iade: eski.iade, komisyon: eski.komisyon, hizmet: eski.hizmet,
      kargo: eski.kargo, diger: eski.diger, banka: eski.banka ?? 0, stopaj: eski.stopaj ?? 0,
    },
  });
  return parcalardanSatir(yeni.id, { ...taban, ...yeni.parcalar });
}

export function trendyolEkstreSatirlari(satislar: Ham[], diger: Ham[]): TyEkstreOzeti {
  const siparisler = new Map<string, Record<string, Parca>>();
  const turler: Record<string, number> = {};
  let atlanan = 0;
  for (const x of satislar) {
    const tur = tyIslemTuru(yazi(x.transactionType) ?? '');
    turler[tur] = (turler[tur] ?? 0) + 1;
    const anahtar = yazi(x.orderNumber) ?? yazi(x.shipmentPackageId) ?? yazi(x.id);
    const tarih = sayi(x.transactionDate);
    if (!anahtar || !tarih) { atlanan++; continue; }
    const borc = sayi(x.debt);
    const alacak = sayi(x.credit);
    const net = kurus(borc - alacak); // pozitif: satıcıdan düşen
    const komisyon = kurus(Math.abs(sayi(x.commissionAmount)));
    const hakedis = kurus(Math.abs(sayi(x.sellerRevenue)));
    const parcalar = siparisler.get(anahtar) ?? {};
    // İşlem kimliği yoksa tür + tarih + tutardan türetilir (aynı işlem tekrar gelince yine aynı anahtar)
    const islemId = (yazi(x.id) ?? `${tur}-${tarih}-${borc}-${alacak}`).slice(0, 120);
    const t = bosParca(tarih, tur.slice(0, 60));
    t.odenen = Boolean(x.paymentOrderId);
    if (tur === 'Sale') { t.brut = kurus(alacak - borc); t.komisyon = komisyon; t.banka = hakedis; }
    else if (tur === 'Return') { t.iade = net; t.komisyon = -komisyon; t.banka = -hakedis; }
    else if (tur.startsWith('ManualRefund')) t.iade = net;
    else if (tur.startsWith('Discount') || tur.startsWith('Coupon')) t.indirim = net;
    else if (tur.startsWith('DeliveryFee')) t.kargo = net;
    else t.diger = net;
    parcalar[islemId] = t;
    siparisler.set(anahtar, parcalar);
  }
  const satirlar: TrendyolSatiri[] = [];
  for (const [no, parcalar] of siparisler) satirlar.push(parcalardanSatir(('TY-' + no).slice(0, 100), parcalar));
  let odenen = 0;
  for (const x of diger) {
    const tur = tyIslemTuru(yazi(x.transactionType) ?? '');
    turler[tur] = (turler[tur] ?? 0) + 1;
    const tarih = sayi(x.transactionDate);
    const id = yazi(x.id) ?? yazi(x.receiptId);
    if (!tarih || !id) { atlanan++; continue; }
    const net = sayi(x.debt) - sayi(x.credit);
    if (tur === 'PaymentOrder') { odenen += Math.abs(kurus(net)); continue; }
    if (tur !== 'DeductionInvoices' && tur !== 'Stoppage') continue;
    const aciklama = (yazi(x.description) ?? '').toLocaleLowerCase('tr');
    const tutar = Math.max(0, kurus(net));
    if (!tutar) continue;
    const alan = tur === 'Stoppage' ? 'stopaj' : /kargo|desi|gönderi|lojistik/.test(aciklama) ? 'kargo'
      : /hizmet|platform|işlem/.test(aciklama) ? 'hizmet' : 'diger';
    satirlar.push({
      id: ('TY-K-' + id).slice(0, 100), tarih: finansGunu(tarih),
      brut: 0, indirim: 0, iade: 0, komisyon: 0, hizmet: 0, kargo: 0, diger: 0, [alan]: tutar,
    });
  }
  return { satirlar, odenen, kayit: satislar.length + diger.length, atlanan, turler };
}
