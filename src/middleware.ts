import { defineMiddleware } from 'astro:middleware';
import { Katalog } from './lib/katalog';
import { magazaOku, satisAdetleri } from './lib/depo';
import { CEREZ, oturumGecerli } from './lib/oturum';
import { PAYTR_BILDIRIM, PAYTR_ORIGIN } from './lib/paytr';

export const onRequest = defineMiddleware(async (ctx, next) => {
  const yol = ctx.url.pathname;
  // PayTR'nin POST isteği uygulama oturumu taşımaz. Bu tek uç nokta HMAC doğrular.
  if (yol === PAYTR_BILDIRIM && ctx.request.method === 'POST') return next();

  // www.alluluhome.com → alluluhome.com: kartla ödeme, oturum ve sepet tek adreste çalışır (PayTR tek adrese bağlıdır)
  const anaAdres = import.meta.env.SITE ? new URL(import.meta.env.SITE) : undefined;
  if (anaAdres && ctx.url.hostname === `www.${anaAdres.hostname}` && ['GET', 'HEAD'].includes(ctx.request.method)) {
    return ctx.redirect(new URL(yol + ctx.url.search, anaAdres.origin).href, 301);
  }

  // CSRF: veri değiştiren istekler yalnızca kendi sitemizden gelebilir
  if (!['GET', 'HEAD', 'OPTIONS'].includes(ctx.request.method)) {
    // Tarayıcı "Referrer-Policy: no-referrer" olan sayfalardaki formlarda Origin'i "null" gönderir.
    // O durumda tarayıcının kendisinin koyduğu (sayfa kodunun değiştiremediği) Sec-Fetch-Site başlığına bakılır.
    const fetchSite = ctx.request.headers.get('sec-fetch-site');
    const originBasligi = ctx.request.headers.get('origin');
    const kaynak = originBasligi && originBasligi !== 'null' ? originBasligi : ctx.request.headers.get('referer');
    const kaynakOrigin = kaynak ? URL.parse(kaynak)?.origin : undefined;
    const ayniSite = kaynakOrigin ? kaynakOrigin === ctx.url.origin : originBasligi === 'null' && fetchSite === 'same-origin';
    if (!ayniSite || fetchSite === 'cross-site' || fetchSite === 'same-site') {
      return new Response('Geçersiz istek kaynağı', { status: 403 });
    }
  }

  const yonetici = oturumGecerli(ctx.cookies.get(CEREZ)?.value);
  ctx.locals.yonetici = yonetici;

  const panel = yol === '/yonetim' || yol.startsWith('/yonetim/') || yol.startsWith('/api/yonetim');
  if (panel && yol !== '/yonetim/giris' && !yonetici) {
    if (yol.startsWith('/api/')) return new Response('Yetkisiz', { status: 401 });
    return ctx.redirect(`/yonetim/giris?d=${encodeURIComponent(yol)}`);
  }

  if (!yol.startsWith('/medya/') && !yol.startsWith('/_')) {
    // Taslak ürünler: yalnızca yönetici giriş yapmışken görünür (canlıda önizleme)
    // "Müşteri gibi gör" açıkken örnek (taslak) ürünler yönetici için de gizlenir
    const musteriGorunumu = ctx.cookies.get('musteri_gorunumu')?.value === '1';
    ctx.locals.musteriGorunumu = musteriGorunumu;
    const katalog = new Katalog(await magazaOku(), await satisAdetleri(), !musteriGorunumu && yonetici);
    ctx.locals.katalog = katalog;

    // Tadilat (bakım) modu: müşterilere bakım sayfasını gösterir; yönetici siteyi gezmeye ve düzenlemeye devam edebilir
    const t = katalog.site.tadilat;
    if (t.aktif && !panel && yol !== '/tadilat' && !yol.startsWith('/img/') && !yol.startsWith('/favicon')) {
      const takipIzinli = t.siparisTakipAcik && (yol === '/siparis-takip' || yol.startsWith('/siparis/'));
      const yoneticiSerbest = yonetici && !musteriGorunumu;
      if (!takipIzinli && !yoneticiSerbest) {
        if (yol.startsWith('/api/')) {
          return Response.json(
            { hata: 'Sitemiz şu anda bakım çalışması nedeniyle geçici olarak sipariş almamaktadır.' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
          );
        }
        return ctx.rewrite('/tadilat');
      }
    }
  }

  const yanit = await next();
  if (panel || yol.startsWith('/odeme') || yol.startsWith('/siparis') || yol === '/tadilat') {
    yanit.headers.set('Cache-Control', 'no-store');
    yanit.headers.set('X-Robots-Tag', 'noindex');
  }
  yanit.headers.set('X-Content-Type-Options', 'nosniff');
  yanit.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Adresinde gizli anahtar (t= / ref=) olan sayfalar başka sitelere adres sızdırmasın.
  // /siparis-takip bu kapsamda değil: formu normal kaynak bilgisiyle gönderilmeli.
  if (yol === '/odeme' || yol.startsWith('/odeme/') || yol.startsWith('/siparis/')) yanit.headers.set('Referrer-Policy', 'no-referrer');
  if (yol === '/odeme') yanit.headers.set('Content-Security-Policy', `frame-src 'self' ${PAYTR_ORIGIN}; frame-ancestors 'none'; base-uri 'self'`);
  if (panel) yanit.headers.set('X-Frame-Options', 'SAMEORIGIN');
  return yanit;
});
