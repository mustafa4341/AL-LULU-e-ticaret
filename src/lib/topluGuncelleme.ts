/**
 * Excel / CSV ile toplu fiyat ve stok güncelleme (24.11.2026).
 * Akış: şablonu indir → Excel'de değiştir → yükle → ÖNİZLEME (ne değişecek, hatalar) → onayla → uygula.
 * Kurallar:
 *  • Boş hücre = değişmez. Kanal özel fiyatında "0" = özel fiyatı kaldır (hedef yeniden site/kural fiyatı olur).
 *  • Satış fiyatı tam TL (sitedeki fiyatlar kuruşsuz). Fiyat geçmişi ve indirim kuralları fiyatUygula ile korunur.
 *  • Uygularken satırın yüklendiği andaki eski değerler tekrar karşılaştırılır; arada değişen ürün atlanır (üstüne yazılmaz).
 *  • Kanal özel fiyatı yalnız o kanaldaki bir ilana bağlı ürüne yazılır (bağlı olmayana yazmak stok eşitlemesini bozar).
 */
import { z } from 'astro/zod';
import { kodNormal, normal, type EnvanterAyarlari } from './pazaryeri';
import type { Magaza } from './sema';
import { urunGtin } from './urunKimlik';

export const TOPLU_BASLIK = ['Ürün kodu', 'SKU', 'Barkod', 'Ürün adı', 'Durum', 'Satış fiyatı (TL)', 'Depo stoğu', 'Trendyol özel fiyatı (TL)', 'Hepsiburada özel fiyatı (TL)'] as const;
const DURUM_ADI = { yayinda: 'Yayında', taslak: 'Taslak', gizli: 'Gizli' } as const;

/** İndirilecek tablo: başlık + her ürün bir satır */
export function topluSablon(m: Pick<Magaza, 'urunler'>, a: EnvanterAyarlari): (string | number)[][] {
  const urunler = [...m.urunler].sort((x, y) => `${x.marka} ${x.kisaAd}`.localeCompare(`${y.marka} ${y.kisaAd}`, 'tr'));
  return [
    [...TOPLU_BASLIK],
    ...urunler.map((u) => [
      u.id, u.sku, urunGtin(u) ?? '', `${u.marka} ${u.kisaAd}`, DURUM_ADI[u.durum], u.fiyat, u.stok,
      a.kanallar.trendyol.urunler[u.id]?.ozelFiyat ?? '', a.kanallar.hepsiburada.urunler[u.id]?.ozelFiyat ?? '',
    ]),
  ];
}

const KanalDegisimi = z.object({ eski: z.number().nullable(), yeni: z.number().nullable() });
export const TopluDegisiklikSema = z.object({
  urunId: z.string().min(1).max(120),
  ad: z.string().max(300),
  fiyat: z.object({ eski: z.number().int(), yeni: z.number().int().positive().max(100_000_000) }).optional(),
  stok: z.object({ eski: z.number().int(), yeni: z.number().int().min(0).max(100_000) }).optional(),
  trendyol: KanalDegisimi.optional(),
  hepsiburada: KanalDegisimi.optional(),
  uyari: z.string().max(300).optional(),
});
export type TopluDegisiklik = z.infer<typeof TopluDegisiklikSema>;
export type TopluOnizleme = { degisiklikler: TopluDegisiklik[]; hatalar: string[]; okunan: number; ayni: number };

