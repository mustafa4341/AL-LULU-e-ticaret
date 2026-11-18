/**
 * Arama motorları ve yapay zekâ aramaları (Google AI Overviews, ChatGPT, Perplexity, Gemini) için
 * mağazanın yapısal verisi. Tüm bilgiler paneldeki GERÇEK ayarlardan üretilir; uydurma puan/yorum yoktur.
 */
import type { SiteAyarlari } from './sema';

const GUNLER: [RegExp, string[]][] = [
  [/her\s*gün/i, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']],
  [/hafta\s*içi/i, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']],
  [/hafta\s*sonu/i, ['Saturday', 'Sunday']],
  [/cumartesi/i, ['Saturday']],
  [/pazar(?!tesi)/i, ['Sunday']],
  [/pazartesi/i, ['Monday']],
  [/salı/i, ['Tuesday']],
  [/çarşamba/i, ['Wednesday']],
  [/perşembe/i, ['Thursday']],
  [/cuma(?!rtesi)/i, ['Friday']],
];
const SAAT = /(\d{1,2})[:.](\d{2})\s*[–—-]\s*(\d{1,2})[:.](\d{2})/;
const iki = (s: string) => s.padStart(2, '0');

/** "Hafta içi 09:00–18:00, Cumartesi 10:00–14:00" → schema.org OpeningHoursSpecification. Anlaşılamazsa boş. */
export function calismaSaatleriVerisi(metin: string): Record<string, unknown>[] {
  return metin.split(/[,;·\n]+/).flatMap((parca) => {
    const saat = SAAT.exec(parca);
    const gunler = GUNLER.find(([d]) => d.test(parca))?.[1];
    if (!saat || !gunler) return [];
    return [{
      '@type': 'OpeningHoursSpecification', dayOfWeek: gunler,
      opens: `${iki(saat[1]!)}:${saat[2]}`, closes: `${iki(saat[3]!)}:${saat[4]}`,
    }];
  });
}

/** Ana sayfa: çevrim içi mağaza + web sitesi */
export function magazaVerisi(site: SiteAyarlari): Record<string, unknown>[] {
  const url = site.url.replace(/\/$/, '');
  const saatler = calismaSaatleriVerisi(site.calismaSaatleri);
  const iletisim = {
    '@type': 'ContactPoint', contactType: 'customer service', email: site.eposta, telephone: site.telefon,
    availableLanguage: 'tr', areaServed: 'TR', ...(saatler.length ? { hoursAvailable: saatler } : {}),
  };
  return [
    {
      '@context': 'https://schema.org', '@type': 'OnlineStore', '@id': `${url}/#magaza`,
      name: site.ad, url, description: site.slogan || undefined,
      logo: `${url}/img/logo/icon-512.png`, image: `${url}/img/logo/al-lulu-home.png`,
      email: site.eposta, telephone: site.telefon, areaServed: { '@type': 'Country', name: 'Türkiye' },
      currenciesAccepted: 'TRY',
      ...(site.satici.unvan.trim() ? { legalName: site.satici.unvan } : {}),
      ...(site.satici.adres.trim() ? { address: { '@type': 'PostalAddress', streetAddress: site.satici.adres, addressCountry: 'TR' } } : {}),
      contactPoint: [iletisim, ...(site.kurumsalEposta ? [{ '@type': 'ContactPoint', contactType: 'sales', email: site.kurumsalEposta, availableLanguage: 'tr' }] : [])],
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy', applicableCountry: 'TR',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: site.iadeGun,
        returnMethod: 'https://schema.org/ReturnByMail', returnFees: 'https://schema.org/FreeReturn',
        merchantReturnLink: `${url}/yasal/iptal-iade-kosullari`,
      },
    },
    { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${url}/#site`, name: site.ad, url, inLanguage: 'tr-TR', publisher: { '@id': `${url}/#magaza` } },
  ];
}
