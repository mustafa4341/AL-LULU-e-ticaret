import type { Urun } from './sema';

const ERATEC_500: Readonly<Record<string, string>> = {
  'eratec-cam-kavanoz-2-parcali-kapak-500-ml': '500 ml Eratec cam kavanoz, küçük porsiyonları ve kuru gıdaları saklamak için uygundur. Kapak, iç disk ve vidalı dış halkadan oluşur.',
  'eratec-cam-kavanoz-2-parcali-kapak-500-ml-x-4': 'Sette her biri 500 ml olan dört Eratec cam kavanoz bulunur. İki parçalı kapaklı kavanozlar, kuru gıdaları ve küçük porsiyonları ayrı ayrı saklamaya uygundur.',
};

/** Eski katalog metinlerini vitrinde düzeltir. Panelden sonradan düzenlenen özet önceliklidir. */
export function urunSatisOzeti(urun: Pick<Urun, 'id' | 'ozet' | 'teknik'>): string {
  const eratec = ERATEC_500[urun.id];
  if (eratec && /\b1\s+litre\b/iu.test(urun.ozet)
    && urun.teknik.some(([ad, deger]) => ad === 'Hacim' && deger === '500 ml')) return eratec;

  if (urun.id === 'fissler-family-line-tencere-seti' && urun.ozet.includes('oluşan 5 parça')) {
    return 'Fissler Family Line 18/10 paslanmaz çelik set, 4 kapaklı tencere ve 1 kapaksız sos tenceresi içerir. Kapaklar dahil toplam 9 parçadır.';
  }
  if (urun.id === 'tefal-5-saniye-dograyici' && urun.ozet.startsWith('Patentli bağımsız paslanmaz çelik ikili bıçak sistemiyle')) {
    return 'Tefal 5 Second Chopper K1330404, 500 ml hazneli ipli manuel rondodur. İki paslanmaz çelik bıçakla soğan, sebze ve taze otları doğrar.';
  }
  return urun.ozet.trim();
}
