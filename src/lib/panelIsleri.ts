import { magazaOku, siparisleriOku } from './depo';
import { Katalog } from './katalog';
import { iadeEdildi } from './siparisAkisi';
import { onayliSatis } from './yonetimRapor';
import { finansOku } from './finansDepo';
import { belgeGecerli, finansPara, hakEdis } from './finans';
import { YEDEK_ARALIGI_GUN, sonYedekTarihi } from './yedek';
import { tumYorumlar } from './yorum';
import { KANALLAR, KANAL_LISTESI, bosAyarlar, pazaryerindeYanlisStokKanallari, rutinStokUyarisiVarMi, type Kanal } from './pazaryeri';
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
  const negatifVeyaYanlisStok = m.urunler.filter((u) => u.stok < 0 || pazaryerindeYanlisStokKanallari(u, envanter).length > 0);
  const tukenen = m.urunler.filter((u) => u.durum === 'yayinda' && u.stok === 0 && !envanter.bilerekStoktaYok[u.id]);
  const bilerekSifirSayisi = m.urunler.filter((u) => u.durum === 'yayinda' && u.stok === 0 && envanter.bilerekStoktaYok[u.id] && pazaryerindeYanlisStokKanallari(u, envanter).length === 0).length;
  const kritikStok = m.urunler.filter((u) => u.durum === 'yayinda' && u.stok > 0 && rutinStokUyarisiVarMi(u, envanter));
  const simdi = Date.now();
  const urunIdleri = new Set(m.urunler.map((u) => u.id));
  const canliPazar = pazar.filter((s) => !s.stokDisi && pazaryeriApiDurumu(s.kanal) !== 'test');
  const pazarDurum = canliPazar.map((s) => ({ s, d: pazaryeriDurumu(s, simdi, urunIdleri) }));
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

  type Is = { ad: string; sayi: number | string; url: string; ton: 'turuncu' | 'kirmizi' | 'gri'; aciklama?: string; eylem?: string; kanal?: 'web' | 'trendyol' | 'hepsiburada' };
  const isler: Is[] = ([
    { ad: 'Ödeme alındı, stok ayrılamadı', aciklama: 'Siparişi açıp stoğu ayırın veya geri ödemeyi doğrulayıp iptal edin.', eylem: 'Stoğu Ayır', kanal: 'web', sayi: stokUyusmazligi.length, url: stokUyusmazligi.length === 1 ? '/yonetim/siparisler?durum=kontrol&sec=' + encodeURIComponent('web:' + stokUyusmazligi[0]!.no) : '/yonetim/siparisler?durum=kontrol&kanal=web', ton: 'kirmizi' },
    { ad: 'Negatif stok veya pazaryerinde yanlış stok adedi', aciklama: 'Depoda 0/eksi olan ürün pazaryerinde hâlâ stoklu görünüyor; aşırı satışı önlemek için hemen eşitleyin.', eylem: 'Hemen Eşitle', sayi: negatifVeyaYanlisStok.length, url: '/yonetim/fiyatlar', ton: 'kirmizi' },
    { ad: 'İptal edildi ama kargo takip numarası var', aciklama: 'Gönderiyi kargo firmasından durdurup siparişi kontrol edin.', eylem: 'Siparişi Kontrol Et', kanal: 'web', sayi: iptalKargo.length, url: iptalKargo.length === 1 ? '/yonetim/siparisler?durum=iptal&sec=' + encodeURIComponent('web:' + iptalKargo[0]!.no) : '/yonetim/siparisler?durum=iptal', ton: 'kirmizi' },
    { ad: 'Hazırlanacak web siparişleri', aciklama: 'Sipariş çalışma panelinden tek tıkla hazırlamaya alın.', eylem: 'Siparişleri Hazırla', kanal: 'web', sayi: hazirlanacak.length, url: '/yonetim/siparisler?durum=hazirlanacak&kanal=web', ton: 'turuncu' },
    { ad: 'Kargoya verilecek web siparişleri', aciklama: 'Paketi teslim edin ve kargo takip numarasını kaydedin.', eylem: 'Kargoya Ver', kanal: 'web', sayi: kargolanacak.length, url: '/yonetim/siparisler?durum=hazirlaniyor&kanal=web', ton: 'turuncu' },
    { ad: 'Faturası kesilecek siparişler (1/3)', aciklama: 'GİB e-Arşiv faturasını sipariş çalışma panelinden veya Fatura Merkezi’nden kaydedin.', eylem: 'Faturaları Kes', sayi: faturasiz.length, url: '/yonetim/siparisler?durum=faturasiz', ton: 'turuncu' },
    { ad: 'Hepsiburada’ya yüklenecek faturalar (2/3)', sayi: faturaIletilmedi.filter((x) => x.kanal === 'hepsiburada' && x.fatura?.iletim.durum === 'bekliyor').length, url: '/yonetim/siparisler?durum=faturasiz&kanal=hepsiburada', ton: 'turuncu', aciklama: 'PDF’i satıcı paneline yükleyip sipariş panelinde “3/3 Tamamla” işaretleyin.', eylem: 'Faturaları Yükle', kanal: 'hepsiburada' },
    { ad: 'Faturası müşteriye / kanala iletilmedi (2/3)', aciklama: 'Kaydedilen ancak iletimi tamamlanmayan veya hata veren faturalar.', eylem: 'İletimi Tamamla', sayi: faturaIletilmedi.length, url: '/yonetim/siparisler?durum=faturasiz', ton: faturaIletilmedi.some((x) => x.fatura?.iletim.durum === 'hata') ? 'kirmizi' : 'turuncu' },
    { ad: 'İç sipariş belgesi hazırlanmamış web siparişleri', aciklama: 'İsteğe bağlı koli içi fiş veya sipariş özeti oluşturun.', eylem: 'Siparişleri Gör', kanal: 'web', sayi: belgesiz.length, url: '/yonetim/siparisler?durum=islem&kanal=web', ton: 'gri' },
    { ad: 'Hata veren belgeler (yeniden dene)', aciklama: 'Belge oluşturma hatasını kontrol edin.', eylem: 'Belgeleri Aç', sayi: belgeHatasi.length, url: '/yonetim/finans?sekme=belgeler', ton: 'kirmizi' },
    { ad: 'Ödemesi kontrol edilecek (havale/EFT)', aciklama: 'Banka hesabını kontrol edip ödemeyi onaylayın.', eylem: 'Ödemeyi Onayla', kanal: 'web', sayi: odemeKontrol.length, url: '/yonetim/siparisler?durum=odeme-bekleyen&kanal=web', ton: 'turuncu' },
    { ad: 'Ödemesi beklenen Trendyol hakedişi', aciklama: 'Vadesi gelen Trendyol hakediş kayıtlarını inceleyin.', eylem: 'Hakedişleri Aç', kanal: 'trendyol', sayi: trendyolBekleyen.length ? finansPara(trendyolBekleyen.reduce((t, x) => t + hakEdis(x), 0)) : 0, url: '/yonetim/finans?sekme=trendyol', ton: 'gri' },
    ...kanalHatasi.map((k) => ({ ad: `${KANALLAR[k]} bağlantısında / stok eşitlemesinde sorun var`, aciklama: envanter.kanallar[k].sonApiHata || envanter.kanallar[k].sonStokHata, eylem: 'Tanıla ve Onar', kanal: k, sayi: '!', url: '/yonetim/servis-kontrol#' + k, ton: 'kirmizi' as const })),
    { ad: 'Trendyol’da çift ilan (aynı ürün iki ilanla satışta)', aciklama: 'Depodaki tek adet iki ilandan satılabilir. Kalacak ilanı seçin; fazlasının stoğu 0 yapılır.', eylem: 'Çift İlanları Çöz', kanal: 'trendyol', sayi: envanter.kanallar.trendyol.ciftIlanlar?.length ?? 0, url: '/yonetim/siparisler/trendyol-ilanlar#cift', ton: 'kirmizi' },
    { ad: 'Kontrol gereken pazaryeri siparişleri', aciklama: 'Siparişteki uyarıyı açarak stok, eşleşme veya kargo durumunu inceleyin.', eylem: 'Ürünleri Eşleştir / Kontrol Et', sayi: pazarKontrol, url: '/yonetim/siparisler?durum=kontrol', ton: 'kirmizi' },
    ...KANAL_LISTESI.map((k) => ({ ad: `${KANALLAR[k]} siparişi hazırlanacak (kargo ${KANALLAR[k]} panelinden)`, aciklama: `${KANALLAR[k]} paketlerini hazırlayıp kargoya teslim edin.`, eylem: 'Siparişleri Aç', kanal: k, sayi: pazarHazirlanacak(k), url: `/yonetim/siparisler?kanal=${k}&durum=islem`, ton: 'turuncu' as const })),
    ...kanalGecikti.map((k) => ({
      ad: envanter.kanallar[k].sonOtomatikApi ? `${KANALLAR[k]} otomatik eşitlemesi gecikiyor` : `${KANALLAR[k]} için ilk otomatik çekim bekleniyor`,
      aciklama: 'Satış kanalları sayfasından bağlantıyı ve son çekim zamanını kontrol edin.', eylem: 'Kanalı Aç', kanal: k,
      sayi: '!', url: '/yonetim/siparisler/kanallar#' + k, ton: 'turuncu' as const,
    })),
    { ad: 'Trendyol iadesi depoya ulaştı, onayınız bekleniyor', aciklama: 'Ürünü kontrol edip iadeyi onaylayın; sonra siparişte “satılabilir / satılamaz” seçin.', eylem: 'İadeleri Aç', kanal: 'trendyol', sayi: envanter.kanallar.trendyol.iade?.bekleyen ?? 0, url: '/yonetim/siparisler/trendyol-iade-soru', ton: 'kirmizi' },
    { ad: 'Yolda olan Trendyol iadesi', aciklama: 'Müşteri iade başlattı; ürün depoya ulaşınca onayınız istenecek.', eylem: 'İadeleri Gör', kanal: 'trendyol', sayi: envanter.kanallar.trendyol.iade?.acik ?? 0, url: '/yonetim/siparisler/trendyol-iade-soru', ton: 'gri' },
    { ad: 'Cevap bekleyen Trendyol müşteri sorusu', aciklama: 'Hızlı cevap mağaza puanını ve satışı etkiler; panelden cevaplayın.', eylem: 'Soruları Cevapla', kanal: 'trendyol', sayi: envanter.kanallar.trendyol.soru.bekleyen, url: '/yonetim/siparisler/trendyol-iade-soru#sorular', ton: 'turuncu' },
    { ad: 'Onay bekleyen müşteri değerlendirmesi', aciklama: 'Teslim edilen siparişlere yazılan müşteri yorumlarını inceleyin.', eylem: 'Yorumları İncele', sayi: bekleyenYorum, url: '/yonetim/yorumlar', ton: 'turuncu' },
    { ad: 'Tükenen ürün (sitede “stokta yok” görünüyor)', aciklama: 'Stok geldiyse adedi güncelleyin.', eylem: 'Stokları Güncelle', sayi: tukenen.length, url: '/yonetim/urunler?filtre=kritik', ton: 'kirmizi' },
    { ad: `Azalan stok (${envanter.kritikVarsayilan} adet ve altı)`, aciklama: 'Kritik eşik altına inen ürünlerin stoğunu kontrol edin.', eylem: 'Stokları Kontrol Et', sayi: kritikStok.length, url: '/yonetim/urunler?filtre=kritik', ton: 'turuncu' },
    { ad: 'Yayındaki üründe fotoğraf eksik', aciklama: 'Müşteri sayfasında görselsiz görünen ürünü tamamlayın.', eylem: 'Fotoğraf Ekle', sayi: fotosuz.length, url: fotosuz.length === 1 ? '/yonetim/urunler/' + fotosuz[0]!.id + '?bolum=fotograf' : '/yonetim/urunler', ton: 'gri' },
    { ad: 'Yayına hazır taslak set', aciklama: 'Tüm ürünleri yayında olan taslak seti satışa açabilirsiniz.', eylem: 'Setleri Aç', sayi: taslakSetler.length, url: '/yonetim/setler', ton: 'gri' },
    { ad: yedekGun === undefined ? 'Veri yedeği hiç alınmadı (indir)' : `Aylık veri yedeği zamanı (son: ${yedekGun} gün önce)`, aciklama: 'Mağaza, sipariş ve finans verilerinin yedeğini bilgisayarınıza indirin.', eylem: 'Yedek İndir', sayi: yedekGerekli ? '!' : 0, url: '/yonetim/yedek', ton: 'turuncu' },
  ] satisfies Is[]).filter((x) => x.sayi !== 0);
  const oncelik = { kirmizi: 0, turuncu: 1, gri: 2 };
  isler.sort((a, b) => oncelik[a.ton] - oncelik[b.ton]);
  return { magaza: m, siparisler, finans, pazar, envanter, yedekGun, hazirlanacak, kargolanacak, faturasiz, kanalHatasi, kanalGecikti, tukenen, kritikStok, bilerekSifirSayisi, negatifVeyaYanlisStok, isler, pazarHazirlanacak };
}
