import type { Siparis, SiparisDurumu } from './sema';

export const IADE_ISLEMI = 'iade-tamamlandi';
export const iadeEdildi = (s: Siparis) => s.gecmis.some((g) => g.islem === IADE_ISLEMI);
export const gonderildi = (s: Siparis) => s.durum === 'kargoda' || s.durum === 'teslim-edildi';

export function siradakiDurum(s: Siparis): Exclude<SiparisDurumu, 'iptal' | 'odeme-bekliyor'> | undefined {
  if (iadeEdildi(s) || (s.paytr && (s.paytr.test || s.paytr.sonuc !== 'odendi' || s.paytr.stokEksik))) return;
  switch (s.durum) {
    case 'odeme-bekliyor': return 'odendi';
    case 'odendi': return 'hazirlaniyor';
    case 'hazirlaniyor': return 'kargoda';
    case 'kargoda': return 'teslim-edildi';
  }
}

export function iptalEdilebilir(s: Siparis): boolean {
  return !gonderildi(s) && s.durum !== 'iptal' &&
    (!s.paytr || (!s.paytr.test && s.paytr.sonuc === 'odendi'));
}
