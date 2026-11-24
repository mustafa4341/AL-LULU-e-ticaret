/**
 * Sipariş belgeleri (sipariş özeti, paket içi fiş, paketleme listesi, iade talep formu).
 * A4 sayfa SVG olarak çizilir; finansPdf.svgdenPdf ile PDF'e, svgdenPng ile önizlemeye çevrilir.
 * Bu belgeler mağaza içi/bilgilendirme belgeleridir; resmî e-Fatura / e-Arşiv yerine geçmez.
 */
import { BELGE_BASLIKLARI, type BelgeAyarlari, type BelgeTuru } from './finans';
import { barkodSvg, metniSar, yaziOlc, yaziYoluSvg } from './finansPdf';
import type { Siparis } from './sema';

export type SaticiBilgisi = {
  ad: string; unvan?: string; adres?: string; telefon?: string; eposta?: string;
  vergi?: string; mersis?: string; web?: string;
};
export type BelgeGirdisi = {
  siparis: Siparis;
  tur: BelgeTuru;
  ayar: BelgeAyarlari;
  satici: SaticiBilgisi;
  belgeNo: string;
  belgeTarihi: Date;
  logo: string;
  not?: string;
  fiyatGizle?: boolean;
  onizleme?: boolean;
};

export const A4 = { w: 595.28, h: 841.89 } as const;
const K = 40;
const SAG = A4.w - K;
const ALT_SINIR = A4.h - 120;
const RENK = { yazi: '#1f1b16', ikincil: '#6a5e4e', cizgi: '#e6dfd2', baslikZemin: '#f6f1e6', altin: '#ad8a45' };

const tarihSaat = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
const sayi = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const tl = (v: number) => sayi.format(v) + ' TL';
export const belgeTarihi = (d: Date | string) => tarihSaat.format(typeof d === 'string' ? new Date(d) : d);

type Hiza = 'start' | 'middle' | 'end';
function yazi(v: string, x: number, y: number, o: { boy?: number; kalin?: boolean; renk?: string; hiza?: Hiza } = {}) {
  return yaziYoluSvg(v, x, y, {
    boy: o.boy ?? 9.5,
    kalin: o.kalin,
    renk: o.renk ?? RENK.yazi,
    hiza: o.hiza ?? 'start',
  });
}
const cizgi = (x1: number, y1: number, x2: number, y2: number, renk: string = RENK.cizgi, kalinlik = 0.8) =>
  '<line x1="' + x1 + '" y1="' + y1.toFixed(1) + '" x2="' + x2 + '" y2="' + y2.toFixed(1) + '" stroke="' + renk + '" stroke-width="' + kalinlik + '"/>';
const kutu = (x: number, y: number, w: number, h: number, dolgu: string, kenar = 'none', r = 3) =>
  '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + r + '" fill="' + dolgu + '" stroke="' + kenar + '" stroke-width="0.8"/>';

/** Metni gerçek yazı tipi genişliğine göre satırlara böler (taşma yapmaz). */
export function sar(metin: string, en: number, boy = 9.5, kalin = false): string[] {
  return metniSar(metin, en, boy, kalin);
}

function odemeBilgisi(s: Siparis) {
  const odeme = s.gecmis.find((g) => g.durum === 'odendi');
  const yontem = s.paytr ? 'Kredi / banka kartı (PayTR)' : 'Havale / EFT veya elden (manuel onay)';
  const durum = s.paytr
    ? (s.paytr.sonuc === 'odendi' ? 'Ödendi' : s.paytr.sonuc === 'basarisiz' ? 'Ödeme başarısız' : 'Ödeme bekleniyor')
    : (odeme || ['hazirlaniyor', 'kargoda', 'teslim-edildi'].includes(s.durum) ? 'Ödendi' : s.durum === 'iptal' ? 'İptal' : 'Ödeme bekleniyor');
  return { tarih: odeme?.tarih, yontem, durum };
}

