/**
 * Arama motorları ve yapay zekâ aramaları (Google AI Overviews, ChatGPT, Perplexity, Gemini) için
 * mağazanın yapısal verisi. Tüm bilgiler paneldeki GERÇEK ayarlardan üretilir; uydurma puan/yorum yoktur.
 */
import type { SiteAyarlari, Urun } from './sema';
import { markaliUrunAdi } from './urunKimlik';
import { bosYasalBilgi } from './yonetimSite';

export function xmlMetni(deger: string): string {
  return deger.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function metaAciklama(metin: string): string {
  const duz = metin.replace(/\s+/g, ' ').trim();
  if (duz.length <= 160) return duz;
  return duz.slice(0, 159).replace(/\s+\S*$/, '') + '…';
}

export function katalogSayfasiVerisi(url: string, ad: string, aciklama: string, urunler: readonly Urun[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#katalog`,
    url, name: ad, description: aciklama, inLanguage: 'tr-TR',
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: urunler.length,
      itemListElement: urunler.map((u, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: markaliUrunAdi(u),
        url: new URL(`/urun/${u.id}`, url).href,
      })),
    },
  };
}

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

const HAFTA: [RegExp, string][] = [
  [/pazartesi/i, 'Monday'], [/salı/i, 'Tuesday'], [/çarşamba/i, 'Wednesday'], [/perşembe/i, 'Thursday'],
  [/cuma(?!rtesi)/i, 'Friday'], [/cumartesi/i, 'Saturday'], [/pazar(?!tesi)/i, 'Sunday'],
];
/** "Pazartesi–Cuma" gibi gün aralığı → aradaki tüm günler (eskiden yalnız ilk gün alınıyordu — denetim AUD-028) */
function gunAraligi(metin: string): string[] | undefined {
  const bulunan = HAFTA.map(([d, ad], i) => ({ i, ad, yer: metin.search(d) })).filter((x) => x.yer >= 0).sort((a, b) => a.yer - b.yer);
  if (bulunan.length !== 2) return undefined;
  const [ilk, son] = bulunan as [typeof bulunan[number], typeof bulunan[number]];
  if (!/[–—-]/.test(metin.slice(ilk.yer, son.yer))) return undefined;
  const gunler: string[] = [];
  for (let i = ilk.i; ; i = (i + 1) % 7) { gunler.push(HAFTA[i]![1]); if (i === son.i) break; }
  return gunler;
}

/** "Hafta içi 09:00–18:00, Cumartesi 10:00–14:00" → schema.org OpeningHoursSpecification. Anlaşılamazsa boş. */
export function calismaSaatleriVerisi(metin: string): Record<string, unknown>[] {
  return metin.split(/[,;·\n]+/).flatMap((parca) => {
    const saat = SAAT.exec(parca);
    const gunler = gunAraligi(saat ? parca.slice(0, saat.index) : parca) ?? GUNLER.find(([d]) => d.test(parca))?.[1];
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
    '@type': 'ContactPoint', contactType: 'customer service', email: site.eposta,
    availableLanguage: 'tr', areaServed: 'TR', ...(saatler.length ? { hoursAvailable: saatler } : {}),
  };
  return [
    {
      '@context': 'https://schema.org', '@type': 'OnlineStore', '@id': `${url}/#magaza`,
      name: site.ad, url, description: site.slogan || undefined,
      logo: `${url}/img/logo/icon-512.png`, image: `${url}/img/logo/al-lulu-home.png`,
      email: site.eposta, areaServed: { '@type': 'Country', name: 'Türkiye' },
      currenciesAccepted: 'TRY',
      // "[Ticari Unvan]" gibi doldurulmamış şablonlar Google'a gönderilmez; panelde gerçek bilgi girilince otomatik eklenir
      ...(!bosYasalBilgi(site.satici.unvan) ? { legalName: site.satici.unvan } : {}),
      ...(!bosYasalBilgi(site.satici.adres) ? { address: { '@type': 'PostalAddress', streetAddress: site.satici.adres, addressCountry: 'TR' } } : {}),
      ...(!bosYasalBilgi(site.satici.vergiDairesiNo) && /\d{10,11}/.test(site.satici.vergiDairesiNo) ? { taxID: site.satici.vergiDairesiNo.match(/\d{10,11}/)![0] } : {}),
      contactPoint: [iletisim, ...(site.kurumsalEposta ? [{ '@type': 'ContactPoint', contactType: 'sales', email: site.kurumsalEposta, availableLanguage: 'tr' }] : [])],
      // Panelde girilen sosyal medya hesapları: Google'a "bu hesaplar bu mağazanın" bilgisi
      ...(() => { const sameAs = Object.values(site.sosyal ?? {}).filter((x) => /^https:\/\//.test(x)); return sameAs.length ? { sameAs } : {}; })(),
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy', '@id': `${url}/#iade-politikasi`, applicableCountry: 'TR',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: site.iadeGun,
        returnMethod: 'https://schema.org/ReturnByMail', returnFees: 'https://schema.org/FreeReturn',
        merchantReturnLink: `${url}/yasal/iptal-iade-kosullari`,
      },
    },
    { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${url}/#site`, name: site.ad, url, inLanguage: 'tr-TR', publisher: { '@id': `${url}/#magaza` } },
  ];
}
