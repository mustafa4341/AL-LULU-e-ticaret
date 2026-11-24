/**
 * Kartla taksitli ödeme açık mı? PayTR isteğinde taksit bu değere göre açılır/kapanır (lib/paytr.ts no_installment).
 * Kapalıyken sitede "peşin fiyatına taksit" rozeti ve içinde "taksit" geçen SSS gösterilmez (denetim AUD-017).
 * Açmadan önce: PayTR mağaza panelinde taksit seçenekleri + lib/depo.ts paytrSonuclandir'deki tutar kontrolü
 * (vade farkında total_amount > payment_amount gelir; bu artık kabul ediliyor) gözden geçirilmeli.
 */
export const TAKSIT_ACIK = false;
