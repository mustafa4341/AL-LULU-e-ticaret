/**
 * Pazaryeri fiyatlarını sitedeki fiyatla aynı tutma ve Trendyol ilanlarını site ürünlerine barkodla bağlama.
 *
 * Kural (mağaza sahibinin isteği, 23.11.2026): Trendyol ve Hepsiburada satış fiyatı = müşterinin alluluhome.com'da ödediği
 * son fiyat (kampanya ve sepette indirim dahil; bkz. kanalSatisFiyati). Fiyat kuralı / ürüne özel kanal fiyatı yoktur.
 *
 * Akış: bağlı ilanların kanaldaki güncel fiyatı okunur → farklı olanlar gönderilir → gönderilen fiyat ve zamanı kaydedilir.
 * Kanal isteği sırayla uygular; aynı fiyat 30 dakika içinde yeniden gönderilmez (Trendyol aynı isteği 15 dk reddeder).
 */
import { magazaOku } from './depo';
import { KANALLAR, KANAL_LISTESI, kanalSatisFiyati, kodNormal, type Kanal } from './pazaryeri';
import { PazaryeriApiHatasi, kanalFiyatGonder, kanalStokOku, pazaryeriApiDurumu, trendyolTumIlanlar, type FiyatKalemi } from './pazaryeriApi';
import { envanterAyarlariGuncelle, envanterAyarlariOku } from './pazaryeriDepo';
import { urunGtin } from './urunKimlik';

const TEKRAR_BEKLE_MS = 30 * 60_000;
/** Otomatik çalışmada kanal fiyatının yarısından fazla düşüş gönderilmez (sitede yazım hatası olabilir); panelden onaylanır. */
const OTOMATIK_EN_COK_DUSUS = 0.5;

export type FiyatFarki = { urunId: string; ad: string; kod: string; kanalda?: number; site: number };
export type KanalFiyatSonucu = {
  kanal: Kanal;
  gonderilen: FiyatFarki[];
  /** Büyük düşüş: otomatik gönderilmedi, panelden "Fiyatları siteyle eşitle" ile gönderilir */
  onayBekleyen: FiyatFarki[];
  ayni: number;
  /** Az önce gönderildi, kanalın uygulaması bekleniyor */
  bekleyen: number;
  /** Bağlı ama kanalda bulunamayan ilan kodları */
  bulunamayan: string[];
  hata?: string;
};

const bagliKanallar = () => KANAL_LISTESI.filter((k) => ['canli', 'test'].includes(pazaryeriApiDurumu(k)));
const yakin = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 0.005;

async function kanalFiyatlariniEsitle(kanal: Kanal, otomatik: boolean, simdi: number): Promise<KanalFiyatSonucu> {
  const sonuc: KanalFiyatSonucu = { kanal, gonderilen: [], onayBekleyen: [], ayni: 0, bekleyen: 0, bulunamayan: [] };
  const [ayar, magaza] = await Promise.all([envanterAyarlariOku(), magazaOku(true)]);
  const k = ayar.kanallar[kanal];
  const urunler = new Map(magaza.urunler.map((u) => [u.id, u]));
  const bagli = Object.entries(k.urunler).filter(([id, e]) => e.kod && urunler.has(id));
  if (!bagli.length) return sonuc;
  const sinyal = AbortSignal.timeout(30_000);
  const ilanlar = await kanalStokOku(kanal, bagli.map(([, e]) => e.kod!), sinyal);
  const gonder: (FiyatKalemi & FiyatFarki)[] = [];
  for (const [urunId, e] of bagli) {
    const u = urunler.get(urunId)!;
    const site = kanalSatisFiyati(u, simdi);
    const ilan = ilanlar.get(e.kod!);
    if (!ilan) { sonuc.bulunamayan.push(e.kod!); continue; }
    // Trendyol'da üstü çizili (liste) fiyat da satış fiyatına eşitlenir: başka kanalın indirimi esas alınamaz.
    const listeFarkli = kanal === 'trendyol' && ilan.listeFiyati !== undefined && !yakin(ilan.listeFiyati, site);
    if (yakin(ilan.fiyat, site) && !listeFarkli) { sonuc.ayni++; continue; }
    if (yakin(e.fiyat, site) && e.fiyatTarih && simdi - Date.parse(e.fiyatTarih) < TEKRAR_BEKLE_MS) { sonuc.bekleyen++; continue; }
    if (!(site > 0)) continue;
    const fark: FiyatFarki = { urunId, ad: `${u.marka} ${u.kisaAd}`, kod: e.kod!, kanalda: ilan.fiyat, site };
    if (otomatik && ilan.fiyat !== undefined && site < ilan.fiyat * (1 - OTOMATIK_EN_COK_DUSUS)) { sonuc.onayBekleyen.push(fark); continue; }
    gonder.push({ ...fark, fiyat: site });
  }
  if (!gonder.length) return sonuc;
  await kanalFiyatGonder(kanal, gonder, ilanlar, sinyal);
  const tarih = new Date(simdi).toISOString();
  await envanterAyarlariGuncelle((a) => {
    const kanalAyari = a.kanallar[kanal];
    for (const g of gonder) {
      const e = kanalAyari.urunler[g.urunId];
      if (e?.kod === g.kod) { e.fiyat = g.fiyat; e.fiyatTarih = tarih; }
      const ilan = kanalAyari.ilanlar[g.urunId];
      if (ilan?.barkod === g.kod) { ilan.sonFiyat = g.fiyat; ilan.sonFiyatTarih = tarih; }
    }
  });
  sonuc.gonderilen = gonder.map(({ urunId, ad, kod, kanalda, site }) => ({ urunId, ad, kod, kanalda, site }));
  return sonuc;
}

