import fs from 'node:fs/promises';
import {
  cakismaHatasi, depoSirasi, DogrulamaHatasi, magazaAdayi, magazaOku, magazaYansit,
  siparisleriOku, stokSonrasi, supabaseIstemci, webAyrilanAdetleri, YEREL_STOK_DEFTERI, type StokHareketi,
} from './depo';
import {
  birlestir, bosAyarlar, EnvanterAyarSema, KANALLAR, PY_DURUM_ADLARI, kalemIadeBekliyor, kodNormal, kayitStokPlani, pazaryeriKimligi, PazaryeriSiparisSema, STOK_AKTIF,
  type BirlesimOzeti, type EnvanterAyarlari, type GelenSiparis, type Kanal, type KanalAyari, type PazaryeriSiparisi,
} from './pazaryeri';
import { MagazaSema, type Magaza } from './sema';
import { arkaPlanda } from './arkaPlan';
import { pazaryeriApiDurumu } from './pazaryeriApi';
import type { Database, Json } from './supabase.types';

type Depo = NonNullable<ReturnType<typeof supabaseIstemci>>;
type SiparisSatiri = Pick<Database['public']['Tables']['pazaryeri_siparisleri']['Row'], 'id' | 'surum' | 'veri'>;
type AyarKaydi = { ayar: EnvanterAyarlari; surum: number };
const SAYFA = 200;
const SIPARIS_SUTUNLARI = 'id, surum, veri';
const gecerliId = (id: string) => /^(trendyol|hepsiburada)-[A-Za-z0-9._-]{1,80}$/.test(id);

class PazaryeriCakismasi extends Error {}
/** Pazaryeri tabloları/fonksiyonları veritabanında henüz yok (migration 20261119150000 uygulanmadı) */
export class PazaryeriKurulmadi extends Error {
  constructor() { super('Pazaryeri ve stok defteri için veritabanı güncellemesi henüz uygulanmadı.'); }
}
const tabloYok = (hata?: { code?: string }) => hata?.code === 'PGRST205' || hata?.code === '42P01' || hata?.code === 'PGRST202';

function depoHatasi(islem: string, hata?: { code?: string }): never {
  if (cakismaHatasi(hata)) throw new PazaryeriCakismasi();
  if (tabloYok(hata)) throw new PazaryeriKurulmadi();
  console.error('[pazaryeri] Veritabanı işlemi tamamlanamadı', islem, hata?.code);
  throw new Error('Pazaryeri veritabanına erişilemedi. Envanter tablolarını ve Supabase bağlantı ayarlarını kontrol edin.');
}

function yazmaDeposu(): Depo {
  const sb = supabaseIstemci();
  if (!sb) throw new DogrulamaHatasi(['Pazaryeri kayıtları için Supabase bağlantısı gerekli.']);
  return sb;
}

/* Aynı anda gelen ayar okumaları tek isteği paylaşır (Genel Bakış'ta kanal durumu, sipariş listesi ve
 * stok eşiği aynı satırı okur). Önbellek yok: her yeni istek güncel satırı görür. */
let ayarOkunan: Promise<AyarKaydi> | undefined;
function ayarKaydiOku(sb: Depo): Promise<AyarKaydi> {
  if (ayarOkunan) return ayarOkunan;
  const is: Promise<AyarKaydi> = (async () => {
    const { data, error } = await sb.from('envanter_ayarlari').select('veri, surum').eq('id', 1).single();
    if (error || !data) depoHatasi('Ayarlar okuma', error ?? undefined);
    return { ayar: EnvanterAyarSema.parse(data.veri), surum: data.surum };
  })().finally(() => { if (ayarOkunan === is) ayarOkunan = undefined; });
  ayarOkunan = is;
  return is;
}

/** Menü rozeti için: pazaryerinde hazırlanacak/hazırlanan paket sayısı (tablo okunamazsa 0) */
export async function pazaryeriBekleyenSayisi(): Promise<number> {
  const sb = supabaseIstemci();
  if (!sb) return 0;
  const { count, error } = await sb.from('pazaryeri_siparisleri').select('id', { count: 'exact', head: true }).in('durum', ['yeni', 'hazirlaniyor']);
  return error ? 0 : count ?? 0;
}

