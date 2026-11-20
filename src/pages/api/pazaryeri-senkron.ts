import { timingSafeEqual } from 'node:crypto';
import type { APIRoute } from 'astro';
import { pazaryeriOrtam } from '../../lib/pazaryeriApi';
import { pazaryeriSenkron } from '../../lib/pazaryeriSenkron';

export const prerender = false;
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

export const GET: APIRoute = async ({ request }) => {
  const gizli = pazaryeriOrtam('CRON_SECRET');
  if (!gizli || gizli.length < 32) return new Response(null, { status: 404, headers });
  const beklenen = Buffer.from(`Bearer ${gizli}`);
  const gelen = Buffer.from(request.headers.get('authorization') ?? '');
  if (gelen.length !== beklenen.length || !timingSafeEqual(gelen, beklenen)) {
    return new Response(null, { status: 401, headers });
  }
  try {
    const sonuc = await pazaryeriSenkron('zamanlayici');
    return Response.json(sonuc, { status: sonuc.durum === 'hata' ? 503 : 200, headers });
  } catch (e) {
    const hata = e instanceof Error ? e.name : 'Bilinmeyen hata';
    console.error('[pazaryeri] Senkronizasyon başlatılamadı:', hata);
    return Response.json({ durum: 'hata' }, { status: 503, headers });
  }
};
