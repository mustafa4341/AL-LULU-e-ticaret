import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import sharp from 'sharp';

let fontOnbellek: { duz: opentype.Font; kalin: opentype.Font } | undefined;

function fontDosyasiOku(ad: string): Buffer {
  const adaylar = [
    path.resolve('public/fonts', ad),
    path.resolve('dist/client/fonts', ad),
  ];
  try { adaylar.push(fileURLToPath(new URL('../../public/fonts/' + ad, import.meta.url))); } catch {}
  try { adaylar.push(fileURLToPath(new URL('../client/fonts/' + ad, import.meta.url))); } catch {}
  for (const p of adaylar) {
    try { return fsSync.readFileSync(p); } catch {}
  }
  throw new Error('Belge yazı tipi bulunamadı: ' + ad);
}

function fontAl(kalin = false): opentype.Font {
  if (!fontOnbellek) {
    const coz = (b: Buffer) => opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    fontOnbellek = {
      duz: coz(fontDosyasiOku('DejaVuSans.ttf')),
      kalin: coz(fontDosyasiOku('DejaVuSans-Bold.ttf')),
    };
  }
  return kalin ? fontOnbellek.kalin : fontOnbellek.duz;
}

/** Metnin gerçek piksel/punto genişliğini ölçer (Vercel Linux'ta sistem fontu gerekmez). */
export function yaziOlc(metin: string, boy: number, kalin = false): number {
  if (!metin) return 0;
  return fontAl(kalin).getAdvanceWidth(metin, boy);
}

export type YaziSecenegi = {
  boy?: number;
  kalin?: boolean;
  renk?: string;
  hiza?: 'start' | 'middle' | 'end';
  opaklik?: number;
  donus?: string;
};

/** Metni gömülü DejaVu Sans ile doğrudan SVG <path> eğrisine çevirir (sunucu fontuna bağımlılık sıfırdır). */
export function yaziYoluSvg(metin: string, x: number, y: number, o: YaziSecenegi = {}): string {
  if (!metin || !metin.trim()) return '';
  const boy = o.boy ?? 9.5;
  const f = fontAl(o.kalin);
  const hiza = o.hiza ?? 'start';
  const en = hiza === 'start' ? 0 : f.getAdvanceWidth(metin, boy);
  const xx = hiza === 'end' ? x - en : hiza === 'middle' ? x - en / 2 : x;
  const d = f.getPath(metin, xx, y, boy).toPathData(2);
  if (!d) return '';
  return '<path d="' + d + '" fill="' + (o.renk ?? '#27231d') + '"'
    + (o.opaklik !== undefined ? ' fill-opacity="' + o.opaklik + '"' : '')
    + (o.donus ? ' transform="' + o.donus + '"' : '')
    + '/>';
}

/** Metni gerçek piksel genişliğine göre satırlara böler; uzun kelimeleri/adresleri taşmadan kırar. */
export function metniSar(metin: string, maxEn: number, boy: number, kalin = false): string[] {
  const sinir = Math.max(24, maxEn);
  const satirlar: string[] = [];
  for (const parca of metin.split(/\r?\n/)) {
    const temiz = parca.trim();
    if (!temiz) { satirlar.push(''); continue; }
    const kelimeler = temiz.split(/\s+/);
    let aktif = '';
    for (const kelime of kelimeler) {
      const aday = aktif ? aktif + ' ' + kelime : kelime;
      if (yaziOlc(aday, boy, kalin) <= sinir) {
        aktif = aday;
        continue;
      }
      if (aktif) {
        satirlar.push(aktif);
        aktif = '';
      }
      if (yaziOlc(kelime, boy, kalin) <= sinir) {
        aktif = kelime;
      } else {
        let dilim = '';
        for (const harf of kelime) {
          if (dilim && yaziOlc(dilim + harf, boy, kalin) > sinir) {
            satirlar.push(dilim);
            dilim = harf;
          } else {
            dilim += harf;
          }
        }
        aktif = dilim;
      }
    }
    if (aktif) satirlar.push(aktif);
  }
  return satirlar;
}

const desenler = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');
export function barkod(deger: string) {
  if (!/^[ -~]{1,55}$/.test(deger)) return undefined;
  const kodlar = Array.from(deger, (c) => c.charCodeAt(0) - 32);
  const kontrol = (104 + kodlar.reduce((t, v, i) => t + v * (i + 1), 0)) % 103;
  let x = 10;
  const cubuklar: { x: number; en: number }[] = [];
  for (const kod of [104, ...kodlar, kontrol, 106]) {
    [...desenler[kod]!].forEach((v, i) => {
      if (i % 2 === 0) cubuklar.push({ x, en: Number(v) });
      x += Number(v);
    });
  }
  return { genislik: x + 10, cubuklar };
}

