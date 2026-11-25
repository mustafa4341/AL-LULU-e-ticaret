/**
 * Pazaryeri fiyatları ve Trendyol ilanlarını site ürünlerine bağlama.
 *
 * Kural (mağaza sahibinin isteği, 24.11.2026):
 *  • Eşleştirme (bağlama) yalnız ilanı ürüne bağlar; kanaldaki fiyata DOKUNMAZ. Stok ise ortaktır ve her zaman eşitlenir.
 *  • Kanal fiyatı farklı olabilir: ürüne özel fiyat › kanal kuralı (%/TL) › sitedeki son fiyat (bkz. kanalHedefFiyati).
 *  • Fiyat kanala yalnız iki yoldan gider: panelde "Fiyatı gönder" düğmesi (seçilen ürünler) ya da
 *    ürünün "otomatik fiyat takibi" açıksa zamanlayıcı (5 dk). Takip kapalı ürünün fiyatı kendiliğinden değişmez.
 *
 * Akış: ilanların kanaldaki güncel fiyatı okunur → hedeften farklı olanlar gönderilir → gönderilen fiyat ve zamanı kaydedilir.
 * Aynı fiyat 30 dakika içinde yeniden gönderilmez (Trendyol aynı isteği 15 dk reddeder).
 */
import { magazaOku } from './depo';
import { KANALLAR, KANAL_LISTESI, kanalHedefFiyati, kodNormal, type Kanal } from './pazaryeri';
import { PazaryeriApiHatasi, kanalFiyatGonder, kanalFiyatSonucu, kanalStokOku, pazaryeriApiDurumu, trendyolTumIlanlar, type FiyatKalemi } from './pazaryeriApi';
import { envanterAyarlariGuncelle, envanterAyarlariOku } from './pazaryeriDepo';
import { finansOku } from './finansDepo';
import { urunGtin } from './urunKimlik';

const TEKRAR_BEKLE_MS = 30 * 60_000;
/** Otomatik çalışmada kanal fiyatının yarısından fazla düşüş gönderilmez (sitede yazım hatası olabilir); panelden onaylanır. */
const OTOMATIK_EN_COK_DUSUS = 0.5;

export type FiyatFarki = { urunId: string; ad: string; kod: string; kanalda?: number; site: number; neden?: string };
export type KanalFiyatSonucu = {
  kanal: Kanal;
  gonderilen: FiyatFarki[];
  /** Büyük düşüş: otomatik gönderilmedi, panelden "Fiyatı gönder" ile gönderilir */
  onayBekleyen: FiyatFarki[];
  ayni: number;
  /** Az önce gönderildi, kanalın uygulaması bekleniyor */
  bekleyen: number;
  /** Bağlı ama kanalda bulunamayan ilan kodları */
  bulunamayan: string[];
  /** Kanalın reddettiği önceki fiyat gönderimleri (Trendyol toplu istek sonucu) */
  reddedilen: { ad: string; kod: string; sebep: string }[];
  hata?: string;
};
export type FiyatSecenegi = {
  /** Zamanlayıcı: yalnız otomatik fiyat takibi açık ürünler, büyük düşüş onaya kalır */
  otomatik?: boolean;
  kanallar?: Kanal[];
  /** Panel düğmesi: yalnız bu ürünler (takip açık olmasa da) */
  urunIdler?: string[];
};

const bagliKanallar = () => KANAL_LISTESI.filter((k) => ['canli', 'test'].includes(pazaryeriApiDurumu(k)));
const yakin = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 0.005;

