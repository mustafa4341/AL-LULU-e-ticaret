/**
 * Otomatik işler — zamanlayıcı (5 dk) her eşitlemeden sonra ve panelde "Hepsini şimdi yap" ile çalışır.
 * Her adım kendi içinde hatayı yakalar; biri bozulursa diğerleri yine çalışır. Özet panelde (Bugünkü işler) görünür.
 *
 *  1. Yeni Trendyol/Hepsiburada siparişi → mağazaya e-posta (aynı sipariş için bir kez)
 *  2. (isteğe bağlı) Yeni Trendyol paketi → "toplanıyor" bildirimi
 *  3. Kaydedilmiş ama iletilememiş faturalar → Trendyol'a yükleme / müşteriye e-posta yeniden denenir
 *  4. Trendyol/Hepsiburada fiyatı sitedeki son fiyattan farklıysa sitedeki fiyat gönderilir (kanalFiyat.ts)
 *  5. Günde bir: Trendyol hakedişi (son 15 gün), ilan onay durumları
 */
import { siparisleriOku } from './depo';
import { pazaryeriSiparisBildir } from './bildirim';
import { finansGunu } from './finans';
import { faturaEki, finansOku, trendyolKaydet } from './finansDepo';
import { faturaAdaylari } from './faturaMerkezi';
import { faturaIlet } from './faturaIlet';
import { PazaryeriApiHatasi, pazaryeriApiDurumu } from './pazaryeriApi';
import { envanterAyarlariGuncelle, envanterAyarlariOku, pazaryeriSiparisiOku, pazaryeriSiparisleriOku } from './pazaryeriDepo';
import { trendyolEkstreCek, tyPaketDurumu } from './trendyolApi';
import { trendyolEkstreSatirlari } from './trendyolFinans';
import { ilanDurumlariniYenile } from './trendyolIlanIslem';
import { fiyatOzeti, pazaryeriFiyatlariEsitle } from './kanalFiyat';

const SITE = 'https://alluluhome.com';
const mesaj = (e: unknown) => e instanceof PazaryeriApiHatasi ? e.message : e instanceof Error ? e.message.slice(0, 200) : 'bilinmeyen hata';

export type OtomasyonSecenek = { yeniIdler?: string[]; gunlukZorla?: boolean; sureMs?: number };

