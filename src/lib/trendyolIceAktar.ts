/**
 * Trendyol ilanlarını sitedeki ürünlerle buluşturma: listeleme, tek tek bağlama ve sitede olmayan ilanı
 * TASLAK ürün olarak siteye çekme (24.11.2026).
 *
 *  • Çekilen ürün taslaktır ve "!" kontrol notu taşır: ad, açıklama, kategori ve fiyat gözden geçirilmeden yayına alınamaz.
 *  • Görseller Trendyol'un görsel sunucusundan indirilip sitenin kendi medya deposuna WebP olarak kaydedilir.
 *  • İlan aynı anda ürüne bağlanır: stok ortaktır (depodaki adet), Trendyol fiyatına dokunulmaz (fiyat takibi kapalı).
 */
import { DogrulamaHatasi, gorselKaydet, gorselSil, magazaGuncelle, magazaOku } from './depo';
import { benzersizKod } from './form';
import { kodNormal } from './pazaryeri';
import { PazaryeriApiHatasi } from './pazaryeriApi';
import { envanterAyarlariGuncelle, envanterAyarlariOku } from './pazaryeriDepo';
import { trendyolIlanlariniEsle, type IlanEslesmesi } from './kanalFiyat';
import { BOS_URUN } from './yonetimUrun';
import { fiyatUygula } from './urunIslem';
import { tyIlanStokSifirla, tyOnayliIcerikler, type TyIcerik } from './trendyolApi';
import { gtinGecerli } from './urunKimlik';
import type { Urun } from './sema';

export type TyKatalogSatiri = TyIcerik & Pick<IlanEslesmesi, 'urunId' | 'urunAdi' | 'siteFiyat' | 'not' | 'cift' | 'bagliBarkod'> & {
  stok?: number;
  /** bagli · eslesir (sitede aynı barkod/SKU var, bağlanabilir) · cakisma · yeni (sitede yok, çekilebilir) */
  durum: 'bagli' | 'eslesir' | 'cakisma' | 'yeni';
};

/** Trendyol'daki tüm onaylı ilanlar + sitedeki karşılıkları (bilgi ve stok/fiyat birleşik). */
export async function trendyolKatalogu(): Promise<TyKatalogSatiri[]> {
  const [icerikler, eslesme] = await Promise.all([tyOnayliIcerikler(), trendyolIlanlariniEsle(false)]);
  const durumlar = new Map(eslesme.satirlar.map((s) => [s.barkod, s]));
  const satirlar: TyKatalogSatiri[] = icerikler.map((c) => {
    const e = durumlar.get(c.barkod);
    const durum = !e || e.durum === 'yok' ? 'yeni' : e.durum === 'yeni' ? 'eslesir' : e.durum;
    return { ...c, stok: e?.kanalStok ?? c.stok, fiyat: e?.kanalFiyat ?? c.fiyat, urunId: e?.urunId, urunAdi: e?.urunAdi, siteFiyat: e?.siteFiyat, not: e?.not, cift: e?.cift, bagliBarkod: e?.bagliBarkod, durum };
  });
  // Stok/fiyat listesinde olup içerik listesinde gelmeyen (nadiren) ilanlar da görünsün
  const gorulen = new Set(satirlar.map((s) => s.barkod));
  for (const e of eslesme.satirlar) {
    if (gorulen.has(e.barkod)) continue;
    satirlar.push({
      barkod: e.barkod, stokKodu: e.stokKodu, baslik: e.urunAdi ?? e.barkod, gorseller: [], ozellikler: [], satista: true, arsiv: false,
      fiyat: e.kanalFiyat, stok: e.kanalStok, urunId: e.urunId, urunAdi: e.urunAdi, siteFiyat: e.siteFiyat, not: e.not,
      cift: e.cift, bagliBarkod: e.bagliBarkod,
      durum: e.durum === 'yok' ? 'yeni' : e.durum === 'yeni' ? 'eslesir' : e.durum,
    });
  }
  const sira = { eslesir: 0, yeni: 1, cakisma: 2, bagli: 3 } as const;
  return satirlar.sort((a, b) => sira[a.durum] - sira[b.durum] || a.baslik.localeCompare(b.baslik, 'tr'));
}

