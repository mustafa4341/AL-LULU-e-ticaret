/**
 * Birleşik Sipariş Merkezi — Web, Trendyol ve Hepsiburada siparişlerini
 * veritabanı şemasını veya ham kanal durumlarını bozmadan tek bir operasyonel
 * görünüm modelinde (lojistik aşama + 9 bağımsız iş boyutu + tek birincil işlem + kâr/hakediş) birleştirir.
 */
import { belgeGecerli, hakEdis, hbIsaretli, type Belge, type FaturaKaydi, type Finans } from './finans';
import { faturaAdaylari, kdvBulucu, type FaturaAdayi, type FaturaKanali } from './faturaMerkezi';
import { hbKategori, kargoUcreti, kategoriOnerisi, satisHesabi } from './hepsiburadaTarife';
import { KARGO_SABLONLARI, siparisKargoBaglantisi, takipBaglantisi } from './kargoTakip';
import {
  KANALLAR,
  PY_DURUM_ADLARI,
  SATIS_DURUMLARI,
  STOK_AKTIF,
  eslesmeyenVar,
  fazlaSatisVar,
  kalemIadeBekliyor,
  satisMi,
  satisTutari,
  type EnvanterAyarlari,
  type Kanal,
  type PazaryeriSiparisi,
} from './pazaryeri';
import { pazaryeriApiDurumu } from './pazaryeriApi';
import { SIPARIS_DURUM_ADLARI, type Magaza, type Siparis } from './sema';
import { iadeEdildi } from './siparisAkisi';
import { odemeEtiketi, onayliSatis } from './yonetimRapor';

export type RozetRenk = 'yesil' | 'turuncu' | 'kirmizi' | 'altin' | 'gri';
export type SiparisKanali = FaturaKanali;

/** Ortak lojistik/teslimat aşaması (fatura eksikliği lojistik aşamayı asla geriye çekmez). */
export type SiparisAsamasi =
  | 'yeni'
  | 'hazirlanacak'
  | 'hazirlaniyor'
  | 'kargoya-hazir'
  | 'kargoda'
  | 'tamamlandi'
  | 'iptal-iade';

export const ASAMA_ADLARI: Record<SiparisAsamasi, string> = {
  yeni: 'Ödeme / Onay Bekliyor',
  hazirlanacak: 'Hazırlanacak',
  hazirlaniyor: 'Hazırlanıyor',
  'kargoya-hazir': 'Kargoya Hazır',
  kargoda: 'Kargoda',
  tamamlandi: 'Tamamlandı',
  'iptal-iade': 'İptal / İade',
};

export const ASAMA_RENKLERI: Record<SiparisAsamasi, RozetRenk> = {
  yeni: 'gri',
  hazirlanacak: 'turuncu',
  hazirlaniyor: 'altin',
  'kargoya-hazir': 'altin',
  kargoda: 'yesil',
  tamamlandi: 'yesil',
  'iptal-iade': 'gri',
};

/** Siparişler sayfasındaki 6 ana sekme + ikincil durum filtreleri */
export type SiparisSekmesi =
  | 'islem'
  | 'hazirlanacak'
  | 'hazirlaniyor'
  | 'kargoya-hazir'
  | 'kargoda'
  | 'tamamlandi'
  | 'kontrol'
  | 'odeme-bekleyen'
  | 'faturasiz'
  | 'iptal'
  | 'tumu';

/** Eski adres parametrelerini (`?durum=odendi|belgesiz|...`) bozmadan yeni sekmelere eşler */
export function siparisSekmesiCoz(ham: string | null | undefined): SiparisSekmesi {
  switch ((ham ?? '').trim()) {
    case '':
    case 'islem':
      return 'islem';
    case 'odendi':
    case 'hazirlanacak':
      return 'hazirlanacak';
    case 'hazirlaniyor':
      return 'hazirlaniyor';
    case 'kargoya-hazir':
      return 'kargoya-hazir';
    case 'kargoda':
      return 'kargoda';
    case 'teslim-edildi':
    case 'tamamlandi':
      return 'tamamlandi';
    case 'kontrol':
      return 'kontrol';
    case 'odeme-bekliyor':
    case 'odeme-bekleyen':
      return 'odeme-bekleyen';
    case 'belgesiz':
    case 'faturasiz':
      return 'faturasiz';
    case 'iptal':
      return 'iptal';
    case 'tumu':
      return 'tumu';
    default:
      return 'islem';
  }
}

export type FaturaBoyutu = {
  /** 3 aşamalı fatura modeli: 1. Kesilecek -> 2. Kaydedildi -> 3. İletildi */
  asama: 'gerekmez' | 'kesilecek' | 'kaydedildi' | 'iletildi';
  adimNo: 0 | 1 | 2 | 3;
  etiket: string;
  kisaEtiket: string;
  renk: RozetRenk;
  kayit?: FaturaKaydi;
  aday?: FaturaAdayi;
  dosyaEksik: boolean;
  hataMesaji?: string;
};

export type BirincilIslem = {
  kod:
    | 'urun-eslestir'
    | 'stok-coz'
    | 'iade-kontrol'
    | 'kanal-kontrol'
    | 'odeme-onayla'
    | 'paytr-kontrol'
    | 'web-hazirla'
    | 'web-kargola'
    | 'web-teslim'
    | 'ty-toplama'
    | 'hb-paketle'
    | 'etiket-ve-fatura'
    | 'etiket-yazdir'
    | 'fatura-kes'
    | 'fatura-ilet'
    | 'incele'
    | 'tamam';
  etiket: string;
  aciklama: string;
  tur: 'birincil' | 'uyari' | 'ikincil' | 'bilgi';
  sekme: 'islemler' | 'kazanc' | 'gecmis';
  odak?: 'eslestir' | 'stok' | 'iade' | 'durum' | 'kanal' | 'fatura';
};

export type SiparisKazancOzeti = {
  /** Müşterinin gerçekte ödediği sipariş tutarı (kuruş, KDV dahil) */
  musteriOdedigi: number;
  /** Satıcı indirimi / kupon / set indirimi (kuruş) */
  indirim: number;
  /** Pazaryeri komisyonu (kuruş, KDV dahil kesinti görünümü) */
  komisyon?: number;
  /** Kargo kesintisi veya tahmini kargo maliyeti (kuruş) */
  kargoKesintisi?: number;
  /** Hizmet / işlem kesintisi (kuruş) */
  hizmetKesintisi?: number;
  /** %1 e-ticaret stopajı (kuruş) */
  stopaj?: number;
  /** KDV hariç kayıtlı alış maliyeti toplamı (yalnız tüm kalemlerin maliyeti tam ise dolu) */
  urunMaliyeti?: number;
  maliyetEksik: boolean;
  eksikNeden?: string;
  /** KDV hariç tahmini/kesinleşen net kâr (maliyet veya kargo bilinmiyorsa undefined — sahte kâr üretilmez) */
  tahminiNetKar?: number;
  netMarj?: number;
  /** Satıcıya yatması beklenen tutar (kuruş) */
  beklenenHakedis?: number;
  /** Ekstre / muhasebe servisinde kesinleşen tutar (kuruş) */
  kesinlesenHakedis?: number;
  /** Bankaya yatan − beklenen hakediş farkı (kuruş) */
  mutabakatFarki?: number;
  kaynak: 'kesinlesen-ekstre' | 'tahmini-tarife' | 'web-hesabi' | 'iptal-iade' | 'test';
  not?: string;
};

export type SiparisKalemGorunumu = {
  anahtar: string;
  ad: string;
  adet: number;
  birimKurus: number;
  toplamKurus: number;
  gorsel?: string;
  sku?: string;
  barkod?: string;
  urunId?: string;
  eslesmeyen: boolean;
  eksikStok: number;
  iadeBekliyor: boolean;
  durumAdi?: string;
};

export type SiparisAdimNoktasi = {
  kod: string;
  ad: string;
  durum: 'tamam' | 'aktif' | 'bekliyor';
  alt?: string;
};

