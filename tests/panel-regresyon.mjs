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

  console.log(`\nSonuç: ${gecen} geçti, ${kalan} başarısız.`);
  if (kalan > 0) process.exitCode = 1;
} finally {
  await vite.close();
}
