/**
 * Code 128 barkod (kargo etiketleri için) — dış kütüphane yok, SVG üretir.
 * Kargo takip numarası yalnız rakamsa Code C (iki rakam bir sembol, kısa barkod), değilse Code B kullanılır.
 * Tablo: ISO/IEC 15417 desenleri (her sembol 3 çubuk + 3 boşluk, toplam 11 modül; bitiş 13 modül).
 */

const DESENLER = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
] as const;
export const CODE128_DESENLERI: readonly string[] = DESENLER;

const BASLA_B = 104, BASLA_C = 105, KOD_B = 100, BITIS = 106;

/** Metni Code 128 sembol değerlerine çevirir (başlangıç, veri, sağlama, bitiş). */
export function code128Degerleri(metin: string): number[] {
  if (!metin || metin.length > 80) throw new Error('Barkod metni 1–80 karakter olmalı.');
  if (![...metin].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126)) throw new Error('Barkodda yalnız Latin harf, rakam ve işaret olabilir.');
  const degerler: number[] = [];
  if (/^\d{2,}$/.test(metin)) {
    // Rakamlar ikişer ikişer Code C; tek sayıda rakam varsa sonuncusu Code B'ye geçilerek yazılır.
    degerler.push(BASLA_C);
    let i = 0;
    for (; i + 1 < metin.length; i += 2) degerler.push(Number(metin.slice(i, i + 2)));
    if (i < metin.length) degerler.push(KOD_B, metin.charCodeAt(i) - 32);
  } else {
    degerler.push(BASLA_B, ...[...metin].map((c) => c.charCodeAt(0) - 32));
  }
  const saglama = degerler.reduce((t, d, i) => t + d * Math.max(1, i), 0) % 103;
  return [...degerler, saglama, BITIS];
}

/** Modül dizisi: true = siyah çubuk, false = boşluk (sessiz bölgeler hariç). */
export function code128Moduller(metin: string): boolean[] {
  const moduller: boolean[] = [];
  for (const d of code128Degerleri(metin)) {
    [...DESENLER[d]!].forEach((genislik, i) => { for (let k = 0; k < Number(genislik); k++) moduller.push(i % 2 === 0); });
  }
  return moduller;
}

/**
 * Yazdırmaya uygun SVG. Genişlik CSS ile verilir (ör. 80mm); çubuklar tam modül ölçüsünde, kenar yumuşatma kapalı.
 * Sessiz bölge her iki yanda 10 modül.
 */
export function code128Svg(metin: string, yukseklikModul = 40): string {
  const m = code128Moduller(metin);
  const sessiz = 10;
  const genislik = m.length + sessiz * 2;
  let yol = '';
  for (let i = 0; i < m.length;) {
    if (!m[i]) { i++; continue; }
    let j = i;
    while (j < m.length && m[j]) j++;
    yol += `M${i + sessiz} 0h${j - i}v${yukseklikModul}h-${j - i}z`;
    i = j;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${genislik} ${yukseklikModul}" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="Barkod ${metin.replace(/[<>&"]/g, '')}"><rect width="${genislik}" height="${yukseklikModul}" fill="#fff"/><path d="${yol}" fill="#000"/></svg>`;
}
