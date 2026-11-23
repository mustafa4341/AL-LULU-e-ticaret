/**
 * Trendyol'a gönderilen ilanların durum takibi ve fiyat gönderimi.
 * Onaylanan ilan, aynı barkodla "Satış kanalları › Ürün eşleştirmeleri"ne otomatik bağlanır; stok eşitlemesi oradan devam eder.
 */
import type { KanalIlanTaslagi } from './pazaryeri';
import { PazaryeriApiHatasi } from './pazaryeriApi';
import { envanterAyarlariGuncelle, envanterAyarlariOku } from './pazaryeriDepo';
import { tyKuyrukSonucu, tyOnayliUrun, tyOnaysizUrun } from './trendyolApi';

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

// Fiyat gönderimi kanalFiyat.ts'e taşındı (Trendyol + Hepsiburada, fiyat = sitedeki son fiyat).
