/**
 * Veri deposu — Supabase (Postgres + Storage) birincil, yerel dosya sistemi (veri/) senkron yedek.
 * • SUPABASE_URL ve SUPABASE_KEY tanımlıysa tüm okuma/yazma işlemleri Supabase üzerinde çalışır.
 * • Her mağaza güncellemesinde Supabase `magaza_yedekler` tablosuna (ve yerel `veri/yedekler/` klasörüne) yedek alınır.
 * • Ürün, kategori, set, site ayarları, siparişler, sözleşmeler ve medya dosyaları Supabase tablolarında tutulur.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './supabase.types';
import { MagazaSema, SiparisSema, type Magaza, type Siparis } from './sema';
import { magazaTutarlilik } from './katalog';
import { magazaDegisikliginiBildir } from './indexnow';
import { arkaPlanda } from './arkaPlan';

const ortam = (ad: string): string | undefined =>
  process.env[ad] ?? (import.meta.env as Record<string, string | undefined>)[ad];

const varsayilanVeriKoku = process.env.VERCEL ? path.join(process.env.TMPDIR ?? '/tmp', 'veri') : 'veri';
const KOK = path.resolve(process.env.VERI_KLASORU ?? import.meta.env.VERI_KLASORU ?? varsayilanVeriKoku);
export const VERI_KOKU = KOK;
const MAGAZA = path.join(KOK, 'magaza.json');
const SIPARISLER = path.join(KOK, 'siparisler.json');
const YEDEK = path.join(KOK, 'yedekler');
export const YUKLEME_KOKU = path.join(KOK, 'yuklemeler');
/** Onaylanan ön bilgilendirme formu ve sözleşme (sipariş başına bir kayıt; ispat için en az 3 yıl saklanır) */
const SOZLESMELER = path.join(KOK, 'sozlesmeler');

let sbIstemci: SupabaseClient<Database> | null | undefined;
export function supabaseIstemci(): SupabaseClient<Database> | null {
  if (sbIstemci !== undefined) return sbIstemci;
  const url = process.env.SUPABASE_URL ?? import.meta.env.SUPABASE_URL ?? ortam('SUPABASE_URL');
  const key = process.env.SUPABASE_KEY ?? import.meta.env.SUPABASE_KEY ?? ortam('SUPABASE_KEY');
  const sunucuAnahtari =
    process.env.SUPABASE_SUNUCU_ANAHTARI ?? import.meta.env.SUPABASE_SUNUCU_ANAHTARI ?? ortam('SUPABASE_SUNUCU_ANAHTARI');
  if (!url || !key) {
    sbIstemci = null;
    return null;
  }
  sbIstemci = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: sunucuAnahtari ? { 'x-sunucu-anahtari': sunucuAnahtari } : {},    },
  });
  return sbIstemci;
}

export const supabaseBagliMi = (): boolean => !!supabaseIstemci();

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
  return sirala(async () => {
    const sb = supabaseIstemci();
    if (sb) {
      const { error } = await sb.from('sozlesmeler').upsert({
        no: k.no,
        surum: k.surum,
        onay_tarihi: k.onayTarihi,
        ip: k.ip,
        tarayici: k.tarayici ?? null,
        on_bilgilendirme: k.onBilgilendirme,
        mesafeli_satis: k.mesafeliSatis,
      });
      if (error) throw new Error(`Supabase sözleşme kayıt hatası: ${error.message}`);
    }
    await atomikYaz(sozlesmeDosyasi(k.no), JSON.stringify(k)).catch(() => undefined);
  });
}

export async function sozlesmeOku(no: string): Promise<SozlesmeKaydi | null> {
  const sb = supabaseIstemci();
  if (sb) {
    const { data, error } = await sb
      .from('sozlesmeler')
      .select('no, surum, onay_tarihi, ip, tarayici, on_bilgilendirme, mesafeli_satis')
      .eq('no', no)
      .maybeSingle();
    if (!error && data) {
      return {
        no: data.no,
        surum: data.surum,
        onayTarihi: data.onay_tarihi,
        ip: data.ip,
        tarayici: data.tarayici ?? undefined,
        onBilgilendirme: data.on_bilgilendirme,
        mesafeliSatis: data.mesafeli_satis,
      };
    }
  }
  try { return JSON.parse(await fs.readFile(sozlesmeDosyasi(no), 'utf8')) as SozlesmeKaydi; } catch { return null; }
}

let kuyruk: Promise<unknown> = Promise.resolve();
function sirala<T>(is: () => Promise<T>): Promise<T> {
  const p = kuyruk.then(is, is);
  kuyruk = p.catch(() => undefined);
  return p;
}
/** Mağaza/stok yazan diğer modüller (pazaryeri) aynı sıradan geçer: aynı sunucuda iki yazma iç içe girmez */
export { sirala as depoSirasi };

