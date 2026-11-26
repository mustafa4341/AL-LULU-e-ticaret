import { randomUUID } from 'node:crypto';
import { arkaPlanda } from './arkaPlan';
import { DogrulamaHatasi, magazaOku, siparisleriOku, supabaseIstemci, webAyrilanAdetleri } from './depo';
import { eslesmeyenVar, fazlaSatisVar, KANALLAR, KANAL_LISTESI, kanalHedefStok, type EnvanterAyarlari, type Kanal, type KanalAyari } from './pazaryeri';
import {
  kanalSiparisAl, kanalStokGonder, kanalStokOku, kanalStokSonucu, otomatikStokYazmaAcik, pazaryeriApiDurumu,
  PazaryeriApiHatasi, pazaryeriOrtam, type StokKalemi,
} from './pazaryeriApi';
import { envanterAyarlariGuncelle, envanterAyarlariOku, pazaryeriAktar, pazaryeriSiparisleriOku } from './pazaryeriDepo';
import { otomatikIsler } from './otomasyon';

type KanalSonucu = { siparis?: number; stok?: number; hata?: string; stokHata?: string };
type SenkronSonucu = { durum: 'tamam' | 'bekliyor' | 'kapali' | 'hata'; kanallar: Partial<Record<Kanal, KanalSonucu>>; otomasyon?: string[] };
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

/** `not` verilirse bilgi notu da güncellenir (kırmızı uyarı sayılmayan: ör. bağlı barkod kanalda henüz onaylı değil) */
async function stokHatasiYaz(kanal: Kanal, mesaj?: string, not?: string | null) {
  await kanalAyariYaz(kanal, (a) => {
    a.sonStokHata = mesaj;
    if (not !== undefined) a.sonStokNot = not ?? undefined;
  });
}

function cekimBaslangici(kanal: Kanal, a: KanalAyari, bitis: number) {
  const testModu = pazaryeriApiDurumu(kanal) === 'test';
  const stokBaslangic = Date.parse(a.stokBaslangic ?? '');
  if (!testModu && (!Number.isFinite(stokBaslangic) || stokBaslangic > bitis)) {
    throw new PazaryeriApiHatasi(`${KANALLAR[kanal]} için sayım sonrası stok başlangıç zamanı gerekli.`);
  }
  const son = Date.parse(a.sonApi ?? '');
  const kapsam = (kanal === 'trendyol' ? 13 : 29) * GUN;
  if (testModu && !Number.isFinite(stokBaslangic)) {
    const bas = Number.isFinite(son) ? son - 2 * 3600_000 : bitis - 14 * GUN;
    return Math.max(bitis - kapsam, bas);
  }
  const baslangic = Number.isFinite(son) ? son - 2 * 3600_000 : Math.min(stokBaslangic - 3600_000, bitis - 2 * GUN);
  if (bitis - baslangic > kapsam && bitis - stokBaslangic > kapsam) {
    throw new PazaryeriApiHatasi(`${KANALLAR[kanal]} aktarım aralığı aşıldı. Eksik dönemi satıcı panelinden karşılaştırın.`);
  }
  return Math.max(bitis - kapsam, baslangic);
}

async function katalogStogu() {
  const magaza = await magazaOku(true);
  const ayrilan = webAyrilanAdetleri(await siparisleriOku(true), Date.now(), magaza.paytrStokIslemleri);
  return {
    surum: magaza.surum,
    satilabilir: new Map(magaza.urunler.map((u) => [u.id, Math.max(0, u.stok - (ayrilan.get(u.id) ?? 0))])),
    urunAdlari: new Map(magaza.urunler.map((u) => [u.id, `${u.marka} ${u.kisaAd}`])),
  };
}

