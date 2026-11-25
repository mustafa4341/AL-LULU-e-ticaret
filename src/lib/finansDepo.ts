import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { cakismaHatasi, magazaOku, siparisleriOku, supabaseIstemci, VERI_KOKU } from './depo';
import { BELGE_SABLON_SURUMU, BelgeAyarSema, FinansSema, faturaKaydiSema, type FaturaKaydi, HbAyarSema, HbUrunAyarSema, belgeGecerli, giderSema, type Belge, type BelgeAyarlari, type BelgeTuru, type Finans, type Gider, type HbAyar, type HbKayit, type HbPerformans, type HbUrunAyar, type TrendyolSatiri } from './finans';
import { logoDataUri, svgdenPdf, svgdenPng } from './finansPdf';
import { A4, siparisBelgesiSvg, type SaticiBilgisi } from './belgeSablon';
import type { Siparis } from './sema';
import { bosYasalBilgi } from './yonetimSite';
import { trendyolBirlestir } from './trendyolFinans';

const kok = path.join(VERI_KOKU, 'finans');
const kayit = path.join(kok, 'kayitlar.json');
const arsiv = path.join(kok, 'belgeler');
const giderDosyalari = path.join(kok, 'gider-ekleri');
const BULUT_KAYIT = '_finans/kayitlar.json';
const bulutBelge = (id: string) => `_finans/belgeler/${id}`;
const bulutGiderEki = (id: string) => `_finans/gider-ekleri/${id}`;
const bulutFatura = (id: string) => `_finans/faturalar/${id}`;
const faturaDosyalari = path.join(kok, 'faturalar');
let kuyruk: Promise<unknown> = Promise.resolve();

async function yaz(dosya: string, veri: string | Buffer) {
  await fs.mkdir(path.dirname(dosya), { recursive: true, mode: 0o700 });
  const gecici = dosya + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(gecici, veri, { mode: 0o600, flag: 'wx' });
    await fs.rename(gecici, dosya);
  } finally {
    await fs.unlink(gecici).catch(() => undefined);
  }
}

/**
 * Buluttaki kaydın ham (base64) içeriği. Kayıt yoksa undefined.
 * Veritabanı hata verirse HATA FIRLATIR: "okunamadı" ile "kayıt yok" asla karıştırılmaz
 * (eskiden ikisi de undefined dönüyordu; bir bağlantı kopmasından sonraki ilk yazma tüm finansı silebiliyordu).
 */
async function bulutHamOku(bulutYol: string): Promise<string | undefined> {
  const sb = supabaseIstemci();
  if (!sb) return undefined;
  const { data, error } = await sb
    .from('medya_dosyalari')
    .select('veri_base64')
    .eq('yol', bulutYol)
    .eq('aktif', true)
    .maybeSingle();
  if (error) throw new Error('Finans kayıtları şu anda okunamadı (veritabanı bağlantısı). Biraz sonra tekrar deneyin.');
  return data?.veri_base64 || undefined;
}
async function bulutOku(bulutYol: string): Promise<Buffer | undefined> {
  const ham = await bulutHamOku(bulutYol);
  return ham ? Buffer.from(ham, 'base64') : undefined;
}

/** Kayıt okunduktan sonra başka bir sunucu kopyası onu değiştirdiyse yazma reddedilir ve işlem baştan denenir. */
class FinansCakismasi extends Error {}
const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex');
/** finansOku() ile okunan her nesnenin kaynağındaki içeriğin özeti. null: bulutta kayıt yoktu (yalnız ilk kayıt oluşturulabilir). */
const kaynakOzeti = new WeakMap<Finans, string | null>();

