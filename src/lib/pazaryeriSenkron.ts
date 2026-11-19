import { randomUUID } from 'node:crypto';
import { DogrulamaHatasi, magazaOku, siparisleriOku, supabaseIstemci, webAyrilanAdetleri } from './depo';
import { eslesmeyenVar, fazlaSatisVar, KANALLAR, KANAL_LISTESI, kanalHedefStok, type Kanal, type KanalAyari } from './pazaryeri';
import {
  kanalSiparisAl, kanalStokGonder, kanalStokOku, kanalStokSonucu, otomatikStokYazmaAcik, pazaryeriApiDurumu,
  PazaryeriApiHatasi, pazaryeriOrtam, type StokKalemi,
} from './pazaryeriApi';
import { envanterAyarlariGuncelle, envanterAyarlariOku, pazaryeriAktar, pazaryeriSiparisleriOku } from './pazaryeriDepo';

type KanalSonucu = { siparis?: number; stok?: number; hata?: string; stokHata?: string };
type SenkronSonucu = { durum: 'tamam' | 'bekliyor' | 'kapali' | 'hata'; kanallar: Partial<Record<Kanal, KanalSonucu>> };
type BekleyenStok = NonNullable<KanalAyari['bekleyenStok']>;
const GUN = 86400_000;
const GONDERIM_BEKLENIYOR = 'gonderim-bekleniyor';
const TAZELIK = 3 * 60_000;

function hataMesaji(e: unknown) {
  if (e instanceof PazaryeriApiHatasi) return e.message;
  if (e instanceof DogrulamaHatasi) return e.hatalar[0] ?? 'Senkronizasyon doğrulanamadı.';
  return 'Senkronizasyon işlemi tamamlanamadı. Veritabanı bağlantısını ve envanter ayarlarını kontrol edin.';
}

function kanalAyariYaz(kanal: Kanal, degistir: (a: KanalAyari) => void) {
  return envanterAyarlariGuncelle((a) => degistir(a.kanallar[kanal]));
}

async function stokHatasiYaz(kanal: Kanal, mesaj?: string) {
  await kanalAyariYaz(kanal, (a) => { a.sonStokHata = mesaj; });
}

function cekimBaslangici(kanal: Kanal, a: KanalAyari, bitis: number) {
  const stokBaslangic = Date.parse(a.stokBaslangic ?? '');
  if (!Number.isFinite(stokBaslangic) || stokBaslangic > bitis) {
    throw new PazaryeriApiHatasi(`${KANALLAR[kanal]} için sayım sonrası stok başlangıç zamanı gerekli.`);
  }
  const son = Date.parse(a.sonApi ?? '');
  const baslangic = Number.isFinite(son) ? son - 2 * 3600_000 : Math.min(stokBaslangic - 3600_000, bitis - 2 * GUN);
  const kapsam = (kanal === 'trendyol' ? 13 : 29) * GUN;
  if (bitis - baslangic > kapsam && bitis - stokBaslangic > kapsam) {
    throw new PazaryeriApiHatasi(`${KANALLAR[kanal]} aktarım aralığı aşıldı. Eksik dönemi satıcı panelinden karşılaştırın.`);
  }
  return Math.max(bitis - kapsam, baslangic);
}

async function katalogStogu() {
  const magaza = await magazaOku(true);
  const ayrilan = webAyrilanAdetleri(await siparisleriOku(true), Date.now(), magaza.paytrStokIslemleri);
  return { surum: magaza.surum, satilabilir: new Map(magaza.urunler.map((u) => [u.id, Math.max(0, u.stok - (ayrilan.get(u.id) ?? 0))])) };
}

function stokHedefleri(kanal: Kanal, a: KanalAyari, stoklar: ReadonlyMap<string, number>): StokKalemi[] {
  const kodlar = new Set<string>();
  const hedefler: StokKalemi[] = [];
  for (const [urunId, listeleme] of Object.entries(a.urunler)) {
    const kod = listeleme.kod?.trim();
    const stok = stoklar.get(urunId);
    if (!kod && !listeleme.satista) continue;
    if (!kod || (kanal === 'trendyol' && /[,\s]/.test(kod)) || kodlar.has(kod) || stok === undefined) {
      throw new PazaryeriApiHatasi(`${KANALLAR[kanal]} ilanlarında eksik, tekrarlı veya geçersiz ürün kodu var.`);
    }
    kodlar.add(kod);
    hedefler.push({ urunId, kod, stok: listeleme.satista ? Math.min(20_000, kanalHedefStok(stok, a)) : 0 });
  }
  return hedefler;
}

