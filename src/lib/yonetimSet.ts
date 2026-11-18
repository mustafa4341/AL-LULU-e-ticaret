import { evet, istegeBagli, liste, metin, sayi } from './form';
import { DurumSema, type UrunSeti } from './sema';

export const BOS_SET: UrunSeti = {
  id: 'yeni', durum: 'taslak', ad: '', aciklama: '',
  kalemler: [{ urunId: '', adet: 1 }, { urunId: '', adet: 1 }],
  fiyatlama: { tip: 'yuzde', oran: 10 }, oneCikan: false,
};

export function setFormu(f: FormData, temel: UrunSeti, gorsel?: string): UrunSeti {
  const adetler = liste(f, 'kalem_adet');
  const kalemler = liste(f, 'kalem_urun').map((urunId, i) => ({ urunId, adet: Number(adetler[i]) || 1 })).filter((x) => x.urunId);
  const deger = sayi(f, 'deger');
  const tip = metin(f, 'fiyat_tip');
  const d = DurumSema.safeParse(metin(f, 'durum'));
  const ad = metin(f, 'ad');
  return {
    ...temel, ad, durum: d.success ? d.data : 'taslak', aciklama: metin(f, 'aciklama'), kalemler,
    fiyatlama: tip === 'sabit' ? { tip, fiyat: deger }
      : tip === 'kalem' ? { tip, urunId: metin(f, 'kalem_hedef') || kalemler.at(-1)?.urunId || '', oran: deger }
      : { tip: 'yuzde', oran: deger },
    rozet: istegeBagli(f, 'rozet'), oneCikan: evet(f, 'oneCikan'),
    gorsel: gorsel ? { src: gorsel, alt: ad } : evet(f, 'gorsel_kaldir') ? undefined : temel.gorsel,
  };
}
