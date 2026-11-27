import { defineMiddleware } from 'astro:middleware';
import { Katalog } from './lib/katalog';
import { magazaOku, magazaYedektenMi, satisAdetleri } from './lib/depo';
import { CEREZ, girisYolu, oturumGecerli } from './lib/oturum';
import { PAYTR_BILDIRIM, PAYTR_ORIGIN } from './lib/paytr';
import { panelRozetiOku } from './lib/panelRozet';

export const onRequest = defineMiddleware(async (ctx, next) => {
  const yol = ctx.url.pathname;
  // PayTR'nin POST isteği uygulama oturumu taşımaz. Bu tek uç nokta HMAC doğrular.
  if (yol === PAYTR_BILDIRIM && ctx.request.method === 'POST') return next();
  if (yol === '/api/pazaryeri-senkron' && ctx.request.method === 'GET') return next();
  // Pazaryeri anlık sipariş bildirimi (webhook): kanalın sunucusundan gelir, "x-api-key" ile doğrulanır.
  if (yol.startsWith('/api/kanal-bildirim/') && ctx.request.method === 'POST') return next();

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

  const yonetici = await oturumGecerli(ctx.cookies.get(CEREZ)?.value);
  ctx.locals.yonetici = yonetici;

  // Gizli giriş adresi (YONETIM_GIRIS_YOLU): giriş sayfası yalnızca bu adreste açılır.
  const gizliGiris = girisYolu();
  if (gizliGiris && yol === gizliGiris) {
    if (yonetici) return ctx.redirect('/yonetim');
    if (!['GET', 'HEAD', 'POST'].includes(ctx.request.method)) return new Response(null, { status: 405 });
    const yanit = await next('/yonetim/giris');
    gizliBasliklar(yanit);
    return yanit;
  }

  const panel = yol === '/yonetim' || yol.startsWith('/yonetim/') || yol.startsWith('/api/yonetim');
  if (panel && !yonetici && (gizliGiris || yol !== '/yonetim/giris')) {
    // Gizli adres tanımlıysa panelin varlığı belli olmasın: sıradan "sayfa bulunamadı" sayfası
    if (gizliGiris) return ctx.rewrite('/404');
    if (yol.startsWith('/api/')) return new Response('Yetkisiz', { status: 401 });
    return ctx.redirect(`/yonetim/giris?d=${encodeURIComponent(yol)}`);
  }

  if (!yol.startsWith('/medya/') && !yol.startsWith('/jpg/') && !yol.startsWith('/_')) {
    // Taslak ürünler: yalnızca yönetici giriş yapmışken görünür (canlıda önizleme)
    // "Müşteri gibi gör" açıkken örnek (taslak) ürünler yönetici için de gizlenir
    const musteriGorunumu = ctx.cookies.get('musteri_gorunumu')?.value === '1';
    ctx.locals.musteriGorunumu = musteriGorunumu;
    // Panel sayfasında yan menüdeki sipariş sayısı şimdiden istenir; sayfa verisiyle aynı anda gelir
    if (panel && yonetici && ctx.request.method === 'GET') ctx.locals.panelRozet = panelRozetiOku();
    // Mağaza ve satış adetleri aynı anda okunur (sırayla beklemek her sayfayı bir tur yavaşlatıyordu)
    const katalogDosyasi = yol === '/sitemap.xml' || yol === '/llms.txt'
      || yol === '/urun-akisi.xml' || yol === '/urun-akisi-jpg.xml';
    const vitrin = yol === '/' || yol === '/urunler' || yol === '/setler'
      || yol.startsWith('/urun/') || yol.startsWith('/kategori/');
    const guncelKatalogGerekli = katalogDosyasi || (vitrin && (!yonetici || musteriGorunumu));
    const [magaza, satislar] = await Promise.all([
      magazaOku().catch((hata: unknown) => {
        if (!guncelKatalogGerekli) throw hata;
        console.error('[Katalog] Mağaza verisi okunamadı:', hata);
        return null;
      }),
      katalogDosyasi ? undefined : satisAdetleri(),
    ]);
    if (!magaza || (guncelKatalogGerekli && magazaYedektenMi(magaza))) {
      const yanit = new Response('Ürün bilgilerine geçici olarak ulaşılamıyor. Lütfen tekrar deneyin.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '60' },
      });
      ortakBasliklar(yanit);
      return yanit;
    }
    const katalog = new Katalog(magaza, satislar, !musteriGorunumu && yonetici);
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
  if (yonetici && yanit.headers.get('Content-Type')?.startsWith('text/html')) {
    yanit.headers.set('Cache-Control', 'private, no-store');
    yanit.headers.set('X-Robots-Tag', 'noindex');
  }
  if (panel || yol.startsWith('/odeme') || yol.startsWith('/siparis') || yol === '/tadilat') {
    yanit.headers.set('Cache-Control', 'no-store');
    yanit.headers.set('X-Robots-Tag', 'noindex');
  }
  ortakBasliklar(yanit);
  // Panelde dışarıdan betik yüklenmez (GTM vb. yok): yalnız kendi betiklerimiz çalışabilir (denetim AUD-025)
  if (panel && yanit.headers.get('Content-Security-Policy') === VARSAYILAN_CSP) {
    yanit.headers.set('Content-Security-Policy', VARSAYILAN_CSP + "; script-src 'self' 'unsafe-inline'; form-action 'self'");
  }
  if (yol === '/odeme/sonuc') {
    // PayTR ödeme bitince bu sayfayı kendi çerçevesinin içinde açar: yalnızca PayTR ve kendi sitemiz çerçeveleyebilir
    yanit.headers.delete('X-Frame-Options');
    yanit.headers.set('Content-Security-Policy', `frame-ancestors 'self' ${PAYTR_ORIGIN}; base-uri 'self'; object-src 'none'`);
  }
  // Adresinde gizli anahtar (t= / ref=) olan sayfalar başka sitelere adres sızdırmasın.
  // /siparis-takip bu kapsamda değil: formu normal kaynak bilgisiyle gönderilmeli.
  if (yol === '/odeme' || yol.startsWith('/odeme/') || yol.startsWith('/siparis/')) yanit.headers.set('Referrer-Policy', 'no-referrer');
  if (yol === '/odeme') {
    yanit.headers.set('Content-Security-Policy', `frame-src 'self' ${PAYTR_ORIGIN}; frame-ancestors 'none'; base-uri 'self'; object-src 'none'`);
    yanit.headers.set('X-Frame-Options', 'DENY');
  }
  return yanit;
});