/** Koşullu yazma: buluttaki içerik hâlâ `eskiOzet` ise yazar. Yazılan içeriğin özetini döner. */
async function kosulluYaz(bulutYol: string, buf: Buffer, eskiOzet: string | null): Promise<string> {
  const sb = supabaseIstemci();
  if (!sb) throw new Error('Veritabanı bağlantısı yok.');
  const b64 = buf.toString('base64');
  const { error } = await sb.rpc('medya_kosullu_yaz', {
    p_yol: bulutYol, p_icerik_turu: 'application/json', p_veri_base64: b64, p_boyut: Math.max(1, buf.length), p_eski_md5: eskiOzet,
  });
  if (!error) return md5(b64);
  if (cakismaHatasi(error)) throw new FinansCakismasi();
  if (error.code !== 'PGRST202') throw new Error(`Supabase finans kayıt hatası: ${error.message}`);
  // Veritabanı fonksiyonu henüz kurulmamış (migration 20261124120000): yazmadan hemen önce yeniden okuyup karşılaştır.
  const simdiki = await bulutHamOku(bulutYol);
  if ((simdiki ? md5(simdiki) : null) !== eskiOzet) throw new FinansCakismasi();
  const satir = { yol: bulutYol, icerik_turu: 'application/json', boyut: Math.max(1, buf.length), veri_base64: b64, aktif: true };
  const sonuc = eskiOzet === null
    ? await sb.from('medya_dosyalari').insert(satir)
    : await sb.from('medya_dosyalari').update(satir).eq('yol', bulutYol);
  if (sonuc.error?.code === '23505') throw new FinansCakismasi();
  if (sonuc.error) throw new Error(`Supabase finans kayıt hatası: ${sonuc.error.message}`);
  return md5(b64);
}

async function bulutYaz(bulutYol: string, veri: string | Buffer, icerikTuru: string): Promise<void> {
  const sb = supabaseIstemci();
  if (!sb) return;
  const buf = typeof veri === 'string' ? Buffer.from(veri, 'utf8') : veri;
  const { error } = await sb.from('medya_dosyalari').upsert({
    yol: bulutYol,
    icerik_turu: icerikTuru,
    boyut: Math.max(1, buf.length),
    veri_base64: buf.toString('base64'),
    aktif: true,
  });
  if (error) throw new Error(`Supabase finans kayıt hatası: ${error.message}`);
}

export async function finansOku(): Promise<Finans> {
  const ham = await bulutHamOku(BULUT_KAYIT); // veritabanı hatasında burada durur; boş finansa düşmez
  if (ham) {
    let f: Finans;
    try {
      f = FinansSema.parse(JSON.parse(Buffer.from(ham, 'base64').toString('utf8')));
    } catch {
      throw new Error('Finans kayıtları şu anda okunamadı.');
    }
    kaynakOzeti.set(f, md5(ham));
    return f;
  }
  // Bulutta kayıt yok: yerel dosya (geliştirme ya da ilk taşıma). Yazma "yalnız kayıt yoksa oluştur" olarak yapılır,
  // böylece yanlışlıkla boş/eski bir kopya var olan bulut kaydının üstüne yazılamaz.
  try {
    const metin = await fs.readFile(kayit, 'utf8');
    const f = FinansSema.parse(JSON.parse(metin));
    let ozet: string | null = null;
    if (supabaseIstemci()) ozet = await kosulluYaz(BULUT_KAYIT, Buffer.from(metin, 'utf8'), null).catch(() => null);
    kaynakOzeti.set(f, ozet);
    return f;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Finans kayıtları şu anda okunamadı.');
    const bos = FinansSema.parse({ belgeler: [], giderler: [], trendyol: [], olaylar: [] });
    kaynakOzeti.set(bos, null);
    return bos;
  }
}
const bekle = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
/** Aynı sunucuda finans işlemleri sırayla çalışır; başka bir sunucu kopyasıyla çakışırsa işlem baştan (yeniden okuyarak) denenir. */
function sirala<T>(islem: () => Promise<T>): Promise<T> {
  const tekrarli = async (): Promise<T> => {
    for (let deneme = 0; ; deneme++) {
      try {
        return await islem();
      } catch (e) {
        if (!(e instanceof FinansCakismasi)) throw e;
        if (deneme >= 3) throw new Error('Finans kayıtları bu sırada başka bir işlemle güncellendi. Sayfayı yenileyip tekrar deneyin.');
        await bekle(120 * (deneme + 1) + Math.floor(Math.random() * 120));
      }
    }
  };
  const is = kuyruk.then(tekrarli, tekrarli);
  kuyruk = is.catch(() => undefined);
  return is;
}
async function kaydet(f: Finans) {
  const metin = JSON.stringify(FinansSema.parse(f), null, 2);
  if (supabaseIstemci()) {
    const eski = kaynakOzeti.has(f) ? kaynakOzeti.get(f)! : null;
    kaynakOzeti.set(f, await kosulluYaz(BULUT_KAYIT, Buffer.from(metin, 'utf8'), eski));
  }
  // Yerel kopya yalnız bu bilgisayarda (Vercel'in geçici diskindeki eski bir kopyaya hiç güvenilmez)
  if (!process.env.VERCEL) await yaz(kayit, metin).catch(() => undefined);
}
const yol = (klasor: string, id: string) => path.join(klasor, id);
const idGecerli = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const simdi = () => new Date().toISOString();