export type SiparisMerkeziKaydi = {
  /** Benzersiz seçim anahtarı: `web:AL...` veya `trendyol-PKG...` / `hepsiburada-...` */
  anahtar: string;
  kanal: SiparisKanali;
  kanalAdi: string;
  no: string;
  paketNo?: string;
  tarih: string;
  zamanMs: number;
  musteriAdi: string;
  telefon?: string;
  eposta?: string;
  konum?: string;
  adres?: string;
  kalemOzeti: string;
  ilkGorsel?: string;
  toplamAdet: number;
  /** Kuruş cinsinden sipariş toplamı */
  tutarKurus: number;
  detayHref: string;
  paketleHref?: string;

  asama: SiparisAsamasi;
  asamaEtiketi: string;
  asamaRenk: RozetRenk;
  hamDurumAdi: string;
  adimlar: SiparisAdimNoktasi[];

  odeme: { durum: 'onayli' | 'bekliyor' | 'gecikti' | 'basarisiz' | 'test' | 'iptal'; etiket: string; renk: RozetRenk };
  stok: {
    durum: 'ayrildi' | 'eksik' | 'eslesmeyen' | 'test-izole' | 'iade-bekliyor' | 'iade-eklendi' | 'iade-satilamaz' | 'bekliyor';
    etiket: string;
    renk: RozetRenk;
    eksikAdet: number;
    eslesmeyenAdet: number;
  };
  fatura: FaturaBoyutu;
  kargo: {
    durum: 'bekliyor' | 'hazirlanacak' | 'etiket-hazir' | 'kargoda' | 'teslim' | 'gecikti' | 'iptal';
    etiket: string;
    renk: RozetRenk;
    firma?: string;
    takipNo?: string;
    takipUrl?: string;
    sonKargoTarihi?: string;
    kalanSaat?: number;
  };
  iade: {
    durum: 'yok' | 'kontrol-bekliyor' | 'stoga-eklendi' | 'satilamaz' | 'tamamlandi';
    etiket?: string;
    renk: RozetRenk;
    bekleyenKalemler: number;
  };
  entegrasyon: {
    ortam: 'web' | 'canli' | 'test' | 'kapali' | 'eksik';
    testSiparisi: boolean;
    etiket?: string;
    uyari?: string;
  };

  kazanc: SiparisKazancOzeti;
  kalemler: SiparisKalemGorunumu[];
  eksikIsler: { etiket: string; renk: RozetRenk }[];
  uyarilar: string[];
  birincilIslem: BirincilIslem;
  /** Satıcının şu an gerçekten yapması gereken bir işlem var mı? (Varsayılan "İşlem Bekleyen" sekmesini belirler) */
  islemBekliyorMu: boolean;
  /** İstisna / hata / stok / eşleşme / gecikme kontrolü gerekiyor mu? */
  kontrolGerekli: boolean;
  /** Öncelik puanı: yüksek puan "İşlem Bekleyen" listesinde daha üstte görünür */
  oncelikPuani: number;
  aramaMetni: string;

  web?: Siparis;
  py?: PazaryeriSiparisi;
  belgeler: Belge[];
};

export type SiparisMerkeziGirdisi = {
  webSiparisleri: Siparis[];
  pazaryeriSiparisleri: PazaryeriSiparisi[];
  magaza: Magaza;
  finans?: Finans;
  envanter?: EnvanterAyarlari;
  simdi?: number;
  kanalDurumuBul?: (kanal: Kanal) => ReturnType<typeof pazaryeriApiDurumu>;
};

const SAAT_MS = 3_600_000;
const GUN_MS = 86_400_000;

function faturaBoyutuOlustur(
  faturaGerekli: boolean,
  kesilen: FaturaKaydi | undefined,
  aday: FaturaAdayi | undefined,
): FaturaBoyutu {
  if (!faturaGerekli && !kesilen) {
    return {
      asama: 'gerekmez',
      adimNo: 0,
      etiket: 'Fatura gerekmez',
      kisaEtiket: 'Gerekmez',
      renk: 'gri',
      dosyaEksik: false,
    };
  }
  if (!kesilen) {
    return {
      asama: 'kesilecek',
      adimNo: 1,
      etiket: '1/3 · Fatura kesilecek',
      kisaEtiket: 'Fatura kesilecek',
      renk: 'turuncu',
      aday,
      dosyaEksik: true,
    };
  }
  const iletim = kesilen.iletim.durum;
  if (iletim === 'gonderildi' || iletim === 'elle') {
    return {
      asama: 'iletildi',
      adimNo: 3,
      etiket: iletim === 'elle' ? `3/3 · Elle iletildi (${kesilen.no})` : `3/3 · İletildi (${kesilen.no})`,
      kisaEtiket: 'Fatura tamam',
      renk: 'yesil',
      kayit: kesilen,
      aday,
      dosyaEksik: !kesilen.ek,
    };
  }
  const hatali = iletim === 'hata';
  return {
    asama: 'kaydedildi',
    adimNo: 2,
    etiket: hatali ? `2/3 · İletim hatası (${kesilen.no})` : `2/3 · Kaydedildi — İletilecek (${kesilen.no})`,
    kisaEtiket: hatali ? 'Fatura iletim hatası' : 'Fatura iletilecek',
    renk: hatali ? 'kirmizi' : 'turuncu',
    kayit: kesilen,
    aday,
    dosyaEksik: !kesilen.ek,
    hataMesaji: hatali ? (kesilen.iletim.mesaj || 'Fatura iletilemedi; tekrar deneyin.') : undefined,
  };
}

function ilerlemeAdimlariOlustur(asama: SiparisAsamasi): SiparisAdimNoktasi[] {
  const sira: { kod: SiparisAsamasi; ad: string }[] = [
    { kod: 'yeni', ad: 'Alındı' },
    { kod: 'hazirlanacak', ad: 'Hazırlanacak' },
    { kod: 'hazirlaniyor', ad: 'Hazırlanıyor' },
    { kod: 'kargoya-hazir', ad: 'Kargoya Hazır' },
    { kod: 'kargoda', ad: 'Kargoda' },
    { kod: 'tamamlandi', ad: 'Tamamlandı' },
  ];
  if (asama === 'iptal-iade') {
    return sira.map((x, i) => ({
      kod: x.kod,
      ad: x.ad,
      durum: i === 0 ? 'tamam' : 'bekliyor',
      alt: i === 0 ? 'İptal / iade' : undefined,
    }));
  }
  const aktifIdx = sira.findIndex((x) => x.kod === asama);
  return sira.map((x, i) => ({
    kod: x.kod,
    ad: x.ad,
    durum: asama === 'tamamlandi' || i < aktifIdx ? 'tamam' : i === aktifIdx ? 'aktif' : 'bekliyor',
  }));
}

function webKazancHesapla(
  s: Siparis,
  finans: Finans | undefined,
  kdvBul: (urunId?: string) => number,
  kargoFirmasi: string,
  testMi: boolean,
): SiparisKazancOzeti {
  const musteriOdedigi = Math.round(s.toplam * 100);
  const indirim = Math.round((s.kampanyaIndirimi + s.setIndirimi + s.sepetIndirimi) * 100);
  if (testMi) {
    return { musteriOdedigi, indirim, maliyetEksik: false, kaynak: 'test', not: 'Test siparişi ciroya ve kâra katılmaz.' };
  }
  if (s.durum === 'iptal' || iadeEdildi(s)) {
    return { musteriOdedigi, indirim, maliyetEksik: false, kaynak: 'iptal-iade', not: 'İptal / iade edilen sipariş.' };
  }
  let urunMaliyeti = 0;
  let maliyetEksik = !finans;
  let toplamDesi = 0;
  let agirlikliHaricSatis = 0;
  if (finans) {
    for (const k of s.kalemler) {
      const kdv = kdvBul(k.tip === 'urun' ? k.id : k.parcalar[0]?.urunId);
      agirlikliHaricSatis += Math.round((k.toplam * 100 * 100) / (100 + kdv));
      if (k.tip === 'set') {
        for (const p of k.parcalar) {
          const hb = finans.hbUrunler[p.urunId];
          if (hb?.maliyet === undefined) maliyetEksik = true;
          else urunMaliyeti += hb.maliyet * p.adet * k.adet;
          toplamDesi += (hb?.desi ?? 3) * p.adet * k.adet;
        }
      } else {
        const hb = finans.hbUrunler[k.id];
        if (hb?.maliyet === undefined) maliyetEksik = true;
        else urunMaliyeti += hb.maliyet * k.adet;
        toplamDesi += (hb?.desi ?? 3) * k.adet;
      }
    }
  }
  if (s.kargo > 0) agirlikliHaricSatis += Math.round((s.kargo * 100 * 100) / 120);
  const kargoMaliyeti = kargoUcreti(kargoFirmasi || 'aras', Math.max(1, toplamDesi || 3));
  const tahminiNetKar = !maliyetEksik && kargoMaliyeti !== undefined
    ? agirlikliHaricSatis - kargoMaliyeti - urunMaliyeti
    : undefined;
  return {
    musteriOdedigi,
    indirim,
    komisyon: 0,
    kargoKesintisi: kargoMaliyeti !== undefined ? Math.round(kargoMaliyeti * 1.2) : undefined,
    urunMaliyeti: maliyetEksik ? undefined : urunMaliyeti,
    maliyetEksik,
    eksikNeden: maliyetEksik ? 'Ürün alış maliyeti girilmemiş' : kargoMaliyeti === undefined ? 'Kargo tarifesi bulunamadı' : undefined,
    tahminiNetKar,
    netMarj: tahminiNetKar !== undefined && agirlikliHaricSatis > 0 ? tahminiNetKar / agirlikliHaricSatis : undefined,
    beklenenHakedis: musteriOdedigi,
    kaynak: 'web-hesabi',
  };
}

