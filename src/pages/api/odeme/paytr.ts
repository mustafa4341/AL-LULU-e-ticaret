import type { APIRoute } from 'astro';
import { siparisAlindi } from '../../../lib/bildirim';
import { magazaOku, paytrSonuclandir, sozlesmeOku } from '../../../lib/depo';
import { paytrAyari, paytrBildirimDogrula } from '../../../lib/paytr';

const yanit = (metin: string, status: number) => new Response(metin, {
  status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
});

export const POST: APIRoute = async ({ request }) => {
  const ayar = paytrAyari();
  if (!ayar) return yanit('Kullanılamıyor', 503);
  const tip = request.headers.get('content-type') ?? '';
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)(;|$)/i.test(tip)) return yanit('Geçersiz biçim', 415);
  const okuyucu = request.body?.getReader();
  if (!okuyucu) return yanit('Geçersiz bildirim', 400);
  const parcalar: Uint8Array[] = [];
  let boyut = 0;
  try {
    for (;;) {
      const { value, done } = await okuyucu.read();
      if (done) break;
      boyut += value.byteLength;
      if (boyut > 8192) { void okuyucu.cancel().catch(() => undefined); return yanit('Bildirim çok büyük', 413); }
      parcalar.push(value);
    }
  } catch { return yanit('Geçersiz bildirim', 400); }
  const form = await new Response(Buffer.concat(parcalar), { headers: { 'Content-Type': tip } }).formData().catch(() => null);
  const bildirim = form && paytrBildirimDogrula(ayar, form);
  if (!bildirim) return yanit('Geçersiz bildirim', 400);
  try {
    const sonuc = await paytrSonuclandir(bildirim);
    if (sonuc.durum === 'bulunamadi' || sonuc.durum === 'uyusmazlik') {
      console.error('[PayTR] Bildirim siparişle eşleşmedi', bildirim.ref, sonuc.durum);
      return yanit('Bildirim eşleşmedi', 409);
    }
    if (sonuc.durum === 'kaydedildi' && bildirim.basarili && !sonuc.siparis.paytr?.test) {
      const s = sonuc.siparis;
      const adres = new URL(`/siparis/${s.no}?t=${s.token}`, ayar.origin).href;
      const belgeAdresi = new URL(`/siparis/${s.no}/sozlesmeler?t=${s.token}`, ayar.origin).href;
      void Promise.all([magazaOku(), sozlesmeOku(s.no)])
        .then(([m, belge]) => siparisAlindi(s, m.site, adres, belge ? { ...belge, baglanti: belgeAdresi } : undefined))
        .catch(() => console.error('[PayTR] Sipariş bildirimi gönderilemedi', s.no));
    }
    return yanit('OK', 200);
  } catch (e) {
    // PayTR "OK" almadığı için bildirimi tekrar gönderir; neden günlükte görünsün
    console.error('[PayTR] Sipariş durumu kaydedilemedi', bildirim.ref, (e as Error)?.message ?? e);
    return yanit('Daha sonra tekrar deneyin', 503);
  }
};
