import { magazaOku, siparisGuncelle } from './depo';
import { durumDegisti } from './bildirim';
import { arkaPlanda } from './arkaPlan';
import { kargoFirmalari, takipBaglantisi } from './kargoTakip';
import { IADE_ISLEMI, gonderildi, iadeEdildi, iptalEdilebilir, siradakiDurum } from './siparisAkisi';
import { SiparisDurumSema, type Magaza, type Siparis, type Urun } from './sema';

/** Kayda alınan gerçek fiyatları korur. Önceki fiyat katalog geçmişinden hesaplanır. */
export function fiyatUygula(u: Urun, yeniFiyat: number, kampanyaGoster?: boolean, etiket?: string, oncekiFiyat?: number): void {
  const simdi = new Date().toISOString();
  const eskiFiyat = u.fiyat;
  const son = u.fiyatGecmisi.at(-1);
  const yayinda = u.durum === 'yayinda';
  if (yeniFiyat > 0 && (son?.fiyat !== yeniFiyat || son.dogrulandi !== yayinda)) {
    u.fiyatGecmisi.push({ tarih: simdi, fiyat: yeniFiyat, dogrulandi: yayinda });
    if (u.fiyatGecmisi.length > 200) u.fiyatGecmisi = u.fiyatGecmisi.slice(-200);
  }
  u.fiyat = yeniFiyat;
  if (kampanyaGoster === false || (kampanyaGoster === undefined && yeniFiyat > eskiFiyat)) {
    u.kampanya = null;
    return;
  }
  if (kampanyaGoster === undefined) return;
  const enSonDusme = [...u.fiyatGecmisi].reverse().find((g, i, liste) => g.fiyat === yeniFiyat && g.fiyat < (liste[i + 1]?.fiyat ?? 0));
  u.kampanya = {
    baslangic: yeniFiyat < eskiFiyat ? simdi : u.kampanya?.baslangic ?? enSonDusme?.tarih ?? simdi,
    etiket: etiket || undefined,
    oncekiFiyat: oncekiFiyat && oncekiFiyat > yeniFiyat ? oncekiFiyat : undefined,
  };
}

export interface SiparisIslemGirdi {
  no: string;
  eylem: string;
  durum: string;
  kargoTakip?: string;
  kargoFirma?: string;
  yoneticiNotu?: string;
  iptalNotu?: string;
  odemeOnay?: boolean;
  iadeOnay?: boolean;
  origin: string;
}

export async function siparisDurumGuncelle(girdi: SiparisIslemGirdi): Promise<{ siparis: Siparis; mesaj: string }> {
  const m = await magazaOku();
  let durumDegistiMi = false;
  let takipDegisti = false;
  let mesaj = 'Sipariş güncellendi.';
  const guncel = await siparisGuncelle(girdi.no, (s) => {
    const onceki = s.durum;
    const tarih = new Date().toISOString();
    let stok: -1 | 0 | 1 = 0;
    if (girdi.eylem === 'not') {
      s.yoneticiNotu = girdi.yoneticiNotu?.slice(0, 1000) || undefined;
      return stok;
    }
    if (girdi.eylem === 'stok-tamamla') {
      if (!s.paytr?.stokEksik || s.paytr.test || s.paytr.sonuc !== 'odendi' || s.stokDusuldu || onceki !== 'odendi') {
        throw new Error('Bu sipariş için tamamlanacak bir stok ayrımı yok.');
      }
      s.paytr.stokEksik = undefined;
      s.stokDusuldu = true;
      s.gecmis.push({ tarih, durum: onceki, not: 'Ödemesi alınan siparişin stoğu ayrıldı.' });
      mesaj = 'Siparişin stoğu ayrıldı. Siparişi hazırlamaya alabilirsiniz.';
      return -1;
    }
    if (girdi.eylem === 'iade') {
      if (!gonderildi(s) || iadeEdildi(s) || s.paytr?.test) throw new Error('Sipariş iade kaydına uygun değil.');
      if (!girdi.iadeOnay) throw new Error('Teslim alınan ürünleri ve geri ödemeyi doğrulayın.');
      stok = s.stokDusuldu ? 1 : 0;
      s.stokDusuldu = false;
      s.gecmis.push({ tarih, durum: s.durum, islem: IADE_ISLEMI, not: girdi.iptalNotu?.slice(0, 500) || 'Ürün iadesi ve geri ödeme doğrulandı.' });
      mesaj = 'İade kaydedildi.';
      return stok;
    }
    if (girdi.eylem !== 'durum') throw new Error('Geçersiz sipariş işlemi.');
    const yeni = SiparisDurumSema.safeParse(girdi.durum);
    if (!yeni.success) throw new Error('Geçersiz sipariş durumu.');
    const takipDuzelt = yeni.data === 'kargoda' && onceki === 'kargoda' && !iadeEdildi(s);
    if (yeni.data === 'iptal') {
      if (!iptalEdilebilir(s)) throw new Error('Bu sipariş iptal edilemez. Gönderildiyse iade akışını kullanın.');
      if ((s.paytr || s.durum !== 'odeme-bekliyor') && !girdi.iadeOnay) throw new Error('Ödenen tutarın geri ödendiğini doğrulayın.');
      stok = s.stokDusuldu ? 1 : 0;
      s.stokDusuldu = false;
      s.iptalNotu = girdi.iptalNotu?.slice(0, 500) || undefined;
      mesaj = 'Sipariş iptal edildi.';
    } else if (yeni.data !== siradakiDurum(s) && !takipDuzelt) {
      throw new Error('Sipariş bu aşamaya geçirilemez. Sayfayı yenileyip mevcut durumu kontrol edin.');
    }
    if (yeni.data === 'odendi') {
      if (!girdi.odemeOnay || s.paytr) throw new Error('Ödemeyi kontrol edip manuel onayı işaretleyin.');
      stok = s.stokDusuldu ? 0 : -1;
      s.stokDusuldu = true;
      mesaj = 'Ödeme manuel olarak onaylandı.';
    }
    let not = yeni.data === 'iptal' ? s.iptalNotu : undefined;
    let takipUrl: string | undefined;
    if (yeni.data === 'kargoda') {
      const firma = kargoFirmalari(m.site.kargo).find((x) => x.ad === girdi.kargoFirma);
      const kod = (girdi.kargoTakip ?? '').trim();
      takipUrl = firma && takipBaglantisi(firma.url, kod);
      if (!firma || !takipUrl) throw new Error('Kargo firması seçin ve geçerli takip numarası girin.');
      if (takipDuzelt && s.kargoTakip === kod && s.kargoFirma === firma.ad &&
        [...s.gecmis].reverse().find((g) => g.durum === 'kargoda')?.takipUrl === takipUrl) return stok;
      takipDegisti = takipDuzelt;
      s.kargoTakip = kod;
      s.kargoFirma = firma.ad;
      not = firma.ad + ' · ' + kod;
      mesaj = takipDuzelt ? 'Takip bilgileri güncellendi.' : 'Sipariş kargolandı.';
    }
    s.durum = yeni.data;
    durumDegistiMi = onceki !== s.durum;
    if (durumDegistiMi || takipDuzelt) s.gecmis.push({
      tarih, durum: s.durum,
      ...(not ? { not } : {}),
      ...(takipUrl ? { takipUrl } : {}),
      ...(yeni.data === 'odendi' ? { islem: 'manuel-odeme' } : {}),
      ...(takipDuzelt ? { islem: 'takip-duzeltildi' } : {}),
    });
    return stok;
  }, true);
  if (durumDegistiMi || takipDegisti) {
    const link = new URL('/siparis/' + guncel.no + '?t=' + guncel.token, girdi.origin).href;
    // Müşteriye SMS/e-posta arka planda gider: "Kargoya verildi" gibi düğmeler e-postayı beklemez.
    // Gönderim sonucu sipariş sayfasındaki "E-postalar" bölümünde görünür.
    // Takip numarası düzeltildiyse kargo e-postası yeni numarayla yeniden gider (denetim AUD-023).
    arkaPlanda(durumDegisti(guncel, m.site, link, takipDegisti), 'sipariş durum bildirimi');
  }
  return { siparis: guncel, mesaj };
}

