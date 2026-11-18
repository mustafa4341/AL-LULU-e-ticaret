import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { z } from 'astro/zod';
import { kampanyaIndirimi, satirKampanyaIndirimi, sepetHesapla, urunKullanimi } from '../../lib/fiyat';
import { magazaOku, siparisGuncelle, siparisleriOku, siparisVeSozlesmeEkle, SiparisNumarasiDolu, StokYetersiz } from '../../lib/depo';
import { SOZLESME_SURUMU, mesafeliSatisSozlesmesi, onBilgilendirmeFormu, siparistenYasal } from '../../lib/yasal';
import { siparisAlindi } from '../../lib/bildirim';
import type { Siparis } from '../../lib/sema';
import { Katalog } from '../../lib/katalog';
import { paytrAyari, paytrFormUrl, paytrIstendi, PAYTR_SURE_DK } from '../../lib/paytr';
import { istemciIp, sinirAsildi } from '../../lib/guvenlik';

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

const json = (veri: unknown, status = 200) =>
  Response.json(veri, { status, headers: { 'Cache-Control': 'no-store' } });

export const POST: APIRoute = async ({ request, locals, clientAddress: baglananAdres, url }) => {
  const paytr = paytrAyari();
  if (paytrIstendi() && (!paytr || paytr.origin !== url.origin)) {
    return json({ hata: 'Online ödeme geçici olarak kullanılamıyor. Lütfen daha sonra tekrar deneyin.' }, 503);
  }
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return json({ hata: 'Geçersiz istek.' }, 415);
  }
  // Gerçek ziyaretçi adresi (site Cloudflare arkasında) — sözleşme kaydına da bu yazılır
  const clientAddress = istemciIp(request, baglananAdres);
  // IP başına saatte 10 sipariş denemesi (sayaç Supabase'te: tüm sunucu kopyalarında ortak)
  if (!locals.yonetici && await sinirAsildi('siparis', clientAddress)) {
    return json({ hata: 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin veya WhatsApp üzerinden yazın.' }, 429);
  }

  const g = Girdi.safeParse(await request.json().catch(() => null));
  if (!g.success) return json({ hata: 'Lütfen bilgileri kontrol edin.', ayrinti: g.error.issues.map((i) => i.path.join('.')) }, 400);
  const d = g.data;
  if (paytr && (!d.musteri.eposta || !/^[\x21-\x7e]{1,100}$/.test(d.musteri.eposta))) {
    return json({ hata: 'Kartla ödeme için geçerli bir e-posta adresi girin (en fazla 100 karakter).' }, 400);
  }
  if (d.fatura.tip === 'kurumsal' && (!d.fatura.firma || !d.fatura.vd || !d.fatura.vno)) {
    return json({ hata: 'Kurumsal fatura bilgilerini tamamlayın.' }, 400);
  }

  const k = paytr ? new Katalog(await magazaOku(), new Map(), false) : locals.katalog;
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
  if (paytr && (!Number.isSafeInteger(hesap.toplam * 100) || hesap.toplam <= 0)) {
    return json({ hata: 'Bu sepet için ödeme başlatılamadı.' }, 409);
  }

  const mevcut = new Set((await siparisleriOku()).map((s) => s.no));
  const tarih = new Date();
  // Numaradaki tarih Türkiye saatine göre (gece 00.00–03.00 arası siparişler önceki günün tarihini almasın)
  const gun = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(tarih).slice(2).replace(/-/g, '');
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
      oncekiBirim: satirKampanyaIndirimi(s, ik) > 0 ? ik.urunler[s.id]!.onceki : undefined,
    })),
    urunlerToplami: hesap.urunlerToplami,
    setIndirimi: hesap.setIndirimi,
    sepetIndirimi: hesap.sepetIndirimi,
    kampanyaIndirimi: kampanyaIndirimi(hesap.satirlar, ik),
    kargo: hesap.kargo,
    toplam: hesap.toplam,
    stokDusuldu: false,
    paytr: paytr ? {
      ref: 'AL' + crypto.randomBytes(16).toString('hex'),
      test: paytr.test,
      sonuc: 'bekliyor',
      beklemeBitis: tarih.getTime() + (PAYTR_SURE_DK + 2) * 60_000,
    } : undefined,
    sozlesmeSurumu: SOZLESME_SURUMU,
    gecmis: [{ tarih: tarih.toISOString(), durum: 'odeme-bekliyor' }],
  };

  // Onaylanan metinler sunucuda siparişin gerçek verisiyle üretilir ve saklanır (ispat yükü satıcıda)
  const yasalVeri = siparistenYasal(siparis);
  const belgeler = { onBilgilendirme: onBilgilendirmeFormu(k.site, yasalVeri), mesafeliSatis: mesafeliSatisSozlesmesi(k.site, yasalVeri) };
  try {
    await siparisVeSozlesmeEkle(siparis, {
      no, surum: SOZLESME_SURUMU, onayTarihi: tarih.toISOString(), ip: clientAddress,
      tarayici: request.headers.get('user-agent')?.slice(0, 300) ?? undefined, ...belgeler,
    });
  } catch (e) {
    if (e instanceof StokYetersiz) return json({ hata: 'Sepetinizdeki bir ürün için şu anda yeterli stok yok.', yenile: true }, 409);
    if (e instanceof SiparisNumarasiDolu) return json({ hata: 'Lütfen siparişinizi tekrar gönderin.' }, 409);
    throw e;
  }

  if (paytr) {
    try {
      const odemeUrl = await paytrFormUrl(paytr, siparis, clientAddress);
      return json({ no, token: siparis.token, toplam: hesap.toplam, odemeUrl, odemeRef: siparis.paytr?.ref });
    } catch {
      console.error('[PayTR] Ödeme ekranı açılamadı', no);
      // Form bağlantısı müşteriye ulaşmadı. Ödeme sonucu saklı kalır, yalnızca stok ayrımı sonlanır.
      await siparisGuncelle(no, (s) => {
        if (s.paytr?.sonuc === 'bekliyor') s.paytr.beklemeBitis = Date.now();
      }).catch(() => console.error('[PayTR] Stok ayrımı kapatılamadı', no));
      return json({ hata: 'Ödeme ekranı şu anda açılamadı. Sepetiniz korundu. Lütfen daha sonra tekrar deneyin.' }, 502);
    }
  }

  const takip = new URL(`/siparis/${no}?t=${siparis.token}`, url.origin).href;
  const sozlesmeBaglantisi = new URL(`/siparis/${no}/sozlesmeler?t=${siparis.token}`, url.origin).href;
  // Beklenir: Vercel'de yanıt döndükten sonra arka planda kalan işler kesilebilir, e-posta hiç gitmez.
  await siparisAlindi(siparis, k.site, takip, { ...belgeler, baglanti: sozlesmeBaglantisi }).catch((e) => console.error('[bildirim]', e));
  return json({ no, token: siparis.token, toplam: hesap.toplam });
};
