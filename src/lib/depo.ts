/**
 * Veri deposu — dosya tabanlı (veri/ klasörü).
 * • Her yazma atomiktir (geçici dosya + yeniden adlandırma) ve sıraya alınır.
 * • Mağaza her kaydedilişinde veri/yedekler/ altına yedek alınır (son 50).
 * • Arayüz async'tir: ileride Supabase/Postgres'e geçmek için yalnızca bu dosya değişir.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { MagazaSema, SiparisSema, type Magaza, type Siparis } from './sema';
import { magazaTutarlilik } from './katalog';

const KOK = path.resolve(process.env.VERI_KLASORU || 'veri');
const MAGAZA = path.join(KOK, 'magaza.json');
const SIPARISLER = path.join(KOK, 'siparisler.json');
const YEDEK = path.join(KOK, 'yedekler');
export const YUKLEME_KOKU = path.join(KOK, 'yuklemeler');
/** Onaylanan ön bilgilendirme formu ve sözleşme (sipariş başına bir dosya; ispat için en az 3 yıl saklanır) */
const SOZLESMELER = path.join(KOK, 'sozlesmeler');

export interface SozlesmeKaydi {
  no: string;
  surum: string;
  onayTarihi: string;
  ip: string;
  tarayici?: string;
  onBilgilendirme: string;
  mesafeliSatis: string;
}

const sozlesmeDosyasi = (no: string) => path.join(SOZLESMELER, `${no.replace(/[^A-Za-z0-9-]/g, '')}.json`);

export function sozlesmeKaydet(k: SozlesmeKaydi): Promise<void> {
  return sirala(() => atomikYaz(sozlesmeDosyasi(k.no), JSON.stringify(k)));
}

export async function sozlesmeOku(no: string): Promise<SozlesmeKaydi | null> {
  try { return JSON.parse(await fs.readFile(sozlesmeDosyasi(no), 'utf8')) as SozlesmeKaydi; } catch { return null; }
}

let kuyruk: Promise<unknown> = Promise.resolve();
function sirala<T>(is: () => Promise<T>): Promise<T> {
  const p = kuyruk.then(is, is);
  kuyruk = p.catch(() => undefined);
  return p;
}

async function atomikYaz(dosya: string, veri: string): Promise<void> {
  await fs.mkdir(path.dirname(dosya), { recursive: true });
  const gecici = `${dosya}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(gecici, veri, 'utf8');
  await fs.rename(gecici, dosya);
}

/* ---------------- Mağaza ---------------- */
let magazaOnbellek: { mtime: number; veri: Magaza } | undefined;

export async function magazaOku(): Promise<Magaza> {
  const st = await fs.stat(MAGAZA);
  if (magazaOnbellek && magazaOnbellek.mtime === st.mtimeMs) return magazaOnbellek.veri;
  const veri = MagazaSema.parse(JSON.parse(await fs.readFile(MAGAZA, 'utf8')));
  magazaOnbellek = { mtime: st.mtimeMs, veri };
  return veri;
}

export class DogrulamaHatasi extends Error {
  constructor(readonly hatalar: string[]) { super(hatalar.join('\n')); }
}

/** Mağazayı güncelle: değişiklik fonksiyonu kopya üzerinde çalışır; geçersizse hiçbir şey yazılmaz. */
export function magazaGuncelle(degistir: (m: Magaza) => void): Promise<Magaza> {
  return sirala(async () => {
    const mevcut = await magazaOku();
    const kopya: Magaza = structuredClone(mevcut);
    degistir(kopya);
    const sonuc = MagazaSema.safeParse(kopya);
    if (!sonuc.success) {
      throw new DogrulamaHatasi(sonuc.error.issues.map((i) => `${i.path.join(' › ')}: ${i.message}`));
    }
    const tutarlilik = magazaTutarlilik(sonuc.data);
    if (tutarlilik.length) throw new DogrulamaHatasi(tutarlilik);
    const yeni = { ...sonuc.data, surum: mevcut.surum + 1, guncelleme: new Date().toISOString() };
    await yedekAl();
    await atomikYaz(MAGAZA, JSON.stringify(yeni, null, 2));
    magazaOnbellek = undefined;
    return yeni;
  });
}

async function yedekAl(): Promise<void> {
  await fs.mkdir(YEDEK, { recursive: true });
  const ad = `magaza-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await fs.copyFile(MAGAZA, path.join(YEDEK, ad)).catch(() => undefined);
  const dosyalar = (await fs.readdir(YEDEK)).filter((f) => f.startsWith('magaza-')).sort();
  for (const eski of dosyalar.slice(0, Math.max(0, dosyalar.length - 50))) await fs.unlink(path.join(YEDEK, eski)).catch(() => undefined);
}