/** Bir Trendyol ilanını seçilen site ürününe elle bağlar (yalnız bağlantı; fiyat değişmez). */
export async function trendyolIlaniniBagla(barkod: string, urunId: string): Promise<void> {
  const kod = barkod.trim();
  if (!kod || kod.length > 120 || /[,\s]/.test(kod)) throw new DogrulamaHatasi(['Trendyol barkodu geçersiz.']);
  const m = await magazaOku(true);
  if (!m.urunler.some((u) => u.id === urunId)) throw new DogrulamaHatasi(['Bağlanacak site ürünü bulunamadı.']);
  await envanterAyarlariGuncelle((a) => {
    const k = a.kanallar.trendyol;
    if (k.bekleyenStok) throw new DogrulamaHatasi(['Trendyol’un önceki stok işlemi onaylanınca tekrar deneyin (birkaç dakika).']);
    const baska = Object.entries(k.urunler).find(([id, e]) => id !== urunId && e.kod === kod);
    if (baska) throw new DogrulamaHatasi(['Bu barkod başka bir site ürününe bağlı. Önce o bağlantıyı değiştirin.']);
    const onceki = k.urunler[urunId];
    if (onceki?.kod && onceki.kod !== kod && (onceki.bildirilen ?? 0) > 0) {
      throw new DogrulamaHatasi(['Bu site ürünü başka bir Trendyol ilanına bağlı ve o ilanda stok var. Sayfanın üstündeki “Çift ilanlar” bölümünden “Bu ilan kalsın” deyin: eski ilanın stoğu 0 yapılıp bu ilan bağlanır.']);
    }
    k.urunler[urunId] = onceki?.kod === kod ? onceki : { satista: true, kod, fiyatTakip: false };
    a.eslesmeler[kodNormal(kod)] = urunId;
  });
}

/**
 * Çift ilan çözümü: bir site ürününe birden çok Trendyol ilanı düşüyorsa seçilen ilan "ana ilan" olur (stok ortak, depo
 * adedi buna gider), aynı ürüne uyan diğer ilanların Trendyol stoğu 0 yapılır (aynı adet iki kez satılmasın).
 * Eski barkodun elle eşleşmesi korunur: o ilandan önceden gelen/iptal olan siparişler yine bu ürüne düşer.
 * Fiyata dokunulmaz.
 */
export async function trendyolAnaIlaniSec(urunId: string, barkod: string): Promise<{ kapatilan: string[] }> {
  const kod = barkod.trim();
  if (!kod || kod.length > 120 || /[,\s]/.test(kod)) throw new DogrulamaHatasi(['Trendyol barkodu geçersiz.']);
  const m = await magazaOku(true);
  if (!m.urunler.some((u) => u.id === urunId)) throw new DogrulamaHatasi(['Site ürünü bulunamadı.']);
  const { satirlar } = await trendyolIlanlariniEsle(false);
  if (!satirlar.some((s) => s.barkod === kod)) throw new DogrulamaHatasi([`${kod} barkodu Trendyol’daki onaylı ilanlarınız arasında yok. Listeyi yenileyin.`]);
  const digerleri = satirlar.filter((s) => s.urunId === urunId && s.barkod !== kod).map((s) => s.barkod);
  let eskiKod: string | undefined;
  await envanterAyarlariGuncelle((a) => {
    const k = a.kanallar.trendyol;
    if (k.bekleyenStok) throw new DogrulamaHatasi(['Trendyol’un önceki stok işlemi onaylanınca tekrar deneyin (birkaç dakika).']);
    const baska = Object.entries(k.urunler).find(([id, e]) => id !== urunId && e.kod === kod);
    if (baska) throw new DogrulamaHatasi([`Bu ilan başka bir site ürününe (${baska[0]}) bağlı. Önce o bağlantıyı değiştirin.`]);
    const onceki = k.urunler[urunId];
    eskiKod = onceki?.kod;
    // Yeni ilanın adedi ve fiyatı ayrıca okunur: eski ilana ait bildirilen/son hedef/fiyat kayıtları taşınmaz
    k.urunler[urunId] = {
      satista: onceki?.satista ?? true, kod, fiyatTakip: onceki?.fiyatTakip ?? false,
      ...(onceki?.ozelFiyat !== undefined ? { ozelFiyat: onceki.ozelFiyat } : {}),
    };
    a.eslesmeler[kodNormal(kod)] = urunId;
    k.ciftIlanlar = (k.ciftIlanlar ?? []).filter((c) => c.urunId !== urunId);
  });
  const kapat = [...new Set([...(eskiKod && eskiKod !== kod ? [eskiKod] : []), ...digerleri])]
    .filter((b) => b !== kod);
  if (kapat.length) await tyIlanStokSifirla(kapat);
  return { kapatilan: kapat };
}

