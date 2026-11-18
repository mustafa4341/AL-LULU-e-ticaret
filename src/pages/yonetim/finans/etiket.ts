import type { APIRoute } from 'astro';
import { magazaOku, siparisleriOku } from '../../../lib/depo';
import { dosyaYaniti } from '../../../lib/finansDisari';
import { barkod, pdfUret, type PdfSayfasi } from '../../../lib/finansPdf';
import { iadeEdildi } from '../../../lib/siparisAkisi';

export const GET: APIRoute = async ({ url }) => {
  const no = [...new Set(url.searchParams.getAll('no'))];
  const sku = url.searchParams.get('sku');
  const bicim = url.searchParams.get('bicim') === 'etiket' ? 'etiket' : 'a4';
  const tur = url.searchParams.get('tur');
  const sayfalar: PdfSayfasi[] = [];
  if (sku) {
    const urun = (await magazaOku()).urunler.find((u) => u.sku === sku);
    if (!urun || !barkod(sku)) return new Response('Bu SKU için barkod oluşturulamadı.', { status: 422 });
    sayfalar.push({ baslik: 'Ürün SKU etiketi', satirlar: [{ metin: urun.marka + ' ' + urun.kisaAd }], barkodlar: [sku], etiket: 'Mağaza içi stok etiketi' });
  } else {
    if (no.length < 1 || no.length > 30) return new Response('1–30 sipariş seçin.', { status: 400 });
    const siparisler = (await siparisleriOku()).filter((s) => no.includes(s.no) && !s.paytr?.test);
    if (siparisler.length !== no.length) return new Response('Sipariş bulunamadı.', { status: 404 });
    if (siparisler.some((s) => s.durum === 'iptal' || iadeEdildi(s))) {
      return new Response('İptal veya iade kaydı olan siparişler hazırlık etiketine eklenemez.', { status: 409 });
    }
    if (tur === 'toplama') {
      const m = await magazaOku();
      const adetler = new Map<string, number>();
      for (const s of siparisler) for (const k of s.kalemler) {
        const parcalar = k.parcalar.length ? k.parcalar : [{ urunId: k.id, adet: 1 }];
        for (const p of parcalar) adetler.set(p.urunId, (adetler.get(p.urunId) ?? 0) + p.adet * k.adet);
      }
      sayfalar.push({
        baslik: 'Ürün Toplama Listesi', alt: siparisler.length + ' sipariş', etiket: 'Mağaza içi hazırlık listesi',
        satirlar: [...adetler].map(([id, adet]) => {
          const u = m.urunler.find((u) => u.id === id);
          return { metin: '□   ' + adet + ' × ' + (u?.kisaAd || id) + (u?.sku ? ' · ' + u.sku : '') };
        }),
      });
    } else {
      for (const s of siparisler) sayfalar.push({
        baslik: 'Sipariş Hazırlık Etiketi', alt: s.no,
        satirlar: [{ metin: s.musteri.ad + ' ' + s.musteri.soyad }, { metin: s.teslimat.ilce + ' / ' + s.teslimat.il }],
        barkodlar: [s.no], etiket: 'Mağaza içi etiket · Taşıma etiketi değildir.',
      });
    }
  }
  const veri = await pdfUret(sayfalar, tur === 'toplama' ? 'a4' : bicim);
  return dosyaYaniti(veri, 'application/pdf', tur === 'toplama' ? 'urun-toplama-listesi.pdf' : 'magaza-etiketi.pdf', true);
};
