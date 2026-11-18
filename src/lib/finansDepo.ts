import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { magazaOku, VERI_KOKU } from './depo';
import { BelgeAyarSema, FinansSema, belgeGecerli, giderSema, type Belge, type BelgeAyarlari, type BelgeTuru, type Finans, type Gider, type TrendyolSatiri } from './finans';
import { logoDataUri, svgdenPdf, svgdenPng } from './finansPdf';
import { A4, siparisBelgesiSvg, type SaticiBilgisi } from './belgeSablon';
import type { Siparis } from './sema';
import { bosYasalBilgi } from './yonetimSite';

const kok = path.join(VERI_KOKU, 'finans');
const kayit = path.join(kok, 'kayitlar.json');
const arsiv = path.join(kok, 'belgeler');
const giderDosyalari = path.join(kok, 'gider-ekleri');
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

export async function finansOku(): Promise<Finans> {
  try {
    return FinansSema.parse(JSON.parse(await fs.readFile(kayit, 'utf8')));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return FinansSema.parse({ belgeler: [], giderler: [], trendyol: [], olaylar: [] });
    throw new Error('Finans kayıtları şu anda okunamadı.');
  }
}
function sirala<T>(islem: () => Promise<T>): Promise<T> {
  const is = kuyruk.then(islem, islem);
  kuyruk = is.catch(() => undefined);
  return is;
}
async function kaydet(f: Finans) {
  await yaz(kayit, JSON.stringify(FinansSema.parse(f), null, 2));
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
    if (gecerli && !secenek.yenile && await fs.stat(yol(arsiv, gecerli.id)).then(() => true, () => false)) return gecerli;
    const tarih = simdi();
    if (gecerli) {
      gecerli.durum = 'iptal';
      gecerli.guncelleme = tarih;
      gecerli.olaylar.push({ tarih, islem: 'iptal' });
    }
    // Hata almış eski deneme varsa aynı kayıt (ve numara) ile tekrar denenir
    let belge = f.belgeler.find((b) => b.siparisNo === s.no && b.tur === tur && (b.durum === 'hata' || b.durum === 'hazirlaniyor'));
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
    belge.not = o.not;
    belge.fiyatGizle = o.fiyatGizle;
    belge.durum = 'hazirlaniyor';
    belge.guncelleme = tarih;
    belge.olaylar.push({ tarih, islem: 'hazirlaniyor' });
    await kaydet(f);
    try {
      const svgler = await belgeSvgleri(s, tur, f.ayarlar, belge.belgeNo ?? belge.id.slice(0, 8), new Date(belge.olusturma), o);
      await yaz(yol(arsiv, belge.id), await svgdenPdf(svgler, A4.w, A4.h, 150));
      belge.durum = 'duzenlendi';
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
  const b = (await finansOku()).belgeler.find((x) => x.id === id);
  if (!b || !['gonderildi', 'duzenlendi', 'iptal'].includes(b.durum)) return undefined;
  const veri = await fs.readFile(yol(arsiv, b.id)).catch(() => undefined);
  return veri ? { kayit: b, veri } : undefined;
}
export function giderEkle(girdi: Omit<Gider, 'id' | 'olusturma' | 'ek'>, dosya?: File) {
  return sirala(async () => {
    const f = await finansOku();
    const id = randomUUID();
    const gider = giderSema.parse({ ...girdi, id, olusturma: simdi() });
    if (dosya?.size) {
      if (dosya.size > 10 * 1024 * 1024) throw new Error('Gider eki 10 MB veya daha küçük olmalı.');
      let veri = Buffer.from(await dosya.arrayBuffer());
      let tur: 'application/pdf' | 'image/jpeg' | 'image/png';
      if (dosya.type === 'application/pdf' && veri.subarray(0, 5).toString() === '%PDF-' && veri.subarray(-1024).includes('%%EOF')) {
        tur = 'application/pdf';
      } else {
        try {
          const gorsel = sharp(veri, { failOn: 'error', limitInputPixels: 28_000_000 });
          const { format } = await gorsel.metadata();
          if (format !== 'png' && format !== 'jpeg') throw new Error();
          tur = format === 'png' ? 'image/png' : 'image/jpeg';
          veri = Buffer.from(await gorsel.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).toBuffer());
        } catch {
          throw new Error('Geçerli bir PDF, JPG veya PNG dosyası seçin.');
        }
      }
      gider.ek = { ad: dosya.name.slice(0, 120), boyut: veri.length, tur };
      await yaz(yol(giderDosyalari, id), veri);
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
  const veri = await fs.readFile(yol(giderDosyalari, id)).catch(() => undefined);
  return veri ? { ...gider.ek, veri } : undefined;
}
export function trendyolKaydet(satirlar: TrendyolSatiri[]) {
  return sirala(async () => {
    const f = await finansOku();
    const tablo = new Map(f.trendyol.map((s) => [s.id, s]));
    for (const kayit of satirlar) tablo.set(kayit.id, kayit);
    f.trendyol = [...tablo.values()].sort((a, b) => b.tarih.localeCompare(a.tarih));
    f.olaylar.push({ tarih: simdi(), islem: 'trendyol-ice-aktar:' + satirlar.length });
    await kaydet(f);
  });
}
