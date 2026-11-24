/**
 * Kaydedilmiş faturayı kanalına iletir: Trendyol'a yükler, web müşterisine e-postalar,
 * Hepsiburada'ya imzalı PDF bağlantısını gönderir (API bağlıysa; değilse elle).
 * Fatura sayfası ve zamanlayıcı (otomatik yeniden deneme) ortak kullanır.
 */
import { faturaGonder } from './bildirim';
import { faturaHerkeseAcikAdres } from './faturaBaglantisi';
import type { FaturaKaydi } from './finans';
import { faturaGuncelle } from './finansDepo';
import type { FaturaAdayi } from './faturaMerkezi';
import { hbFaturaLinki, hbSiparisPaketleri } from './hepsiburadaApi';
import { PazaryeriApiHatasi, pazaryeriApiDurumu } from './pazaryeriApi';
import { tyFaturaDosyasi } from './trendyolApi';

export async function faturaIlet(
  a: FaturaAdayi, k: FaturaKaydi, ek: { veri: Buffer; tur: string; ad: string } | undefined, origin: string, zorla: boolean,
): Promise<FaturaKaydi['iletim']> {
  const simdi = new Date().toISOString();
  const tyBagli = ['canli', 'test'].includes(pazaryeriApiDurumu('trendyol'));
  let iletim: FaturaKaydi['iletim'];
  if (!ek) iletim = { durum: 'bekliyor', mesaj: 'Fatura PDF/görsel dosyası henüz yüklenmedi; dosya ekleyip gönderebilir veya kendi ilettiyseniz “İletildi işaretle”ye basabilirsiniz.', tarih: simdi };
  else if (a.kanal === 'trendyol') {
    if (!tyBagli || !a.paketNo) iletim = { durum: 'bekliyor', mesaj: 'Bu ortamda Trendyol API anahtarı yok; canlı siteden “Trendyol’a yükle” deyin veya satıcı panelinden yükleyip “İletildi işaretle”yin.', tarih: simdi };
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
    if (!a.web?.musteri.eposta) iletim = { durum: 'bekliyor', mesaj: 'Müşterinin e-posta adresi yok; WhatsApp’tan iletip “İletildi işaretle”ye basın.', tarih: simdi };
    else {
      const r = await faturaGonder(a.web, k.no, { dosyaAdi: ek.ad, icerik: ek.veri, tur: ek.tur }, origin, zorla);
      iletim = r === 'gonderildi' || r === 'zaten-gonderildi' ? { durum: 'gonderildi', mesaj: `${a.web.musteri.eposta} adresine e-postayla gönderildi.`, tarih: simdi }
        : r === 'kapali' ? { durum: 'bekliyor', mesaj: 'Otomatik e-posta (SMTP) kapalı; PDF’i indirip WhatsApp/e-posta ile müşteriye gönderin ve “İletildi işaretle”ye basın.', tarih: simdi }
        : { durum: 'hata', mesaj: 'E-posta gönderilemedi. “Tekrar gönder”i deneyin veya elle iletip “İletildi işaretle”ye basın.', tarih: simdi };
    }
  } else {
    // Hepsiburada faturayı dosya değil bağlantı olarak alır: imzalı /fatura/{id} adresi pakete eklenir (yalnız PDF).
    const hbBagli = ['canli', 'test'].includes(pazaryeriApiDurumu('hepsiburada'));
    const link = faturaHerkeseAcikAdres(origin, k.id);
    const elle = 'Hepsiburada satıcı panelinde siparişin “Fatura yükle” alanından yükleyin, sonra “Yükledim” deyin.';
    if (!hbBagli || !link) iletim = { durum: 'bekliyor', mesaj: elle, tarih: simdi };
    else if (ek.tur !== 'application/pdf') iletim = { durum: 'bekliyor', mesaj: 'Hepsiburada’ya otomatik gönderim için fatura PDF olmalı. PDF yükleyin ya da ' + elle.charAt(0).toLowerCase() + elle.slice(1), tarih: simdi };
    else {
      try {
        const paketler = await hbSiparisPaketleri(a.siparisNo);
        if (!paketler.length) iletim = { durum: 'bekliyor', mesaj: 'Sipariş henüz paketlenmedi; paketlenince fatura bağlantısı Hepsiburada’ya otomatik gönderilecek.', tarih: simdi };
        else {
          for (const p of paketler) await hbFaturaLinki(p, link);
          iletim = { durum: 'gonderildi', mesaj: `Hepsiburada’ya fatura bağlantısı gönderildi (${paketler.length} paket); müşteri siparişinde görür.`, tarih: simdi };
        }
      } catch (e) {
        iletim = { durum: 'hata', mesaj: (e instanceof PazaryeriApiHatasi ? e.message : 'Hepsiburada’ya gönderilemedi.').slice(0, 480), tarih: simdi };
      }
    }
  }
  await faturaGuncelle(k.id, (x) => { x.iletim = iletim; });
  return iletim;
}