const TR_YIL = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Istanbul', year: 'numeric' });

/** Belgelerin üst bilgisindeki satıcı bilgileri (Ayarlar > Yasal bilgiler'den). Boş alanlar belgeye yazılmaz. */
export async function saticiBilgisi(): Promise<SaticiBilgisi> {
  const { site } = await magazaOku();
  const dolu = (v?: string) => (v && !bosYasalBilgi(v) ? v : undefined);
  return {
    ad: site.ad, unvan: dolu(site.satici.unvan), adres: dolu(site.satici.adres), telefon: site.telefonGorunen,
    eposta: site.eposta, vergi: dolu(site.satici.vergiDairesiNo), mersis: dolu(site.satici.mersis),
    web: site.url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
  };
}

export type BelgeSecenegi = { not?: string; fiyatGizle?: boolean };
const secenekTemizle = (o: BelgeSecenegi): BelgeSecenegi => ({
  not: o.not?.trim().slice(0, 400) || undefined,
  fiyatGizle: o.fiyatGizle || undefined,
});

async function belgeSvgleri(s: Siparis, tur: BelgeTuru, ayar: BelgeAyarlari, belgeNo: string, tarih: Date, o: BelgeSecenegi, onizleme = false) {
  const [satici, logo] = await Promise.all([saticiBilgisi(), logoDataUri()]);
  return siparisBelgesiSvg({ siparis: s, tur, ayar, satici, belgeNo, belgeTarihi: tarih, logo, onizleme, ...o });
}

/** Kaydetmeden önizleme görseli (ilk sayfa, PNG). ayarDegisikligi verilirse kayıtlı ayarların yerine kullanılır. */
export async function belgeOnizle(s: Siparis, tur: BelgeTuru, o: BelgeSecenegi, ayarDegisikligi?: unknown) {
  const f = await finansOku();
  const ayar = ayarDegisikligi ? BelgeAyarSema.parse(ayarDegisikligi) : f.ayarlar;
  const mevcut = f.belgeler.find((b) => b.siparisNo === s.no && b.tur === tur && belgeGecerli(b));
  const belgeNo = mevcut?.belgeNo ?? ayar.onekler[tur] + '-' + TR_YIL.format(new Date()) + '-?????';
  const svgler = await belgeSvgleri(s, tur, ayar, belgeNo, new Date(), secenekTemizle(o), true);
  return { png: await svgdenPng(svgler[0]!), sayfa: svgler.length };
}

/**
 * Sipariş belgesini düzenler. Aynı sipariş için aynı türde geçerli bir belge varsa YENİSİ OLUŞTURULMAZ, o döner
 * (mükerrer belge ve numara olmaz). yenile=true ise eski belge "iptal" olarak arşivde kalır, yeni numarayla yenisi düzenlenir.
 */
