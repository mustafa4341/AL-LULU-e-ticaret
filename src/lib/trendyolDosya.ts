import { aralikta, gecerliGun, paraOku, trendyolSema } from './finans';
import { xlsxParcalari } from './finansArsiv';

export function csvOku(s: string) {
  const ilk = s.split(/\r?\n/, 1)[0] ?? '';
  const ayrac = ilk.includes(';') ? ';' : ilk.includes('\t') ? '\t' : ',';
  const tablo: string[][] = [];
  let satir: string[] = [];
  let alan = '';
  let tirnak = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '"') {
      if (tirnak && s[i + 1] === '"') { alan += '"'; i++; }
      else tirnak = !tirnak;
    } else if (!tirnak && (c === ayrac || c === '\n' || c === '\r')) {
      satir.push(alan.trim());
      alan = '';
      if (c !== ayrac) {
        if (satir.some(Boolean)) tablo.push(satir);
        satir = [];
        if (c === '\r' && s[i + 1] === '\n') i++;
      }
    } else alan += c;
  }
  if (tirnak) throw new Error('CSV dosyasında kapanmamış bir metin alanı var.');
  if (alan || satir.length) tablo.push([...satir, alan.trim()]);
  return tablo;
}

const xmlMetin = (s: string) => s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (etiket) => {
  const deger = ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" } as Record<string, string>)[etiket];
  if (deger) return deger;
  const kod = etiket.startsWith('&#x') ? parseInt(etiket.slice(3, -1), 16) : parseInt(etiket.slice(2, -1), 10);
  return Number.isInteger(kod) && kod >= 0 && kod <= 0x10ffff ? String.fromCodePoint(kod) : '';
});
export function excelOku(veri: Buffer) {
  const { sayfa, ortak } = xlsxParcalari(veri);
  const t = (s: string) => [...s.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((x) => xmlMetin(x[1]!)).join('');
  const metinler = [...ortak.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((m) => t(m[1]!));
  return [...sayfa.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)].slice(0, 3001).map((m) => {
    const degerler: string[] = [];
    for (const h of m[1]!.matchAll(/<c\s([^>]*?)(?<!\/)>([\s\S]*?)<\/c>/g)) {
      const ref = /\br="([A-Z]+)\d+"/.exec(h[1]!)?.[1] ?? '';
      const index = [...ref].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
      if (index < 0 || index > 99) continue;
      const tip = /\bt="([^"]+)"/.exec(h[1]!)?.[1];
      const deger = /<v>([^<]*)<\/v>/.exec(h[2]!)?.[1] ?? '';
      degerler[index] = tip === 'inlineStr' ? t(h[2]!) : tip === 's' ? metinler[Number(deger)] ?? '' : xmlMetin(deger);
    }
    return degerler;
  });
}

export const TRENDYOL_BASLIK = ['Kayıt no', 'Tarih', 'Brüt satış', 'Satıcı indirimi', 'İadeler', 'Komisyon', 'Hizmet bedeli', 'Kargo kesintisi', 'Diğer kesinti', 'Bankaya geçen'];
export const TRENDYOL_SUTUNLAR = ['id', 'tarih', 'brut', 'indirim', 'iade', 'komisyon', 'hizmet', 'kargo', 'diger', 'banka'] as const;
const metinKodu = (v: string) => v.trim().toLocaleLowerCase('tr').normalize('NFD').replace(/\p{Diacritic}/gu, '').replaceAll('ı','i').replace(/[^a-z0-9]/g, '');
function tarihCoz(tarih: string) {
  const tr = /^(\d{2})[./](\d{2})[./](\d{4})$/.exec(tarih);
  if (tr) return [tr[3], tr[2], tr[1]].join('-');
  const n = Number(tarih);
  if (/^\d+(?:\.\d+)?$/.test(tarih) && n > 10000 && n < 90000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 864e5).toISOString().slice(0, 10);
  return tarih;
}
export async function trendyolDosyasi(dosya: File) {
  if (!dosya.size || dosya.size > 4 * 1024 * 1024) throw new Error('En fazla 4 MB bir CSV veya XLSX dosyası yükleyin.');
  const veri = Buffer.from(await dosya.arrayBuffer());
  const sutunlar = dosya.name.toLowerCase().endsWith('.xlsx') ? excelOku(veri)
    : dosya.name.toLowerCase().endsWith('.csv') ? csvOku(veri.toString('utf8').replace(/^\uFEFF/, '')) : [];
  const [baslik, ...satirlar] = sutunlar;
  if (!baslik || !satirlar.length || satirlar.length > 3000) throw new Error('Dosya 1–3000 dolu veri satırı içermeli.');
  const sira = TRENDYOL_BASLIK.map((ad, i) => baslik.findIndex((x) => [metinKodu(ad), TRENDYOL_SUTUNLAR[i]].includes(metinKodu(x ?? ''))));
  if (sira.slice(0, 9).some((i) => i < 0)) throw new Error('Sütunlar eşleşmedi. Paneldeki Trendyol CSV şablonunu kullanın.');
  const kimlikler = new Set<string>();
  return satirlar.filter((r) => r.some(Boolean)).map((r, i) => {
    try {
      const v = sira.map((x) => (r[x] ?? '').trim());
      const tarih = tarihCoz(v[1] ?? '');
      if (!gecerliGun(tarih) || !aralikta(tarih, '2000-01-01', '2099-12-31')) throw new Error('Tarih geçersiz.');
      const [brut, indirim, iade, komisyon, hizmet, kargo, diger] = v.slice(2, 9).map((x) => paraOku(x || '0'));
      const kayit = trendyolSema.parse({ id: v[0], tarih, brut, indirim, iade, komisyon, hizmet, kargo, diger, banka: v[9] ? paraOku(v[9]) : undefined });
      if (kimlikler.has(kayit.id)) throw new Error('Kayıt no tekrarlanıyor.');
      kimlikler.add(kayit.id);
      return kayit;
    } catch (e) {
      throw new Error((i + 2) + '. satır · ' + (e instanceof Error && e.name !== 'ZodError' ? e.message : 'Kayıt no veya tutar geçersiz.'));
    }
  });
}
