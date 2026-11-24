/* Yönetim paneli form yardımcıları */
export const metin = (f: FormData, ad: string) => String(f.get(ad) ?? '').trim();
export const istegeBagli = (f: FormData, ad: string) => metin(f, ad) || undefined;
/**
 * Elle ya da tarayıcının sayı alanından gelen sayıyı okur.
 *  - Virgül varsa Türkçe yazım: "1.299,90" → 1299.9 (nokta binlik)
 *  - Yalnız binlik nokta: "1.299", "12.999" → 1299, 12999
 *  - Diğer noktalı değer ondalıktır: "1299.90" (type="number" alanı her zaman böyle gönderir) → 1299.9
 * Eskiden nokta her durumda silindiği için "1299.90" 129.990 TL olarak kaydediliyordu (denetim AUD-005).
 */
export function sayiCoz(ham: string): number | undefined {
  const s = ham.replace(/\s|TL|₺/gi, '');
  if (!s) return undefined;
  const duz = s.includes(',') ? s.replace(/\./g, '').replace(',', '.')
    : /^-?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '')
    : s;
  const n = Number(duz);
  return Number.isFinite(n) ? n : undefined;
}
export const sayi = (f: FormData, ad: string, varsayilan = 0) => {
  const n = sayiCoz(metin(f, ad));
  return n === undefined ? varsayilan : Math.round(n);
};
export const evet = (f: FormData, ad: string) => f.get(ad) === 'on' || f.get(ad) === '1' || f.get(ad) === 'true';
export const liste = (f: FormData, ad: string) => f.getAll(ad).map((x) => String(x).trim());
export const satirlar = (f: FormData, ad: string) => metin(f, ad).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
/** Paralel dizilerden satır listesi: ör. teknik_etiket[] + teknik_deger[] */
export function ciftler(f: FormData, a: string, b: string): [string, string][] {
  const x = liste(f, a), y = liste(f, b);
  return x.map((v, i) => [v, y[i] ?? ''] as [string, string]).filter(([p, q]) => p && q);
}

const TR: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', I: 'i', Ö: 'o', Ş: 's', Ü: 'u' };
export function kod(s: string): string {
  return s.replace(/[çğıiöşüÇĞİIÖŞÜ]/g, (c) => TR[c] ?? c).toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'kayit';
}
export function benzersizKod(taban: string, mevcut: Set<string>): string {
  let k = kod(taban), i = 2;
  while (mevcut.has(k)) k = `${kod(taban)}-${i++}`;
  return k;
}
