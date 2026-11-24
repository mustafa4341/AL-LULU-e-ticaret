import { aralikta, belgeGecerli, finansGunu, hakEdis, hbIsaretli, hbKayitGunu, kalanTutar, raporla, type Finans, type Gider } from './finans';
import { KANALLAR, PY_DURUM_ADLARI, satisMi, satisTutari, type PazaryeriSiparisi } from './pazaryeri';
import { HB_GRUPLAR, hbGrubu, odendi } from './hepsiburadaFinans';
import { BELGE_DURUMLARI, BELGE_TURLERI, GIDER_KATEGORILERI } from './finans';
import { SIPARIS_DURUM_ADLARI } from './sema';
import { csvOlustur, zipOlustur } from './finansArsiv';
import { htmlKacis } from './finansPdf';
import type { Siparis } from './sema';
import { iadeEdildi } from './siparisAkisi';
import { odemeEtiketi } from './yonetimRapor';
import { TRENDYOL_BASLIK } from './trendyolDosya';

type Satirlar = (string | number)[][];
const tl = (kurus: number) => kurus / 100;
const saat = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' });
const AY = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Dönemi ay ay böler: [{ ad: 'Kasım 2026', bas: '2026-11-01', son: '2026-11-30' }] */
export function aylar(bas: string, son: string) {
  const sonuc: { ad: string; bas: string; son: string }[] = [];
  let d = new Date(bas.slice(0, 7) + '-01T00:00:00Z');
  while (d.toISOString().slice(0, 10) <= son) {
    const ayBas = d.toISOString().slice(0, 10);
    const sonraki = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const aySon = new Date(sonraki.getTime() - 864e5).toISOString().slice(0, 10);
    sonuc.push({ ad: AY.format(d), bas: ayBas < bas ? bas : ayBas, son: aySon > son ? son : aySon });
    d = sonraki;
  }
  return sonuc;
}

/**
 * Muhasebeci tabloları. Satışlar ÖDEME tarihine, iade/iptaller GERİ ÖDEME tarihine göre listelenir;
 * böylece "Satışlar − İadeler" panelde görünen net satışla aynı çıkar.
 */