async function kanalFiyatlariniEsitle(kanal: Kanal, s: FiyatSecenegi, simdi: number): Promise<KanalFiyatSonucu> {
  const sonuc: KanalFiyatSonucu = { kanal, gonderilen: [], onayBekleyen: [], ayni: 0, bekleyen: 0, bulunamayan: [], reddedilen: [] };
  const otomatik = !!s.otomatik;
  const [ayar, magaza, maliyetler] = await Promise.all([
    envanterAyarlariOku(), magazaOku(true),
    // Alış maliyeti (KDV hariç, kuruş): Finans › Hepsiburada hesaplayıcısında ürün için girilen. Okunamazsa sınır uygulanmaz.
    finansOku().then((f) => f.hbUrunler, () => ({} as Record<string, { maliyet?: number }>)),
  ]);
  await fiyatSonuclariniOku(kanal, ayar.kanallar[kanal], new Map(magaza.urunler.map((u) => [u.id, `${u.marka} ${u.kisaAd}`])), sonuc);
  const k = ayar.kanallar[kanal];
  const urunler = new Map(magaza.urunler.map((u) => [u.id, u]));
  const secili = s.urunIdler ? new Set(s.urunIdler) : undefined;
  const bagli = Object.entries(k.urunler).filter(([id, e]) => e.kod && e.satista !== false && urunler.has(id)
    && (secili ? secili.has(id) : e.fiyatTakip === true));
  if (!bagli.length) return sonuc;
  const sinyal = AbortSignal.timeout(30_000);
  const ilanlar = await kanalStokOku(kanal, bagli.map(([, e]) => e.kod!), sinyal);
  const gonder: (FiyatKalemi & FiyatFarki)[] = [];
  const okunan = new Map<string, number>();
  for (const [urunId, e] of bagli) {
    const u = urunler.get(urunId)!;
    const hedef = kanalHedefFiyati(u, k, simdi).hedef;
    const ilan = ilanlar.get(e.kod!);
    if (!ilan) { sonuc.bulunamayan.push(e.kod!); continue; }
    if (ilan.fiyat !== undefined && ilan.fiyat > 0) okunan.set(urunId, ilan.fiyat);
    // Trendyol'da üstü çizili (liste) fiyat da satış fiyatına eşitlenir: başka kanalın indirimi esas alınamaz.
    const listeFarkli = kanal === 'trendyol' && ilan.listeFiyati !== undefined && !yakin(ilan.listeFiyati, hedef);
    if (yakin(ilan.fiyat, hedef) && !listeFarkli) { sonuc.ayni++; continue; }
    if (yakin(e.fiyat, hedef) && e.fiyatTarih && simdi - Date.parse(e.fiyatTarih) < TEKRAR_BEKLE_MS) { sonuc.bekleyen++; continue; }
    if (!(hedef > 0)) continue;
    const fark: FiyatFarki = { urunId, ad: `${u.marka} ${u.kisaAd}`, kod: e.kod!, kanalda: ilan.fiyat, site: hedef };
    if (otomatik && ilan.fiyat !== undefined && hedef < ilan.fiyat * (1 - OTOMATIK_EN_COK_DUSUS)) { sonuc.onayBekleyen.push({ ...fark, neden: 'büyük düşüş' }); continue; }
    // Zararına otomatik satış olmasın: KDV dahil hedef fiyat, KDV hariç alış maliyetinin altındaysa gönderilmez (denetim AUD-014)
    const maliyet = maliyetler[urunId]?.maliyet;
    if (otomatik && maliyet && hedef * 100 < maliyet) { sonuc.onayBekleyen.push({ ...fark, neden: 'alış maliyetinin altında' }); continue; }
    gonder.push({ ...fark, fiyat: hedef });
  }
  const istekId = gonder.length ? await kanalFiyatGonder(kanal, gonder, ilanlar, sinyal) : undefined;
  const tarih = new Date(simdi).toISOString();
  if (gonder.length || okunan.size) {
    await envanterAyarlariGuncelle((a) => {
      const kanalAyari = a.kanallar[kanal];
      for (const [urunId, fiyat] of okunan) {
        const e = kanalAyari.urunler[urunId];
        if (e) { e.kanalFiyat = fiyat; e.kanalFiyatTarih = tarih; }
      }
      for (const g of gonder) {
        const e = kanalAyari.urunler[g.urunId];
        if (e?.kod === g.kod) { e.fiyat = g.fiyat; e.fiyatTarih = tarih; e.fiyatIstek = istekId; e.fiyatHata = undefined; }
        const ilan = kanalAyari.ilanlar[g.urunId];
        if (ilan?.barkod === g.kod) { ilan.sonFiyat = g.fiyat; ilan.sonFiyatTarih = tarih; }
      }
    });
  }
  sonuc.gonderilen = gonder.map(({ urunId, ad, kod, kanalda, site }) => ({ urunId, ad, kod, kanalda, site }));
  return sonuc;
}

