import type { APIRoute } from 'astro';
import { faturaEki, finansOku } from '../../../lib/finansDepo';
import { dosyaYaniti } from '../../../lib/finansDisari';
import { faturaKanalLinki, kanalFaturaDosyasiniTamamla } from '../../../lib/faturaKanaldan';

export const prerender = false;

const metinYaniti = (mesaj: string, status = 404) =>
  new Response(mesaj, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

/**
 * Kayıtlı fatura dosyasını indirir (yalnız yönetici; /yonetim altı oturum ister).
 * Trendyol'dan alınmış ama dosyası henüz eklenmemiş faturada dosya o an Trendyol'dan (API kimliğiyle) indirilip
 * kayda eklenir: Trendyol bağlantısı tarayıcıda doğrudan açılınca giriş istediği için hata veriyordu (25.11.2026).
 */
export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get('id') ?? '';
  let ek = await faturaEki(id);
  if (!ek?.kayit.ek) {
    const kayit = (await finansOku()).faturalar.find((x) => x.id === id);
    if (!kayit) return metinYaniti('Fatura kaydı bulunamadı.');
    if (!faturaKanalLinki(kayit)) return metinYaniti('Bu faturanın dosyası eklenmemiş. Faturalar ekranından PDF yükleyin.');
    const r = await kanalFaturaDosyasiniTamamla(kayit);
    if (!r.tamam) return metinYaniti(`Fatura dosyası Trendyol’dan alınamadı (${r.hata ?? 'bilinmeyen sebep'}). Trendyol satıcı panelinde siparişin faturasını açabilir ya da PDF’i buraya yükleyebilirsiniz.`, 502);
    ek = await faturaEki(id);
    if (!ek?.kayit.ek) return metinYaniti('Fatura dosyası kaydedildi ama okunamadı. Sayfayı yenileyip tekrar deneyin.', 503);
  }
  return dosyaYaniti(ek.veri, ek.kayit.ek!.tur, ek.kayit.ek!.ad, true);
};