type Satir = { metin: string; kalin?: boolean; kucuk?: boolean };
export type PdfSayfasi = { baslik: string; alt?: string; satirlar: Satir[]; etiket?: string; barkodlar?: string[] };
export type PdfBicimi = 'a4' | 'etiket';

const logo = async () => {
  const adaylar = ['public/img/logo/yazi.png', 'dist/client/img/logo/yazi.png'];
  try { adaylar.push(fileURLToPath(new URL('../../public/img/logo/yazi.png', import.meta.url))); } catch {}
  for (const p of adaylar) {
    try { return await fs.readFile(p); } catch {}
  }
  throw new Error('Logo bulunamadı');
};

let logoOnbellek: Promise<string> | undefined;
/** Belgelerde kullanılan logo (data URI). Bulunamazsa boş metin döner, belge yazıyla devam eder. */
export const logoDataUri = () => (logoOnbellek ??= logo().then((v) => 'data:image/png;base64,' + v.toString('base64')).catch(() => { logoOnbellek = undefined; return ''; }));
export const htmlKacis = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);

const ptext = (v: string, x: number, y: number, boy: number, kalin = false, renk = '#27231d') =>
  yaziYoluSvg(v, x, y, { boy, kalin, renk });

export function barkodSvg(deger: string, x: number, y: number, en: number, yukseklik = 34) {
  const veri = barkod(deger);
  if (!veri) return '';
  const birim = Math.min(1.75, en / veri.genislik);
  return '<g transform="translate(' + x + ' ' + y + ') scale(' + birim + ' 1)" fill="#141414">' +
    veri.cubuklar.map((c) => '<rect x="' + c.x + '" y="0" width="' + c.en + '" height="' + yukseklik + '"/>').join('') +
    '</g>' + ptext(deger, x + 10 * birim, y + yukseklik + 12, 8.5);
}

async function sayfalariHazirla(sayfalar: PdfSayfasi[], bicim: PdfBicimi) {
  const dar = bicim === 'etiket';
  const w = dar ? 283.46 : 595.28;
  const h = dar ? 425.20 : 841.89;
  const kenar = dar ? 18 : 42;
  const icEn = w - kenar * 2;
  const logoVeri = await logo().catch(() => null);
  const img = logoVeri ? 'data:image/png;base64,' + logoVeri.toString('base64') : '';
  const sayfalarSvg: string[] = [];

  for (const sayfa of sayfalar) {
    let sira = 0;
    const islenmisSatirlar = sayfa.satirlar.flatMap((s, idx) => {
      const kutulu = /^□\s*/.test(s.metin);
      const govde = kutulu ? s.metin.replace(/^□\s*/, '') : s.metin;
      const boy = dar ? (idx === 0 ? 10.2 : s.kucuk ? 8.2 : 8.8) : (idx === 0 ? 12.5 : s.kucuk ? 10 : 11.2);
      const kalin = Boolean(s.kalin || idx === 0);
      const parcalar = metniSar(govde, kutulu ? icEn - 15 : icEn, boy, kalin);
      return parcalar.map((metin, j) => ({ metin, kalin, boy, kutu: kutulu && j === 0, girinti: kutulu ? 15 : 0 }));
    });
    const barkodlar = [...(sayfa.barkodlar ?? [])];

    do {
      let y = dar ? 98 : 148;
      const ust = '<rect width="100%" height="100%" fill="#fff"/>'
        + (dar ? '<rect x="8" y="8" width="' + (w - 16) + '" height="' + (h - 16) + '" rx="6" fill="none" stroke="#c9bda8" stroke-width="0.9"/>' : '')
        + '<rect x="' + kenar + '" y="' + (dar ? 46 : 72) + '" width="' + icEn + '" height="1.8" fill="#ad8a45"/>';
      const logoImg = img
        ? '<image href="' + img + '" x="' + kenar + '" y="' + (dar ? 16 : 19) + '" width="' + (dar ? 96 : 145) + '" height="' + (dar ? 24 : 42) + '" preserveAspectRatio="xMinYMid meet"/>'
        : ptext('AL LULU HOME', kenar, dar ? 35 : 42, dar ? 13 : 16, true);
      const baslik = ptext(sayfa.baslik, kenar, dar ? 66 : 105, dar ? 11.5 : 20, true);
      const alt = sayfa.alt ? ptext(sayfa.alt, kenar, dar ? 81 : 124, dar ? 8.5 : 11, true, '#665948') : '';
      let icerik = ust + logoImg + baslik + alt;

      while (sira < islenmisSatirlar.length && y < h - (barkodlar.length ? 86 : 42)) {
        const v = islenmisSatirlar[sira++]!;
        if (v.kutu) {
          const kb = dar ? 8 : 9.5;
          icerik += '<rect x="' + kenar + '" y="' + (y - kb + 1).toFixed(1) + '" width="' + kb + '" height="' + kb + '" rx="1.5" fill="#fff" stroke="#5b5043" stroke-width="0.9"/>';
        }
        if (/^—.*—$/.test(v.metin)) {
          y += 3;
          icerik += '<line x1="' + kenar + '" y1="' + (y - v.boy + 2).toFixed(1) + '" x2="' + (w - kenar) + '" y2="' + (y - v.boy + 2).toFixed(1) + '" stroke="#dfd6c5" stroke-width="0.8"/>';
          icerik += ptext(v.metin.replace(/^—\s*|\s*—$/g, '').toLocaleUpperCase('tr'), kenar, y + 3, dar ? 7.5 : 9, true, '#8b6a2f');
          y += dar ? 15 : 20;
          continue;
        }
        icerik += ptext(v.metin, kenar + v.girinti, y, v.boy, v.kalin);
        y += dar ? 13.2 : 18;
      }

      while (barkodlar.length && y + 58 < h - 22 && sira >= islenmisSatirlar.length) {
        y += 4;
        icerik += barkodSvg(barkodlar.shift()!, kenar, y, icEn, dar ? 30 : 36);
        y += dar ? 54 : 62;
      }

      icerik += ptext(sayfa.etiket ?? 'AL LULU HOME · Mağaza kaydı', kenar, h - (dar ? 16 : 24), dar ? 7.2 : 8.5, false, '#665948');
      sayfalarSvg.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + icerik + '</svg>');
    } while (sira < islenmisSatirlar.length || barkodlar.length);
  }
  return { w, h, sayfalarSvg };
}

