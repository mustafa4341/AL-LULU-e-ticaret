/**
 * Servis ve API Sorun Tespit / Tanılama Motoru.
 *
 * Tüm dış entegrasyonları (Supabase DB & Storage, Zamanlayıcı/pg_cron, Trendyol API, Trendyol Webhook,
 * Hepsiburada API, Google Workspace SMTP, PayTR ve Fatura/Belge iletimi) tek seferde hem yapılandırma
 * hem canlı API bağlantısı düzeyinde denetler; gizli anahtarları asla dışarı sızdırmadan somut sorunları
 * ve tek tıkla uygulanabilecek onarım adımlarını döndürür.
 */
import type { PanelIkonAdi } from '../components/yonetim/panelIkon';
import { epostaBagli } from './altyapi';
import { hataliEpostalariOku, smtpDogrula } from './bildirim';
import { magazaOku, siparisleriOku, supabaseBagliMi, supabaseIstemci } from './depo';
import { faturaHerkeseAcikAdres } from './faturaBaglantisi';
import { faturaAdaylari } from './faturaMerkezi';
import { finansOku } from './finansDepo';
import { paytrAyari, paytrIstendi } from './paytr';
import { eslesmeyenVar, KANALLAR, bosAyarlar } from './pazaryeri';
import {
  BILDIRIM_YOLU, PazaryeriApiHatasi, bildirimAnahtari, hepsiburadaCagir, kanalStokOku, otomatikStokYazmaAcik,
  pazaryeriApiDurumu, pazaryeriOrtam, trendyolTumIlanlar,
} from './pazaryeriApi';
import type { EnvanterAyarlari, Kanal } from './pazaryeri';
import type { Urun } from './sema';

/**
 * Kanal eşleştirmesinin çevrimdışı denetimi (API gerekmez): aynı ilan kodunun iki ürüne bağlanması,
 * silinmiş/taslak ürüne bağlı ilan, kodu boş ama satışta işaretli ürün.
 */
function eslestirmeBulgulari(kanal: Kanal, envanter: EnvanterAyarlari, urunler: Map<string, Urun>): TespitBulgu[] {
  const bulgular: TespitBulgu[] = [];
  const k = envanter.kanallar[kanal];
  const kodSahibi = new Map<string, string[]>();
  for (const [urunId, e] of Object.entries(k.urunler)) {
    if (!e.kod || e.satista === false) continue;
    const anahtar = e.kod.trim().toLocaleUpperCase('en-US');
    kodSahibi.set(anahtar, [...(kodSahibi.get(anahtar) ?? []), urunId]);
    const u = urunler.get(urunId);
    if (u && u.durum !== 'yayinda') {
      bulgular.push({
        siddet: 'bilgi',
        baslik: `${KANALLAR[kanal]} ilanı sitede yayında olmayan ürüne bağlı: ${u.marka} ${u.kisaAd}`,
        detay: `Ürün sitede “${u.durum}”. Kanal stoğu yine depodaki adetle eşitlenir (${e.kod}).`,
      });
    }
  }
  for (const [kod, idler] of kodSahibi) {
    if (idler.length < 2) continue;
    bulgular.push({
      siddet: 'hata',
      baslik: `${KANALLAR[kanal]}: aynı ilan kodu (${kod}) ${idler.length} site ürününe bağlı`,
      detay: `${idler.map((id) => { const u = urunler.get(id); return u ? `${u.marka} ${u.kisaAd}` : id; }).join(', ')}. Stok bu ilana gönderilemez; yanlış bağlantıyı düzeltin.`,
      aksiyon: { ad: 'Eşleştirmeyi Aç', url: `/yonetim/siparisler/kanallar?eslestirme=${kanal}#eslestirme-${kanal}` },
    });
  }
  return bulgular;
}
import { envanterAyarlariOku, pazaryeriSiparisleriOku } from './pazaryeriDepo';
import { tyAdresler, tyWebhooklar } from './trendyolApi';
import { yTarih } from './yonetimRapor';

export type ServisDurum = 'sorunsuz' | 'uyari' | 'hata' | 'kapali';
export type BulguSiddet = 'hata' | 'uyari' | 'bilgi';

export interface TespitAksiyon {
  ad: string;
  url?: string;
  eylem?: string;
  gizli?: Record<string, string>;
}

export interface TespitBulgu {
  siddet: BulguSiddet;
  baslik: string;
  detay: string;
  cozum?: string;
  aksiyon?: TespitAksiyon;
}

export interface ServisParametre {
  ad: string;
  durum: 'tamam' | 'eksik' | 'bilgi';
  deger: string;
}

export interface ServisKarti {
  id: string;
  ad: string;
  ikon: PanelIkonAdi;
  durum: ServisDurum;
  durumEtiketi: string;
  sureMs?: number;
  sonBasari?: string;
  ozet: string;
  parametreler: ServisParametre[];
  bulgular: TespitBulgu[];
}

export interface ServisKontrolRaporu {
  zaman: string;
  canliTest: boolean;
  genelDurum: ServisDurum;
  hataSayisi: number;
  uyariSayisi: number;
  sorunsuzSayisi: number;
  kapaliSayisi: number;
  servisler: ServisKarti[];
  tumBulgular: (TespitBulgu & { servisId: string; servisAd: string })[];
}

const ortamVar = (ad: string) => !!pazaryeriOrtam(ad);
const maskeli = (v?: string) => !v ? 'Tanımlı değil' : v.length <= 6 ? 'Tanımlı' : `${v.slice(0, 3)}…${v.slice(-2)}`;
const tarihYazi = (iso?: string) => {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? yTarih.format(new Date(ms)) : undefined;
};
const dakikaOnce = (iso?: string) => {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.max(0, Math.round((Date.now() - ms) / 60_000)) : undefined;
};

function kartDurumuHesapla(varsayilan: ServisDurum, bulgular: TespitBulgu[]): ServisDurum {
  if (bulgular.some((b) => b.siddet === 'hata')) return 'hata';
  if (bulgular.some((b) => b.siddet === 'uyari')) return 'uyari';
  return varsayilan;
}

const DURUM_ETIKET: Record<ServisDurum, string> = {
  sorunsuz: 'Sorunsuz Çalışıyor',
  uyari: 'Kontrol Gerekiyor',
  hata: 'Sorun Tespit Edildi',
  kapali: 'Yapılandırılmadı',
};