function bekleyenSatiriYaz(kanal: Kanal, eski: BekleyenStok | undefined, yeni: BekleyenStok | undefined) {
  return kanalAyariYaz(kanal, (a) => {
    if (a.bekleyenStok?.id !== eski?.id || a.bekleyenStok?.tarih !== eski?.tarih) {
      throw new PazaryeriApiHatasi('Stok gönderim kaydı eşzamanlı değişti. Bir sonraki senkron bekleniyor.');
    }
    a.bekleyenStok = yeni;
  });
}

async function stokSonuclandir(kanal: Kanal, bekleyen: BekleyenStok, sinyal: AbortSignal): Promise<number | undefined> {
  const gecenSure = Date.now() - Date.parse(bekleyen.tarih);
  let sonuc: Awaited<ReturnType<typeof kanalStokSonucu>> | undefined;
  if (bekleyen.id !== GONDERIM_BEKLENIYOR) {
    try {
      sonuc = await kanalStokSonucu(kanal, bekleyen.id, bekleyen.kalemler, sinyal);
    } catch (e) {
      // Trendyol 4 saatten eski kuyruk sonuçlarını kaldırır.
      if (!(kanal === 'trendyol' && gecenSure > 4 * 3600_000 + 5 * 60_000 && e instanceof PazaryeriApiHatasi && e.status === 404)) throw e;
    }
  }
  if (!sonuc) {
    if (gecenSure < 10 * 60_000) throw new PazaryeriApiHatasi('Stok isteği için takip numarası alınamadı. Satıcı panelindeki stokları kontrol edin.');
    const ilanlar = await kanalStokOku(kanal, bekleyen.kalemler.map((k) => k.kod), sinyal);
    if (!bekleyen.kalemler.every((k) => ilanlar.get(k.kod)?.stok === k.stok)) {
      throw new PazaryeriApiHatasi('Önceki stok güncellemesi kanal üzerinden doğrulanamadı. Yeni gönderim için mevcut ilan adetlerini kontrol edin.');
    }
    sonuc = { bekliyor: false, basarili: new Set(bekleyen.kalemler.map((k) => k.kod)) };
  }
  if (sonuc.bekliyor) return undefined;
  await kanalAyariYaz(kanal, (a) => {
    if (a.bekleyenStok?.id !== bekleyen.id) throw new PazaryeriApiHatasi('Stok gönderim kaydı eşzamanlı değişti.');
    const tarih = new Date().toISOString();
    for (const k of bekleyen.kalemler) {
      const urun = a.urunler[k.urunId];
      if (urun?.kod === k.kod && sonuc.basarili.has(k.kod)) {
        urun.bildirilen = k.stok;
        urun.sonHedef = k.stok;
        urun.tarih = tarih;
      }
    }
    delete a.bekleyenStok;
    a.sonStokHata = sonuc.basarili.size < bekleyen.kalemler.length
      ? `${bekleyen.kalemler.length - sonuc.basarili.size} ilan için stok güncellemesi doğrulanamadı. Satıcı panelini kontrol edin.`
      : undefined;
  });
  if (sonuc.basarili.size < bekleyen.kalemler.length) {
    throw new PazaryeriApiHatasi(`${bekleyen.kalemler.length - sonuc.basarili.size} ilan için stok güncellemesi doğrulanamadı. Satıcı panelini kontrol edin.`);
  }
  return sonuc.basarili.size;
}

async function stokHazirla(kanal: Kanal, a: KanalAyari, katalog: Awaited<ReturnType<typeof katalogStogu>>, sinyal: AbortSignal) {
  const hedefler = stokHedefleri(kanal, a, katalog.satilabilir);
  const ilanlar = await kanalStokOku(kanal, hedefler.map((k) => k.kod), sinyal);
  if (hedefler.some((k) => !ilanlar.has(k.kod))) {
    throw new PazaryeriApiHatasi(`${KANALLAR[kanal]} tarafında eşleşen ilanların tamamı doğrulanamadı. Ürün kodlarını kontrol edin.`);
  }
  return { katalog, hedefler, ilanlar };
}

