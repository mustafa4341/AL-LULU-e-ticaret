import type { APIRoute } from 'astro';
import { faturaImzasiGecerli } from '../../lib/faturaBaglantisi';
import { faturaEki } from '../../lib/finansDepo';

/*
 * İmzalı fatura bağlantısı (bkz. lib/faturaBaglantisi.ts). Hepsiburada müşteriye faturayı bu adresten gösterir.
 * Yalnız PDF, iptal edilmemiş fatura. Arama motorlarına kapalı, önbelleğe alınmaz.
 */
const bulunamadi = () => new Response('Bulunamadı', { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });

export const GET: APIRoute = async ({ params, url }) => {
  const id = params.id ?? '';
  const imza = url.searchParams.get('i') ?? '';
  if (!faturaImzasiGecerli(id, imza)) return bulunamadi();
  const ek = await faturaEki(id).catch(() => undefined);
  if (!ek || ek.kayit.iptal || ek.kayit.ek?.tur !== 'application/pdf') return bulunamadi();
  const ad = ('fatura-' + ek.kayit.no).replace(/[^A-Za-z0-9_-]/g, '_');
  return new Response(new Uint8Array(ek.veri), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${ad}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
};

export const HEAD: APIRoute = async (ctx) => {
  const r = await GET(ctx);
  return new Response(null, { status: r.status, headers: r.headers });
};