export function belgeHazirla(s: Siparis, tur: BelgeTuru, secenek: BelgeSecenegi & { yenile?: boolean } = {}): Promise<Belge> {
  if (s.paytr?.test) throw new Error('Test siparişleri için finans belgesi düzenlenemez.');
  return sirala(async () => {
    const f = await finansOku();
    const o = secenekTemizle(secenek);
    const gecerli = f.belgeler.find((b) => b.siparisNo === s.no && b.tur === tur && belgeGecerli(b));
    const guncelSablon = (gecerli?.sablonSurumu ?? 1) >= BELGE_SABLON_SURUMU;
    if (gecerli && !secenek.yenile && guncelSablon) {
      const yerelVar = await fs.stat(yol(arsiv, gecerli.id)).then(() => true, () => false);
      const bulutVar = yerelVar || Boolean(await bulutOku(bulutBelge(gecerli.id)));
      if (bulutVar) return gecerli;
    }
    const tarih = simdi();
    let belge: Belge | undefined;
    if (gecerli && !secenek.yenile && !guncelSablon) {
      // Eski yazı tipiyle (kutucuklu) üretilmiş belgeyi iptal etmeden AYNI belgeNo ile tazele
      belge = gecerli;
    } else {
      if (gecerli) {
        gecerli.durum = 'iptal';
        gecerli.guncelleme = tarih;
        gecerli.olaylar.push({ tarih, islem: 'iptal' });
      }
      // Hata almış eski deneme varsa aynı kayıt (ve numara) ile tekrar denenir
      belge = f.belgeler.find((b) => b.siparisNo === s.no && b.tur === tur && (b.durum === 'hata' || b.durum === 'hazirlaniyor'));
      if (!belge) {
        const yil = TR_YIL.format(new Date(tarih));
        const anahtar = tur + '-' + yil;
        const sira = (f.sayaclar[anahtar] ?? 0) + 1;
        f.sayaclar[anahtar] = sira;
        belge = {
          id: randomUUID(), siparisNo: s.no, tur, durum: 'hazirlaniyor', olusturma: tarih, guncelleme: tarih, olaylar: [],
          belgeNo: f.ayarlar.onekler[tur] + '-' + yil + '-' + String(sira).padStart(5, '0'),
        };
        f.belgeler.push(belge);
      }
    }
    const oncekiDurum = belge.durum;
    belge.not = o.not ?? belge.not;
    belge.fiyatGizle = o.fiyatGizle ?? belge.fiyatGizle;
    belge.durum = 'hazirlaniyor';
    belge.guncelleme = tarih;
    belge.olaylar.push({ tarih, islem: 'hazirlaniyor' });
    await kaydet(f);
    try {
      const svgler = await belgeSvgleri(s, tur, f.ayarlar, belge.belgeNo ?? belge.id.slice(0, 8), new Date(belge.olusturma), { not: belge.not, fiyatGizle: belge.fiyatGizle });
      const pdf = await svgdenPdf(svgler, A4.w, A4.h, 175);
      await bulutYaz(bulutBelge(belge.id), pdf, 'application/pdf');
      await yaz(yol(arsiv, belge.id), pdf).catch(() => undefined);
      belge.durum = oncekiDurum === 'gonderildi' ? 'gonderildi' : 'duzenlendi';
      belge.sablonSurumu = BELGE_SABLON_SURUMU;
    } catch (e) {
      console.error('[belge] PDF üretilemedi', s.no, tur, (e as Error)?.message);
      belge.durum = 'hata';
    }
    belge.guncelleme = simdi();
    belge.olaylar.push({ tarih: belge.guncelleme, islem: belge.durum });
    await kaydet(f);
    return belge;
  });
}

export function belgeAyarKaydet(ayar: unknown) {
  return sirala(async () => {
    const f = await finansOku();
    f.ayarlar = BelgeAyarSema.parse(ayar);
    f.olaylar.push({ tarih: simdi(), islem: 'belge-ayarlari' });
    await kaydet(f);
    return f.ayarlar;
  });
}