/** Pazaryeri tabloları kurulu ve okunabiliyor mu (panelde formları açmak için) */
export async function pazaryeriHazirMi(): Promise<boolean> {
  const sb = supabaseIstemci();
  if (!sb) return false;
  try { await ayarKaydiOku(sb); return true; } catch { return false; }
}

export async function envanterAyarlariOku(): Promise<EnvanterAyarlari> {
  const sb = supabaseIstemci();
  if (!sb) return bosAyarlar();
  try { return (await ayarKaydiOku(sb)).ayar; } catch (e) {
    if (e instanceof PazaryeriKurulmadi) return bosAyarlar();
    throw e;
  }
}

async function tekrarDene<T>(islem: () => Promise<T>): Promise<T> {
  for (let deneme = 0; deneme < 4; deneme++) {
    try {
      return await islem();
    } catch (e) {
      if (!(e instanceof PazaryeriCakismasi)) throw e;
      if (deneme < 3) await new Promise((resolve) => setTimeout(resolve, 25 * (deneme + 1) + Math.random() * 25));
    }
  }
  throw new DogrulamaHatasi(['Kayıtlar eşzamanlı güncellendi. Biraz sonra tekrar deneyin.']);
}

/** Gerekirse tekrar çalıştırılan değişiklik fonksiyonu yalnız ayar kopyasını düzenler. */
export function envanterAyarlariGuncelle(degistir: (ayar: EnvanterAyarlari) => void): Promise<EnvanterAyarlari> {
  const sb = yazmaDeposu();
  return tekrarDene(async () => {
    const { ayar, surum } = await ayarKaydiOku(sb);
    const yeni = structuredClone(ayar);
    degistir(yeni);
    const dogrulanmis = EnvanterAyarSema.parse(yeni);
    baslangiclariDogrula(ayar, dogrulanmis);
    if (JSON.stringify(ayar) === JSON.stringify(dogrulanmis)) return ayar;
    const { error } = await sb.rpc('envanter_ayar_kaydet', { ayarlar: dogrulanmis, ayar_surum: surum });
    if (error) depoHatasi('Ayarlar kayıt', error);
    return dogrulanmis;
  });
}

function baslangiclariDogrula(eski: EnvanterAyarlari, yeni: EnvanterAyarlari): void {
  for (const kanal of ['trendyol', 'hepsiburada'] as const) {
    const onceki = eski.kanallar[kanal];
    const baslangic = yeni.kanallar[kanal].stokBaslangic;
    if (baslangic && !Number.isFinite(Date.parse(baslangic))) throw new DogrulamaHatasi(['Stok başlangıç tarihi geçersiz.']);
    if (onceki.sonAktarim && onceki.stokBaslangic && Date.parse(baslangic ?? '') !== Date.parse(onceki.stokBaslangic)) {
      throw new DogrulamaHatasi(['Stok başlangıç tarihi ilk aktarım tamamlandıktan sonra değiştirilemez.']);
    }
  }
}

function siparisCoz(satir: SiparisSatiri): PazaryeriSiparisi {
  const s = PazaryeriSiparisSema.parse(satir.veri);
  if (s.id !== satir.id) throw new Error('Pazaryeri siparişinin kayıt kimliği hatalı.');
  return { ...s, surum: satir.surum };
}

async function siparisSayfalari(sb: Depo): Promise<PazaryeriSiparisi[]> {
  const kayitlar: PazaryeriSiparisi[] = [];
  let sonId = '';
  for (;;) {
    let sorgu = sb.from('pazaryeri_siparisleri').select(SIPARIS_SUTUNLARI).order('id').limit(SAYFA);
    if (sonId) sorgu = sorgu.gt('id', sonId);
    const { data, error } = await sorgu;
    if (error) depoHatasi('Siparişler okuma', error);
    if (!data.length) return kayitlar;
    kayitlar.push(...data.map(siparisCoz));
    sonId = data[data.length - 1]!.id;
  }
}

