/**
 * Yan menüde "Siparişler" yanındaki sayı: hazırlanacak / kargolanacak web ve pazaryeri siparişleri.
 * Ara katman bu okumayı sayfa verisiyle aynı anda başlatır; menü çizilirken sonuç hazır olur.
 * Hata vermez (okunamazsa 0).
 */
import { siparisleriOku } from './depo';
import { pazaryeriBekleyenSayisi } from './pazaryeriDepo';
import { gonderilecek } from './yonetimRapor';

export interface PanelRozeti { web: number; pazar: number }

export async function panelRozetiOku(): Promise<PanelRozeti> {
  const [web, pazar] = await Promise.all([
    siparisleriOku().then((l) => l.filter((x) => !x.paytr?.test && gonderilecek(x)).length).catch(() => 0),
    pazaryeriBekleyenSayisi().catch(() => 0),
  ]);
  return { web, pazar };
}