function pazaryeriKazancHesapla(
  s: PazaryeriSiparisi,
  magaza: Magaza,
  finans: Finans | undefined,
  envanter: EnvanterAyarlari | undefined,
  kdvBul: (urunId?: string) => number,
  testMi: boolean,
): SiparisKazancOzeti {
  const musteriOdedigi = satisMi(s) ? satisTutari(s) : s.toplam;
  if (testMi) {
    return { musteriOdedigi, indirim: 0, maliyetEksik: false, kaynak: 'test', not: 'SIT / test siparişi canlı ciroya ve kâra katılmaz.' };
  }
  if (!satisMi(s)) {
    return { musteriOdedigi: s.toplam, indirim: 0, maliyetEksik: false, kaynak: 'iptal-iade', not: 'İptal, iade veya henüz onaylanmamış sipariş.' };
  }
  const aktifKalemler = s.kalemler.filter((k) => SATIS_DURUMLARI.has(k.durum));
  let urunMaliyeti = 0;
  let maliyetEksik = !finans || !aktifKalemler.length;
  let eksikNeden: string | undefined;
  let toplamDesi = 0;
  let satisKdvHaric = 0;

  for (const k of aktifKalemler) {
    const kdv = kdvBul(k.urunId);
    satisKdvHaric += Math.round((k.tutar * 100) / (100 + kdv));
    if (!k.urunId) {
      maliyetEksik = true;
      eksikNeden = 'Ürün katalogla eşleşmemiş';
      continue;
    }
    const hb = finans?.hbUrunler[k.urunId];
    if (hb?.maliyet === undefined) {
      maliyetEksik = true;
      eksikNeden = 'Ürün alış maliyeti girilmemiş';
    } else {
      urunMaliyeti += hb.maliyet * k.adet;
    }
    toplamDesi += (hb?.desi ?? envanter?.kanallar.trendyol.ilanlar[k.urunId]?.desi ?? 3) * k.adet;
  }

  // 1) Trendyol kesinleşen ekstre kaydı varsa doğrudan gerçek kesintileri kullan
  if (s.kanal === 'trendyol' && finans) {
    const ekstre = finans.trendyol.find((x) => x.id === 'TY-' + s.siparisNo);
    if (ekstre) {
      const ayniSiparisPaketleri = Math.max(1, s.toplam > 0 && ekstre.brut > 0 ? Math.min(1, musteriOdedigi / ekstre.brut) : 1);
      const pay = ayniSiparisPaketleri;
      const komisyon = Math.round(ekstre.komisyon * pay);
      const kargo = Math.round(ekstre.kargo * pay);
      const hizmet = Math.round((ekstre.hizmet + ekstre.diger) * pay);
      const stopaj = Math.round((ekstre.stopaj ?? 0) * pay);
      const indirim = Math.round(ekstre.indirim * pay);
      const beklenen = Math.round(hakEdis(ekstre) * pay);
      const kesinlesen = ekstre.banka !== undefined ? Math.round(ekstre.banka * pay) : beklenen;
      const kesintiKdvHaric = Math.round((komisyon + kargo + hizmet) / 1.2);
      const netSatisKdvHaric = Math.round(((Math.round(ekstre.brut * pay) - indirim - Math.round(ekstre.iade * pay)) * 100) / 120);
      const tahminiNetKar = !maliyetEksik ? netSatisKdvHaric - kesintiKdvHaric - urunMaliyeti : undefined;
      return {
        musteriOdedigi,
        indirim,
        komisyon,
        kargoKesintisi: kargo,
        hizmetKesintisi: hizmet,
        stopaj,
        urunMaliyeti: maliyetEksik ? undefined : urunMaliyeti,
        maliyetEksik,
        eksikNeden,
        tahminiNetKar,
        netMarj: tahminiNetKar !== undefined && netSatisKdvHaric > 0 ? tahminiNetKar / netSatisKdvHaric : undefined,
        beklenenHakedis: beklenen,
        kesinlesenHakedis: kesinlesen,
        mutabakatFarki: ekstre.banka !== undefined ? kesinlesen - beklenen : undefined,
        kaynak: 'kesinlesen-ekstre',
      };
    }

    // Ekstre henüz gelmemiş Trendyol siparişi: siparişin kendi tarihsel tutarı + ürün komisyon oranı + kargo tarifesi
    const ilkUrunId = aktifKalemler[0]?.urunId;
    const oranBp = ilkUrunId ? envanter?.kanallar.trendyol.urunler[ilkUrunId]?.komisyonBp : undefined;
    const kargoFirmasi = finans.hbAyar.kargoFirmasi || 'aras';
    if (oranBp === undefined) {
      return {
        musteriOdedigi,
        indirim: 0,
        urunMaliyeti: maliyetEksik ? undefined : urunMaliyeti,
        maliyetEksik: true,
        eksikNeden: eksikNeden ?? 'Trendyol komisyon oranı henüz okunmadı',
        kaynak: 'tahmini-tarife',
      };
    }
    const hesap = satisHesabi({
      fiyat: musteriOdedigi,
      oranBp,
      komisyonKdvDahil: true,
      urunKdv: kdvBul(ilkUrunId),
      desi: Math.max(1, toplamDesi || 3),
      kargoFirmasi,
      islemBedeli: 0,
      hizmetBedeli: 0,
      stopajBp: 100,
      maliyet: maliyetEksik ? undefined : urunMaliyeti,
    });
    return {
      musteriOdedigi,
      indirim: 0,
      komisyon: hesap.kalemler[0]!.net + hesap.kalemler[0]!.kdv,
      kargoKesintisi: hesap.kalemler[1]!.net + hesap.kalemler[1]!.kdv,
      hizmetKesintisi: 0,
      stopaj: hesap.stopaj,
      urunMaliyeti: maliyetEksik ? undefined : urunMaliyeti,
      maliyetEksik: maliyetEksik || hesap.kargoBulunamadi,
      eksikNeden: eksikNeden ?? (hesap.kargoBulunamadi ? 'Kargo tarifesi bulunamadı' : undefined),
      tahminiNetKar: hesap.netKar,
      netMarj: hesap.marj,
      beklenenHakedis: hesap.hesabaYatan,
      kaynak: 'tahmini-tarife',
      not: 'Ekstre kesinleşene kadar kayıtlı komisyon ve kargo tarifesiyle tahmini hesaplandı.',
    };
  }

  // 2) Hepsiburada: muhasebe kayıtları varsa mutabakatı bağla, yoksa tarife üzerinden hesapla (kargoFirmasi boşsa sahte kâr üretme!)
  const hbKayitlari = finans?.hepsiburada.filter((x) => x.siparisNo === s.siparisNo) ?? [];
  const kesinlesenHb = hbKayitlari.length ? hbKayitlari.reduce((t, x) => t + hbIsaretli(x), 0) : undefined;
  const ilkUrunId = aktifKalemler[0]?.urunId;
  const urun = ilkUrunId ? magaza.urunler.find((u) => u.id === ilkUrunId) : undefined;
  const hbBilgi = ilkUrunId ? finans?.hbUrunler[ilkUrunId] : undefined;
  const hbOranBp = hbBilgi
    ? (hbBilgi.kategori === 'elle' ? hbBilgi.oranBp : hbKategori(hbBilgi.kategori)?.oranBp)
    : urun ? hbKategori(kategoriOnerisi(urun.kategoriler))?.oranBp : undefined;
  const kargoFirmasi = finans?.hbAyar.kargoFirmasi ?? '';

  if (hbOranBp === undefined || !finans) {
    return {
      musteriOdedigi,
      indirim: 0,
      urunMaliyeti: maliyetEksik ? undefined : urunMaliyeti,
      maliyetEksik: true,
      eksikNeden: eksikNeden ?? 'Hepsiburada komisyon oranı eksik',
      kesinlesenHakedis: kesinlesenHb,
      kaynak: kesinlesenHb !== undefined ? 'kesinlesen-ekstre' : 'tahmini-tarife',
    };
  }

  const hesap = satisHesabi({
    fiyat: musteriOdedigi,
    oranBp: hbOranBp,
    komisyonKdvDahil: false,
    urunKdv: kdvBul(ilkUrunId),
    desi: Math.max(1, toplamDesi || 3),
    kargoFirmasi,
    islemBedeli: finans.hbAyar.islemBedeli,
    hizmetBedeli: finans.hbAyar.hizmetBedeli,
    stopajBp: finans.hbAyar.stopajBp,
    maliyet: maliyetEksik ? undefined : urunMaliyeti,
  });

  return {
    musteriOdedigi,
    indirim: 0,
    komisyon: hesap.kalemler[0]!.net + hesap.kalemler[0]!.kdv,
    kargoKesintisi: hesap.kargoBulunamadi ? undefined : hesap.kalemler[1]!.net + hesap.kalemler[1]!.kdv,
    hizmetKesintisi: hesap.kalemler[2]!.net + hesap.kalemler[2]!.kdv + hesap.kalemler[3]!.net + hesap.kalemler[3]!.kdv,
    stopaj: hesap.stopaj,
    urunMaliyeti: maliyetEksik ? undefined : urunMaliyeti,
    maliyetEksik: maliyetEksik || hesap.kargoBulunamadi,
    eksikNeden: eksikNeden ?? (hesap.kargoBulunamadi ? 'Hepsiburada kargo firması seçilmedi' : undefined),
    tahminiNetKar: hesap.netKar,
    netMarj: hesap.marj,
    beklenenHakedis: hesap.kargoBulunamadi ? undefined : hesap.hesabaYatan,
    kesinlesenHakedis: kesinlesenHb,
    mutabakatFarki: kesinlesenHb !== undefined && !hesap.kargoBulunamadi ? kesinlesenHb - hesap.hesabaYatan : undefined,
    kaynak: kesinlesenHb !== undefined ? 'kesinlesen-ekstre' : 'tahmini-tarife',
    not: satiskdvNotu(satisKdvHaric, kesinlesenHb),
  };
}