export async function pazaryeriSiparisleriOku(): Promise<PazaryeriSiparisi[]> {
  const sb = supabaseIstemci();
  if (!sb) return [];
  // Ayar satırı ve sipariş listesi aynı anda istenir (sırayla beklemek sayfayı bir tur daha yavaşlatıyordu).
  // Ayar okuması izin denetimidir: gizli anahtara izin verilmezse RLS boş bir liste döndürür.
  const [ayar, liste] = await Promise.allSettled([ayarKaydiOku(sb), siparisSayfalari(sb)]);
  if (ayar.status === 'rejected') {
    if (ayar.reason instanceof PazaryeriKurulmadi) return []; // Henüz kurulmadı: listede yalnız web siparişleri
    throw ayar.reason;
  }
  if (liste.status === 'rejected') throw liste.reason;
  return liste.value.sort((a, b) => b.tarih.localeCompare(a.tarih) || a.id.localeCompare(b.id));
}

async function siparisOku(sb: Depo, id: string): Promise<PazaryeriSiparisi | undefined> {
  const { data, error } = await sb.from('pazaryeri_siparisleri').select(SIPARIS_SUTUNLARI).eq('id', id).maybeSingle();
  if (error) depoHatasi('Sipariş okuma', error);
  return data ? siparisCoz(data) : undefined;
}

export async function pazaryeriSiparisiOku(id: string): Promise<PazaryeriSiparisi | undefined> {
  const sb = supabaseIstemci();
  if (!sb || !gecerliId(id)) return undefined;
  await ayarKaydiOku(sb);
  return siparisOku(sb, id);
}

async function aktarilacakKayitlariOku(sb: Depo, kanal: Kanal, gelen: GelenSiparis[]) {
  const numaralar = [...new Set(gelen.map((s) => s.siparisNo))];
  const mevcut = new Map<string, PazaryeriSiparisi>();
  const siparisNoIle = new Map<string, PazaryeriSiparisi[]>();
  let sonId = '';
  while (numaralar.length) {
    const { data, error } = await sb.rpc('pazaryeri_aktarim_kayitlari_oku', { p_kanal: kanal, p_siparis_nolari: numaralar, p_son_id: sonId });
    if (error) depoHatasi('Aktarılacak siparişleri okuma', error);
    if (!data.length) break;
    for (const s of data.map(siparisCoz)) {
      mevcut.set(s.id, s);
      const anahtar = `${kanal}:${s.siparisNo}`;
      const ayni = siparisNoIle.get(anahtar) ?? [];
      ayni.push(s);
      siparisNoIle.set(anahtar, ayni);
    }
    sonId = data[data.length - 1]!.id;
  }
  return { mevcut, siparisNoIle };
}

async function pazaryeriKaydet(
  sb: Depo, ayarSurum: number, magaza: Magaza, kayitlar: PazaryeriSiparisi[],
  stok: ReadonlyMap<string, number>, sebep: string, yeniAyar: EnvanterAyarlari | null = null,
): Promise<void> {
  const yeniMagaza = stok.size ? magazaAdayi(magaza, (m) => {
    for (const urun of m.urunler) urun.stok += stok.get(urun.id) ?? 0;
  }) : null;
  const { data, error } = await sb.rpc('pazaryeri_kaydet', {
    kayitlar: kayitlar.map(({ surum: _surum, ...s }) => ({ id: s.id, kanal: s.kanal, tarih: s.tarih, durum: s.durum, veri: s })),
    beklenen: Object.fromEntries(kayitlar.map((s) => [s.id, s.surum])) as Json,
    yeni_magaza: yeniMagaza, beklenen_surum: magaza.surum,
    ayarlar: yeniAyar, ayar_surum: ayarSurum, sebep,
  });
  if (error) depoHatasi('Sipariş ve stok kaydı', error);
  if (yeniMagaza) {
    const sonuc = MagazaSema.safeParse(data);
    const kaydedilen = sonuc.success ? sonuc.data : yeniMagaza;
    await magazaYansit(kaydedilen);
    arkaPlanda(stokSonrasi(magaza, kaydedilen), 'stok uyarısı');
  }
}

