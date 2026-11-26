import type { APIRoute } from 'astro';
import { siparisleriOku } from '../../../lib/depo';
import { belgeAyarKaydet, belgeGonderildi, belgeHazirla, belgeOku, belgeOnizle, finansOku, giderEki } from '../../../lib/finansDepo';
import { dosyaYaniti } from '../../../lib/finansDisari';
import { siparisTuru, type BelgeTuru } from '../../../lib/finans';
import { metin } from '../../../lib/form';
import { zipOlustur } from '../../../lib/finansArsiv';
import { onayliSatis } from '../../../lib/yonetimRapor';

const TURLER: BelgeTuru[] = ['ozet', 'fis', 'paket', 'iade'];

/** Ayar formundaki (veya önizleme adresindeki) değerlerden belge ayarı nesnesi */
function ayarNesnesi(al: (ad: string) => string | null) {
  const evet = (ad: string) => al(ad) === '1' || al(ad) === 'on';
  return {
    logo: evet('logo'), satici: evet('satici'), fisFiyat: evet('fisFiyat'), barkod: evet('barkod'),
    onekler: Object.fromEntries(TURLER.map((t) => [t, (al('onek_' + t) ?? '').trim() || undefined])),
    notlar: Object.fromEntries(TURLER.map((t) => [t, (al('not_' + t) ?? '').slice(0, 400)])),
  };
}

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams;
  const id = q.get('id') ?? '';
  if (q.get('ek') === 'gider') {
    const g = await giderEki(id);
    return g ? dosyaYaniti(g.veri, g.tur, g.ad, true) : new Response('Dosya bulunamadı.', { status: 404 });
  }
  if (q.get('onizle') === '1') {
    const tur = siparisTuru.safeParse(q.get('tur'));
    const tum = (await siparisleriOku()).filter((s) => !s.paytr?.test);
    // Ayar önizlemesinde sipariş seçilmediyse en son gerçek sipariş örnek alınır
    const yeniden = [...tum].sort((a, b) => Date.parse(b.tarih) - Date.parse(a.tarih));
    const s = q.get('no') ? tum.find((x) => x.no === q.get('no')) : (yeniden.find(onayliSatis) ?? yeniden[0]);
    if (!tur.success || !s) return new Response('Önizleme için sipariş bulunamadı.', { status: 404 });
    try {
      const { png, sayfa } = await belgeOnizle(s, tur.data, { not: q.get('not') ?? undefined, fiyatGizle: q.get('fiyatGizle') === '1' },
        q.get('ayar') === '1' ? ayarNesnesi((ad) => q.get(ad)) : undefined);
      return new Response(new Uint8Array(png), {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Sayfa-Sayisi': String(sayfa) },
      });
    } catch (e) {
      return new Response((e as Error).message || 'Önizleme hazırlanamadı.', { status: 422 });
    }
  }
  const b = await belgeOku(id);
  if (!b) return new Response('Belge bulunamadı.', { status: 404 });
  const ad = (b.kayit.belgeNo ?? b.kayit.tur) + '_' + b.kayit.siparisNo + (b.kayit.durum === 'iptal' ? '_IPTAL' : '') + '.pdf';
  return dosyaYaniti(b.veri, 'application/pdf', ad, q.get('goster') === '1');
};

export const POST: APIRoute = async ({ request, redirect, url }) => {
  const f = await request.formData();
  const islem = metin(f, 'islem');
  const geri = URL.parse(metin(f, 'geri'), url.origin);
  const hedef = geri?.origin === url.origin && geri.pathname.startsWith('/yonetim/') ? geri.pathname + geri.search : '/yonetim/finans?sekme=belgeler';
  const bildir = (mesaj: string, hata = false) => {
    const u = new URL(hedef, url.origin);
    u.searchParams.delete('ok');
    u.searchParams.delete('hata');
    u.searchParams.set(hata ? 'hata' : 'ok', mesaj);
    const hash = geri?.origin === url.origin && geri.hash ? geri.hash : (u.pathname.startsWith('/yonetim/siparisler/') ? '#belgeler' : '');
    return redirect(u.pathname + u.search + hash, 303);
  };
  try {
    if (islem === 'gonderildi') {
      await belgeGonderildi(metin(f, 'id'));
      return bildir('Belge gönderildi olarak kaydedildi.');
    }
    if (islem === 'ayar-kaydet') {
      await belgeAyarKaydet(ayarNesnesi((ad) => (f.has(ad) ? String(f.get(ad)) : null)));
      return bildir('Belge ayarları kaydedildi.');
    }
    const tur = siparisTuru.safeParse(metin(f, 'tur'));
    const numaralar = [...new Set(f.getAll('no').map(String))];
    if (islem !== 'olustur' || !tur.success || !numaralar.length || numaralar.length > 30) {
      return bildir('En fazla 30 sipariş ve geçerli belge türü seçin.', true);
    }
    const tum = (await siparisleriOku()).filter((s) => !s.paytr?.test);
    const secilenler = tum.filter((s) => numaralar.includes(s.no));
    if (secilenler.length !== numaralar.length) return bildir('Seçilen siparişlerden bazıları bulunamadı.', true);
    if (tur.data !== 'iade' && secilenler.some((s) => s.durum === 'iptal')) {
      return bildir('İptal edilmiş siparişler için yalnızca iade talep formu düzenlenebilir.', true);
    }
    const secenek = { not: metin(f, 'not') || undefined, fiyatGizle: f.get('fiyatGizle') === '1', yenile: f.get('yenile') === '1' };
    const oncekiler = new Set((await finansOku()).belgeler.filter((b) => b.tur === tur.data && ['duzenlendi', 'gonderildi'].includes(b.durum)).map((b) => b.siparisNo));
    const dosyalar = [];
    for (const s of secilenler) {
      // Toplu işlemde mevcut belge tekrar düzenlenmez, var olan indirilir (mükerrer numara oluşmaz)
      const b = await belgeHazirla(s, tur.data, secilenler.length > 1 ? { not: secenek.not, fiyatGizle: secenek.fiyatGizle } : secenek);
      if (b.durum === 'hata') return bildir(s.no + ' için belge hazırlanamadı. Belge bölümünden “Yeniden dene”yi kullanın.', true);
      const dosya = await belgeOku(b.id);
      if (!dosya) return bildir('Belge okunamadı. Yeniden deneyin.', true);
      dosyalar.push({ ad: (b.belgeNo ?? tur.data) + '_' + s.no + '.pdf', veri: dosya.veri });
    }
    if (f.get('indir') === '0') {
      const yeni = secilenler.filter((s) => !oncekiler.has(s.no)).length;
      return bildir(yeni ? 'Belge düzenlendi.' : 'Bu belge zaten vardı; aynı numarayla hazır.');
    }
    return dosyalar.length === 1 ? dosyaYaniti(dosyalar[0]!.veri, 'application/pdf', dosyalar[0]!.ad)
      : dosyaYaniti(zipOlustur(dosyalar), 'application/zip', 'siparis-belgeleri.zip');
  } catch (e) {
    console.error('[belge]', (e as Error)?.message);
    return bildir(e instanceof Error && /Önek|önek/.test(e.message) ? 'Belge öneki 1–5 harf olmalı.' : 'Belge işlemi tamamlanamadı. Yeniden deneyin.', true);
  }
};
