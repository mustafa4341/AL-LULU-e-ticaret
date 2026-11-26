/**
 * Otomatik işler — zamanlayıcı (5 dk) her eşitlemeden sonra ve panelde "Hepsini şimdi yap" ile çalışır.
 * Her adım kendi içinde hatayı yakalar; biri bozulursa diğerleri yine çalışır. Özet panelde (Bugünkü işler) görünür.
 *
 *  1. Yeni Trendyol/Hepsiburada siparişi → mağazaya e-posta (aynı sipariş için bir kez)
 *  2. (isteğe bağlı) Yeni Trendyol paketi → "toplanıyor" bildirimi
 *  3. Kaydedilmiş ama iletilememiş faturalar → Trendyol'a yükleme / müşteriye e-posta yeniden denenir
 *  4. "Otomatik fiyat takibi" açık ürünlerde kanal fiyatı hedeften farklıysa hedef gönderilir (kanalFiyat.ts)
 *  5. Günde bir: ilan onay durumları, aynı barkodlu Trendyol ilanlarını bağlama (stok ortak), Trendyol hakedişi (son 15 gün)
 */
import { siparisleriOku } from './depo';
import { pazaryeriSiparisBildir } from './bildirim';
import { finansGunu } from './finans';
import { faturaEki, finansOku, trendyolKaydet } from './finansDepo';
import { faturaAdaylari } from './faturaMerkezi';
import { faturaIlet } from './faturaIlet';
import { BILDIRIM_YOLU, PazaryeriApiHatasi, bildirimAnahtari, pazaryeriApiDurumu } from './pazaryeriApi';
import { envanterAyarlariGuncelle, envanterAyarlariOku, pazaryeriGecmiseEkle, pazaryeriSiparisiOku, pazaryeriSiparisleriOku } from './pazaryeriDepo';
import { trendyolEkstreCek, tyBuybox, tyIadeler, tyPaketDurumu, tySorular, tyWebhookAktif, tyWebhooklar } from './trendyolApi';
import { PY_DURUM_ADLARI } from './pazaryeri';
import { trendyolEkstreSatirlari } from './trendyolFinans';
import { ilanDurumlariniYenile } from './trendyolIlanIslem';
import { fiyatOzeti, hepsiburadaIlanlariniEsle, pazaryeriFiyatlariEsitle, trendyolIlanlariniEsle } from './kanalFiyat';
import { trendyolFaturalariniAl } from './faturaKanaldan';
import { hbKomisyonlariniGuncelle } from './hepsiburadaKomisyon';
import { tyKomisyonlariniGuncelle } from './trendyolIceAktar';

const SITE = 'https://alluluhome.com';
const mesaj = (e: unknown) => e instanceof PazaryeriApiHatasi ? e.message : e instanceof Error ? e.message.slice(0, 200) : 'bilinmeyen hata';
/** Hiç çalışmamışsa (tarih yok/geçersiz) ya da üzerinden `ms` geçtiyse true. (Date.parse('') NaN döner; NaN > x her zaman false idi.) */
const eskiMi = (tarih: string | undefined, ms: number) => { const t = Date.parse(tarih ?? ''); return !Number.isFinite(t) || Date.now() - t > ms; };

export type OtomasyonSecenek = {
  yeniIdler?: string[]; gunlukZorla?: boolean; sureMs?: number;
  /** Bu eşitlemede iptal / iade / teslim edilemedi durumuna geçen pazaryeri siparişleri */
  donenler?: { id: string; eski: string; yeni: string }[];
};

/** Trendyol iade kalemi durumları (getClaims claimItemStatus) */
const IADE_DURUMU: Record<string, string> = {
  Created: 'müşteri iade başlattı (ürün yolda)', WaitingInAction: 'ürün depoya ulaştı, onayınız bekleniyor',
  WaitingFraudCheck: 'Trendyol kontrol ediyor', Accepted: 'iade onaylandı', Rejected: 'iade reddedildi',
  Cancelled: 'iade talebi iptal edildi', Unresolved: 'çözülemedi, Trendyol inceliyor', InAnalysis: 'Trendyol inceliyor',
};

