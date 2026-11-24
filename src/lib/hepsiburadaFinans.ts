import { hbIsaretli, hbKayitSema, hbPerformansSema, type HbKayit, type HbPerformans } from './finans';

/**
 * Hepsiburada muhasebe servisi (mpfinance) kayıtlarını okur ve gruplar.
 * Alan adları resmi OpenAPI belgesinden (developers.hepsiburada.com › Muhasebe Entegrasyonu, v1.0).
 */

type Ham = Record<string, unknown>;
const nesne = (v: unknown): Ham => v && typeof v === 'object' && !Array.isArray(v) ? v as Ham : {};
const alan = (o: Ham, ad: string) => o[ad] ?? o[Object.keys(o).find((k) => k.toLowerCase() === ad.toLowerCase()) ?? ''];
const metin = (v: unknown, en = 300) => typeof v === 'string' && v.trim() ? v.trim().slice(0, en)
  : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined;
const sayi = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v
  : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : undefined;
/** { value, currencyCode } → kuruş (işaretli). Para birimi TRY (949) değilse undefined. */
const para = (v: unknown) => {
  const o = nesne(v);
  const deger = sayi(alan(o, 'value'));
  const birim = metin(alan(o, 'currencyCode'));
  if (deger === undefined || (birim && !['949', 'TRY', 'TL'].includes(birim.toUpperCase()))) return undefined;
  return Math.round(deger * 100);
};
const tarih = (v: unknown) => {
  const t = metin(v, 40);
  return t && !Number.isNaN(Date.parse(t)) ? new Date(Date.parse(t)).toISOString() : undefined;
};

export const HB_GRUPLAR = {
  satis: 'Satış tutarı', iade: 'İade', komisyon: 'Komisyon', kampanya: 'Kampanya katkısı (komisyondan düşen)',
  kargo: 'Kargo', islem: 'İşlem bedeli', hizmet: 'Hizmet bedeli', odemeServisi: 'Ödeme (POS) maliyeti',
  stopaj: 'Stopaj (vergiden düşülür)', ceza: 'Gecikme, iptal ve müşteri memnuniyeti yansıtmaları',
  reklam: 'Reklam ve pazarlama', kdv: 'KDV kayıtları', diger: 'Diğer', aktarim: 'Bankaya aktarılan ödeme',
} as const;
export type HbGrup = keyof typeof HB_GRUPLAR;

const GRUP_TURLERI: Record<Exclude<HbGrup, 'diger'>, string[]> = {
  satis: ['Payment', 'BnplOrder'],
  iade: ['Return', 'BnplRefund'],
  komisyon: ['Commission', 'CommissionRefund', 'CommissionCorrection', 'CommissionInvoiceRefund', 'OverseasCommissionRefund'],
  kampanya: ['CampaignDiscount', 'CampaignDiscountRefund', 'HepsiGlobalCampaignDiscount'],
  kargo: ['ShipmentCostSharingExpense', 'ShipmentCostSharingIncome', 'ReturnShipmentCostSharingExpense', 'OneClickReturnShipmentCostSharingExpense',
    'DropShipmentCostSharingExpense', 'DropShipmentCostSharingIncome', 'CargoMargin', 'CargoCostRefund', 'TransportExpense', 'TransportExpenseRefund',
    'CargoCompensationIncome', 'CargoCompensationIncomeRefund', 'CargoCompensationExpenseRefund', 'CargoCompensationSellerSatisfactionIncome', 'CargoLimitExcessCompensationIncome'],
  islem: ['DeliveryProcessingFee', 'DeliveryProcessingFeeRefund', 'ReturnDeliveryProcessingFee', 'BnplProcessingFee', 'BnplProcessingFeeRefund'],
  hizmet: ['ProcessingFeeExpense', 'ProcessingFeeExpenseRefund', 'ReturnProcessingFeeExpense', 'MpCompensationIncome'],
  odemeServisi: ['PaymentServiceCostReflection', 'PaymentServiceCostReflectionRefund'],
  stopaj: ['Stoppage', 'StoppageRefund', 'GoldLaborStoppage', 'GoldLaborStoppageRefund'],
  ceza: ['CustomerSatisfaction', 'CustomerSatisfactionRefund', 'InboundCustomerSatisfaction', 'InboundCustomerSatisfactionRefund',
    'OutboundCustomerSatisfaction', 'OutboundCustomerSatisfactionRefund', 'LineItemTransferExpense', 'LineItemTransferIncome', 'LateInterestExpense', 'SfsInterest'],
  reklam: ['AdSharingExpense', 'AdSharingExpenseRefund', 'MarketingExpense', 'MarketingExpenseRefund', 'FacebookAdExpense', 'MarketingSupportParticipation',
    'MarketingSupportParticipationRefund', 'SponsorshipFee', 'StudioExpense', 'AdBalanceTopUpFromAllowance', 'AdBalanceTopUpFromAllowanceRefund'],
  kdv: ['VAT'],
  aktarim: ['TotalPayment'],
};
const TUR_GRUBU = new Map(Object.entries(GRUP_TURLERI).flatMap(([g, turler]) => turler.map((t) => [t, g as HbGrup])));
export const hbGrubu = (tur: string): HbGrup => TUR_GRUBU.get(tur) ?? 'diger';

