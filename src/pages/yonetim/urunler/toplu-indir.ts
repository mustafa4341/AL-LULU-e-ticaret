import type { APIRoute } from 'astro';
import { magazaOku } from '../../../lib/depo';
import { csvOlustur } from '../../../lib/finansArsiv';
import { dosyaYaniti, xlsxOlustur } from '../../../lib/finansDisari';
import { envanterAyarlariOku } from '../../../lib/pazaryeriDepo';
import { topluSablon } from '../../../lib/topluGuncelleme';

/** Toplu fiyat/stok şablonu: tüm ürünler güncel değerleriyle (?bicim=csv → CSV, varsayılan Excel) */
export const GET: APIRoute = async ({ url }) => {
  const [m, a] = await Promise.all([magazaOku(), envanterAyarlariOku()]);
  const tablo = topluSablon(m, a);
  const gun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
  if (url.searchParams.get('bicim') === 'csv') return dosyaYaniti(csvOlustur(tablo), 'text/csv; charset=utf-8', `urunler-fiyat-stok-${gun}.csv`);
  return dosyaYaniti(xlsxOlustur([{ ad: 'Ürünler', satirlar: tablo }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', `urunler-fiyat-stok-${gun}.xlsx`);
};