/** Hiçbir site ürününe bağlı olmayan (fazla/çift) bir Trendyol ilanının stoğunu 0 yapar. */
export async function trendyolIlaniSatistanKaldir(barkod: string): Promise<void> {
  const kod = barkod.trim();
  if (!kod || kod.length > 120 || /[,\s]/.test(kod)) throw new DogrulamaHatasi(['Trendyol barkodu geçersiz.']);
  const ayar = await envanterAyarlariOku();
  const bagli = Object.entries(ayar.kanallar.trendyol.urunler).find(([, e]) => e.kod === kod);
  if (bagli) throw new DogrulamaHatasi(['Bu ilan sitedeki bir ürünün ana ilanı; stoğu depodan eşitlenir. Önce başka bir ilanı ana ilan yapın.']);
  await tyIlanStokSifirla([kod]);
}

const TR_KUCUK = (s: string) => s.toLocaleLowerCase('tr');
const htmlTemizle = (h = '') => h.replace(/<\s*(br|\/p|\/li|\/h\d)\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

/** Trendyol görsel sunucusundan (yalnız *.dsmcdn.com) görseli indirip sitenin medya deposuna kaydeder. */
async function gorselIndir(url: string, klasor: string): Promise<string | undefined> {
  let adres: URL;
  try { adres = new URL(url); } catch { return undefined; }
  if (adres.protocol !== 'https:' || !/(^|\.)dsmcdn\.com$/i.test(adres.hostname)) return undefined;
  try {
    const y = await fetch(adres, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AlLuluHome/2.0)',
        Accept: 'image/webp,image/jpeg,image/png,image/*;q=0.8',
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!y.ok) return undefined;
    const sonAdres = new URL(y.url || adres.href);
    if (sonAdres.protocol !== 'https:' || !/(^|\.)dsmcdn\.com$/i.test(sonAdres.hostname)) return undefined;
    const ham = (y.headers.get('content-type') ?? 'image/jpeg').split(';')[0]!.trim().toLowerCase();
    const tur = ham === 'image/jpg' || ham === 'application/octet-stream' ? 'image/jpeg' : ham;
    const veri = await y.arrayBuffer();
    if (veri.byteLength > 12 * 1024 * 1024) return undefined;
    return await gorselKaydet(new File([veri], 'trendyol.' + (tur.split('/')[1] ?? 'jpg'), { type: tur }), klasor);
  } catch { return undefined; }
}

export type CekmeSecimi = { barkod: string; stok?: number; kategori: string; fiyat?: number };
export type CekmeSonucu = { eklenen: { urunId: string; ad: string; gorsel: number }[]; atlanan: string[] };

/**
 * Seçilen Trendyol ilanlarını sitede TASLAK ürün olarak oluşturur ve ilanı ürüne bağlar.
 * Zaman sınırı için bir seferde en fazla 6 ilan (her biri en fazla 8 görsel).
 */
