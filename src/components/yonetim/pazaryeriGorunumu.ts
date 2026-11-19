import { STOK_AKTIF, iadeBekliyor, type PazaryeriSiparisi } from '../../lib/pazaryeri';

export function pazaryeriDurumu(s: PazaryeriSiparisi, simdi: number, urunler: ReadonlySet<string>) {
  // Bir paketin bir kısmı gönderilmiş olsa da hazırlık bekleyen kalemler olabilir.
  const hazirlanacak = s.kalemler.some((k) => k.durum === 'yeni');
  const hazirlaniyor = s.kalemler.some((k) => k.durum === 'hazirlaniyor');
  const sonKargo = hazirlanacak || hazirlaniyor ? Date.parse(s.sonKargoTarihi ?? '') : NaN;
  const uyari: { yazi: string; renk: 'kirmizi' | 'turuncu' }[] = [];
  if (sonKargo <= simdi) uyari.push({ yazi: 'Kargo süresi geçti', renk: 'kirmizi' });
  else if (sonKargo <= simdi + 86_400_000) uyari.push({ yazi: 'Kargoya 24 saatten az kaldı', renk: 'turuncu' });

  if (!s.stokDisi) {
    const stokAktif = s.kalemler.filter((k) => STOK_AKTIF.has(k.durum));
    const eksik = stokAktif.reduce((adet, k) => adet + k.eksik, 0);
    if (eksik) uyari.push({ yazi: `${eksik} adet stok eksik`, renk: 'kirmizi' });
    if (stokAktif.some((k) => !k.urunId || !urunler.has(k.urunId))) uyari.push({ yazi: 'Ürün eşleşmesini kontrol edin', renk: 'kirmizi' });
    if (iadeBekliyor(s)) uyari.push({ yazi: 'İade kontrolü bekliyor', renk: 'turuncu' });
  }
  if (s.kalemler.some((k) => k.durum === 'bilinmiyor')) uyari.push({ yazi: 'Kanal durumu tanınmadı', renk: 'turuncu' });
  return { hazirlanacak, hazirlaniyor, sonKargo, uyari };
}