/** Tüm yanıtlar: tıklama tuzağı (başka sitenin sayfamızı çerçeve içinde göstermesi), tür karışıklığı ve gereksiz tarayıcı izinlerine karşı.
 *  Çerçeve izni yalnızca kendi sitemize: paneldeki canlı önizleme mağaza sayfalarını iframe içinde açar. */
const VARSAYILAN_CSP = "frame-ancestors 'self'; base-uri 'self'; object-src 'none'";
function ortakBasliklar(yanit: Response) {
  const h = yanit.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('X-Frame-Options', 'SAMEORIGIN');
  // HTTPS zorunlu (tarayıcı 180 gün boyunca siteye yalnız HTTPS ile gider). Alt alan adları etkilenmez. — denetim AUD-025
  h.set('Strict-Transport-Security', 'max-age=15552000');
  if (!h.has('Content-Security-Policy')) h.set('Content-Security-Policy', VARSAYILAN_CSP);
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), usb=()');
}

function gizliBasliklar(yanit: Response) {
  ortakBasliklar(yanit);
  yanit.headers.set('Cache-Control', 'no-store');
  yanit.headers.set('X-Robots-Tag', 'noindex, nofollow');
  yanit.headers.set('Referrer-Policy', 'no-referrer');
  yanit.headers.set('X-Frame-Options', 'DENY');
  yanit.headers.set('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'");
}