/* ---------------- Siparişler ---------------- */
let siparisOnbellek: { mtime: number; veri: Siparis[] } | undefined;

export async function siparisleriOku(): Promise<Siparis[]> {
  let st;
  try { st = await fs.stat(SIPARISLER); } catch { return []; }
  if (siparisOnbellek && siparisOnbellek.mtime === st.mtimeMs) return siparisOnbellek.veri;
  const veri = SiparisSema.array().parse(JSON.parse(await fs.readFile(SIPARISLER, 'utf8')));
  siparisOnbellek = { mtime: st.mtimeMs, veri };
  return veri;
}

export function siparisEkle(s: Siparis): Promise<Siparis> {
  return sirala(async () => {
    const liste = await siparisleriOku();
    const yeni = SiparisSema.parse(s);
    await atomikYaz(SIPARISLER, JSON.stringify([yeni, ...liste], null, 2));
    siparisOnbellek = undefined;
    return yeni;
  });
}

export function siparisGuncelle(no: string, degistir: (s: Siparis) => void): Promise<Siparis> {
  return sirala(async () => {
    const liste = structuredClone(await siparisleriOku());
    const s = liste.find((x) => x.no === no);
    if (!s) throw new Error('Sipariş bulunamadı');
    degistir(s);
    SiparisSema.parse(s);
    await atomikYaz(SIPARISLER, JSON.stringify(liste, null, 2));
    siparisOnbellek = undefined;
    return s;
  });
}

/** Son `gun` günde satılan adetler (ödeme bekleyen ve iptal edilenler hariç) */
export async function satisAdetleri(gun = 30): Promise<Map<string, number>> {
  const sinir = Date.now() - gun * 864e5;
  const m = new Map<string, number>();
  for (const s of await siparisleriOku()) {
    if (s.durum === 'odeme-bekliyor' || s.durum === 'iptal' || Date.parse(s.tarih) < sinir) continue;
    for (const k of s.kalemler) for (const p of k.parcalar) m.set(p.urunId, (m.get(p.urunId) ?? 0) + p.adet * k.adet);
  }
  return m;
}

/* ---------------- Görseller ---------------- */
const IZINLI = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/heic', 'image/heif']);
export const MAKS_GORSEL_BOYUT = 12 * 1024 * 1024;

/**
 * Yüklenen görseli yeniden kodlar (EXIF/konum bilgisi silinir, zararlı içerik etkisizleşir),
 * en fazla 1600 px'e küçültür ve WebP olarak kaydeder. Dönen yol sitede doğrudan kullanılır.
 */
export async function gorselKaydet(dosya: File, klasor: string): Promise<string> {
  if (!IZINLI.has(dosya.type)) throw new Error(`Desteklenmeyen dosya türü: ${dosya.type || 'bilinmiyor'}`);
  if (dosya.size > MAKS_GORSEL_BOYUT) throw new Error('Görsel 12 MB’tan büyük olamaz');
  const guvenliKlasor = klasor.replace(/[^a-z0-9-]/g, '');
  const ad = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}.webp`;
  const hedefKlasor = path.join(YUKLEME_KOKU, guvenliKlasor);
  await fs.mkdir(hedefKlasor, { recursive: true });
  const girdi = Buffer.from(await dosya.arrayBuffer());
  const tampon = await beyazKenarKirp(await sharp(girdi, { failOn: 'error' }).rotate().toBuffer());
  await sharp(tampon)
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 86 })
    .toFile(path.join(hedefKlasor, ad));
  return `/medya/${guvenliKlasor}/${ad}`;
}

/**
 * Beyaz fonlu ürün fotoğraflarında ürünün etrafındaki fazla boşluğu kırpar, %4 nefes payı bırakır
 * (ürün kartta ve galeride daha büyük görünür). Köşesi beyaz olmayan fotoğraflara dokunmaz.
 */
async function beyazKenarKirp(tampon: Buffer): Promise<Buffer> {
  try {
    const kose = await sharp(tampon).removeAlpha().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    if (![...kose].every((v) => v >= 240)) return tampon;
    const { data, info } = await sharp(tampon).trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
    const pay = Math.round(Math.max(info.width, info.height) * 0.04);
    return await sharp(data).extend({ top: pay, bottom: pay, left: pay, right: pay, background: '#ffffff' }).toBuffer();
  } catch {
    return tampon;
  }
}

export async function gorselSil(src: string): Promise<void> {
  if (!src.startsWith('/medya/')) return; // public/ altındaki sabit görseller silinmez
  const tam = path.resolve(YUKLEME_KOKU, '.' + src.slice('/medya'.length));
  if (!tam.startsWith(YUKLEME_KOKU + path.sep)) return;
  await fs.unlink(tam).catch(() => undefined);
}
