/**
 * Sipariş yolculuğu: siparişin alındığı andan teslimata kadar her adım ayrı ayrı (24.11.2026).
 * Web ve pazaryeri siparişleri için aynı biçim. Adımlar kayıtlardan HESAPLANIR (ayrı bir durum tutulmaz):
 * sipariş geçmişi, stok kalemleri, fatura kaydı ve kargo bilgisi. Böylece hiçbir adım kayıtla çelişmez.
 */
import { KANALLAR, STOK_AKTIF, kalemIadeBekliyor, type PazaryeriSiparisi, type PyDurum } from './pazaryeri';
import type { FaturaKaydi } from './finans';
import { iadeEdildi } from './siparisAkisi';
import type { Siparis, SiparisDurumu } from './sema';

export type AdimDurumu = 'tamam' | 'simdi' | 'bekliyor' | 'sorun' | 'atlandi';
export type SiparisAdimi = {
  ad: string;
  durum: AdimDurumu;
  tarih?: string;
  aciklama?: string;
  eylem?: { etiket: string; href: string };
};
export type SiparisYolculugu = {
  adimlar: SiparisAdimi[];
  /** İptal / iade gibi akışı kapatan durum (adımların sonunda ayrı gösterilir) */
  kapanis?: { ad: string; aciklama?: string; renk: 'gri' | 'kirmizi' | 'turuncu' };
  /** Tamamlanan adım sayısı / toplam (atlananlar hariç) */
  ilerleme: { tamam: number; toplam: number };
};

/** İlk "bekliyor" adımı "sırada" yapar ve ilerlemeyi sayar */
function sonlandir(adimlar: SiparisAdimi[], kapanis?: SiparisYolculugu['kapanis']): SiparisYolculugu {
  if (!kapanis) {
    const sira = adimlar.find((a) => a.durum === 'bekliyor' || a.durum === 'sorun');
    if (sira?.durum === 'bekliyor') sira.durum = 'simdi';
  }
  const sayilan = adimlar.filter((a) => a.durum !== 'atlandi');
  return { adimlar, kapanis, ilerleme: { tamam: sayilan.filter((a) => a.durum === 'tamam').length, toplam: sayilan.length } };
}

function faturaAdimlari(fatura: FaturaKaydi | undefined, gonderildi: boolean, faturaAdresi: string, kanalAdi: string, hb: boolean): SiparisAdimi[] {
  const kesim: SiparisAdimi = fatura
    ? { ad: 'Fatura kesildi', durum: 'tamam', tarih: fatura.olusturma, aciklama: `${fatura.no} · ${fatura.tarih}` }
    : { ad: 'Fatura kesildi', durum: gonderildi ? 'sorun' : 'bekliyor',
        aciklama: gonderildi ? 'Ürün yola çıktı ama fatura henüz kaydedilmedi (GİB e-Arşiv).' : 'GİB e-Arşiv Portalı’nda kesip panele kaydedin.',
        eylem: { etiket: 'Faturayı hazırla / kaydet', href: faturaAdresi } };
  let iletim: SiparisAdimi;
  if (!fatura) iletim = { ad: hb ? 'Fatura Hepsiburada’ya yüklendi' : `Fatura ${kanalAdi === 'Web sitesi' ? 'müşteriye' : kanalAdi + '’a'} iletildi`, durum: 'bekliyor', aciklama: 'Fatura kaydedilince otomatik denenir.' };
  else {
    const ad = hb ? 'Fatura Hepsiburada’ya yüklendi' : `Fatura ${kanalAdi === 'Web sitesi' ? 'müşteriye' : kanalAdi + '’a'} iletildi`;
    const d = fatura.iletim.durum;
    iletim = d === 'gonderildi' || d === 'elle' ? { ad, durum: 'tamam', tarih: fatura.iletim.tarih, aciklama: fatura.iletim.mesaj }
      : d === 'yok' ? { ad, durum: 'atlandi', aciklama: 'Bu fatura için iletim gerekmiyor.' }
      : d === 'hata' ? { ad, durum: 'sorun', aciklama: fatura.iletim.mesaj ?? 'İletim başarısız; otomatik tekrar denenir.', eylem: { etiket: 'Faturayı aç', href: faturaAdresi } }
      : { ad, durum: 'bekliyor', aciklama: hb ? 'PDF’i Hepsiburada satıcı paneline yükleyip “Yükledim” deyin.' : 'Otomatik gönderim sırada (30 dakikada bir denenir).', eylem: { etiket: hb ? 'Yükledim olarak işaretle' : 'Faturayı aç', href: faturaAdresi } };
  }
  return [kesim, iletim];
}

