/**
 * Trendyol'a gönderilen ilanların durum takibi ve fiyat gönderimi.
 * Onaylanan ilan, aynı barkodla "Satış kanalları › Ürün eşleştirmeleri"ne otomatik bağlanır; stok eşitlemesi oradan devam eder.
 */
import { magazaOku } from './depo';
import { DogrulamaHatasi } from './depo';
import type { KanalIlanTaslagi } from './pazaryeri';
import { PazaryeriApiHatasi } from './pazaryeriApi';
import { envanterAyarlariGuncelle, envanterAyarlariOku } from './pazaryeriDepo';
import { tyFiyatGonder, tyKuyrukSonucu, tyOnayliUrun, tyOnaysizUrun } from './trendyolApi';
import { ilanFiyati } from './trendyolIlan';

const BEKLEYEN = new Set<KanalIlanTaslagi['durum']>(['gonderildi', 'onay-bekliyor']);
export const ilanBekliyor = (t?: KanalIlanTaslagi) => !!t && BEKLEYEN.has(t.durum);

type Guncelleme = Partial<KanalIlanTaslagi> & { bagla?: boolean };

async function tekIlanKontrolu(t: KanalIlanTaslagi): Promise<Guncelleme> {
  const simdi = new Date().toISOString();
  if (t.durum === 'gonderildi' && t.batchId) {
    let sonuc: Awaited<ReturnType<typeof tyKuyrukSonucu>> | undefined;
    try {
      sonuc = await tyKuyrukSonucu(t.batchId);
    } catch (e) {
      // Kuyruk sonucu 4 saat sonra silinir; sonra doğrudan ürün durumuna bakılır.
      if (!(e instanceof PazaryeriApiHatasi && e.status === 404)) throw e;
    }
    if (sonuc && !sonuc.bitti) return { kontrol: simdi };
    const satir = sonuc?.satirlar.find((s) => s.barkod === t.barkod) ?? sonuc?.satirlar[0];
    if (satir && !satir.basarili) {
      return { durum: 'hata', kontrol: simdi, mesajlar: satir.sebepler.length ? satir.sebepler : ['Trendyol ürünü kabul etmedi; sebep bildirilmedi.'] };
    }
  }
  const onayli = await tyOnayliUrun(t.barkod);
  if (onayli) return { durum: 'onaylandi', kontrol: simdi, mesajlar: [], bagla: true };
  const onaysiz = await tyOnaysizUrun(t.barkod);
  if (onaysiz?.reddedildi) return { durum: 'reddedildi', kontrol: simdi, mesajlar: onaysiz.sebepler };
  return { durum: 'onay-bekliyor', kontrol: simdi, mesajlar: [] };
}

/** Bekleyen ilanların durumunu Trendyol'dan okur ve kaydeder. Döner: kullanıcıya gösterilecek kısa notlar. */
export async function ilanDurumlariniYenile(urunIdler?: string[], enFazla = 6): Promise<string[]> {
  const ayar = await envanterAyarlariOku();
  const k = ayar.kanallar.trendyol;
  const hedef = Object.entries(k.ilanlar)
    .filter(([id, t]) => (urunIdler ? urunIdler.includes(id) : true) && ilanBekliyor(t) && t.barkod)
    .slice(0, enFazla);
  if (!hedef.length) return [];
  const sonuclar = await Promise.all(hedef.map(async ([id, t]) => {
    try { return [id, await tekIlanKontrolu(t)] as const; } catch (e) {
      return [id, { kontrol: new Date().toISOString(), hataMesaji: e instanceof PazaryeriApiHatasi ? e.message : 'Durum okunamadı.' }] as const;
    }
  }));
  const notlar: string[] = [];
  await envanterAyarlariGuncelle((a) => {
    const kanal = a.kanallar.trendyol;
    for (const [id, g] of sonuclar) {
      const t = kanal.ilanlar[id];
      if (!t) continue;
      if ('hataMesaji' in g) { t.kontrol = g.kontrol; notlar.push(g.hataMesaji); continue; }
      const { bagla, ...alanlar } = g;
      Object.assign(t, alanlar);
      if (bagla) {
        const baska = Object.entries(kanal.urunler).find(([uid, u]) => uid !== id && u.kod === t.barkod);
        if (baska) { notlar.push(`${t.baslik}: barkod başka bir ürüne bağlı, stok eşleştirmesini kontrol edin.`); continue; }
        const mevcut = kanal.urunler[id];
        if (!mevcut?.kod) kanal.urunler[id] = { kod: t.barkod, satista: true };
        else if (mevcut.kod !== t.barkod) notlar.push(`${t.baslik}: ürün başka bir barkodla eşleştirilmiş; stok o barkoda gönderiliyor.`);
      }
    }
  });
  return notlar;
}

/** Eşleştirilmiş Trendyol ilanlarına kanal fiyatını gönderir (liste fiyatı = satış fiyatı). */
export async function trendyolFiyatlariGonder(): Promise<{ gonderilen: number; atlanan: number }> {
  const [ayar, magaza] = await Promise.all([envanterAyarlariOku(), magazaOku(true)]);
  const k = ayar.kanallar.trendyol;
  const kalemler: { urunId: string; barcode: string; salePrice: number; listPrice: number }[] = [];
  let atlanan = 0;
  for (const [urunId, e] of Object.entries(k.urunler)) {
    const u = magaza.urunler.find((x) => x.id === urunId);
    if (!u || !e.kod || !e.satista) { atlanan++; continue; }
    const fiyat = ilanFiyati(u, k.ilanlar[urunId], k);
    if (!(fiyat > 0) || k.ilanlar[urunId]?.sonFiyat === fiyat) { atlanan++; continue; }
    kalemler.push({ urunId, barcode: e.kod, salePrice: fiyat, listPrice: fiyat });
  }
  if (!kalemler.length) return { gonderilen: 0, atlanan };
  if (kalemler.length > 1000) throw new DogrulamaHatasi(['Bir seferde en fazla 1.000 fiyat gönderilebilir.']);
  const batchId = await tyFiyatGonder(kalemler.map(({ urunId: _u, ...x }) => x));
  const tarih = new Date().toISOString();
  await envanterAyarlariGuncelle((a) => {
    const kanal = a.kanallar.trendyol;
    for (const x of kalemler) {
      const t = kanal.ilanlar[x.urunId] ?? { durum: 'onaylandi', barkod: x.barcode, stokKodu: '', anaKod: '', baslik: '', ozellikler: [], kdv: 20, mesajlar: [] };
      kanal.ilanlar[x.urunId] = { ...t, sonFiyat: x.salePrice, sonFiyatTarih: tarih, fiyatBatchId: batchId };
    }
  });
  return { gonderilen: kalemler.length, atlanan };
}