export const muhasebeTablolari = (f: Finans, siparisler: Siparis[], bas: string, son: string, pazaryeri: PazaryeriSiparisi[] = []) => {
  const r = raporla(f, siparisler, bas, son);
  const pySatirlari = pazaryeri
    .filter((s) => !Number.isNaN(Date.parse(s.tarih)) && aralikta(finansGunu(Date.parse(s.tarih)), bas, son))
    .sort((a, b) => a.tarih.localeCompare(b.tarih))
    .map((s) => [KANALLAR[s.kanal], s.siparisNo, s.paketNo ?? '', saat.format(new Date(s.tarih)), PY_DURUM_ADLARI[s.durum],
      s.kalemler.map((k) => `${k.adet} × ${k.ad}`).join('; '), s.kalemler.reduce((t, k) => t + k.adet, 0),
      tl(s.toplam), tl(satisMi(s) ? satisTutari(s) : 0), satisMi(s) ? '' : 'Satış sayılmaz (iptal/iade/bekleyen)']);
  const belgeNo = (no: string) => f.belgeler.filter((b) => b.siparisNo === no && belgeGecerli(b)).map((b) => b.belgeNo ?? '').filter(Boolean).join(' ');
  const durum = (s: Siparis) => iadeEdildi(s) ? 'İade tamamlandı' : SIPARIS_DURUM_ADLARI[s.durum];
  const odemeTarihi = (s: Siparis) => s.gecmis.find((e) => e.durum === 'odendi')?.tarih;
  const aylik = aylar(bas, son).map((a) => {
    const x = raporla(f, siparisler, a.bas, a.son);
    return [a.ad, a.bas, a.son, x.satislar.length, tl(x.webSatis), tl(x.webIade), tl(x.webSatis - x.webIade), tl(x.trendyolBeklenen), tl(x.hepsiburadaBeklenen), tl(x.gider),
      tl(kalanTutar(x)), x.tahmini === undefined ? 'Ürün alış maliyeti girilmedi; kalan kesin değil' : ''];
  });
  return [
    { ad: 'Aylık özet', kod: 'aylik', satirlar: [
      ['Ay', 'Başlangıç', 'Bitiş', 'Satış adedi', 'Onaylı satış (TL)', 'İade/iptal (TL)', 'Net satış (TL)', 'Trendyol beklenen hakediş (TL)', 'Hepsiburada hakediş (TL)', 'Giderler (TL)', 'Tahmini kalan (TL)', 'Not'],
      ...aylik,
    ] },
    { ad: 'Satışlar', kod: 'satislar', satirlar: [
      ['Sipariş no', 'Kanal', 'Sipariş tarihi', 'Ödeme tarihi', 'Satış günü', 'Müşteri', 'Fatura tipi', 'Firma / VKN', 'Ödeme yöntemi', 'Güncel durum',
        'Ürünler liste (TL)', 'Set indirimi (TL)', 'Sepet indirimi (TL)', 'Kargo (TL)', 'Tahsil edilen toplam (TL)', 'Belge no'],
      ...r.satislar.map(({ siparis: s, gun }) => [s.no, 'Web', saat.format(new Date(s.tarih)), odemeTarihi(s) ? saat.format(new Date(odemeTarihi(s)!)) : '', gun,
        s.musteri.ad + ' ' + s.musteri.soyad, s.fatura.tip === 'kurumsal' ? 'Kurumsal' : 'Bireysel',
        s.fatura.tip === 'kurumsal' ? [s.fatura.firma, s.fatura.vd, s.fatura.vno].filter(Boolean).join(' / ') : '',
        odemeEtiketi(s), durum(s), s.urunlerToplami, s.setIndirimi, s.sepetIndirimi, s.kargo, s.toplam, belgeNo(s.no)]),
    ] },
    { ad: 'İade ve iptal', kod: 'iade-iptal', satirlar: [
      ['Sipariş no', 'Kanal', 'İşlem günü', 'Durum', 'Sipariş toplamı (TL)', 'Geri ödeme (TL)', 'Not'],
      ...r.iadeler.map(({ siparis: s, gun, tutar }) => [s.no, 'Web', gun, durum(s), s.toplam, tl(tutar), tutar ? '' : 'Ödeme alınmamıştı']),
    ] },
    { ad: 'Faturalar', kod: 'faturalar', satirlar: [
      ['Fatura no', 'Fatura tarihi', 'Kanal', 'Sipariş no', 'Alıcı', 'KDV hariç (TL)', 'KDV (TL)', 'Toplam (TL)', 'Durum', 'Müşteriye iletim'],
      ...f.faturalar.filter((x) => aralikta(x.tarih, bas, son)).sort((a, b) => a.tarih.localeCompare(b.tarih) || a.no.localeCompare(b.no))
        .map((x) => [x.no, x.tarih, x.kanal === 'web' ? 'Web' : KANALLAR[x.kanal], x.siparisNo, x.alici, tl(x.matrah), tl(x.kdv), tl(x.toplam),
          x.iptal ? 'İptal' : 'Geçerli', ({ bekliyor: 'Bekliyor', hata: 'Hata', gonderildi: 'İletildi', elle: 'Elle iletildi', yok: '' })[x.iletim.durum]]),
    ] },
    { ad: 'Pazaryeri satışları', kod: 'pazaryeri', satirlar: [
      ['Kanal', 'Sipariş no', 'Paket no', 'Sipariş tarihi', 'Güncel durum', 'Ürünler', 'Adet', 'Paket tutarı (TL, müşterinin ödediği)', 'Satış sayılan (TL)', 'Not'],
      ...pySatirlari,
    ] },
    { ad: 'Giderler', kod: 'giderler', satirlar: [
      ['Tarih', 'Kategori', 'Açıklama', 'Tutar (TL)', 'Fiş/fatura eki', 'Kayıt no'],
      ...r.giderler.slice().sort((a, b) => a.tarih.localeCompare(b.tarih)).map((x: Gider) => [x.tarih, GIDER_KATEGORILERI[x.kategori], x.not, tl(x.tutar), x.ek?.ad ?? 'Yok', x.id.slice(0, 8)]),
    ] },
    { ad: 'Trendyol kesintileri', kod: 'trendyol', satirlar: [
      [...TRENDYOL_BASLIK, 'Stopaj (%1, vergiden mahsup)', 'Beklenen hakediş', 'Ödeme farkı'],
      ...r.trendyol.map((x) => [x.id, x.tarih, tl(x.brut), tl(x.indirim), tl(x.iade), tl(x.komisyon), tl(x.hizmet), tl(x.kargo), tl(x.diger), x.banka === undefined ? '' : tl(x.banka), tl(x.stopaj ?? 0), tl(hakEdis(x)), x.banka === undefined ? '' : tl(x.banka - hakEdis(x))]),
    ] },
    { ad: 'Hepsiburada kayıtları', kod: 'hepsiburada', satirlar: [
      ['Kayıt no', 'Gün', 'Sipariş no', 'Paket no', 'Ürün', 'Kayıt türü', 'Grup', 'Tutar (TL, KDV dahil)', 'KDV (TL)', 'KDV hariç (TL)', 'Hakedişe etkisi (TL)', 'Durum', 'Vade', 'Ödeme tarihi', 'Fatura no'],
      ...r.hepsiburada.map((x) => [x.id, hbKayitGunu(x), x.siparisNo ?? '', x.paketNo ?? '', x.urun ?? '', x.tur, HB_GRUPLAR[hbGrubu(x.tur)], tl(x.tutar), tl(x.kdv), tl(x.net),
        tl(hbIsaretli(x)), odendi(x) ? 'Ödendi' : 'Ödenecek', x.vade?.slice(0, 10) ?? '', x.odeme?.slice(0, 10) ?? '', x.fatura ?? '']),
    ] },
    { ad: 'Belge listesi', kod: 'belgeler', satirlar: [
      ['Belge no', 'Sipariş no', 'Kanal', 'Belge tarihi', 'Tür', 'Durum', 'Belge niteliği'],
      ...r.belge.map((x) => [x.belgeNo ?? '—', x.siparisNo, 'Web', saat.format(new Date(x.olusturma)), BELGE_TURLERI[x.tur], BELGE_DURUMLARI[x.durum], 'Mağaza belgesi (resmî fatura değildir)']),
    ] },
  ];
};

