import { defineMiddleware } from 'astro:middleware';
import { Katalog } from './lib/katalog';
import { magazaOku, satisAdetleri } from './lib/depo';
import { CEREZ, oturumGecerli } from './lib/oturum';

export const onRequest = defineMiddleware(async (ctx, next) => {
  const yol = ctx.url.pathname;

  // CSRF: veri değiştiren istekler yalnızca kendi sitemizden gelebilir
  if (!['GET', 'HEAD', 'OPTIONS'].includes(ctx.request.method)) {
    const kaynak = ctx.request.headers.get('origin') ?? ctx.request.headers.get('referer');
    const host = ctx.request.headers.get('x-forwarded-host') ?? ctx.request.headers.get('host');
    let kaynakHost: string | null = null;
    try { kaynakHost = kaynak ? new URL(kaynak).host : null; } catch { kaynakHost = 'gecersiz'; }
    if (!kaynakHost || kaynakHost !== host) return new Response('Geçersiz istek kaynağı', { status: 403 });
  }

  const yonetici = oturumGecerli(ctx.cookies.get(CEREZ)?.value);
  ctx.locals.yonetici = yonetici;

  const panel = yol === '/yonetim' || yol.startsWith('/yonetim/') || yol.startsWith('/api/yonetim');
  if (panel && yol !== '/yonetim/giris' && !yonetici) {
    if (yol.startsWith('/api/')) return new Response('Yetkisiz', { status: 401 });
    return ctx.redirect(`/yonetim/giris?d=${encodeURIComponent(yol)}`);
  }

  if (!yol.startsWith('/medya/') && !yol.startsWith('/_')) {
    // Taslak ürünler: geliştirme ortamında ve yönetici giriş yapmışken görünür (canlıda önizleme)
    // "Müşteri gibi gör" açıkken örnek (taslak) ürünler yönetici için de gizlenir
    const musteriGorunumu = ctx.cookies.get('musteri_gorunumu')?.value === '1';
    ctx.locals.musteriGorunumu = musteriGorunumu;
    ctx.locals.katalog = new Katalog(await magazaOku(), await satisAdetleri(), !musteriGorunumu && (import.meta.env.DEV || yonetici));
  }

  const yanit = await next();
  if (panel || yol.startsWith('/odeme') || yol.startsWith('/siparis')) {
    yanit.headers.set('Cache-Control', 'no-store');
    yanit.headers.set('X-Robots-Tag', 'noindex');
  }
  yanit.headers.set('X-Content-Type-Options', 'nosniff');
  yanit.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (panel) yanit.headers.set('X-Frame-Options', 'DENY');
  return yanit;
});
