import { timingSafeEqual } from 'node:crypto';
import type { APIRoute } from 'astro';
import { arkaPlanda } from '../../../lib/arkaPlan';
import { bildirimAnahtari } from '../../../lib/pazaryeriApi';
import { envanterAyarlariGuncelle } from '../../../lib/pazaryeriDepo';
import { pazaryeriSenkron } from '../../../lib/pazaryeriSenkron';

export const prerender = false;
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
const KANAL = { ty: 'trendyol' } as const;
const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Anlık sipariş bildirimi (webhook). Trendyol sipariş paketi oluştuğunda/durumu değiştiğinde bu adrese POST atar
 * ("x-api-key" başlığıyla). Gövdeye güvenilmez ve saklanmaz (kişisel veri içerir): bildirim yalnız tetikleyicidir,
 * sipariş resmî API'den (aynı 5 dakikalık eşitleme yoluyla) çekilir. Aynı bildirim birden çok kez gelebilir; eşitleme
 * kilitli ve tekrar güvenli olduğu için sorun olmaz. Yanıt hemen döner, eşitleme arka planda çalışır.
 */
export const POST: APIRoute = async ({ request, params }) => {
  const kanal = KANAL[params.kanal as keyof typeof KANAL];
  const beklenen = kanal ? bildirimAnahtari(kanal) : undefined;
  if (!kanal || !beklenen) return new Response(null, { status: 404, headers });
  const gelen = Buffer.from(request.headers.get('x-api-key') ?? '');
  const anahtar = Buffer.from(beklenen);
  if (gelen.length !== anahtar.length || !timingSafeEqual(gelen, anahtar)) return new Response(null, { status: 401, headers });
  await request.body?.cancel().catch(() => undefined);

  arkaPlanda((async () => {
    await envanterAyarlariGuncelle((a) => {
      const b = a.kanallar[kanal].bildirim;
      b.son = new Date().toISOString();
      b.sayi = (b.sayi ?? 0) + 1;
    }).catch(() => undefined);
    // Başka bir eşitleme sürüyorsa 5 sn sonra bir kez daha dene (işlev 60 sn sınırında); olmazsa 5 dakikalık zamanlayıcı yakalar.
    const r = await pazaryeriSenkron('bildirim').catch(() => undefined);
    if (r?.durum === 'bekliyor') {
      await bekle(5000);
      await pazaryeriSenkron('bildirim').catch(() => undefined);
    }
  })(), 'kanal bildirimi');
  return Response.json({ durum: 'alindi' }, { headers });
};

export const ALL: APIRoute = () => new Response(null, { status: 405, headers: { ...headers, Allow: 'POST' } });
