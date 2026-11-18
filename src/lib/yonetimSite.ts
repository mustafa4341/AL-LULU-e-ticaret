import { ciftler, evet, liste, metin, satirlar, sayi } from './form';
import { takipBaglantisi } from './kargoTakip';
import { BOLUMLER, type Magaza } from './sema';

export const SITE_SEKMELERI: [string, string][] = [
  ['anasayfa', 'Ana Sayfa'], ['duyuru', 'Duyurular'], ['kargo', 'Kargo & Teslimat'],
  ['iletisim', 'WhatsApp & İletişim'], ['sss', 'Sık Sorulan Sorular'], ['tadilat', 'Bakım Modu'],
];

export function siteFormu(f: FormData, m: Magaza, bolumler: string[], onizleme = false) {
  const s = m.site;
  const a = m.anaSayfa;
  if (bolumler.includes('iletisim')) {
    const d = metin(f, 'telefon').replace(/\D/g, '').replace(/^90(?=\d{10}$)|^0(?=\d{10}$)/, '');
    const url = URL.parse(metin(f, 'url'));
    if (!onizleme && d.length !== 10) throw new Error('Telefon numarası alan koduyla birlikte 10 haneli olmalı.');
    if (!onizleme && !['https:', 'http:'].includes(url?.protocol ?? '')) throw new Error('Geçerli bir site adresi yazın.');
    if (d.length === 10) Object.assign(s, {
      telefon: '+90' + d, whatsapp: '90' + d,
      telefonGorunen: '0' + [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8)].join(' '),
    });
    Object.assign(s, {
      ad: metin(f, 'ad'), slogan: metin(f, 'slogan'), eposta: metin(f, 'eposta'),
      calismaSaatleri: metin(f, 'calismaSaatleri'),
    });
    if (url && ['https:', 'http:'].includes(url.protocol)) s.url = metin(f, 'url');
  }
  if (bolumler.includes('duyuru')) {
    s.duyurular = satirlar(f, 'duyurular');
    s.indirimReferansGun = sayi(f, 'indirimReferansGun', 30);
    s.cokSatanEsik = sayi(f, 'cokSatanEsik', 10);
    s.fiyatSunumu = (['sade', 'kampanya', 'dengeli'] as const).find((x) => x === metin(f, 'fiyatSunumu')) ?? 'dengeli';
    const taksit = sayi(f, 'taksit');
    s.taksit = { pesinFiyatinaTaksit: taksit >= 2 ? taksit : null, genelMetin: metin(f, 'taksitMetin') };
  }
  if (bolumler.includes('kargo')) {
    const url = metin(f, 'takipUrl');
    const min = sayi(f, 'teslimMin', 1);
    const max = sayi(f, 'teslimMax', 3);
    if (!onizleme && (!metin(f, 'kargoFirma') || !takipBaglantisi(url, '123456789'))) {
      throw new Error('Kargo firması ve {kod} içeren bir HTTPS takip bağlantısı girin.');
    }
    if (!onizleme && min > max) throw new Error('En kısa teslim süresi en uzun süreden büyük olamaz.');
    s.kargo = {
      firma: metin(f, 'kargoFirma'), takipUrl: url,
      ucret: sayi(f, 'kargoUcret'), ucretsizEsik: sayi(f, 'kargoEsik'),
      kesimSaati: sayi(f, 'kesimSaati', 14), teslimGun: [min, max],
    };
  }
  if (bolumler.includes('anasayfa')) {
    const sira = liste(f, 'bolum_sira').map(Number);
    const acik = new Set(liste(f, 'bolum'));
    const kodlar = liste(f, 'bolum_kod');
    a.bolumler = BOLUMLER.filter((b) => acik.has(b))
      .sort((x, y) => (sira[kodlar.indexOf(x)] ?? 0) - (sira[kodlar.indexOf(y)] ?? 0));
    const urunId = metin(f, 'heroUrun');
    if (!onizleme && a.bolumler.includes('hero') && urunId !== a.hero.urunId &&
      !m.urunler.some((u) => u.id === urunId && u.durum === 'yayinda')) {
      throw new Error('Ana sayfa vitrini için yayında olan bir ürün seçin.');
    }
    a.hero = {
      urunId, ustBaslik: metin(f, 'heroUst'), baslik: metin(f, 'heroBaslik'),
      altBaslik: metin(f, 'heroAlt'), maddeler: satirlar(f, 'heroMaddeler').slice(0, 3),
    };
    a.oneCikanlarBaslik = metin(f, 'oneCikanlarBaslik');
    a.setlerBaslik = metin(f, 'setlerBaslik');
  }
  if (bolumler.includes('sss')) {
    a.sss = ciftler(f, 'sss_soru', 'sss_cevap').map(([soru, cevap]) => ({ soru, cevap }));
  }
  if (bolumler.includes('tadilat')) {
    Object.assign(s.tadilat, {
      baslik: metin(f, 'tadilat_baslik') || 'Sitemiz kısa süreliğine bakımda',
      aciklama: metin(f, 'tadilat_aciklama') || 'Sizlere daha iyi hizmet verebilmek için mağazamızı güncelliyoruz.',
      tahminiSure: metin(f, 'tadilat_sure'), whatsappGoster: evet(f, 'tadilat_wa'), siparisTakipAcik: evet(f, 'tadilat_takip'),
    });
  }
}
export const bosYasalBilgi = (v: string) => !v.trim() || /^\[.*\]$/.test(v.trim()) || /^[—-]+$/.test(v.trim());
