import type { APIRoute } from 'astro';
import { onyuklemeMi } from '../../lib/istek';

/* Yönetici için "müşteri gibi gör" anahtarı: örnek ürünleri gizler/gösterir. */
export const GET: APIRoute = ({ url, cookies, redirect, request }) => {
  // Tarayıcının önyüklemesi (fareyle üzerine gelme) görünümü değiştirmesin
  if (onyuklemeMi(request)) return new Response(null, { status: 204 });
  const ac = url.searchParams.get('m') === '1';
  if (ac) cookies.set('musteri_gorunumu', '1', { path: '/', httpOnly: true, sameSite: 'strict', secure: url.protocol === 'https:', maxAge: 60 * 60 * 24 * 30 });
  else cookies.delete('musteri_gorunumu', { path: '/' });
  return redirect(ayniSiteYolu(url.searchParams.get('d'), url.origin));
};

/** Yalnız aynı sitedeki bir yola döner. "/\evil.com", "//evil.com", "https://evil.com" gibi değerler ana sayfaya gider. */
function ayniSiteYolu(geri: string | null, origin: string): string {
  if (!geri || !geri.startsWith('/')) return '/';
  const hedef = URL.canParse(geri, origin) ? new URL(geri, origin) : undefined;
  return hedef && hedef.origin === origin ? hedef.pathname + hedef.search + hedef.hash : '/';
}