/** Ham kayıt → HbKayit. Kimliği, türü ya da tutarı okunamayan kayıt sessizce atlanmaz; çağıran hatayı bildirir. */
export function hbKayitOku(h: Ham): HbKayit | undefined {
  const tutar = para(alan(h, 'amount'));
  const id = metin(alan(h, 'id'), 100);
  const tur = metin(alan(h, 'transactionType'), 80);
  if (tutar === undefined || !id || !tur) return undefined;
  const kdv = Math.abs(para(alan(h, 'taxAmount')) ?? 0);
  const netHam = para(alan(h, 'netAmount'));
  const gelirHam = alan(h, 'isIncome');
  const kayit = {
    id, tur, durum: metin(alan(h, 'status'), 30) ?? '',
    gelir: typeof gelirHam === 'boolean' ? gelirHam : tutar > 0,
    tutar: Math.abs(tutar), kdv, net: Math.abs(netHam ?? Math.abs(tutar) - kdv),
    siparisNo: metin(alan(h, 'orderNumber'), 60), paketNo: metin(alan(h, 'packageNumber'), 60), sku: metin(alan(h, 'sku'), 80),
    urun: metin(alan(h, 'productName')), adet: sayi(alan(h, 'quantity')),
    fatura: metin(alan(h, 'invoiceNumber'), 80), siparisTarihi: tarih(alan(h, 'orderDate')), faturaTarihi: tarih(alan(h, 'invoiceDate')),
    vade: tarih(alan(h, 'dueDate')), odeme: tarih(alan(h, 'paymentDate')), aciklama: metin(alan(h, 'invoiceExplanation'), 500),
  };
  const sonuc = hbKayitSema.safeParse(kayit);
  return sonuc.success ? sonuc.data : undefined;
}

const kalemler = (v: unknown, isaret: 1 | -1) => {
  const dizi = alan(nesne(v), 'items');
  return Array.isArray(dizi) ? dizi.flatMap((x) => {
    const tur = metin(alan(nesne(x), 'transactionType'), 80);
    const tutar = para(alan(nesne(x), 'amount'));
    return tur && tutar !== undefined ? [{ tur, tutar: isaret * Math.abs(tutar) }] : [];
  }) : [];
};
export function hbPerformansOku(h: Ham): HbPerformans | undefined {
  const siparisNo = metin(alan(h, 'orderNumber'), 60);
  const sku = metin(alan(h, 'sku'), 80) ?? '';
  const hakedis = para(alan(h, 'allowanceAmount'));
  if (!siparisNo || hakedis === undefined) return undefined;
  const gelirKalem = kalemler(alan(h, 'income'), 1);
  const giderKalem = kalemler(alan(h, 'expense'), -1);
  const kayit = {
    // Aynı SKU'lu iki satır birbirinin üstüne yazılmasın: varsa satır kimliği de anahtara girer (denetim AUD-024)
    anahtar: [siparisNo, sku, metin(alan(h, 'lineItemId'), 60) ?? metin(alan(h, 'orderLineId'), 60)].filter(Boolean).join('|').slice(0, 160), siparisNo, sku, urun: metin(alan(h, 'productName')), adet: sayi(alan(h, 'quantity')),
    birim: (() => { const b = para(alan(h, 'unitAmount')); return b === undefined ? undefined : Math.abs(b); })(),
    hakedis,
    gelir: Math.abs(para(alan(nesne(alan(h, 'income')), 'totalAmount')) ?? gelirKalem.reduce((t, k) => t + k.tutar, 0)),
    gider: Math.abs(para(alan(nesne(alan(h, 'expense')), 'totalAmount')) ?? giderKalem.reduce((t, k) => t - k.tutar, 0)),
    siparisTarihi: tarih(alan(h, 'orderDate')), vade: tarih(alan(h, 'dueDate')),
    kalemler: [...gelirKalem, ...giderKalem].slice(0, 60),
  };
  const sonuc = hbPerformansSema.safeParse(kayit);
  return sonuc.success ? sonuc.data : undefined;
}

export const odendi = (x: HbKayit) => x.durum.toLowerCase() === 'paid';

