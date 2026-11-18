import type { APIRoute } from 'astro';
import { magazaGuncelle } from '../../lib/depo';
import { metin } from '../../lib/form';

export const POST: APIRoute = async ({ request, redirect, url }) => {
  const f = await request.formData();
  const islem = metin(f, 'islem');
  if (islem !== 'ac' && islem !== 'kapat') return new Response('Geçersiz bakım işlemi.', { status: 400 });
  const adres = URL.parse(metin(f, 'geri'), url.origin);
  const geri = adres?.origin === url.origin ? adres : new URL('/yonetim/site-duzeni?bolum=tadilat', url.origin);
  const aktif = islem === 'ac';
  try {
    await magazaGuncelle((m) => { m.site.tadilat.aktif = aktif; });
  } catch {
    return new Response('Bakım durumu kaydedilemedi. Yönetim paneline dönüp tekrar deneyin.', { status: 503 });
  }
  if (geri.pathname.startsWith('/yonetim')) geri.searchParams.set('ok',
    aktif ? 'Bakım modu açıldı.' : 'Bakım modu kapatıldı.');
  return redirect(geri.pathname + geri.search + geri.hash, 303);
};