function gelenSiparisleriDogrula(kanal: Kanal, siparisler: GelenSiparis[]): GelenSiparis[] {
  if (siparisler.length > 5000) throw new DogrulamaHatasi(['Tek seferde en fazla 5.000 sipariş aktarılabilir.']);
  const benzersiz = new Map<string, GelenSiparis>();
  for (const s of siparisler) {
    const id = pazaryeriKimligi(kanal, s.anahtar);
    if (s.kanal !== kanal || !gecerliId(id) || !s.siparisNo.trim() || s.siparisNo.length > 120 ||
      !Number.isFinite(Date.parse(s.tarih)) || !s.kalemler.length || s.kalemler.some((k) => !Number.isSafeInteger(k.adet) || k.adet < 1)) {
      throw new DogrulamaHatasi(['Aktarımda sipariş numarası, tarih veya ürün adedi eksik ya da geçersiz.']);
    }
    const onceki = benzersiz.get(id);
    if (onceki && JSON.stringify(onceki) !== JSON.stringify(s)) {
      throw new DogrulamaHatasi(['Aktarımda aynı paket için farklı kayıtlar var. Paketin güncel kaydını tekrar içe aktarın.']);
    }
    benzersiz.set(id, s);
  }
  return [...benzersiz.values()];
}

/** Sipariş, stok hareketi ve aktarım özeti aynı veritabanı işleminde kaydedilir. */
export function pazaryeriAktar(
  kanal: Kanal, gelenler: GelenSiparis[], kaynak: 'api' | 'excel', ayarGuncelle?: (a: KanalAyari) => void,
): Promise<BirlesimOzeti> {
  const sb = yazmaDeposu();
  const gelen = gelenSiparisleriDogrula(kanal, gelenler);
  return depoSirasi(() => tekrarDene(async () => {
    const { ayar, surum } = await ayarKaydiOku(sb);
    const testModu = kaynak === 'api' && pazaryeriApiDurumu(kanal) === 'test';
    if (!testModu && !Number.isFinite(Date.parse(ayar.kanallar[kanal].stokBaslangic ?? ''))) {
      throw new DogrulamaHatasi(['Aktarımdan önce kanalın stok başlangıç tarihini kaydedin.']);
    }
    const magaza = await magazaOku(true);
    const [web, { mevcut, siparisNoIle }] = await Promise.all([
      gelen.length ? siparisleriOku(true) : Promise.resolve([]), aktarilacakKayitlariOku(sb, kanal, gelen),
    ]);
    const ayrilan = webAyrilanAdetleri(web, Date.now(), magaza.paytrStokIslemleri);
    const simdi = new Date().toISOString();
    const { kayitlar, ozet } = birlestir(gelen, mevcut, magaza, ayar, kaynak, simdi, siparisNoIle, ayrilan, testModu);

    const yeniAyar = structuredClone(ayar);
    const kanalAyari = yeniAyar.kanallar[kanal];
    if (kaynak === 'api') {
      kanalAyari.sonApi = simdi;
      delete kanalAyari.sonApiHata;
    }
    ayarGuncelle?.(kanalAyari);
    kanalAyari.stokBaslangic = ayar.kanallar[kanal].stokBaslangic;
    kanalAyari.sonAktarim = simdi;
    kanalAyari.sonAktarimOzet = `${ozet.yeni} yeni · ${ozet.guncellenen} güncellendi · ${ozet.degismeyen} aynı`;
    // Stok defterinde "neden": stoğu değişen siparişlerin numarası ve durumu (ör. "Trendyol: 1065… iptal, 1065… hazırlanacak")
    const dusulen = (s?: PazaryeriSiparisi) => s ? s.kalemler.reduce((t, k) => t + k.dusulen, 0) : 0;
    const nedenler = kayitlar.filter((s) => dusulen(s) !== dusulen(mevcut.get(s.id)))
      .map((s) => `${s.siparisNo} ${PY_DURUM_ADLARI[s.durum].toLocaleLowerCase('tr')}`);
    const sebep = `${KANALLAR[kanal]}: ${nedenler.length ? nedenler.join(', ') : 'sipariş aktarımı'}`;
    await pazaryeriKaydet(sb, surum, magaza, kayitlar, ozet.stok, sebep.length > 200 ? sebep.slice(0, 199) + '…' : sebep, EnvanterAyarSema.parse(yeniAyar));
    return ozet;
  }));
}