/**
 * Önceki fiyat gönderimlerinin sonucunu okur (en fazla 3 farklı istek). Reddedilenler ürün kaydına "fiyatHata" olarak yazılır
 * ve panelde/otomatik iş günlüğünde görünür; eskiden ret sessizce yutulup 30 dakikada bir aynı fiyat yeniden deneniyordu.
 */
async function fiyatSonuclariniOku(kanal: Kanal, k: { urunler: Record<string, { kod?: string; fiyatIstek?: string; fiyatTarih?: string }> }, adlar: Map<string, string>, sonuc: KanalFiyatSonucu) {
  const simdi = Date.now();
  const istekler = [...new Set(Object.values(k.urunler)
    .filter((e) => e.fiyatIstek && e.fiyatTarih && simdi - Date.parse(e.fiyatTarih) > 60_000)
    .map((e) => e.fiyatIstek!))].slice(0, 3);
  if (!istekler.length) return;
  const sonuclar = await Promise.all(istekler.map((id) =>
    kanalFiyatSonucu(kanal, id, AbortSignal.timeout(8000)).then((r) => [id, r] as const, () => undefined)));
  const biten = sonuclar.filter((x): x is NonNullable<typeof x> => !!x && !x[1].bekliyor);
  if (!biten.length) return;
  await envanterAyarlariGuncelle((a) => {
    for (const [id, r] of biten) {
      for (const [urunId, e] of Object.entries(a.kanallar[kanal].urunler)) {
        if (e.fiyatIstek !== id) continue;
        const red = r.reddedilen.find((x) => x.kod === e.kod);
        e.fiyatIstek = undefined;
        e.fiyatHata = red?.sebep;
        if (red) sonuc.reddedilen.push({ ad: adlar.get(urunId) ?? urunId, kod: red.kod, sebep: red.sebep });
      }
    }
  });
}

/** Bağlı kanallarda seçilen (ya da takipteki) ürünlerin fiyatını hedef fiyatla eşitler. Bir kanalın hatası diğerini durdurmaz. */
export async function pazaryeriFiyatlariEsitle(secenek: FiyatSecenegi = {}): Promise<KanalFiyatSonucu[]> {
  const simdi = Date.now();
  const kanallar = (secenek.kanallar ?? KANAL_LISTESI).filter((k) => bagliKanallar().includes(k));
  return Promise.all(kanallar.map((kanal) => kanalFiyatlariniEsitle(kanal, secenek, simdi).catch((e) => ({
    kanal, gonderilen: [], onayBekleyen: [], ayni: 0, bekleyen: 0, bulunamayan: [], reddedilen: [],
    hata: e instanceof PazaryeriApiHatasi ? e.message : e instanceof Error ? e.message.slice(0, 200) : 'Fiyatlar gönderilemedi.',
  }))));
}

/** Kısa Türkçe özet (panel mesajı ve otomatik iş günlüğü için) */
export function fiyatOzeti(sonuclar: KanalFiyatSonucu[]): string[] {
  const para = (n?: number) => n === undefined ? '—' : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n) + ' TL';
  const satir: string[] = [];
  for (const s of sonuclar) {
    const ad = KANALLAR[s.kanal];
    if (s.hata) { satir.push(`${ad} fiyat: ${s.hata}`); continue; }
    const degisim = (g: FiyatFarki) => yakin(g.kanalda, g.site) ? `${g.ad} üstü çizili fiyat kaldırıldı` : `${g.ad} ${para(g.kanalda)} → ${para(g.site)}`;
    if (s.gonderilen.length) satir.push(`${ad}: ${s.gonderilen.length} ürünün fiyatı gönderildi (${s.gonderilen.slice(0, 3).map(degisim).join('; ')}${s.gonderilen.length > 3 ? '…' : ''})`);
    if (s.onayBekleyen.length) satir.push(`${ad}: ${s.onayBekleyen.length} üründe fiyat otomatik gönderilmedi (${s.onayBekleyen.slice(0, 3).map((g) => `${g.ad}: ${g.neden ?? 'onay gerekli'}`).join('; ')}). Kontrol edip Satış kanalları › Ürün eşleştirme'de “Fiyatı şimdi gönder” düğmesine basın.`);
    if (s.reddedilen.length) satir.push(`${ad} ${s.reddedilen.length} ürünün fiyatını kabul etmedi (${s.reddedilen.slice(0, 3).map((r) => `${r.ad}: ${r.sebep}`).join('; ')}).`);
    if (s.bulunamayan.length) satir.push(`${ad}: ${s.bulunamayan.length} bağlı ilan kanalda bulunamadı (${s.bulunamayan.slice(0, 3).join(', ')}).`);
  }
  return satir;
}

