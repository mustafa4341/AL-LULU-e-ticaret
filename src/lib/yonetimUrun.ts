import { ciftler, evet, istegeBagli, liste, metin, satirlar, sayi } from './form';
import { DurumSema, IkonSema, type IkonAdi, type Urun } from './sema';

export const BOS_URUN: Urun = {
  id: '', durum: 'taslak', marka: '', ad: '', kisaAd: '', kategoriler: [], fiyat: 0, fiyatGecmisi: [], kampanya: null,
  sepetteIndirim: 0, firsat: null, stok: 0, maxAdet: 5, sku: '', gorseller: [], ozet: '', oneCikanBilgiler: [], rozetler: [],
  faydalar: [], pisirme: [], teknik: [], kutuIcerigi: [], sss: [], birlikteIyiGider: [], oneCikan: false, cokSatan: false, oncelik: 0, dogrula: [],
};

/** Ürün yayına alınmadan önce eksik olanlar (boşsa yayına alınabilir). */
export function yayinEksikleri(u: Urun): string[] {
  const eksik: string[] = [];
  if (!u.ad.trim()) eksik.push('ürün adı');
  // 1 TL = "fiyat henüz girilmedi" yer tutucusu (taslak ürünler için)
  if (!(u.fiyat > 1)) eksik.push('gerçek satış fiyatı');
  // "!" ile başlayan kontrol notları (Gelişmiş › Doğrulanacaklar) kapanmadan yayına alınmaz
  const acik = u.dogrula.filter((d) => d.trim().startsWith('!'));
  if (acik.length) eksik.push(`“!” ile işaretli ${acik.length} kontrol notu (Gelişmiş sekmesi › Doğrulanacaklar)`);
  if (!u.kategoriler.length) eksik.push('kategori');
  if (!u.gorseller.length) eksik.push('en az 1 fotoğraf');
  return eksik;
}

export function urunFormu(f: FormData, temel: Urun): Urun {
  const ikonlu = ciftler(f, 'bilgi_ikon', 'bilgi_metin').map(([ikon, metin]) => ({
    ikon: (IkonSema.safeParse(ikon).success ? ikon : 'kutu') as IkonAdi,
    metin,
  }));
  const d = DurumSema.safeParse(metin(f, 'durum'));
  return {
    ...temel,
    durum: d.success ? d.data : temel.durum,
    marka: metin(f, 'marka'), ad: metin(f, 'ad'), kisaAd: metin(f, 'kisaAd') || metin(f, 'ad'),
    kategoriler: liste(f, 'kategoriler'),
    sepetteIndirim: Math.min(50, Math.max(0, sayi(f, 'sepetteIndirim'))),
    stok: Math.max(0, sayi(f, 'stok')), maxAdet: Math.max(1, sayi(f, 'maxAdet', 5)), sku: metin(f, 'sku'),
    ozet: metin(f, 'ozet'), garanti: istegeBagli(f, 'garanti'), hediye: istegeBagli(f, 'hediye'),
    rozetler: satirlar(f, 'rozetler'), oneCikan: evet(f, 'oneCikan'), cokSatan: evet(f, 'cokSatan'), oncelik: sayi(f, 'oncelik'),
    oneCikanBilgiler: ikonlu.slice(0, 6),
    faydalar: (() => {
      const bas = liste(f, 'fayda_baslik'), met = liste(f, 'fayda_metin'), ik = liste(f, 'fayda_ikon'), kay = liste(f, 'fayda_kaynak');
      return bas.map((b, i) => ({
        baslik: b, metin: met[i] ?? '',
        ikon: (IkonSema.safeParse(ik[i]).success ? ik[i] : undefined) as IkonAdi | undefined,
        kaynak: kay[i] || undefined,
      })).filter((x) => x.baslik && x.metin);
    })(),
    pisirme: (() => {
      const y = liste(f, 'pis_yemek'), su = liste(f, 'pis_sure'), ka = liste(f, 'pis_kademe'), mi = liste(f, 'pis_miktar');
      return y.map((yemek, i) => ({ yemek, sure: su[i] ?? '', kademe: ka[i] || undefined, miktar: mi[i] || undefined })).filter((x) => x.yemek && x.sure);
    })(),
    pisirmeNotu: istegeBagli(f, 'pisirmeNotu'),
    teknik: ciftler(f, 'teknik_etiket', 'teknik_deger'),
    kutuIcerigi: satirlar(f, 'kutuIcerigi'),
    sss: ciftler(f, 'sss_soru', 'sss_cevap').map(([soru, cevap]) => ({ soru, cevap })),
    birlikteIyiGider: liste(f, 'birlikte'),
    dogrula: satirlar(f, 'dogrula'),
    firsat: evet(f, 'firsat') ? {
      etiket: istegeBagli(f, 'firsat_etiket'), bitis: istanbuldanISO(metin(f, 'firsat_bitis')),
      stil: (['firsat', 'flas', 'ozel'] as const).find((stil) => stil === metin(f, 'firsat_stil')),
    } : null,
  };
}

/** "2026-11-20T23:59" (Türkiye saati, UTC+3) → ISO */
function istanbuldanISO(v: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}:00+03:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
/** ISO → datetime-local değeri (Türkiye saati) */
export function istanbulaYerel(iso?: string): string {
  if (!iso) return '';
  const d = new Date(Date.parse(iso) + 3 * 3600_000);
  return d.toISOString().slice(0, 16);
}


export function urunGorselleri(f: FormData, temel: Urun, ekler: { src: string; alt: string }[]) {
  const src = liste(f, 'gorsel_src');
  const alt = liste(f, 'gorsel_alt');
  const sira = liste(f, 'gorsel_sira');
  const sil = new Set(liste(f, 'gorsel_sil'));
  const kayitli = new Set(temel.gorseller.map((g) => g.src));
  const ad = [metin(f, 'marka'), metin(f, 'ad')].filter(Boolean).join(' ');
  const gorseller = [
    ...src.map((yol, i) => ({ src: yol, alt: alt[i] || ad, sira: Number(sira[i]) || i + 1 }))
      .filter((g) => kayitli.has(g.src) && !sil.has(g.src))
      .sort((a, b) => a.sira - b.sira)
      .map(({ src, alt }) => ({ src, alt })),
    ...ekler,
  ];
  const ana = ekler[sayi(f, 'yeniAnaFoto') - 1];
  return ana ? [ana, ...gorseller.filter((g) => g !== ana)] : gorseller;
}
