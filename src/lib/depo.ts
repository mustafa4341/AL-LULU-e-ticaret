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

const ortam = (ad: string): string | undefined =>
  process.env[ad] ?? (import.meta.env as Record<string, string | undefined>)[ad];

const KOK = path.resolve(process.env.VERI_KLASORU ?? import.meta.env.VERI_KLASORU ?? 'veri');
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
      headers: sunucuAnahtari ? { 'x-sunucu-anahtari': sunucuAnahtari } : {},
    },
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

async function atomikYaz(dosya: string, veri: string): Promise<void> {
  await fs.mkdir(path.dirname(dosya), { recursive: true });
  const gecici = `${dosya}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(gecici, veri, 'utf8');
  await fs.rename(gecici, dosya);
}

/* ---------------- Mağaza ---------------- */
let magazaOnbellek: { mtime: number; zaman: number; veri: Magaza } | undefined;
const ONBELLEK_SURE_MS = 1000;
let bulutOkumaHatasi = false;
export const supabaseDurumu = () => !supabaseBagliMi() ? 'yerel' : bulutOkumaHatasi ? 'hata' : 'bagli';

export async function magazaOku(kayitIcin = false): Promise<Magaza> {
  const sb = supabaseIstemci();
  if (sb) {
    if (magazaOnbellek && (!kayitIcin || magazaOnbellek.mtime === 0) && Date.now() - magazaOnbellek.zaman < ONBELLEK_SURE_MS) {
      return magazaOnbellek.veri;
    }
    const { data, error } = await sb.rpc('magaza_oku');
    if (!error && data) {
      bulutOkumaHatasi = false;
      const veri = MagazaSema.parse(data);
      magazaOnbellek = { mtime: 0, zaman: Date.now(), veri };
      return veri;
    }
    if (!error && data === null) {
      // Veritabanı henüz boşsa yerel magaza.json ile ilk kurulumu yap
      const yerel = MagazaSema.parse(JSON.parse(await fs.readFile(MAGAZA, 'utf8')));
      const { data: kaydedilen, error: kayitHata } = await sb.rpc('magaza_kaydet', { yeni_magaza: yerel });
      if (!kayitHata && kaydedilen) {
        bulutOkumaHatasi = false;
        const veri = MagazaSema.parse(kaydedilen);
        magazaOnbellek = { mtime: 0, zaman: Date.now(), veri };
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
  magazaOnbellek = { mtime: st.mtimeMs, zaman: Date.now(), veri };
  return veri;
}

export class DogrulamaHatasi extends Error {
  constructor(readonly hatalar: string[]) { super(hatalar.join('\n')); }
}

/** Mağazayı güncelle: değişiklik fonksiyonu kopya üzerinde çalışır; geçersizse hiçbir şey yazılmaz. */
export function magazaGuncelle(degistir: (m: Magaza) => void): Promise<Magaza> {
  return sirala(() => magazaYaz(degistir));
}

/**
 * "Veri bu sırada değişti" çakışması. Veritabanı PT409 döndürür (HTTP 409).
 * 40001 KULLANILMAZ: PostgREST bu kodu otomatik ve sonsuz tekrar dener, istek asılı kalır.
 * (40001 yalnızca eski fonksiyon sürümü için tanınır.)
 */
const cakismaHatasi = (e: { code?: string } | null | undefined) => e?.code === 'PT409' || e?.code === '40001';

async function magazaYaz(degistir: (m: Magaza) => void): Promise<Magaza> {
  magazaOnbellek = undefined;
  const mevcut = await magazaOku(true);
  const yeni = magazaAdayi(mevcut, degistir);
  const sb = supabaseIstemci();
  if (sb) {
    let kayit = await sb.rpc('panel_magaza_kaydet', { yeni_magaza: yeni, beklenen_surum: mevcut.surum });
    if (kayit.error?.code === 'PGRST202') kayit = await sb.rpc('magaza_kaydet', { yeni_magaza: yeni });
    if (cakismaHatasi(kayit.error)) throw new DogrulamaHatasi(['Mağaza bu sırada güncellendi. Sayfayı yenileyip tekrar deneyin.']);
    if (kayit.error) throw new Error('Mağaza veritabanına kaydedilemedi.');
    const kaydedilen = kayit.data ? MagazaSema.parse(kayit.data) : yeni;
    await magazaYansit(kaydedilen);
    return kaydedilen;
  }

  await yedekAl();
  await atomikYaz(MAGAZA, JSON.stringify(yeni, null, 2));
  magazaOnbellek = undefined;
  return yeni;
}

function magazaAdayi(mevcut: Magaza, degistir: (m: Magaza) => void): Magaza {
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

async function magazaYansit(m: Magaza): Promise<void> {
  await yedekAl().catch(() => undefined);
  await atomikYaz(MAGAZA, JSON.stringify(m, null, 2)).catch(() => undefined);
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

export async function siparisleriOku(kayitIcin = false): Promise<Siparis[]> {
  const sb = supabaseIstemci();
  if (sb) {
    if (siparisOnbellek && (!kayitIcin || siparisOnbellek.mtime === 0) && Date.now() - siparisOnbellek.zaman < ONBELLEK_SURE_MS) {
      return siparisOnbellek.veri;
    }
    const { data, error } = await sb.rpc('siparisleri_oku');
    if (!error && Array.isArray(data)) {
      const veri = SiparisSema.array().parse(data);
      siparisOnbellek = { mtime: 0, zaman: Date.now(), veri };
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
  siparisOnbellek = { mtime: st.mtimeMs, zaman: Date.now(), veri };
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

export function siparisVeSozlesmeEkle(s: Siparis, belge?: SozlesmeKaydi): Promise<Siparis> {
  return sirala(async () => {
    siparisOnbellek = undefined;
    // Numara çakışması ve stok ayrımı kararı yalnızca güncel bulut verisiyle verilir (eski yerel kopyayla değil)
    const liste = await siparisleriOku(true);
    if (liste.some((x) => x.no === s.no || (s.paytr && x.paytr?.ref === s.paytr.ref))) throw new SiparisNumarasiDolu();
    const yeni = SiparisSema.parse(s);
    if (yeni.paytr) {
      magazaOnbellek = undefined;
      const m = await magazaOku(true);
      const ayrilan = new Map<string, number>();
      const simdi = Date.now();
      const islenenler = new Set(m.paytrStokIslemleri);
      for (const x of liste) {
        if (!x.paytr || x.paytr.test !== yeni.paytr.test || x.paytr.sonuc !== 'bekliyor' ||
          x.paytr.beklemeBitis <= simdi || islenenler.has(x.paytr.ref)) continue;
        for (const [id, adet] of urunAdetleri(x)) ayrilan.set(id, (ayrilan.get(id) ?? 0) + adet);
      }
      for (const [id, adet] of urunAdetleri(yeni)) {
        const u = m.urunler.find((x) => x.id === id);
        if (!u || u.durum !== 'yayinda' || u.stok - (ayrilan.get(id) ?? 0) < adet) throw new StokYetersiz();
      }
    }

    const sb = supabaseIstemci();
    if (sb) {
      const { error: sErr } = await sb.rpc('siparis_kaydet', { s: yeni });
      if (sErr) throw new Error(`Supabase sipariş kayıt hatası: ${sErr.message}`);
      if (belge) {
        const { error: bErr } = await sb.from('sozlesmeler').upsert({
          no: belge.no,
          surum: belge.surum,
          onay_tarihi: belge.onayTarihi,
          ip: belge.ip,
          tarayici: belge.tarayici ?? null,
          on_bilgilendirme: belge.onBilgilendirme,
          mesafeli_satis: belge.mesafeliSatis,
        });
        if (bErr) {
          // Sözleşmesiz sipariş bırakılmaz: müşteri tekrar denediğinde ikinci kayıt ve boşuna stok ayrımı oluşmaz
          const { error: silHata } = await sb.from('siparisler').delete().eq('no', yeni.no);
          if (silHata) console.error('[Supabase] Sözleşmesi kaydedilemeyen sipariş geri alınamadı:', yeni.no);
          siparisOnbellek = undefined;
          throw new Error(`Supabase sözleşme kayıt hatası: ${bErr.message}`);
        }
      }
      siparisOnbellek = undefined;
      if (belge) await atomikYaz(sozlesmeDosyasi(s.no), JSON.stringify(belge)).catch(() => undefined);
      await siparisListesiYaz([yeni, ...liste]).catch(() => undefined);
      return yeni;
    }

    if (belge) await atomikYaz(sozlesmeDosyasi(s.no), JSON.stringify(belge));
    await siparisListesiYaz([yeni, ...liste]);
    return yeni;
  });
}

async function siparisListesiYaz(liste: Siparis[]): Promise<void> {
  await atomikYaz(SIPARISLER, JSON.stringify(liste, null, 2));
  siparisOnbellek = undefined;
}

export function paytrSonuclandir(bildirim: NonNullable<ReturnType<typeof import('./paytr').paytrBildirimDogrula>>) {
  return sirala(async () => {
    siparisOnbellek = undefined;
    const liste = structuredClone(await siparisleriOku(true));
    const s = liste.find((x) => x.paytr?.ref === bildirim.ref);
    const p = s?.paytr;
    if (!s || !p) return { durum: 'bulunamadi' } as const;
    const kurus = s.toplam * 100;
    if ((bildirim.test && !p.test) || (bildirim.basarili &&
      (p.test !== bildirim.test || bildirim.kurus !== kurus || bildirim.siparisTutari !== String(kurus) ||
        bildirim.tur !== 'card' || !['TL', 'TRY'].includes(bildirim.paraBirimi)))) return { durum: 'uyusmazlik' } as const;
    if (p.sonuc !== 'bekliyor') {
      if ((p.sonuc === 'odendi') !== bildirim.basarili) return { durum: 'uyusmazlik' } as const;
      return { durum: 'tekrar' } as const;
    }

    const onceki = structuredClone(s);
    const ref = p.ref;
    const adetler = urunAdetleri(s);
    const stokDusulecek = bildirim.basarili && !p.test;
    // Stok ve işlem işareti aynı mağaza kaydında yazılır; tekrar gelen bildirim stoğu ikinci kez düşmez.
    // Kontrol, yazılacak güncel kopyanın içinde yapılır (eski önbellek/yerel kopyaya güvenilmez).
    const stokDus = (magaza: Magaza) => {
      if (magaza.paytrStokIslemleri?.includes(ref)) return;
      for (const [id, adet] of adetler) {
        const u = magaza.urunler.find((x) => x.id === id);
        if (!u || u.stok < adet) throw new StokYetersiz();
        u.stok -= adet;
      }
      (magaza.paytrStokIslemleri ??= []).push(ref);
    };
    // Ödeme alınmış ama stok yetmiyorsa sipariş yine "ödendi" olur, panelde "stok ayrılamadı" uyarısı çıkar
    const stokuAyriYaz = async () => {
      try { await magazaYaz(stokDus); } catch (e) {
        if (!(e instanceof StokYetersiz)) throw e;
        p.stokEksik = true;
      }
    };

    let m: Magaza | undefined;
    let aday: Magaza | undefined;
    if (stokDusulecek) {
      magazaOnbellek = undefined;
      m = await magazaOku(true);
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
      if (atomik.error?.code === 'PGRST202') {
        // Atomik fonksiyon veritabanına henüz eklenmemiş: önce stok (işlem işaretiyle), sonra sipariş
        if (aday) await stokuAyriYaz();
        const { error } = await sb.rpc('siparis_kaydet', { s: sonucuYaz() });
        if (error) throw new Error(`Supabase sipariş güncelleme hatası: ${error.message}`);
      } else if (atomik.error) {
        // PT409: sipariş/stok bu sırada değişti. PayTR bildirimi tekrar gönderir, o zaman güncel veriyle işlenir.
        throw new Error(`PayTR sonucu kaydedilemedi (${atomik.error.code}): ${atomik.error.message}`);
      } else if (aday) {
        await magazaYansit(atomik.data ? MagazaSema.parse(atomik.data) : aday);
      }
      siparisOnbellek = undefined;
      await siparisListesiYaz(liste).catch(() => undefined);
      return { durum: 'kaydedildi', siparis: s } as const;
    }

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
    siparisOnbellek = undefined;
    const liste = structuredClone(await siparisleriOku(true));
    const s = liste.find((x) => x.no === no);
    if (!s) throw new Error('Sipariş bulunamadı');
    const onceki = structuredClone(s);
    const sb = supabaseIstemci();
    magazaOnbellek = undefined;
    const m = panelIslemi ? await magazaOku(true) : undefined;
    if (m?.paytrStokIslemleri?.includes('panel:' + no + ':-1') && s.durum === 'odeme-bekliyor') s.stokDusuldu = true;
    const stokIsareti = degistir(s);
    const dogrulanmis = SiparisSema.parse(s);
    const islem = 'panel:' + no + ':' + stokIsareti;
    const stokDegisti = Boolean(stokIsareti && !m?.paytrStokIslemleri?.includes(islem));
    const stokUygula = (magaza: Magaza) => {
      if (!stokIsareti || magaza.paytrStokIslemleri?.includes(islem)) return;
      if (dogrulanmis.kalemler.some((k) => k.tip === 'set' && !k.parcalar.length)) {
        throw new Error('Eski set siparişinin ürün dökümü eksik. Stok hareketi güvenle hesaplanamadı.');
      }
      for (const [id, adet] of urunAdetleri(dogrulanmis)) {
        const u = magaza.urunler.find((u) => u.id === id);
        if (!u) throw new Error('Siparişteki bir ürün katalogda bulunamadı.');
        if (u.stok + stokIsareti * adet < 0) throw new Error(u.kisaAd + ' için stok yetersiz.');
        u.stok += stokIsareti * adet;
      }
      (magaza.paytrStokIslemleri ??= []).push(islem);
    };
    if (sb && m) {
      const aday = stokDegisti ? magazaAdayi(m, stokUygula) : undefined;
      const { data, error } = await sb.rpc('panel_siparis_kaydet', {
        yeni_siparis: dogrulanmis, eski_siparis: onceki,
        yeni_magaza: aday ?? null, beklenen_surum: m.surum,
      });
      if (!error) {
        if (aday) await magazaYansit(data ? MagazaSema.parse(data) : aday);
        await siparisListesiYaz(liste).catch(() => undefined);
        return dogrulanmis;
      }
      if (cakismaHatasi(error)) throw new Error('Sipariş veya stok bu sırada güncellendi. Sayfayı yenileyin.');
      if (error.code !== 'PGRST202') throw new Error('Supabase sipariş kaydı tamamlanamadı.');
    }

    if (stokDegisti) await magazaYaz(stokUygula);
    if (sb) {
      const { error } = await sb.rpc('siparis_kaydet', { s: dogrulanmis });
      if (error) throw new Error(`Supabase sipariş güncelleme hatası: ${error.message}`);
      siparisOnbellek = undefined;
      await siparisListesiYaz(liste).catch(() => undefined);
      return dogrulanmis;
    }

    await siparisListesiYaz(liste);
    return dogrulanmis;
  });
}

/** Son `gun` günde satılan adetler (ödeme bekleyen ve iptal edilenler hariç) */
export async function satisAdetleri(gun = 30): Promise<Map<string, number>> {
  const sinir = Date.now() - gun * 864e5;
  const m = new Map<string, number>();
  for (const s of await siparisleriOku()) {
    if (s.paytr?.test || s.durum === 'odeme-bekliyor' || s.durum === 'iptal' || s.gecmis.some((g) => g.islem === 'iade-tamamlandi') || Date.parse(s.tarih) < sinir) continue;
    for (const k of s.kalemler) for (const p of k.parcalar) m.set(p.urunId, (m.get(p.urunId) ?? 0) + p.adet * k.adet);
  }
  return m;
}

/* ---------------- Görseller ---------------- */
const IZINLI = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/heic', 'image/heif']);
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
  const tampon = await beyazKenarKirp(await sharp(girdi, { failOn: 'error' }).rotate().toBuffer());
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
  const temizYol = goreliYol.replace(/^\/+/, '').replace(/\\/g, '/');
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
      .select('veri_base64, icerik_turu')
      .eq('yol', temizYol)
      .eq('aktif', true)
      .maybeSingle();
    if (error || !data) return null;
    const veri = Buffer.from(data.veri_base64, 'base64');
    await fs.mkdir(path.dirname(tam), { recursive: true }).catch(() => undefined);
    await fs.writeFile(tam, veri).catch(() => undefined);
    return { veri, tur: data.icerik_turu || tur };
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
  }
  const tam = path.resolve(YUKLEME_KOKU, '.' + src.slice('/medya'.length));
  if (!tam.startsWith(YUKLEME_KOKU + path.sep)) return;
  await fs.unlink(tam).catch(() => undefined);
}