export interface FiyatDegisimSatiri {
  urunId: string;
  urunAd: string;
  marka: string;
  tarih: string;
  eskiFiyat?: number;
  yeniFiyat: number;
  fark: number;
  yuzde: number;
  yon: 'indirim' | 'artis' | 'ilk';
}

/** Tüm ürünlerdeki fiyat değişimlerini en yeniden eskiye sıralar */
export function fiyatDegisimleriListesi(m: Magaza): FiyatDegisimSatiri[] {
  const satirlar: FiyatDegisimSatiri[] = [];
  for (const u of m.urunler) {
    const sirali = [...u.fiyatGecmisi].sort((a, b) => Date.parse(a.tarih) - Date.parse(b.tarih));
    for (let i = 0; i < sirali.length; i++) {
      const kayit = sirali[i]!;
      const onceki = i > 0 ? sirali[i - 1]!.fiyat : undefined;
      const fark = onceki !== undefined ? kayit.fiyat - onceki : 0;
      const yuzde = onceki ? Math.round((Math.abs(fark) / onceki) * 100) : 0;
      const yon = onceki === undefined ? 'ilk' : fark < 0 ? 'indirim' : 'artis';
      satirlar.push({
        urunId: u.id,
        urunAd: u.kisaAd || u.ad,
        marka: u.marka,
        tarih: kayit.tarih,
        eskiFiyat: onceki,
        yeniFiyat: kayit.fiyat,
        fark,
        yuzde,
        yon,
      });
    }
  }
  return satirlar.sort((a, b) => Date.parse(b.tarih) - Date.parse(a.tarih));
}

export interface UrunSatisOzeti {
  urun: Urun;
  onayliAdet: number;
  kargolananAdet: number;
  bekleyenAdet: number;
  iptalAdet: number;
  onayliCiro: number;
}

export function urunBazliSatislar(m: Magaza, siparisler: Siparis[]): UrunSatisOzeti[] {
  const map = new Map<string, UrunSatisOzeti>();
  for (const u of m.urunler) {
    map.set(u.id, { urun: u, onayliAdet: 0, kargolananAdet: 0, bekleyenAdet: 0, iptalAdet: 0, onayliCiro: 0 });
  }
  for (const s of siparisler) {
    if (s.paytr?.test) continue;
    for (const k of s.kalemler) {
      for (const p of k.parcalar) {
        const kayit = map.get(p.urunId);
        if (!kayit) continue;
        const adet = p.adet * k.adet;
        if (s.durum === 'iptal' || iadeEdildi(s)) {
          kayit.iptalAdet += adet;
        } else if (s.durum === 'odeme-bekliyor') {
          kayit.bekleyenAdet += adet;
        } else {
          kayit.onayliAdet += adet;
          if (s.durum === 'kargoda' || s.durum === 'teslim-edildi') kayit.kargolananAdet += adet;
          // Set ise payı oranla, tek ürün ise doğrudan toplamı ekle
          if (k.tip === 'urun') kayit.onayliCiro += k.toplam;
          else kayit.onayliCiro += Math.round((k.toplam * (kayit.urun.fiyat * p.adet)) / Math.max(1, k.birimFiyat));
        }
      }
    }
  }
  return Array.from(map.values());
}
