/**
 * Hepsiburada ürün başına komisyon oranları (25.11.2026, mağaza sahibinin isteği: "komisyonları ürün başına çekip
 * hak edişleri buna göre ayarla"). Hepsiburada kategori tablosundaki genel oran (ör. %18) yerine satıcı panelinde
 * ilana tanımlı gerçek oran (ör. %9) kullanılır; kâr hesaplayıcısı, Hepsiburada kârlılığı ve fiyat koruması bunu okur.
 *
 * Eşleşme: sitedeki ürünün Hepsiburada eşleştirme kodu (satıcı stok kodu = merchantSku) ya da doğrudan Hepsiburada SKU'su.
 */
import { magazaOku } from './depo';
import { hbUrunleriGuncelle, finansOku } from './finansDepo';
import { hbKomisyonlari, hbTumIlanlar, pazaryeriApiDurumu, type HbIlani } from './pazaryeriApi';
import { envanterAyarlariGuncelle, envanterAyarlariOku } from './pazaryeriDepo';

export type KomisyonSonucu = {
  guncellenen: { urunId: string; ad: string; eski?: number; yeni: number; vadeGun?: number }[];
  /** Hepsiburada'da olup sitedeki hiçbir ürünün eşleştirme koduna uymayan ilanlar (eşleştirme yapılmalı) */
  eslesmeyenIlanlar: (HbIlani & { oranBp?: number })[];
  ilanSayisi: number;
};

const norm = (s: string) => s.trim().toLocaleUpperCase('en-US');

export async function hbKomisyonlariniGuncelle(sureMs = 30_000): Promise<KomisyonSonucu> {
  if (!['canli', 'test'].includes(pazaryeriApiDurumu('hepsiburada'))) throw new Error('Hepsiburada API bağlantısı yok. Canlı Hepsiburada bilgileri tanımlanınca komisyonlar otomatik çekilir.');
  const sinyal = AbortSignal.timeout(sureMs);
  const [ilanlar, ayar, magaza, finans] = await Promise.all([hbTumIlanlar(sinyal), envanterAyarlariOku(), magazaOku(true), finansOku()]);
  const komisyonlar = ilanlar.length ? await hbKomisyonlari(ilanlar.map((i) => i.hbSku), sinyal) : new Map();
  const ilanKod = new Map<string, HbIlani>();
  for (const i of ilanlar) { ilanKod.set(norm(i.merchantSku), i); ilanKod.set(norm(i.hbSku), i); }
  const urunler = new Map(magaza.urunler.map((u) => [u.id, u]));
  const sonuc: KomisyonSonucu = { guncellenen: [], eslesmeyenIlanlar: [], ilanSayisi: ilanlar.length };
  const kullanilan = new Set<string>();
  const tarih = new Date().toISOString();
  const yeniOranlar = new Map<string, { oranBp: number; vadeGun?: number }>();
  for (const [urunId, e] of Object.entries(ayar.kanallar.hepsiburada.urunler)) {
    if (!e.kod || !urunler.has(urunId)) continue;
    const ilan = ilanKod.get(norm(e.kod));
    const k = ilan ? komisyonlar.get(ilan.hbSku) : undefined;
    if (!ilan || !k) continue;
    kullanilan.add(ilan.hbSku);
    yeniOranlar.set(urunId, k);
    const u = urunler.get(urunId)!;
    sonuc.guncellenen.push({ urunId, ad: `${u.marka} ${u.kisaAd}`, eski: finans.hbUrunler[urunId]?.oranBp, yeni: k.oranBp, vadeGun: k.vadeGun });
  }
  for (const i of ilanlar) if (!kullanilan.has(i.hbSku)) sonuc.eslesmeyenIlanlar.push({ ...i, oranBp: komisyonlar.get(i.hbSku)?.oranBp });
  if (yeniOranlar.size) {
    await hbUrunleriGuncelle((h) => {
      for (const [urunId, k] of yeniOranlar) {
        const eski = h[urunId];
        // "elle" kategori: hesaplayıcı kategori tablosu yerine bu ilanın gerçek oranını kullanır
        h[urunId] = {
          kategori: 'elle', desi: eski?.desi ?? 3, kdv: eski?.kdv ?? 20, ...(eski?.maliyet !== undefined ? { maliyet: eski.maliyet } : {}),
          oranBp: k.oranBp, oranKaynak: 'hepsiburada', oranTarih: tarih, ...(k.vadeGun !== undefined ? { vadeGun: k.vadeGun } : {}),
        };
      }
    });
  }
  await envanterAyarlariGuncelle((a) => { a.kanallar.hepsiburada.komisyonTarih = tarih; }).catch(() => undefined);
  return sonuc;
}
