import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import { YUKLEME_KOKU } from '../../lib/depo';

/* Panelden yüklenen görselleri sunar: /medya/{klasor}/{dosya}.webp */
const TURLER: Record<string, string> = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

export const GET: APIRoute = async ({ params }) => {
  const tam = path.resolve(YUKLEME_KOKU, params.yol ?? '');
  if (!tam.startsWith(YUKLEME_KOKU + path.sep)) return new Response('Bulunamadı', { status: 404 });
  const tur = TURLER[path.extname(tam).toLowerCase()];
  if (!tur) return new Response('Bulunamadı', { status: 404 });
  try {
    const veri = await fs.readFile(tam);
    return new Response(veri, { headers: { 'Content-Type': tur, 'Cache-Control': 'public, max-age=31536000, immutable' } });
  } catch {
    return new Response('Bulunamadı', { status: 404 });
  }
};