function stokHedefleri(
  kanal: Kanal,
  a: KanalAyari,
  stoklar: ReadonlyMap<string, number>,
  urunAdlari?: ReadonlyMap<string, string>,
): { hedefler: StokKalemi[]; uyarilar: string[] } {
  const kodlar = new Set<string>();
  const hedefler: StokKalemi[] = [];
  const uyarilar: string[] = [];
  for (const [urunId, listeleme] of Object.entries(a.urunler)) {
    const kod = listeleme.kod?.trim();
    const stok = stoklar.get(urunId);
    const ad = urunAdlari?.get(urunId) ?? urunId;
    if (!kod && !listeleme.satista) continue;
    if (!kod || (kanal === 'trendyol' && /[,\s]/.test(kod))) {
      uyarilar.push(`${ad}: geçersiz ilan kodu (${kod || 'boş'})`);
      continue;
    }
    if (kodlar.has(kod)) {
      uyarilar.push(`${ad}: tekrarlı ilan kodu (${kod})`);
      continue;
    }
    if (stok === undefined) {
      uyarilar.push(`${urunId} (${kod}): ürün katalogda bulunamadı`);
      continue;
    }
    kodlar.add(kod);
    hedefler.push({ urunId, kod, stok: listeleme.satista ? Math.min(20_000, kanalHedefStok(stok, a)) : 0 });
  }
  return { hedefler, uyarilar };
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
      // Trendyol 4 saatten eski kuyruk sonuçlarını kaldırır; 6 saattir sonuç okunamıyorsa da ilan adetlerine bakılır.
      const eskiKuyruk = kanal === 'trendyol' && gecenSure > 4 * 3600_000 + 5 * 60_000 && e instanceof PazaryeriApiHatasi && e.status === 404;
      if (!eskiKuyruk && gecenSure < 6 * 3600_000) throw e;
    }
  }
  if (!sonuc) {
    if (gecenSure < 10 * 60_000) throw new PazaryeriApiHatasi('Stok isteği için takip numarası alınamadı. Satıcı panelindeki stokları kontrol edin.');
    // Gönderimin kanala ulaştığı doğrulanamadı (zaman aşımı, 5xx…). Kanalda hedefe ulaşmış ilanlar tamam sayılır; kalanlar
    // bekleme kaydı kapatılıp bir sonraki turda kanalın GÜNCEL adedine göre yeniden planlanır.
    // Eskiden bu durumda kayıt hiç kapanmıyor, o kanala stok gönderimi sonsuza dek duruyordu (denetim AUD-013).
    const ilanlar = await kanalStokOku(kanal, bekleyen.kalemler.map((k) => k.kod), sinyal);
    sonuc = { bekliyor: false, basarili: new Set(bekleyen.kalemler.filter((k) => ilanlar.get(k.kod)?.stok === k.stok).map((k) => k.kod)) };
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
      ? `${bekleyen.kalemler.length - sonuc.basarili.size} ilan için stok güncellemesi doğrulanamadı; bir sonraki eşitlemede güncel adede göre yeniden gönderilecek.`
      : undefined;
  });
  if (sonuc.basarili.size < bekleyen.kalemler.length) {
    throw new PazaryeriApiHatasi(`${bekleyen.kalemler.length - sonuc.basarili.size} ilan için stok güncellemesi doğrulanamadı; bir sonraki eşitlemede güncel adede göre yeniden gönderilecek.`);
  }
  return sonuc.basarili.size;
}

async function stokHazirla(kanal: Kanal, a: KanalAyari, katalog: Awaited<ReturnType<typeof katalogStogu>>, sinyal: AbortSignal) {
  const { hedefler: adayHedefler, uyarilar } = stokHedefleri(kanal, a, katalog.satilabilir, katalog.urunAdlari);
  const ilanlar = adayHedefler.length ? await kanalStokOku(kanal, adayHedefler.map((k) => k.kod), sinyal) : new Map();
  // Kanalda (henüz) onaylı ilanı olmayan bağlantı hata değildir: ilan onay/belge bekliyor olabilir, satılamadığı için
  // stok riski de yoktur. Bunlar bilgi notu olarak yazılır, İş Merkezi'nde kırmızı uyarı üretmez (25.11.2026).
  const notlar: string[] = [];
  for (const b of adayHedefler.filter((k) => !ilanlar.has(k.kod))) {
    const ad = katalog.urunAdlari.get(b.urunId) ?? b.urunId;
    notlar.push(`${ad} (barkod ${b.kod})`);
  }
  const hedefler = adayHedefler.filter((k) => ilanlar.has(k.kod));
  return { katalog, hedefler, ilanlar, uyarilar, notlar };
}

async function stokYayimla(
  kanal: Kanal, a: KanalAyari, hazir: Awaited<ReturnType<typeof stokHazirla>>, artisEngeli: boolean, sinyal: AbortSignal,
) {
  const { katalog, hedefler, ilanlar, uyarilar, notlar } = hazir;
  const uyariMetni = uyarilar.length
    ? `Atlanan eşleşme (${uyarilar.length}): ${uyarilar.slice(0, 3).join('; ')}${uyarilar.length > 3 ? '…' : ''}. Servis Tanılama ekranından düzeltin.`
    : undefined;
  const notMetni = notlar.length
    ? `${KANALLAR[kanal]}’da henüz onaylı ilanı görünmeyen ${notlar.length} bağlı ürün: ${notlar.slice(0, 4).join('; ')}${notlar.length > 4 ? '…' : ''}. İlan onaylanınca stoğu kendiliğinden eşitlenir.`
    : null;
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
    // Kanal adedi hedefin altında kalıyorsa (artış bu turda engelli) bu bir hata değil, bilgi notudur
    const farkNotu = farkVar && !artisAcik ? 'Bazı ilanlarda kanal adedi depodan az; artış bir sonraki uygun eşitlemede gönderilecek.' : null;
    await stokHatasiYaz(kanal, uyariMetni, [notMetni, farkNotu].filter(Boolean).join(' ') || null);
    return 0;
  }
  const [tazeKatalog, tazeAyarlar] = await Promise.all([katalogStogu(), envanterAyarlariOku()]);
  const taze = tazeAyarlar.kanallar[kanal];
  const tazeOnayliHedefler = stokHedefleri(kanal, taze, tazeKatalog.satilabilir).hedefler.filter((k) => ilanlar.has(k.kod));
  if (sinyal.aborted || katalog.surum !== tazeKatalog.surum || !taze.sonApi || Date.now() - Date.parse(taze.sonApi) > TAZELIK
    || JSON.stringify(hedefler) !== JSON.stringify(tazeOnayliHedefler)) {
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
  await stokHatasiYaz(kanal, uyariMetni, notMetni);
  return undefined;
}

