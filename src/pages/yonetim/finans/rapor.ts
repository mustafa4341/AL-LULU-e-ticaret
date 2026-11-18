import type { APIRoute } from 'astro';
import { siparisleriOku } from '../../../lib/depo';
import { GIDER_KATEGORILERI, donem, finansPara, raporla, type Gider } from '../../../lib/finans';
import { belgeOku, finansOku, giderEki, saticiBilgisi } from '../../../lib/finansDepo';
import { aylar, csvYaniti, dosyaYaniti, muhasebeTablolari, xlsxOlustur } from '../../../lib/finansDisari';
import { zipOlustur } from '../../../lib/finansArsiv';
import { A4, donemOzetiSvg, type OzetSatiri } from '../../../lib/belgeSablon';
import { logoDataUri, svgdenPdf } from '../../../lib/finansPdf';
import { TRENDYOL_BASLIK } from '../../../lib/trendyolDosya';

const gun = (s: string) => s.split('-').reverse().join('.');

export const GET: APIRoute = async ({ url }) => {
  const tur = url.searchParams.get('tur');
  if (tur === 'sablon') return csvYaniti([TRENDYOL_BASLIK], 'trendyol-hakedis-sablonu');
  const { bas, son } = donem(url.searchParams);
  const [f, siparisler] = await Promise.all([finansOku(), siparisleriOku()]);
  const r = raporla(f, siparisler, bas, son);
  const ad = bas + '_' + son;
  if (tur === 'pdf') {
    const kalan = r.webSatis - r.webIade + r.trendyolBeklenen - r.gider;
    const satirlar: OzetSatiri[] = [
      { ad: 'Satışlar', tur: 'baslik' },
      { ad: 'Onaylı web satışları (' + r.satislar.length + ' sipariş)', tutar: finansPara(r.webSatis) },
      { ad: 'İade ve iptal geri ödemeleri (' + r.iadeler.length + ' kayıt)', tutar: '−' + finansPara(r.webIade) },
      { ad: 'Net web satışı', tutar: finansPara(r.webSatis - r.webIade), tur: 'ara' },
      { ad: 'Satışa dahil kargo tahsilatı', tutar: finansPara(r.kargo), tur: 'alt' },
      { ad: 'Fiyatlara yansıyan indirimler', tutar: finansPara(r.webIndirim), tur: 'alt' },
      ...(r.trendyol.length ? [{ ad: 'Trendyol beklenen hakediş (' + r.trendyol.length + ' kayıt)', tutar: finansPara(r.trendyolBeklenen) } as OzetSatiri] : []),
      { ad: 'Giderler', tur: 'baslik' },
      ...Object.entries(r.kategori).filter(([, n]) => n > 0).map(([id, n]) => ({ ad: GIDER_KATEGORILERI[id as Gider['kategori']], tutar: '−' + finansPara(n), tur: 'alt' }) as OzetSatiri),
      { ad: 'Toplam gider (' + r.giderler.length + ' kayıt)', tutar: '−' + finansPara(r.gider), tur: 'ara' },
      { ad: 'Kalan (tahmini)', tutar: finansPara(kalan), tur: 'sonuc' },
    ];
    const ayTablosu = aylar(bas, son);
    const svgler = donemOzetiSvg({
      baslik: 'Satış ve Gider Özeti', donem: gun(bas) + ' – ' + gun(son), olusturma: new Date(),
      logo: f.ayarlar.logo ? await logoDataUri() : '', satici: await saticiBilgisi(), satirlar,
      tablo: ayTablosu.length > 1 ? {
        baslik: 'Aylara göre', kolonlar: ['Ay', 'Satış', 'İade', 'Gider', 'Kalan'],
        satirlar: ayTablosu.map((a) => {
          const x = raporla(f, siparisler, a.bas, a.son);
          return [a.ad, finansPara(x.webSatis), finansPara(x.webIade), finansPara(x.gider), finansPara(x.webSatis - x.webIade + x.trendyolBeklenen - x.gider)];
        }),
      } : undefined,
      notlar: [
        ...(r.tahmini === undefined ? ['Dikkat: Bu dönem için “Ürün alış maliyeti” gideri girilmedi; kalan tutar ürün maliyeti düşülmeden hesaplanmıştır.'] : []),
        'Satışlar ödeme tarihine, iade ve iptaller geri ödeme tarihine göre sayılır. Tutarlara KDV dahildir; KDV, banka tahsilatı ve muhasebe kârı ayrıca hesaplanır.',
        'Ayrıntılı listeler için Finans & Belgeler > Raporlar > Excel indir.',
      ],
    });
    return dosyaYaniti(await svgdenPdf(svgler, A4.w, A4.h, 150), 'application/pdf', 'finans-ozeti-' + ad + '.pdf');
  }
  const tablolar = muhasebeTablolari(f, siparisler, bas, son);
  if (tur === 'excel') return dosyaYaniti(xlsxOlustur(tablolar), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'muhasebe-' + ad + '.xlsx');
  if (tur === 'zip') {
    const dosyalar = [];
    let boyut = 0;
    for (const b of r.belge) {
      const v = await belgeOku(b.id);
      if (v) {
        dosyalar.push({ ad: 'siparis-belgeleri/' + (b.belgeNo ?? b.tur) + '_' + b.siparisNo + (b.durum === 'iptal' ? '_IPTAL' : '') + '.pdf', veri: v.veri });
        boyut += v.veri.length;
      }
      if (boyut > 45 * 1024 * 1024) return new Response('Arşiv 45 MB sınırını aştı. Tarih aralığını daraltın.', { status: 413 });
    }
    for (const g of r.giderler) {
      const v = g.ek && await giderEki(g.id);
      if (v) {
        const ext = v.tur === 'application/pdf' ? 'pdf' : v.tur === 'image/png' ? 'png' : 'jpg';
        dosyalar.push({ ad: 'gider-fisleri/' + g.tarih + '_' + g.kategori + '_' + g.id.slice(0, 8) + '.' + ext, veri: v.veri });
        boyut += v.veri.length;
      }
      if (boyut > 45 * 1024 * 1024) return new Response('Arşiv 45 MB sınırını aştı. Tarih aralığını daraltın.', { status: 413 });
    }
    // Arşivin içine Excel özeti de konur: muhasebeci tek dosyayla her şeyi alır
    dosyalar.push({ ad: 'muhasebe-' + ad + '.xlsx', veri: xlsxOlustur(tablolar) });
    return dosyaYaniti(zipOlustur(dosyalar), 'application/zip', 'muhasebe-arsivi-' + ad + '.zip');
  }
  const secim = tablolar.find((t) => t.kod === tur);
  return secim ? csvYaniti(secim.satirlar, secim.kod + '-' + ad) : new Response('Rapor bulunamadı.', { status: 404 });
};