/** Kayıtların grup toplamları, ödenen/ödenecek ayrımı ve yaklaşan ödeme günleri. */
export function hbOzet(kayitlar: HbKayit[]) {
  const gruplar = Object.fromEntries(Object.keys(HB_GRUPLAR).map((g) => [g, 0])) as Record<HbGrup, number>;
  let odenen = 0, odenecek = 0;
  const vadeler = new Map<string, number>();
  for (const x of kayitlar) {
    const grup = hbGrubu(x.tur);
    gruplar[grup] += grup === 'aktarim' ? x.tutar : hbIsaretli(x);
    if (grup === 'aktarim') continue;
    if (odendi(x)) odenen += hbIsaretli(x);
    else {
      odenecek += hbIsaretli(x);
      const gun = x.vade?.slice(0, 10) ?? 'vadesiz';
      vadeler.set(gun, (vadeler.get(gun) ?? 0) + hbIsaretli(x));
    }
  }
  const hakedis = kayitlar.reduce((t, x) => t + hbIsaretli(x), 0);
  return { gruplar, hakedis, odenen, odenecek, vadeler: [...vadeler].sort(([a], [b]) => a.localeCompare(b)) };
}

/** Sipariş bazında: muhasebe kayıtlarının toplamı ile Hepsiburada'nın performans servisindeki hakediş karşılaştırması. */
export function hbSiparisMutabakati(kayitlar: HbKayit[], performans: HbPerformans[]) {
  const siparisler = new Map<string, { siparisNo: string; urun: string; tarih?: string; vade?: string; satis: number; kesinti: number; kayitToplami: number; hakedis?: number; odendi: boolean; kayitSayisi: number }>();
  const al = (no: string) => {
    let s = siparisler.get(no);
    if (!s) siparisler.set(no, s = { siparisNo: no, urun: '', satis: 0, kesinti: 0, kayitToplami: 0, odendi: true, kayitSayisi: 0 });
    return s;
  };
  for (const x of kayitlar) {
    if (!x.siparisNo || hbGrubu(x.tur) === 'aktarim') continue;
    const s = al(x.siparisNo);
    const deger = hbIsaretli(x);
    if (hbGrubu(x.tur) === 'satis') s.satis += deger; else s.kesinti += deger;
    s.kayitToplami += deger;
    s.kayitSayisi++;
    s.urun ||= x.urun ?? '';
    s.tarih ??= x.siparisTarihi;
    s.vade ??= x.vade;
    if (!odendi(x)) s.odendi = false;
  }
  for (const p of performans) {
    const s = al(p.siparisNo);
    s.hakedis = (s.hakedis ?? 0) + p.hakedis;
    s.urun ||= p.urun ?? '';
    s.tarih ??= p.siparisTarihi;
    s.vade ??= p.vade;
    if (!s.kayitSayisi) s.odendi = false;
  }
  return [...siparisler.values()].map((s) => ({ ...s, fark: s.hakedis === undefined ? undefined : s.kayitToplami - s.hakedis }))
    .sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
}

/**
 * Hesap makinesinin "gerçek ortalama" önerileri: KDV hariç işlem ve hizmet bedeli (sipariş başına)
 * ile komisyonun satışa oranı. En az 3 siparişlik veri yoksa undefined.
 */
export function hbGercekOrtalamalar(kayitlar: HbKayit[]) {
  const siparis = new Map<string, { satis: number; komisyon: number; islem: number; hizmet: number }>();
  for (const x of kayitlar) {
    if (!x.siparisNo) continue;
    const g = hbGrubu(x.tur);
    if (!['satis', 'komisyon', 'islem', 'hizmet'].includes(g)) continue;
    const s = siparis.get(x.siparisNo) ?? { satis: 0, komisyon: 0, islem: 0, hizmet: 0 };
    const isaret = x.gelir ? -1 : 1; // gider pozitif, iade/düzeltme negatif
    if (g === 'satis') s.satis += x.gelir ? x.tutar : -x.tutar;
    else s[g as 'komisyon' | 'islem' | 'hizmet'] += isaret * x.net;
    siparis.set(x.siparisNo, s);
  }
  const tam = [...siparis.values()].filter((s) => s.satis > 0 && s.komisyon > 0);
  if (tam.length < 3) return undefined;
  const ort = (f: (s: (typeof tam)[number]) => number) => Math.round(tam.reduce((t, s) => t + f(s), 0) / tam.length);
  const satisToplam = tam.reduce((t, s) => t + s.satis, 0);
  return {
    siparis: tam.length,
    islem: ort((s) => s.islem),
    hizmet: ort((s) => s.hizmet),
    komisyonBp: Math.round(tam.reduce((t, s) => t + s.komisyon, 0) * 10_000 / satisToplam),
  };
}