export function giderSil(id: string) {
  return sirala(async () => {
    const f = await finansOku();
    const g = f.giderler.find((x) => x.id === id);
    if (!g) throw new Error('Gider bulunamadı.');
    f.giderler = f.giderler.filter((x) => x.id !== id);
    f.olaylar.push({ tarih: simdi(), islem: 'gider-silindi:' + id + ':' + g.tarih + ':' + g.kategori + ':' + g.tutar });
    await kaydet(f);
    // Fiş/fatura eki silinmez, arşivde kalır (yanlışlıkla silmeye karşı)
    return g;
  });
}

export function giderGuncelle(id: string, girdi: Omit<Gider, 'id' | 'olusturma' | 'ek'>) {
  return sirala(async () => {
    const f = await finansOku();
    const g = f.giderler.find((x) => x.id === id);
    if (!g) throw new Error('Gider bulunamadı.');
    Object.assign(g, giderSema.pick({ tarih: true, tutar: true, kategori: true, not: true }).parse(girdi));
    f.olaylar.push({ tarih: simdi(), islem: 'gider-duzenlendi:' + id });
    await kaydet(f);
    return g;
  });
}
export function belgeGonderildi(id: string) {
  return sirala(async () => {
    const f = await finansOku();
    const b = f.belgeler.find((x) => x.id === id);
    if (!b || !['duzenlendi', 'gonderildi'].includes(b.durum)) throw new Error('Bu belge henüz gönderime hazır değil.');
    if (b.durum === 'gonderildi') return;
    b.durum = 'gonderildi';
    b.guncelleme = simdi();
    b.olaylar.push({ tarih: b.guncelleme, islem: 'gonderildi' });
    await kaydet(f);
  });
}
export async function belgeOku(id: string) {
  if (!idGecerli(id)) return undefined;
  const finans = await finansOku();
  const b = finans.belgeler.find((x) => x.id === id);
  if (!b || !['gonderildi', 'duzenlendi', 'iptal'].includes(b.durum)) return undefined;
  if ((b.sablonSurumu ?? 1) < BELGE_SABLON_SURUMU && b.durum !== 'iptal') {
    const siparis = (await siparisleriOku().catch(() => [])).find((s) => s.no === b.siparisNo);
    if (siparis) {
      try {
        const yenilenen = await belgeHazirla(siparis, b.tur, { not: b.not, fiyatGizle: b.fiyatGizle });
        const tazeVeri = await fs.readFile(yol(arsiv, yenilenen.id)).catch(() => bulutOku(bulutBelge(yenilenen.id)));
        if (tazeVeri) return { kayit: yenilenen, veri: tazeVeri };
      } catch (e) {
        console.error('[belge] Eski belge otomatik yenilenemedi', b.id, (e as Error)?.message);
      }
    }
  }
  let veri: Buffer | undefined = await fs.readFile(yol(arsiv, b.id)).catch(() => undefined);
  if (!veri) {
    veri = await bulutOku(bulutBelge(b.id));
    if (veri) await yaz(yol(arsiv, b.id), veri).catch(() => undefined);
  }
  return veri ? { kayit: b, veri } : undefined;
}
export function giderEkle(girdi: Omit<Gider, 'id' | 'olusturma' | 'ek'>, dosya?: File) {
  return sirala(async () => {
    const f = await finansOku();
    const id = randomUUID();
    const gider = giderSema.parse({ ...girdi, id, olusturma: simdi() });
    if (dosya?.size) {
      const { veri, tur } = await ekHazirla(dosya);
      const ad = tur === 'image/jpeg' && !/\.jpe?g$/i.test(dosya.name) ? dosya.name.replace(/\.[^.]+$/, '') + '.jpg' : dosya.name;
      gider.ek = { ad: ad.slice(0, 120), boyut: veri.length, tur };
      await bulutYaz(bulutGiderEki(id), veri, tur);
      await yaz(yol(giderDosyalari, id), veri).catch(() => undefined);
    }
    f.giderler.unshift(gider);
    f.olaylar.push({ tarih: gider.olusturma, islem: 'gider-eklendi:' + id });
    try {
      await kaydet(f);
    } catch (err) {
      if (gider.ek) await fs.unlink(yol(giderDosyalari, id)).catch(() => undefined);
      throw err;
    }
    return gider;
  });
}
export async function giderEki(id: string) {
  if (!idGecerli(id)) return undefined;
  const gider = (await finansOku()).giderler.find((g) => g.id === id);
  if (!gider?.ek) return undefined;
  let veri: Buffer | undefined = await fs.readFile(yol(giderDosyalari, id)).catch(() => undefined);
  if (!veri) {
    veri = await bulutOku(bulutGiderEki(id));
    if (veri) await yaz(yol(giderDosyalari, id), veri).catch(() => undefined);
  }
  return veri ? { ...gider.ek, veri } : undefined;
}
export function trendyolKaydet(satirlar: TrendyolSatiri[]) {
  return sirala(async () => {
    const f = await finansOku();
    const tablo = new Map(f.trendyol.map((s) => [s.id, s]));
    // API satırları işlem kimliğiyle birleşir: yalnız iade içeren yeni çekim eski satışı silmez (denetim AUD-003)
    for (const kayit of satirlar) tablo.set(kayit.id, trendyolBirlestir(tablo.get(kayit.id), kayit));
    f.trendyol = [...tablo.values()].sort((a, b) => b.tarih.localeCompare(a.tarih));
    f.olaylar.push({ tarih: simdi(), islem: 'trendyol-ice-aktar:' + satirlar.length });
    await kaydet(f);
  });
}