function satiskdvNotu(_satisKdvHaric: number, kesinlesenHb?: number): string | undefined {
  return kesinlesenHb !== undefined ? 'Muhasebe servisinden gelen kayıtlarla eşleştirildi.' : 'Kayıtlı tarife üzerinden tahmini hesaplandı.';
}

export function siparisMerkeziOlustur(girdi: SiparisMerkeziGirdisi): SiparisMerkeziKaydi[] {
  const { webSiparisleri, pazaryeriSiparisleri, magaza, finans, envanter } = girdi;
  const simdi = girdi.simdi ?? Date.now();
  const durumBul = girdi.kanalDurumuBul ?? pazaryeriApiDurumu;
  const urunHaritasi = new Map(magaza.urunler.map((u) => [u.id, u]));
  const setHaritasi = new Map(magaza.setler.map((s) => [s.id, s]));
  const kdvBul = finans ? kdvBulucu(finans, envanter) : () => 20;

  const adayHaritasi = new Map<string, FaturaAdayi>();
  if (finans) {
    for (const a of faturaAdaylari(finans, webSiparisleri, pazaryeriSiparisleri, envanter)) {
      adayHaritasi.set(a.anahtar, a);
    }
  }
  const faturaHaritasi = new Map<string, FaturaKaydi>();
  if (finans) {
    for (const f of finans.faturalar) {
      if (!f.iptal) faturaHaritasi.set(`${f.kanal}:${f.kayit}`, f);
    }
  }
  const belgeHaritasi = new Map<string, Belge[]>();
  if (finans) {
    for (const b of finans.belgeler) {
      const mevcut = belgeHaritasi.get(b.siparisNo) ?? [];
      mevcut.push(b);
      belgeHaritasi.set(b.siparisNo, mevcut);
    }
  }

  const sonuc: SiparisMerkeziKaydi[] = [];

  // ==================== 1. WEB SİPARİŞLERİ ====================
  for (const s of webSiparisleri) {
    const anahtar = 'web:' + s.no;
    const testSiparisi = Boolean(s.paytr?.test);
    const iadeMi = iadeEdildi(s);
    const iptalMi = s.durum === 'iptal' || iadeMi;
    const belgeler = belgeHaritasi.get(s.no) ?? [];
    const gecerliBelgeler = belgeler.filter(belgeGecerli);
    const paketlendiNotu = s.gecmis.some((g) => (g.not ?? '').includes('paketlendi'));

    let asama: SiparisAsamasi;
    if (iptalMi) asama = 'iptal-iade';
    else if (s.durum === 'odeme-bekliyor') asama = 'yeni';
    else if (s.durum === 'odendi') asama = 'hazirlanacak';
    else if (s.durum === 'hazirlaniyor') {
      asama = paketlendiNotu || gecerliBelgeler.some((b) => b.tur === 'paket' || b.tur === 'fis') ? 'kargoya-hazir' : 'hazirlaniyor';
    } else if (s.durum === 'kargoda') asama = 'kargoda';
    else asama = 'tamamlandi';

    const zamanMs = Date.parse(s.tarih) || 0;
    const paytrGecikti = Boolean(s.paytr && s.paytr.sonuc === 'bekliyor' && simdi - zamanMs > 60 * 60_000);
    const havaleBekliyor = !s.paytr && s.durum === 'odeme-bekliyor';

    const odeme: SiparisMerkeziKaydi['odeme'] = testSiparisi
      ? { durum: 'test', etiket: 'PayTR Test', renk: 'gri' }
      : s.paytr?.sonuc === 'basarisiz'
        ? { durum: 'basarisiz', etiket: 'Ödeme başarısız', renk: 'kirmizi' }
        : paytrGecikti
          ? { durum: 'gecikti', etiket: 'PayTR gecikti (>1 sa)', renk: 'kirmizi' }
          : s.durum === 'odeme-bekliyor'
            ? { durum: 'bekliyor', etiket: havaleBekliyor ? 'Havale onayı bekliyor' : odemeEtiketi(s), renk: 'turuncu' }
            : iptalMi
              ? { durum: 'iptal', etiket: iadeMi ? 'İade tamamlandı' : 'İptal', renk: 'gri' }
              : { durum: 'onayli', etiket: odemeEtiketi(s), renk: 'yesil' };

    const stokEksik = Boolean(s.paytr?.stokEksik && !iptalMi);
    const stok: SiparisMerkeziKaydi['stok'] = testSiparisi
      ? { durum: 'test-izole', etiket: 'Test (stok düşmez)', renk: 'gri', eksikAdet: 0, eslesmeyenAdet: 0 }
      : stokEksik
        ? { durum: 'eksik', etiket: 'Stok açığı var', renk: 'kirmizi', eksikAdet: 1, eslesmeyenAdet: 0 }
        : s.stokDusuldu
          ? { durum: 'ayrildi', etiket: 'Ortak depodan ayrıldı', renk: 'yesil', eksikAdet: 0, eslesmeyenAdet: 0 }
          : { durum: 'bekliyor', etiket: iptalMi ? 'Stok korundu' : 'Ödeme bekliyor', renk: 'gri', eksikAdet: 0, eslesmeyenAdet: 0 };

    const faturaGerekli = onayliSatis(s);
    const fatura = faturaBoyutuOlustur(faturaGerekli, faturaHaritasi.get(anahtar), adayHaritasi.get(anahtar));

    const kargoBag = siparisKargoBaglantisi(s, magaza.site.kargo);
    const kargodaGecenMs = s.durum === 'kargoda'
      ? simdi - (Date.parse([...s.gecmis].reverse().find((g) => g.durum === 'kargoda')?.tarih ?? s.tarih) || zamanMs)
      : 0;
    const kargo: SiparisMerkeziKaydi['kargo'] = iptalMi
      ? { durum: 'iptal', etiket: iadeMi ? 'İade edildi' : 'Gönderilmeyecek', renk: 'gri', firma: s.kargoFirma, takipNo: s.kargoTakip }
      : s.durum === 'teslim-edildi'
        ? { durum: 'teslim', etiket: 'Teslim edildi', renk: 'yesil', firma: kargoBag?.firma ?? s.kargoFirma, takipNo: s.kargoTakip, takipUrl: kargoBag?.url }
        : s.durum === 'kargoda'
          ? { durum: 'kargoda', etiket: s.kargoTakip ? `Kargoda · ${s.kargoTakip}` : 'Kargoda', renk: 'yesil', firma: kargoBag?.firma ?? s.kargoFirma, takipNo: s.kargoTakip, takipUrl: kargoBag?.url }
          : asama === 'kargoya-hazir'
            ? { durum: 'etiket-hazir', etiket: 'Paketlendi · Takip no bekliyor', renk: 'altin' }
            : s.durum === 'odeme-bekliyor'
              ? { durum: 'bekliyor', etiket: 'Ödeme bekleniyor', renk: 'gri' }
              : { durum: 'hazirlanacak', etiket: 'Kargoya hazırlanacak', renk: 'turuncu' };

    const iade: SiparisMerkeziKaydi['iade'] = iadeMi
      ? { durum: 'tamamlandi', etiket: 'İade tamamlandı', renk: 'gri', bekleyenKalemler: 0 }
      : { durum: 'yok', renk: 'gri', bekleyenKalemler: 0 };

    const entegrasyon: SiparisMerkeziKaydi['entegrasyon'] = {
      ortam: 'web',
      testSiparisi,
      etiket: testSiparisi ? 'Test Siparişi' : undefined,
      uyari: testSiparisi ? 'PayTR test modunda oluşturulmuş kayıt; canlı stoğu ve ciroyu etkilemez.' : undefined,
    };

    const eksikIsler: { etiket: string; renk: RozetRenk }[] = [];
    const uyarilar: string[] = [];
    if (testSiparisi) uyarilar.push('Bu bir test siparişidir; ciroya ve ortak stoğa dahil edilmez.');
    if (stokEksik) {
      eksikIsler.push({ etiket: 'Stok açığı', renk: 'kirmizi' });
      uyarilar.push('Ödeme alındı ancak stok yetersizdi. Gönderime geçmeden önce stoğu ayırın veya siparişi iptal edin.');
    }
    if (paytrGecikti) {
      eksikIsler.push({ etiket: 'PayTR gecikti', renk: 'kirmizi' });
      uyarilar.push('1 saatten uzun süredir ödeme sonucu gelmedi; PayTR Mağaza Paneli’nden kontrol edin.');
    }
    if (havaleBekliyor) {
      eksikIsler.push({ etiket: 'Havale kontrolü', renk: 'turuncu' });
    }
    if (!testSiparisi && (s.durum === 'odendi' || s.durum === 'hazirlaniyor') && !stokEksik) {
      eksikIsler.push({ etiket: s.durum === 'odendi' ? 'Hazırlanacak' : 'Takip no girilecek', renk: 'turuncu' });
    }
    if (fatura.asama === 'kesilecek') {
      eksikIsler.push({ etiket: 'Fatura kesilecek (1/3)', renk: s.durum === 'kargoda' || s.durum === 'teslim-edildi' ? 'kirmizi' : 'turuncu' });
    } else if (fatura.asama === 'kaydedildi') {
      eksikIsler.push({ etiket: fatura.hataMesaji ? 'Fatura iletim hatası' : 'Fatura iletilecek (2/3)', renk: fatura.hataMesaji ? 'kirmizi' : 'turuncu' });
    }
    const teslimatKontrolZamani = s.durum === 'kargoda' && kargodaGecenMs >= 5 * GUN_MS;
    if (teslimatKontrolZamani) {
      eksikIsler.push({ etiket: 'Teslimat kontrolü (5+ gün)', renk: 'altin' });
    }
    if (iptalMi && s.kargoTakip) {
      uyarilar.push(`İptal edilen siparişte kargo takip numarası kayıtlı (${s.kargoTakip}); kargo firmasından gönderiyi durdurun.`);
    }

    let birincilIslem: BirincilIslem;
    let islemBekliyorMu = false;
    if (testSiparisi) {
      birincilIslem = { kod: 'incele', etiket: 'Test Kaydını İncele', aciklama: 'Test siparişi canlı iş listesine dahil edilmez.', tur: 'bilgi', sekme: 'gecmis' };
    } else if (stokEksik) {
      islemBekliyorMu = true;
      birincilIslem = { kod: 'stok-coz', etiket: 'Stoğu Ayır / Çöz', aciklama: 'Depo stoğunu kontrol edip sipariş için stoğu ayırın.', tur: 'uyari', sekme: 'islemler', odak: 'stok' };
    } else if (paytrGecikti) {
      islemBekliyorMu = true;
      birincilIslem = { kod: 'paytr-kontrol', etiket: 'PayTR’de Kontrol Et', aciklama: 'Ödeme bildirimi 1 saattir gelmedi; PayTR panelinden kontrol edin.', tur: 'uyari', sekme: 'islemler', odak: 'durum' };
    } else if (havaleBekliyor) {
      islemBekliyorMu = true;
      birincilIslem = { kod: 'odeme-onayla', etiket: 'Ödemeyi Onayla', aciklama: 'Havale/EFT hesaba geçtiyse onaylayıp hazırlığa geçirin.', tur: 'birincil', sekme: 'islemler', odak: 'durum' };
    } else if (s.durum === 'odendi') {
      islemBekliyorMu = true;
      birincilIslem = { kod: 'web-hazirla', etiket: 'Hazırlamaya Al', aciklama: 'Siparişi depo hazırlık aşamasına geçirir.', tur: 'birincil', sekme: 'islemler', odak: 'durum' };
    } else if (s.durum === 'hazirlaniyor') {
      islemBekliyorMu = true;
      birincilIslem = {
        kod: 'web-kargola',
        etiket: 'Kargoya Ver (Takip No Gir)',
        aciklama: fatura.asama === 'kesilecek' ? 'Kargo takip numarasını girin ve GİB faturasını kaydedin.' : 'Kargo firması ve takip numarasını kaydedin.',
        tur: 'birincil',
        sekme: 'islemler',
        odak: 'durum',
      };
    } else if (fatura.asama === 'kesilecek') {
      islemBekliyorMu = true;
      birincilIslem = { kod: 'fatura-kes', etiket: 'Faturayı Kes (1/3)', aciklama: 'GİB e-Arşiv faturasını kesip fatura numarasını kaydedin.', tur: 'uyari', sekme: 'islemler', odak: 'fatura' };
    } else if (fatura.asama === 'kaydedildi') {
      islemBekliyorMu = true;
      birincilIslem = {
        kod: 'fatura-ilet',
        etiket: fatura.hataMesaji ? 'Fatura İletimini Tekrarla (2/3)' : 'Faturayı Müşteriye İlet (2/3)',
        aciklama: fatura.hataMesaji ?? 'Kaydedilen faturayı müşteriye e-posta ile gönderin veya elle iletildi işaretleyin.',
        tur: fatura.hataMesaji ? 'uyari' : 'birincil',
        sekme: 'islemler',
        odak: 'fatura',
      };
    } else if (s.durum === 'kargoda') {
      islemBekliyorMu = teslimatKontrolZamani;
      birincilIslem = {
        kod: 'web-teslim',
        etiket: 'Teslim Edildi İşaretle',
        aciklama: 'Kargo müşteriye ulaştığında siparişi tamamlayın.',
        tur: teslimatKontrolZamani ? 'birincil' : 'ikincil',
        sekme: 'islemler',
        odak: 'durum',
      };
    } else {
      birincilIslem = { kod: 'tamam', etiket: 'Detayı Gör', aciklama: 'Sipariş tamamlandı.', tur: 'ikincil', sekme: 'gecmis' };
    }

    const kontrolGerekli = !testSiparisi && (stokEksik || paytrGecikti || fatura.hataMesaji !== undefined || belgeler.some((b) => b.durum === 'hata'));
    const kalemler: SiparisKalemGorunumu[] = s.kalemler.map((k, idx) => {
      const gorsel = k.tip === 'set'
        ? setHaritasi.get(k.id)?.gorsel?.src ?? urunHaritasi.get(k.parcalar[0]?.urunId ?? '')?.gorseller[0]?.src
        : urunHaritasi.get(k.id)?.gorseller[0]?.src;
      return {
        anahtar: `${k.tip}:${k.id}:${idx}`,
        ad: k.ad,
        adet: k.adet,
        birimKurus: Math.round(k.birimFiyat * 100),
        toplamKurus: Math.round(k.toplam * 100),
        gorsel,
        sku: k.sku,
        urunId: k.tip === 'urun' ? k.id : undefined,
        eslesmeyen: false,
        eksikStok: 0,
        iadeBekliyor: false,
      };
    });
    const musteriAdi = `${s.musteri.ad} ${s.musteri.soyad}`.trim();
    const ilkKalem = s.kalemler[0];
    const kalemOzeti = ilkKalem
      ? `${ilkKalem.adet}× ${ilkKalem.ad}${s.kalemler.length > 1 ? ` +${s.kalemler.length - 1} çeşit` : ''}`
      : '—';
    const oncelikPuani = testSiparisi ? 0
      : (stokEksik || paytrGecikti ? 90 : 0)
        + (s.durum === 'odendi' || s.durum === 'hazirlaniyor' ? 60 : 0)
        + (fatura.asama === 'kesilecek' || fatura.asama === 'kaydedildi' ? 40 : 0)
        + (havaleBekliyor ? 35 : 0);

    sonuc.push({
      anahtar,
      kanal: 'web',
      kanalAdi: 'Web Sitesi',
      no: s.no,
      tarih: s.tarih,
      zamanMs,
      musteriAdi,
      telefon: s.musteri.tel,
      eposta: s.musteri.eposta,
      konum: [s.teslimat.ilce, s.teslimat.il].filter(Boolean).join(' / '),
      adres: `${s.teslimat.adres} ${s.teslimat.ilce}/${s.teslimat.il}`.trim(),
      kalemOzeti,
      ilkGorsel: kalemler[0]?.gorsel,
      toplamAdet: s.kalemler.reduce((t, k) => t + k.adet, 0),
      tutarKurus: Math.round(s.toplam * 100),
      detayHref: '/yonetim/siparisler/' + encodeURIComponent(s.no),
      paketleHref: (s.durum === 'odendi' || s.durum === 'hazirlaniyor') && !stokEksik
        ? '/yonetim/siparisler/hazirlik/paketle?id=' + encodeURIComponent(anahtar)
        : undefined,
      asama,
      asamaEtiketi: ASAMA_ADLARI[asama],
      asamaRenk: ASAMA_RENKLERI[asama],
      hamDurumAdi: iadeMi ? 'İade tamamlandı' : SIPARIS_DURUM_ADLARI[s.durum],
      adimlar: ilerlemeAdimlariOlustur(asama),
      odeme,
      stok,
      fatura,
      kargo,
      iade,
      entegrasyon,
      kazanc: webKazancHesapla(s, finans, kdvBul, finans?.hbAyar.kargoFirmasi || 'aras', testSiparisi),
      kalemler,
      eksikIsler,
      uyarilar,
      birincilIslem,
      islemBekliyorMu,
      kontrolGerekli,
      oncelikPuani,
      aramaMetni: [s.no, musteriAdi, s.musteri.tel, s.musteri.eposta, s.teslimat.il, s.teslimat.ilce, s.kargoTakip, ...s.kalemler.map((k) => `${k.ad} ${k.sku ?? ''}`)].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR'),
      web: s,
      belgeler,
    });
  }

  // ==================== 2. PAZARYERİ SİPARİŞLERİ ====================
  for (const s of pazaryeriSiparisleri) {
    const anahtar = s.id;
    const faturaAnahtari = `${s.kanal}:${s.id}`;
    const apiDurumu = durumBul(s.kanal);
    const testSiparisi = Boolean(apiDurumu === 'test' || s.stokDisi);
    const gecmisMetin = s.gecmis.map((g) => g.not ?? '').join(' · ');
    const toplamaBildirildi = gecmisMetin.includes('toplanıyor') || ['Picking', 'Invoiced', 'ReadyToShip'].includes(s.hamDurum);
    const hbPaketlendi = gecmisMetin.includes('Hepsiburada’da paketlendi') || ['Packaged', 'ReadyToShip'].includes(s.hamDurum) || Boolean(s.paketNo || s.kargoTakip);

    let asama: SiparisAsamasi;
    if (['iptal', 'iade', 'teslim-edilemedi'].includes(s.durum)) {
      asama = 'iptal-iade';
    } else if (s.durum === 'onay-bekliyor') {
      asama = 'yeni';
    } else if (s.durum === 'teslim-edildi') {
      asama = 'tamamlandi';
    } else if (s.durum === 'kargoda') {
      asama = 'kargoda';
    } else if (s.kanal === 'trendyol') {
      if (s.hamDurum === 'Created' && !gecmisMetin.includes('toplanıyor')) asama = 'hazirlanacak';
      else if (s.kargoTakip || s.hamDurum === 'ReadyToShip') asama = 'kargoya-hazir';
      else asama = 'hazirlaniyor';
    } else {
      // Hepsiburada
      if (!hbPaketlendi && s.durum === 'yeni') asama = 'hazirlanacak';
      else if (s.kargoTakip || s.paketNo || hbPaketlendi) asama = 'kargoya-hazir';
      else asama = 'hazirlaniyor';
    }

    const pyKargoUrl = (() => {
      if (!s.kargoTakip || !s.kargoFirma) return undefined;
      const firmaKucuk = s.kargoFirma.toLocaleLowerCase('tr-TR');
      const sablon = KARGO_SABLONLARI.find((k) => firmaKucuk.includes(k.ad.split(' ')[0]!.toLocaleLowerCase('tr-TR')));
      return sablon ? takipBaglantisi(sablon.url, s.kargoTakip) : undefined;
    })();

    const eslesmeyenAdet = s.stokDisi
      ? 0
      : s.kalemler.filter((k) => STOK_AKTIF.has(k.durum) && (!k.urunId || (k.stok === 'yok' && !urunHaritasi.has(k.urunId)))).length;
    const eksikAdet = s.stokDisi ? 0 : s.kalemler.reduce((t, k) => t + (k.eksik ?? 0), 0);
    const iadeBekleyenSayi = s.stokDisi ? 0 : s.kalemler.filter(kalemIadeBekliyor).length;

    const odeme: SiparisMerkeziKaydi['odeme'] = testSiparisi
      ? { durum: 'test', etiket: apiDurumu === 'test' ? 'SIT Test Kaydı' : 'Başlangıç öncesi (izole)', renk: 'gri' }
      : s.durum === 'onay-bekliyor'
        ? { durum: 'bekliyor', etiket: `${KANALLAR[s.kanal]} onayı bekliyor`, renk: 'turuncu' }
        : s.durum === 'iptal'
          ? { durum: 'iptal', etiket: 'İptal edildi', renk: 'gri' }
          : { durum: 'onayli', etiket: `${KANALLAR[s.kanal]} tahsil etti`, renk: 'yesil' };

    const stok: SiparisMerkeziKaydi['stok'] = testSiparisi
      ? { durum: 'test-izole', etiket: apiDurumu === 'test' ? 'Test ortamı (stok düşmez)' : 'Başlangıç öncesi (stok düşmez)', renk: 'gri', eksikAdet: 0, eslesmeyenAdet: 0 }
      : eslesmeyenAdet > 0 || eslesmeyenVar(s)
        ? { durum: 'eslesmeyen', etiket: `${Math.max(1, eslesmeyenAdet)} ürün eşleşmedi`, renk: 'kirmizi', eksikAdet, eslesmeyenAdet: Math.max(1, eslesmeyenAdet) }
        : eksikAdet > 0 || fazlaSatisVar(s)
          ? { durum: 'eksik', etiket: `${Math.max(1, eksikAdet)} adet stok açığı`, renk: 'kirmizi', eksikAdet: Math.max(1, eksikAdet), eslesmeyenAdet: 0 }
          : iadeBekleyenSayi > 0
            ? { durum: 'iade-bekliyor', etiket: 'İade depo kontrolü bekliyor', renk: 'turuncu', eksikAdet: 0, eslesmeyenAdet: 0 }
            : s.kalemler.some((k) => k.stok === 'geri-alindi')
              ? { durum: 'iade-eklendi', etiket: 'İade stoğa eklendi', renk: 'yesil', eksikAdet: 0, eslesmeyenAdet: 0 }
              : s.kalemler.some((k) => k.stok === 'hasarli')
                ? { durum: 'iade-satilamaz', etiket: 'İade satılamaz ayrıldı', renk: 'gri', eksikAdet: 0, eslesmeyenAdet: 0 }
                : s.kalemler.some((k) => k.stok === 'dusuldu')
                  ? { durum: 'ayrildi', etiket: 'Ortak depodan düşüldü', renk: 'yesil', eksikAdet: 0, eslesmeyenAdet: 0 }
                  : { durum: 'bekliyor', etiket: 'Stok işlemi yok', renk: 'gri', eksikAdet: 0, eslesmeyenAdet: 0 };

    const faturaGerekli = !testSiparisi && s.durum !== 'onay-bekliyor' && s.kalemler.some((k) => SATIS_DURUMLARI.has(k.durum));
    const fatura = faturaBoyutuOlustur(faturaGerekli, faturaHaritasi.get(faturaAnahtari), adayHaritasi.get(faturaAnahtari));

    const sonKargoMs = Date.parse(s.sonKargoTarihi ?? '');
    const kargoAktif = ['yeni', 'hazirlaniyor', 'bolundu', 'bilinmiyor'].includes(s.durum);
    const kalanSaat = kargoAktif && Number.isFinite(sonKargoMs) ? Math.round((sonKargoMs - simdi) / SAAT_MS) : undefined;
    const kargoGecikti = kalanSaat !== undefined && kalanSaat < 0;

    const kargo: SiparisMerkeziKaydi['kargo'] = ['iptal', 'iade', 'teslim-edilemedi'].includes(s.durum)
      ? { durum: 'iptal', etiket: PY_DURUM_ADLARI[s.durum], renk: 'gri', firma: s.kargoFirma, takipNo: s.kargoTakip, takipUrl: pyKargoUrl }
      : s.durum === 'teslim-edildi'
        ? { durum: 'teslim', etiket: 'Teslim edildi', renk: 'yesil', firma: s.kargoFirma, takipNo: s.kargoTakip, takipUrl: pyKargoUrl }
        : s.durum === 'kargoda'
          ? { durum: 'kargoda', etiket: s.kargoTakip ? `Kargoda · ${s.kargoTakip}` : 'Kargoda', renk: 'yesil', firma: s.kargoFirma, takipNo: s.kargoTakip, takipUrl: pyKargoUrl }
          : kargoGecikti
            ? { durum: 'gecikti', etiket: 'Son kargo süresi geçti!', renk: 'kirmizi', firma: s.kargoFirma, takipNo: s.kargoTakip, sonKargoTarihi: s.sonKargoTarihi, kalanSaat }
            : asama === 'kargoya-hazir'
              ? { durum: 'etiket-hazir', etiket: s.kargoTakip ? `Etiket hazır · ${s.kargoTakip}` : 'Paket hazır', renk: kalanSaat !== undefined && kalanSaat <= 24 ? 'turuncu' : 'altin', firma: s.kargoFirma, takipNo: s.kargoTakip, sonKargoTarihi: s.sonKargoTarihi, kalanSaat }
              : s.durum === 'onay-bekliyor'
                ? { durum: 'bekliyor', etiket: 'Kanal onayı bekliyor', renk: 'gri' }
                : { durum: 'hazirlanacak', etiket: kalanSaat !== undefined && kalanSaat <= 24 ? `Bugün kargola (${Math.max(0, kalanSaat)} sa)` : 'Hazırlanacak', renk: 'turuncu', firma: s.kargoFirma, takipNo: s.kargoTakip, sonKargoTarihi: s.sonKargoTarihi, kalanSaat };

    const iade: SiparisMerkeziKaydi['iade'] = iadeBekleyenSayi > 0
      ? { durum: 'kontrol-bekliyor', etiket: `${iadeBekleyenSayi} kalem iade kontrolü bekliyor`, renk: 'turuncu', bekleyenKalemler: iadeBekleyenSayi }
      : s.kalemler.some((k) => k.stok === 'geri-alindi' && (k.durum === 'iade' || k.durum === 'teslim-edilemedi'))
        ? { durum: 'stoga-eklendi', etiket: 'İade stoğa eklendi', renk: 'yesil', bekleyenKalemler: 0 }
        : s.kalemler.some((k) => k.stok === 'hasarli')
          ? { durum: 'satilamaz', etiket: 'İade satılamaz ayrıldı', renk: 'gri', bekleyenKalemler: 0 }
          : s.durum === 'iade' || s.durum === 'teslim-edilemedi'
            ? { durum: 'tamamlandi', etiket: PY_DURUM_ADLARI[s.durum], renk: 'gri', bekleyenKalemler: 0 }
            : { durum: 'yok', renk: 'gri', bekleyenKalemler: 0 };

    const entegrasyon: SiparisMerkeziKaydi['entegrasyon'] = {
      ortam: apiDurumu,
      testSiparisi,
      etiket: apiDurumu === 'test' ? 'SIT Test Kaydı' : s.stokDisi ? 'Başlangıç Öncesi' : undefined,
      uyari: apiDurumu === 'test'
        ? `${KANALLAR[s.kanal]} şu an SIT/test ortamında çalışıyor; bu kayıt canlı satış, ortak stok veya fatura kuyruğuna katılmaz.`
        : s.stokDisi
          ? 'Sayım başlangıç zamanından önceki sipariş; ortak stoktan düşülmez.'
          : undefined,
    };

    const eksikIsler: { etiket: string; renk: RozetRenk }[] = [];
    const uyarilar: string[] = [];
    if (entegrasyon.uyari) uyarilar.push(entegrasyon.uyari);
    if (!testSiparisi) {
      if (stok.durum === 'eslesmeyen') {
        eksikIsler.push({ etiket: 'Ürün eşleşmedi', renk: 'kirmizi' });
        uyarilar.push('Siparişte katalogla eşleşmeyen ürün var; hazırlığa geçmeden önce ürünü bağlayın.');
      }
      if (stok.durum === 'eksik') {
        eksikIsler.push({ etiket: 'Stok açığı', renk: 'kirmizi' });
        uyarilar.push('Depo stoğu yetersiz kaldığı için sipariş kaleminde açık oluştu.');
      }
      if (iadeBekleyenSayi > 0) {
        eksikIsler.push({ etiket: 'İade kontrolü', renk: 'turuncu' });
        uyarilar.push('İade gelen paketi kontrol edip stoğa eklenip eklenmeyeceğini onaylayın.');
      }
      if (kargoGecikti) {
        eksikIsler.push({ etiket: 'Kargo gecikti!', renk: 'kirmizi' });
        uyarilar.push('Pazaryeri son kargoya verme süresi geçti; cezaya düşmemek için hemen işlem yapın.');
      } else if (kalanSaat !== undefined && kalanSaat <= 24) {
        eksikIsler.push({ etiket: `Son ${Math.max(0, kalanSaat)} saat`, renk: 'turuncu' });
      }
      if (s.durum === 'bolundu') {
        eksikIsler.push({ etiket: 'Paket bölündü', renk: 'turuncu' });
        uyarilar.push('Paket bölündü; güncel paketleri kontrol edin.');
      } else if (s.durum === 'bilinmiyor') {
        eksikIsler.push({ etiket: 'Durum kontrolü', renk: 'kirmizi' });
        uyarilar.push(`Tanınmayan kanal durumu (${s.hamDurum}); satıcı panelinden kontrol edin.`);
      } else if (asama === 'hazirlanacak') {
        eksikIsler.push({ etiket: s.kanal === 'trendyol' ? 'Toplamaya başla' : 'Paketle', renk: 'turuncu' });
      } else if (asama === 'hazirlaniyor') {
        eksikIsler.push({ etiket: 'Kargo kodu bekleniyor', renk: 'altin' });
      } else if (asama === 'kargoya-hazir') {
        eksikIsler.push({ etiket: 'Etiket yazdır & kargola', renk: 'altin' });
      }
      if (fatura.asama === 'kesilecek') {
        eksikIsler.push({ etiket: 'Fatura kesilecek (1/3)', renk: asama === 'kargoda' || asama === 'tamamlandi' ? 'kirmizi' : 'turuncu' });
      } else if (fatura.asama === 'kaydedildi') {
        eksikIsler.push({ etiket: fatura.hataMesaji ? 'Fatura iletim hatası' : 'Kanala iletilecek (2/3)', renk: fatura.hataMesaji ? 'kirmizi' : 'turuncu' });
      }
    }

    let birincilIslem: BirincilIslem;
    let islemBekliyorMu = false;
    if (testSiparisi) {
      birincilIslem = { kod: 'incele', etiket: 'Test Kaydını İncele', aciklama: 'SIT / başlangıç öncesi kayıt canlı iş kuyruğuna dahil edilmez.', tur: 'bilgi', sekme: 'islemler' };
    } else if (stok.durum === 'eslesmeyen') {
      islemBekliyorMu = true;
      birincilIslem = { kod: 'urun-eslestir', etiket: 'Ürünü Eşleştir', aciklama: 'Hazırlama ve stok düşümü için pazaryeri kodunu katalog ürününe bağlayın.', tur: 'uyari', sekme: 'islemler', odak: 'eslestir' };
    } else if (stok.durum === 'eksik') {
      islemBekliyorMu = true;
      birincilIslem = { kod: 'stok-coz', etiket: 'Stok Açığını Tamamla', aciklama: 'Depo stoğunu düzeltip siparişin eksik stoğunu tamamlayın.', tur: 'uyari', sekme: 'islemler', odak: 'stok' };
    } else if (iadeBekleyenSayi > 0) {
      islemBekliyorMu = true;
      birincilIslem = { kod: 'iade-kontrol', etiket: 'İade Kontrolü Yap', aciklama: 'İade gelen ürünün satılabilir olup olmadığını onaylayın.', tur: 'uyari', sekme: 'islemler', odak: 'iade' };
    } else if (s.durum === 'bolundu' || s.durum === 'bilinmiyor') {
      islemBekliyorMu = true;
      birincilIslem = { kod: 'kanal-kontrol', etiket: 'Kanal Durumunu Kontrol Et', aciklama: `${KANALLAR[s.kanal]} satıcı panelinden paket durumunu kontrol edin.`, tur: 'uyari', sekme: 'islemler', odak: 'kanal' };
    } else if (asama === 'hazirlanacak') {
      islemBekliyorMu = true;
      birincilIslem = s.kanal === 'trendyol'
        ? { kod: 'ty-toplama', etiket: 'Toplamaya Başla', aciklama: 'Trendyol’a “toplanıyor” bildirir; müşteri iptali kapanır ve kargo barkodu oluşur.', tur: 'birincil', sekme: 'islemler', odak: 'kanal' }
        : { kod: 'hb-paketle', etiket: 'Kargoya Hazırla (Paketle)', aciklama: 'Hepsiburada’da paketi oluşturur ve kargo barkodu üretir.', tur: 'birincil', sekme: 'islemler', odak: 'kanal' };
    } else if (asama === 'hazirlaniyor') {
      islemBekliyorMu = true;
      birincilIslem = fatura.asama === 'kesilecek'
        ? { kod: 'fatura-kes', etiket: 'Faturayı Kes (1/3)', aciklama: 'Kargo barkodu oluşurken GİB faturasını kesip kaydedin.', tur: 'birincil', sekme: 'islemler', odak: 'fatura' }
        : { kod: 'etiket-yazdir', etiket: 'Kargo Barkodunu Kontrol Et', aciklama: 'Kargo takip numarası oluştuğunda etiketi yazdırıp kargoya verin.', tur: 'birincil', sekme: 'islemler', odak: 'kanal' };
    } else if (asama === 'kargoya-hazir') {
      islemBekliyorMu = true;
      birincilIslem = fatura.asama === 'kesilecek'
        ? { kod: 'etiket-ve-fatura', etiket: 'Etiket Yazdır & Fatura Kes', aciklama: 'Kargo barkodunu yazdırın ve GİB faturasını kaydedip kanala iletin.', tur: 'birincil', sekme: 'islemler', odak: 'kanal' }
        : { kod: 'etiket-yazdir', etiket: 'Kargo Etiketini Yazdır', aciklama: 'Etiketi kolinin dışına yapıştırıp kargo görevlisine teslim edin.', tur: 'birincil', sekme: 'islemler', odak: 'kanal' };
    } else if (fatura.asama === 'kesilecek') {
      islemBekliyorMu = true;
      birincilIslem = { kod: 'fatura-kes', etiket: 'Faturayı Kes (1/3)', aciklama: 'Sipariş gönderildi/teslim edildi ancak faturası henüz kaydedilmedi.', tur: 'uyari', sekme: 'islemler', odak: 'fatura' };
    } else if (fatura.asama === 'kaydedildi') {
      islemBekliyorMu = true;
      birincilIslem = {
        kod: 'fatura-ilet',
        etiket: fatura.hataMesaji ? 'Fatura İletimini Tekrarla (2/3)' : `Faturayı ${KANALLAR[s.kanal]}’a İlet (2/3)`,
        aciklama: fatura.hataMesaji ?? `Faturayı ${KANALLAR[s.kanal]}’a iletin veya satıcı panelinden yüklediyseniz işaretleyin.`,
        tur: fatura.hataMesaji ? 'uyari' : 'birincil',
        sekme: 'islemler',
        odak: 'fatura',
      };
    } else {
      birincilIslem = {
        kod: asama === 'yeni' ? 'incele' : 'tamam',
        etiket: asama === 'yeni' ? 'Onay Bekleniyor' : 'Detayı Gör',
        aciklama: asama === 'yeni' ? `${KANALLAR[s.kanal]} ödeme onayı bekleniyor; şu an satıcı işlemi gerekmez.` : 'Sipariş, teslimat ve fatura süreci tamamlandı.',
        tur: 'ikincil',
        sekme: 'islemler',
      };
    }

    const kontrolGerekli = !testSiparisi && (
      stok.durum === 'eslesmeyen'
      || stok.durum === 'eksik'
      || iadeBekleyenSayi > 0
      || kargoGecikti
      || s.durum === 'bolundu'
      || s.durum === 'bilinmiyor'
      || fatura.hataMesaji !== undefined
    );

    const kalemler: SiparisKalemGorunumu[] = s.kalemler.map((k) => {
      const u = k.urunId ? urunHaritasi.get(k.urunId) : undefined;
      return {
        anahtar: k.anahtar,
        ad: u ? `${u.marka} ${u.kisaAd}` : k.ad,
        adet: k.adet,
        birimKurus: Math.round(k.tutar / Math.max(1, k.adet)),
        toplamKurus: k.tutar,
        gorsel: u?.gorseller[0]?.src,
        sku: k.stokKodu ?? u?.sku,
        barkod: k.barkod,
        urunId: k.urunId,
        eslesmeyen: !s.stokDisi && STOK_AKTIF.has(k.durum) && (!k.urunId || (k.stok === 'yok' && !u)),
        eksikStok: s.stokDisi ? 0 : (k.eksik ?? 0),
        iadeBekliyor: !s.stokDisi && kalemIadeBekliyor(k),
        durumAdi: PY_DURUM_ADLARI[k.durum],
      };
    });

    const ilkKalem = kalemler[0];
    const kalemOzeti = ilkKalem
      ? `${ilkKalem.adet}× ${ilkKalem.ad}${kalemler.length > 1 ? ` +${kalemler.length - 1} çeşit` : ''}`
      : '—';
    const zamanMs = Date.parse(s.tarih) || 0;
    const oncelikPuani = testSiparisi ? 0
      : (stok.durum === 'eslesmeyen' || stok.durum === 'eksik' || kargoGecikti ? 95 : 0)
        + (kalanSaat !== undefined && kalanSaat <= 24 ? 75 : 0)
        + (asama === 'hazirlanacak' || asama === 'hazirlaniyor' || asama === 'kargoya-hazir' ? 60 : 0)
        + (iadeBekleyenSayi > 0 ? 55 : 0)
        + (fatura.asama === 'kesilecek' || fatura.asama === 'kaydedildi' ? 40 : 0);

    sonuc.push({
      anahtar,
      kanal: s.kanal,
      kanalAdi: KANALLAR[s.kanal],
      no: s.siparisNo,
      paketNo: s.paketNo,
      tarih: s.tarih,
      zamanMs,
      musteriAdi: s.musteri || `${KANALLAR[s.kanal]} Müşterisi`,
      eposta: s.fatura?.eposta,
      konum: [s.ilce, s.il].filter(Boolean).join(' / '),
      adres: s.fatura?.adres,
      kalemOzeti,
      ilkGorsel: kalemler.find((k) => k.gorsel)?.gorsel,
      toplamAdet: s.kalemler.reduce((t, k) => t + k.adet, 0),
      tutarKurus: satisMi(s) ? satisTutari(s) : s.toplam,
      detayHref: '/yonetim/siparisler/pazaryeri/' + encodeURIComponent(s.id),
      paketleHref: !testSiparisi && ['hazirlanacak', 'hazirlaniyor', 'kargoya-hazir'].includes(asama) && stok.durum !== 'eslesmeyen' && stok.durum !== 'eksik'
        ? '/yonetim/siparisler/hazirlik/paketle?id=' + encodeURIComponent(s.id)
        : undefined,
      asama,
      asamaEtiketi: ASAMA_ADLARI[asama],
      asamaRenk: ASAMA_RENKLERI[asama],
      hamDurumAdi: `${PY_DURUM_ADLARI[s.durum]}${toplamaBildirildi && s.hamDurum === 'Created' ? ' (Toplanıyor bildirildi)' : ''}`,
      adimlar: ilerlemeAdimlariOlustur(asama),
      odeme,
      stok,
      fatura,
      kargo,
      iade,
      entegrasyon,
      kazanc: pazaryeriKazancHesapla(s, magaza, finans, envanter, kdvBul, testSiparisi),
      kalemler,
      eksikIsler,
      uyarilar,
      birincilIslem,
      islemBekliyorMu,
      kontrolGerekli,
      oncelikPuani,
      aramaMetni: [s.siparisNo, s.paketNo, s.musteri, s.il, s.ilce, s.kargoTakip, s.kargoFirma, ...s.kalemler.map((k) => `${k.ad} ${k.barkod ?? ''} ${k.stokKodu ?? ''}`)].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR'),
      py: s,
      belgeler: [],
    });
  }

  return sonuc.sort((a, b) => b.zamanMs - a.zamanMs);
}

