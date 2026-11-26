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

/**
 * Yönetim paneli içi güvenli dönüş adresi.
 * Yalnız aynı origin ve `/yonetim` altında kalan adresleri kabul eder; dış adresleri (open-redirect) reddedip `varsayilan`a döner.
 */
export function yonetimGeriAdresi(
  geriHam: string | undefined | null,
  originUrl: URL,
  varsayilan: string,
  bildirim?: { tur: 'ok' | 'hata'; mesaj: string },
  varsayilanHash = '',
): string {
  const ham = (geriHam ?? '').trim();
  const aday = ham ? URL.parse(ham, originUrl.origin) : null;
  const gecerli = Boolean(aday && aday.origin === originUrl.origin && (aday.pathname === '/yonetim' || aday.pathname.startsWith('/yonetim/')));
  const hedef = gecerli && aday ? aday : new URL(varsayilan, originUrl.origin);
  if (bildirim) {
    hedef.searchParams.delete('ok');
    hedef.searchParams.delete('hata');
    hedef.searchParams.set(bildirim.tur, bildirim.mesaj);
  }
  const hash = gecerli ? hedef.hash : (hedef.hash || varsayilanHash);
  return hedef.pathname + hedef.search + hash;
}
