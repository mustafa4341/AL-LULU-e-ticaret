/* Ürün fiyat değişikliği kuralları (panelin tüm ekranları bunu kullanır) */
import type { Urun } from './sema';

/**
 * Fiyatı değiştirir ve geçmişe yazar.
 * kampanyaGoster = true ise fiyat düşüşü "indirim" olarak gösterilir; önceki fiyat
 * GEÇMİŞTEN otomatik hesaplanır (elle girilemez). undefined ise mevcut kampanya korunur.
 */
export function fiyatUygula(u: Urun, yeniFiyat: number, kampanyaGoster?: boolean, etiket?: string): void {
  const simdi = new Date().toISOString();
  const eskiFiyat = u.fiyat;
  if (!u.fiyatGecmisi.length) u.fiyatGecmisi.push({ tarih: simdi, fiyat: eskiFiyat });
  if (yeniFiyat !== eskiFiyat) {
    u.fiyat = yeniFiyat;
    u.fiyatGecmisi.push({ tarih: simdi, fiyat: yeniFiyat });
    if (u.fiyatGecmisi.length > 200) u.fiyatGecmisi = u.fiyatGecmisi.slice(-200);
  }
  if (kampanyaGoster === undefined) {
    if (u.kampanya && yeniFiyat > eskiFiyat) u.kampanya = null; // fiyat artarsa kampanya biter
    return;
  }
  if (!kampanyaGoster) { u.kampanya = null; return; }
  if (u.kampanya && yeniFiyat <= eskiFiyat) { u.kampanya.etiket = etiket || undefined; return; }
  // Yeni kampanya: fiyat şimdi düşürüldüyse başlangıç şimdi; düşürülmediyse son düşüşün tarihi
  const son = [...u.fiyatGecmisi].reverse();
  let baslangic = simdi;
  for (let i = 0; i < son.length - 1; i++) {
    if (son[i]!.fiyat < son[i + 1]!.fiyat) { baslangic = son[i]!.tarih; break; }
    if (son[i]!.fiyat > son[i + 1]!.fiyat) break;
  }
  u.kampanya = { baslangic, etiket: etiket || undefined };
}