export async function otomatikIsler(o: OtomasyonSecenek = {}): Promise<string[]> {
  const bitis = Date.now() + (o.sureMs ?? 15_000);
  const kaldi = () => bitis - Date.now();
  const ayar = await envanterAyarlariOku();
  const ot = ayar.otomasyon;
  const ozet: string[] = [];
  const tyBagli = ['canli', 'test'].includes(pazaryeriApiDurumu('trendyol'));

  // 1–2. Yeni siparişler
  for (const id of (o.yeniIdler ?? []).slice(0, 20)) {
    if (kaldi() < 3000) break;
    try {
      const s = await pazaryeriSiparisiOku(id);
      if (!s) continue;
      if (ot.yeniSiparisBildir && ayar.epostaBildirimi) {
        const r = await pazaryeriSiparisBildir(s);
        if (r === 'gonderildi') ozet.push(`Yeni sipariş bildirildi: ${s.siparisNo}`);
      }
      if (ot.otoToplama && tyBagli && s.kanal === 'trendyol' && s.paketNo && s.hamDurum === 'Created') {
        const satirlar = s.kalemler.filter((k) => k.satirId && /^\d+$/.test(k.satirId)).map((k) => ({ lineId: Number(k.satirId), quantity: k.adet }));
        await tyPaketDurumu(s.paketNo, satirlar, 'Picking');
        ozet.push(`Trendyol ${s.siparisNo}: “toplanıyor” bildirildi`);
      }
    } catch (e) { ozet.push(`Sipariş ${id}: ${mesaj(e)}`); }
  }

  // 3. İletilemeyen faturalar (30 dakikada bir, en fazla 3)
  if (ot.faturaYenidenDene && kaldi() > 6000) {
    try {
      const f = await finansOku();
      const bekleyen = f.faturalar.filter((x) => !x.iptal && x.ek && (x.kanal === 'trendyol' || x.kanal === 'web')
        && (x.iletim.durum === 'bekliyor' || x.iletim.durum === 'hata') && Date.now() - Date.parse(x.iletim.tarih ?? x.olusturma) > 30 * 60_000
        && Date.now() - Date.parse(x.olusturma) < 14 * 86_400_000).slice(0, 3);
      if (bekleyen.length) {
        const [web, py] = await Promise.all([siparisleriOku(), pazaryeriSiparisleriOku().catch(() => [])]);
        const adaylar = faturaAdaylari(f, web, py, ayar);
        for (const k of bekleyen) {
          if (kaldi() < 4000) break;
          const a = adaylar.find((x) => x.kanal === k.kanal && x.kayit === k.kayit);
          const ek = await faturaEki(k.id);
          if (!a || !ek?.kayit.ek) continue;
          const r = await faturaIlet(a, k, { veri: ek.veri, tur: ek.kayit.ek.tur, ad: ek.kayit.ek.ad }, SITE, false);
          ozet.push(`Fatura ${k.no}: ${r.mesaj ?? r.durum}`);
        }
      }
    } catch (e) { ozet.push(`Fatura iletimi: ${mesaj(e)}`); }
  }

  // 4. Fiyat: Trendyol/Hepsiburada fiyatı = sitedeki son fiyat. Aynı uyarı her 5 dakikada bir tekrar yazılmaz.
  if (ot.otoFiyat && kaldi() > 5000) {
    try {
      const sonuclar = await pazaryeriFiyatlariEsitle({ otomatik: true });
      for (const satir of fiyatOzeti(sonuclar)) {
        if (!(ot.sonOzet ?? []).some((x) => x.endsWith(satir))) ozet.push(satir);
      }
    } catch (e) { ozet.push(`Fiyat eşitleme: ${mesaj(e)}`); }
  }

  // 5. Günlük işler
  const bugun = finansGunu();
  const gunluk = ot.gunlukIsler && tyBagli && (o.gunlukZorla || ot.sonGunluk !== bugun);
  let gunlukBitti = false;
  if (gunluk && kaldi() > 8000) {
    try {
      const notlar = await ilanDurumlariniYenile(undefined, 12);
      ozet.push(...notlar);
    } catch (e) { ozet.push(`İlan durumları: ${mesaj(e)}`); }
    if (kaldi() > 6000) {
      try {
        const son = Date.now();
        const ham = await trendyolEkstreCek(son - 15 * 86_400_000, son, AbortSignal.timeout(Math.max(3000, kaldi() - 2000)));
        const e = trendyolEkstreSatirlari(ham.satislar, ham.diger);
        if (e.satirlar.length) await trendyolKaydet(e.satirlar);
        ozet.push(e.kayit ? `Trendyol hakedişi güncellendi (${e.satirlar.length} satır)` : 'Trendyol hakedişinde yeni kayıt yok');
        gunlukBitti = true;
      } catch (e) { ozet.push(`Trendyol hakedişi: ${mesaj(e)}`); }
    }
  }

  const simdi = new Date().toISOString();
  const saat = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' });
  try {
    await envanterAyarlariGuncelle((a) => {
      a.otomasyon.sonCalisma = simdi;
      if (gunlukBitti) a.otomasyon.sonGunluk = bugun;
      if (ozet.length) a.otomasyon.sonOzet = [...ozet.map((x) => `${saat} · ${x}`.slice(0, 300)), ...a.otomasyon.sonOzet].slice(0, 20);
    });
  } catch { /* özet kaydedilemedi; işler yine yapıldı */ }
  return ozet;
}
