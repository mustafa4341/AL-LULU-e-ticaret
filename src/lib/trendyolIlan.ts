/**
 * Sitedeki ürün kartı → Trendyol ürün isteği (createProducts V2).
 * Ürünün sitedeki bilgileri tek kaynaktır; panelde yalnız Trendyol'a özel alanlar (kategori, marka, özellikler, desi) tutulur.
 */
import { kanalHedefFiyati, type KanalAyari, type KanalIlanTaslagi } from './pazaryeri';
import type { Urun } from './sema';
import type { TyOzellik, TyUrunIstegi } from './trendyolApi';
import { markaliUrunAdi, urunGtin } from './urunKimlik';

export const SITE_ADRESI = 'https://alluluhome.com';
/** HTML kaçışı; sitedeki "başlık|alt metin" ayracı satır sonuna çevrilir */
const kacis = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
  .split('|').map((x) => x.trim()).filter(Boolean).join('<br>');

/** Türkçe 'ı/İ/ğ/ü/ş/ö/ç' karakterlerini kaybetmeden ASCII karşılaştırma anahtarına çevirir */
export const sade = (s: string) => s
  .toLocaleLowerCase('tr')
  .replace(/ı/g, 'i')
  .replace(/ğ/g, 'g')
  .replace(/ü/g, 'u')
  .replace(/ş/g, 's')
  .replace(/ö/g, 'o')
  .replace(/ç/g, 'c')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9.,]+/g, ' ')
  .trim();

/** Ürün için ilk taslak: barkod, stok kodu, başlık ve tahmini desi sitedeki karttan. */
export function ilanVarsayilani(u: Urun, desi?: number): KanalIlanTaslagi {
  const kod = (u.sku || u.id).slice(0, 40);
  return {
    durum: 'taslak',
    barkod: urunGtin(u) ?? '',
    stokKodu: (u.sku || u.id).slice(0, 100),
    anaKod: kod,
    baslik: markaliUrunAdi(u).slice(0, 100),
    ozellikler: [],
    kdv: 20,
    desi: desi ?? tahminiDesi(u),
    mesajlar: [],
  };
}

/** Sitede desi girilmemişse ürün tipinden makul başlangıç desisi üretir (kullanıcı formdan değiştirebilir). */
export function tahminiDesi(u: Urun): number {
  for (const [k, d] of u.teknik) {
    if (/desi/i.test(k)) {
      const n = Number(d.replace(',', '.').match(/\d+(?:\.\d+)?/)?.[0]);
      if (n > 0 && n <= 200) return n;
    }
  }
  const metin = sade(`${u.ad} ${u.kisaAd}`);
  if (/\bset\b|\btakim\b|\b8 parca\b|\b10 parca\b|\b12 parca\b/.test(metin)) return 10;
  if (/duduklu/.test(metin)) return 6;
  if (/tencere|caydanlik/.test(metin)) return 5;
  if (/tava|sahan|wok/.test(metin)) return 3;
  if (/bicak|catal|kasik|aksesuar|kapak|conta/.test(metin)) return 2;
  return 4;
}

/** Ürün adından otomatik kategori arama terimi çıkarır (ör. "Vitaquick 6 L Düdüklü Tencere" → "Düdüklü Tencere") */
export function kategoriAramaTerimi(u: Urun): string {
  const metin = sade(`${u.ad} ${u.kisaAd} ${u.ozet}`);
  const kaliplar: [RegExp, string][] = [
    [/duduklu\s+tencere\s+set/, 'Düdüklü Tencere Seti'],
    [/duduklu/, 'Düdüklü Tencere'],
    [/tencere\s+set|tencere\s+takim/, 'Tencere Seti'],
    [/wok/, 'Wok Tava'],
    [/krep/, 'Krep Tavası'],
    [/izgara\s+tava|grill/, 'Izgara Tava'],
    [/sahan/, 'Sahan'],
    [/tava/, 'Tava'],
    [/tencere/, 'Tencere'],
    [/caydanlik/, 'Çaydanlık'],
    [/cezve/, 'Cezve'],
    [/bicak\s+set/, 'Bıçak Seti'],
    [/bicak/, 'Mutfak Bıçağı'],
    [/catal\s+kasik|yemek\s+takim/, 'Çatal Kaşık Bıçak Takımı'],
    [/saklama\s+kab/, 'Saklama Kabı'],
    [/termos/, 'Termos'],
    [/suzgec|kevgir/, 'Süzgeç'],
  ];
  for (const [re, terim] of kaliplar) if (re.test(metin)) return terim;
  const kelimeler = u.kisaAd.replace(/[®™]/g, '').trim().split(/\s+/).filter((w) => w.length > 2 && !/^\d/.test(w));
  return kelimeler.slice(-2).join(' ') || u.kisaAd.slice(0, 30);
}