export type KalemIslemi = { tur: 'eslestir'; urunId: string } | { tur: 'iade'; satilabilir: boolean } | { tur: 'stogu-tamamla' };

export function pazaryeriKalemIsle(id: string, beklenenSurum: number, kalemAnahtari: string, islem: KalemIslemi): Promise<PazaryeriSiparisi> {
  const sb = yazmaDeposu();
  if (!gecerliId(id)) throw new DogrulamaHatasi(['Sipariş numarası geçersiz.']);
  return depoSirasi(() => tekrarDene(async () => {
    const [{ ayar, surum }, s, magaza] = await Promise.all([ayarKaydiOku(sb), siparisOku(sb, id), magazaOku(true)]);
    let yeniAyar: EnvanterAyarlari | null = null;
    if (!s) throw new DogrulamaHatasi(['Pazaryeri siparişi bulunamadı.']);
    if (s.surum !== beklenenSurum) throw new DogrulamaHatasi(['Sipariş güncellendi. Sayfayı yenileyip tekrar deneyin.']);
    if (s.stokDisi) throw new DogrulamaHatasi(['Geçmiş siparişlerin stok kaydı değiştirilemez.']);
    const indeks = s.kalemler.findIndex((k) => k.anahtar === kalemAnahtari);
    const kalem = s.kalemler[indeks];
    if (!kalem) throw new DogrulamaHatasi(['Sipariş kalemi bulunamadı.']);

    const stok = new Map<string, number>();
    let not: string;
    if (islem.tur === 'iade') {
      if (!kalem.urunId || !kalemIadeBekliyor(kalem)) {
        throw new DogrulamaHatasi(['Bu ürün için bekleyen iade kontrolü yok.']);
      }
      if (islem.satilabilir) {
        if (!magaza.urunler.some((u) => u.id === kalem.urunId)) throw new DogrulamaHatasi(['Katalogda bulunmayan ürünün stoğu artırılamaz.']);
        stok.set(kalem.urunId, kalem.dusulen);
      }
      kalem.stok = islem.satilabilir ? 'geri-alindi' : 'hasarli';
      not = `${kalem.ad} · ${kalem.dusulen} adet ${islem.satilabilir ? 'stoğa alındı' : 'satılabilir stoğa eklenmedi'}`;
      kalem.dusulen = 0;
      kalem.eksik = 0;
    } else {
      if (!STOK_AKTIF.has(kalem.durum)) throw new DogrulamaHatasi(['Bu kalemin sipariş durumu stok ayırmaya uygun değil.']);
      const urunId = islem.tur === 'eslestir' ? islem.urunId : kalem.urunId;
      const urun = magaza.urunler.find((u) => u.id === urunId);
      if (!urun) throw new DogrulamaHatasi(['Katalog ürünü bulunamadı.']);
      const ayrilan = webAyrilanAdetleri(await siparisleriOku(true), Date.now(), magaza.paytrStokIslemleri);
      if (islem.tur === 'eslestir') {
        if (kalem.urunId || kalem.stok !== 'yok') throw new DogrulamaHatasi(['Kalem için ürün eşleştirmesi zaten yapılmış.']);
        kalem.urunId = urun.id;
        const plan = kayitStokPlani({ ...s, kalemler: [kalem] }, magaza, ayrilan);
        s.kalemler[indeks] = plan.kayit.kalemler[0]!;
        for (const [anahtar, degisim] of plan.stok) stok.set(anahtar, degisim);
        not = `${kalem.ad} · ${urun.ad} ile eşleştirildi`;
        // Eşleştirme kalıcı olsun: aynı barkod/stok koduyla gelecek siparişler kendiliğinden bu ürüne bağlanır.
        // Ürünün bu kanalda kayıtlı ilanı yoksa, kod ilan kodu olarak da yazılır (kurulum adımı 3 tamamlanır).
        yeniAyar = structuredClone(ayar);
        for (const kod of [kalem.barkod, kalem.stokKodu]) if (kod && kodNormal(kod)) yeniAyar.eslesmeler[kodNormal(kod)] = urun.id;
        const ilanKodu = s.kanal === 'trendyol' ? kalem.barkod : kalem.stokKodu;
        const kanalAyari = yeniAyar.kanallar[s.kanal];
        if (ilanKodu && !kanalAyari.urunler[urun.id]?.kod && !Object.values(kanalAyari.urunler).some((u) => u.kod === ilanKodu)) {
          kanalAyari.urunler[urun.id] = { satista: true, kod: ilanKodu };
        }
      } else {
        if (kalem.stok !== 'dusuldu' || kalem.eksik < 1) throw new DogrulamaHatasi(['Bu kaleme ayrılmayı bekleyen stok yok.']);
        const adet = Math.min(kalem.eksik, Math.max(0, urun.stok - (ayrilan.get(urun.id) ?? 0)));
        if (!adet) throw new DogrulamaHatasi(['Bu ürünün kullanılabilir stoğu yok.']);
        stok.set(urun.id, -adet);
        kalem.dusulen += adet;
        kalem.eksik -= adet;
        not = `${kalem.ad} · ${adet} adet stok ayrıldı`;
      }
    }
    s.gecmis.push({ tarih: new Date().toISOString(), durum: s.durum, not });
    await pazaryeriKaydet(sb, surum, magaza, [s], stok, `${KANALLAR[s.kanal]} ${s.siparisNo} · ${not}`.slice(0, 200), yeniAyar && EnvanterAyarSema.parse(yeniAyar));
    return { ...s, surum: s.surum + 1 };
  }));
}