export async function atomikYaz(dosya: string, veri: string): Promise<void> {
  await fs.mkdir(path.dirname(dosya), { recursive: true });
  const gecici = `${dosya}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(gecici, veri, 'utf8');
  await fs.rename(gecici, dosya);
}

/* ---------------- Mağaza ---------------- */
let magazaOnbellek: { mtime: number; zaman: number; veri: Magaza } | undefined;
const yedekMagazalar = new WeakSet<Magaza>();
export const magazaYedektenMi = (veri: Magaza): boolean => yedekMagazalar.has(veri);
const ONBELLEK_SURE_MS = 1000;
let bulutOkumaHatasi = false;
export const supabaseDurumu = () => !supabaseBagliMi() ? 'yerel' : bulutOkumaHatasi ? 'hata' : 'bagli';

/*
 * Aynı anda gelen okumalar tek veritabanı isteğini paylaşır: bir panel sayfası açılırken ara katman,
 * sayfa ve yan menü aynı veriyi ister; her biri ayrı ayrı Supabase'e gitmesin.
 * "Nesil" her yazmada artar: yazmadan önce başlamış bir okuma, eski veriyi önbelleğe geri koyamaz.
 */
let magazaNesil = 0;
let magazaOkunan: Promise<Magaza> | undefined;
function magazaOnbellegiSil() { magazaOnbellek = undefined; magazaNesil++; magazaOkunan = undefined; }

export function magazaOku(kayitIcin = false): Promise<Magaza> {
  if (kayitIcin) return magazaOkuIc(true);
  if (supabaseIstemci() && magazaOnbellek && Date.now() - magazaOnbellek.zaman < ONBELLEK_SURE_MS) return Promise.resolve(magazaOnbellek.veri);
  if (magazaOkunan) return magazaOkunan;
  const is: Promise<Magaza> = magazaOkuIc(false).finally(() => { if (magazaOkunan === is) magazaOkunan = undefined; });
  magazaOkunan = is;
  return is;
}

async function magazaOkuIc(kayitIcin: boolean): Promise<Magaza> {
  const nesil = magazaNesil;
  const sakla = (o: NonNullable<typeof magazaOnbellek>) => { if (nesil === magazaNesil) magazaOnbellek = o; };
  const sb = supabaseIstemci();
  if (sb) {
    const { data, error } = await sb.rpc('magaza_oku');
    if (!error && data) {
      bulutOkumaHatasi = false;
      const veri = MagazaSema.parse(data);
      sakla({ mtime: 0, zaman: Date.now(), veri });
      return veri;
    }
    if (!error && data === null) {
      // Veritabanı henüz boşsa yerel magaza.json ile ilk kurulumu yap
      const yerel = MagazaSema.parse(JSON.parse(await fs.readFile(MAGAZA, 'utf8')));
      const { data: kaydedilen, error: kayitHata } = await sb.rpc('magaza_kaydet', { yeni_magaza: yerel });
      if (!kayitHata && kaydedilen) {
        bulutOkumaHatasi = false;
        const veri = MagazaSema.parse(kaydedilen);
        sakla({ mtime: 0, zaman: Date.now(), veri });
        return veri;
      }
    }
    bulutOkumaHatasi = true;
    if (kayitIcin) throw new Error('Mağaza veritabanına erişilemiyor. Lütfen tekrar deneyin.');
    if (error) console.error('[Supabase] magaza_oku hatası, yerel yedeğe dönülüyor:', error.message);
  }

  const st = await fs.stat(MAGAZA);
  if (magazaOnbellek && magazaOnbellek.mtime === st.mtimeMs && magazaOnbellek.mtime > 0) return magazaOnbellek.veri;
  const veri = MagazaSema.parse(JSON.parse(await fs.readFile(MAGAZA, 'utf8')));
  if (sb) yedekMagazalar.add(veri);
  sakla({ mtime: st.mtimeMs, zaman: Date.now(), veri });
  return veri;
}

export class DogrulamaHatasi extends Error {
  constructor(readonly hatalar: string[]) { super(hatalar.join('\n')); }
}

/**
 * Mağazayı güncelle: değişiklik fonksiyonu kopya üzerinde çalışır; geçersizse hiçbir şey yazılmaz.
 * `sebep`: stok değişirse stok hareket defterinde görünecek açıklama (ör. "Panel: hızlı stok düzeltme").
 */
export function magazaGuncelle(degistir: (m: Magaza) => void, sebep?: string): Promise<Magaza> {
  return sirala(() => magazaYaz(degistir, sebep));
}

/**
 * "Veri bu sırada değişti" çakışması. Veritabanı PT409 döndürür (HTTP 409).
 * 40001 KULLANILMAZ: PostgREST bu kodu otomatik ve sonsuz tekrar dener, istek asılı kalır.
 * (40001 yalnızca eski fonksiyon sürümü için tanınır.)
 */
export const cakismaHatasi = (e: { code?: string } | null | undefined) => e?.code === 'PT409' || e?.code === '40001';

async function magazaYaz(degistir: (m: Magaza) => void, sebep?: string): Promise<Magaza> {
  magazaOnbellegiSil();
  const mevcut = await magazaOku(true);
  const yeni = magazaAdayi(mevcut, degistir);
  const sb = supabaseIstemci();
  if (sb) {
    // Sebepli kayıt (stok defteri için); veritabanında yoksa eski fonksiyonlara düşer
    let kayit = sebep
      ? await sb.rpc('panel_magaza_kaydet_sebep', { yeni_magaza: yeni, beklenen_surum: mevcut.surum, sebep: sebep.slice(0, 200) })
      : await sb.rpc('panel_magaza_kaydet', { yeni_magaza: yeni, beklenen_surum: mevcut.surum });
    if (sebep && kayit.error?.code === 'PGRST202') kayit = await sb.rpc('panel_magaza_kaydet', { yeni_magaza: yeni, beklenen_surum: mevcut.surum });
    if (cakismaHatasi(kayit.error)) throw new DogrulamaHatasi(['Mağaza bu sırada güncellendi. Sayfayı yenileyip tekrar deneyin.']);
    if (kayit.error) throw new Error('Mağaza veritabanına kaydedilemedi.');
    const kaydedilen = kayit.data ? MagazaSema.parse(kayit.data) : yeni;
    await magazaYansit(kaydedilen);
    // Değişen ürün sayfalarını Bing/Yandex'e bildir ve stok uyarısı gönder (yalnız canlıda).
    // Kayıt tamamlandı; bu işler arka planda sürer, panel düğmesi beklemez.
    arkaPlanda(magazaDegisikliginiBildir(mevcut, kaydedilen), 'IndexNow bildirimi');
    arkaPlanda(stokSonrasi(mevcut, kaydedilen), 'stok uyarısı');
    return kaydedilen;
  }

  await yedekAl();
  await atomikYaz(MAGAZA, JSON.stringify(yeni, null, 2));
  magazaOnbellegiSil();
  await yerelStokDefteri(mevcut, yeni, sebep).catch((e) => console.error('[stok] Yerel hareket kaydedilemedi:', e));
  await stokSonrasi(mevcut, yeni);
  return yeni;
}

/* ---------------- Stok hareketleri ve stok uyarıları ---------------- */
export interface StokHareketi { tarih: string; urunId: string; onceki: number; sonraki: number; sebep: string }
export const YEREL_STOK_DEFTERI = path.join(KOK, 'stok-hareketleri.json');

/**
 * Yerel (Supabase'siz) çalışmada stok defteri. Supabase'te bu işi veritabanı tetikleyicisi yapar
 * (urunler.stok her değiştiğinde; bkz. migration 20261119150000_pazaryeri_ve_stok.sql).
 */
export async function yerelStokDefteri(eski: Magaza, yeni: Magaza, sebep?: string): Promise<void> {
  if (supabaseIstemci()) return;
  const tarih = new Date().toISOString();
  const eskiStok = new Map(eski.urunler.map((u) => [u.id, u.stok]));
  const satirlar: StokHareketi[] = yeni.urunler
    .filter((u) => (eskiStok.get(u.id) ?? 0) !== u.stok)
    .map((u) => ({ tarih, urunId: u.id, onceki: eskiStok.get(u.id) ?? 0, sonraki: u.stok, sebep: (sebep || (eskiStok.has(u.id) ? 'Panel' : 'Yeni ürün')).slice(0, 200) }));
  if (!satirlar.length) return;
  let liste: StokHareketi[] = [];
  try { liste = JSON.parse(await fs.readFile(YEREL_STOK_DEFTERI, 'utf8')) as StokHareketi[]; } catch { /* ilk kayıt */ }
  await atomikYaz(YEREL_STOK_DEFTERI, JSON.stringify([...satirlar, ...liste].slice(0, 5000)));
}

/**
 * Stok azaldıysa (kritik eşiğin altına indiyse / tükendiyse) mağazaya e-posta uyarısı.
 * Döngüsel içe aktarmayı önlemek için modül çalışma anında yüklenir. En fazla 8 sn bekler; hata kaydı etkilemez.
 */
export async function stokSonrasi(eski: Magaza, yeni: Magaza): Promise<void> {
  const eskiStok = new Map(eski.urunler.map((u) => [u.id, u.stok]));
  if (!yeni.urunler.some((u) => (eskiStok.get(u.id) ?? u.stok) > u.stok)) return;
  await Promise.race([
    import('./stokUyari').then((m) => m.stokUyarilariniGonder(eski, yeni)).catch((e) => console.error('[stok] Uyarı gönderilemedi:', e)),
    new Promise((r) => setTimeout(r, 8000)),
  ]);
}

export function magazaAdayi(mevcut: Magaza, degistir: (m: Magaza) => void): Magaza {
  const kopya: Magaza = structuredClone(mevcut);
  degistir(kopya);
  const sonuc = MagazaSema.safeParse(kopya);
  if (!sonuc.success) {
    throw new DogrulamaHatasi(sonuc.error.issues.map((i) => `${i.path.join(' › ')}: ${i.message}`));
  }
  const tutarlilik = magazaTutarlilik(sonuc.data);
  if (tutarlilik.length) throw new DogrulamaHatasi(tutarlilik);
  return { ...sonuc.data, surum: mevcut.surum + 1, guncelleme: new Date().toISOString() };
}

export async function magazaYansit(m: Magaza): Promise<void> {
  await yedekAl().catch(() => undefined);
  await atomikYaz(MAGAZA, JSON.stringify(m, null, 2)).catch(() => undefined);
  magazaOnbellegiSil();
  magazaOnbellek = { mtime: 0, zaman: Date.now(), veri: m };
}

async function yedekAl(): Promise<void> {
  await fs.mkdir(YEDEK, { recursive: true });
  const ad = `magaza-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await fs.copyFile(MAGAZA, path.join(YEDEK, ad)).catch(() => undefined);
  const dosyalar = (await fs.readdir(YEDEK)).filter((f) => f.startsWith('magaza-')).sort();
  for (const eski of dosyalar.slice(0, Math.max(0, dosyalar.length - 50))) await fs.unlink(path.join(YEDEK, eski)).catch(() => undefined);
}