/** Hepsiburada muhasebe kayıtlarını kimliğe göre birleştirir (durum Paid'e dönünce güncellenir). */
export function hbFinansKaydet(kayitlar: HbKayit[], performans: HbPerformans[], aralik: { bas: string; son: string }) {
  return sirala(async () => {
    const f = await finansOku();
    const tablo = new Map(f.hepsiburada.map((x) => [x.id, x]));
    for (const x of kayitlar) tablo.set(x.id, x);
    f.hepsiburada = [...tablo.values()].sort((a, b) => (b.siparisTarihi ?? b.faturaTarihi ?? '').localeCompare(a.siparisTarihi ?? a.faturaTarihi ?? ''));
    const perf = new Map(f.hbPerformans.map((x) => [x.anahtar, x]));
    for (const x of performans) perf.set(x.anahtar, x);
    f.hbPerformans = [...perf.values()];
    f.hbSonCekim = { tarih: simdi(), bas: aralik.bas, son: aralik.son, kayit: kayitlar.length, performans: performans.length };
    f.olaylar.push({ tarih: simdi(), islem: 'hepsiburada-finans:' + kayitlar.length + '/' + performans.length });
    await kaydet(f);
  });
}
export function hbAyarKaydet(ayar: HbAyar) {
  return sirala(async () => {
    const f = await finansOku();
    f.hbAyar = HbAyarSema.parse(ayar);
    f.olaylar.push({ tarih: simdi(), islem: 'hepsiburada-ayar' });
    await kaydet(f);
  });
}
export function hbUrunKaydet(urunId: string, ayar: HbUrunAyar) {
  if (!/^[a-z0-9-]{1,80}$/.test(urunId)) throw new Error('Ürün bulunamadı.');
  return sirala(async () => {
    const f = await finansOku();
    f.hbUrunler[urunId] = HbUrunAyarSema.parse(ayar);
    await kaydet(f);
  });
}

/** Birden çok ürünün Hepsiburada ayarını tek kayıtta günceller (ör. komisyonlar Hepsiburada'dan çekilince). */
export function hbUrunleriGuncelle(degistir: (h: Record<string, HbUrunAyar>) => void) {
  return sirala(async () => {
    const f = await finansOku();
    degistir(f.hbUrunler);
    for (const [id, a] of Object.entries(f.hbUrunler)) f.hbUrunler[id] = HbUrunAyarSema.parse(a);
    await kaydet(f);
  });
}

