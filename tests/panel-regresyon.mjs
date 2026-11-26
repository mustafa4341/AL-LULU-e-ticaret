/**
 * AL LULU HOME — İzole Otomatik Regresyon ve Doğruluk Test Paketi
 *
 * GÜVENLİK GARANTİSİ:
 * - Başlangıçta tüm SUPABASE_*, TRENDYOL_*, HEPSIBURADA_*, PAYTR_*, SMTP_* ortam değişkenleri silinir.
 * - Canlı veritabanına, canlı pazaryerlerine ve diske HİÇBİR yazma yapılmaz.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

for (const k of Object.keys(process.env)) {
  if (/^(SUPABASE|TRENDYOL|HEPSIBURADA|PAYTR|SMTP|CRON|ZAMANLAYICI|PAZARYERI)_/.test(k)) {
    delete process.env[k];
  }
}

const repoKoku = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(pathToFileURL(path.join(repoKoku, 'package.json')).href);
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);

const vite = await createServer({
  root: repoKoku,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
});

let gecen = 0;
let kalan = 0;
async function test(ad, fn) {
  try {
    await fn();
    gecen++;
    console.log(`  PASS  ${ad}`);
  } catch (e) {
    kalan++;
    console.error(`  FAIL  ${ad}\n        → ${e.message}`);
  }
}

try {
  const pazaryeri = await vite.ssrLoadModule('/src/lib/pazaryeri.ts');
  const pazaryeriSenkron = await vite.ssrLoadModule('/src/lib/pazaryeriSenkron.ts');
  const kanalFiyat = await vite.ssrLoadModule('/src/lib/kanalFiyat.ts');
  const karlilikMod = await vite.ssrLoadModule('/src/lib/karlilik.ts');
  const hbTarife = await vite.ssrLoadModule('/src/lib/hepsiburadaTarife.ts');
  const finansMod = await vite.ssrLoadModule('/src/lib/finans.ts');
  const finansDisari = await vite.ssrLoadModule('/src/lib/finansDisari.ts');
  const istekMod = await vite.ssrLoadModule('/src/lib/istek.ts');
  const siparisMerkezi = await vite.ssrLoadModule('/src/lib/siparisMerkezi.ts');
  const hbApiMod = await vite.ssrLoadModule('/src/lib/hepsiburadaApi.ts');
  const tyIceAktar = await vite.ssrLoadModule('/src/lib/trendyolIceAktar.ts');
  const yonetimUrun = await vite.ssrLoadModule('/src/lib/yonetimUrun.ts');
  const semaMod = await vite.ssrLoadModule('/src/lib/sema.ts');
  const fiyatMod = await vite.ssrLoadModule('/src/lib/fiyat.ts');
  const katalogMod = await vite.ssrLoadModule('/src/lib/katalog.ts');

  const magazaHam = JSON.parse(fs.readFileSync(path.join(repoKoku, 'veri', 'magaza.json'), 'utf8'));

  // 1. Ortak stok 10 -> -2 Web -> -3 Trendyol -> -1 Hepsiburada = 4 + çift aktarım koruması
  await test('Ortak stok (10 → 8 → 5 → 4), çift aktarım idempotency, iptal ve iade kontrolü', () => {
    const magaza = structuredClone(magazaHam);
    const urun = magaza.urunler.find((u) => u.id === 'tefal-duetto-plus-tava-24');
    urun.stok = 10;
    magaza.paytrStokIslemleri = ['ALref1'];
    urun.stok -= 2; // Web 2 adet ödendi -> 8

    const ayar = pazaryeri.bosAyarlar();
    ayar.eslesmeler['3168430322707'] = urun.id;
    ayar.eslesmeler['G00001'] = urun.id;
    ayar.kanallar.trendyol.stokBaslangic = '2026-11-01T00:00:00.000Z';
    ayar.kanallar.hepsiburada.stokBaslangic = '2026-11-01T00:00:00.000Z';

    const mevcut = new Map();
    const siparisNoIle = new Map();
    const tyGelen = [{
      kanal: 'trendyol', anahtar: 'PKG1', siparisNo: '119001', paketNo: 'PKG1',
      tarih: '2026-11-26T10:00:00.000Z', hamDurum: 'Created', durum: 'yeni', toplam: 600000,
      kalemler: [{ anahtar: 'K1', ad: urun.ad, adet: 3, barkod: '3168430322707', tutar: 600000, durum: 'yeni', hamDurum: 'Created' }],
    }];
    const r1 = pazaryeri.birlestir(tyGelen, mevcut, magaza, ayar, 'api', '2026-11-26T10:05:00.000Z', siparisNoIle, new Map(), false);
    assert.equal(r1.ozet.stok.get(urun.id), -3);
    urun.stok += r1.ozet.stok.get(urun.id);
    assert.equal(urun.stok, 5);
    mevcut.set(r1.kayitlar[0].id, r1.kayitlar[0]);
    siparisNoIle.set('trendyol:119001', [r1.kayitlar[0]]);

    // Çift aktarımda stok düşmez:
    const rTekrar = pazaryeri.birlestir(tyGelen, mevcut, magaza, ayar, 'api', '2026-11-26T10:10:00.000Z', siparisNoIle, new Map(), false);
    assert.equal(rTekrar.ozet.stok.size, 0);

    // HB canlıda 1 adet -> 4:
    const hbGelen = [{
      kanal: 'hepsiburada', anahtar: 'HB1', siparisNo: 'HB1',
      tarih: '2026-11-26T10:12:00.000Z', hamDurum: 'Open', durum: 'yeni', toplam: 200000,
      kalemler: [{ anahtar: 'HK1', ad: urun.ad, adet: 1, stokKodu: 'G00001', tutar: 200000, durum: 'yeni', hamDurum: 'Open' }],
    }];
    const rHb = pazaryeri.birlestir(hbGelen, mevcut, magaza, ayar, 'api', '2026-11-26T10:15:00.000Z', siparisNoIle, new Map(), false);
    assert.equal(rHb.ozet.stok.get(urun.id), -1);
    urun.stok += rHb.ozet.stok.get(urun.id);
    assert.equal(urun.stok, 4);
  });

  // 2. FAZ 1.1: Finans ekranı === Muhasebe Excel Aylık Özet tutarlılığı
  await test('Faz 1.1: Finans ekranı kalanTutar ile Muhasebe Excel Aylık Özet birebir aynı olmalı', () => {
    const finans = finansMod.FinansSema.parse({
      belgeler: [], giderler: [], olaylar: [],
      hbUrunler: { 'fissler-vitaquick-buhar-aparati': { kategori: 'elle', desi: 2, kdv: 20, maliyet: 25000, oranBp: 900 } },
      trendyol: [{ id: 'TY-11861062951', tarih: '2026-11-20', brut: 110000, indirim: 0, iade: 0, komisyon: 3190, hizmet: 1319, kargo: 11200, diger: 0, stopaj: 917, banka: 93374 }],
    });
    const pySip = [{
      id: 'trendyol-PKG1', kanal: 'trendyol', siparisNo: '11861062951', paketNo: 'PKG1',
      tarih: '2026-11-20T10:00:00.000Z', hamDurum: 'Delivered', durum: 'teslim-edildi', toplam: 110000,
      ilkAktarim: '2026-11-20T10:05:00.000Z', sonAktarim: '2026-11-20T10:05:00.000Z', kaynak: 'api', gecmis: [],
      kalemler: [{ anahtar: 'K1', ad: 'Buhar Aparatı', adet: 1, urunId: 'fissler-vitaquick-buhar-aparati', tutar: 110000, durum: 'teslim-edildi', stok: 'dusuldu', dusulen: 1, eksik: 0 }],
    }];
    const ekran = finansMod.kalanTutar(finansMod.raporla(finans, [], '2026-11-01', '2026-11-30', pySip)) / 100;
    const tablolar = finansDisari.muhasebeTablolari(finans, [], '2026-11-01', '2026-11-30', pySip);
    const basliklar = tablolar[0].satirlar[0];
    const kalanIdx = basliklar.indexOf('Tahmini kalan (TL)');
    assert(kalanIdx >= 0, 'Tahmini kalan sütunu bulunmalı');
    const excelKalan = tablolar[0].satirlar[1][kalanIdx];
    assert.equal(excelKalan, ekran, `Excel (${excelKalan}) ve Ekran (${ekran}) kalan tutarı eşit olmalı`);
  });

  // 3. FAZ 1.2: Trendyol hizmet bedeli KDV ayrımı & Hepsiburada bilinmeyen kargo firmasında sahte net kâr göstermeme
  await test('Faz 1.2: Trendyol hizmet bedeli KDV hariç hesaplanmalı ve HB kargo firması boşken sahte netKar dönmemeli', () => {
    const finans = finansMod.FinansSema.parse({
      belgeler: [], giderler: [], olaylar: [],
      hbUrunler: { 'fissler-vitaquick-buhar-aparati': { kategori: 'elle', desi: 2, kdv: 20, maliyet: 25000, oranBp: 900 } },
      trendyol: [{ id: 'TY-11861062951', tarih: '2026-11-20', brut: 120000, indirim: 0, iade: 0, komisyon: 12000, hizmet: 1200, kargo: 12000, diger: 0 }],
    });
    const pySip = [{
      id: 'trendyol-PKG1', kanal: 'trendyol', siparisNo: '11861062951', paketNo: 'PKG1',
      tarih: new Date().toISOString(), hamDurum: 'Delivered', durum: 'teslim-edildi', toplam: 120000,
      ilkAktarim: new Date().toISOString(), sonAktarim: new Date().toISOString(), kaynak: 'api', gecmis: [],
      kalemler: [{ anahtar: 'K1', ad: 'Buhar Aparatı', adet: 1, urunId: 'fissler-vitaquick-buhar-aparati', tutar: 120000, durum: 'teslim-edildi', stok: 'dusuldu', dusulen: 1, eksik: 0 }],
    }];
    // KDV hariç satış = 1200 / 1.2 = 1000 TL (100000 kr)
    // Kesintiler KDV dahil: komisyon 120 + kargo 120 + hizmet 12 = 252 TL -> KDV hariç = 252 / 1.2 = 210 TL (21000 kr)
    // Maliyet KDV hariç = 250 TL (25000 kr) -> Gerçek KDV hariç net kâr = 1000 - 210 - 250 = 540 TL (54000 kr)
    const kar = karlilikMod.trendyolKarlilik(pySip, finans, magazaHam, 30, () => 20);
    assert.equal(kar.satirlar[0].netKar, 54000);

    // Hepsiburada kargoFirmasi boş ('') olduğunda kargoBulunamadi=true ve netKar=undefined olmalı:
    const eksikKargoHesap = hbTarife.satisHesabi({
      fiyat: 104900, urunKdv: 20, oranBp: 900, desi: 2, kargoFirmasi: '',
      islemBedeli: 0, hizmetBedeli: 0, stopajBp: 100, maliyet: 25000,
    });
    assert.equal(eksikKargoHesap.kargoBulunamadi, true);
    assert.equal(eksikKargoHesap.netKar, undefined, 'Kargo firması bilinmiyorken kargo 0 TL sayılıp kesin netKar gösterilmemeli');
  });

  // 4. FAZ 1.3: Web sepetteIndirim pazaryeri hedef fiyatına sızmamalı
  await test('Faz 1.3: Web sepetteIndirim özel fiyat girilmemiş pazaryeri fiyatını düşürmemeli', () => {
    const ayar = pazaryeri.bosAyarlar();
    const urun = { id: 'ornek-urun', fiyat: 2000, sepetteIndirim: 15 };
    const sonuc = pazaryeri.kanalHedefFiyati(urun, ayar.kanallar.trendyol);
    assert.equal(sonuc.hedef, 2000, 'Web sepet indirimi pazaryeri baz fiyatına sızmamalı');
  });

  // 5. FAZ 1.4: Manuel zararına / başabaş altı fiyat gönderme koruması
  await test('Faz 1.4: Başabaş/maliyet altı veya >%50 düşen manuel fiyat onaysız engellenmeli', () => {
    assert.equal(typeof kanalFiyat.fiyatGuvenlikKontrolu, 'function', 'fiyatGuvenlikKontrolu fonksiyonu tanımlı olmalı');
    const basabasAlti = kanalFiyat.fiyatGuvenlikKontrolu({ hedefTL: 420, mevcutTL: 1049, maliyetKurus: 25000, basaBasKurus: 46100 });
    assert.equal(basabasAlti.riskli, true);
    assert.equal(basabasAlti.tur, 'basabas-alti');

    const buyukDusus = kanalFiyat.fiyatGuvenlikKontrolu({ hedefTL: 450, mevcutTL: 1200, maliyetKurus: 20000, basaBasKurus: 35000 });
    assert.equal(buyukDusus.riskli, true);
    assert.equal(buyukDusus.tur, 'buyuk-dusus');

    const guvenli = kanalFiyat.fiyatGuvenlikKontrolu({ hedefTL: 1049, mevcutTL: 1099, maliyetKurus: 25000, basaBasKurus: 46100 });
    assert.equal(guvenli.riskli, false);
  });

  // 6. FAZ 1.5: Kapalı/test kanal canlı kanalın stok artışını kilitlememeli
  await test('Faz 1.5: Kapalı (kapali) veya test (SIT) kanal canlı kanalın stok eşitlemesini bloke etmemeli', () => {
    assert.equal(typeof pazaryeriSenkron.beklenenCanliKanallar, 'function', 'beklenenCanliKanallar yardımcı fonksiyonu tanımlı olmalı');
    const ayar = pazaryeri.bosAyarlar();
    ayar.kanallar.trendyol.stokBaslangic = '2026-11-01T00:00:00.000Z';
    ayar.kanallar.trendyol.urunler.u1 = { satista: true, kod: 'B1' };
    ayar.kanallar.hepsiburada.urunler.u1 = { satista: true, kod: 'HB1' };

    const kapaliIkisi = pazaryeriSenkron.beklenenCanliKanallar(ayar, (k) => (k === 'trendyol' ? 'canli' : 'kapali'));
    assert.deepEqual(kapaliIkisi, ['trendyol']);

    const testIkisi = pazaryeriSenkron.beklenenCanliKanallar(ayar, (k) => (k === 'trendyol' ? 'canli' : 'test'));
    assert.deepEqual(testIkisi, ['trendyol']);

    // Aktif kanalın anahtarları bozulmuşsa ('eksik' + stokBaslangic var) güvenlik için beklenenlerde kalmalı:
    ayar.kanallar.hepsiburada.stokBaslangic = '2026-11-01T00:00:00.000Z';
    const eksikAnahtar = pazaryeriSenkron.beklenenCanliKanallar(ayar, (k) => (k === 'trendyol' ? 'canli' : 'eksik'));
    assert.deepEqual(eksikAnahtar, ['trendyol', 'hepsiburada']);
  });

  // 7. FAZ 2.1: Tek-sahip geri yönlendirme yardımcısı (open-redirect güvenliği + sorgu koruma)
  await test('Faz 2.1: yonetimGeriAdresi yalnız /yonetim içi adreslere izin vermeli ve dış yönlendirmeyi engellemeli', () => {
    const originUrl = new URL('https://alluluhome.com/yonetim/finans/faturalar');
    const icAdres = istekMod.yonetimGeriAdresi(
      '/yonetim/siparisler?durum=islem&sec=trendyol-PKG1&ok=eski',
      originUrl,
      '/yonetim/finans/faturalar',
      { tur: 'ok', mesaj: 'Fatura kaydedildi.' },
    );
    assert.equal(icAdres, '/yonetim/siparisler?durum=islem&sec=trendyol-PKG1&ok=Fatura+kaydedildi.');

    const disSaldiri = istekMod.yonetimGeriAdresi(
      'https://evil.example.com/yonetim/sahte',
      originUrl,
      '/yonetim/finans/faturalar',
      { tur: 'hata', mesaj: 'Geçersiz' },
    );
    assert.equal(disSaldiri, '/yonetim/finans/faturalar?hata=Ge%C3%A7ersiz');
  });

  // 8. FAZ 2.2: Sipariş Merkezi — lojistik aşama ve 3 aşamalı fatura ayrımı + engellenen işlemler + SIT test izolasyonu + tarihsel kâr
  await test('Faz 2.2: Sipariş Merkezi 3 kanalı tek modelde birleştirmeli, teslim edilmiş faturasız siparişi geriye çekmemeli ve sahte kâr üretmemeli', () => {
    const finans = finansMod.FinansSema.parse({
      belgeler: [], giderler: [], olaylar: [],
      faturalar: [{
        id: '11111111-1111-4111-8111-111111111111',
        kanal: 'trendyol',
        kayit: 'trendyol-PKG-TESLIM',
        siparisNo: '119002',
        no: 'GIB2026000000099',
        tarih: '2026-11-25',
        alici: 'Ayşe Yılmaz',
        matrah: 100000,
        kdv: 20000,
        toplam: 120000,
        iletim: { durum: 'hata', mesaj: 'Trendyol fatura servisi zaman aşımı' },
        olusturma: '2026-11-25T12:00:00.000Z',
      }],
      hbUrunler: {
        'fissler-buhar-aparati-22': { kategori: 'elle', desi: 2, kdv: 20, maliyet: 25000, oranBp: 900 },
      },
      trendyol: [{
        id: 'TY-119002', tarih: '2026-11-25', brut: 120000, indirim: 0, iade: 0, komisyon: 12000, hizmet: 1200, kargo: 12000, diger: 0, stopaj: 1000, banka: 93800,
      }],
    });
    const envanter = pazaryeri.bosAyarlar();

    const webSiparis = [{
      no: 'AL2026112601',
      token: 'tok123',
      tarih: '2026-11-26T09:00:00.000Z',
      durum: 'kargoda',
      musteri: { ad: 'Mehmet', soyad: 'Kaya', tel: '05551112233', eposta: 'm@example.com' },
      teslimat: { il: 'İstanbul', ilce: 'Kadıköy', adres: 'Moda Cad. No:1' },
      fatura: { tip: 'bireysel' },
      kalemler: [{ tip: 'urun', id: 'fissler-buhar-aparati-22', ad: 'Buhar Aparatı', parcalar: [], adet: 1, birimFiyat: 900, indirim: 0, toplam: 900 }],
      urunlerToplami: 900, setIndirimi: 0, sepetIndirimi: 0, kampanyaIndirimi: 0, kargo: 0, toplam: 900,
      kargoFirma: 'Aras Kargo', kargoTakip: '1234567890', stokDusuldu: true,
      gecmis: [{ durum: 'odendi', tarih: '2026-11-26T09:01:00.000Z' }, { durum: 'kargoda', tarih: '2026-11-26T10:00:00.000Z' }],
    }];

    const pySiparisler = [
      // 1) Teslim edilmiş ama fatura iletimi hata vermiş Trendyol siparişi
      {
        id: 'trendyol-PKG-TESLIM', kanal: 'trendyol', siparisNo: '119002', paketNo: 'PKG-TESLIM',
        tarih: '2026-11-25T08:00:00.000Z', hamDurum: 'Delivered', durum: 'teslim-edildi', toplam: 120000,
        ilkAktarim: '2026-11-25T08:05:00.000Z', sonAktarim: '2026-11-25T15:00:00.000Z', kaynak: 'api', gecmis: [],
        kalemler: [{ anahtar: 'K1', ad: 'Buhar Aparatı', adet: 1, urunId: 'fissler-buhar-aparati-22', tutar: 120000, durum: 'teslim-edildi', stok: 'dusuldu', dusulen: 1, eksik: 0 }],
      },
      // 2) Eşleşmeyen ürün içeren yeni Trendyol siparişi ("Toplamaya Başla" yerine "Ürünü Eşleştir" çıkmalı)
      {
        id: 'trendyol-PKG-ESLESMEYEN', kanal: 'trendyol', siparisNo: '119003', paketNo: 'PKG-ESLESMEYEN',
        tarih: '2026-11-26T11:00:00.000Z', hamDurum: 'Created', durum: 'yeni', toplam: 199900,
        ilkAktarim: '2026-11-26T11:01:00.000Z', sonAktarim: '2026-11-26T11:01:00.000Z', kaynak: 'api', gecmis: [],
        kalemler: [{ anahtar: 'K2', ad: 'Bilinmeyen Tava', adet: 1, barkod: '999999', tutar: 199900, durum: 'yeni', stok: 'yok', dusulen: 0, eksik: 0 }],
      },
      // 3) Hepsiburada SIT/test siparişi ("İşlem Bekleyen" kuyruğuna girmemeli)
      {
        id: 'hepsiburada-HB-TEST', kanal: 'hepsiburada', siparisNo: 'HB-TEST-1',
        tarih: '2026-11-26T11:30:00.000Z', hamDurum: 'Open', durum: 'yeni', toplam: 104900, stokDisi: true,
        ilkAktarim: '2026-11-26T11:31:00.000Z', sonAktarim: '2026-11-26T11:31:00.000Z', kaynak: 'api', gecmis: [],
        kalemler: [{ anahtar: 'HK1', ad: 'Buhar Aparatı', adet: 1, urunId: 'fissler-buhar-aparati-22', tutar: 104900, durum: 'yeni', stok: 'yok', dusulen: 0, eksik: 0 }],
      },
    ];

    const simdi = Date.parse('2026-11-26T12:00:00.000Z');
    const liste = siparisMerkezi.siparisMerkeziOlustur({
      webSiparisleri: webSiparis,
      pazaryeriSiparisleri: pySiparisler,
      magaza: magazaHam,
      finans,
      envanter,
      simdi,
      kanalDurumuBul: (k) => (k === 'trendyol' ? 'canli' : 'test'),
    });

    const teslim = liste.find((x) => x.anahtar === 'trendyol-PKG-TESLIM');
    assert.equal(teslim.asama, 'tamamlandi', 'Fatura iletim hatası lojistik aşamayı Tamamlandı’dan geriye çekmemeli');
    assert.equal(teslim.fatura.asama, 'kaydedildi');
    assert.equal(teslim.fatura.adimNo, 2);
    assert.equal(teslim.islemBekliyorMu, true, 'Fatura iletimi hatalı sipariş İşlem Bekleyen listesinde görünmeli');
    assert.equal(teslim.birincilIslem.kod, 'fatura-ilet');
    assert.equal(teslim.kazanc.tahminiNetKar, 54000, 'Sipariş bazlı kesinleşen Trendyol net kârı 540 TL (54000 kr) olmalı');

    const eslesmeyen = liste.find((x) => x.anahtar === 'trendyol-PKG-ESLESMEYEN');
    assert.equal(eslesmeyen.birincilIslem.kod, 'urun-eslestir', 'Eşleşmeyen üründe Toplamaya Başla yerine önce Ürünü Eşleştir çıkmalı');
    assert.equal(eslesmeyen.kazanc.tahminiNetKar, undefined, 'Eşleşmeyen/maliyetsiz siparişte sahte kâr üretilmemeli');

    const hbTest = liste.find((x) => x.anahtar === 'hepsiburada-HB-TEST');
    assert.equal(hbTest.entegrasyon.testSiparisi, true);
    assert.equal(hbTest.islemBekliyorMu, false, 'SIT test siparişi canlı İşlem Bekleyen kuyruğunu kirletmemeli');

    const webKargoda = liste.find((x) => x.anahtar === 'web:AL2026112601');
    assert.equal(webKargoda.asama, 'kargoda');
    assert.equal(webKargoda.fatura.asama, 'kesilecek');
    assert.equal(webKargoda.islemBekliyorMu, true, 'Kargodaki faturasız web siparişi fatura için İşlem Bekleyen’de kalmalı');
    // Katalogda güncel fiyat 1049 TL olsa bile sipariş tarihsel 900 TL üzerinden hesaplanmalı:
    assert.equal(webKargoda.kazanc.musteriOdedigi, 90000);

    assert.equal(siparisMerkezi.siparisSekmesiCoz(null), 'islem');
    assert.equal(siparisMerkezi.siparisSekmesiCoz('odendi'), 'hazirlanacak');
    assert.equal(siparisMerkezi.siparisSekmesiCoz('belgesiz'), 'faturasiz');
  });

  // 9. FAZ 4: Akıllı stok uyarıları — bilerek 0 stoklu ürün rutin uyarı vermez ama gerçek stok sorununu asla gizlemez
  await test('Faz 4: bilerekStoktaYok rutin 0 stok uyarısını susturmalı, fakat negatif stok veya pazaryerinde yanlış stok varsa ASLA gizlememeli', () => {
    const ayar = pazaryeri.bosAyarlar();
    ayar.kritikVarsayilan = 3;
    ayar.urunKritik['ozel-esikli'] = 8;
    ayar.bilerekStoktaYok['fissler-vitaquick-premium-6l'] = true;

    const bilerekSifir = { id: 'fissler-vitaquick-premium-6l', durum: 'yayinda', stok: 0 };
    assert.equal(pazaryeri.rutinStokUyarisiVarMi(bilerekSifir, ayar), false, 'Bilerek 0 stokta tutulan ürün rutin uyarı üretmemeli');

    // Aynı ürün Trendyol’da hâlâ bildirilen=2 stokta görünüyorsa gerçek aşırı satış riski vardır, gizlenemez!
    ayar.kanallar.trendyol.urunler['fissler-vitaquick-premium-6l'] = { kod: 'BARKOD1', satista: true, bildirilen: 2 };
    assert.deepEqual(pazaryeri.pazaryerindeYanlisStokKanallari(bilerekSifir, ayar), ['trendyol']);
    assert.equal(pazaryeri.rutinStokUyarisiVarMi(bilerekSifir, ayar), true, 'Pazaryerinde yanlış stok varken bilerekStoktaYok uyarıyı gizleyemez');

    // Kanalda da 0 olunca tekrar sessizleşir, ama negatif stok her zaman uyarır:
    ayar.kanallar.trendyol.urunler['fissler-vitaquick-premium-6l'].bildirilen = 0;
    assert.equal(pazaryeri.rutinStokUyarisiVarMi(bilerekSifir, ayar), false);
    assert.equal(pazaryeri.rutinStokUyarisiVarMi({ ...bilerekSifir, stok: -1 }, ayar), true, 'Negatif stok asla gizlenemez');

    // Ürün bazlı özel eşik (8):
    assert.equal(pazaryeri.rutinStokUyarisiVarMi({ id: 'ozel-esikli', durum: 'yayinda', stok: 6 }, ayar), true);
    assert.equal(pazaryeri.rutinStokUyarisiVarMi({ id: 'ozel-esikli', durum: 'yayinda', stok: 9 }, ayar), false);
    // Fissler Vitaquick Premium 6L varsayılan olarak bilerekStoktaYok=true gelir ve istendiğinde false ile kapatılabilir:
    const varsayilanAyar = pazaryeri.bosAyarlar();
    assert.equal(varsayilanAyar.bilerekStoktaYok['fissler-vitaquick-premium-6l'], true);
    const kapatilmis = pazaryeri.EnvanterAyarSema.parse({ bilerekStoktaYok: { 'fissler-vitaquick-premium-6l': false } });
    assert.equal(kapatilmis.bilerekStoktaYok['fissler-vitaquick-premium-6l'], false);

    // Hepsiburada paket bozma ve kalem iptal nedenleri tanımlı olmalı:
    assert.equal(typeof hbApiMod.hbPaketBoz, 'function');
    assert.equal(typeof hbApiMod.hbKalemIptal, 'function');
    assert.equal(hbApiMod.HB_IPTAL_NEDENLERI[12], 'Stok yok');
  });

  // 10. FAZ 5: 3 Kanal ayrı fiyat + otomatik kanal kuralı + manuel istisna önceliği (ozel > kural > site)
  await test('Faz 5: Web, Trendyol ve Hepsiburada ayrı fiyatları, otomatik kanal kuralları ve manuel istisnalar birbirini ezmemeli', () => {
    const ayar = pazaryeri.bosAyarlar();
    ayar.kanallar.trendyol.fiyatKurali = { yuzde: 15, ekTL: 50, yuvarla: true };
    ayar.kanallar.hepsiburada.fiyatKurali = { yuzde: 10, ekTL: 0, yuvarla: false };
    ayar.kanallar.hepsiburada.urunler['urun-a'] = { kod: 'HB-A', satista: true, ozelFiyat: 2499 };

    const urun = { id: 'urun-a', fiyat: 2000, sepetteIndirim: 10 };
    const tyHedef = pazaryeri.kanalHedefFiyati(urun, ayar.kanallar.trendyol);
    // 2000 * 1.15 + 50 = 2350 -> ,90 yuvarlama = 2350.90 (kaynak: kural)
    assert.equal(tyHedef.kaynak, 'kural');
    assert.equal(tyHedef.hedef, 2350.9);

    const hbHedef = pazaryeri.kanalHedefFiyati(urun, ayar.kanallar.hepsiburada);
    // Manuel ozelFiyat (2499) kanal kuralını (%10 = 2200) ezer ve kaybolmaz:
    assert.equal(hbHedef.kaynak, 'ozel');
    assert.equal(hbHedef.hedef, 2499);
    assert.equal(urun.fiyat, 2000);
  });

  // 11. Bağlanmamış özel fiyatlı ürün sahte "Bağlantı Hatası / geçersiz ilan kodu (boş)" üretmemeli
  await test('Faz 7.1: İlan kodu henüz bağlanmamış özel fiyatlı ürün stokHedefleri içinde sahte bağlantı hatası üretmemeli', () => {
    const ayar = pazaryeri.bosAyarlar();
    ayar.kanallar.trendyol.urunler['fissler-vitaquick-premium-6l'] = { satista: true, ozelFiyat: 14500 };
    ayar.kanallar.trendyol.urunler['fissler-buhar-aparati-22'] = { satista: true, kod: '4009209307671' };
    ayar.kanallar.trendyol.urunler['hatali-urun'] = { satista: true, kod: 'BOZUK KOD 123' };

    const stoklar = new Map([
      ['fissler-vitaquick-premium-6l', 0],
      ['fissler-buhar-aparati-22', 4],
      ['hatali-urun', 2],
    ]);
    const sonuc = pazaryeriSenkron.stokHedefleri('trendyol', ayar.kanallar.trendyol, stoklar);
    assert.equal(sonuc.hedefler.length, 1);
    assert.equal(sonuc.hedefler[0].urunId, 'fissler-buhar-aparati-22');
    assert.equal(sonuc.uyarilar.length, 1, 'Yalnızca gerçekten bozuk kod uyarı üretmeli, boş kod değil');
    assert.match(sonuc.uyarilar[0], /BOZUK KOD 123/);
  });

  // 12. Trendyol'dan çekilen ürün için zengin içerik üretimi + engelsiz yayına alma
  await test('Faz 7.2: zenginUrunIcerigi ürüne özel zengin açıklama, 4 fayda, 4 SSS ve geçerli Urun şeması üretmeli', () => {
    const icerik = tyIceAktar.zenginUrunIcerigi({
      marka: 'Eratec',
      ad: 'Cam Kavanoz 2 Parçalı Kapak 1000 ml',
      kisaAd: 'Cam Kavanoz 2 Parçalı Kapak 1000 ml',
      kategori: 'saklama',
      ozellikler: [
        { ad: 'Materyal', deger: 'Cam' },
        { ad: 'Hacim', deger: '1 L' },
        { ad: 'Menşei', deger: 'DE' },
        { ad: 'Web Color', deger: 'Şeffaf' },
        { ad: 'Gıda Temas Sembolü', deger: 'Evet' },
      ],
      aciklama: '',
      barkod: 'ERTCKVNZ1000MLX1',
      stokKodu: 'ERTCKVNZ1000MLX1',
    });
    assert.equal(icerik.oneCikanBilgiler.length, 4);
    assert.equal(icerik.faydalar.length, 4);
    assert.equal(icerik.sss.length, 4);
    assert(icerik.kutuIcerigi.length >= 1);
    assert(icerik.teknik.some(([k, v]) => /menşei/i.test(k) && v === 'Almanya'), 'DE ülke kodu Almanya olarak çevrilmeli');

    const adayUrun = semaMod.UrunSema.parse({
      ...structuredClone(yonetimUrun.BOS_URUN),
      id: 'eratec-cam-kavanoz-test',
      durum: 'yayinda',
      marka: 'Eratec',
      ad: 'Cam Kavanoz 2 Parçalı Kapak 1000 ml',
      kisaAd: 'Cam Kavanoz 2 Parçalı Kapak 1000 ml',
      kategoriler: ['saklama'],
      fiyat: 339,
      stok: 10,
      gorseller: [{ src: '/medya/test/01.webp', alt: 'Eratec Cam Kavanoz' }],
      ...icerik,
      dogrula: ['Trendyol’dan içe aktarıldı: bilgi notu.'],
    });
    assert.deepEqual(yonetimUrun.yayinEksikleri(adayUrun), [], 'Ünlemsiz bilgi notu yayına almayı engellememeli');
  });

  // 13. İndirimli set sepete ekleme + stoksuz set kartı DOM güvenliği
  await test('Faz 7.3: İndirimli setler doğru set indirimiyle sepete eklenmeli ve stoksuz set kartları sepet betiğini çökertmemeli', () => {
    const kat = new katalogMod.Katalog(magazaHam);
    const ik = kat.istemci();
    const stokluSetId = Object.keys(ik.setler)[0];
    assert(stokluSetId, 'İstemci kataloğunda en az 1 satışta indirimli set bulunmalı');
    const sepet = fiyatMod.sepetHesapla([{ tip: 'set', id: stokluSetId, adet: 1 }], ik);
    assert.equal(sepet.satirlar.length, 1);
    assert(sepet.setIndirimi > 0, 'İndirimli sette pozitif set indirimi hesaplanmalı');

    const sepetKaynak = fs.readFileSync(path.join(repoKoku, 'src', 'scripts', 'sepet.ts'), 'utf8');
    assert(!sepetKaynak.includes("kutu.querySelector<HTMLButtonElement>('[data-sepete-ekle]')!"), 'Stoksuz set kartları için null-olmayan zorlama (!) kaldırılmış olmalı');
    assert(sepetKaynak.includes('return id && buton && etiket && not ? [{ id, buton, etiket, not }] : [];'), 'Yalnızca aktif sepete-ekle butonu olan set kutuları izlenmeli');
  });

  console.log(`\nSonuç: ${gecen} geçti, ${kalan} başarısız.`);
  if (kalan > 0) process.exitCode = 1;
} finally {
  await vite.close();
}