/* ---------------- Siparişler ---------------- */
let siparisOnbellek: { mtime: number; zaman: number; veri: Siparis[] } | undefined;
let siparisNesil = 0;
let siparisOkunan: Promise<Siparis[]> | undefined;
function siparisOnbellegiSil() { siparisOnbellek = undefined; siparisNesil++; siparisOkunan = undefined; }

/** Aynı anda gelen okumalar tek isteği paylaşır (bkz. magazaOku) */
export function siparisleriOku(kayitIcin = false): Promise<Siparis[]> {
  if (kayitIcin) return siparisleriOkuIc(true);
  if (supabaseIstemci() && siparisOnbellek && Date.now() - siparisOnbellek.zaman < ONBELLEK_SURE_MS) return Promise.resolve(siparisOnbellek.veri);
  if (siparisOkunan) return siparisOkunan;
  const is: Promise<Siparis[]> = siparisleriOkuIc(false).finally(() => { if (siparisOkunan === is) siparisOkunan = undefined; });
  siparisOkunan = is;
  return is;
}

async function siparisleriOkuIc(kayitIcin: boolean): Promise<Siparis[]> {
  const nesil = siparisNesil;
  const sakla = (o: NonNullable<typeof siparisOnbellek>) => { if (nesil === siparisNesil) siparisOnbellek = o; };
  const sb = supabaseIstemci();
  if (sb) {
    const { data, error } = await sb.rpc('siparisleri_oku');
    if (!error && Array.isArray(data)) {
      const veri = SiparisSema.array().parse(data);
      sakla({ mtime: 0, zaman: Date.now(), veri });
      return veri;
    }
    if (error) console.error('[Supabase] siparisleri_oku hatası, yerel yedeğe dönülüyor:', error.message);
    if (kayitIcin) throw new Error('Sipariş veritabanına erişilemiyor. Lütfen tekrar deneyin.');
  }

  let st;
  try { st = await fs.stat(SIPARISLER); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  if (siparisOnbellek && siparisOnbellek.mtime === st.mtimeMs && siparisOnbellek.mtime > 0) return siparisOnbellek.veri;
  const veri = SiparisSema.array().parse(JSON.parse(await fs.readFile(SIPARISLER, 'utf8')));
  sakla({ mtime: st.mtimeMs, zaman: Date.now(), veri });
  return veri;
}

export function siparisEkle(s: Siparis): Promise<Siparis> {
  return siparisVeSozlesmeEkle(s);
}

function urunAdetleri(s: Siparis): Map<string, number> {
  const adetler = new Map<string, number>();
  for (const k of s.kalemler) {
    const parcalar = k.parcalar.length || k.tip === 'set' ? k.parcalar : [{ urunId: k.id, adet: 1 }];
    for (const p of parcalar) adetler.set(p.urunId, (adetler.get(p.urunId) ?? 0) + p.adet * k.adet);
  }
  return adetler;
}

export class StokYetersiz extends Error {}
export class SiparisNumarasiDolu extends Error {}

export function webAyrilanAdetleri(
  liste: Siparis[], simdi = Date.now(), paytrStokIslemleri: string[] = [],
  haricNo?: string, testDahil = false,
): Map<string, number> {
  const ayrilan = new Map<string, number>();
  const islenenler = new Set(paytrStokIslemleri);
  for (const s of liste) {
    const p = s.paytr;
    if (!p || s.no === haricNo || s.durum !== 'odeme-bekliyor' || (p.test && !testDahil) ||
        p.sonuc !== 'bekliyor' || p.beklemeBitis <= simdi || islenenler.has(p.ref)) continue;
    for (const [id, adet] of urunAdetleri(s)) ayrilan.set(id, (ayrilan.get(id) ?? 0) + adet);
  }
  return ayrilan;
}

export function siparisVeSozlesmeEkle(s: Siparis, belge?: SozlesmeKaydi): Promise<Siparis> {
  return sirala(async () => {
    siparisOnbellegiSil();
    // Numara çakışması ve stok ayrımı kararı yalnızca güncel bulut verisiyle verilir (eski yerel kopyayla değil)
    const liste = await siparisleriOku(true);
    if (liste.some((x) => x.no === s.no || (s.paytr && x.paytr?.ref === s.paytr.ref))) throw new SiparisNumarasiDolu();
    const yeni = SiparisSema.parse(s);
    if (yeni.kalemler.some((k) => k.tip === 'set' && !k.parcalar.length)) {
      throw new Error('Siparişin set içeriği eksik.');
    }

    const sb = supabaseIstemci();
    if (sb) {
      const { error } = await sb.rpc('web_siparis_olustur', { yeni_siparis: yeni, belge: belge ? { ...belge } : null });
      // Veritabanı güncellemesi (20261119151000) henüz uygulanmadıysa sipariş almayı durdurma: eski yol
      if (error?.code === 'PGRST202') return eskiSiparisKaydi(sb, yeni, liste, belge);
      if (error?.code === 'PT422') throw new StokYetersiz();
      if (error?.code === '23505') throw new SiparisNumarasiDolu();
      if (error) throw new Error(`Supabase sipariş kayıt hatası (${error.code}): ${error.message}`);
      magazaOnbellegiSil();
      siparisOnbellegiSil();
      if (belge) await atomikYaz(sozlesmeDosyasi(s.no), JSON.stringify(belge)).catch(() => undefined);
      await siparisListesiYaz([yeni, ...liste]).catch(() => undefined);
      return yeni;
    }

    if (process.env.VERCEL) throw new Error('Sipariş veritabanı yapılandırılmadı.');
    const m = await magazaOku(true);
    const ayrilan = webAyrilanAdetleri(liste, Date.now(), m.paytrStokIslemleri, undefined, yeni.paytr?.test);
    for (const [id, adet] of urunAdetleri(yeni)) {
      const u = m.urunler.find((x) => x.id === id);
      if (!u || u.durum !== 'yayinda' || u.stok - (ayrilan.get(id) ?? 0) < adet) throw new StokYetersiz();
    }
    if (belge) await atomikYaz(sozlesmeDosyasi(s.no), JSON.stringify(belge));
    await siparisListesiYaz([yeni, ...liste]);
    return yeni;
  });
}

/**
 * Eski kayıt yolu (web_siparis_olustur fonksiyonu veritabanında yoksa): stok uygulamada denetlenir,
 * sipariş ve sözleşme ayrı yazılır; sözleşme yazılamazsa sipariş geri silinir.
 */
async function eskiSiparisKaydi(sb: SupabaseClient<Database>, yeni: Siparis, liste: Siparis[], belge?: SozlesmeKaydi): Promise<Siparis> {
  console.warn('[sipariş] web_siparis_olustur bulunamadı; eski kayıt yolu kullanılıyor. Migration 20261119151000 uygulanmalı.');
  if (yeni.paytr) {
    const m = await magazaOku(true);
    const ayrilan = webAyrilanAdetleri(liste, Date.now(), m.paytrStokIslemleri, undefined, yeni.paytr.test);
    for (const [id, adet] of urunAdetleri(yeni)) {
      const u = m.urunler.find((x) => x.id === id);
      if (!u || u.durum !== 'yayinda' || u.stok - (ayrilan.get(id) ?? 0) < adet) throw new StokYetersiz();
    }
  }
  const { error: sErr } = await sb.rpc('siparis_kaydet', { s: yeni });
  if (sErr) throw new Error(`Supabase sipariş kayıt hatası: ${sErr.message}`);
  if (belge) {
    const { error: bErr } = await sb.from('sozlesmeler').upsert({
      no: belge.no, surum: belge.surum, onay_tarihi: belge.onayTarihi, ip: belge.ip, tarayici: belge.tarayici ?? null,
      on_bilgilendirme: belge.onBilgilendirme, mesafeli_satis: belge.mesafeliSatis,
    });
    if (bErr) {
      // Sözleşmesiz sipariş bırakılmaz: müşteri tekrar denediğinde ikinci kayıt ve boşuna stok ayrımı oluşmaz
      const { error: silHata } = await sb.from('siparisler').delete().eq('no', yeni.no);
      if (silHata) console.error('[Supabase] Sözleşmesi kaydedilemeyen sipariş geri alınamadı:', yeni.no);
      siparisOnbellegiSil();
      throw new Error(`Supabase sözleşme kayıt hatası: ${bErr.message}`);
    }
    await atomikYaz(sozlesmeDosyasi(yeni.no), JSON.stringify(belge)).catch(() => undefined);
  }
  siparisOnbellegiSil();
  await siparisListesiYaz([yeni, ...liste]).catch(() => undefined);
  return yeni;
}

async function siparisListesiYaz(liste: Siparis[]): Promise<void> {
  await atomikYaz(SIPARISLER, JSON.stringify(liste, null, 2));
  siparisOnbellegiSil();
}

export function paytrSonuclandir(bildirim: NonNullable<ReturnType<typeof import('./paytr').paytrBildirimDogrula>>) {
  return sirala(async () => {
    siparisOnbellegiSil();
    const liste = structuredClone(await siparisleriOku(true));
    const s = liste.find((x) => x.paytr?.ref === bildirim.ref);
    const p = s?.paytr;
    if (!s || !p) return { durum: 'bulunamadi' } as const;
    const kurus = Math.round(s.toplam * 100); // lib/paytr.ts ile aynı yuvarlama
    if ((bildirim.test && !p.test) || (bildirim.basarili &&
      // payment_amount sipariş tutarıyla birebir aynı olmalı; total_amount taksitli ödemede vade farkıyla büyük olabilir
      // (PayTR belgesi). Eksik tahsilat yine reddedilir (denetim AUD-033).
      (p.test !== bildirim.test || !(bildirim.kurus >= kurus) || bildirim.siparisTutari !== String(kurus) ||
        bildirim.tur !== 'card' || !['TL', 'TRY'].includes(bildirim.paraBirimi)))) return { durum: 'uyusmazlik' } as const;
    if (p.sonuc !== 'bekliyor') {
      if ((p.sonuc === 'odendi') !== bildirim.basarili) return { durum: 'uyusmazlik' } as const;
      return { durum: 'tekrar' } as const;
    }

    const onceki = structuredClone(s);
    const ref = p.ref;
    const adetler = urunAdetleri(s);
    const stokDusulecek = bildirim.basarili && !p.test;
    let ayrilan = new Map<string, number>();
    // Stok ve işlem işareti aynı mağaza kaydında yazılır; tekrar gelen bildirim stoğu ikinci kez düşmez.
    // Kontrol, yazılacak güncel kopyanın içinde yapılır (eski önbellek/yerel kopyaya güvenilmez).
    const stokDus = (magaza: Magaza) => {
      if (magaza.paytrStokIslemleri?.includes(ref)) return;
      for (const [id, adet] of adetler) {
        const u = magaza.urunler.find((x) => x.id === id);
        if (!u || u.stok - (ayrilan.get(id) ?? 0) < adet) throw new StokYetersiz();
        u.stok -= adet;
      }
      (magaza.paytrStokIslemleri ??= []).push(ref);
    };
    // Ödeme alınmış ama stok yetmiyorsa sipariş yine "ödendi" olur, panelde "stok ayrılamadı" uyarısı çıkar
    const stokuAyriYaz = async () => {
      try { await magazaYaz(stokDus, 'Web siparişi ' + s.no + ' · odendi'); } catch (e) {
        if (!(e instanceof StokYetersiz)) throw e;
        p.stokEksik = true;
      }
    };

    let m: Magaza | undefined;
    let aday: Magaza | undefined;
    if (stokDusulecek) {
      magazaOnbellegiSil();
      m = await magazaOku(true);
      ayrilan = webAyrilanAdetleri(await siparisleriOku(true), Date.now(), m.paytrStokIslemleri, s.no);
      if (!m.paytrStokIslemleri?.includes(ref)) {
        try { aday = magazaAdayi(m, stokDus); } catch (e) {
          if (!(e instanceof StokYetersiz)) throw e;
          p.stokEksik = true;
        }
      }
    }
    const sonucuYaz = () => {
      if (stokDusulecek) s.stokDusuldu = !p.stokEksik;
      return SiparisSema.parse(s);
    };
    p.sonuc = bildirim.basarili ? 'odendi' : 'basarisiz';
    s.durum = bildirim.basarili ? 'odendi' : 'iptal';
    s.gecmis.push({ tarih: new Date().toISOString(), durum: s.durum });

    const sb = supabaseIstemci();
    if (sb) {
      // Stok düşümü ve sipariş sonucu tek veritabanı işleminde yazılır: biri kaydedilip diğeri yarım kalmaz.
      const atomik = await sb.rpc('panel_siparis_kaydet', {
        yeni_siparis: sonucuYaz(), eski_siparis: onceki, yeni_magaza: aday ?? null, beklenen_surum: m?.surum ?? 0,
      });
      if (atomik.error) {
        // PT409: sipariş/stok bu sırada değişti. PayTR bildirimi tekrar gönderir, o zaman güncel veriyle işlenir.
        throw new Error(`PayTR sonucu kaydedilemedi (${atomik.error.code}): ${atomik.error.message}`);
      } else if (aday) {
        const kaydedilen = atomik.data ? MagazaSema.parse(atomik.data) : aday;
        await magazaYansit(kaydedilen);
        if (m) arkaPlanda(stokSonrasi(m, kaydedilen), 'stok uyarısı');
      }
      siparisOnbellegiSil();
      await siparisListesiYaz(liste).catch(() => undefined);
      return { durum: 'kaydedildi', siparis: s } as const;
    }

    if (process.env.VERCEL) throw new Error('Sipariş veritabanı yapılandırılmadı.');
    if (aday) await stokuAyriYaz();
    sonucuYaz();
    await siparisListesiYaz(liste);
    return { durum: 'kaydedildi', siparis: s } as const;
  });
}

export function siparisGuncelle(
  no: string,
  degistir: (s: Siparis) => -1 | 0 | 1 | void,
  panelIslemi = false,
): Promise<Siparis> {
  return sirala(async () => {
    siparisOnbellegiSil();
    const liste = structuredClone(await siparisleriOku(true));
    const s = liste.find((x) => x.no === no);
    if (!s) throw new Error('Sipariş bulunamadı');
    const onceki = structuredClone(s);
    const sb = supabaseIstemci();
    magazaOnbellegiSil();
    const m = panelIslemi ? await magazaOku(true) : undefined;
    // Paneldeki stok hareketleri "panel:<no>:-1" / "panel:<no>:1" (ikincisinden itibaren "#2", "#3"…) olarak işaretlenir.
    const panelOnek = 'panel:' + no + ':';
    const hareketSayisi = (isaret: -1 | 1) => (m?.paytrStokIslemleri ?? [])
      .filter((x) => x === panelOnek + isaret || x.startsWith(panelOnek + isaret + '#')).length;
    if (hareketSayisi(-1) > hareketSayisi(1) && s.durum === 'odeme-bekliyor') s.stokDusuldu = true;
    const stokIsareti = degistir(s);
    const dogrulanmis = SiparisSema.parse(s);
    // Aynı yöndeki ikinci gerçek hareket (ör. iade sonrası yeniden düşüm) yeni anahtar alır; eskiden aynı anahtar yeniden
    // kullanıldığı için stok ikinci kez değişmiyordu (denetim AUD-018). Aynı isteğin tekrarı yine aynı anahtarı üretir
    // ve atlanır (stokUygula), sipariş kaydı da eşzamanlılık kontrolüne (eski_siparis) takılır.
    const oncekiAyniYon = stokIsareti ? hareketSayisi(stokIsareti) : 0;
    const islem = stokIsareti ? panelOnek + stokIsareti + (oncekiAyniYon ? '#' + (oncekiAyniYon + 1) : '') : '';
    const stokDegisti = Boolean(stokIsareti && !m?.paytrStokIslemleri?.includes(islem));
    const ayrilan = stokIsareti === -1
      ? webAyrilanAdetleri(await siparisleriOku(true), Date.now(), m?.paytrStokIslemleri, no)
      : undefined;
    const stokUygula = (magaza: Magaza) => {
      if (!stokIsareti || magaza.paytrStokIslemleri?.includes(islem)) return;
      if (dogrulanmis.kalemler.some((k) => k.tip === 'set' && !k.parcalar.length)) {
        throw new Error('Eski set siparişinin ürün dökümü eksik. Stok hareketi güvenle hesaplanamadı.');
      }
      for (const [id, adet] of urunAdetleri(dogrulanmis)) {
        const u = magaza.urunler.find((u) => u.id === id);
        if (!u) throw new Error('Siparişteki bir ürün katalogda bulunamadı.');
        if (stokIsareti < 0 && u.stok - (ayrilan?.get(id) ?? 0) < adet) throw new Error(u.kisaAd + ' için stok yetersiz.');
        u.stok += stokIsareti * adet;
      }
      (magaza.paytrStokIslemleri ??= []).push(islem);
    };
    if (sb) {
      if (stokDegisti && !m) throw new Error('Supabase stok işlemi için mağaza okunamadı.');
      const aday = stokDegisti && m ? magazaAdayi(m, stokUygula) : undefined;
      const { data, error } = await sb.rpc('panel_siparis_kaydet', {
        yeni_siparis: dogrulanmis, eski_siparis: onceki,
        yeni_magaza: aday ?? null, beklenen_surum: m?.surum ?? 0,
      });
      if (!error) {
        if (aday) {
          const kaydedilen = data ? MagazaSema.parse(data) : aday;
          await magazaYansit(kaydedilen);
          if (m) arkaPlanda(stokSonrasi(m, kaydedilen), 'stok uyarısı');
        }
        await siparisListesiYaz(liste).catch(() => undefined);
        return dogrulanmis;
      }
      if (cakismaHatasi(error)) throw new Error('Sipariş veya stok bu sırada güncellendi. Sayfayı yenileyin.');
      throw new Error('Supabase sipariş kaydı tamamlanamadı.');
    }

    if (process.env.VERCEL) throw new Error('Sipariş veritabanı yapılandırılmadı.');
    if (stokDegisti) await magazaYaz(stokUygula, 'Web siparişi ' + no + ' · ' + (stokIsareti === 1 && dogrulanmis.durum !== 'iptal' ? 'iade' : dogrulanmis.durum));
    await siparisListesiYaz(liste);
    return dogrulanmis;
  });
}

/*
 * Son `gun` günde satılan adetler (ödeme bekleyen ve iptal edilenler hariç) — vitrindeki "çok satan" rozeti için.
 * Her vitrin isteğinde çağrılır: önce yalnız ürün adetlerini döndüren veritabanı fonksiyonu (satis_adetleri, müşteri bilgisi
 * taşımaz) denenir; fonksiyon henüz kurulmadıysa (migration 20261124123000) tüm siparişler okunur. Sonuç 5 dakika saklanır
 * (eskiden her istekte tüm siparişler müşteri bilgileriyle okunuyordu — denetim AUD-015).
 */
let satisOnbellek: { gun: number; zaman: number; veri: Map<string, number> } | undefined;
export async function satisAdetleri(gun = 30): Promise<Map<string, number>> {
  if (satisOnbellek?.gun === gun && Date.now() - satisOnbellek.zaman < 5 * 60_000) return satisOnbellek.veri;
  const sakla = (veri: Map<string, number>) => { satisOnbellek = { gun, zaman: Date.now(), veri }; return veri; };
  const sb = supabaseIstemci();
  if (sb) {
    const { data, error } = await sb.rpc('satis_adetleri', { p_gun: gun });
    if (!error && data && typeof data === 'object' && !Array.isArray(data)) {
      return sakla(new Map(Object.entries(data as Record<string, unknown>).filter(([, v]) => Number.isFinite(Number(v))).map(([id, v]) => [id, Number(v)])));
    }
    if (error && error.code !== 'PGRST202') console.error('[Supabase] satis_adetleri hatası, siparişlerden hesaplanıyor:', error.message);
  }
  const sinir = Date.now() - gun * 864e5;
  const m = new Map<string, number>();
  for (const s of await siparisleriOku()) {
    if (s.paytr?.test || s.durum === 'odeme-bekliyor' || s.durum === 'iptal' || s.gecmis.some((g) => g.islem === 'iade-tamamlandi') || Date.parse(s.tarih) < sinir) continue;
    for (const k of s.kalemler) for (const p of k.parcalar) m.set(p.urunId, (m.get(p.urunId) ?? 0) + p.adet * k.adet);
  }
  return sakla(m);
}

/* ---------------- Görseller ---------------- */
/** HEIC/HEIF/AVIF bilerek yok: bu biçimleri açan kütüphane yolunda (libheif) bilinen açıklar var (denetim AUD-009).
 *  iPhone, alan HEIC istemediğinde fotoğrafı kendisi JPEG'e çevirerek gönderir. */
const IZINLI = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const IZINLI_BICIM = new Set(['jpeg', 'png', 'webp', 'gif']);
/** Çok büyük çözünürlüklü (bellek tüketen) görseller reddedilir: ~40 megapiksel */
const PIKSEL_SINIRI = 40_000_000;
export const MAKS_GORSEL_BOYUT = 12 * 1024 * 1024;

/**
 * Yüklenen görseli yeniden kodlar (EXIF/konum bilgisi silinir, zararlı içerik etkisizleşir),
 * en fazla 1600 px'e küçültür ve WebP olarak hem Supabase Storage + medya_dosyalari tablosuna
 * hem de yerel diske kaydeder. Dönen yol sitede doğrudan kullanılır.
 */
export async function gorselKaydet(dosya: File, klasor: string): Promise<string> {
  if (!IZINLI.has(dosya.type)) throw new Error(`Desteklenmeyen dosya türü: ${dosya.type || 'bilinmiyor'}`);
  if (dosya.size > MAKS_GORSEL_BOYUT) throw new Error('Görsel 12 MB’tan büyük olamaz');
  const guvenliKlasor = klasor.replace(/[^a-z0-9-]/g, '');
  const ad = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}.webp`;
  const bulutYol = `${guvenliKlasor}/${ad}`;

  const girdi = Buffer.from(await dosya.arrayBuffer());
  // Tarayıcının bildirdiği türe değil, dosyanın gerçek içeriğine bakılır
  const { format } = await sharp(girdi, { failOn: 'error', limitInputPixels: PIKSEL_SINIRI }).metadata().catch(() => ({ format: undefined }));
  if (!format || !IZINLI_BICIM.has(format)) throw new Error('Görsel JPG, PNG, WebP veya GIF olmalı.');
  const tampon = await beyazKenarKirp(await sharp(girdi, { failOn: 'error', limitInputPixels: PIKSEL_SINIRI }).rotate().toBuffer());
  const webpTampon = await sharp(tampon)
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 86 })
    .toBuffer();

  const sb = supabaseIstemci();
  if (sb) {
    const { error: dbErr } = await sb.from('medya_dosyalari').upsert({
      yol: bulutYol,
      icerik_turu: 'image/webp',
      boyut: webpTampon.length,
      veri_base64: webpTampon.toString('base64'),
      aktif: true,
    });
    if (dbErr) throw new Error(`Supabase görsel kayıt hatası: ${dbErr.message}`);
    await sb.storage.from('medya').upload(bulutYol, webpTampon, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: true,
    }).catch(() => undefined);
  }

  const hedefKlasor = path.join(YUKLEME_KOKU, guvenliKlasor);
  await fs.mkdir(hedefKlasor, { recursive: true }).catch(() => undefined);
  await fs.writeFile(path.join(hedefKlasor, ad), webpTampon).catch(() => undefined);

  return `/medya/${bulutYol}`;
}

/**
 * `/medya/[...yol].ts` için görseli önce yerel önbellekten, yoksa Supabase'den okur.
 */
export async function gorselOku(goreliYol: string): Promise<{ veri: Buffer; tur: string } | null> {
  const TURLER: Record<string, string> = {
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
  };
  // Önce normalize edilir, sonra kontrol edilir: "a/../_finans/x.jpg" gibi yollar gizli finans dosyalarına ulaşamaz (denetim AUD-030)
  const temizYol = path.posix.normalize(goreliYol.replace(/\\/g, '/').replace(/^\/+/, ''));
  if (!temizYol || temizYol.split('/').some((p) => !p || p.startsWith('_') || p.startsWith('.'))) return null;
  const tam = path.resolve(YUKLEME_KOKU, temizYol);
  if (!tam.startsWith(YUKLEME_KOKU + path.sep)) return null;
  const tur = TURLER[path.extname(tam).toLowerCase()];
  if (!tur) return null;

  try {
    const veri = await fs.readFile(tam);
    return { veri, tur };
  } catch {
    // Yerel diskte yoksa Supabase medya_dosyalari tablosundan getir
    const sb = supabaseIstemci();
    if (!sb) return null;
    const { data, error } = await sb
      .from('medya_dosyalari')
      .select('veri_base64')
      .eq('yol', temizYol)
      .eq('aktif', true)
      .maybeSingle();
    if (error || !data) return null;
    const veri = Buffer.from(data.veri_base64, 'base64');
    await fs.mkdir(path.dirname(tam), { recursive: true }).catch(() => undefined);
    await fs.writeFile(tam, veri).catch(() => undefined);
    return { veri, tur }; // içerik türü kayıttan değil, uzantıdan (sabit liste)
  }
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
  const goreli = src.slice('/medya/'.length).replace(/^\/+/, '');
  const sb = supabaseIstemci();
  if (sb && goreli) {
    await sb.from('medya_dosyalari').update({ aktif: false }).eq('yol', goreli);
    // Storage'daki herkese açık kopya da silinir (silme izni migration 20261124121000 ile gelir; yoksa sessizce kalır)
    await sb.storage.from('medya').remove([goreli]).catch(() => undefined);
  }
  const tam = path.resolve(YUKLEME_KOKU, '.' + src.slice('/medya'.length));
  if (!tam.startsWith(YUKLEME_KOKU + path.sep)) return;
  await fs.unlink(tam).catch(() => undefined);
}
