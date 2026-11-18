import fs from 'node:fs/promises';
import sharp from 'sharp';

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
const logo = () => fs.readFile('public/img/logo/yazi.png').catch(() => fs.readFile('dist/client/img/logo/yazi.png'));
let logoOnbellek: Promise<string> | undefined;
/** Belgelerde kullanılan logo (data URI). Bulunamazsa boş metin döner, belge yazıyla devam eder. */
export const logoDataUri = () => (logoOnbellek ??= logo().then((v) => 'data:image/png;base64,' + v.toString('base64')).catch(() => { logoOnbellek = undefined; return ''; }));
export const htmlKacis = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
const ptext = (v: string, x: number, y: number, boy: number, kalin = false, renk = '#27231d') =>
  '<text x="' + x + '" y="' + y + '" fill="' + renk + '" font-family="Arial, DejaVu Sans, sans-serif" font-size="' + boy + '" font-weight="' + (kalin ? 700 : 400) + '">' + htmlKacis(v) + '</text>';
function bol(s: string, n: number) {
  const satirlar: string[] = [];
  for (const parca of s.split(/\r?\n/)) {
    let kalan = parca.trim();
    while (kalan.length > n) {
      const bos = kalan.lastIndexOf(' ', n);
      const i = bos >= Math.floor(n / 2) ? bos : n;
      satirlar.push(kalan.slice(0, i));
      kalan = kalan.slice(i).trimStart();
    }
    satirlar.push(kalan);
  }
  return satirlar;
}
export function barkodSvg(deger: string, x: number, y: number, en: number, yukseklik = 34) {
  const veri = barkod(deger);
  if (!veri) return '';
  const birim = Math.min(1.75, en / veri.genislik);
  return '<g transform="translate(' + x + ' ' + y + ') scale(' + birim + ' 1)" fill="#141414">' +
    veri.cubuklar.map((c) => '<rect x="' + c.x + '" y="0" width="' + c.en + '" height="' + yukseklik + '"/>').join('') +
    '</g>' + ptext(deger, x + 10 * birim, y + yukseklik + 13, 9);
}
async function sayfalariHazirla(sayfalar: PdfSayfasi[], bicim: PdfBicimi) {
  const dar = bicim === 'etiket';
  const w = dar ? 283.46 : 595.28;
  const h = dar ? 425.20 : 841.89;
  const kenar = dar ? 20 : 42;
  const logoVeri = await logo().catch(() => null);
  const img = logoVeri ? 'data:image/png;base64,' + logoVeri.toString('base64') : '';
  const sayfalarSvg: string[] = [];
  for (const sayfa of sayfalar) {
    let sira = 0;
    const satirlar = sayfa.satirlar.flatMap((s) => bol(s.metin, dar ? 35 : 78).map((metin) => ({ ...s, metin })));
    const barkodlar = [...(sayfa.barkodlar ?? [])];
    do {
      let y = dar ? 105 : 152;
      const ust = '<rect width="100%" height="100%" fill="#fff"/><rect x="' + kenar + '" y="' + (dar ? 50 : 72) + '" width="' + (w - kenar * 2) + '" height="2" fill="#ad8a45"/>';
      const logoImg = img
        ? '<image href="' + img + '" x="' + kenar + '" y="19" width="' + (dar ? 102 : 145) + '" height="' + (dar ? 25 : 42) + '" preserveAspectRatio="xMinYMid meet"/>'
        : ptext('AL LULU HOME', kenar, 42, 16, true);
      const baslik = ptext(sayfa.baslik, kenar, dar ? 72 : 107, dar ? 13 : 24, true);
      const alt = sayfa.alt ? ptext(sayfa.alt, kenar, dar ? 87 : 127, dar ? 8.4 : 11.5, false, '#665948') : '';
      let icerik = ust + logoImg + baslik + alt;
      while (sira < satirlar.length && y < h - 75) {
        const v = satirlar[sira++]!;
        icerik += ptext(v.metin, kenar, y, dar ? 8.8 : v.kucuk ? 10.5 : 12, v.kalin);
        y += dar ? 13 : 19;
      }
      while (barkodlar.length && y + 63 < h - 25 && sira >= satirlar.length) {
        icerik += barkodSvg(barkodlar.shift()!, kenar, y, w - kenar * 2);
        y += 64;
      }
      icerik += ptext(sayfa.etiket ?? 'AL LULU HOME · Mağaza kaydı', kenar, h - 24, dar ? 7.5 : 9, false, '#665948');
      sayfalarSvg.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + icerik + '</svg>');
    } while (sira < satirlar.length || barkodlar.length);
  }
  return { w, h, sayfalarSvg };
}

export async function pdfUret(sayfalar: PdfSayfasi[], bicim: PdfBicimi = 'a4') {
  if (!sayfalar.length) throw new Error('Belge için içerik bulunamadı.');
  const { w, h, sayfalarSvg } = await sayfalariHazirla(sayfalar, bicim);
  return svgdenPdf(sayfalarSvg, w, h, bicim === 'etiket' ? 260 : 150);
}

/** Hazır SVG sayfalarını önizleme görseline (PNG) çevirir. */
export async function svgdenPng(svg: string, density = 110) {
  return sharp(Buffer.from(svg), { density }).flatten({ background: '#fff' }).png({ compressionLevel: 8 }).toBuffer();
}

/** Hazır SVG sayfalarından PDF üretir (her sayfa yüksek çözünürlüklü görsel olarak gömülür). */
export async function svgdenPdf(sayfalarSvg: string[], w: number, h: number, density = 150) {
  if (!sayfalarSvg.length) throw new Error('Belge için içerik bulunamadı.');
  const nesneler: Buffer[] = [];
  const ekle = (v: string | Buffer) => nesneler.push(Buffer.isBuffer(v) ? v : Buffer.from(v, 'ascii'));
  const akim = (veri: Buffer, ek = '') => Buffer.concat([Buffer.from('<< /Length ' + veri.length + ' ' + ek + ' >>\nstream\n', 'ascii'), veri, Buffer.from('\nendstream', 'ascii')]);
  ekle('<< /Type /Catalog /Pages 2 0 R >>');
  ekle('<< /Type /Pages /Count ' + sayfalarSvg.length + ' /Kids [' + sayfalarSvg.map((_, i) => (i * 3 + 3) + ' 0 R').join(' ') + '] >>');
  for (const svg of sayfalarSvg) {
    const { data, info } = await sharp(Buffer.from(svg), { density })
      .flatten({ background: '#fff' }).toColorspace('srgb').jpeg({ quality: 93, chromaSubsampling: '4:4:4' }).toBuffer({ resolveWithObject: true });
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
