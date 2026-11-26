import type { APIRoute } from 'astro';
import { siparisleriOku } from '../../../lib/depo';
import { GIDER_KATEGORILERI, donem, finansPara, kalanTutar, raporla, type Gider } from '../../../lib/finans';
import { ARSIV_SINIRI, ekDosyasiOku, ekUzantisi, finansOku, saticiBilgisi } from '../../../lib/finansDepo';
import { aylar, csvYaniti, dosyaYaniti, muhasebeTablolari, xlsxOlustur } from '../../../lib/finansDisari';
import { zipOlustur } from '../../../lib/finansArsiv';
import { A4, donemOzetiSvg, type OzetSatiri } from '../../../lib/belgeSablon';
import { logoDataUri, svgdenPdf } from '../../../lib/finansPdf';
import { TRENDYOL_BASLIK } from '../../../lib/trendyolDosya';
import { pazaryeriSiparisleriOku } from '../../../lib/pazaryeriDepo';

const gun = (s: string) => s.split('-').reverse().join('.');

export const GET: APIRoute = async ({ url }) => {
  const tur = url.searchParams.get('tur');
  if (tur === 'sablon') return csvYaniti([TRENDYOL_BASLIK], 'trendyol-hakedis-sablonu');
  const { bas, son } = donem(url.searchParams);
  const [f, siparisler, pazaryeri] = await Promise.all([
    finansOku(),
    siparisleriOku(),
    pazaryeriSiparisleriOku().catch(() => []),
  ]);
  const r = raporla(f, siparisler, bas, son, pazaryeri);
  const ad = bas + '_' + son;
  if (tur === 'pdf') {
    const kalan = kalanTutar(r);
    const satirlar: OzetSatiri[] = [
      { ad: 'Satışlar', tur: 'baslik' },
      { ad: 'Onaylı web satışları (' + r.satislar.length + ' sipariş)', tutar: finansPara(r.webSatis) },
      // Ödenmemiş (geri ödemesiz) iptaller iade sayısına katılmaz (denetim AUD-024)
      { ad: 'İade ve iptal geri ödemeleri (' + r.iadeler.filter((x) => x.tutar > 0).length + ' kayıt)', tutar: '−' + finansPara(r.webIade) },
      { ad: 'Net web satışı', tutar: finansPara(r.webSatis - r.webIade), tur: 'ara' },
      { ad: 'Satışa dahil kargo tahsilatı', tutar: finansPara(r.kargo), tur: 'alt' },
      { ad: 'Fiyatlara yansıyan indirimler', tutar: finansPara(r.webIndirim), tur: 'alt' },
      ...(r.trendyol.length ? [{ ad: 'Trendyol beklenen hakediş (' + r.trendyol.length + ' kayıt)', tutar: finansPara(r.trendyolBeklenen) } as OzetSatiri] : []),
      ...(r.hepsiburada.length ? [{ ad: 'Hepsiburada hakediş (' + r.hepsiburada.length + ' kayıt)', tutar: finansPara(r.hepsiburadaBeklenen) } as OzetSatiri] : []),
      { ad: 'Giderler', tur: 'baslik' },
      ...Object.entries(r.kategori).filter(([, n]) => n > 0).map(([id, n]) => ({ ad: GIDER_KATEGORILERI[id as Gider['kategori']], tutar: '−' + finansPara(n), tur: 'alt' }) as OzetSatiri),
      ...(r.otoUrunMaliyeti > 0 ? [{ ad: 'Satılan ürün alış maliyeti (kayıtlı birim maliyetlerden)', tutar: '−' + finansPara(r.otoUrunMaliyeti), tur: 'alt' } as OzetSatiri] : []),
      { ad: 'Toplam gider (' + r.giderler.length + ' kayıt)', tutar: '−' + finansPara(r.gider + r.otoUrunMaliyeti), tur: 'ara' },
      { ad: 'Kalan (tahmini)', tutar: finansPara(kalan), tur: 'sonuc' },
    ];
    const ayTablosu = aylar(bas, son);
    const svgler = donemOzetiSvg({
      baslik: 'Satış ve Gider Özeti', donem: gun(bas) + ' – ' + gun(son), olusturma: new Date(),
      logo: f.ayarlar.logo ? await logoDataUri() : '', satici: await saticiBilgisi(), satirlar,
      tablo: ayTablosu.length > 1 ? {
        // Kalan pazaryeri hakedişini de içerdiği için ayrı sütunda görünür: Satış − İade + Pazaryeri − Gider = Kalan (denetim AUD-024)
        baslik: 'Aylara göre', kolonlar: ['Ay', 'Web satış', 'İade', 'Pazaryeri', 'Gider + Maliyet', 'Kalan'],
        satirlar: ayTablosu.map((a) => {
          const x = raporla(f, siparisler, a.bas, a.son, pazaryeri);
          return [a.ad, finansPara(x.webSatis), finansPara(x.webIade), finansPara(x.trendyolBeklenen + x.hepsiburadaBeklenen), finansPara(x.gider + x.otoUrunMaliyeti), finansPara(kalanTutar(x))];
        }),
      } : undefined,
      notlar: [
        ...(r.tahmini === undefined ? ['Dikkat: Bu dönem için “Ürün alış maliyeti” eksik; kalan tutar tüm ürün maliyetleri düşülmeden hesaplanmıştır.'] : []),
        'Satışlar ödeme tarihine, iade ve iptaller geri ödeme tarihine göre sayılır. Tutarlara KDV dahildir; KDV, banka tahsilatı ve muhasebe kârı ayrıca hesaplanır.',
        'Ayrıntılı listeler için Finans & Belgeler > Raporlar > Excel indir.',
      ],
    });
    return dosyaYaniti(await svgdenPdf(svgler, A4.w, A4.h, 150), 'application/pdf', 'finans-ozeti-' + ad + '.pdf');
  }
  const tablolar = muhasebeTablolari(f, siparisler, bas, son, pazaryeri);
  if (tur === 'excel') return dosyaYaniti(xlsxOlustur(tablolar), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'muhasebe-' + ad + '.xlsx');
  if (tur === 'zip') {
    const dosyalar: { ad: string; veri: Buffer }[] = [];
    let boyut = 0;
    const sinirMb = Math.round(ARSIV_SINIRI / 1048576);
    const asildi = () => new Response(`Arşiv ${sinirMb} MB sınırını aştı. Tarih aralığını daraltın (ör. tek ay).`, { status: 413 });
    const temiz = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');
    // Resmî satış faturaları (GİB e-Arşiv'den kesilip yüklenenler) — eskiden muhasebeci arşivinde hiç yoktu (denetim AUD-021)
    for (const k of f.faturalar.filter((x) => x.ek && x.tarih >= bas && x.tarih <= son)) {
      const veri = await ekDosyasiOku('fatura', k.id);
      if (!veri) continue;
      dosyalar.push({ ad: 'faturalar/' + temiz(`${k.tarih}_${k.no}_${k.kanal}_${k.siparisNo}${k.iptal ? '_IPTAL' : ''}`) + '.' + ekUzantisi(k.ek!.tur), veri });
      if ((boyut += veri.length) > ARSIV_SINIRI) return asildi();
    }
    for (const b of r.belge.filter((x) => ['duzenlendi', 'gonderildi', 'iptal'].includes(x.durum))) {
      const veri = await ekDosyasiOku('belge', b.id);
      if (!veri) continue;
      dosyalar.push({ ad: 'siparis-belgeleri/' + temiz((b.belgeNo ?? b.tur) + '_' + b.siparisNo + (b.durum === 'iptal' ? '_IPTAL' : '')) + '.pdf', veri });
      if ((boyut += veri.length) > ARSIV_SINIRI) return asildi();
    }
    for (const g of r.giderler.filter((x) => x.ek)) {
      const veri = await ekDosyasiOku('gider', g.id);
      if (!veri) continue;
      dosyalar.push({ ad: 'gider-fisleri/' + g.tarih + '_' + g.kategori + '_' + g.id.slice(0, 8) + '.' + ekUzantisi(g.ek!.tur), veri });
      if ((boyut += veri.length) > ARSIV_SINIRI) return asildi();
    }
    // Arşivin içine Excel özeti de konur: muhasebeci tek dosyayla her şeyi alır
    dosyalar.push({ ad: 'muhasebe-' + ad + '.xlsx', veri: xlsxOlustur(tablolar) });
    return dosyaYaniti(zipOlustur(dosyalar), 'application/zip', 'muhasebe-arsivi-' + ad + '.zip');
  }
  const secim = tablolar.find((t) => t.kod === tur);
  return secim ? csvYaniti(secim.satirlar, secim.kod + '-' + ad) : new Response('Rapor bulunamadı.', { status: 404 });
};
