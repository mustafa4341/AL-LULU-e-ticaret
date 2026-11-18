import type { Siparis, SiteAyarlari } from './sema';

export const KARGO_SABLONLARI = [
  { ad: 'Yurtiçi Kargo', url: 'https://www.yurticikargo.com/Tracking/Detail/{kod}' },
  { ad: 'Aras Kargo', url: 'https://www.araskargo.com.tr/Tracking/Detail?trackingNumber={kod}' },
  { ad: 'MNG / DHL', url: 'https://kargotakip.mngkargo.com.tr/?takipNo={kod}' },
  { ad: 'Sürat Kargo', url: 'https://www.suratkargo.com.tr/KargoTakip/?kargotakipno={kod}' },
  { ad: 'PTT Kargo', url: 'https://gonderitakip.ptt.gov.tr/Track/Verify?q={kod}' },
  { ad: 'HepsiJet', url: 'https://www.hepsijet.com/gonderi-takibi/{kod}' },
  { ad: 'Kolay Gelsin', url: 'https://esube.kolaygelsin.com/tulip/tracking/{kod}' },
];

const firmaAnahtari = (ad: string) => ad.trim().toLocaleLowerCase('tr-TR');
export const takipKoduGecerli = (kod: string) => /^[A-Za-z0-9-]{6,40}$/.test(kod) && /[0-9]/.test(kod);

export function takipBaglantisi(sablon: string, kod: string): string | undefined {
  if (!sablon.includes('{kod}') || !takipKoduGecerli(kod)) return undefined;
  const url = URL.parse(sablon.replaceAll('{kod}', encodeURIComponent(kod)));
  if (url?.protocol === 'https:' && !url.username && !url.password) return url.href;
}

export function kargoFirmalari(kargo: SiteAyarlari['kargo']) {
  const ayar = { ad: kargo.firma, url: kargo.takipUrl };
  return [ayar, ...KARGO_SABLONLARI.filter((x) => firmaAnahtari(x.ad) !== firmaAnahtari(ayar.ad))]
    .filter((x) => x.ad && takipBaglantisi(x.url, '123456789'));
}

export function siparisKargoBaglantisi(s: Siparis, kargo: SiteAyarlari['kargo']) {
  if (!s.kargoTakip || !['kargoda', 'teslim-edildi'].includes(s.durum)) return undefined;
  const firma = s.kargoFirma || kargo.firma;
  const kayitli = [...s.gecmis].reverse().find((g) => g.durum === 'kargoda')?.takipUrl;
  const adres = kayitli ? URL.parse(kayitli) : undefined;
  if (adres?.protocol === 'https:' && !adres.username && !adres.password) return { firma, url: adres.href };
  const sablon = kargoFirmalari(kargo).find((x) => firmaAnahtari(x.ad) === firmaAnahtari(firma));
  const url = sablon && takipBaglantisi(sablon.url, s.kargoTakip);
  return url ? { firma, url } : undefined;
}
