import { magazaOku, siparisleriOku } from './depo';
import { Katalog } from './katalog';
import { iadeEdildi } from './siparisAkisi';
import { onayliSatis } from './yonetimRapor';
import { finansOku } from './finansDepo';
import { belgeGecerli, finansPara, hakEdis } from './finans';
import { YEDEK_ARALIGI_GUN, sonYedekTarihi } from './yedek';
import { tumYorumlar } from './yorum';
import { KANALLAR, KANAL_LISTESI, bosAyarlar, kritikEsik, type Kanal } from './pazaryeri';
import { envanterAyarlariOku, pazaryeriSiparisleriOku } from './pazaryeriDepo';
import { pazaryeriApiDurumu } from './pazaryeriApi';
import { pazaryeriDurumu } from '../components/yonetim/pazaryeriGorunumu';
import { faturaAdaylari } from './faturaMerkezi';

export async function panelIsleriniOku() {
  const [m, tum, finans, sonYedek, yorumlar, pazar, envanter] = await Promise.all([
    magazaOku(), siparisleriOku(), finansOku(), sonYedekTarihi().catch(() => undefined), tumYorumlar().catch(() => []),
    pazaryeriSiparisleriOku().catch(() => []), envanterAyarlariOku().catch(() => bosAyarlar()),
  ]);
  const bekleyenYorum = yorumlar.filter((y) => y.durum === 'bekliyor').length;
  const yedekGun = sonYedek ? Math.floor((Date.now() - Date.parse(sonYedek)) / 86_400_000) : undefined;
  const yedekGerekli = yedekGun === undefined || yedekGun >= YEDEK_ARALIGI_GUN;
  const siparisler = tum.filter((s) => !s.paytr?.test).sort((a, b) => Date.parse(b.tarih) - Date.parse(a.tarih));
  const hazirlanacak = siparisler.filter((s) => s.durum === 'odendi' && !s.paytr?.stokEksik);
  const kargolanacak = siparisler.filter((s) => s.durum === 'hazirlaniyor');
  const belgesiz = siparisler.filter((s) => onayliSatis(s) && !finans.belgeler.some((b) => b.siparisNo === s.no && belgeGecerli(b)));
  const faturaListesi = faturaAdaylari(finans, siparisler, pazar, envanter);
  const faturasiz = faturaListesi.filter((x) => !x.fatura);
  const faturaIletilmedi = faturaListesi.filter((x) => x.fatura && ['bekliyor', 'hata'].includes(x.fatura.iletim.durum));
  const odemeKontrol = siparisler.filter((s) => s.durum === 'odeme-bekliyor' && !s.paytr);
  const stokUyusmazligi = siparisler.filter((s) => s.paytr?.stokEksik && s.durum !== 'iptal' && !iadeEdildi(s));
  const iptalKargo = siparisler.filter((s) => s.durum === 'iptal' && s.kargoTakip);
  const belgeHatasi = finans.belgeler.filter((b) => b.durum === 'hata');
  const trendyolBekleyen = finans.trendyol.filter((x) => x.banka === undefined);
  const tukenen = m.urunler.filter((u) => u.durum === 'yayinda' && u.stok === 0);
  const kritikStok = m.urunler.filter((u) => u.durum === 'yayinda' && u.stok > 0 && u.stok <= kritikEsik(envanter, u.id));
  const simdi = Date.now();
  const urunIdleri = new Set(m.urunler.map((u) => u.id));
  const pazarDurum = pazar.map((s) => ({ s, d: pazaryeriDurumu(s, simdi, urunIdleri) }));
  const pazarHazirlanacak = (k: Kanal) => pazarDurum.filter(({ s, d }) => s.kanal === k && (d.hazirlanacak || d.hazirlaniyor)).length;
  const pazarKontrol = pazarDurum.filter(({ d }) => d.uyari.some((u) => u.renk === 'kirmizi')).length;
  const kanalHatasi = KANAL_LISTESI.filter((k) => envanter.kanallar[k].sonApiHata || envanter.kanallar[k].sonStokHata);
  const kanalGecikti = KANAL_LISTESI.filter((k) => {
    const a = envanter.kanallar[k];
    return pazaryeriApiDurumu(k) === 'canli' && a.stokBaslangic && !kanalHatasi.includes(k)
      && (!a.sonOtomatikApi || simdi - Date.parse(a.sonOtomatikApi) > 30 * 60_000);
  });
  const fotosuz = m.urunler.filter((u) => !u.gorseller.length && u.durum === 'yayinda');
  const k = new Katalog(m);
  const taslakSetler = m.setler.filter((s) => s.durum === 'taslak' && k.setEngelleri(s).length === 0);

  type Is = { ad: string; sayi: number | string; url: string; ton: 'turuncu' | 'kirmizi' | 'gri'; aciklama?: string };
  const isler: Is[] = ([
    { ad: 'Ödeme alındı, stok ayrılamadı', sayi: stokUyusmazligi.length, url: stokUyusmazligi.length === 1 ? '/yonetim/siparisler/' + stokUyusmazligi[0]!.no : '/yonetim/siparisler?durum=odendi', ton: 'kirmizi' },
    { ad: 'İptal edildi ama kargo takip numarası var', sayi: iptalKargo.length, url: iptalKargo.length === 1 ? '/yonetim/siparisler/' + iptalKargo[0]!.no : '/yonetim/siparisler?durum=iptal', ton: 'kirmizi' },
    { ad: 'Hazırlanacak web siparişleri', aciklama: 'Siparişi açıp hazırlamaya alın.', sayi: hazirlanacak.length, url: '/yonetim/siparisler?durum=odendi&kanal=web', ton: 'turuncu' },
    { ad: 'Kargoya verilecek web siparişleri', aciklama: 'Paketi teslim edin ve kargo takip numarasını kaydedin.', sayi: kargolanacak.length, url: '/yonetim/siparisler?durum=hazirlaniyor&kanal=web', ton: 'turuncu' },
    { ad: 'Belgesi hazırlanmamış siparişler', sayi: belgesiz.length, url: '/yonetim/siparisler?durum=belgesiz&kanal=web', ton: 'turuncu' },
    { ad: 'Faturası kesilecek siparişler', aciklama: 'GİB e-Arşiv Portalı’nda düzenlenen faturayı panelde kaydedin.', sayi: faturasiz.length, url: '/yonetim/finans/faturalar', ton: 'turuncu' },
    { ad: 'Hepsiburada’ya yüklenecek faturalar', sayi: faturaIletilmedi.filter((x) => x.kanal === 'hepsiburada' && x.fatura?.iletim.durum === 'bekliyor').length, url: '/yonetim/finans/faturalar?durum=kesildi&kanal=hepsiburada', ton: 'turuncu', aciklama: 'PDF’i satıcı paneline yükleyip panelde “Yükledim” olarak işaretleyin.' },
    { ad: 'Faturası müşteriye iletilmedi', sayi: faturaIletilmedi.length, url: '/yonetim/finans/faturalar?durum=kesildi', ton: 'turuncu' },
    { ad: 'Hata veren belgeler (yeniden dene)', sayi: belgeHatasi.length, url: '/yonetim/finans?sekme=belgeler', ton: 'kirmizi' },
    { ad: 'Ödemesi kontrol edilecek (havale/EFT)', sayi: odemeKontrol.length, url: '/yonetim/siparisler?durum=odeme-bekliyor&kanal=web', ton: 'turuncu' },
    { ad: 'Ödemesi beklenen Trendyol hakedişi', sayi: trendyolBekleyen.length ? finansPara(trendyolBekleyen.reduce((t, x) => t + hakEdis(x), 0)) : 0, url: '/yonetim/finans?sekme=trendyol', ton: 'gri' },
    ...kanalHatasi.map((k) => ({ ad: `${KANALLAR[k]} bağlantısında sorun var (ayrıntıyı görmek için dokunun)`, sayi: '!', url: '/yonetim/siparisler/kanallar#' + k, ton: 'kirmizi' as const })),
    { ad: 'Kontrol gereken pazaryeri siparişleri', aciklama: 'Siparişteki uyarıyı açarak stok, eşleşme veya kargo durumunu inceleyin.', sayi: pazarKontrol, url: '/yonetim/siparisler?durum=kontrol', ton: 'kirmizi' },
    ...KANAL_LISTESI.map((k) => ({ ad: `${KANALLAR[k]} siparişi hazırlanacak (kargo ${KANALLAR[k]} panelinden)`, sayi: pazarHazirlanacak(k), url: `/yonetim/siparisler?kanal=${k}&durum=islem`, ton: 'turuncu' as const })),
    ...kanalGecikti.map((k) => ({
      ad: envanter.kanallar[k].sonOtomatikApi ? `${KANALLAR[k]} otomatik eşitlemesi gecikiyor` : `${KANALLAR[k]} için ilk otomatik çekim bekleniyor`,
      sayi: '!', url: '/yonetim/siparisler/kanallar#' + k, ton: 'turuncu' as const,
    })),
    { ad: 'Onay bekleyen müşteri değerlendirmesi', sayi: bekleyenYorum, url: '/yonetim/yorumlar', ton: 'turuncu' },
    { ad: 'Tükenen ürün (sitede “stokta yok” görünüyor)', sayi: tukenen.length, url: '/yonetim/urunler?filtre=kritik', ton: 'kirmizi' },
    { ad: `Azalan stok (${envanter.kritikVarsayilan} adet ve altı)`, sayi: kritikStok.length, url: '/yonetim/urunler?filtre=kritik', ton: 'turuncu' },
    { ad: 'Yayındaki üründe fotoğraf eksik', sayi: fotosuz.length, url: fotosuz.length === 1 ? '/yonetim/urunler/' + fotosuz[0]!.id + '?bolum=fotograf' : '/yonetim/urunler', ton: 'gri' },
    { ad: 'Yayına hazır taslak set', sayi: taslakSetler.length, url: '/yonetim/setler', ton: 'gri' },
    { ad: yedekGun === undefined ? 'Veri yedeği hiç alınmadı (indir)' : `Aylık veri yedeği zamanı (son: ${yedekGun} gün önce)`, sayi: yedekGerekli ? '!' : 0, url: '/yonetim/yedek', ton: 'turuncu' },
  ] satisfies Is[]).filter((x) => x.sayi !== 0);
  const oncelik = { kirmizi: 0, turuncu: 1, gri: 2 };
  isler.sort((a, b) => oncelik[a.ton] - oncelik[b.ton]);
  return { siparisler, finans, pazar, envanter, yedekGun, hazirlanacak, kargolanacak, faturasiz, kanalHatasi, kanalGecikti, tukenen, kritikStok, isler, pazarHazirlanacak };
}