/* ---------------- Trendyol ilanlarını barkodla bağlama ---------------- */

export type IlanEslesmesi = {
  barkod: string; stokKodu?: string; kanalFiyat?: number; kanalStok?: number;
  urunId?: string; urunAdi?: string; siteFiyat?: number;
  /** bagli: zaten bağlı · yeni: bağlanabilir · cakisma: ürün başka koda bağlı ya da iki ilan aynı ürüne düştü · yok: sitede karşılığı yok */
  durum: 'bagli' | 'yeni' | 'cakisma' | 'yok';
  not?: string;
  /** Çift ilan: bu ilan sitedeki ürüne uyuyor ama ürün Trendyol'da BAŞKA bir ilana bağlı (aynı ürün iki kez satışta) */
  cift?: boolean;
  /** Çift ilanda ürünün şu an bağlı olduğu barkod */
  bagliBarkod?: string;
};

/**
 * Trendyol'daki tüm onaylı ilanları site ürünleriyle eşler: önce daha önce elle eşleştirilen kodlar,
 * sonra barkod = ürünün GTIN'i (teknik özelliklerdeki "Barkod"), sonra barkod/stok kodu = ürünün SKU'su.
 * `bagla` ise yalnız tek anlamlı yeni eşleşmeler kaydedilir; mevcut bağlantılara ve FİYATA dokunulmaz.
 * `yalniz` verilirse yalnız o barkodlar bağlanır.
 */