/** Sekme sayıları ve filtreleme için tek yardımcı */
export function siparisSekmeyeUyar(s: SiparisMerkeziKaydi, sekme: SiparisSekmesi): boolean {
  switch (sekme) {
    case 'islem':
      return s.islemBekliyorMu;
    case 'hazirlanacak':
      return !s.entegrasyon.testSiparisi && s.asama === 'hazirlanacak';
    case 'hazirlaniyor':
      return !s.entegrasyon.testSiparisi && s.asama === 'hazirlaniyor';
    case 'kargoya-hazir':
      return !s.entegrasyon.testSiparisi && s.asama === 'kargoya-hazir';
    case 'kargoda':
      return !s.entegrasyon.testSiparisi && s.asama === 'kargoda';
    case 'tamamlandi':
      return !s.entegrasyon.testSiparisi && s.asama === 'tamamlandi';
    case 'kontrol':
      return s.kontrolGerekli;
    case 'odeme-bekleyen':
      return s.asama === 'yeni' || s.odeme.durum === 'bekliyor' || s.odeme.durum === 'gecikti';
    case 'faturasiz':
      return s.fatura.asama === 'kesilecek' || s.fatura.asama === 'kaydedildi';
    case 'iptal':
      return s.asama === 'iptal-iade';
    case 'tumu':
      return true;
  }
}