export async function pdfUret(sayfalar: PdfSayfasi[], bicim: PdfBicimi = 'a4') {
  if (!sayfalar.length) throw new Error('Belge için içerik bulunamadı.');
  const { w, h, sayfalarSvg } = await sayfalariHazirla(sayfalar, bicim);
  return svgdenPdf(sayfalarSvg, w, h, bicim === 'etiket' ? 260 : 175);
}

/** Hazır SVG sayfalarını önizleme görseline (PNG) çevirir. */
export async function svgdenPng(svg: string, density = 120) {
  return sharp(Buffer.from(svg), { density }).flatten({ background: '#fff' }).png({ compressionLevel: 8 }).toBuffer();
}

/** Hazır SVG sayfalarından PDF üretir (her sayfa yüksek çözünürlüklü görsel olarak gömülür). */
export async function svgdenPdf(sayfalarSvg: string[], w: number, h: number, density = 175) {
  if (!sayfalarSvg.length) throw new Error('Belge için içerik bulunamadı.');
  const nesneler: Buffer[] = [];
  const ekle = (v: string | Buffer) => nesneler.push(Buffer.isBuffer(v) ? v : Buffer.from(v, 'ascii'));
  const akim = (veri: Buffer, ek = '') => Buffer.concat([Buffer.from('<< /Length ' + veri.length + ' ' + ek + ' >>\nstream\n', 'ascii'), veri, Buffer.from('\nendstream', 'ascii')]);
  ekle('<< /Type /Catalog /Pages 2 0 R >>');
  ekle('<< /Type /Pages /Count ' + sayfalarSvg.length + ' /Kids [' + sayfalarSvg.map((_, i) => (i * 3 + 3) + ' 0 R').join(' ') + '] >>');
  for (const svg of sayfalarSvg) {
    const { data, info } = await sharp(Buffer.from(svg), { density })
      .flatten({ background: '#fff' }).toColorspace('srgb').jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toBuffer({ resolveWithObject: true });
    const resim = nesneler.length + 2;
    ekle('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + w + ' ' + h + '] /Resources << /XObject << /I ' + resim + ' 0 R >> >> /Contents ' + (resim + 1) + ' 0 R >>');
    ekle(akim(data, '/Type /XObject /Subtype /Image /Width ' + info.width + ' /Height ' + info.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode'));
    ekle(akim(Buffer.from('q ' + w + ' 0 0 ' + h + ' 0 0 cm /I Do Q', 'ascii')));
  }
  const parcalar = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const adresler: number[] = [];
  let adres = parcalar[0]!.length;
  nesneler.forEach((n, i) => {
    adresler.push(adres);
    const parca = Buffer.concat([Buffer.from((i + 1) + ' 0 obj\n'), n, Buffer.from('\nendobj\n')]);
    parcalar.push(parca);
    adres += parca.length;
  });
  parcalar.push(Buffer.from('xref\n0 ' + (nesneler.length + 1) + '\n0000000000 65535 f \n' +
    adresler.map((v) => String(v).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer\n<< /Size ' + (nesneler.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + adres + '\n%%EOF\n'));
  return Buffer.concat(parcalar);
}