export async function servisKontrolCalistir(secenek: { canliTest?: boolean; siteOrigin?: string } = {}): Promise<ServisKontrolRaporu> {
  const canliTest = secenek.canliTest !== false;
  const origin = (secenek.siteOrigin || import.meta.env.SITE || 'https://alluluhome.com').replace(/\/+$/, '');

  // 1. Temel veri okumaları ve süre ölçümü
  const dbBas = Date.now();
  const [magazaSonuc, envanterSonuc, finansSonuc, webSipSonuc, pySipSonuc] = await Promise.all([
    magazaOku().then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, hata: String((e as Error)?.message ?? e) })),
    envanterAyarlariOku().then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, hata: String((e as Error)?.message ?? e) })),
    finansOku().then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, hata: String((e as Error)?.message ?? e) })),
    siparisleriOku().catch(() => []),
    pazaryeriSiparisleriOku().catch(() => []),
  ]);
  const dbSureMs = Date.now() - dbBas;

  const magaza = magazaSonuc.ok ? magazaSonuc.v : undefined;
  const envanter = envanterSonuc.ok ? envanterSonuc.v : bosAyarlar();
  const finans = finansSonuc.ok ? finansSonuc.v : undefined;
  const urunHaritasi = new Map((magaza?.urunler ?? []).map((u) => [u.id, u]));

  // Paralel canlı servis testleri
  const sb = supabaseIstemci();
  const tyDurum = pazaryeriApiDurumu('trendyol');
  const hbDurum = pazaryeriApiDurumu('hepsiburada');
  const tyHazir = tyDurum === 'canli' || tyDurum === 'test';
  const hbHazir = hbDurum === 'canli' || hbDurum === 'test';

  const [depolamaTest, tyCanli, hbCanli, smtpCanli, hataliEpostalar] = await Promise.all([
    // Supabase Storage testi
    (async () => {
      if (!sb || !canliTest) return { ok: !!sb, hata: undefined as string | undefined };
      try {
        const { error } = await sb.storage.from('medya').list('', { limit: 1 });
        return { ok: !error, hata: error?.message };
      } catch (e) {
        return { ok: false, hata: String((e as Error)?.message ?? e) };
      }
    })(),

    // Trendyol canlı API + ilan + webhook testi
    (async () => {
      if (!tyHazir || !canliTest) return undefined;
      const bas = Date.now();
      const [adresSonuc, ilanSonuc, webhookSonuc] = await Promise.all([
        tyAdresler().then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, hata: e instanceof PazaryeriApiHatasi ? e.message : String(e) })),
        trendyolTumIlanlar(AbortSignal.timeout(12_000)).then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, hata: e instanceof PazaryeriApiHatasi ? e.message : String(e) })),
        tyWebhooklar().then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, hata: e instanceof PazaryeriApiHatasi ? e.message : String(e) })),
      ]);
      return { sureMs: Date.now() - bas, adresSonuc, ilanSonuc, webhookSonuc };
    })(),

    // Hepsiburada canlı API testi
    (async () => {
      if (!hbHazir || !canliTest) return undefined;
      const bas = Date.now();
      try {
        await hepsiburadaCagir('listing', '/listings/merchantid/{M}?limit=1&offset=0', 'Hepsiburada bağlantı testi', AbortSignal.timeout(10_000));
        // Eşleştirilmiş satıcı stok kodları (merchantSku) Hepsiburada'da gerçekten var mı? (stok yalnız bunlara yazılabilir)
        const ayar = await envanterAyarlariOku().catch(() => undefined);
        const kodlar = Object.values(ayar?.kanallar.hepsiburada.urunler ?? {}).filter((e) => e.kod && e.satista !== false).map((e) => e.kod!);
        const ilanlar = kodlar.length ? await kanalStokOku('hepsiburada', kodlar, AbortSignal.timeout(15_000)).catch(() => undefined) : new Map();
        return { ok: true as const, sureMs: Date.now() - bas, ilanlar };
      } catch (e) {
        return { ok: false as const, sureMs: Date.now() - bas, hata: e instanceof PazaryeriApiHatasi ? e.message : String(e) };
      }
    })(),

    // SMTP canlı doğrulama
    canliTest && epostaBagli() ? smtpDogrula() : Promise.resolve(undefined),

    // Hatalı e-posta kayıtları
    hataliEpostalariOku(8).catch(() => []),
  ]);

  const servisler: ServisKarti[] = [];

  /* ============================================================================
   * 1. SUPABASE VERİTABANI VE DEPOLAMA
   * ============================================================================ */
  {
    const bulgular: TespitBulgu[] = [];
    const bagli = supabaseBagliMi();
    const sunucuAnahtariVar = ortamVar('SUPABASE_SUNUCU_ANAHTARI');
    if (!bagli) {
      bulgular.push({
        siddet: 'uyari',
        baslik: 'Bulut veritabanı (Supabase) bu ortamda bağlı değil',
        detay: 'Sistem şu an yerel dosya deposu üzerinde çalışıyor. Canlı ortamda (Vercel) SUPABASE_URL ve SUPABASE_KEY zorunludur.',
        cozum: 'Vercel ortam değişkenlerinde SUPABASE_URL, SUPABASE_KEY ve SUPABASE_SUNUCU_ANAHTARI değerlerinin tanımlı olduğunu doğrulayın.',
      });
    } else {
      if (!sunucuAnahtariVar) {
        bulgular.push({
          siddet: 'hata',
          baslik: 'SUPABASE_SUNUCU_ANAHTARI eksik',
          detay: 'Okuma yapılabilir ancak güvenli yazma politikaları (RLS) nedeniyle sipariş, ürün ve ayar güncellemeleri reddedilir.',
          cozum: 'Vercel ortam değişkenlerine SUPABASE_SUNUCU_ANAHTARI değerini ekleyin.',
        });
      }
      if (!magazaSonuc.ok) {
        bulgular.push({ siddet: 'hata', baslik: 'Mağaza verisi okunamadı', detay: magazaSonuc.hata });
      }
      if (!envanterSonuc.ok) {
        bulgular.push({ siddet: 'hata', baslik: 'Envanter ve kanal ayarları okunamadı', detay: envanterSonuc.hata });
      }
      if (!finansSonuc.ok) {
        bulgular.push({ siddet: 'hata', baslik: 'Finans tabloları okunamadı', detay: finansSonuc.hata });
      }
      if (canliTest && !depolamaTest.ok) {
        bulgular.push({
          siddet: 'hata',
          baslik: 'Supabase Medya Depolama (Storage) erişim hatası',
          detay: depolamaTest.hata ?? 'medya kovasına erişilemedi.',
          cozum: 'Supabase Storage üzerinde “medya” kovasının ve okuma/yazma politikalarının açık olduğunu kontrol edin.',
        });
      }
    }
    const durum = kartDurumuHesapla(bagli ? 'sorunsuz' : 'kapali', bulgular);
    servisler.push({
      id: 'supabase',
      ad: 'Supabase Veritabanı ve Bulut Depo',
      ikon: 'veritabani',
      durum,
      durumEtiketi: DURUM_ETIKET[durum],
      sureMs: dbSureMs,
      ozet: bagli
        ? `Veritabanı yanıt süresi ${dbSureMs} ms · ${magaza?.urunler.length ?? 0} ürün, ${webSipSonuc.length} web siparişi, ${pySipSonuc.length} pazaryeri siparişi okundu.`
        : 'Yerel JSON veri deposu kullanılıyor.',
      parametreler: [
        { ad: 'SUPABASE_URL', durum: ortamVar('SUPABASE_URL') ? 'tamam' : 'eksik', deger: maskeli(pazaryeriOrtam('SUPABASE_URL')) },
        { ad: 'SUPABASE_KEY', durum: ortamVar('SUPABASE_KEY') ? 'tamam' : 'eksik', deger: ortamVar('SUPABASE_KEY') ? 'Tanımlı' : 'Eksik' },
        { ad: 'SUPABASE_SUNUCU_ANAHTARI', durum: sunucuAnahtariVar ? 'tamam' : 'eksik', deger: sunucuAnahtariVar ? 'Tanımlı' : 'Eksik' },
        { ad: 'Medya Storage', durum: !bagli ? 'bilgi' : depolamaTest.ok ? 'tamam' : 'eksik', deger: !bagli ? 'Yerel klasör' : depolamaTest.ok ? 'Erişilebilir' : 'Hata' },
      ],
      bulgular,
    });
  }

  /* ============================================================================
   * 2. OTOMATİK ZAMANLAYICI (PG_CRON) VE ARKA PLAN SENKRON MOTORU
   * ============================================================================ */
  {
    const bulgular: TespitBulgu[] = [];
    const zamanlayiciVar = (pazaryeriOrtam('ZAMANLAYICI_ANAHTARI')?.length ?? 0) >= 32;
    const cronSecretVar = (pazaryeriOrtam('CRON_SECRET')?.length ?? 0) >= 32;
    const stokYaz = otomatikStokYazmaAcik();
    const stokArtir = pazaryeriOrtam('PAZARYERI_STOK_ARTIR') === '1';
    const sonCalismaDk = dakikaOnce(envanter.otomasyon.sonCalisma);

    if (!zamanlayiciVar && !cronSecretVar) {
      bulgular.push({
        siddet: tyHazir || hbHazir ? 'hata' : 'bilgi',
        baslik: 'Zamanlayıcı güvenlik anahtarı tanımlı değil',
        detay: 'ZAMANLAYICI_ANAHTARI veya CRON_SECRET (en az 32 karakter) olmadan 5 dakikalık otomatik eşitleme (/api/pazaryeri-senkron) çalışamaz.',
        cozum: 'Vercel ortam değişkenlerine en az 32 karakterlik ZAMANLAYICI_ANAHTARI ekleyin.',
      });
    }
    if ((tyHazir || hbHazir) && !stokYaz) {
      bulgular.push({
        siddet: 'uyari',
        baslik: 'Otomatik stok gönderimi (PAZARYERI_STOK_YAZ) kapalı',
        detay: 'Siparişler çekilir ancak depodaki stok değişiklikleri pazaryerlerine otomatik yazılmaz.',
        cozum: 'Ortak stoğun pazaryerlerine otomatik yazılması için Vercel’de PAZARYERI_STOK_YAZ=1 ayarlayın.',
      });
    }
    if ((tyHazir || hbHazir) && (sonCalismaDk === undefined || sonCalismaDk > 15)) {
      bulgular.push({
        siddet: sonCalismaDk === undefined || sonCalismaDk > 45 ? 'hata' : 'uyari',
        baslik: sonCalismaDk === undefined ? 'Otomatik zamanlayıcı henüz hiç çalışmadı' : `Otomatik eşitleme ${sonCalismaDk} dakikadır çalışmadı`,
        detay: 'Normal koşullarda Supabase pg_cron her 5 dakikada bir /api/pazaryeri-senkron ucunu tetikler.',
        cozum: 'Aşağıdaki düğmeyle şimdi eşitlemeyi çalıştırıp yanıtı doğrulayın.',
        aksiyon: { ad: 'Şimdi Eşitle ve Test Et', eylem: 'senkron-calistir' },
      });
    }
    const hataliOzetler = (envanter.otomasyon.sonOzet ?? []).filter((s) => /hata|alınamadı|gönderilemedi|kabul etmedi|başarısız/i.test(s)).slice(0, 3);
    for (const h of hataliOzetler) {
      bulgular.push({
        siddet: 'uyari',
        baslik: 'Son otomasyon günlüğünde uyarı kaydı var',
        detay: h,
        aksiyon: { ad: 'Bugünkü İşler Günlüğünü Aç', url: '/yonetim/isler#son-otomatik-islemler' },
      });
    }

    const durum = kartDurumuHesapla(zamanlayiciVar || cronSecretVar ? 'sorunsuz' : 'kapali', bulgular);
    servisler.push({
      id: 'otomasyon',
      ad: 'Otomatik Zamanlayıcı ve Eşitleme Motoru',
      ikon: 'saat',
      durum,
      durumEtiketi: DURUM_ETIKET[durum],
      sonBasari: tarihYazi(envanter.otomasyon.sonCalisma),
      ozet: envanter.otomasyon.sonCalisma
        ? `Son otomatik çalışma: ${tarihYazi(envanter.otomasyon.sonCalisma)} (${sonCalismaDk ?? 0} dk önce) · Son günlük kontrol: ${envanter.otomasyon.sonGunluk ?? 'Henüz yok'}.`
        : 'Henüz kayıtlı otomatik çalışma zamanı yok.',
      parametreler: [
        { ad: 'ZAMANLAYICI_ANAHTARI', durum: zamanlayiciVar ? 'tamam' : 'eksik', deger: zamanlayiciVar ? 'Tanımlı (≥32 krk)' : 'Eksik' },
        { ad: 'CRON_SECRET', durum: cronSecretVar ? 'tamam' : 'bilgi', deger: cronSecretVar ? 'Tanımlı' : 'Tanımlı değil' },
        { ad: 'PAZARYERI_STOK_YAZ', durum: stokYaz ? 'tamam' : 'bilgi', deger: stokYaz ? 'Açık (1)' : 'Kapalı' },
        { ad: 'PAZARYERI_STOK_ARTIR', durum: stokArtir ? 'tamam' : 'bilgi', deger: stokArtir ? 'Açık (1)' : 'Kapalı' },
      ],
      bulgular,
    });
  }

  /* ============================================================================
   * 3. TRENDYOL API (SİPARİŞ, ÜRÜN V2, STOK/FİYAT, HAKEDİŞ)
   * ============================================================================ */
  {
    const bulgular: TespitBulgu[] = [];
    const k = envanter.kanallar.trendyol;
    const saticiId = pazaryeriOrtam('TRENDYOL_SATICI_ID');
    const ortam = pazaryeriOrtam('TRENDYOL_ORTAM');

    if (tyDurum === 'eksik') {
      bulgular.push({
        siddet: 'hata',
        baslik: 'Trendyol API ortam değişkenleri eksik veya hatalı biçimde',
        detay: 'TRENDYOL_SATICI_ID (yalnız rakam), TRENDYOL_API_KEY, TRENDYOL_API_SECRET ve TRENDYOL_ORTAM (canli/stage) eksiksiz olmalıdır.',
        cozum: 'Vercel › Settings › Environment Variables ekranından eksik Trendyol anahtarlarını kontrol edin.',
      });
    }

    if (tyHazir && !k.stokBaslangic) {
      bulgular.push({
        siddet: 'hata',
        baslik: 'Trendyol stok başlangıç tarihi seçilmemiş',
        detay: 'Sayım sonrası stok başlangıç zamanı kaydedilmeden otomatik sipariş ve stok eşitlemesi başlamaz.',
        aksiyon: { ad: 'Satış Kanallarında Ayarla', url: '/yonetim/siparisler/kanallar#trendyol' },
      });
    }

    if (k.sonApiHata) {
      bulgular.push({
        siddet: 'hata',
        baslik: 'Son Trendyol sipariş eşitlemesinde hata kaydedildi',
        detay: k.sonApiHata,
        aksiyon: { ad: 'Hatayı Temizle ve Yeniden Eşitle', eylem: 'senkron-calistir' },
      });
    }

    if (k.bekleyenStok && Date.now() - Date.parse(k.bekleyenStok.tarih) > 15 * 60_000) {
      bulgular.push({
        siddet: 'uyari',
        baslik: 'Trendyol stok gönderim kuyruğu onay bekliyor',
        detay: `${tarihYazi(k.bekleyenStok.tarih)} tarihli stok isteği (${k.bekleyenStok.kalemler.length} kalem) henüz sonuçlanmadı.`,
        aksiyon: { ad: 'Satış Kanallarında Kontrol Et', url: '/yonetim/siparisler/kanallar#trendyol' },
      });
    }

    // Canlı API testi sonuçları ve barkod/ilan doğrulaması
    let onayliIlanSayisi: number | undefined;
    if (tyCanli) {
      if (!tyCanli.adresSonuc.ok) {
        bulgular.push({
          siddet: 'hata',
          baslik: 'Trendyol canlı API bağlantısı başarısız',
          detay: tyCanli.adresSonuc.hata,
          cozum: 'API Key, API Secret ve Satıcı ID (Supplier ID) değerlerinin Trendyol Satıcı Paneli › Hesap Bilgilerim › Entegrasyon Bilgileri ile aynı olduğunu doğrulayın.',
        });
      } else if (!tyCanli.adresSonuc.v.sevkiyat) {
        bulgular.push({
          siddet: 'uyari',
          baslik: 'Trendyol satıcı hesabında varsayılan sevkiyat adresi görünmüyor',
          detay: 'Yeni ürün gönderirken sevkiyat/iade adresi kimliği gerekebilir.',
        });
      }

      if (!tyCanli.ilanSonuc.ok) {
        bulgular.push({
          siddet: 'hata',
          baslik: 'Trendyol onaylı ilan listesi okunamadı',
          detay: tyCanli.ilanSonuc.hata,
        });
      } else {
        const onayliBarkodlar = new Set(tyCanli.ilanSonuc.v.map((x) => x.barkod));
        onayliIlanSayisi = onayliBarkodlar.size;

        // Kilitlenmeye yol açan eşleşmiş ama Trendyol'da olmayan barkodları tek tek yakala!
        for (const [urunId, bag] of Object.entries(k.urunler)) {
          if (!bag.kod) continue;
          const u = urunHaritasi.get(urunId);
          const urunAd = u ? `${u.marka} ${u.kisaAd}` : urunId;
          if (!u) {
            bulgular.push({
              siddet: 'hata',
              baslik: `Silinmiş ürüne ait Trendyol eşleşmesi kalmış (${bag.kod})`,
              detay: `“${urunId}” kimlikli ürün mağaza kataloğunda yok ancak Trendyol eşleşmelerinde kayıtlı.`,
              aksiyon: { ad: 'Hatalı Eşleşmeyi Kaldır', eylem: 'eslesme-kaldir', gizli: { kanal: 'trendyol', urunId } },
            });
          } else if (!onayliBarkodlar.has(bag.kod)) {
            const taslakDurumu = k.ilanlar[urunId]?.durum;
            bulgular.push({
              // Onay/belge bekleyen ilan satılamaz, stok riski yok: kırmızı hata değil uyarı (25.11.2026)
              siddet: 'uyari',
              baslik: `Trendyol’da onaylı ilanı olmayan barkod eşleşmesi: ${urunAd} (Kod: “${bag.kod}”)`,
              detay: taslakDurumu && taslakDurumu !== 'onaylandi'
                ? `Bu ürünün Trendyol ilanı henüz “${taslakDurumu}” aşamasında olduğu için onaylı ilanlarda “${bag.kod}” barkodu bulunamadı. Ürün onaylanana kadar stok eşleşmesinden kaldırılmalı veya gerçek EAN barkoduyla Trendyol’a gönderilmelidir.`
                : `“${bag.kod}” barkodu Trendyol’daki onaylı ilanlarınız arasında bulunamadı (arşivlenmiş, silinmiş veya yanlış barkod yazılmış olabilir).`,
              cozum: 'Hatalı eşleşmeyi kaldırıp ürünü gerçek 13 haneli barkoduyla Trendyol İlan Düzenleyici’den gönderin veya mevcut onaylı ilana bağlayın.',
              aksiyon: { ad: 'Hatalı Eşleşmeyi Kaldır', eylem: 'eslesme-kaldir', gizli: { kanal: 'trendyol', urunId } },
            });
          }
          if (bag.fiyatHata) {
            bulgular.push({
              siddet: 'uyari',
              baslik: `Trendyol fiyat gönderimini reddetti: ${urunAd}`,
              detay: bag.fiyatHata,
              aksiyon: { ad: 'Ürünü İncele', url: `/yonetim/siparisler/trendyol-urunler?urun=${encodeURIComponent(urunId)}#ilan` },
            });
          }
        }
      }
    } else if (k.sonStokHata) {
      bulgular.push({
        siddet: 'uyari',
        baslik: 'Son Trendyol stok eşitleme uyarısı',
        detay: k.sonStokHata,
        aksiyon: { ad: 'Canlı API Testi Çalıştır', url: '/yonetim/servis-kontrol?canli=1#trendyol' },
      });
    }
    if (k.sonStokNot) bulgular.push({ siddet: 'bilgi', baslik: 'Stok eşitleme notu', detay: k.sonStokNot });
    if (k.ciftIlanlar?.length) {
      bulgular.push({
        siddet: 'hata',
        baslik: `Trendyol’da ${k.ciftIlanlar.length} ürün birden fazla ilanla satışta (çift ilan)`,
        detay: k.ciftIlanlar.slice(0, 5).map((c) => { const u = urunHaritasi.get(c.urunId); return `${u ? `${u.marka} ${u.kisaAd}` : c.urunId}: ${c.barkodlar.join(' + ')}`; }).join(' · '),
        cozum: 'Depodaki adet yalnız ana ilana gider; fazla ilan da stoklu kalırsa aynı ürün iki kez satılabilir. Kalacak ilanı seçin, diğerinin stoğu 0 yapılır.',
        aksiyon: { ad: 'Çift İlanları Çöz', url: '/yonetim/siparisler/trendyol-ilanlar#cift' },
      });
    }
    bulgular.push(...eslestirmeBulgulari('trendyol', envanter, urunHaritasi));

    // Reddedilen veya gönderim hatası alan V2 ilan taslakları
    for (const [urunId, ilan] of Object.entries(k.ilanlar)) {
      if (ilan.durum !== 'reddedildi' && ilan.durum !== 'hata') continue;
      const u = urunHaritasi.get(urunId);
      bulgular.push({
        siddet: 'uyari',
        baslik: `Trendyol ürün gönderimi ${ilan.durum === 'reddedildi' ? 'reddedildi' : 'hatalı'}: ${u ? `${u.marka} ${u.kisaAd}` : urunId}`,
        detay: ilan.mesajlar.join(' · ') || 'Trendyol ret/hata detayı için ilan düzenleyiciyi açın.',
        aksiyon: { ad: 'İlan Düzenleyicide Düzelt', url: `/yonetim/siparisler/trendyol-urunler?urun=${encodeURIComponent(urunId)}#ilan` },
      });
    }

    // Eşleşmemiş kalemi olan Trendyol siparişleri
    const eslesmeyenSiparis = pySipSonuc.filter((s) => s.kanal === 'trendyol' && eslesmeyenVar(s));
    if (eslesmeyenSiparis.length) {
      bulgular.push({
        siddet: 'hata',
        baslik: `${eslesmeyenSiparis.length} Trendyol siparişinde mağaza ürünüyle eşleşmeyen kalem var`,
        detay: 'Eşleşmeyen siparişlerin stoğu depodan düşülemez.',
        aksiyon: { ad: 'Siparişleri Eşleştir', url: '/yonetim/siparisler?kanal=trendyol&durum=kontrol' },
      });
    }

    const temelDurum: ServisDurum = tyHazir ? 'sorunsuz' : k.sonApi ? 'uyari' : 'kapali';
    const durum = kartDurumuHesapla(temelDurum, bulgular);
    servisler.push({
      id: 'trendyol',
      ad: 'Trendyol Satıcı API (Sipariş · Ürün V2 · Stok · Finans)',
      ikon: 'zincir',
      durum,
      durumEtiketi: !tyHazir && k.sonApi ? 'Canlıda Aktif (Yerel Anahtar Yok)' : DURUM_ETIKET[durum],
      sureMs: tyCanli?.sureMs,
      sonBasari: tarihYazi(k.sonApi),
      ozet: tyCanli?.adresSonuc.ok
        ? `Canlı API yanıtı ${tyCanli.sureMs} ms · ${onayliIlanSayisi ?? 0} onaylı Trendyol ilanı, ${Object.keys(k.urunler).length} eşleşmiş mağaza ürünü.`
        : tyHazir
          ? `Son başarılı bağlantı: ${tarihYazi(k.sonApi) ?? 'Henüz yok'}.`
          : k.sonApi
            ? `Canlı sunucuda aktif (son bağlantı: ${tarihYazi(k.sonApi)}); bu ortamda TRENDYOL_* anahtarları tanımlı değil.`
            : 'Trendyol API anahtarları henüz tanımlanmamış.',
      parametreler: [
        { ad: 'TRENDYOL_SATICI_ID', durum: saticiId ? 'tamam' : 'eksik', deger: saticiId ?? 'Eksik' },
        { ad: 'TRENDYOL_API_KEY', durum: ortamVar('TRENDYOL_API_KEY') ? 'tamam' : 'eksik', deger: maskeli(pazaryeriOrtam('TRENDYOL_API_KEY')) },
        { ad: 'TRENDYOL_API_SECRET', durum: ortamVar('TRENDYOL_API_SECRET') ? 'tamam' : 'eksik', deger: ortamVar('TRENDYOL_API_SECRET') ? 'Tanımlı' : 'Eksik' },
        { ad: 'TRENDYOL_ORTAM', durum: ortam === 'canli' ? 'tamam' : ortam ? 'bilgi' : 'eksik', deger: ortam ?? 'Eksik' },
      ],
      bulgular,
    });
  }

  /* ============================================================================
   * 4. TRENDYOL ANLIK SİPARİŞ BİLDİRİMİ (WEBHOOK)
   * ============================================================================ */
  {
    const bulgular: TespitBulgu[] = [];
    const k = envanter.kanallar.trendyol;
    const anahtar = bildirimAnahtari('trendyol');
    const hedefUrl = `${origin}${BILDIRIM_YOLU.trendyol}`;
    const webhookListesi = tyCanli?.webhookSonuc.ok ? tyCanli.webhookSonuc.v : undefined;
    const kayitliWebhook = webhookListesi?.find((w) => w.url.replace(/\/$/, '') === hedefUrl.replace(/\/$/, ''));

    if (tyHazir) {
      if (!anahtar) {
        bulgular.push({
          siddet: 'uyari',
          baslik: 'Webhook doğrulama anahtarı üretilemedi',
          detay: 'ZAMANLAYICI_ANAHTARI veya CRON_SECRET tanımlı olmadığı için anlık sipariş bildirimi kurulamaz.',
        });
      } else if (tyCanli?.webhookSonuc && !tyCanli.webhookSonuc.ok) {
        bulgular.push({
          siddet: 'uyari',
          baslik: 'Trendyol webhook abonelikleri sorgulanamadı',
          detay: tyCanli.webhookSonuc.hata,
        });
      } else if (webhookListesi && !kayitliWebhook) {
        bulgular.push({
          siddet: 'uyari',
          baslik: 'Trendyol anlık sipariş bildirimi (Webhook) henüz kurulmamış',
          detay: 'Şu an siparişler yalnız 5 dakikalık zamanlayıcıyla çekiliyor. Webhook açıldığında yeni siparişler saniyeler içinde panele düşer.',
          cozum: 'Aşağıdaki düğmeye basarak Trendyol webhook aboneliğini otomatik oluşturun.',
          aksiyon: { ad: 'Anlık Bildirimi (Webhook) Şimdi Aç', eylem: 'webhook-onar' },
        });
      } else if (kayitliWebhook && kayitliWebhook.durum !== 'ACTIVE') {
        bulgular.push({
          siddet: 'hata',
          baslik: `Trendyol webhook aboneliği pasife düşmüş (${kayitliWebhook.durum})`,
          detay: 'Sunucu kesintisi sonrasında Trendyol aboneliği pasife almış olabilir.',
          cozum: 'Tek tıkla aboneliği yeniden aktifleştirin.',
          aksiyon: { ad: 'Webhook Aboneliğini Yeniden Aktifleştir', eylem: 'webhook-onar' },
        });
      }
    }

    const temelDurum: ServisDurum = !tyHazir ? 'kapali' : kayitliWebhook?.durum === 'ACTIVE' ? 'sorunsuz' : k.bildirim.id ? 'sorunsuz' : 'uyari';
    const durum = kartDurumuHesapla(temelDurum, bulgular);
    servisler.push({
      id: 'trendyol-webhook',
      ad: 'Trendyol Anlık Sipariş Bildirimi (Webhook)',
      ikon: 'simsek',
      durum,
      durumEtiketi: DURUM_ETIKET[durum],
      sonBasari: tarihYazi(k.bildirim.son ?? k.bildirim.kurulum),
      ozet: kayitliWebhook
        ? `Durum: ${kayitliWebhook.durum === 'ACTIVE' ? 'Aktif (ACTIVE)' : kayitliWebhook.durum} · Alınan anlık bildirim: ${k.bildirim.sayi ?? 0} adet.`
        : tyHazir
          ? 'Henüz aktif webhook kaydı yok (5 dakikalık zamanlayıcı yedek olarak çalışıyor).'
          : 'Trendyol API bağlantısı aktif olduğunda kurulabilir.',
      parametreler: [
        { ad: 'Bildirim Adresi', durum: 'bilgi', deger: BILDIRIM_YOLU.trendyol },
        { ad: 'HMAC Anahtarı', durum: anahtar ? 'tamam' : 'eksik', deger: anahtar ? 'Hazır' : 'Eksik' },
        { ad: 'Abonelik Durumu', durum: kayitliWebhook?.durum === 'ACTIVE' ? 'tamam' : 'bilgi', deger: kayitliWebhook?.durum ?? (k.bildirim.id ? 'Kayıtlı' : 'Kurulmadı') },
        { ad: 'Alınan Olay', durum: 'bilgi', deger: `${k.bildirim.sayi ?? 0} bildirim` },
      ],
      bulgular,
    });
  }

  /* ============================================================================
   * 5. HEPSİBURADA API (OMS SİPARİŞ/PAKET, LISTING STOK/FİYAT, FİNANS)
   * ============================================================================ */
  {
    const bulgular: TespitBulgu[] = [];
    const k = envanter.kanallar.hepsiburada;
    const hbId = pazaryeriOrtam('HEPSIBURADA_MERCHANT_ID');
    const hbKul = pazaryeriOrtam('HEPSIBURADA_KULLANICI');
    const hbPar = pazaryeriOrtam('HEPSIBURADA_PAROLA');
    const hbUa = pazaryeriOrtam('HEPSIBURADA_USER_AGENT');
    const hbOrtam = pazaryeriOrtam('HEPSIBURADA_ORTAM');
    const uuidGecerli = !!hbId && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(hbId);

    if (hbDurum === 'eksik') {
      const eksikler: string[] = [];
      if (!hbId) eksikler.push('HEPSIBURADA_MERCHANT_ID eksik');
      else if (!uuidGecerli) eksikler.push('HEPSIBURADA_MERCHANT_ID geçerli UUID biçiminde değil (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)');
      if (!hbKul) eksikler.push('HEPSIBURADA_KULLANICI eksik');
      if (!hbPar) eksikler.push('HEPSIBURADA_PAROLA eksik');
      if (!hbUa) eksikler.push('HEPSIBURADA_USER_AGENT eksik (entegratör kullanıcı adı)');
      if (hbOrtam && !['test', 'canli'].includes(hbOrtam)) eksikler.push('HEPSIBURADA_ORTAM “canli” veya “test” olmalı');
      bulgular.push({
        siddet: 'hata',
        baslik: 'Hepsiburada API anahtarları yarım veya hatalı biçimde girilmiş',
        detay: eksikler.join(' · '),
        cozum: 'Vercel ortam değişkenlerinde eksik/hatalı Hepsiburada alanlarını düzeltip yeniden dağıtın.',
      });
    }

    if (hbDurum === 'canli' && !k.stokBaslangic) {
      bulgular.push({
        siddet: 'hata',
        baslik: 'Hepsiburada stok başlangıç tarihi seçilmemiş',
        detay: 'Sipariş ve stok eşitlemesinin başlaması için stok başlangıç zamanı girilmelidir.',
        aksiyon: { ad: 'Satış Kanallarında Ayarla', url: '/yonetim/siparisler/kanallar#hepsiburada' },
      });
    }

    if (k.sonApiHata) {
      bulgular.push({
        siddet: 'hata',
        baslik: 'Son Hepsiburada sipariş eşitlemesinde hata oluştu',
        detay: k.sonApiHata,
        aksiyon: { ad: 'Yeniden Eşitle', eylem: 'senkron-calistir' },
      });
    }

    if (hbCanli && !hbCanli.ok) {
      bulgular.push({
        siddet: 'hata',
        baslik: 'Hepsiburada canlı Listing API bağlantısı başarısız',
        detay: hbCanli.hata,
        cozum: 'Merchant ID, entegratör kullanıcı adı/şifresi ve User-Agent bilgisini Hepsiburada Satıcı Paneli › Entegrasyon bölümünden doğrulayın.',
      });
    }

    bulgular.push(...eslestirmeBulgulari('hepsiburada', envanter, urunHaritasi));
    if (hbDurum === 'test') {
      bulgular.push({
        siddet: 'bilgi',
        baslik: 'Hepsiburada TEST (SIT) ortamına bağlı — canlı mağazanıza dokunulmuyor',
        detay: 'Bu bağlantı Hepsiburada’nın entegrasyon test hesabıdır. Canlı Hepsiburada mağazanızın stok ve fiyatı bu siteden değiştirilmez; oradaki stok değişiklikleri bu siteden kaynaklanmaz. Canlı bilgiler gelince HEPSIBURADA_ORTAM=canli yapılır.',
      });
    }
    if (hbCanli?.ok && hbCanli.ilanlar) {
      const ilanlar = hbCanli.ilanlar;
      const bulunamayan = Object.entries(k.urunler).filter(([, e]) => e.kod && e.satista !== false && !ilanlar.has(e.kod));
      if (bulunamayan.length) {
        bulgular.push({
          siddet: hbDurum === 'canli' ? 'hata' : 'bilgi',
          baslik: `${bulunamayan.length} eşleşmiş ürünün satıcı stok kodu Hepsiburada${hbDurum === 'test' ? ' test hesabında' : ''} bulunamadı`,
          detay: bulunamayan.slice(0, 6).map(([id, e]) => { const u = urunHaritasi.get(id); return `${u ? `${u.marka} ${u.kisaAd}` : id} (${e.kod})`; }).join(' · ')
            + '. Hepsiburada stoğu yalnız satıcı stok koduyla (merchantSku) eşleşen ilana yazılır.',
          cozum: 'Hepsiburada satıcı panelinde ilanın “Satıcı stok kodu” alanını sitedeki eşleştirme koduyla aynı yapın ya da Satış kanalları › Ürün eşleştirme’de kodu Hepsiburada’daki stok koduyla değiştirin.',
          aksiyon: { ad: 'Eşleştirmeyi Aç', url: '/yonetim/siparisler/kanallar?eslestirme=hepsiburada#eslestirme-hepsiburada' },
        });
      }
    }

    for (const [urunId, bag] of Object.entries(k.urunler)) {
      if (!bag.fiyatHata) continue;
      const u = urunHaritasi.get(urunId);
      bulgular.push({
        siddet: 'uyari',
        baslik: `Hepsiburada fiyat kilidi / ret uyarısı: ${u ? `${u.marka} ${u.kisaAd}` : urunId}`,
        detay: bag.fiyatHata,
        aksiyon: { ad: 'Eşleştirmede İncele', url: `/yonetim/siparisler/kanallar?eslestirme=hepsiburada#eslestirme-hepsiburada` },
      });
    }

    const faturaImzaHazir = !!faturaHerkeseAcikAdres('https://alluluhome.com', '00000000-0000-4000-8000-000000000000');
    const temelDurum: ServisDurum = hbHazir ? 'sorunsuz' : 'kapali';
    const durum = kartDurumuHesapla(temelDurum, bulgular);
    servisler.push({
      id: 'hepsiburada',
      ad: 'Hepsiburada Satıcı API (OMS · Listing · Finans)',
      ikon: 'zincir',
      durum,
      durumEtiketi: hbDurum === 'test' && durum === 'sorunsuz' ? 'Test Ortamı (SIT) Bağlı' : DURUM_ETIKET[durum],
      sureMs: hbCanli?.sureMs,
      sonBasari: tarihYazi(k.sonApi),
      ozet: hbCanli?.ok
        ? `Canlı API yanıtı ${hbCanli.sureMs} ms · ${Object.keys(k.urunler).length} eşleşmiş ürün.`
        : hbDurum === 'kapali'
          ? 'Hepsiburada API anahtarları henüz tanımlanmamış (sipariş/hakediş altyapısı ve OMS paketleme modülü hazır).'
          : `Durum: ${hbDurum}.`,
      parametreler: [
        { ad: 'HEPSIBURADA_MERCHANT_ID', durum: uuidGecerli ? 'tamam' : hbId ? 'eksik' : 'bilgi', deger: hbId ? maskeli(hbId) : 'Tanımlı değil' },
        { ad: 'HEPSIBURADA_KULLANICI', durum: hbKul ? 'tamam' : 'bilgi', deger: hbKul ? maskeli(hbKul) : 'Tanımlı değil' },
        { ad: 'HEPSIBURADA_USER_AGENT', durum: hbUa ? 'tamam' : 'bilgi', deger: hbUa ?? 'Tanımlı değil' },
        { ad: 'İmzalı Fatura Bağlantısı', durum: faturaImzaHazir ? 'tamam' : 'eksik', deger: faturaImzaHazir ? 'Hazır (/fatura/{id})' : 'Anahtar eksik' },
      ],
      bulgular,
    });
  }

  /* ============================================================================
   * 6. E-POSTA BİLDİRİM SERVİSİ (SMTP / GOOGLE WORKSPACE)
   * ============================================================================ */
  {
    const bulgular: TespitBulgu[] = [];
    const hazir = epostaBagli();
    const host = pazaryeriOrtam('SMTP_HOST');
    const kullanici = pazaryeriOrtam('SMTP_KULLANICI');
    const bildirimAlici = pazaryeriOrtam('SIPARIS_BILDIRIM_EPOSTA') || magaza?.site.eposta || '';

    if (!hazir) {
      bulgular.push({
        siddet: 'uyari',
        baslik: 'Otomatik e-posta gönderimi (SMTP) bu ortamda kapalı',
        detay: 'SMTP_HOST ve SMTP_PAROLA tanımlı olmadığında sipariş onayı, kargo takip ve web müşterisi e-Arşiv fatura e-postaları gönderilmez.',
        cozum: 'Google Workspace hesabınız için 16 haneli Uygulama Şifresi oluşturup Vercel’de SMTP_HOST, SMTP_KULLANICI ve SMTP_PAROLA değişkenlerini tanımlayın.',
      });
    } else if (smtpCanli && !smtpCanli.ok) {
      bulgular.push({
        siddet: 'hata',
        baslik: 'SMTP sunucu bağlantısı veya şifre doğrulaması başarısız oldu',
        detay: smtpCanli.hata ?? 'SMTP doğrulaması reddedildi.',
        cozum: 'Google hesabında 2 Adımlı Doğrulama’nın açık ve SMTP_PAROLA değerinin geçerli bir Google Uygulama Şifresi olduğunu kontrol edin.',
      });
    }

    for (const h of hataliEpostalar.slice(0, 4)) {
      bulgular.push({
        siddet: 'hata',
        baslik: `Gönderilemeyen e-posta: ${h.ad} (${h.siparisNo})`,
        detay: `${h.alici} adresine gönderim ${h.deneme}. denemede başarısız oldu${h.sonHata ? ': ' + h.sonHata : '.'}`,
        aksiyon: h.siparisNo.startsWith('AL')
          ? { ad: 'Siparişi Aç ve Yeniden Gönder', url: `/yonetim/siparisler/${encodeURIComponent(h.siparisNo)}` }
          : undefined,
      });
    }

    const durum = kartDurumuHesapla(hazir ? 'sorunsuz' : 'kapali', bulgular);
    servisler.push({
      id: 'smtp',
      ad: 'E-posta Bildirim Servisi (SMTP)',
      ikon: 'eposta',
      durum,
      durumEtiketi: DURUM_ETIKET[durum],
      sureMs: smtpCanli?.sureMs,
      ozet: smtpCanli?.ok
        ? `SMTP oturum doğrulaması başarılı (${smtpCanli.sureMs} ms) · Bildirim alıcısı: ${bildirimAlici}.`
        : hazir
          ? `Yapılandırıldı (${host}) · Bildirim alıcısı: ${bildirimAlici}.`
          : 'Bu ortamda SMTP şifresi tanımlı değil.',
      parametreler: [
        { ad: 'SMTP_HOST / PORT', durum: host ? 'tamam' : 'eksik', deger: host ? `${host}:${pazaryeriOrtam('SMTP_PORT') ?? '465'}` : 'Eksik' },
        { ad: 'SMTP_KULLANICI', durum: kullanici ? 'tamam' : 'eksik', deger: kullanici ?? 'Eksik' },
        { ad: 'SMTP_PAROLA', durum: ortamVar('SMTP_PAROLA') ? 'tamam' : 'eksik', deger: ortamVar('SMTP_PAROLA') ? 'Tanımlı' : 'Eksik' },
        { ad: 'SIPARIS_BILDIRIM_EPOSTA', durum: bildirimAlici ? 'tamam' : 'bilgi', deger: bildirimAlici || 'Eksik' },
      ],
      bulgular,
    });
  }

  /* ============================================================================
   * 7. KARTLI ÖDEME (PAYTR), FATURA İLETİMİ VE GÜVENLİK
   * ============================================================================ */
  {
    const bulgular: TespitBulgu[] = [];
    const paytr = paytrAyari();
    const istendi = paytrIstendi();

    if (istendi && !paytr) {
      bulgular.push({
        siddet: 'hata',
        baslik: 'PayTR kartlı ödeme açılmış (PAYTR_MOD) ancak anahtar veya URL bilgileri geçersiz',
        detay: 'PAYTR_MERCHANT_ID (rakam), PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT ve PAYTR_SITE_URL (https://alluluhome.com biçiminde kök adres) eksiksiz olmalıdır.',
        cozum: 'Vercel ortam değişkenlerinde PayTR bilgilerini düzeltin veya yalnızca Havale/EFT için PAYTR_MOD değişkenini kaldırın.',
      });
    } else if (paytr?.test) {
      bulgular.push({
        siddet: 'uyari',
        baslik: 'PayTR şu an TEST modunda çalışıyor',
        detay: 'Gerçek müşteri kartlarından tahsilat yapılmaz. Canlı satışa geçerken PAYTR_MOD=canli olarak güncelleyin.',
      });
    }

    const stokEksikWeb = webSipSonuc.filter((s) => s.paytr?.stokEksik && s.durum !== 'iptal');
    if (stokEksikWeb.length) {
      bulgular.push({
        siddet: 'hata',
        baslik: `${stokEksikWeb.length} web siparişinde ödeme alındı ancak stok ayrılamadı`,
        detay: `Sipariş: ${stokEksikWeb.map((s) => s.no).join(', ')}`,
        aksiyon: { ad: 'Siparişleri Kontrol Et', url: '/yonetim/siparisler?durum=odendi' },
      });
    }

    if (finans) {
      const adaylar = faturaAdaylari(finans, webSipSonuc, pySipSonuc, envanter);
      const hataliFaturalar = adaylar.filter((x) => x.fatura && !x.fatura.iptal && x.fatura.iletim.durum === 'hata');
      if (hataliFaturalar.length) {
        bulgular.push({
          siddet: 'hata',
          baslik: `${hataliFaturalar.length} faturanın müşteriye/kanala iletimi hata verdi`,
          detay: hataliFaturalar.slice(0, 3).map((x) => `${x.siparisNo} (${KANALLAR[x.kanal as 'trendyol' | 'hepsiburada'] ?? 'Web'}): ${x.fatura?.iletim.mesaj ?? 'İletim hatası'}`).join(' · '),
          aksiyon: { ad: 'Faturaları Aç ve Yeniden Gönder', url: '/yonetim/finans/faturalar?durum=iletilecek' },
        });
      }
      const hataliBelgeler = finans.belgeler.filter((b) => b.durum === 'hata');
      if (hataliBelgeler.length) {
        bulgular.push({
          siddet: 'uyari',
          baslik: `${hataliBelgeler.length} sipariş belgesinde hata kaydı var`,
          detay: hataliBelgeler.slice(0, 3).map((b) => `${b.belgeNo} (${b.siparisNo})`).join(', '),
          aksiyon: { ad: 'Belgeleri İncele', url: '/yonetim/finans?sekme=belgeler' },
        });
      }
    }

    const oturumGizli = (pazaryeriOrtam('OTURUM_GIZLI')?.length ?? 0) >= 16;
    const parolaVar = ortamVar('YONETIM_PAROLA');
    if (!oturumGizli || !parolaVar) {
      bulgular.push({
        siddet: 'uyari',
        baslik: 'Yönetim oturum anahtarı veya yönetici parolası bu ortamda eksik',
        detay: 'Canlı sunucuda YONETIM_PAROLA ve OTURUM_GIZLI zorunludur.',
      });
    }

    const durum = kartDurumuHesapla('sorunsuz', bulgular);
    servisler.push({
      id: 'odeme-fatura-guvenlik',
      ad: 'Ödeme (PayTR), Fatura İletimi ve Güvenlik',
      ikon: 'kalkan',
      durum,
      durumEtiketi: DURUM_ETIKET[durum],
      ozet: paytr
        ? `PayTR ${paytr.test ? 'Test Modu' : 'Canlı Kartlı Ödeme'} + Havale/EFT aktif · Oturum ve belge altyapısı denetlendi.`
        : 'Havale/EFT ödeme modu aktif (PayTR kartlı ödeme kapalı) · Fatura ve güvenlik kontrolleri tamamlandı.',
      parametreler: [
        { ad: 'Kartlı Ödeme (PayTR)', durum: paytr ? 'tamam' : istendi ? 'eksik' : 'bilgi', deger: paytr ? (paytr.test ? 'Test Modu' : 'Canlı Aktif') : istendi ? 'Hatalı Ayar' : 'Kapalı (Havale/EFT)' },
        { ad: 'YONETIM_PAROLA', durum: parolaVar ? 'tamam' : 'eksik', deger: parolaVar ? 'Tanımlı' : 'Eksik' },
        { ad: 'OTURUM_GIZLI', durum: oturumGizli ? 'tamam' : 'eksik', deger: oturumGizli ? 'Tanımlı' : 'Eksik' },
        { ad: 'Gizli Giriş Yolu', durum: ortamVar('YONETIM_GIRIS_YOLU') ? 'tamam' : 'bilgi', deger: ortamVar('YONETIM_GIRIS_YOLU') ? 'Özel adres aktif' : 'Varsayılan' },
      ],
      bulgular,
    });
  }

  const tumBulgular = servisler.flatMap((s) => s.bulgular.map((b) => ({ ...b, servisId: s.id, servisAd: s.ad })));
  const sira: Record<BulguSiddet, number> = { hata: 0, uyari: 1, bilgi: 2 };
  tumBulgular.sort((a, b) => sira[a.siddet] - sira[b.siddet]);

  const hataSayisi = tumBulgular.filter((b) => b.siddet === 'hata').length;
  const uyariSayisi = tumBulgular.filter((b) => b.siddet === 'uyari').length;
  const sorunsuzSayisi = servisler.filter((s) => s.durum === 'sorunsuz').length;
  const kapaliSayisi = servisler.filter((s) => s.durum === 'kapali').length;
  const genelDurum: ServisDurum = hataSayisi > 0 ? 'hata' : uyariSayisi > 0 ? 'uyari' : 'sorunsuz';

  return {
    zaman: new Date().toISOString(),
    canliTest,
    genelDurum,
    hataSayisi,
    uyariSayisi,
    sorunsuzSayisi,
    kapaliSayisi,
    servisler,
    tumBulgular,
  };
}