type Blok = { baslik: string; satirlar: string[] };
function bilgiBloklari(bloklar: Blok[], y: number): { svg: string; y: number } {
  const bosluk = 14;
  const en = (SAG - K - bosluk * (bloklar.length - 1)) / bloklar.length;
  let svg = '';
  let enAlt = y;
  bloklar.forEach((b, i) => {
    const x = K + i * (en + bosluk);
    let yy = y;
    svg += yazi(b.baslik.toLocaleUpperCase('tr'), x, yy, { boy: 7.5, kalin: true, renk: RENK.altin });
    yy += 13;
    b.satirlar.filter(Boolean).forEach((satir, j) => {
      for (const parca of sar(satir, en, 9)) {
        svg += yazi(parca, x, yy, { boy: 9, kalin: j === 0 });
        yy += 12;
      }
    });
    enAlt = Math.max(enAlt, yy);
  });
  return { svg, y: enAlt + 6 };
}

type Kolon = { baslik: string; x: number; hiza: Hiza; en: number };

/** Yan yana işaret kutuları (☐ karakteri her yazı tipinde bulunmadığı için kutu çizilir). */
function secenekler(liste: string[], x: number, y: number, boy = 9.5) {
  let svg = '';
  let xx = x;
  for (const metin of liste) {
    svg += kutu(xx, y - 8.5, 9, 9, '#fff', '#8c7f6c', 1.5);
    svg += yazi(metin, xx + 14, y, { boy });
    xx += 14 + yaziOlc(metin, boy) + 18;
  }
  return svg;
}

