/**
 * Yan menü rozetleri:
 * - "Siparişler": hazırlanacak / kargolanacak web ve pazaryeri siparişleri
 * - "Ürünler ve Stok": yayındaki ürünlerden tükenen veya uyarı eşiğine inenler (İş Merkezi'ndeki stok uyarısıyla aynı kural)
 * Ara katman bu okumayı sayfa verisiyle aynı anda başlatır; menü çizilirken sonuç hazır olur.
 * Hata vermez (okunamazsa 0).
 */
import { magazaOku, siparisleriOku } from './depo';
import { envanterAyarlariOku, pazaryeriBekleyenSayisi } from './pazaryeriDepo';
import { rutinStokUyarisiVarMi } from './pazaryeri';
import { gonderilecek } from './yonetimRapor';

export interface PanelRozeti { web: number; pazar: number; stok: number }

export async function panelRozetiOku(): Promise<PanelRozeti> {
  const [web, pazar, stok] = await Promise.all([
    siparisleriOku().then((l) => l.filter((x) => !x.paytr?.test && gonderilecek(x)).length).catch(() => 0),
    pazaryeriBekleyenSayisi().catch(() => 0),
    Promise.all([magazaOku(), envanterAyarlariOku()])
      .then(([m, envanter]) => m.urunler.filter((u) => rutinStokUyarisiVarMi(u, envanter)).length)
      .catch(() => 0),
  ]);
  return { web, pazar, stok };
}