/** Trendyol açıklaması: özet, öne çıkanlar, teknik özellik tablosu, kutu içeriği, garanti (HTML, en fazla 30.000 karakter). */
export function ilanAciklamasi(u: Urun): string {
  const p: string[] = [];
  if (u.ozet) p.push(`<p>${kacis(u.ozet)}</p>`);
  if (u.oneCikanBilgiler.length) p.push('<ul>' + u.oneCikanBilgiler.map((b) => `<li>${kacis(b.metin)}</li>`).join('') + '</ul>');
  for (const f of u.faydalar.slice(0, 6)) p.push(`<p><strong>${kacis(f.baslik)}</strong><br>${kacis(f.metin)}</p>`);
  const teknik = u.teknik.filter(([e]) => !/barkod|ean|gtin/i.test(e));
  if (teknik.length) p.push('<p><strong>Teknik özellikler</strong></p><table>' + teknik.map(([e, d]) => `<tr><td>${kacis(e)}</td><td>${kacis(d)}</td></tr>`).join('') + '</table>');
  if (u.kutuIcerigi.length) p.push('<p><strong>Kutu içeriği</strong></p><ul>' + u.kutuIcerigi.map((x) => `<li>${kacis(x)}</li>`).join('') + '</ul>');
  if (u.garanti) p.push(`<p><strong>Garanti:</strong> ${kacis(u.garanti)}</p>`);
  return (p.join('') || `<p>${kacis(markaliUrunAdi(u))}</p>`).slice(0, 30000);
}