/** Bağlı tüm kanallarda fiyatları sitedeki fiyatla eşitler. Bir kanalın hatası diğerini durdurmaz. */
export async function pazaryeriFiyatlariEsitle(secenek: { otomatik?: boolean; kanallar?: Kanal[] } = {}): Promise<KanalFiyatSonucu[]> {
  const simdi = Date.now();
  const kanallar = (secenek.kanallar ?? KANAL_LISTESI).filter((k) => bagliKanallar().includes(k));
  return Promise.all(kanallar.map((kanal) => kanalFiyatlariniEsitle(kanal, !!secenek.otomatik, simdi).catch((e) => ({
    kanal, gonderilen: [], onayBekleyen: [], ayni: 0, bekleyen: 0, bulunamayan: [],
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
    if (s.gonderilen.length) satir.push(`${ad}: ${s.gonderilen.length} ürünün fiyatı siteyle eşitlendi (${s.gonderilen.slice(0, 3).map(degisim).join('; ')}${s.gonderilen.length > 3 ? '…' : ''})`);
    if (s.onayBekleyen.length) satir.push(`${ad}: ${s.onayBekleyen.length} üründe büyük fiyat düşüşü var, otomatik gönderilmedi. Satış kanalları sayfasından “Fiyatları siteyle eşitle”ye basın.`);
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
};

/**
 * Trendyol'daki tüm onaylı ilanları site ürünleriyle eşler: önce daha önce elle eşleştirilen kodlar,
 * sonra barkod = ürünün GTIN'i (teknik özelliklerdeki "Barkod"), sonra barkod/stok kodu = ürünün SKU'su.
 * `bagla` ise yalnız tek anlamlı yeni eşleşmeler kaydedilir; mevcut bağlantılara dokunulmaz.
 */
export async function trendyolIlanlariniEsle(bagla: boolean): Promise<{ satirlar: IlanEslesmesi[]; baglanan: number }> {
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
    Object.assign(satir, { urunId, urunAdi: `${u.marka} ${u.kisaAd}`, siteFiyat: kanalSatisFiyati(u) });
    const mevcut = k.urunler[urunId]?.kod;
    if (mevcut === i.barkod) satir.durum = 'bagli';
    else if (mevcut) { satir.durum = 'cakisma'; satir.not = `Ürün başka bir barkoda bağlı (${mevcut}).`; }
    else satir.durum = 'yeni';
    return satir;
  });
  // Aynı ürüne birden çok yeni ilan düştüyse hiçbiri otomatik bağlanmaz
  const sayac = new Map<string, number>();
  for (const s of satirlar) if (s.durum === 'yeni') sayac.set(s.urunId!, (sayac.get(s.urunId!) ?? 0) + 1);
  for (const s of satirlar) if (s.durum === 'yeni' && sayac.get(s.urunId!)! > 1) { s.durum = 'cakisma'; s.not = 'Birden çok Trendyol ilanı bu ürüne uyuyor; doğru barkodu elle seçin.'; }
  const sira = { yeni: 0, cakisma: 1, yok: 2, bagli: 3 } as const;
  satirlar.sort((a, b) => sira[a.durum] - sira[b.durum] || (a.urunAdi ?? a.barkod).localeCompare(b.urunAdi ?? b.barkod, 'tr'));
  const yeniler = satirlar.filter((s) => s.durum === 'yeni');
  const baglananlar = new Set<IlanEslesmesi>();
  if (bagla && yeniler.length) {
    await envanterAyarlariGuncelle((a) => {
      baglananlar.clear(); // güncelleme çakışınca yeniden çalışabilir
      const kanal = a.kanallar.trendyol;
      if (kanal.bekleyenStok) throw new PazaryeriApiHatasi('Trendyol’un önceki stok işlemi onaylanınca tekrar deneyin (birkaç dakika).');
      const kullanilan = new Set(Object.values(kanal.urunler).map((e) => e.kod).filter(Boolean));
      for (const s of yeniler) {
        if (kanal.urunler[s.urunId!]?.kod || kullanilan.has(s.barkod)) continue;
        kanal.urunler[s.urunId!] = { ...kanal.urunler[s.urunId!], kod: s.barkod, satista: true };
        kullanilan.add(s.barkod);
        baglananlar.add(s);
      }
    });
    for (const s of baglananlar) s.durum = 'bagli';
  }
  return { satirlar, baglanan: baglananlar.size };
}
