import { timingSafeEqual } from 'node:crypto';
import type { APIRoute } from 'astro';
import { pazaryeriOrtam } from '../../lib/pazaryeriApi';
import { pazaryeriSenkron } from '../../lib/pazaryeriSenkron';

export const prerender = false;
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

/**
 * Zamanlayıcı ucu. İki anahtar kabul edilir:
 *  - CRON_SECRET: GitHub Actions (yedek; GitHub zamanlaması saatlerce gecikebiliyor)
 *  - ZAMANLAYICI_ANAHTARI: Supabase pg_cron + pg_net (asıl, 5 dakikada bir; anahtar Supabase Vault'ta)
 */
export const GET: APIRoute = async ({ request }) => {
  const anahtarlar = [pazaryeriOrtam('CRON_SECRET'), pazaryeriOrtam('ZAMANLAYICI_ANAHTARI')].filter((x): x is string => !!x && x.length >= 32);
  if (!anahtarlar.length) return new Response(null, { status: 404, headers });
  const gelen = Buffer.from(request.headers.get('authorization') ?? '');
  const gecerli = anahtarlar.some((a) => {
    const beklenen = Buffer.from(`Bearer ${a}`);
    return gelen.length === beklenen.length && timingSafeEqual(gelen, beklenen);
  });
  if (!gecerli) return new Response(null, { status: 401, headers });
  try {
    const sonuc = await pazaryeriSenkron('zamanlayici');
    return Response.json(sonuc, { status: sonuc.durum === 'hata' ? 503 : 200, headers });
  } catch (e) {
    const hata = e instanceof Error ? e.name : 'Bilinmeyen hata';
    console.error('[pazaryeri] Senkronizasyon başlatılamadı:', hata);
    return Response.json({ durum: 'hata' }, { status: 503, headers });
  }
};
