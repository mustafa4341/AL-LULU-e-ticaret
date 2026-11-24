/** İstek yardımcıları (sunucu). */

/**
 * Tarayıcının önyükleme (prefetch) isteği mi? Chrome/Edge `Sec-Purpose: prefetch`, Firefox `Purpose: prefetch`,
 * Astro'nun önyüklemesi `<link rel="prefetch">` ile aynı başlığı gönderir. Bu isteklerde yan etkili iş
 * (yedek tarihi yazma, görünüm çerezini değiştirme) yapılmaz.
 */
export function onyuklemeMi(request: Request): boolean {
  const amac = `${request.headers.get('sec-purpose') ?? ''} ${request.headers.get('purpose') ?? ''} ${request.headers.get('x-purpose') ?? ''}`;
  return /prefetch|preview/i.test(amac);
}

/** Dış kaynaktan (pazaryeri API'si vb.) gelen bağlantı yalnız https ise kullanılır; "javascript:" gibi değerler düşer (denetim AUD-030). */
export function guvenliBaglanti(deger: string | undefined | null): string | undefined {
  if (!deger) return undefined;
  return URL.canParse(deger) && new URL(deger).protocol === 'https:' ? deger : undefined;
}