/** Ürün görselleri → herkese açık JPG adresleri (Trendyol en fazla 8 görsel). */
export function ilanGorselleri(u: Urun): string[] {
  return u.gorseller.slice(0, 8).map((g) => {
    const src = g.src.trim();
    if (/^https?:\/\//i.test(src)) return src;
    const yol = src.replace(/^\/+/, '');
    return /^(?:img|medya)\//.test(yol) ? `${SITE_ADRESI}/jpg/${yol.replace(/\.(?:webp|png|jpe?g)$/i, '')}.jpg` : `${SITE_ADRESI}/${yol}`;
  });
}

/** Trendyol hedef satış fiyatı: ürüne özel fiyat veya kanal kuralı varsa onu, yoksa sitedeki son fiyatı döndürür. */
export const ilanFiyati = (u: Urun, k?: Pick<KanalAyari, 'fiyatKurali' | 'urunler' | 'ilanlar'>, t?: Pick<KanalIlanTaslagi, 'fiyat'>) => {
  if (t?.fiyat !== undefined && t.fiyat > 0) return Math.round(t.fiyat * 100) / 100;
  return kanalHedefFiyati(u, k).hedef;
};

function secenekBul(o: TyOzellik, adaylar: string[]): TyOzellik['degerler'][number] | undefined {
  const temizAdaylar = adaylar.map(sade).filter(Boolean);
  for (const a of temizAdaylar) {
    const tam = o.degerler.find((d) => sade(d.ad) === a);
    if (tam) return tam;
  }
  const sirali = [...o.degerler].sort((x, y) => y.ad.length - x.ad.length);
  for (const a of temizAdaylar) {
    if (a.length < 3) continue;
    // Önce en uzun/spesifik seçenek eşleşsin (ör. "Düdüklü Tencere" > "Tencere"); 2 harfli ülke/birim kodları kısmi eşleşmeye girmez.
    const kapsayan = sirali.find((d) => {
      const sd = sade(d.ad);
      return sd.length >= 3 && (a.includes(sd) || sd.includes(a));
    });
    if (kapsayan) return kapsayan;
  }
  return undefined;
}

/**
 * Sitedeki ürün kartından (teknik tablo, başlık, özet, garanti, kutu içeriği, marka) Trendyol kategori özelliklerini
 * akıllıca eşleştirir. Özellikle mutfak/pişirme kategorilerindeki zorunlu alanları (Dış/İç Materyal, Garanti Tipi,
 * Menşei, Parça Sayısı, Ürün Tipi, Özellik, Boyut/Hacim) otomatik doldurur.
 */
export function ozellikOnerileri(u: Urun, ozellikler: TyOzellik[]): KanalIlanTaslagi['ozellikler'] {
  const teknik = new Map(u.teknik.map(([e, d]) => [sade(e), d]));
  const tumMetin = sade([
    u.marka, u.ad, u.kisaAd, u.ozet, u.garanti ?? '',
    ...u.oneCikanBilgiler.map((b) => b.metin),
    ...u.kutuIcerigi,
    ...u.teknik.flat(),
  ].join(' '));

  const malzemeAdaylari: string[] = [];
  for (const [k, d] of teknik) {
    if (/malzeme|materyal|govde|kaplama|yuzey/.test(k)) malzemeAdaylari.push(d);
  }
  if (/paslanmaz\s*celik|18\s*10|cromargan|celik|inox/.test(tumMetin)) malzemeAdaylari.push('Çelik', 'Paslanmaz Çelik');
  if (/granit/.test(tumMetin)) malzemeAdaylari.push('Granit');
  if (/dokum|demir\s*dokum/.test(tumMetin)) malzemeAdaylari.push('Döküm', 'Demir Döküm');
  if (/titanyum/.test(tumMetin)) malzemeAdaylari.push('Titanyum');
  if (/aluminyum/.test(tumMetin)) malzemeAdaylari.push('Alüminyum');
  if (/seramik/.test(tumMetin)) malzemeAdaylari.push('Seramik');
  if (/porselen/.test(tumMetin)) malzemeAdaylari.push('Porselen');
  if (/emaye/.test(tumMetin)) malzemeAdaylari.push('Emaye');
  if (/bakir/.test(tumMetin)) malzemeAdaylari.push('Bakır');
  if (/teflon|ptfe/.test(tumMetin)) malzemeAdaylari.push('Teflon', 'PTFE');
  if (/\bcam\b/.test(tumMetin) && !/cam\s*kapak/.test(tumMetin)) malzemeAdaylari.push('Cam');

  const menseHaritasi: [RegExp, string[]][] = [
    [/almanya|germany|\bde\b|fissler|wmf|zwilling|silit/, ['DE', 'Almanya']],
    [/fransa|france|\bfr\b|tefal|staub|le creuset/, ['FR', 'Fransa']],
    [/italya|italy|\bit\b|ballarini|lagostina/, ['IT', 'İtalya']],
    [/isvicre|switzerland|\bch\b|victorinox|kuhn rikon/, ['CH', 'İsviçre']],
    [/turkiye|\btr\b|karaca|korkmaz|emsan|hisar|aryildiz|lava/, ['TR', 'Türkiye']],
    [/cin|china|\bcn\b/, ['CN', 'Çin']],
  ];

  const sonuc: KanalIlanTaslagi['ozellikler'] = [];
  const ekle = (o: TyOzellik, eslesen?: TyOzellik['degerler'][number], ozel?: string) => {
    if (eslesen) sonuc.push({ attributeId: o.id, ad: o.ad, attributeValueIds: [eslesen.id], degerAdi: eslesen.ad });
    else if (ozel && o.ozelDeger) sonuc.push({ attributeId: o.id, ad: o.ad, attributeValue: ozel.slice(0, 400) });
  };

  for (const o of ozellikler) {
    const ad = sade(o.ad);

    // 1. Doğrudan teknik tablo eşleşmesi
    const dogrudan = teknik.get(ad);
    if (dogrudan) {
      const b = secenekBul(o, [dogrudan]);
      if (b || o.ozelDeger) { ekle(o, b, dogrudan); continue; }
    }

    // 2. Dış Materyal / İç Materyal / Materyal
    if (/materyal|malzeme/.test(ad)) {
      const ozelAlan = /ic\s*materyal/.test(ad)
        ? [...teknik].find(([k]) => /ic\s*(yuzey|kaplama|materyal|malzeme)/.test(k))?.[1]
        : /dis\s*materyal/.test(ad)
          ? [...teknik].find(([k]) => /dis\s*(yuzey|kaplama|materyal|malzeme)|govde/.test(k))?.[1]
          : undefined;
      const havuz = [...(ozelAlan ? [ozelAlan] : []), ...malzemeAdaylari, ...(o.zorunlu && !malzemeAdaylari.length ? ['Çelik', 'Paslanmaz Çelik', 'Metal'] : [])];
      const b = secenekBul(o, havuz);
      if (b || (havuz[0] && o.ozelDeger)) { ekle(o, b, ozelAlan ?? havuz[0]); continue; }
    }

    // 3. Garanti Tipi & Garanti Süresi
    if (/garanti\s*tip/.test(ad)) {
      const adaylar = /ithalat/.test(tumMetin)
        ? ['İthalatçı Garantili', 'Resmi Distribütör Garantili', 'Üretici Garantili']
        : ['Resmi Distribütör Garantili', 'İthalatçı Garantili', 'Üretici Garantili'];
      const b = secenekBul(o, adaylar);
      if (b) { ekle(o, b); continue; }
    }
    if (/garanti\s*sure/.test(ad)) {
      const yil = (u.garanti ?? teknik.get('garanti suresi') ?? teknik.get('garanti') ?? '').match(/(\d+)\s*y[iı]l/i)?.[1] ?? '2';
      const b = secenekBul(o, [`${yil} Yıl`, `${yil} Yil`, '2 Yıl']);
      if (b) { ekle(o, b); continue; }
    }

    // 4. Menşei
    if (/mense/.test(ad)) {
      const tekMense = [...teknik].find(([k]) => /mense|uretim\s*(yeri|ulkesi)|ulke/.test(k))?.[1];
      const kaynak = sade(tekMense ? `${tekMense} ${u.marka}` : `${u.marka} ${u.ozet}`);
      const adaylar: string[] = [];
      for (const [re, kodlar] of menseHaritasi) if (re.test(kaynak)) adaylar.push(...kodlar);
      if (tekMense) adaylar.push(tekMense);
      if (!adaylar.length) adaylar.push('DE', 'Almanya', 'TR', 'Türkiye');
      const b = secenekBul(o, adaylar);
      if (b || (tekMense && o.ozelDeger)) { ekle(o, b, tekMense); continue; }
    }

    // 5. Parça Sayısı
    if (/parca\s*sayis/.test(ad)) {
      const tekParca = [...teknik].find(([k]) => /parca/.test(k))?.[1];
      const basliktan = `${u.ad} ${u.kisaAd}`.match(/(\d+)\s*par[cç]a/i)?.[1]
        ?? `${u.ad} ${u.kisaAd}`.match(/(\d+)\s*['’]?\s*l[iıuü]\s*(?:set|tak[iı]m)/i)?.[1];
      const sayi = tekParca?.match(/\d+/)?.[0] ?? basliktan;
      const tekGibi = /tava|sahan|wok|bicak|kevgir|suzgec/.test(tumMetin) && !/\bset\b|\btakim\b|kapakli/.test(tumMetin);
      const adaylar = sayi
        ? [`${sayi} Parça`, sayi, ...(sayi === '1' ? ['Tek Parça'] : [])]
        : tekGibi
          ? ['Tek Parça', '1 Parça', '1', '2 Parça', '2']
          : ['2 Parça', 'Tek Parça', '1 Parça', '2', '1'];
      const b = secenekBul(o, adaylar);
      if (b || o.ozelDeger) { ekle(o, b, sayi ? `${sayi} Parça` : tekGibi ? 'Tek Parça' : '2 Parça'); continue; }
    }

    // 6. Ürün Tipi / Türü
    if (/urun\s*tip|urun\s*tur|\btip\b|\bturu\b/.test(ad)) {
      const adaylar: string[] = [];
      if (/duduklu/.test(tumMetin)) adaylar.push('Düdüklü Tencere');
      if (/wok/.test(tumMetin)) adaylar.push('Wok Tava', 'Tava');
      if (/krep/.test(tumMetin)) adaylar.push('Krep Tavası', 'Tava');
      if (/izgara\s*tava|grill/.test(tumMetin)) adaylar.push('Izgara Tava', 'Tava');
      if (/sahan/.test(tumMetin)) adaylar.push('Sahan');
      if (/sos\s*tencere|sutluk/.test(tumMetin)) adaylar.push('Sos Tenceresi', 'Sütlük', 'Tencere');
      if (/kizartma\s*tava|\btava\b/.test(tumMetin)) adaylar.push(/set|takim/.test(tumMetin) ? 'Tava Seti' : 'Kızartma Tavası', 'Tava', 'Tek Tava');
      if (/basik\s*tencere|karniyarik/.test(tumMetin)) adaylar.push('Basık Tencere', 'Karnıyarık Tenceresi', 'Tencere');
      if (/derin\s*tencere|\btencere\b/.test(tumMetin)) adaylar.push(/set|takim/.test(tumMetin) ? 'Tencere Seti' : 'Derin Tencere', 'Çelik Tencere', 'Tencere', 'Tek Tencere');
      if (/set|takim/.test(tumMetin)) adaylar.push('Tencere Seti', 'Set');
      adaylar.push(u.kisaAd, u.ad, 'Standart', 'Klasik');
      const b = secenekBul(o, adaylar);
      if (b) { ekle(o, b); continue; }
    }

    // 7. Özellik (İndüksiyon, Bulaşık Makinesi, Yapışmaz vb.)
    if (ad === 'ozellik' || /urun\s*ozelligi|ek\s*ozellik/.test(ad)) {
      const adaylar: string[] = [];
      if (/induksiyon/.test(tumMetin)) adaylar.push('İndüksiyon Ocaklarla Uyumlu', 'İndüksiyon Uyumlu', 'İndüksiyonda Kullanılabilir', 'İndüksiyon');
      if (/bulasik\s*makine/.test(tumMetin)) adaylar.push('Bulaşık Makinesinde Yıkanabilir');
      if (/yapismaz/.test(tumMetin)) adaylar.push('Yanmaz Yapışmaz', 'Yapışmaz Taban');
      if (/firin/.test(tumMetin)) adaylar.push('Fırında Kullanılabilir');
      if (/cam\s*kapak/.test(tumMetin)) adaylar.push('Cam Kapaklı', 'Kapaklı');
      if (/pfoa/.test(tumMetin)) adaylar.push('PFOA İçermez');
      if (/bpa/.test(tumMetin)) adaylar.push('BPA İçermez');
      adaylar.push('İndüksiyon Ocaklarla Uyumlu', 'Bulaşık Makinesinde Yıkanabilir', 'Kapaklı', 'Standart', 'Diğer', 'Yok');
      const b = secenekBul(o, adaylar);
      if (b) { ekle(o, b); continue; }
    }

    // 8. Çap / Boyut / Ebat (cm)
    if (/boyut|ebat|\bcap\b|olcu/.test(ad)) {
      const cm = (`${u.ad} ${u.kisaAd} ` + [...teknik.values()].join(' ')).match(/(\d{2})\s*cm/i)?.[1];
      if (cm) {
        const b = secenekBul(o, [`${cm} cm`, `${cm}cm`, `${cm} x ${cm}`, cm]);
        if (b || o.ozelDeger) { ekle(o, b, `${cm} cm`); continue; }
      }
    }

    // 9. Hacim / Kapasite (Litre)
    if (/hacim|kapasite|litre/.test(ad)) {
      const m = (`${u.ad} ${u.kisaAd} ` + [...teknik.values()].join(' ')).match(/(\d+(?:[.,]\d+)?)\s*(?:l|lt|litre)\b/i);
      if (m) {
        const trSayi = m[1]!.replace('.', ',');
        const noktaSayi = m[1]!.replace(',', '.');
        const tam = Math.floor(Number(noktaSayi));
        const b = secenekBul(o, [`${trSayi} L`, `${trSayi} lt`, `${noktaSayi} L`, `${tam} L`, `${tam}+ L`]);
        if (b || o.ozelDeger) { ekle(o, b, `${trSayi} L`); continue; }
      }
    }

    // 10. Renk
    if (/renk/.test(ad)) {
      const tekRenk = teknik.get('renk');
      const adaylar = [
        ...(tekRenk ? [tekRenk] : []),
        ...(/siyah/.test(tumMetin) ? ['Siyah'] : []),
        ...(/kirmizi|bordo/.test(tumMetin) ? ['Kırmızı'] : []),
        ...(/krem|bej/.test(tumMetin) ? ['Krem', 'Bej'] : []),
        ...(/celik|inox|cromargan|metal/.test(tumMetin) ? ['Gri', 'Gümüş', 'Metalik', 'Inox', 'Çok Renkli'] : ['Gri', 'Siyah']),
      ];
      const b = secenekBul(o, adaylar);
      if (b) { ekle(o, b); continue; }
    }
  }
  return sonuc;
}

/** Kayıtlı taslakta boş kalmış özellikleri önerilerle tamamlar (kullanıcının elle seçtiği değerleri asla ezmez). */
export function ozellikleriTamamla(
  mevcut: KanalIlanTaslagi['ozellikler'],
  oneriler: KanalIlanTaslagi['ozellikler'],
): { birlesik: KanalIlanTaslagi['ozellikler']; otomatikIdler: Set<number> } {
  const dolu = new Set(mevcut.filter((x) => x.attributeValueIds?.length || x.attributeValue).map((x) => x.attributeId));
  const otomatikIdler = new Set<number>();
  const birlesik = [...mevcut.filter((x) => dolu.has(x.attributeId))];
  for (const oneri of oneriler) {
    if (dolu.has(oneri.attributeId)) continue;
    birlesik.push(oneri);
    otomatikIdler.add(oneri.attributeId);
  }
  return { birlesik, otomatikIdler };
}

export type IlanHazirlik = { istek?: TyUrunIstegi; eksikler: string[] };

export function ilanIstegi(
  u: Urun, t: KanalIlanTaslagi, _k: KanalAyari, stok: number, ozellikler: TyOzellik[] | undefined,
  adres: { sevkiyat?: number; iade?: number },
): IlanHazirlik {
  const eksikler: string[] = [];
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(t.barkod)) eksikler.push('barkod (kutudaki 13 haneli EAN; en fazla 40 harf/rakam)');
  if (!t.stokKodu) eksikler.push('stok kodu');
  if (!t.anaKod) eksikler.push('ana ürün kodu');
  if (!t.baslik) eksikler.push('başlık');
  if (!t.kategoriId) eksikler.push('Trendyol kategorisi');
  if (!t.markaId) eksikler.push('Trendyol markası');
  if (t.desi === undefined || t.desi <= 0) eksikler.push('desi');
  const gorseller = ilanGorselleri(u);
  if (!gorseller.length) eksikler.push('en az bir ürün görseli');
  if (!ozellikler) eksikler.push('kategori özellikleri (kategori seçip sayfayı yenileyin)');
  for (const o of ozellikler ?? []) {
    if (!o.zorunlu) continue;
    const g = t.ozellikler.find((x) => x.attributeId === o.id);
    if (!g || (!g.attributeValueIds?.length && !g.attributeValue)) eksikler.push(`“${o.ad}” özelliği`);
  }
  const fiyat = ilanFiyati(u, _k, t);
  if (!(fiyat > 0)) eksikler.push('satış fiyatı');
  if (eksikler.length) return { eksikler };
  return {
    eksikler,
    istek: {
      barcode: t.barkod, title: t.baslik, productMainId: t.anaKod, brandId: t.markaId!, categoryId: t.kategoriId!,
      quantity: Math.max(0, Math.min(20_000, stok)), stockCode: t.stokKodu, dimensionalWeight: t.desi!,
      description: ilanAciklamasi(u),
      // Üstü çizili fiyat her kanalın kendi önceki fiyatına dayanmalı (Ticari Reklam Yön. m.14/5):
      // liste fiyatı satış fiyatıyla aynı gönderilir; sitedeki indirim düşük satış fiyatı olarak yansır.
      listPrice: fiyat, salePrice: fiyat, vatRate: t.kdv,
      images: gorseller.map((url) => ({ url })),
      attributes: t.ozellikler
        .filter((o) => (ozellikler ?? []).some((x) => x.id === o.attributeId) && (o.attributeValueIds?.length || o.attributeValue))
        .map((o) => o.attributeValueIds?.length ? { attributeId: o.attributeId, attributeValueIds: o.attributeValueIds } : { attributeId: o.attributeId, attributeValue: o.attributeValue }),
      ...(adres.sevkiyat ? { shipmentAddressId: adres.sevkiyat } : {}),
      ...(adres.iade ? { returningAddressId: adres.iade } : {}),
    },
  };
}