/* ---------------- Pazaryeri (Trendyol / Hepsiburada) ---------------- */

const PY_SIRA: PyDurum[] = ['onay-bekliyor', 'yeni', 'hazirlaniyor', 'kargoda', 'teslim-edildi'];

export function pazaryeriYolculugu(s: PazaryeriSiparisi, fatura: FaturaKaydi | undefined, faturaAdresi: string): SiparisYolculugu {
  const ilk = (d: PyDurum) => s.gecmis.find((g) => g.durum === d)?.tarih;
  const asama = PY_SIRA.indexOf(s.durum);
  const gecti = (d: PyDurum) => asama >= PY_SIRA.indexOf(d);
  const ty = s.kanal === 'trendyol';
  const kanalAdi = KANALLAR[s.kanal];
  const adimlar: SiparisAdimi[] = [];

  adimlar.push({ ad: 'Sipariş alındı', durum: 'tamam', tarih: s.tarih, aciklama: `${kanalAdi} · ${s.kaynak === 'api' ? 'otomatik aktarıldı' : 'dosyadan yüklendi'}` });
  if (s.durum === 'onay-bekliyor') adimlar.push({ ad: 'Ödeme onayı', durum: 'bekliyor', aciklama: `${kanalAdi} ödemeyi onaylayınca sipariş hazırlanacaklara düşer. Stok şimdiden ayrıldı.` });

  // Stok
  const aktif = s.kalemler.filter((k) => STOK_AKTIF.has(k.durum));
  const eslesmeyen = aktif.filter((k) => !k.urunId).length;
  const eksik = aktif.reduce((t, k) => t + k.eksik, 0);
  const dusulen = s.kalemler.reduce((t, k) => t + k.dusulen, 0);
  const eslesmeNotu = s.gecmis.find((g) => g.not?.includes('eşleştirildi'))?.tarih;
  if (s.stokDisi) adimlar.push({ ad: 'Stok ayrıldı', durum: 'atlandi', aciklama: 'Stok takibi başlamadan önceki sipariş; stoğa dokunulmadı.' });
  else if (eslesmeyen) adimlar.push({ ad: 'Ürün eşleşti, stok ayrıldı', durum: 'sorun', aciklama: `${eslesmeyen} ürün sitedeki bir ürünle eşleşmedi; stok henüz düşmedi.`, eylem: { etiket: 'Ürünü eşleştir', href: '#urunler' } });
  else if (eksik) adimlar.push({ ad: 'Ürün eşleşti, stok ayrıldı', durum: 'sorun', aciklama: `${eksik} adet stok açığı var (depoda yetmedi).`, eylem: { etiket: 'Stoğu kontrol et', href: '#urunler' } });
  else adimlar.push({ ad: 'Ürün eşleşti, stok ayrıldı', durum: aktif.length || dusulen ? 'tamam' : 'atlandi', tarih: eslesmeNotu ?? s.ilkAktarim, aciklama: dusulen ? `${dusulen} adet ortak stoktan düştü; diğer kanallara yansıtıldı.` : undefined });

  // Hazırlık (panelden/otomatik bildirim geçmişe yazılır; kanal onayı birkaç dakika sonra gelir)
  const toplamaNotu = s.gecmis.find((g) => g.not?.includes('“toplanıyor” bildirildi'))?.tarih;
  const hazir = gecti('hazirlaniyor') || ['Picking', 'Invoiced', 'Shipped', 'Delivered'].includes(s.hamDurum) || !!toplamaNotu;
  adimlar.push(hazir
    ? { ad: ty ? 'Hazırlamaya alındı (toplanıyor)' : 'Paketlendi', durum: 'tamam', tarih: toplamaNotu ?? ilk('hazirlaniyor') ?? ilk('kargoda'), aciklama: ty ? 'Trendyol’a “toplanıyor” bildirildi; müşteri artık iptal edemez.' : undefined }
    : { ad: ty ? 'Hazırlamaya alındı (toplanıyor)' : 'Paketlendi', durum: 'bekliyor',
        aciklama: s.sonKargoTarihi ? `Son kargolama: ${new Date(s.sonKargoTarihi).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' })}` : undefined,
        eylem: ty ? { etiket: 'Toplamaya başla', href: '#trendyol-islem' } : { etiket: 'Hepsiburada panelinde paketle', href: '#hepsiburada-islem' } });

  // Fatura
  adimlar.push(...faturaAdimlari(fatura, gecti('kargoda'), faturaAdresi, kanalAdi, s.kanal === 'hepsiburada'));

  // Kargo
  adimlar.push(s.kargoTakip
    ? { ad: 'Kargo kodu / etiket hazır', durum: 'tamam', aciklama: [s.kargoFirma, s.kargoTakip].filter(Boolean).join(' · '), eylem: ty && !gecti('kargoda') ? { etiket: 'Etiketi yazdır', href: '#trendyol-islem' } : undefined }
    : { ad: 'Kargo kodu / etiket hazır', durum: 'bekliyor', aciklama: ty ? 'Toplama bildirilince Trendyol kargo kodunu verir.' : 'Kargo bilgisi kanaldan gelir.' });
  adimlar.push(gecti('kargoda')
    ? { ad: 'Kargoya verildi', durum: 'tamam', tarih: ilk('kargoda'), aciklama: s.kargoFirma }
    : { ad: 'Kargoya verildi', durum: 'bekliyor', aciklama: 'Paket kargo firmasına teslim edilince kanal bildirir.' });
  adimlar.push(gecti('teslim-edildi')
    ? { ad: 'Teslim edildi', durum: 'tamam', tarih: ilk('teslim-edildi') }
    : { ad: 'Teslim edildi', durum: 'bekliyor' });

  let kapanis: SiparisYolculugu['kapanis'];
  if (s.durum === 'iptal' || s.durum === 'bolundu') {
    const geri = s.kalemler.some((k) => k.stok === 'geri-alindi');
    kapanis = { ad: s.durum === 'iptal' ? 'Sipariş iptal edildi' : 'Paket bölündü (yeni paket ayrı listelenir)', renk: 'gri',
      aciklama: s.durum === 'iptal' ? (geri ? 'Düşülen stok ortak stoğa geri eklendi.' : 'Stoğa etkisi yok.') : undefined };
    for (const a of adimlar) if (a.durum !== 'tamam') a.durum = 'atlandi';
  } else if (s.durum === 'iade' || s.durum === 'teslim-edilemedi') {
    const bekliyor = s.kalemler.some(kalemIadeBekliyor);
    kapanis = { ad: s.durum === 'iade' ? 'İade' : 'Teslim edilemedi', renk: bekliyor ? 'turuncu' : 'gri',
      aciklama: bekliyor ? 'Ürün depoya ulaşınca kontrol edip “satılabilir / satılamaz” kararını girin (Ürünler ve stok kontrolü).'
        : s.kalemler.some((k) => k.stok === 'geri-alindi') ? 'Kontrol edildi; ürün ortak stoğa geri eklendi.' : 'Kontrol edildi.' };
    for (const a of adimlar) if (a.durum === 'bekliyor' || a.durum === 'simdi') a.durum = 'atlandi';
  }
  return sonlandir(adimlar, kapanis);
}

