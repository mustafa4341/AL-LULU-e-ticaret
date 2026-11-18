import { inflateRawSync } from 'node:zlib';

const tablo = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (v: Buffer) => {
  let c = 0xffffffff;
  for (const b of v) c = (c >>> 8) ^ tablo[(c ^ b) & 255]!;
  return (c ^ 0xffffffff) >>> 0;
};

export function zipOlustur(dosyalar: { ad: string; veri: Buffer }[]) {
  const govde: Buffer[] = [];
  const dizin: Buffer[] = [];
  let adres = 0;
  for (const dosya of dosyalar) {
    const ad = Buffer.from(dosya.ad, 'utf8');
    const bas = Buffer.alloc(30);
    bas.writeUInt32LE(0x04034b50);
    bas.writeUInt16LE(20, 4);
    bas.writeUInt16LE(0x800, 6);
    bas.writeUInt32LE(crc32(dosya.veri), 14);
    bas.writeUInt32LE(dosya.veri.length, 18);
    bas.writeUInt32LE(dosya.veri.length, 22);
    bas.writeUInt16LE(ad.length, 26);
    const ozet = Buffer.alloc(46);
    ozet.writeUInt32LE(0x02014b50);
    ozet.writeUInt16LE(20, 4);
    bas.subarray(4, 30).copy(ozet, 6);
    ozet.writeUInt32LE(adres, 42);
    govde.push(bas, ad, dosya.veri);
    dizin.push(ozet, ad);
    adres += bas.length + ad.length + dosya.veri.length;
  }
  const son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50);
  son.writeUInt16LE(dosyalar.length, 8);
  son.writeUInt16LE(dosyalar.length, 10);
  son.writeUInt32LE(dizin.reduce((t, d) => t + d.length, 0), 12);
  son.writeUInt32LE(adres, 16);
  return Buffer.concat([...govde, ...dizin, son]);
}

/** XLSX arşivinden yalnızca çalışma sayfası ve paylaşılan metinleri okur. */
export function xlsxParcalari(buf: Buffer) {
  const sayfalar: { yol: string; oku: () => string }[] = [];
  let ortak = '';
  const imza = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const son = buf.lastIndexOf(imza);
  if (son < 0 || son + 22 > buf.length) throw new Error('Excel dosyası okunamadı.');
  const adet = buf.readUInt16LE(son + 10);
  let dizin = buf.readUInt32LE(son + 16);
  if (adet > 500 || dizin > son) throw new Error('Excel dosyası çok büyük veya desteklenmiyor.');
  for (let i = 0; i < adet; i++) {
    if (dizin + 46 > son || buf.readUInt32LE(dizin) !== 0x02014b50) throw new Error('Excel dosyası geçersiz.');
    const bayrak = buf.readUInt16LE(dizin + 8);
    const sikistirma = buf.readUInt16LE(dizin + 10);
    const boyut = buf.readUInt32LE(dizin + 20);
    const acik = buf.readUInt32LE(dizin + 24);
    const adBoyutu = buf.readUInt16LE(dizin + 28);
    const dosyaBas = buf.readUInt32LE(dizin + 42);
    const yol = buf.subarray(dizin + 46, dizin + 46 + adBoyutu).toString('utf8');
    dizin += 46 + adBoyutu + buf.readUInt16LE(dizin + 30) + buf.readUInt16LE(dizin + 32);
    if (!/^xl\/worksheets\/sheet\d+\.xml$|^xl\/sharedStrings\.xml$/.test(yol)) continue;
    if (dosyaBas + 30 > buf.length || buf.readUInt32LE(dosyaBas) !== 0x04034b50 || (bayrak & 1) || acik > 12 * 1024 * 1024) {
      throw new Error('Excel sayfası çok büyük veya açılamıyor.');
    }
    const veriBas = dosyaBas + 30 + buf.readUInt16LE(dosyaBas + 26) + buf.readUInt16LE(dosyaBas + 28);
    const oku = () => {
      if (veriBas + boyut > buf.length) throw new Error('Excel sayfası eksik.');
      const veri = buf.subarray(veriBas, veriBas + boyut);
      if (sikistirma === 0) return veri.toString('utf8');
      if (sikistirma === 8) return inflateRawSync(veri, { maxOutputLength: 12 * 1024 * 1024 }).toString('utf8');
      throw new Error('Excel sıkıştırma biçimi desteklenmiyor.');
    };
    if (yol === 'xl/sharedStrings.xml') ortak = oku();
    else sayfalar.push({ yol, oku });
  }
  const ilk = sayfalar.sort((a, b) => a.yol.localeCompare(b.yol, 'en', { numeric: true }))[0];
  if (!ilk) throw new Error('Excel çalışma sayfası bulunamadı.');
  return { sayfa: ilk.oku(), ortak };
}

export function csvOlustur(rows: (string | number)[][]) {
  const deger = (v: string | number) => {
    // Sayılar Türkçe Excel'in okuduğu biçimde: ondalık ayırıcı virgül (249,9)
    let text = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    if (typeof v === 'string' && /^[\s\uFEFF]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return Buffer.from('\uFEFF' + rows.map((r) => r.map(deger).join(';')).join('\r\n'), 'utf8');
}