export function xlsxOlustur(tablolar: { ad: string; satirlar: Satirlar }[]) {
  const xmlns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const ns = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const rels = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const dosyalar: { ad: string; veri: Buffer }[] = [];
  const ekle = (ad: string, xml: string) => dosyalar.push({ ad, veri: Buffer.from('<?xml version="1.0" encoding="UTF-8"?>' + xml) });
  const sayfalar = tablolar.map((t, i) => ({ ...t, no: i + 1, yol: 'worksheets/sheet' + (i + 1) + '.xml' }));
  ekle('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sayfalar.map((s) => '<Override PartName="/xl/' + s.yol + '" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>');
  ekle('_rels/.rels', '<Relationships xmlns="' + rels + '"><Relationship Id="rId1" Type="' + ns + '/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  ekle('xl/_rels/workbook.xml.rels', '<Relationships xmlns="' + rels + '">' + sayfalar.map((s) => '<Relationship Id="rId' + s.no + '" Type="' + ns + '/worksheet" Target="' + s.yol + '"/>').join('') + '</Relationships>');
  ekle('xl/workbook.xml', '<workbook xmlns="' + xmlns + '" xmlns:r="' + ns + '"><sheets>' + sayfalar.map((s) => '<sheet name="' + htmlKacis(s.ad) + '" sheetId="' + s.no + '" r:id="rId' + s.no + '"/>').join('') + '</sheets></workbook>');
  sayfalar.forEach((s) => ekle('xl/' + s.yol, '<worksheet xmlns="' + xmlns + '"><sheetData>' + s.satirlar.map((r, i) =>
    '<row r="' + (i + 1) + '">' + r.map((v, j) => {
      const a = String.fromCharCode(65 + j) + (i + 1);
      if (typeof v === 'number') return '<c r="' + a + '"><v>' + v + '</v></c>';
      const temiz = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
      return '<c r="' + a + '" t="inlineStr"><is><t xml:space="preserve">' + htmlKacis(temiz) + '</t></is></c>';
    }).join('') + '</row>').join('') + '</sheetData></worksheet>'));
  return zipOlustur(dosyalar);
}

export function dosyaYaniti(veri: Uint8Array, tur: string, ad: string, onizle = false) {
  return new Response(new Uint8Array(veri), { headers: {
    'Content-Type': tur,
    'Content-Disposition': (onizle ? 'inline' : 'attachment') + "; filename*=UTF-8''" + encodeURIComponent(ad),
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    // Tarayıcıda açılan yüklenmiş görseller yalıtılmış (sandbox) çalışır; PDF'te tarayıcının PDF görüntüleyicisi bozulmasın diye uygulanmaz
    ...(onizle && tur.startsWith('image/') ? { 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'" } : {}),
  } });
}
export const csvYaniti = (satirlar: Satirlar, ad: string) => dosyaYaniti(csvOlustur(satirlar), 'text/csv; charset=utf-8', ad + '.csv');
