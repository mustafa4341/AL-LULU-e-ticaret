/**
 * /llms.txt — yapay zekâ asistanları (ChatGPT, Claude, Perplexity, Gemini) için mağazanın kısa ve doğru özeti.
 * Panel verisinden her istekte üretilir; fiyat, stok ve politikalar sitedekiyle hep aynıdır. Uydurma bilgi yoktur.
 */
import type { APIRoute } from 'astro';
import { formatTL } from '../lib/fiyat';
import { ODEME_BAGLI } from '../lib/altyapi';
import { YASAL_SAYFALAR } from '../lib/yasal';
import { urunGtin } from '../lib/urunKimlik';

export const GET: APIRoute = async ({ locals, site: astroSite }) => {
  const k = locals.katalog;
  const s = k.site;
  const kok = (astroSite ?? new URL(s.url)).origin;
  const tek = (v: string) => v.replace(/\s+/g, ' ').trim();

  const urunler = k.tumUrunler().map((u) => {
    const b = k.fiyatBilgisi(u);
    const fiyat = b.sepette?.fiyat ?? b.fiyat;
    const kargoUcretsiz = fiyat >= s.kargo.ucretsizEsik;
    const gtin = urunGtin(u);
    const ozellik = u.teknik.filter(([a]) => !/barkod|ean|gtin/i.test(a)).slice(0, 8).map(([a, d]) => `${a}: ${d}`).join('; ');
    const pisirme = u.pisirme.slice(0, 8).map((p) => `${p.yemek} ${p.sure}${p.kademe ? ` (${/^\d$/.test(p.kademe.trim()) ? `${p.kademe.trim()}. kademe` : p.kademe})` : ''}`).join('; ');
    return [
      `- [${u.marka} ${u.ad}](${kok}/urun/${u.id}): ${tek(u.ozet)}`,
      `  Fiyat: ${formatTL(fiyat)} (KDV dahil)${kargoUcretsiz ? ', kargo ücretsiz' : ''}. ${k.stoktaMi(u) ? 'Stokta.' : 'Şu an stokta yok.'}${u.garanti ? ` Garanti: ${u.garanti}.` : ''}${u.sku ? ` Model kodu (MPN): ${u.sku}.` : ''}${gtin ? ` Barkod (EAN/GTIN): ${gtin}.` : ''}`,
      ...(ozellik ? [`  Özellikler: ${ozellik}`] : []),
      ...(u.kutuIcerigi.length ? [`  Kutu içeriği: ${u.kutuIcerigi.map(tek).join('; ')}`] : []),
      ...(pisirme ? [`  Pişirme süreleri: ${pisirme}${u.pisirmeNotu ? ` — ${tek(u.pisirmeNotu)}` : ''}`] : []),
    ].join('\n');
  });
  const kategoriler = k.magaza.kategoriler
    .filter((c) => k.kategoriUrunleri(c.id).length)
    .map((c) => `- [${c.ad}](${kok}/kategori/${c.id}): ${tek(c.aciklama)}`);
  const kargo = s.kargo;

  const metin = `# ${s.ad}

> ${tek(s.slogan || 'Premium mutfak ürünleri')}. ${s.ad}, Türkiye'ye satış yapan çevrim içi bir mutfak ürünleri mağazasıdır. Ürünler orijinal ve faturalı gönderilir.

## Mağaza bilgileri

- Web sitesi: ${kok}
- Müşteri hizmetleri: ${s.eposta} · Site üzerinden WhatsApp destek${s.calismaSaatleri ? ` (${tek(s.calismaSaatleri)})` : ''}
${s.kurumsalEposta ? `- Kurumsal: ${s.kurumsalEposta}\n` : ''}- Satış bölgesi: Türkiye geneli, yalnız çevrim içi
- Kargo: ${kargo.firma || 'anlaşmalı kargo'}; ${formatTL(kargo.ucretsizEsik)} ve üzeri siparişte ücretsiz, altında ${formatTL(kargo.ucret)}. Hafta içi saat ${kargo.kesimSaati}:00'e kadar ödemesi onaylanan siparişler genellikle aynı gün kargoya verilir; teslim süresi genellikle ${kargo.teslimGun[0]}–${kargo.teslimGun[1]} iş günü.
- İade: Teslimden itibaren ${s.iadeGun} gün içinde cayma hakkı; anlaşmalı kargoyla iade ücretsizdir.
- Ödeme: ${ODEME_BAGLI() ? 'Kredi/banka kartı (PayTR, 3D Secure)' : 'Çevrim içi kartlı ödeme şu an kapalı; sipariş kaydından sonra ödeme için mağaza iletişime geçer'}.
- Üyelik gerekmez; sipariş numarasıyla takip edilir: ${kok}/siparis-takip

## Ürünler

${urunler.join('\n')}
${kategoriler.length ? `\n## Kategoriler\n\n${kategoriler.join('\n')}\n` : ''}
## Politikalar ve yasal bilgiler

${YASAL_SAYFALAR.map((y) => `- [${y.baslik}](${kok}/yasal/${y.yol})`).join('\n')}
- [Satıcı bilgileri](${kok}/bilgi)
`;
  return new Response(metin, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