export async function trendyolIlanlariniEsle(bagla: boolean, yalniz?: string[]): Promise<{ satirlar: IlanEslesmesi[]; baglanan: number }> {
  const [ilanlar, ayar, magaza] = await Promise.all([
    trendyolTumIlanlar(AbortSignal.timeout(45_000)), envanterAyarlariOku(), magazaOku(true),
  ]);
  const k = ayar.kanallar.trendyol;
  const urunler = new Map(magaza.urunler.map((u) => [u.id, u]));
  const gtin = new Map<string, string>();
  const sku = new Map<string, string>();
  for (const u of magaza.urunler) {
    const g = urunGtin(u);
    if (g) gtin.set(g, u.id);
    if (u.sku) sku.set(kodNormal(u.sku), u.id);
  }
  const koduBagli = new Map(Object.entries(k.urunler).filter(([, e]) => e.kod).map(([id, e]) => [e.kod!, id]));
  const satirlar: IlanEslesmesi[] = ilanlar.map((i) => {
    const satir: IlanEslesmesi = { barkod: i.barkod, stokKodu: i.stokKodu, kanalFiyat: i.fiyat, kanalStok: i.stok, durum: 'yok' };
    const elle = ayar.eslesmeler[kodNormal(i.barkod)] ?? (i.stokKodu ? ayar.eslesmeler[kodNormal(i.stokKodu)] : undefined);
    const urunId = koduBagli.get(i.barkod) ?? (elle && urunler.has(elle) ? elle : undefined) ?? gtin.get(i.barkod)
      ?? sku.get(kodNormal(i.barkod)) ?? (i.stokKodu ? sku.get(kodNormal(i.stokKodu)) ?? gtin.get(i.stokKodu) : undefined);
    if (!urunId) return satir;
    const u = urunler.get(urunId)!;
    Object.assign(satir, { urunId, urunAdi: `${u.marka} ${u.kisaAd}`, siteFiyat: kanalHedefFiyati(u, k).hedef });
    const mevcut = k.urunler[urunId]?.kod;
    if (mevcut === i.barkod) satir.durum = 'bagli';
    else if (mevcut) {
      satir.durum = 'cakisma'; satir.cift = true; satir.bagliBarkod = mevcut;
      satir.not = `Çift ilan: bu ürün Trendyol’da ${mevcut} barkodlu ilana bağlı. Aynı ürün iki ilanla satılırsa tek stok iki kez satılabilir; hangisinin kalacağını seçin.`;
    }
    else satir.durum = 'yeni';
    return satir;
  });
  // Aynı ürüne birden çok yeni ilan düştüyse hiçbiri otomatik bağlanmaz (bunlar da çift ilandır)
  const sayac = new Map<string, number>();
  for (const s of satirlar) if (s.durum === 'yeni') sayac.set(s.urunId!, (sayac.get(s.urunId!) ?? 0) + 1);
  for (const s of satirlar) if (s.durum === 'yeni' && sayac.get(s.urunId!)! > 1) {
    s.durum = 'cakisma'; s.cift = true;
    s.not = 'Çift ilan: birden çok Trendyol ilanı bu ürüne uyuyor. Hangisinin kalacağını seçin; diğerinin stoğu 0 yapılır.';
  }
  // Çift ilan listesini kaydet (İş Merkezi uyarısı için); yalnız değiştiyse yazılır
  const ciftler = new Map<string, Set<string>>();
  for (const s of satirlar) if (s.cift && s.urunId) {
    const g = ciftler.get(s.urunId) ?? new Set<string>();
    if (s.bagliBarkod) g.add(s.bagliBarkod);
    g.add(s.barkod);
    ciftler.set(s.urunId, g);
  }
  const ciftListe = [...ciftler].map(([urunId, b]) => ({ urunId, barkodlar: [...b].sort().slice(0, 20) })).sort((a, b) => a.urunId.localeCompare(b.urunId));
  if (JSON.stringify(ciftListe) !== JSON.stringify(k.ciftIlanlar ?? [])) {
    await envanterAyarlariGuncelle((a) => { a.kanallar.trendyol.ciftIlanlar = ciftListe; }).catch(() => undefined);
  }
  const sira = { yeni: 0, cakisma: 1, yok: 2, bagli: 3 } as const;
  satirlar.sort((a, b) => sira[a.durum] - sira[b.durum] || (a.urunAdi ?? a.barkod).localeCompare(b.urunAdi ?? b.barkod, 'tr'));
  const yeniler = satirlar.filter((s) => s.durum === 'yeni' && (!yalniz || yalniz.includes(s.barkod)));
  const baglananlar = new Set<IlanEslesmesi>();
  if (bagla && yeniler.length) {
    await envanterAyarlariGuncelle((a) => {
      baglananlar.clear(); // güncelleme çakışınca yeniden çalışabilir
      const kanal = a.kanallar.trendyol;
      if (kanal.bekleyenStok) throw new PazaryeriApiHatasi('Trendyol’un önceki stok işlemi onaylanınca tekrar deneyin (birkaç dakika).');
      const kullanilan = new Set(Object.values(kanal.urunler).map((e) => e.kod).filter(Boolean));
      const tarih = new Date().toISOString();
      for (const s of yeniler) {
        if (kanal.urunler[s.urunId!]?.kod || kullanilan.has(s.barkod)) continue;
        // Yalnız bağlantı: fiyat takibi kapalı başlar, Trendyol'daki fiyat olduğu gibi kalır.
        kanal.urunler[s.urunId!] = {
          ...kanal.urunler[s.urunId!], kod: s.barkod, satista: true, fiyatTakip: false,
          ...(s.kanalFiyat !== undefined ? { kanalFiyat: s.kanalFiyat, kanalFiyatTarih: tarih } : {}),
        };
        a.eslesmeler[kodNormal(s.barkod)] = s.urunId!;
        kullanilan.add(s.barkod);
        baglananlar.add(s);
      }
    });
    for (const s of baglananlar) s.durum = 'bagli';
  }
  return { satirlar, baglanan: baglananlar.size };
}