export async function otomatikIsler(o: OtomasyonSecenek = {}): Promise<string[]> {
  const bitis = Date.now() + (o.sureMs ?? 35_000);
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
      if (ot.otoToplama && tyBagli && s.kanal === 'trendyol' && s.paketNo && ['Created', 'ReadyToShip'].includes(s.hamDurum)) {
        const satirlar = s.kalemler.filter((k) => k.satirId && /^\d+$/.test(k.satirId)).map((k) => ({ lineId: Number(k.satirId), quantity: k.adet }));
        await tyPaketDurumu(s.paketNo, satirlar, 'Picking');
        await pazaryeriGecmiseEkle(s.id, 'Otomatik: Trendyol’a “toplanıyor” bildirildi').catch(() => undefined);
        ozet.push(`Trendyol ${s.siparisNo}: “toplanıyor” bildirildi`);
      }
    } catch (e) { ozet.push(`Sipariş ${id}: ${mesaj(e)}`); }
  }

  // 1b. İptal / iade edilen pazaryeri siparişleri: stok aktarımda zaten düzeltildi; günlüğe ne olduğu yazılır
  for (const d of (o.donenler ?? []).slice(0, 10)) {
    if (kaldi() < 3000) break;
    try {
      const s = await pazaryeriSiparisiOku(d.id);
      if (!s || s.stokDisi) continue;
      const urunler = s.kalemler.map((k) => `${k.adet}× ${k.ad.slice(0, 40)}`).join(', ');
      const stok = d.yeni === 'iptal'
        ? (s.kalemler.some((k) => k.stok === 'geri-alindi') ? 'stok depoya geri eklendi' : 'stok değişmedi')
        : 'ürün depoya dönünce siparişte “satılabilir / satılamaz” seçin';
      ozet.push(`${s.kanal === 'trendyol' ? 'Trendyol' : 'Hepsiburada'} ${s.siparisNo} ${PY_DURUM_ADLARI[s.durum].toLocaleLowerCase('tr')}: ${urunler} — ${stok}`);
    } catch { /* günlük notu yazılamadı; sipariş zaten güncel */ }
  }

  // 3. İletilemeyen faturalar (30 dakikada bir, en fazla 3)
  if (ot.faturaYenidenDene && kaldi() > 6000) {
    try {
      const f = await finansOku();
      // Hepsiburada: API bağlıysa PDF faturanın bağlantısı sipariş paketlenince gönderilir (bkz. faturaIlet)
      const hbOtomatik = ['canli', 'test'].includes(pazaryeriApiDurumu('hepsiburada'));
      const bekleyen = f.faturalar.filter((x) => !x.iptal && x.ek
        && (x.kanal === 'trendyol' || x.kanal === 'web' || (x.kanal === 'hepsiburada' && hbOtomatik && x.ek.tur === 'application/pdf'))
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

  // 3b. Trendyol'a (satıcı panelinden de) yüklenmiş faturaları siteye al: Fatura merkezinde "kesildi + iletildi" görünsün.
  // Bağlantısı sipariş akışında gelenler hemen; gelmeyenler için her çalışmada en fazla 3 sipariş Trendyol'a sorulur.
  if (tyBagli && kaldi() > 7000) {
    try {
      const r = await trendyolFaturalariniAl({ enFazlaSorgu: o.gunlukZorla ? 10 : 3, sureMs: Math.min(20_000, kaldi() - 4000) });
      for (const x of r.alinan) ozet.push(`Trendyol ${x.siparisNo}: Trendyol’a yüklenen fatura siteye alındı (${x.no}${x.dosya ? '' : ', dosyası sonra alınacak'})`);
      for (const no of r.dosyasiTamamlanan) ozet.push(`Trendyol ${no}: fatura dosyası Trendyol’dan indirilip siteye eklendi`);
      for (const h of r.hatalar.slice(0, 2)) if (!(ot.sonOzet ?? []).some((x) => x.endsWith(h))) ozet.push(`Fatura alma: ${h}`);
    } catch (e) { ozet.push(`Trendyol faturalarını alma: ${mesaj(e)}`); }
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

  // 4b. Cevap bekleyen Trendyol müşteri soruları: 30 dakikada bir sayılır (İş Merkezi'nde görünür); yeni soru gelirse günlüğe yazılır
  const soru = ayar.kanallar.trendyol.soru;
  if (tyBagli && kaldi() > 6000 && eskiMi(soru.tarih, 30 * 60_000)) {
    try {
      const bekleyen = (await tySorular('WAITING_FOR_ANSWER', 14)).length;
      if (bekleyen > soru.bekleyen) ozet.push(`Trendyol’da cevap bekleyen ${bekleyen} müşteri sorusu var (Satış kanalları › Trendyol iade ve sorular)`);
      await envanterAyarlariGuncelle((a) => { a.kanallar.trendyol.soru = { bekleyen, tarih: new Date().toISOString() }; });
    } catch (e) { ozet.push(`Müşteri soruları: ${mesaj(e)}`); }
  }

  // 4c. Trendyol iade talepleri (claims): 30 dakikada bir çekilir. Her yeni talep/durum siparişin geçmişine ve günlüğe yazılır;
  // depoya ulaşıp onay bekleyenler İş Merkezi'nde görünür (onay: Satış kanalları › Trendyol iade ve sorular).
  const iadeTakip = ayar.kanallar.trendyol.iade;
  if (tyBagli && kaldi() > 8000 && (o.gunlukZorla || eskiMi(iadeTakip.tarih, 30 * 60_000))) {
    try {
      const [talepler, pySip] = await Promise.all([tyIadeler(30), pazaryeriSiparisleriOku().catch(() => [])]);
      const islenen = new Set(iadeTakip.islenen);
      const yeni: string[] = [];
      let bekleyen = 0;
      let acik = 0;
      for (const c of talepler) {
        const s = pySip.find((x) => x.kanal === 'trendyol' && x.siparisNo === c.siparisNo && (!c.paketId || x.paketNo === c.paketId))
          ?? pySip.find((x) => x.kanal === 'trendyol' && x.siparisNo === c.siparisNo);
        for (const k of c.kalemler) {
          if (k.durum === 'WaitingInAction') bekleyen++;
          else if (['Created', 'WaitingFraudCheck', 'InAnalysis'].includes(k.durum)) acik++;
          const anahtar = `${k.kalemId}:${k.durum}`.slice(0, 160);
          if (islenen.has(anahtar)) continue;
          const not = `İade talebi: ${k.urun.slice(0, 60)} — ${IADE_DURUMU[k.durum] ?? k.durum}${k.sebep ? ` (sebep: ${k.sebep.slice(0, 60)})` : ''}`;
          if (s && kaldi() > 4000) await pazaryeriGecmiseEkle(s.id, not).catch(() => undefined);
          ozet.push(`Trendyol ${c.siparisNo}: ${not}`);
          yeni.push(anahtar);
        }
      }
      await envanterAyarlariGuncelle((a) => {
        const x = a.kanallar.trendyol.iade;
        x.bekleyen = bekleyen; x.acik = acik; x.tarih = new Date().toISOString();
        x.islenen = [...yeni, ...x.islenen.filter((y) => !yeni.includes(y))].slice(0, 400);
      });
    } catch (e) {
      const m = `Trendyol iadeleri: ${mesaj(e)}`;
      if (!(ot.sonOzet ?? []).some((x) => x.endsWith(m))) ozet.push(m);
    }
  }

  // 4c-2. Trendyol ilan başına komisyon oranları: hiç okunmadıysa hemen, sonra günde bir (kâr hesapları bunu kullanır)
  const tyKom = ayar.kanallar.trendyol.komisyonTarih;
  if (tyBagli && kaldi() > 5_000 && (o.gunlukZorla || eskiMi(tyKom, 24 * 3600_000))) {
    try {
      const degisen = await tyKomisyonlariniGuncelle();
      if (degisen.length) ozet.push(`Trendyol komisyon oranları okundu: ${degisen.length} ürün (${degisen.slice(0, 3).map((d) => `${d.urunId} %${(d.yeni / 100).toLocaleString('tr-TR')}`).join(', ')}${degisen.length > 3 ? '…' : ''})`);
    } catch (e) { const m = `Trendyol komisyonları: ${mesaj(e)}`; if (!(ot.sonOzet ?? []).some((x) => x.endsWith(m))) ozet.push(m); }
  }

  // 4d. Hepsiburada otomatik ilan eşleştirme + ürün başına komisyon oranları: günde bir (canlı bağlantıda).
  const hbKom = ayar.kanallar.hepsiburada.komisyonTarih;
  if (pazaryeriApiDurumu('hepsiburada') === 'canli' && kaldi() > 5_000 && (o.gunlukZorla || eskiMi(hbKom, 24 * 3600_000))) {
    if (ot.otoBagla) {
      try {
        const hbEs = await hepsiburadaIlanlariniEsle(true);
        if (hbEs.baglanan) ozet.push(`${hbEs.baglanan} Hepsiburada ilanı sitedeki ürünüyle otomatik bağlandı (stok ortak)`);
      } catch (e) { ozet.push(`Hepsiburada ilan bağlama: ${mesaj(e)}`); }
    }
    try {
      const r = await hbKomisyonlariniGuncelle(Math.min(20_000, kaldi() - 4000));
      const degisen = r.guncellenen.filter((g) => g.eski !== g.yeni);
      if (degisen.length) ozet.push(`Hepsiburada komisyonları güncellendi: ${degisen.slice(0, 4).map((g) => `${g.ad} %${(g.yeni / 100).toLocaleString('tr-TR')}`).join(', ')}${degisen.length > 4 ? '…' : ''}`);
      if (r.eslesmeyenIlanlar.length) {
        const m = `Hepsiburada’da sitedeki ürüne eşleşmeyen ${r.eslesmeyenIlanlar.length} ilan var: Finans › Hepsiburada › Komisyonlar’dan görüp Ürün eşleştirme’de bağlayın`;
        if (!(ot.sonOzet ?? []).some((x) => x.endsWith(m))) ozet.push(m);
      }
    } catch (e) { ozet.push(`Hepsiburada komisyonları: ${mesaj(e)}`); }
  }

  // 5. Günlük işler
  const bugun = finansGunu();
  // Türkçe işlem adıyla yanlış okunmuş eski hakediş satırı varsa (25.11.2026 düzeltmesi) hakediş bugün yeniden çekilir
  // (yalnız hakediş çekilir; ilan/buybox gibi diğer günlük işler günde bir kalır)
  const gunluk = ot.gunlukIsler && tyBagli && (o.gunlukZorla || ot.sonGunluk !== bugun);
  const hakedisDuzelt = !gunluk && tyBagli && kaldi() > 8000 && await finansOku()
    .then((f) => f.trendyol.some((x) => Object.values(x.parcalar ?? {}).some((p) => !!p.tur && /[şıçğüöİ]/i.test(p.tur))), () => false);
  if (hakedisDuzelt) {
    try {
      const son = Date.now();
      const ham = await trendyolEkstreCek(son - 15 * 86_400_000, son, AbortSignal.timeout(Math.max(3000, Math.min(20_000, kaldi() - 2000))));
      const e = trendyolEkstreSatirlari(ham.satislar, ham.diger);
      if (e.satirlar.length) await trendyolKaydet(e.satirlar);
      const m = `Trendyol hakedişi yeniden okundu ve düzeltildi (${e.satirlar.length} satır)`;
      if (!(ot.sonOzet ?? []).some((x) => x.endsWith(m))) ozet.push(m);
    } catch (e) { const m = `Trendyol hakedişi düzeltme: ${mesaj(e)}`; if (!(ot.sonOzet ?? []).some((x) => x.endsWith(m))) ozet.push(m); }
  }
  let gunlukBitti = false;
  if (gunluk && kaldi() > 8000) {
    // Önce hakediş (günün tamamlandı sayılması buna bağlı), sonra ilan işleri: süre biterse ertesi güne kalırlar
    if (kaldi() > 6000) {
      try {
        const son = Date.now();
        const ham = await trendyolEkstreCek(son - 15 * 86_400_000, son, AbortSignal.timeout(Math.max(3000, Math.min(20_000, kaldi() - 2000))));
        const e = trendyolEkstreSatirlari(ham.satislar, ham.diger);
        if (e.satirlar.length) await trendyolKaydet(e.satirlar);
        ozet.push(e.kayit ? `Trendyol hakedişi güncellendi (${e.satirlar.length} satır)` : 'Trendyol hakedişinde yeni kayıt yok');
        gunlukBitti = true;
      } catch (e) { ozet.push(`Trendyol hakedişi: ${mesaj(e)}`); }
    }
    if (kaldi() > 6000) {
      try {
        const notlar = await ilanDurumlariniYenile(undefined, 12);
        ozet.push(...notlar);
      } catch (e) { ozet.push(`İlan durumları: ${mesaj(e)}`); }
    }
    // Her ürünün stoğu ortak olsun: aynı barkod/stok kodlu yeni Trendyol ilanları kendiliğinden bağlanır (fiyata dokunulmaz).
    if (ot.otoBagla && kaldi() > 8000) {
      try {
        const r = await trendyolIlanlariniEsle(true);
        if (r.baglanan) ozet.push(`${r.baglanan} Trendyol ilanı sitedeki ürünüyle bağlandı (stok ortak, fiyat değişmedi)`);
        const bagsiz = r.satirlar.filter((s) => s.durum === 'yok').length;
        if (bagsiz) ozet.push(`Trendyol’da sitede karşılığı olmayan ${bagsiz} ilan var: Satış kanalları › Trendyol ilanları’ndan siteye çekebilir ya da bağlayabilirsiniz`);
        const cift = r.satirlar.filter((s) => s.cift).length;
        if (cift) ozet.push(`Trendyol’da aynı ürün için fazladan ${cift} ilan var (çift ilan): Satış kanalları › Trendyol ilanları › “Çift ilanlar”dan hangisinin kalacağını seçin`);
      } catch (e) { ozet.push(`İlan bağlama: ${mesaj(e)}`); }
    }
    // Buybox: bağlı ilanlardan başka mağazanın önde olduğu varsa haber ver (fiyat kendiliğinden değişmez)
    if (kaldi() > 8000) {
      try {
        const bagli = Object.entries(ayar.kanallar.trendyol.urunler).filter(([, e]) => e.kod && e.satista !== false);
        if (bagli.length) {
          const bb = await tyBuybox(bagli.map(([, e]) => e.kod!));
          const kayip = [...bb.values()].filter((b) => b.cokSatici && b.sira !== undefined && b.sira > 1);
          if (kayip.length) {
            const para = (n?: number) => n === undefined ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' TL';
            ozet.push(`Trendyol buybox: ${kayip.length} üründe başka mağaza önde (${kayip.slice(0, 3).map((b) => `${b.barkod} ${b.sira}. sıra, en iyi ${para(b.fiyat)}`).join('; ')}). Satış kanalları › Trendyol ilanları › “Buybox durumunu getir”`);
          }
        }
      } catch (e) { ozet.push(`Buybox kontrolü: ${mesaj(e)}`); }
    }
    // Pasife düşen Trendyol anlık sipariş bildirimi (webhook) varsa kendiliğinden yeniden aktifleştir
    if (kaldi() > 5000 && bildirimAnahtari('trendyol')) {
      try {
        const hedef = `${SITE}${BILDIRIM_YOLU.trendyol}`;
        const mevcut = await tyWebhooklar();
        const bizim = mevcut.find((w) => w.url.replace(/\/$/, '') === hedef.replace(/\/$/, ''));
        if (bizim && bizim.durum !== 'ACTIVE') {
          await tyWebhookAktif(bizim.id);
          ozet.push('Trendyol anlık sipariş bildirimi (webhook) pasiften yeniden aktifleştirildi');
        }
      } catch (e) { ozet.push(`Webhook kontrolü: ${mesaj(e)}`); }
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
