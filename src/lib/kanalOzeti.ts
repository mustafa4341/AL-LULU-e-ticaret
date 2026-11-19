/**
 * Satış kanalı özetleri: Web sitesi, Trendyol ve Hepsiburada ayrı ayrı ve birlikte.
 * Tutarlar kuruş cinsindendir (pazaryeri fiyatları kuruşlu olabilir). İptal, iade ve ödemesi
 * henüz onaylanmamış siparişler sayılmaz. Gün, sipariş tarihinin Türkiye saatine göre günüdür.
 */
import type { Siparis } from './sema';
import { finansGunu } from './finans';
import { onayliSatis } from './yonetimRapor';
import { KANALLAR, satisMi, satisTutari, type Kanal, type PazaryeriSiparisi } from './pazaryeri';

export type SatisKanali = 'web' | Kanal;
export const SATIS_KANALLARI: SatisKanali[] = ['web', 'trendyol', 'hepsiburada'];
export const KANAL_ADLARI: Record<SatisKanali, string> = { web: 'Web sitesi', ...KANALLAR };

export interface KanalToplami { kanal: SatisKanali; ad: string; adet: number; kurus: number }
export interface KanalOzeti { kanallar: KanalToplami[]; toplam: { adet: number; kurus: number } }

export function kanalToplamlari(web: Siparis[], pazaryeri: PazaryeriSiparisi[], bas: string, son: string): KanalOzeti {
  const tablo = Object.fromEntries(SATIS_KANALLARI.map((k) => [k, { kanal: k, ad: KANAL_ADLARI[k], adet: 0, kurus: 0 }])) as Record<SatisKanali, KanalToplami>;
  const aralikta = (tarih: string) => { const gun = finansGunu(new Date(tarih)); return gun >= bas && gun <= son; };
  for (const s of web) {
    if (s.paytr?.test || !onayliSatis(s) || !aralikta(s.tarih)) continue;
    tablo.web.adet++;
    tablo.web.kurus += s.toplam * 100;
  }
  for (const s of pazaryeri) {
    if (!satisMi(s) || !aralikta(s.tarih)) continue;
    tablo[s.kanal].adet++;
    tablo[s.kanal].kurus += satisTutari(s);
  }
  const kanallar = SATIS_KANALLARI.map((k) => tablo[k]);
  return { kanallar, toplam: { adet: kanallar.reduce((t, k) => t + k.adet, 0), kurus: kanallar.reduce((t, k) => t + k.kurus, 0) } };
}