/**
 * Siparişin geçmişine panel/otomasyon işlemi yazar (ör. "Trendyol’a toplanıyor bildirildi"). Stok değişmez.
 * Sipariş adımları (lib/siparisAdimlari.ts) bu kayıtlardan tarih alır.
 */
export function pazaryeriGecmiseEkle(id: string, not: string): Promise<void> {
  const sb = yazmaDeposu();
  if (!gecerliId(id)) throw new DogrulamaHatasi(['Sipariş numarası geçersiz.']);
  return depoSirasi(() => tekrarDene(async () => {
    const [{ surum }, s, magaza] = await Promise.all([ayarKaydiOku(sb), siparisOku(sb, id), magazaOku(true)]);
    if (!s) return;
    s.gecmis.push({ tarih: new Date().toISOString(), durum: s.durum, not: not.slice(0, 300) });
    await pazaryeriKaydet(sb, surum, magaza, [s], new Map(), `${KANALLAR[s.kanal]} ${s.siparisNo} · ${not}`.slice(0, 200));
  }));
}

export async function stokHareketleriOku(urunId?: string, limit = 100): Promise<StokHareketi[]> {
  const adet = Math.max(1, Math.min(500, Math.trunc(limit) || 100));
  const sb = supabaseIstemci();
  if (!sb) {
    try {
      const liste = JSON.parse(await fs.readFile(YEREL_STOK_DEFTERI, 'utf8')) as StokHareketi[];
      return liste.filter((s) => !urunId || s.urunId === urunId).slice(0, adet);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw new Error('Yerel stok hareketleri okunamadı.');
    }
  }
  try { await ayarKaydiOku(sb); } catch (e) {
    if (e instanceof PazaryeriKurulmadi) return [];
    throw e;
  }
  let sorgu = sb.from('stok_hareketleri').select('tarih, urun_id, onceki, sonraki, sebep')
    .order('tarih', { ascending: false }).order('id', { ascending: false }).limit(adet);
  if (urunId) sorgu = sorgu.eq('urun_id', urunId);
  const { data, error } = await sorgu;
  if (error) depoHatasi('Stok hareketleri okuma', error);
  return data.map(({ urun_id, ...hareket }) => ({ ...hareket, urunId: urun_id }));
}