/* ---------------- Web sitesi ---------------- */

const WEB_SIRA: SiparisDurumu[] = ['odeme-bekliyor', 'odendi', 'hazirlaniyor', 'kargoda', 'teslim-edildi'];

export function webYolculugu(s: Siparis, fatura: FaturaKaydi | undefined, faturaAdresi: string): SiparisYolculugu {
  const ilk = (d: SiparisDurumu) => s.gecmis.find((g) => g.durum === d)?.tarih;
  const iptal = s.durum === 'iptal';
  const asama = WEB_SIRA.indexOf(s.durum);
  const gecti = (d: SiparisDurumu) => !iptal && asama >= WEB_SIRA.indexOf(d);
  const odendi = gecti('odendi') || (iptal && (s.paytr?.sonuc === 'odendi' || !!ilk('odendi')));
  const adimlar: SiparisAdimi[] = [
    { ad: 'Sipariş alındı', durum: 'tamam', tarih: s.tarih, aciklama: 'Web sitesi' },
    odendi
      ? { ad: 'Ödeme onaylandı', durum: 'tamam', tarih: ilk('odendi'), aciklama: s.paytr ? 'Kartla (PayTR)' : 'Havale / EFT' }
      : { ad: 'Ödeme onaylandı', durum: 'bekliyor', aciklama: s.paytr ? 'PayTR sonucu bekleniyor.' : 'Banka hesabını kontrol edip ödemeyi onaylayın.' },
    s.stokDusuldu
      ? { ad: 'Stok ayrıldı', durum: 'tamam', tarih: ilk('odendi'), aciklama: 'Ortak stoktan düştü; Trendyol/Hepsiburada stoğuna 5 dk içinde yansır.' }
      : s.paytr?.stokEksik ? { ad: 'Stok ayrıldı', durum: 'sorun', aciklama: 'Ödeme alındı ama stok ayrılamadı.' }
      : { ad: 'Stok ayrıldı', durum: 'bekliyor', aciklama: 'Ödeme onaylanınca otomatik ayrılır.' },
    gecti('hazirlaniyor')
      ? { ad: 'Hazırlanıyor', durum: 'tamam', tarih: ilk('hazirlaniyor') }
      : { ad: 'Hazırlanıyor', durum: 'bekliyor', eylem: odendi ? { etiket: 'Hazırlamaya al', href: '#kargo' } : undefined },
    ...faturaAdimlari(fatura, gecti('kargoda'), faturaAdresi, 'Web sitesi', false),
    gecti('kargoda')
      ? { ad: 'Kargoya verildi', durum: 'tamam', tarih: ilk('kargoda'), aciklama: [s.kargoFirma, s.kargoTakip].filter(Boolean).join(' · ') }
      : { ad: 'Kargoya verildi', durum: 'bekliyor', aciklama: 'Kargo takip numarasını girince müşteriye e-posta gider.', eylem: gecti('hazirlaniyor') ? { etiket: 'Takip no gir', href: '#kargo' } : undefined },
    gecti('teslim-edildi')
      ? { ad: 'Teslim edildi', durum: 'tamam', tarih: ilk('teslim-edildi') }
      : { ad: 'Teslim edildi', durum: 'bekliyor' },
  ];
  let kapanis: SiparisYolculugu['kapanis'];
  if (iptal) {
    kapanis = { ad: s.paytr?.sonuc === 'basarisiz' ? 'Ödeme tamamlanamadı' : 'Sipariş iptal edildi', renk: 'gri', aciklama: s.iptalNotu };
    for (const a of adimlar) if (a.durum !== 'tamam') a.durum = 'atlandi';
  } else if (iadeEdildi(s)) {
    kapanis = { ad: 'İade tamamlandı', renk: 'gri' };
  }
  return sonlandir(adimlar, kapanis);
}