/** "1.299,90" / "1299.9" / "₺ 12.999" → sayı. Boş → undefined, anlaşılmaz → NaN */
function sayiOku(v: string | undefined): number | undefined {
  let s = (v ?? '').replace(/[\s₺]|TL/gi, '');
  if (!s) return undefined;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replaceAll('.', '').replace(',', '.') : s.replaceAll(',', '');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replaceAll('.', '');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Tabloyu (ilk satır başlık) okuyup değişiklik önizlemesi çıkarır. Hiçbir şey kaydetmez. */
export function topluOnizle(tablo: string[][], m: Pick<Magaza, 'urunler'>, a: EnvanterAyarlari): TopluOnizleme {
  const [baslik, ...satirlar] = tablo;
  if (!baslik || !satirlar.length) throw new Error('Dosyada başlık ve en az bir ürün satırı olmalı.');
  if (satirlar.length > 5000) throw new Error('Bir seferde en fazla 5.000 satır yüklenebilir.');
  const kod = baslik.map((b) => normal(b));
  const sutun = (...adlar: string[]) => kod.findIndex((k) => adlar.some((ad) => k === normal(ad) || (normal(ad).length > 4 && k.startsWith(normal(ad)))));
  const s = {
    id: sutun('Ürün kodu', 'urunkodu', 'id'), sku: sutun('SKU', 'stok kodu'), barkod: sutun('Barkod', 'barcode', 'ean'),
    fiyat: sutun('Satış fiyatı', 'fiyat'), stok: sutun('Depo stoğu', 'stok', 'adet'),
    ty: sutun('Trendyol özel fiyatı', 'trendyol fiyat'), hb: sutun('Hepsiburada özel fiyatı', 'hepsiburada fiyat'),
  };
  if (s.id < 0 && s.sku < 0 && s.barkod < 0) throw new Error('Ürünü tanımak için “Ürün kodu”, “SKU” ya da “Barkod” sütunu gerekli. Paneldeki şablonu kullanın.');
  if (s.fiyat < 0 && s.stok < 0 && s.ty < 0 && s.hb < 0) throw new Error('Değiştirilecek sütun bulunamadı (Satış fiyatı, Depo stoğu, Trendyol/Hepsiburada özel fiyatı).');
  const idIle = new Map(m.urunler.map((u) => [u.id, u]));
  const skuIle = new Map(m.urunler.filter((u) => u.sku).map((u) => [kodNormal(u.sku), u]));
  const gtinIle = new Map(m.urunler.flatMap((u) => { const g = urunGtin(u); return g ? [[g, u] as const] : []; }));
  const sonuc: TopluOnizleme = { degisiklikler: [], hatalar: [], okunan: 0, ayni: 0 };
  const gorulen = new Set<string>();
  satirlar.forEach((r, i) => {
    const no = i + 2;
    const hucre = (j: number) => (j >= 0 ? String(r[j] ?? '').trim() : '');
    if (!r.some((x) => String(x ?? '').trim())) return;
    sonuc.okunan++;
    const u = idIle.get(hucre(s.id)) ?? skuIle.get(kodNormal(hucre(s.sku))) ?? gtinIle.get(kodNormal(hucre(s.barkod)));
    if (!u) { sonuc.hatalar.push(`${no}. satır: ürün bulunamadı (${hucre(s.id) || hucre(s.sku) || hucre(s.barkod) || 'kod yok'}).`); return; }
    if (gorulen.has(u.id)) { sonuc.hatalar.push(`${no}. satır: ${u.kisaAd} dosyada iki kez var; ilk satır kullanıldı.`); return; }
    gorulen.add(u.id);
    const d: TopluDegisiklik = { urunId: u.id, ad: `${u.marka} ${u.kisaAd}` };
    const hatalar: string[] = [];
    const fiyat = sayiOku(hucre(s.fiyat));
    if (fiyat !== undefined) {
      if (Number.isNaN(fiyat) || fiyat <= 0 || fiyat > 100_000_000) hatalar.push('satış fiyatı geçersiz');
      else if (!Number.isInteger(fiyat)) hatalar.push('satış fiyatı tam TL olmalı (ör. 12999)');
      else if (fiyat !== u.fiyat) {
        d.fiyat = { eski: u.fiyat, yeni: fiyat };
        if (fiyat < u.fiyat * 0.5) d.uyari = `Fiyat yarıdan fazla düşüyor (${u.fiyat} → ${fiyat} TL). Yazım hatası olmadığından emin olun.`;
        else if (fiyat > u.fiyat * 2) d.uyari = `Fiyat iki katından fazla artıyor (${u.fiyat} → ${fiyat} TL).`;
      }
    }
    const stok = sayiOku(hucre(s.stok));
    if (stok !== undefined) {
      if (Number.isNaN(stok) || !Number.isInteger(stok) || stok < 0 || stok > 100_000) hatalar.push('depo stoğu 0 veya pozitif tam sayı olmalı');
      else if (stok !== u.stok) d.stok = { eski: u.stok, yeni: stok };
    }
    for (const [kanal, j] of [['trendyol', s.ty], ['hepsiburada', s.hb]] as const) {
      const v = sayiOku(hucre(j));
      if (v === undefined) continue;
      const e = a.kanallar[kanal].urunler[u.id];
      const eski = e?.ozelFiyat ?? null;
      if (Number.isNaN(v) || v < 0 || v > 10_000_000) { hatalar.push(`${kanal === 'trendyol' ? 'Trendyol' : 'Hepsiburada'} özel fiyatı geçersiz`); continue; }
      const yeni = v === 0 ? null : Math.round(v * 100) / 100;
      if (yeni === eski) continue;
      if (!e?.kod) { hatalar.push(`${kanal === 'trendyol' ? 'Trendyol' : 'Hepsiburada'} özel fiyatı yazılamadı: ürün o kanalda bir ilana bağlı değil`); continue; }
      d[kanal] = { eski, yeni };
    }
    if (hatalar.length) sonuc.hatalar.push(`${no}. satır (${u.kisaAd}): ${hatalar.join(', ')}.`);
    if (d.fiyat || d.stok || d.trendyol || d.hepsiburada) sonuc.degisiklikler.push(d);
    else if (!hatalar.length) sonuc.ayni++;
  });
  return sonuc;
}