export async function pazaryeriSenkron(tetikleyen: 'panel' | 'zamanlayici' | 'bildirim', gunlukZorla = false): Promise<SenkronSonucu> {
  const kanallar: SenkronSonucu['kanallar'] = {};
  for (const k of KANAL_LISTESI) {
    if (pazaryeriApiDurumu(k) === 'eksik') {
      kanallar[k] = { hata: `${KANALLAR[k]} API bağlantı anahtarları eksik veya hatalı biçimde.` };
    }
  }
  const bagli = KANAL_LISTESI.filter((k) => ['canli', 'test'].includes(pazaryeriApiDurumu(k)));
  if (!bagli.length) return { durum: Object.keys(kanallar).length ? 'hata' : 'kapali', kanallar };
  const canliBagli = bagli.filter((k) => pazaryeriApiDurumu(k) === 'canli');
  const sb = supabaseIstemci();
  if (!sb) throw new PazaryeriApiHatasi('Pazaryeri senkronizasyonu için Supabase bağlantısı gerekli.');
  const sahip = randomUUID();
  const kilit = await sb.rpc('pazaryeri_senkron_kilitle', { sahip }).abortSignal(AbortSignal.timeout(8000));
  if (kilit.error) throw new PazaryeriApiHatasi('Senkronizasyon kilidi alınamadı. Supabase senkronizasyon migration kaydını kontrol edin.');
  if (!kilit.data) return { durum: 'bekliyor', kanallar };

  const baslangic0 = Date.now();
  const yeniIdler: string[] = [];
  const donenler: { id: string; eski: string; yeni: string }[] = [];
  try {
    const ilkAyar = await envanterAyarlariOku();
    const bitis = Date.now();
    // Vercel fonksiyonu en fazla 60 sn çalışır (astro.config maxDuration); kilit bırakma ve kayıt için pay bırakılır
    const sinyal = AbortSignal.timeout(45_000);
    await Promise.all(bagli.map(async (kanal) => {
      try {
        const baslangic = cekimBaslangici(kanal, ilkAyar.kanallar[kanal], bitis);
        const gelen = await kanalSiparisAl(kanal, baslangic, bitis, sinyal);
        const sonuc = await pazaryeriAktar(kanal, gelen, 'api', (a) => {
          a.sonApi = new Date(bitis).toISOString();
          a.sonApiHata = undefined;
          if (tetikleyen === 'zamanlayici') a.sonOtomatikApi = a.sonApi;
        });
        kanallar[kanal] = { siparis: sonuc.yeni + sonuc.guncellenen };
        yeniIdler.push(...sonuc.yeniIdler);
        // İptal / iade / teslim edilemedi olan siparişler otomatik işler günlüğüne yazılır (stok zaten aktarımda düzeltildi)
        donenler.push(...sonuc.durumDegisen.filter((d) => ['iptal', 'iade', 'teslim-edilemedi'].includes(d.yeni)));
      } catch (e) {
        const hata = hataMesaji(e);
        kanallar[kanal] = { hata };
        await kanalAyariYaz(kanal, (a) => { a.sonApiHata = hata; }).catch(() => undefined);
      }
    }));

    if (otomatikStokYazmaAcik() && canliBagli.length) {
      const ayar = await envanterAyarlariOku();
      // Yalnız canlı (production) kanallar gerçek depo stoğunu paylaşır; test (SIT) ve kapalı kanallar canlı stoğu kilitlemez.
      const beklenen = beklenenCanliKanallar(ayar);
      const aktarimTamam = (k: Kanal) => kanallar[k]?.siparis !== undefined && !ayar.kanallar[k].sonApiHata;
      const tumKanallarTamam = beklenen.every(aktarimTamam);
      // Bir kanalın siparişleri alınamadıysa ortak stok gerçekte olduğundan yüksek görünebilir: o turda stok ARTIŞI
      // hiçbir kanala gönderilmez, ama aktarımı başarılı kanallara AZALIŞ (aşırı satışı önleyen yön) yine gider.
      // Eskiden tek kanal hatası tüm kanallarda stok düşüşünü de durduruyordu (denetim AUD-013).
      const yazilacak = tumKanallarTamam ? canliBagli : canliBagli.filter(aktarimTamam);
      if (yazilacak.length < canliBagli.length) {
        const mesaj = 'Bu kanalın sipariş aktarımı başarısız olduğu için stoğu gönderilmedi. Diğer kanallara yalnız stok azalışları gönderiliyor.';
        for (const kanal of canliBagli.filter((k) => !yazilacak.includes(k))) {
          kanallar[kanal] = { ...kanallar[kanal], stokHata: mesaj };
          await stokHatasiYaz(kanal, mesaj).catch(() => undefined);
        }
      }
      if (yazilacak.length) {
        const [siparisler, katalog] = await Promise.all([pazaryeriSiparisleriOku(), katalogStogu()]);
        const hazirlar = new Map<Kanal, Awaited<ReturnType<typeof stokHazirla>>>();
        const stokHatasiniKaydet = async (kanal: Kanal, e: unknown) => {
          const stokHata = hataMesaji(e);
          kanallar[kanal] = { ...kanallar[kanal], stokHata };
          await stokHatasiYaz(kanal, stokHata).catch(() => undefined);
        };
        await Promise.all(yazilacak.map(async (kanal) => {
          const a = ayar.kanallar[kanal];
          if (a.bekleyenStok) return;
          try {
            hazirlar.set(kanal, await stokHazirla(kanal, a, katalog, sinyal));
          } catch (e) {
            await stokHatasiniKaydet(kanal, e);
          }
        }));
        const artisEngeli = !tumKanallarTamam || hazirlar.size !== canliBagli.length || [...hazirlar.values()].some((h) => !h.hedefler.length) || siparisler.some((s) =>
          eslesmeyenVar(s) || fazlaSatisVar(s) || (!s.stokDisi && s.kalemler.some((k) => k.durum === 'bilinmiyor')));
        for (const kanal of yazilacak) {
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
    // Otomatik işler (bildirim, fatura iletimi, günlük hakediş…). Süre kalmadıysa bir sonraki çalışmaya kalır.
    let otomasyon: string[] | undefined;
    const kalan = 52_000 - (Date.now() - baslangic0);
    if (kalan > 6000) otomasyon = await otomatikIsler({ yeniIdler, donenler, sureMs: kalan - 2000, gunlukZorla: tetikleyen === 'panel' && gunlukZorla }).catch(() => undefined);
    return { durum: hataVar ? 'hata' : 'tamam', kanallar, otomasyon };
  } finally {
    try {
      const { error } = await sb.rpc('pazaryeri_senkron_kilidi_birak', { sahip }).abortSignal(AbortSignal.timeout(5000));
      if (error) console.error('[pazaryeri] Senkronizasyon kilidi bırakılamadı:', error.code);
    } catch {
      console.error('[pazaryeri] Senkronizasyon kilidi bırakılamadı.');
    }
  }
}

/**
 * Ortak stok artışının güvenle gönderilebilmesi için sipariş aktarımı tam olması beklenen canlı kanallar:
 * - 'canli' olan tüm kanallar
 * - Daha önce canlı başlatılmış (stokBaslangic tanımlı) fakat ortam anahtarı eksik kalan ('eksik') kanallar
 * Bilinçli kapatılmış ('kapali') ve test/SIT ('test') kanalları canlı kanalın stok artışını bloke etmez.
 */
export function beklenenCanliKanallar(
  ayar: Pick<EnvanterAyarlari, 'kanallar'>,
  durumBul: (k: Kanal) => ReturnType<typeof pazaryeriApiDurumu> = pazaryeriApiDurumu,
): Kanal[] {
  return KANAL_LISTESI.filter((k) => {
    const durum = durumBul(k);
    if (durum === 'canli') return true;
    return durum === 'eksik' && Boolean(ayar.kanallar[k].stokBaslangic);
  });
}

/** Panelde manuel stok değişikliği yapıldığında 5 dakikalık cron'u beklemeden canlı kanallara stok eşitlemesini kuyruğa alır. */
export function stokDegisimiKuyrugaAl(sebep = 'manuel stok değişikliği sonrası pazaryeri stoğu'): void {
  if (!otomatikStokYazmaAcik()) return;
  if (!KANAL_LISTESI.some((k) => pazaryeriApiDurumu(k) === 'canli')) return;
  arkaPlanda(pazaryeriSenkron('bildirim'), sebep);
}
