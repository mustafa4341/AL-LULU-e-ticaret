import type { Urun } from './sema';

const ERATEC_500: Readonly<Record<string, string>> = {
  'eratec-cam-kavanoz-2-parcali-kapak-500-ml': '500 ml Eratec cam kavanoz, küçük porsiyonları ve kuru gıdaları saklamak için uygundur. Kapak, iç disk ve vidalı dış halkadan oluşur.',
  'eratec-cam-kavanoz-2-parcali-kapak-500-ml-x-4': 'Sette her biri 500 ml olan dört Eratec cam kavanoz bulunur. İki parçalı kapaklı kavanozlar, kuru gıdaları ve küçük porsiyonları ayrı ayrı saklamaya uygundur.',
};

const KATALOG_OZETLERI: Readonly<Record<string, { eskiMetin: string; ozet: string }>> = {
  'tefal-5-saniye-dograyici': {
    eskiMetin: 'Patentli bağımsız paslanmaz çelik ikili bıçak sistemiyle',
    ozet: 'Tefal 5 Second Chopper K1330404, 500 ml hazneli ipli manuel rondodur. İki paslanmaz çelik bıçakla soğan, sebze ve taze otları doğrar.',
  },
  'tefal-duetto-plus-tava-24': {
    eskiMetin: 'Parlak paslanmaz çelik gövdeyi Titanium 2X',
    ozet: 'Tefal Duetto+ G7320434 24 cm tava. Paslanmaz çelik gövde, Titanium 2X yapışmaz iç kaplama ve Thermo-Signal sıcaklık göstergesi.',
  },
  'tefal-ingenio-essential-4-parca': {
    eskiMetin: '18 cm sos tenceresi, 24 cm tava, 26 cm tava',
    ozet: 'Tefal Ingenio Essential L2006502 setinde iki tava, bir sos tenceresi ve çıkarılabilir sap bulunur. Ocak uyumunu ve kutu içeriğini inceleyin.',
  },
  'fissler-copenhagen-tencere-seti': {
    eskiMetin: 'Isıya dayanıklı cam kapaklı, 18/10 paslanmaz çelik Fissler Copenhagen',
    ozet: '4 paslanmaz çelik tencere ve 4 cam kapaklı Fissler Copenhagen seti. 18/10 çelik, iç ölçü skalası ve indüksiyon dahil ocak uyumu.',
  },
  'zwilling-king-30-parca-catal-kasik': {
    eskiMetin: '6 kişilik, 30 parça Zwilling King çatal kaşık bıçak takımı.',
    ozet: 'Zwilling King 1026441 parlak 30 parça takım. 6 kişilik 18/10 paslanmaz çelik çatal, kaşık ve bıçak setinin parça dağılımını görün.',
  },
  'tefal-hard-titanium-essential-tava-24': {
    eskiMetin: 'Fransa üretimi, Titanium 2X takviyeli ekstra dayanıklı',
    ozet: '24 cm Tefal Hard Titanium Essential tava. Titanium 2X yapışmaz kaplama, Thermo-Signal ısı göstergesi ve difüzyon tabanı.',
  },
};

/** Eski katalog metinlerini vitrinde düzeltir. Panelden sonradan düzenlenen özet önceliklidir. */
export function urunSatisOzeti(urun: Pick<Urun, 'id' | 'ozet' | 'teknik'>): string {
  const eratec = ERATEC_500[urun.id];
  if (eratec && /\b1\s+litre\b/iu.test(urun.ozet)
    && urun.teknik.some(([ad, deger]) => ad === 'Hacim' && deger === '500 ml')) return eratec;

  if (urun.id === 'fissler-family-line-tencere-seti' && urun.ozet.includes('oluşan 5 parça')) {
    return 'Fissler Family Line 18/10 paslanmaz çelik set, 4 kapaklı tencere ve 1 kapaksız sos tenceresi içerir. Kapaklar dahil toplam 9 parçadır.';
  }
  const guncelleme = KATALOG_OZETLERI[urun.id];
  if (guncelleme && urun.ozet.startsWith(guncelleme.eskiMetin)) return guncelleme.ozet;
  return urun.ozet.trim();
}