/** Canlı sunucu (Vercel) tek istekte ~4,5 MB kabul eder; ekranlarda da bu sınır yazar. */
export const EK_SINIRI_MB = 4;
/**
 * Yüklenen fiş/fatura dosyasını doğrular. PDF içeriğinden tanınır (tarayıcı türü "application/octet-stream" gönderse de).
 * Görseller küçültülür; WebP gelirse (panel telefondan çekilen fotoğrafı küçültürken WebP yapabilir) JPEG'e çevrilir.
 * HEIC/AVIF kabul edilmez (açığı bilinen görsel çözücü yolları).
 */
async function ekHazirla(dosya: File, sinir = EK_SINIRI_MB * 1024 * 1024) {
  if (dosya.size > sinir) throw new Error(`Dosya ${Math.round(sinir / 1048576)} MB veya daha küçük olmalı.`);
  let veri = Buffer.from(await dosya.arrayBuffer());
  if (dosya.type === 'application/pdf' || veri.subarray(0, 5).toString() === '%PDF-') {
    if (veri.subarray(0, 5).toString() !== '%PDF-' || !veri.subarray(-1024).includes('%%EOF')) throw new Error('PDF dosyası bozuk görünüyor.');
    return { veri, tur: 'application/pdf' as const };
  }
  try {
    const gorsel = sharp(veri, { failOn: 'error', limitInputPixels: 28_000_000 });
    const { format } = await gorsel.metadata();
    if (format !== 'png' && format !== 'jpeg' && format !== 'webp') throw new Error();
    const kucuk = gorsel.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true });
    if (format === 'png') return { veri: Buffer.from(await kucuk.png().toBuffer()), tur: 'image/png' as const };
    veri = Buffer.from(await kucuk.flatten({ background: '#ffffff' }).jpeg({ quality: 88, mozjpeg: true }).toBuffer());
    return { veri, tur: 'image/jpeg' as const };
  } catch {
    throw new Error('Geçerli bir PDF, JPG veya PNG dosyası seçin.');
  }
}

/** Fatura merkezi: kesilen faturayı (no, tarih, dosya) kaydeder. Aynı siparişte geçerli fatura varsa reddeder. */
export function faturaKaydet(girdi: Omit<FaturaKaydi, 'id' | 'olusturma' | 'ek' | 'iletim' | 'iptal'>, dosya?: File) {
  return sirala(async () => {
    const f = await finansOku();
    if (f.faturalar.some((x) => !x.iptal && x.kanal === girdi.kanal && x.kayit === girdi.kayit)) throw new Error('Bu siparişin faturası zaten kayıtlı. Yenisini kesecekseniz önce eskisini iptal edin.');
    if (f.faturalar.some((x) => !x.iptal && x.no.toUpperCase() === girdi.no.toUpperCase())) throw new Error('Bu fatura numarası başka bir siparişte kayıtlı.');
    const id = randomUUID();
    const kayit = faturaKaydiSema.parse({ ...girdi, id, olusturma: simdi(), iletim: { durum: 'bekliyor' } });
    let ek: { veri: Buffer; tur: 'application/pdf' | 'image/jpeg' | 'image/png' } | undefined;
    if (dosya?.size) {
      ek = await ekHazirla(dosya);
      const uzanti = ek.tur === 'application/pdf' ? 'pdf' : ek.tur === 'image/png' ? 'png' : 'jpg';
      kayit.ek = { ad: `Fatura-${kayit.no}.${uzanti}`.replace(/[^A-Za-z0-9._-]/g, '_'), boyut: ek.veri.length, tur: ek.tur };
      await bulutYaz(bulutFatura(id), ek.veri, ek.tur);
      await yaz(yol(faturaDosyalari, id), ek.veri).catch(() => undefined);
    }
    f.faturalar.unshift(kayit);
    f.olaylar.push({ tarih: kayit.olusturma, islem: 'fatura-kaydedildi:' + kayit.kanal + ':' + kayit.siparisNo });
    await kaydet(f);
    return { kayit, ek };
  });
}
export async function faturaEki(id: string) {
  if (!idGecerli(id)) return undefined;
  const k = (await finansOku()).faturalar.find((x) => x.id === id);
  if (!k?.ek) return undefined;
  let veri: Buffer | undefined = await fs.readFile(yol(faturaDosyalari, id)).catch(() => undefined);
  if (!veri) {
    veri = await bulutOku(bulutFatura(id));
    if (veri) await yaz(yol(faturaDosyalari, id), veri).catch(() => undefined);
  }
  return veri ? { kayit: k, veri } : undefined;
}
/**
 * Belge / gider eki / fatura dosyasını finans kaydını yeniden okumadan getirir (toplu arşiv ve yedek için).
 * Kaydın varlığı ve geçerliliği çağıran tarafta, zaten okunmuş finans nesnesinden kontrol edilir
 * (eskiden her dosya için finans kaydı baştan okunuyordu — denetim AUD-021).
 */