export async function trendyoldanUrunCek(secimler: CekmeSecimi[]): Promise<CekmeSonucu> {
  if (!secimler.length) throw new DogrulamaHatasi(['Siteye çekilecek ilan seçin.']);
  if (secimler.length > 6) throw new DogrulamaHatasi(['Bir seferde en fazla 6 ilan çekilebilir (görseller indiriliyor). Kalanları ikinci turda seçin.']);
  const [m, ayar, eslesme] = await Promise.all([
    magazaOku(true),
    envanterAyarlariOku(),
    trendyolIlanlariniEsle(false).catch(() => undefined),
  ]);
  const eslesmeMap = new Map(eslesme?.satirlar.map((x) => [x.barkod, x]) ?? []);
  const k = ayar.kanallar.trendyol;
  const kategoriler = new Set(m.kategoriler.map((x) => x.id));
  const bagliKodlar = new Set(Object.values(k.urunler).map((e) => e.kod).filter(Boolean));
  const sonuc: CekmeSonucu = { eklenen: [], atlanan: [] };
  const kullanilanId = new Set(m.urunler.map((u) => u.id));
  const yeniUrunler: { urun: Urun; c: TyIcerik; kanalFiyati?: number }[] = [];
  const baslangic = Date.now();

  for (const s of secimler) {
    if (Date.now() - baslangic > 35_000) { sonuc.atlanan.push(`${s.barkod}: süre doldu, tekrar seçin`); continue; }
    if (bagliKodlar.has(s.barkod)) { sonuc.atlanan.push(`${s.barkod}: zaten bir site ürününe bağlı`); continue; }
    if (!kategoriler.has(s.kategori)) { sonuc.atlanan.push(`${s.barkod}: site kategorisi seçilmedi`); continue; }
    const eslesenSatir = eslesmeMap.get(s.barkod);
    let c: TyIcerik | undefined;
    try { [c] = await tyOnayliIcerikler(s.barkod, 5); } catch (e) {
      if (!eslesenSatir) {
        sonuc.atlanan.push(`${s.barkod}: ${e instanceof PazaryeriApiHatasi ? e.message : 'Trendyol’dan okunamadı'}`);
        continue;
      }
    }
    if (!c && eslesenSatir) {
      c = {
        barkod: s.barkod, stokKodu: eslesenSatir.stokKodu, baslik: eslesenSatir.urunAdi ?? s.barkod,
        gorseller: [], ozellikler: [], fiyat: eslesenSatir.kanalFiyat, stok: eslesenSatir.kanalStok,
        satista: true, arsiv: false,
      };
    }
    if (!c) { sonuc.atlanan.push(`${s.barkod}: Trendyol’da onaylı ilan bulunamadı`); continue; }
    const marka = (c.marka?.ad ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'AL LULU HOME';
    const ad = (c.baslik || c.barkod).replace(/\s+/g, ' ').trim().slice(0, 160) || c.barkod;
    const markasiz = TR_KUCUK(ad).startsWith(TR_KUCUK(marka) + ' ') ? ad.slice(marka.length).trim() : ad;
    const kisaAd = ((markasiz.length > 60 ? markasiz.slice(0, 60).replace(/\s+\S*$/, '') : markasiz) || ad.slice(0, 60) || c.barkod).trim();
    const id = benzersizKod(`${marka} ${kisaAd}`, kullanilanId);
    kullanilanId.add(id);
    const gorseller: { src: string; alt: string }[] = [];
    for (const g of c.gorseller.slice(0, 8)) {
      if (Date.now() - baslangic > 40_000) break;
      const src = await gorselIndir(g, id);
      if (src) gorseller.push({ src, alt: `${marka} ${kisaAd}` });
    }
    const teknik: [string, string][] = [];
    const gorulenOz = new Set<string>();
    for (const o of c.ozellikler) {
      const oAd = (o.ad ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const oDeger = (o.deger ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
      const anahtar = TR_KUCUK(oAd);
      if (!oAd || !oDeger || gorulenOz.has(anahtar)) continue;
      gorulenOz.add(anahtar);
      teknik.push([oAd, oDeger]);
      if (teknik.length >= 29) break;
    }
    if (gtinGecerli(c.barkod) && !teknik.some(([a]) => /barkod/i.test(a))) teknik.unshift(['Barkod (EAN)', c.barkod]);
    const garantiOz = teknik.find(([a]) => /garanti\s*s[uü]re/i.test(a))?.[1];
    const aciklama = htmlTemizle(c.aciklama);
    const hamStok = s.stok !== undefined ? s.stok : (c.stok ?? eslesenSatir?.kanalStok ?? 0);
    const stok = Number.isSafeInteger(hamStok) && hamStok >= 0 ? Math.min(hamStok, 100_000) : 0;
    const hamFiyat = [s.fiyat, c.fiyat, eslesenSatir?.kanalFiyat, c.listeFiyati]
      .find((x): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0);
    const fiyat = Math.max(1, Math.round(hamFiyat ?? 1));
    const urun: Urun = {
      ...structuredClone(BOS_URUN), id, durum: 'taslak', marka, ad, kisaAd, kategoriler: [s.kategori], stok,
      sku: (c.stokKodu || c.barkod).trim().slice(0, 80), gorseller, teknik,
      ...(garantiOz ? { garanti: /garanti/i.test(garantiOz) ? garantiOz : `${garantiOz} Garantili` } : {}),
      ozet: aciklama.length > 600 ? aciklama.slice(0, 600).replace(/\s+\S*$/, '') + '…' : aciklama,
      dogrula: [
        `! Trendyol’dan içe aktarıldı (${new Date().toLocaleDateString('tr-TR')}): ad, açıklama, kategori, fiyat ve görselleri kontrol edip bu notu silin.`,
        ...(gorseller.length < c.gorseller.length ? [`Trendyol’daki ${c.gorseller.length} görselden ${gorseller.length} tanesi alınabildi.`] : []),
      ],
    };
    fiyatUygula(urun, fiyat, false);
    yeniUrunler.push({ urun, c, kanalFiyati: hamFiyat });
  }
  if (!yeniUrunler.length) return sonuc;

  try {
    await magazaGuncelle((mm) => {
      for (const { urun } of yeniUrunler) {
        if (mm.urunler.some((u) => u.id === urun.id)) throw new DogrulamaHatasi(['Aynı ürün adresi bu sırada oluşturuldu. Yeniden deneyin.']);
        mm.urunler.push(structuredClone(urun));
      }
    }, 'Trendyol’dan ürün çekme');
  } catch (e) {
    for (const { urun } of yeniUrunler) for (const g of urun.gorseller) await gorselSil(g.src).catch(() => undefined);
    throw e;
  }
  const tarih = new Date().toISOString();
  await envanterAyarlariGuncelle((a) => {
    const kanal = a.kanallar.trendyol;
    const kullanilan = new Set(Object.values(kanal.urunler).map((e) => e.kod).filter(Boolean));
    for (const { urun, c, kanalFiyati } of yeniUrunler) {
      if (kullanilan.has(c.barkod)) continue;
      kanal.urunler[urun.id] = {
        satista: true, kod: c.barkod, fiyatTakip: false,
        ...(kanalFiyati !== undefined ? { kanalFiyat: kanalFiyati, kanalFiyatTarih: tarih } : {}),
      };
      a.eslesmeler[kodNormal(c.barkod)] = urun.id;
      kanal.ilanlar[urun.id] = {
        durum: 'onaylandi', barkod: c.barkod, stokKodu: (c.stokKodu ?? '').slice(0, 100), anaKod: (c.anaKod ?? '').slice(0, 40),
        baslik: (c.baslik || urun.ad).slice(0, 100),
        ...(c.kategori?.id ? { kategoriId: c.kategori.id, kategoriAdi: c.kategori.ad } : {}),
        ...(c.marka?.id ? { markaId: c.marka.id, markaAdi: c.marka.ad } : {}),
        ...(c.desi && c.desi > 0 ? { desi: c.desi } : {}),
        ozellikler: c.ozellikler
          .filter((o) => o.id && o.id > 0)
          .map((o) => o.degerIdler?.length
            ? { attributeId: o.id!, ad: o.ad, attributeValueIds: o.degerIdler, degerAdi: o.deger }
            : { attributeId: o.id!, ad: o.ad, attributeValue: o.deger.slice(0, 400) }),
        kdv: [0, 1, 10, 20].includes(c.kdv ?? -1) ? c.kdv! : 20, mesajlar: [], kontrol: tarih,
      };
      kullanilan.add(c.barkod);
    }
  });
  for (const { urun } of yeniUrunler) sonuc.eklenen.push({ urunId: urun.id, ad: `${urun.marka} ${urun.kisaAd}`, gorsel: urun.gorseller.length });
  return sonuc;
}

/** Ürünün Trendyol'daki mevcut fiyatını o kanal için "özel fiyat" olarak kaydeder (takip açılırsa bu fiyat korunur). */
export async function kanalFiyatiniKoru(urunId: string): Promise<number> {
  const ayar = await envanterAyarlariOku();
  const e = ayar.kanallar.trendyol.urunler[urunId];
  if (!e?.kod || e.kanalFiyat === undefined) throw new DogrulamaHatasi(['Bu ürünün Trendyol fiyatı henüz okunmadı. Listeyi yenileyip tekrar deneyin.']);
  const fiyat = e.kanalFiyat;
  await envanterAyarlariGuncelle((a) => {
    const x = a.kanallar.trendyol.urunler[urunId];
    if (x) x.ozelFiyat = fiyat;
    const ilan = a.kanallar.trendyol.ilanlar[urunId];
    if (ilan) ilan.fiyat = fiyat;
  });
  return fiyat;
}

/**
 * Trendyol'un ilan başına uyguladığı komisyon oranlarını (filterApprovedProducts variants[].commission) bağlı ürünlere yazar.
 * Kâr hesapları (Finans › Trendyol kârlılık) bu oranı kullanır. `icerikler` verilmezse Trendyol'dan okunur.
 */
export async function tyKomisyonlariniGuncelle(icerikler?: Pick<TyIcerik, 'barkod' | 'komisyon'>[]): Promise<{ urunId: string; eski?: number; yeni: number }[]> {
  const liste = icerikler ?? await tyOnayliIcerikler();
  const oranlar = new Map(liste.filter((c) => c.komisyon !== undefined).map((c) => [c.barkod, Math.round(c.komisyon! * 100)]));
  const ayar = await envanterAyarlariOku();
  const degisen = Object.entries(ayar.kanallar.trendyol.urunler)
    .filter(([, e]) => e.kod && oranlar.has(e.kod) && e.komisyonBp !== oranlar.get(e.kod))
    .map(([urunId, e]) => ({ urunId, eski: e.komisyonBp, yeni: oranlar.get(e.kod!)! }));
  const tarih = new Date().toISOString();
  await envanterAyarlariGuncelle((a) => {
    const k = a.kanallar.trendyol;
    for (const e of Object.values(k.urunler)) {
      const oran = e.kod ? oranlar.get(e.kod) : undefined;
      if (oran !== undefined) { e.komisyonBp = oran; e.komisyonTarih = tarih; }
    }
    k.komisyonTarih = tarih;
  });
  return degisen;
}

/** Katalog satırlarından okunan güncel Trendyol fiyatlarını bağlı ürünlere yazar (panelde "kanaldaki fiyat"). */
export async function kanalFiyatlariniKaydet(satirlar: TyKatalogSatiri[]): Promise<void> {
  const ayar = await envanterAyarlariOku();
  const urunler = ayar.kanallar.trendyol.urunler;
  // Yalnız fiyatı değişen ya da 1 saatten eski okunan kayıtlar yazılır (her sayfa açılışında ayar sürümü artmasın)
  const okunan = satirlar.filter((s) => s.durum === 'bagli' && s.urunId && s.fiyat !== undefined && s.fiyat > 0 && (() => {
    const e = urunler[s.urunId!];
    return !e || e.kanalFiyat !== s.fiyat || Date.now() - Date.parse(e.kanalFiyatTarih ?? '') > 3600_000 || !e.kanalFiyatTarih;
  })());
  if (!okunan.length) return;
  const tarih = new Date().toISOString();
  await envanterAyarlariGuncelle((a) => {
    for (const s of okunan) {
      const e = a.kanallar.trendyol.urunler[s.urunId!];
      if (e?.kod === s.barkod) { e.kanalFiyat = s.fiyat; e.kanalFiyatTarih = tarih; }
    }
  });
}
