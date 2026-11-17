import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { z } from 'astro/zod';
import { sepetHesapla, urunKullanimi } from '../../lib/fiyat';
import { siparisEkle, siparisleriOku, sozlesmeKaydet } from '../../lib/depo';
import { SOZLESME_SURUMU, mesafeliSatisSozlesmesi, onBilgilendirmeFormu, siparistenYasal } from '../../lib/yasal';
import { siparisAlindi } from '../../lib/bildirim';
import type { Siparis } from '../../lib/sema';

/* Sipariş oluşturma — fiyatlar ve stok SUNUCUDA katalogdan yeniden hesaplanır. */
const metin = (min = 1, max = 300) => z.string().trim().min(min).max(max);
const Girdi = z.object({
  kalemler: z.array(z.object({ tip: z.enum(['urun', 'set']), id: z.string().regex(/^[a-z0-9-]+$/), adet: z.number().int().min(1).max(50) })).min(1).max(30),
  beklenenToplam: z.number().int().nonnegative(),
  musteri: z.object({
    ad: metin(1, 60), soyad: metin(1, 60), tel: z.string().regex(/^05\d{9}$/),
    eposta: z.string().trim().email().max(120).optional().or(z.literal('')),
  }),
  teslimat: z.object({ il: metin(2, 40), ilce: metin(2, 60), adres: metin(10, 400), not: z.string().trim().max(200).optional() }),
  fatura: z.object({
    tip: z.enum(['bireysel', 'kurumsal']),
    firma: z.string().trim().max(160).optional(),
    vd: z.string().trim().max(80).optional(),
    vno: z.string().regex(/^\d{10}$/).optional().or(z.literal('')),
    adres: z.string().trim().max(400).optional(),
  }),
  onay: z.literal(true),
});

const sinir = new Map<string, number[]>();
const json = (veri: unknown, status = 200) =>
  new Response(JSON.stringify(veri), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request, locals, clientAddress, url }) => {
  // IP başına saatte 10 sipariş denemesi
  const simdi = Date.now();
  const gecmis = (sinir.get(clientAddress) ?? []).filter((t) => simdi - t < 3600_000);
  if (gecmis.length >= 10) return json({ hata: 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin veya WhatsApp üzerinden yazın.' }, 429);
  sinir.set(clientAddress, [...gecmis, simdi]);

  const g = Girdi.safeParse(await request.json().catch(() => null));
  if (!g.success) return json({ hata: 'Lütfen bilgileri kontrol edin.', ayrinti: g.error.issues.map((i) => i.path.join('.')) }, 400);
  const d = g.data;
  if (d.fatura.tip === 'kurumsal' && (!d.fatura.firma || !d.fatura.vd || !d.fatura.vno)) {
    return json({ hata: 'Kurumsal fatura bilgilerini tamamlayın.' }, 400);
  }

  const k = locals.katalog;
  const ik = k.istemci();
  const hesap = sepetHesapla(d.kalemler, ik);
  if (hesap.satirlar.length !== d.kalemler.length) {
    return json({ hata: 'Sepetinizdeki bazı ürünler artık satışta değil. Sayfayı yenileyin.', yenile: true }, 409);
  }
  for (const [id, adet] of urunKullanimi(d.kalemler, ik)) {
    const u = ik.urunler[id];
    if (!u || adet > u.maxAdet) return json({ hata: `${u?.kisaAd ?? 'Bir ürün'} için yeterli stok yok.`, yenile: true }, 409);
  }
  if (hesap.toplam !== d.beklenenToplam) {
    return json({ hata: 'Fiyatlar güncellendi. Yeni toplamı kontrol edip tekrar onaylayın.', yenile: true }, 409);
  }

  const mevcut = new Set((await siparisleriOku()).map((s) => s.no));
  const tarih = new Date();
  const gun = tarih.toISOString().slice(2, 10).replace(/-/g, '');
  let no = '';
  do { no = `AL${gun}-${crypto.randomInt(1000, 9999)}`; } while (mevcut.has(no));

  const siparis: Siparis = {
    no,
    token: crypto.randomBytes(16).toString('hex'),
    tarih: tarih.toISOString(),
    durum: 'odeme-bekliyor',
    musteri: { ...d.musteri, eposta: d.musteri.eposta || undefined },
    teslimat: d.teslimat,
    fatura: { ...d.fatura, vno: d.fatura.vno || undefined },
    kalemler: hesap.satirlar.map((s) => ({
      tip: s.tip, id: s.id, ad: s.ad, sku: s.sku, icerik: s.icerik, parcalar: s.parcalar,
      adet: s.adet, birimFiyat: s.birimFiyat, indirim: s.indirim, toplam: s.toplam,
    })),
    urunlerToplami: hesap.urunlerToplami,
    setIndirimi: hesap.setIndirimi,
    sepetIndirimi: hesap.sepetIndirimi,
    kargo: hesap.kargo,
    toplam: hesap.toplam,
    stokDusuldu: false,
    sozlesmeSurumu: SOZLESME_SURUMU,
    gecmis: [{ tarih: tarih.toISOString(), durum: 'odeme-bekliyor' }],
  };

  // Onaylanan metinler sunucuda siparişin gerçek verisiyle üretilir ve saklanır (ispat yükü satıcıda)
  const yasalVeri = siparistenYasal(siparis);
  const belgeler = { onBilgilendirme: onBilgilendirmeFormu(k.site, yasalVeri), mesafeliSatis: mesafeliSatisSozlesmesi(k.site, yasalVeri) };
  await sozlesmeKaydet({
    no, surum: SOZLESME_SURUMU, onayTarihi: tarih.toISOString(), ip: clientAddress,
    tarayici: request.headers.get('user-agent')?.slice(0, 300) ?? undefined, ...belgeler,
  });
  await siparisEkle(siparis);

  const takip = new URL(`/siparis/${no}?t=${siparis.token}`, url.origin).href;
  const sozlesmeBaglantisi = new URL(`/siparis/${no}/sozlesmeler?t=${siparis.token}`, url.origin).href;
  siparisAlindi(siparis, k.site, takip, { ...belgeler, baglanti: sozlesmeBaglantisi }).catch((e) => console.error('[bildirim]', e));
  // TODO(ödeme): iyzico/PayTR bağlandığında burada ödeme formu token'ı oluşturulup döndürülecek.
  return json({ no, token: siparis.token, toplam: hesap.toplam });
};