export async function ekDosyasiOku(tur: 'belge' | 'gider' | 'fatura', id: string): Promise<Buffer | undefined> {
  if (!idGecerli(id)) return undefined;
  const [klasor, bulutYol] = tur === 'belge' ? [arsiv, bulutBelge(id)] : tur === 'gider' ? [giderDosyalari, bulutGiderEki(id)] : [faturaDosyalari, bulutFatura(id)];
  let veri: Buffer | undefined = await fs.readFile(yol(klasor, id)).catch(() => undefined);
  if (!veri) {
    veri = await bulutOku(bulutYol);
    if (veri) await yaz(yol(klasor, id), veri).catch(() => undefined);
  }
  return veri;
}
/** Canlı sunucu (Vercel) tek yanıtta ~4,5 MB gönderebilir; arşivler buna göre sınırlanır */
export const ARSIV_SINIRI = process.env.VERCEL ? 4 * 1024 * 1024 : 45 * 1024 * 1024;
export const ekUzantisi = (tur: string) => (tur === 'application/pdf' ? 'pdf' : tur === 'image/png' ? 'png' : 'jpg');

export function faturaGuncelle(id: string, degistir: (k: FaturaKaydi) => void) {
  if (!idGecerli(id)) throw new Error('Fatura bulunamadı.');
  return sirala(async () => {
    const f = await finansOku();
    const k = f.faturalar.find((x) => x.id === id);
    if (!k) throw new Error('Fatura bulunamadı.');
    degistir(k);
    f.olaylar.push({ tarih: simdi(), islem: 'fatura-guncellendi:' + id });
    await kaydet(f);
    return k;
  });
}

/** Kayıtlı bir faturaya sonradan PDF/görsel dosyası ekler veya mevcut dosyayı günceller. */
export function faturaDosyaKaydet(id: string, dosya: File) {
  if (!idGecerli(id)) throw new Error('Fatura bulunamadı.');
  return sirala(async () => {
    const f = await finansOku();
    const k = f.faturalar.find((x) => x.id === id && !x.iptal);
    if (!k) throw new Error('Fatura bulunamadı.');
    const ek = await ekHazirla(dosya);
    const uzanti = ek.tur === 'application/pdf' ? 'pdf' : ek.tur === 'image/png' ? 'png' : 'jpg';
    const ad = `Fatura-${k.no}.${uzanti}`.replace(/[^A-Za-z0-9._-]/g, '_');
    k.ek = { ad, boyut: ek.veri.length, tur: ek.tur };
    await bulutYaz(bulutFatura(k.id), ek.veri, ek.tur);
    await yaz(yol(faturaDosyalari, k.id), ek.veri).catch(() => undefined);
    f.olaylar.push({ tarih: simdi(), islem: 'fatura-dosya-yuklendi:' + k.id });
    await kaydet(f);
    return { kayit: k, ek: { ...ek, ad } };
  });
}
