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
import { tyOnayliIcerikler, type TyIcerik } from './trendyolApi';
import { gtinGecerli } from './urunKimlik';
import type { Urun } from './sema';

export type TyKatalogSatiri = TyIcerik & Pick<IlanEslesmesi, 'urunId' | 'urunAdi' | 'siteFiyat' | 'not'> & {
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
    return { ...c, stok: e?.kanalStok, fiyat: e?.kanalFiyat ?? c.fiyat, urunId: e?.urunId, urunAdi: e?.urunAdi, siteFiyat: e?.siteFiyat, not: e?.not, durum };
  });
  // Stok/fiyat listesinde olup içerik listesinde gelmeyen (nadiren) ilanlar da görünsün
  const gorulen = new Set(satirlar.map((s) => s.barkod));
  for (const e of eslesme.satirlar) {
    if (gorulen.has(e.barkod)) continue;
    satirlar.push({
      barkod: e.barkod, stokKodu: e.stokKodu, baslik: e.urunAdi ?? e.barkod, gorseller: [], ozellikler: [], satista: true, arsiv: false,
      fiyat: e.kanalFiyat, stok: e.kanalStok, urunId: e.urunId, urunAdi: e.urunAdi, siteFiyat: e.siteFiyat, not: e.not,
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
      throw new DogrulamaHatasi(['Bu site ürünü başka bir Trendyol ilanına bağlı ve o ilanda stok var. Önce eski ilanı satışa kapatın.']);
    }
    k.urunler[urunId] = onceki?.kod === kod ? onceki : { satista: true, kod, fiyatTakip: false };
    a.eslesmeler[kodNormal(kod)] = urunId;
  });
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
    const y = await fetch(adres, { redirect: 'error', signal: AbortSignal.timeout(12_000) });
    if (!y.ok) return undefined;
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
  const [m, ayar] = await Promise.all([magazaOku(true), envanterAyarlariOku()]);
  const k = ayar.kanallar.trendyol;
  const kategoriler = new Set(m.kategoriler.map((x) => x.id));
  const bagliKodlar = new Set(Object.values(k.urunler).map((e) => e.kod).filter(Boolean));
  const sonuc: CekmeSonucu = { eklenen: [], atlanan: [] };
  const kullanilanId = new Set(m.urunler.map((u) => u.id));
  const yeniUrunler: { urun: Urun; c: TyIcerik }[] = [];
  const baslangic = Date.now();

  for (const s of secimler) {
    if (Date.now() - baslangic > 35_000) { sonuc.atlanan.push(`${s.barkod}: süre doldu, tekrar seçin`); continue; }
    if (bagliKodlar.has(s.barkod)) { sonuc.atlanan.push(`${s.barkod}: zaten bir site ürününe bağlı`); continue; }
    if (!kategoriler.has(s.kategori)) { sonuc.atlanan.push(`${s.barkod}: site kategorisi seçilmedi`); continue; }
    let c: TyIcerik | undefined;
    try { [c] = await tyOnayliIcerikler(s.barkod, 5); } catch (e) {
      sonuc.atlanan.push(`${s.barkod}: ${e instanceof PazaryeriApiHatasi ? e.message : 'Trendyol’dan okunamadı'}`); continue;
    }
    if (!c) { sonuc.atlanan.push(`${s.barkod}: Trendyol’da onaylı ilan bulunamadı`); continue; }
    const marka = (c.marka?.ad ?? '').trim() || 'Markasız';
    const ad = c.baslik.replace(/\s+/g, ' ').trim().slice(0, 160);
    const markasiz = TR_KUCUK(ad).startsWith(TR_KUCUK(marka) + ' ') ? ad.slice(marka.length).trim() : ad;
    const kisaAd = (markasiz.length > 60 ? markasiz.slice(0, 60).replace(/\s+\S*$/, '') : markasiz) || ad.slice(0, 60);
    const id = benzersizKod(`${marka} ${kisaAd}`, kullanilanId);
    kullanilanId.add(id);
    const gorseller: { src: string; alt: string }[] = [];
    for (const g of c.gorseller.slice(0, 8)) {
      if (Date.now() - baslangic > 40_000) break;
      const src = await gorselIndir(g, id);
      if (src) gorseller.push({ src, alt: `${marka} ${kisaAd}` });
    }
    const teknik: [string, string][] = c.ozellikler.map((o) => [o.ad.slice(0, 80), o.deger.slice(0, 200)] as [string, string]).slice(0, 30);
    if (gtinGecerli(c.barkod) && !teknik.some(([a]) => /barkod/i.test(a))) teknik.unshift(['Barkod (EAN)', c.barkod]);
    const aciklama = htmlTemizle(c.aciklama);
    const stok = Number.isSafeInteger(s.stok) && s.stok! >= 0 ? Math.min(s.stok!, 100_000) : 0;
    const fiyat = Math.max(1, Math.round(s.fiyat ?? c.fiyat ?? 1));
    const urun: Urun = {
      ...structuredClone(BOS_URUN), id, durum: 'taslak', marka, ad, kisaAd, kategoriler: [s.kategori], stok,
      sku: (c.stokKodu || c.barkod).slice(0, 80), gorseller, teknik,
      ozet: aciklama.length > 600 ? aciklama.slice(0, 600).replace(/\s+\S*$/, '') + '…' : aciklama,
      dogrula: [
        `! Trendyol’dan içe aktarıldı (${new Date().toLocaleDateString('tr-TR')}): ad, açıklama, kategori, fiyat ve görselleri kontrol edip bu notu silin.`,
        ...(gorseller.length < c.gorseller.length ? [`Trendyol’daki ${c.gorseller.length} görselden ${gorseller.length} tanesi alınabildi.`] : []),
      ],
    };
    fiyatUygula(urun, fiyat, false);
    yeniUrunler.push({ urun, c });
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
    for (const { urun, c } of yeniUrunler) {
      if (kullanilan.has(c.barkod)) continue;
      kanal.urunler[urun.id] = { satista: true, kod: c.barkod, fiyatTakip: false, ...(c.fiyat !== undefined ? { kanalFiyat: c.fiyat, kanalFiyatTarih: tarih } : {}) };
      a.eslesmeler[kodNormal(c.barkod)] = urun.id;
      kanal.ilanlar[urun.id] = {
        durum: 'onaylandi', barkod: c.barkod, stokKodu: (c.stokKodu ?? '').slice(0, 100), anaKod: (c.anaKod ?? '').slice(0, 40),
        baslik: c.baslik.slice(0, 100), kategoriId: c.kategori?.id, kategoriAdi: c.kategori?.ad, markaId: c.marka?.id, markaAdi: c.marka?.ad,
        ozellikler: [], kdv: [0, 1, 10, 20].includes(c.kdv ?? -1) ? c.kdv! : 20, mesajlar: [], kontrol: tarih,
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

/** Katalog satırlarından okunan güncel Trendyol fiyatlarını bağlı ürünlere yazar (panelde "kanaldaki fiyat"). */
export async function kanalFiyatlariniKaydet(satirlar: TyKatalogSatiri[]): Promise<void> {
  const ayar = await envanterAyarlariOku();
  const urunler = ayar.kanallar.trendyol.urunler;
  // Yalnız fiyatı değişen ya da 1 saatten eski okunan kayıtlar yazılır (her sayfa açılışında ayar sürümü artmasın)
  const okunan = satirlar.filter((s) => s.durum === 'bagli' && s.urunId && s.fiyat !== undefined && (() => {
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
