import type { Siparis } from './sema';
import { iadeEdildi } from './siparisAkisi';

export const YAYIN_ADLARI = { yayinda: 'Yayında', taslak: 'Taslak', gizli: 'Gizli' } as const;
export const yTarih = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul' });
export const yGun = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeZone: 'Europe/Istanbul' });
export const gonderilecek = (s: Siparis) => s.durum === 'odendi' || s.durum === 'hazirlaniyor';
export const onayliSatis = (s: Siparis) =>
  !s.paytr?.test && !iadeEdildi(s) && s.durum !== 'iptal' && s.durum !== 'odeme-bekliyor' && (!s.paytr || s.paytr.sonuc === 'odendi');

export function odemeEtiketi(s: Siparis): string {
  if (s.paytr) {
    if (s.paytr.sonuc === 'odendi') return 'PayTR onaylı';
    if (s.paytr.sonuc === 'basarisiz') return 'Başarısız';
    return 'PayTR bekleniyor';
  }
  if (s.durum === 'iptal') return 'İptal';
  return s.durum === 'odeme-bekliyor' ? 'Onay bekliyor' : 'Manuel onaylı';
}
