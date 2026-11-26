import type { APIRoute } from 'astro';
import { faturaEki, finansOku } from '../../../lib/finansDepo';
import { dosyaYaniti } from '../../../lib/finansDisari';
import { faturaKanalLinki, kanalFaturaDosyasiniTamamla } from '../../../lib/faturaKanaldan';

export const prerender = false;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const bilgiSayfasi = (baslik: string, aciklama: string, faturaUrl = '/yonetim/finans/faturalar', status = 200) =>
  new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(baslik)}</title>
  <style>body{font-family:system-ui,-apple-system,sans-serif;background:#f7f3ec;color:#2b2017;margin:0;padding:32px 16px;display:grid;place-items:center;min-height:80vh}
  .kart{max-width:520px;background:#fff;border:1px solid #e4d9ca;border-radius:16px;padding:26px;box-shadow:0 8px 24px rgba(0,0,0,.05)}
  h1{font-size:19px;margin:0 0 10px}p{font-size:14.5px;line-height:1.55;color:#5c4f42;margin:0 0 18px}
  .dugmeler{display:flex;flex-wrap:wrap;gap:10px}a{display:inline-flex;align-items:center;padding:10px 16px;border-radius:10px;font-weight:650;font-size:14px;text-decoration:none;border:1px solid #cbbba6;color:#2b2017;background:#fff}
  a.ana{background:#2d2218;border-color:#2d2218;color:#fff}</style></head>
  <body><main class="kart"><h1>${esc(baslik)}</h1><p>${esc(aciklama)}</p>
  <div class="dugmeler"><a class="ana" href="${esc(faturaUrl)}">Faturalar Ekranına Dön</a><a href="https://partner.trendyol.com" target="_blank" rel="noopener">Trendyol Satıcı Panelini Aç ↗</a></div></main></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get('id') ?? '';
  let ek = await faturaEki(id);
  if (!ek?.kayit.ek) {
    const kayit = (await finansOku()).faturalar.find((x) => x.id === id);
    if (!kayit) return bilgiSayfasi('Fatura kaydı bulunamadı', 'Aradığınız fatura kaydı silinmiş veya bulunamıyor.', '/yonetim/finans/faturalar', 404);
    const secUrl = `/yonetim/finans/faturalar?sec=${encodeURIComponent(kayit.kanal + ':' + kayit.kayit)}#secili`;
    if (!faturaKanalLinki(kayit)) {
      return bilgiSayfasi('Fatura PDF dosyası henüz eklenmemiş', `${kayit.siparisNo} numaralı siparişin fatura numarası kayıtlı ancak PDF dosyası yüklenmemiş. Faturalar ekranından PDF dosyasını ekleyebilirsiniz.`, secUrl, 404);
    }
    const r = await kanalFaturaDosyasiniTamamla(kayit);
    if (!r.tamam) {
      return bilgiSayfasi(
        'Fatura Trendyol’da yüklü (PDF satıcı panelinde)',
        `${kayit.siparisNo} numaralı siparişin faturası Trendyol satıcı paneline yüklenmiş ve iletimi tamamlanmış durumda. Trendyol API güvenlik politikası gereği müşteri faturasının PDF kopyasını dışarıya vermediği için dosyayı Trendyol Satıcı Paneli’nden görüntüleyebilir veya bilgisayarınızdaki GİB PDF’ini Faturalar ekranından yükleyebilirsiniz.`,
        secUrl,
        200,
      );
    }
    ek = await faturaEki(id);
    if (!ek?.kayit.ek) return bilgiSayfasi('Fatura dosyası okunamadı', 'Sayfayı yenileyip tekrar deneyin.', secUrl, 503);
  }
  return dosyaYaniti(ek.veri, ek.kayit.ek!.tur, ek.kayit.ek!.ad, true);
};
