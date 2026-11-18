import type { APIRoute } from 'astro';
import { gorselOku } from '../../lib/depo';

/* Panelden yüklenen görselleri sunar (yerel önbellek + Supabase): /medya/{klasor}/{dosya}.webp */
export const GET: APIRoute = async ({ params }) => {
  const sonuc = await gorselOku(params.yol ?? '');
  if (!sonuc) return new Response('Bulunamadı', { status: 404 });
  return new Response(new Uint8Array(sonuc.veri), {
    headers: {
      'Content-Type': sonuc.tur,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