async function stokYayimla(
  kanal: Kanal, a: KanalAyari, hazir: Awaited<ReturnType<typeof stokHazirla>>, artisEngeli: boolean, sinyal: AbortSignal,
) {
  const { katalog, hedefler, ilanlar } = hazir;
  const artisAcik = !artisEngeli && pazaryeriOrtam('PAZARYERI_STOK_ARTIR') === '1';
  const degisen = hedefler.filter((k) => {
    const gercek = ilanlar.get(k.kod)!.stok;
    const onceki = a.urunler[k.urunId]?.sonHedef;
    if (gercek > k.stok) return true;
    // Kanalda doğal olarak azalan adedi her taramada eski hedefe geri çıkarmayız.
    return gercek < k.stok && artisAcik && (onceki === undefined || k.stok > onceki);
  }).slice(0, 1000);
  if (hedefler.length) {
    await kanalAyariYaz(kanal, (taze) => {
      const tarih = new Date().toISOString();
      for (const k of hedefler) {
        const urun = taze.urunler[k.urunId];
        if (!urun || urun.kod !== k.kod) continue;
        urun.bildirilen = ilanlar.get(k.kod)!.stok;
        urun.tarih = tarih;
        if (urun.bildirilen === k.stok) urun.sonHedef = k.stok;
      }
    });
  }
  if (!degisen.length) {
    const farkVar = hedefler.some((k) => ilanlar.get(k.kod)!.stok < k.stok);
    await stokHatasiYaz(kanal, farkVar ? 'Bazı ilanlarda kanalın stoğu hedefin altında. Artış koşullarını ve satıcı panelini kontrol edin.' : undefined);
    return 0;
  }
  const [tazeKatalog, tazeAyarlar] = await Promise.all([katalogStogu(), envanterAyarlariOku()]);
  const taze = tazeAyarlar.kanallar[kanal];
  if (sinyal.aborted || katalog.surum !== tazeKatalog.surum || !taze.sonApi || Date.now() - Date.parse(taze.sonApi) > TAZELIK
    || JSON.stringify(hedefler) !== JSON.stringify(stokHedefleri(kanal, taze, tazeKatalog.satilabilir))) {
    throw new PazaryeriApiHatasi('Stok veya kanal ayarları güncellendi. Bir sonraki senkron bekleniyor.');
  }
  const bekleyen = { id: GONDERIM_BEKLENIYOR, tarih: new Date().toISOString(), kalemler: degisen };
  // Dış istek kesilirse işlem sonucunu tahmin edip aynı kanala yeni bir toplu istek gönderme.
  await bekleyenSatiriYaz(kanal, undefined, bekleyen);
  let id: string;
  try {
    id = await kanalStokGonder(kanal, degisen, ilanlar, sinyal);
  } catch (e) {
    if (e instanceof PazaryeriApiHatasi && e.status && [400, 401, 403, 404, 409, 422, 429].includes(e.status)) {
      await bekleyenSatiriYaz(kanal, bekleyen, undefined);
    }
    throw e;
  }
  await bekleyenSatiriYaz(kanal, bekleyen, { ...bekleyen, id });
  await stokHatasiYaz(kanal);
  return undefined;
}

