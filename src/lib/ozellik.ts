/**
 * Öne çıkan özellik listesi: her madde kendi renginde ikonla gösterilir (sönük gri kutular yerine).
 * Renk ikondan gelir; ikon seçilmemiş metinler (ana sayfa maddeleri) için metinden tahmin edilir.
 */
import type { IkonAdi } from './sema';

const RENKLER: Partial<Record<IkonAdi, string>> = {
  saat: 'mavi', trend: 'mavi',
  ates: 'turuncu',
  gosterge: 'mor',
  konum: 'kehribar', yildiz: 'kehribar',
  kalkan: 'yesil', belge: 'yesil', kargo: 'yesil', tik: 'yesil', iade: 'yesil',
  tencere: 'turkuaz', duduklu: 'turkuaz', kase: 'turkuaz',
};

export const ozellikRengi = (ikon: IkonAdi): string => RENKLER[ikon] ?? 'altin';

export function metindenIkon(metin: string): IkonAdi {
  const m = metin.toLocaleLowerCase('tr');
  if (/%|hızlı|kısa|dakika|süre/.test(m)) return 'saat';
  if (/ocak|indüksiyon/.test(m)) return 'ates';
  if (/kademe|basınç/.test(m)) return 'gosterge';
  if (/garanti|orijinal|güven/.test(m)) return 'kalkan';
  if (/almanya|çelik|üretim/.test(m)) return 'konum';
  if (/kargo|teslim/.test(m)) return 'kargo';
  return 'tik';
}
