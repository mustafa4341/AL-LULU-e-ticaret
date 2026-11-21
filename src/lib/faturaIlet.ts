/**
 * Kaydedilmiş faturayı kanalına iletir: Trendyol'a yükler, web müşterisine e-postalar; Hepsiburada'da elle.
 * Fatura sayfası ve zamanlayıcı (otomatik yeniden deneme) ortak kullanır.
 */
import { faturaGonder } from './bildirim';
import type { FaturaKaydi } from './finans';
import { faturaGuncelle } from './finansDepo';
import type { FaturaAdayi } from './faturaMerkezi';
import { PazaryeriApiHatasi, pazaryeriApiDurumu } from './pazaryeriApi';
import { tyFaturaDosyasi } from './trendyolApi';

export async function faturaIlet(
  a: FaturaAdayi, k: FaturaKaydi, ek: { veri: Buffer; tur: string; ad: string } | undefined, origin: string, zorla: boolean,
): Promise<FaturaKaydi['iletim']> {
  const simdi = new Date().toISOString();
  const tyBagli = ['canli', 'test'].includes(pazaryeriApiDurumu('trendyol'));
  let iletim: FaturaKaydi['iletim'];
  if (!ek) iletim = { durum: 'bekliyor', mesaj: 'Dosya yüklenmedi; müşteriye iletilemedi.', tarih: simdi };
  else if (a.kanal === 'trendyol') {
    if (!tyBagli || !a.paketNo) iletim = { durum: 'bekliyor', mesaj: 'Trendyol bağlantısı yok; faturayı satıcı panelinden yükleyin.', tarih: simdi };
    else {
      try {
        await tyFaturaDosyasi(a.paketNo, new File([new Uint8Array(ek.veri)], ek.ad, { type: ek.tur }));
        iletim = { durum: 'gonderildi', mesaj: 'Trendyol’a yüklendi.', tarih: simdi };
      } catch (e) {
        const m = e instanceof PazaryeriApiHatasi ? e.message : 'Trendyol’a yüklenemedi.';
        iletim = /önceden gönderilmiş|zaten/i.test(m)
          ? { durum: 'gonderildi', mesaj: 'Trendyol’da bu pakete fatura zaten yüklü.', tarih: simdi }
          : { durum: 'hata', mesaj: m.slice(0, 480), tarih: simdi };
      }
    }
  } else if (a.kanal === 'web') {
    if (!a.web?.musteri.eposta) iletim = { durum: 'bekliyor', mesaj: 'Müşterinin e-posta adresi yok.', tarih: simdi };
    else {
      const r = await faturaGonder(a.web, k.no, { dosyaAdi: ek.ad, icerik: ek.veri, tur: ek.tur }, origin, zorla);
      iletim = r === 'gonderildi' || r === 'zaten-gonderildi' ? { durum: 'gonderildi', mesaj: `${a.web.musteri.eposta} adresine e-postayla gönderildi.`, tarih: simdi }
        : r === 'kapali' ? { durum: 'hata', mesaj: 'E-posta ayarı kapalı; fatura gönderilemedi.', tarih: simdi }
        : { durum: 'hata', mesaj: 'E-posta gönderilemedi. Biraz sonra “Tekrar gönder”i deneyin.', tarih: simdi };
    }
  } else iletim = { durum: 'bekliyor', mesaj: 'Hepsiburada satıcı panelinde siparişin “Fatura yükle” alanından yükleyin, sonra “Yükledim” deyin.', tarih: simdi };
  await faturaGuncelle(k.id, (x) => { x.iletim = iletim; });
  return iletim;
}