export async function pazaryeriSenkron(): Promise<SenkronSonucu> {
  const kanallar: SenkronSonucu['kanallar'] = {};
  const bagli = KANAL_LISTESI.filter((k) => pazaryeriApiDurumu(k) !== 'kapali');
  if (!bagli.length) return { durum: 'kapali', kanallar };
  if (bagli.some((k) => pazaryeriApiDurumu(k) === 'test')
    && (pazaryeriOrtam('PAZARYERI_TEST_VERITABANI') !== '1' || pazaryeriOrtam('VERCEL_ENV') === 'production'
      || bagli.some((k) => pazaryeriApiDurumu(k) === 'canli'))) {
    for (const kanal of bagli) kanallar[kanal] = { hata: 'Test senkronizasyonu için ayrı test veritabanı ve test kanalı ayarları gerekli.' };
    return { durum: 'hata', kanallar };
  }
  const sb = supabaseIstemci();
  if (!sb) throw new PazaryeriApiHatasi('Pazaryeri senkronizasyonu için Supabase bağlantısı gerekli.');
  const sahip = randomUUID();
  const kilit = await sb.rpc('pazaryeri_senkron_kilitle', { sahip }).abortSignal(AbortSignal.timeout(8000));
  if (kilit.error) throw new PazaryeriApiHatasi('Senkronizasyon kilidi alınamadı. Supabase senkronizasyon migration kaydını kontrol edin.');
  if (!kilit.data) return { durum: 'bekliyor', kanallar };

  try {
    const ilkAyar = await envanterAyarlariOku();
    const bitis = Date.now();
    // Vercel fonksiyonu en fazla 60 sn çalışır (astro.config maxDuration); kilit bırakma ve kayıt için pay bırakılır
    const sinyal = AbortSignal.timeout(45_000);
    await Promise.all(bagli.map(async (kanal) => {
      try {
        const baslangic = cekimBaslangici(kanal, ilkAyar.kanallar[kanal], bitis);
        const gelen = await kanalSiparisAl(kanal, baslangic, bitis, sinyal);
        const sonuc = await pazaryeriAktar(kanal, gelen, 'api', (a) => { a.sonApi = new Date(bitis).toISOString(); });
        kanallar[kanal] = { siparis: sonuc.yeni + sonuc.guncellenen };
      } catch (e) {
        const hata = hataMesaji(e);
        kanallar[kanal] = { hata };
        await kanalAyariYaz(kanal, (a) => { a.sonApiHata = hata; }).catch(() => undefined);
      }
    }));

    if (otomatikStokYazmaAcik()) {
      const ayar = await envanterAyarlariOku();
      const beklenen = KANAL_LISTESI.filter((k) => bagli.includes(k) || ayar.kanallar[k].stokBaslangic || Object.keys(ayar.kanallar[k].urunler).length);
      const uyumluOrtam = new Set(bagli.map(pazaryeriApiDurumu)).size === 1;
      const yazabilir = uyumluOrtam && beklenen.every((k) => kanallar[k]?.siparis !== undefined && !ayar.kanallar[k].sonApiHata);
      if (!yazabilir) {
        const mesaj = 'Stok gönderimi durduruldu. Satış yapılan her kanalın aynı ortamda ve sipariş aktarımının başarılı olması gerekir.';
        for (const kanal of bagli) {
          kanallar[kanal] = { ...kanallar[kanal], stokHata: mesaj };
          await stokHatasiYaz(kanal, mesaj).catch(() => undefined);
        }
      } else {
        const [siparisler, katalog] = await Promise.all([pazaryeriSiparisleriOku(), katalogStogu()]);
        const hazirlar = new Map<Kanal, Awaited<ReturnType<typeof stokHazirla>>>();
        const stokHatasiniKaydet = async (kanal: Kanal, e: unknown) => {
          const stokHata = hataMesaji(e);
          kanallar[kanal] = { ...kanallar[kanal], stokHata };
          await stokHatasiYaz(kanal, stokHata).catch(() => undefined);
        };
        await Promise.all(bagli.map(async (kanal) => {
          const a = ayar.kanallar[kanal];
          if (a.bekleyenStok) return;
          try {
            hazirlar.set(kanal, await stokHazirla(kanal, a, katalog, sinyal));
          } catch (e) {
            await stokHatasiniKaydet(kanal, e);
          }
        }));
        const artisEngeli = hazirlar.size !== bagli.length || [...hazirlar.values()].some((h) => !h.hedefler.length) || siparisler.some((s) =>
          eslesmeyenVar(s) || fazlaSatisVar(s) || (!s.stokDisi && s.kalemler.some((k) => k.durum === 'bilinmiyor')));
        for (const kanal of bagli) {
          try {
            const a = ayar.kanallar[kanal];
            const hazir = hazirlar.get(kanal);
            const stok = a.bekleyenStok ? await stokSonuclandir(kanal, a.bekleyenStok, sinyal)
              : hazir ? await stokYayimla(kanal, a, hazir, artisEngeli, sinyal) : undefined;
            if (stok !== undefined) kanallar[kanal] = { ...kanallar[kanal], stok };
          } catch (e) {
            await stokHatasiniKaydet(kanal, e);
          }
        }
      }
    }
    const hataVar = Object.values(kanallar).some((k) => k.hata || k.stokHata);
    return { durum: hataVar ? 'hata' : 'tamam', kanallar };
  } finally {
    try {
      const { error } = await sb.rpc('pazaryeri_senkron_kilidi_birak', { sahip }).abortSignal(AbortSignal.timeout(5000));
      if (error) console.error('[pazaryeri] Senkronizasyon kilidi bırakılamadı:', error.code);
    } catch {
      console.error('[pazaryeri] Senkronizasyon kilidi bırakılamadı.');
    }
  }
}
