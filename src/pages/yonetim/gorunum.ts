import type { APIRoute } from 'astro';

/* Yönetici için "müşteri gibi gör" anahtarı: örnek ürünleri gizler/gösterir. */
export const GET: APIRoute = ({ url, cookies, redirect }) => {
  const ac = url.searchParams.get('m') === '1';
  if (ac) cookies.set('musteri_gorunumu', '1', { path: '/', httpOnly: true, sameSite: 'strict', maxAge: 60 * 60 * 24 * 30 });
  else cookies.delete('musteri_gorunumu', { path: '/' });
  const geri = url.searchParams.get('d') ?? '/';
  return redirect(geri.startsWith('/') && !geri.startsWith('//') ? geri : '/');
};
