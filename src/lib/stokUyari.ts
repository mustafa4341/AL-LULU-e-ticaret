import { epostaBagli } from './altyapi';
import { magazayaBildir } from './bildirim';
import { stokUyariEpostasi, type StokUyariSatiri } from './epostaSablon';
import { KANALLAR, KANAL_LISTESI, kritikEsik } from './pazaryeri';
import { envanterAyarlariOku } from './pazaryeriDepo';
import type { Magaza } from './sema';

/**
 * Stok kritik eşiğin altına indiğinde ya da tükendiğinde mağazaya tek e-posta.
 * Yalnız eşik "geçildiğinde" gider (3 → 2 tekrar göndermez; stok yükselip yeniden düşerse yine gider).
 * Ürün bir pazaryerinde de satılıyorsa e-postada o kanalın stoğunu güncelleme hatırlatması yer alır.
 */
export async function stokUyarilariniGonder(eski: Magaza, yeni: Magaza): Promise<void> {
  if (!epostaBagli()) return;
  const ayar = await envanterAyarlariOku();
  if (!ayar.epostaBildirimi) return;

  const oncekiStok = new Map(eski.urunler.map((u) => [u.id, u.stok]));
  const dusenler = yeni.urunler.filter((u) => {
    if (u.durum !== 'yayinda') return false;
    const onceki = oncekiStok.get(u.id) ?? u.stok;
    const esik = kritikEsik(ayar, u.id);
    return u.stok < onceki && (u.stok === 0 || (u.stok <= esik && onceki > esik));
  });
  if (!dusenler.length) return;

  const satirlar: StokUyariSatiri[] = dusenler.map((u) => ({
    ad: `${u.marka} ${u.kisaAd}`, stok: u.stok, esik: kritikEsik(ayar, u.id), tur: u.stok === 0 ? 'tukendi' : 'kritik',
  }));
  const kanallar = KANAL_LISTESI
    .filter((k) => dusenler.some((u) => { const ilan = ayar.kanallar[k].urunler[u.id]; return Boolean(ilan?.kod && ilan.satista); }))
    .map((k) => KANALLAR[k]);
  await magazayaBildir(yeni.site, stokUyariEpostasi(yeni.site, satirlar, kanallar));
}