/** Belgeyi SVG sayfaları olarak üretir (çok kalemli siparişlerde birden fazla sayfa). */
export function siparisBelgesiSvg(g: BelgeGirdisi): string[] {
  const { siparis: s, tur, ayar, satici } = g;
  const fiyatli = (tur === 'ozet' || (tur === 'fis' && ayar.fisFiyat)) && !g.fiyatGizle;
  const odeme = odemeBilgisi(s);
  const sayfalar: string[] = [];
  let icerik = '';
  let y = 0;

  const ustBilgi = (ilk: boolean) => {
    let svg = kutu(0, 0, A4.w, A4.h, '#fff', 'none', 0);
    if (ayar.logo && g.logo) svg += '<image href="' + g.logo + '" x="' + K + '" y="26" width="150" height="44" preserveAspectRatio="xMinYMid meet"/>';
    else svg += yazi(satici.ad.toLocaleUpperCase('tr'), K, 54, { boy: 16, kalin: true });
    svg += yazi(BELGE_BASLIKLARI[tur].toLocaleUpperCase('tr'), SAG, 44, { boy: 15, kalin: true, hiza: 'end' });
    svg += yazi('Belge no: ' + g.belgeNo, SAG, 60, { boy: 9, hiza: 'end', renk: RENK.ikincil });
    svg += yazi('Belge tarihi: ' + belgeTarihi(g.belgeTarihi), SAG, 72, { boy: 9, hiza: 'end', renk: RENK.ikincil });
    svg += cizgi(K, 86, SAG, 86, RENK.altin, 1.6);
    if (!ilk) svg += yazi('Sipariş ' + s.no + ' · devamı', K, 104, { boy: 9, renk: RENK.ikincil });
    return svg;
  };

  const sayfaBitir = () => { sayfalar.push(icerik); icerik = ''; };
  const yeniSayfa = () => { sayfaBitir(); icerik = ustBilgi(false); y = 120; };

  // 1) Üst bilgi ve taraf bilgileri
  icerik = ustBilgi(true);
  y = 106;
  const alici: string[] = [s.musteri.ad + ' ' + s.musteri.soyad, 'Tel: ' + s.musteri.tel, s.musteri.eposta ? 'E-posta: ' + s.musteri.eposta : ''];
  if (s.fatura.tip === 'kurumsal') alici.push(s.fatura.firma ?? '', [s.fatura.vd, s.fatura.vno].filter(Boolean).join(' / '));
  const siparisBlok: Blok = {
    baslik: 'Sipariş',
    satirlar: [
      s.no, 'Sipariş tarihi: ' + belgeTarihi(s.tarih),
      ...(tur === 'paket' ? [] : ['Ödeme: ' + odeme.durum + (odeme.tarih ? ' · ' + belgeTarihi(odeme.tarih) : ''), 'Yöntem: ' + odeme.yontem]),
      'Kanal: Web sitesi',
    ],
  };
  const bloklar: Blok[] = [];
  if (ayar.satici && tur !== 'paket') {
    bloklar.push({
      baslik: 'Satıcı',
      satirlar: [
        satici.unvan || satici.ad, satici.adres ?? '',
        satici.telefon ? 'Tel: ' + satici.telefon : '', satici.eposta ?? '',
        satici.vergi ? 'VD / VKN: ' + satici.vergi : '', satici.mersis ? 'MERSİS: ' + satici.mersis : '',
      ],
    });
  }
  bloklar.push({ baslik: tur === 'paket' ? 'Alıcı' : 'Alıcı', satirlar: alici }, siparisBlok);
  const b1 = bilgiBloklari(bloklar, y);
  icerik += b1.svg;
  y = b1.y;

  // Teslimat ve fatura adresi
  const adresBloklari: Blok[] = [{
    baslik: 'Teslimat adresi',
    satirlar: [s.musteri.ad + ' ' + s.musteri.soyad, s.teslimat.adres, s.teslimat.ilce + ' / ' + s.teslimat.il, s.teslimat.not ? 'Not: ' + s.teslimat.not : ''],
  }];
  if (tur === 'ozet' && s.fatura.adres) adresBloklari.push({ baslik: 'Fatura adresi', satirlar: [s.fatura.adres] });
  const b2 = bilgiBloklari(adresBloklari, y + 4);
  icerik += b2.svg;
  y = b2.y + 6;

  // 2) Ürün tablosu
  const kolonlar: Kolon[] = tur === 'paket'
    ? [
      { baslik: '', x: K + 6, hiza: 'start', en: 14 },
      { baslik: 'Ürün', x: K + 26, hiza: 'start', en: 300 },
      { baslik: 'SKU', x: K + 340, hiza: 'start', en: 110 },
      { baslik: 'Adet', x: SAG - 8, hiza: 'end', en: 50 },
    ]
    : tur === 'iade'
      ? [
        { baslik: '#', x: K + 6, hiza: 'start', en: 14 },
        { baslik: 'Ürün', x: K + 26, hiza: 'start', en: 270 },
        { baslik: 'SKU', x: K + 302, hiza: 'start', en: 90 },
        { baslik: 'Alınan', x: SAG - 80, hiza: 'end', en: 40 },
        { baslik: 'İade adedi', x: SAG - 8, hiza: 'end', en: 55 },
      ]
      : fiyatli
        ? [
          { baslik: '#', x: K + 6, hiza: 'start', en: 14 },
          { baslik: 'Ürün', x: K + 26, hiza: 'start', en: 220 },
          { baslik: 'SKU', x: K + 252, hiza: 'start', en: 80 },
          { baslik: 'Adet', x: SAG - 170, hiza: 'end', en: 30 },
          { baslik: 'Birim fiyat', x: SAG - 88, hiza: 'end', en: 70 },
          { baslik: 'Tutar', x: SAG - 8, hiza: 'end', en: 70 },
        ]
        : [
          { baslik: '#', x: K + 6, hiza: 'start', en: 14 },
          { baslik: 'Ürün', x: K + 26, hiza: 'start', en: 320 },
          { baslik: 'SKU', x: K + 352, hiza: 'start', en: 90 },
          { baslik: 'Adet', x: SAG - 8, hiza: 'end', en: 40 },
        ];
  const tabloBasligi = () => {
    icerik += kutu(K, y, SAG - K, 20, RENK.baslikZemin);
    for (const k of kolonlar) icerik += yazi(k.baslik, k.x, y + 13.5, { boy: 8.5, kalin: true, renk: RENK.ikincil, hiza: k.hiza });
    y += 20;
  };
  tabloBasligi();
  s.kalemler.forEach((k, i) => {
    const urunKolon = kolonlar[1]!;
    const adSatirlari = sar((k.tip === 'set' ? 'Set: ' : '') + k.ad, urunKolon.en, 9.5);
    const altSatirlar = (tur === 'paket' || tur === 'fis') && k.icerik ? sar(k.icerik, urunKolon.en, 8) : [];
    const kampanyaSatiri = fiyatli && !!k.oncekiBirim && k.oncekiBirim > k.birimFiyat;
    const yukseklik = 8 + Math.max(adSatirlari.length * 12, kampanyaSatiri ? 24 : 0) + altSatirlar.length * 10 + 6;
    if (y + yukseklik > ALT_SINIR) { yeniSayfa(); tabloBasligi(); }
    const ilkSatir = y + 15;
    icerik += yazi(tur === 'paket' ? '' : String(i + 1), kolonlar[0]!.x, ilkSatir, { boy: 9, renk: RENK.ikincil });
    if (tur === 'paket') icerik += kutu(kolonlar[0]!.x - 1, ilkSatir - 9, 10, 10, '#fff', '#8c7f6c', 1.5);
    adSatirlari.forEach((satir, j) => { icerik += yazi(satir, urunKolon.x, ilkSatir + j * 12, { boy: 9.5, kalin: j === 0 && tur === 'paket' }); });
    altSatirlar.forEach((satir, j) => { icerik += yazi(satir, urunKolon.x, ilkSatir + adSatirlari.length * 12 + j * 10, { boy: 8, renk: RENK.ikincil }); });
    icerik += yazi(k.sku ?? '—', kolonlar[2]!.x, ilkSatir, { boy: 8.5, renk: RENK.ikincil });
    if (tur === 'paket') {
      icerik += yazi(String(k.adet), kolonlar[3]!.x, ilkSatir, { boy: 11, kalin: true, hiza: 'end' });
    } else if (tur === 'iade') {
      icerik += yazi(String(k.adet), kolonlar[3]!.x, ilkSatir, { boy: 9.5, hiza: 'end' });
      icerik += kutu(kolonlar[4]!.x - 40, ilkSatir - 11, 40, 15, '#fff', '#b9ad99');
    } else if (fiyatli) {
      icerik += yazi(String(k.adet), kolonlar[3]!.x, ilkSatir, { boy: 9.5, hiza: 'end' });
      icerik += yazi(tl(k.birimFiyat), kolonlar[4]!.x, ilkSatir, { boy: 9.5, hiza: 'end' });
      icerik += yazi(tl(k.birimFiyat * k.adet), kolonlar[5]!.x, ilkSatir, { boy: 9.5, hiza: 'end' });
      if (kampanyaSatiri) {
        icerik += yazi('Kampanya öncesi ' + tl(k.oncekiBirim!), kolonlar[4]!.x, ilkSatir + 12, { boy: 7.5, hiza: 'end', renk: RENK.ikincil });
      }
    } else {
      icerik += yazi(String(k.adet), kolonlar[3]!.x, ilkSatir, { boy: 9.5, hiza: 'end' });
    }
    y += yukseklik;
    icerik += cizgi(K, y, SAG, y);
  });
  y += 10;

  // 3) Toplamlar
  if (fiyatli) {
    const satirToplami = s.kalemler.reduce((t, k) => t + k.birimFiyat * k.adet, 0);
    const satirlar: [string, string, boolean?][] = [['Ürünler', tl(satirToplami)]];
    if (s.sepetIndirimi > 0) satirlar.push(['Sepet indirimi', '−' + tl(s.sepetIndirimi)]);
    satirlar.push(['Kargo', s.kargo ? tl(s.kargo) : 'Ücretsiz']);
    satirlar.push(['Genel toplam (KDV dahil)', tl(s.toplam), true]);
    const gerekli = satirlar.length * 16 + 30;
    if (y + gerekli > ALT_SINIR) yeniSayfa();
    const x1 = SAG - 230;
    for (const [ad, deger, kalin] of satirlar) {
      if (kalin) { icerik += kutu(x1 - 8, y - 2, SAG - x1 + 8, 20, RENK.baslikZemin); y += 2; }
      icerik += yazi(ad, x1, y + 11, { boy: kalin ? 10.5 : 9.5, kalin });
      icerik += yazi(deger, SAG - 8, y + 11, { boy: kalin ? 10.5 : 9.5, kalin, hiza: 'end' });
      y += kalin ? 20 : 16;
    }
    const avantaj = s.setIndirimi + s.kampanyaIndirimi;
    if (avantaj > 0) {
      icerik += yazi('Birim fiyatlara yansıyan set / kampanya avantajı: ' + tl(avantaj), SAG - 8, y + 10, { boy: 7.5, hiza: 'end', renk: RENK.ikincil });
      y += 14;
    }
    y += 6;
  } else if (tur === 'paket') {
    const toplamAdet = s.kalemler.reduce((t, k) => t + k.adet, 0);
    icerik += yazi('Toplam ' + toplamAdet + ' adet · ' + s.kalemler.length + ' kalem', SAG - 8, y + 6, { boy: 10, kalin: true, hiza: 'end' });
    y += 22;
  }

  // 4) Türe özel bölüm
  if (tur === 'iade') {
    if (y + 160 > ALT_SINIR) yeniSayfa();
    icerik += yazi('İade nedeni (işaretleyiniz):', K, y + 10, { boy: 9.5, kalin: true });
    y += 24;
    icerik += secenekler(['Vazgeçtim', 'Ürün hasarlı / kusurlu', 'Yanlış ürün gönderildi', 'Diğer'], K, y);
    y += 12;
    const bolum = [
      '',
      'Açıklama: ____________________________________________________________________________',
      '______________________________________________________________________________________',
      '',
      'Geri ödeme, ödemenin yapıldığı karta veya hesaba yapılır.',
      '',
      'Tarih: ____ / ____ / ________          Ad Soyad: ______________________          İmza: ______________',
    ];
    for (const satir of bolum) { icerik += yazi(satir, K, y + 10, { boy: 9.5 }); y += 15; }
    y += 12;
  }
  if (tur === 'paket') {
    if (y + 50 > ALT_SINIR) yeniSayfa();
    icerik += secenekler(['Ürünler kontrol edildi', 'Hasar / eksik yok', 'Fiş pakete kondu', 'Paket kapatıldı'], K, y + 10, 9);
    y += 22;
    icerik += yazi('Hazırlayan: ______________________     Tarih / saat: ____________________', K, y + 10, { boy: 9.5 });
    y += 22;
  }

  // 5) Notlar
  const notlar = [ayar.notlar[tur], g.not].map((x) => x?.trim()).filter(Boolean) as string[];
  if (notlar.length) {
    const satirlar = notlar.flatMap((n) => sar(n, SAG - K - 20, 9.5));
    const yuk = satirlar.length * 13 + 22;
    if (y + yuk > ALT_SINIR) yeniSayfa();
    icerik += kutu(K, y, SAG - K, yuk, '#fcfaf4', RENK.cizgi);
    icerik += yazi('Not', K + 10, y + 14, { boy: 7.5, kalin: true, renk: RENK.altin });
    satirlar.forEach((satir, i) => { icerik += yazi(satir, K + 10, y + 28 + i * 13, { boy: 9.5 }); });
    y += yuk + 10;
  }
  sayfaBitir();

  // 6) Alt bilgi, barkod ve sayfa numarası her sayfaya
  const yasalNot = tur === 'paket' ? 'Mağaza içi hazırlık belgesidir.'
    : tur === 'iade' ? 'İade talebi kaydı içindir. Resmî fatura yerine geçmez.'
      : 'Bilgilendirme amaçlıdır; resmî fatura (e-Fatura / e-Arşiv) yerine geçmez. Fiyatlara KDV dahildir.';
  const web = [satici.web, satici.telefon].filter(Boolean).join(' · ');
  return sayfalar.map((svg, i) => {
    let alt = cizgi(K, A4.h - 92, SAG, A4.h - 92);
    if (ayar.barkod) alt += barkodSvg(s.no, K - 10, A4.h - 84, 170, 30);
    alt += yazi(yasalNot, SAG, A4.h - 76, { boy: 7.5, hiza: 'end', renk: RENK.ikincil });
    if (web) alt += yazi(web, SAG, A4.h - 64, { boy: 7.5, hiza: 'end', renk: RENK.ikincil });
    alt += yazi(g.belgeNo + ' · Sayfa ' + (i + 1) + ' / ' + sayfalar.length, SAG, A4.h - 30, { boy: 7.5, hiza: 'end', renk: RENK.ikincil });
    if (g.onizleme) {
      alt += yaziYoluSvg('ÖNİZLEME', A4.w / 2, A4.h / 2, {
        boy: 74,
        kalin: true,
        renk: '#ad8a45',
        hiza: 'middle',
        opaklik: 0.12,
        donus: 'rotate(-30 ' + A4.w / 2 + ' ' + A4.h / 2 + ')',
      });
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + A4.w + '" height="' + A4.h + '" viewBox="0 0 ' + A4.w + ' ' + A4.h + '">' + svg + alt + '</svg>';
  });
}

/* ---------------- Dönem (ay) özeti: muhasebeci ve sahibi için tek sayfa ---------------- */
export type OzetSatiri = { ad: string; tutar?: string; tur?: 'arti' | 'eksi' | 'ara' | 'sonuc' | 'alt' | 'baslik' };
export type DonemOzeti = {
  baslik: string; donem: string; olusturma: Date; logo: string; satici: SaticiBilgisi;
  satirlar: OzetSatiri[];
  tablo?: { baslik: string; kolonlar: string[]; satirlar: string[][] };
  notlar: string[];
};

export function donemOzetiSvg(o: DonemOzeti): string[] {
  const sayfalar: string[] = [];
  let icerik = '';
  let y = 0;
  const ust = () => {
    let svg = kutu(0, 0, A4.w, A4.h, '#fff', 'none', 0);
    svg += o.logo ? '<image href="' + o.logo + '" x="' + K + '" y="26" width="150" height="44" preserveAspectRatio="xMinYMid meet"/>' : yazi(o.satici.ad, K, 54, { boy: 16, kalin: true });
    svg += yazi(o.baslik.toLocaleUpperCase('tr'), SAG, 44, { boy: 15, kalin: true, hiza: 'end' });
    svg += yazi('Dönem: ' + o.donem, SAG, 60, { boy: 9, hiza: 'end', renk: RENK.ikincil });
    svg += yazi('Hazırlanma: ' + belgeTarihi(o.olusturma), SAG, 72, { boy: 9, hiza: 'end', renk: RENK.ikincil });
    svg += cizgi(K, 86, SAG, 86, RENK.altin, 1.6);
    return svg;
  };
  const yeni = () => { sayfalar.push(icerik); icerik = ust(); y = 110; };
  icerik = ust();
  y = 110;
  if (o.satici.unvan || o.satici.vergi) {
    icerik += yazi([o.satici.unvan, o.satici.vergi && 'VD / VKN: ' + o.satici.vergi].filter(Boolean).join(' · '), K, y, { boy: 9, renk: RENK.ikincil });
    y += 20;
  }
  for (const s of o.satirlar) {
    if (y > ALT_SINIR) yeni();
    if (s.tur === 'baslik') { y += 6; icerik += yazi(s.ad.toLocaleUpperCase('tr'), K, y + 10, { boy: 8, kalin: true, renk: RENK.altin }); y += 18; continue; }
    const kalin = s.tur === 'sonuc' || s.tur === 'ara';
    if (s.tur === 'sonuc') { icerik += kutu(K, y, SAG - K, 24, RENK.baslikZemin); y += 3; }
    const x = s.tur === 'alt' ? K + 16 : K + 8;
    icerik += yazi(s.ad, x, y + 13, { boy: s.tur === 'alt' ? 9 : s.tur === 'sonuc' ? 11.5 : 10, kalin, renk: s.tur === 'alt' ? RENK.ikincil : RENK.yazi });
    if (s.tutar) icerik += yazi(s.tutar, SAG - 8, y + 13, { boy: s.tur === 'alt' ? 9 : s.tur === 'sonuc' ? 11.5 : 10, kalin, hiza: 'end', renk: s.tur === 'alt' ? RENK.ikincil : RENK.yazi });
    y += s.tur === 'sonuc' ? 24 : 19;
    if (s.tur !== 'sonuc') icerik += cizgi(K, y, SAG, y);
  }
  if (o.tablo && o.tablo.satirlar.length) {
    y += 18;
    if (y + 60 > ALT_SINIR) yeni();
    icerik += yazi(o.tablo.baslik.toLocaleUpperCase('tr'), K, y + 10, { boy: 8, kalin: true, renk: RENK.altin });
    y += 18;
    const n = o.tablo.kolonlar.length;
    const ilkEn = 150;
    const en = (SAG - K - ilkEn) / (n - 1);
    const kx = (i: number) => i === 0 ? K + 6 : K + ilkEn + en * i - 6;
    const baslik = () => {
      icerik += kutu(K, y, SAG - K, 20, RENK.baslikZemin);
      o.tablo!.kolonlar.forEach((k, i) => { icerik += yazi(k, kx(i), y + 13.5, { boy: 8, kalin: true, renk: RENK.ikincil, hiza: i ? 'end' : 'start' }); });
      y += 20;
    };
    baslik();
    for (const satir of o.tablo.satirlar) {
      if (y + 18 > ALT_SINIR) { yeni(); baslik(); }
      satir.forEach((h, i) => { icerik += yazi(h, kx(i), y + 13, { boy: 8.5, hiza: i ? 'end' : 'start' }); });
      y += 18;
      icerik += cizgi(K, y, SAG, y);
    }
  }
  if (o.notlar.length) {
    y += 16;
    for (const n of o.notlar.flatMap((x) => sar(x, SAG - K, 8.5))) {
      if (y > ALT_SINIR) yeni();
      icerik += yazi(n, K, y + 10, { boy: 8.5, renk: RENK.ikincil });
      y += 12;
    }
  }
  sayfalar.push(icerik);
  return sayfalar.map((svg, i) => '<svg xmlns="http://www.w3.org/2000/svg" width="' + A4.w + '" height="' + A4.h + '" viewBox="0 0 ' + A4.w + ' ' + A4.h + '">' + svg +
    cizgi(K, A4.h - 50, SAG, A4.h - 50) + yazi('Yönetim raporudur; resmî mali tablo değildir.', K, A4.h - 34, { boy: 7.5, renk: RENK.ikincil }) +
    yazi('Sayfa ' + (i + 1) + ' / ' + sayfalar.length, SAG, A4.h - 34, { boy: 7.5, hiza: 'end', renk: RENK.ikincil }) + '</svg>');
}
