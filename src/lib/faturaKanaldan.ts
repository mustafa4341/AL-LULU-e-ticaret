/**
 * Kanaldan faturayı siteye alma (25.11.2026, mağaza sahibinin isteği):
 * "Trendyol'da faturayı elle yüklediğimde sitede de güncellensin."
 *
 * Trendyol, faturası yüklenmiş paketlerde `invoiceLink` alanını doldurur (satıcı panelinden elle yüklense de).
 * Sitede faturası kayıtlı olmayan Trendyol siparişlerinde bu bağlantı görülürse:
 *   • Fatura merkezine kayıt açılır (iletim: "Trendyol'da yüklü"), böylece "Faturası kesilecek" listesinden düşer;
 *   • bağlantı doğrudan PDF/JPEG/PNG veriyorsa dosya indirilip kayda eklenir (sitede de açılabilir, muhasebeciye arşivlenir).
 * Fatura numarası Trendyol'da bildirilmez; bağlantıda GİB biçiminde (ABC2026000000123) numara varsa o kullanılır,
 * yoksa "TY-<paket no>" yazılır ve panelde düzeltilebilir.
 */
import { isIP } from 'node:net';
import { siparisleriOku } from './depo';
import { finansGunu } from './finans';
import { faturaAdaylari, type FaturaAdayi } from './faturaMerkezi';
import type { FaturaKaydi } from './finans';
import { faturaDosyaKaydet, faturaGuncelle, faturaKaydet, finansOku } from './finansDepo';
import { PazaryeriApiHatasi, pazaryeriApiDurumu, trendyolDosyaIndir } from './pazaryeriApi';
import { envanterAyarlariOku, pazaryeriSiparisleriOku } from './pazaryeriDepo';
import { tyPaketFaturaLinkleri } from './trendyolApi';

export type KanalFaturaSonucu = { alinan: { siparisNo: string; no: string; dosya: boolean }[]; kontrolEdilen: number; hatalar: string[]; dosyasiTamamlanan: string[] };

const GIB_NO = /[A-Z0-9]{3}20\d{2}\d{9}/i;
const EN_BUYUK = 4 * 1024 * 1024;

const dosyaYap = (veri: Buffer, tur: 'application/pdf' | 'image/jpeg' | 'image/png') =>
  new File([new Uint8Array(veri)], 'fatura.' + (tur === 'application/pdf' ? 'pdf' : tur === 'image/png' ? 'png' : 'jpg'), { type: tur });

/**
 * Fatura bağlantısındaki dosyayı indirir (yalnız https, IP/yerel adres değil, en fazla 4 MB, PDF/JPEG/PNG).
 * Trendyol'un kendi sunucusundaki bağlantılar (apigw.trendyol.com) giriş ister: API kimliğiyle indirilir.
 */
export async function faturaDosyasiIndir(link: string): Promise<{ dosya?: File; hata?: string }> {
  let url: URL;
  try { url = new URL(link); } catch { return { hata: 'bağlantı geçersiz' }; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || isIP(host.replace(/^\[|\]$/g, '')) || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return { hata: 'bağlantı güvenli değil' };
  if (/(^|\.)trendyol\.com$/.test(host)) {
    try {
      const { veri, tur } = await trendyolDosyaIndir(link, AbortSignal.timeout(20_000));
      if (veri.length > EN_BUYUK) return { hata: 'dosya 4 MB’tan büyük' };
      return { dosya: dosyaYap(veri, tur) };
    } catch (e) {
      return { hata: e instanceof PazaryeriApiHatasi ? e.message : 'Trendyol’dan indirilemedi' };
    }
  }
  return { dosya: await herkeseAcikIndir(url) ?? undefined, hata: undefined };
}

async function herkeseAcikIndir(url: URL): Promise<File | undefined> {
  try {
    const y = await fetch(url, { redirect: 'follow', headers: { Accept: 'application/pdf,image/jpeg,image/png;q=0.9,*/*;q=0.1' }, signal: AbortSignal.timeout(12_000) });
    if (!y.ok || new URL(y.url || url.href).protocol !== 'https:') return undefined;
    const uzunluk = Number(y.headers.get('content-length') ?? 0);
    if (uzunluk > EN_BUYUK) return undefined;
    const veri = Buffer.from(await y.arrayBuffer());
    if (!veri.length || veri.length > EN_BUYUK) return undefined;
    const tur = veri.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf'
      : veri[0] === 0xff && veri[1] === 0xd8 ? 'image/jpeg'
        : veri.subarray(1, 4).toString() === 'PNG' ? 'image/png' : undefined;
    if (!tur) return undefined; // e-Arşiv görüntüleme sayfası (HTML) olabilir: yalnız bağlantı saklanır
    return dosyaYap(veri, tur);
  } catch { return undefined; }
}

/** Kayıttaki kanal bağlantısı: yeni kayıtlarda kanalLink, eski kayıtlarda iletim mesajındaki "Bağlantı: …" */
export const faturaKanalLinki = (k: FaturaKaydi) => k.kanalLink ?? k.iletim.mesaj?.match(/Bağlantı: (https:\/\/\S+)/)?.[1];

/**
 * Kanaldan alınmış ama dosyası eklenmemiş faturanın dosyasını indirip kayda ekler. Başarısızsa denenme zamanı yazılır.
 * Fatura dosya ekranı (PDF düğmesi) ve otomatik işler kullanır.
 */
export async function kanalFaturaDosyasiniTamamla(k: FaturaKaydi): Promise<{ tamam: boolean; hata?: string }> {
  const link = faturaKanalLinki(k);
  if (k.ek || k.iptal || !link) return { tamam: !!k.ek, hata: link ? undefined : 'kanal bağlantısı yok' };
  const r = await faturaDosyasiIndir(link);
  if (r.dosya) {
    await faturaDosyaKaydet(k.id, r.dosya);
    await faturaGuncelle(k.id, (x) => {
      x.kanalLink = link;
      x.kanalDeneme = new Date().toISOString();
      if (x.iletim.durum === 'gonderildi') x.iletim.mesaj = 'Trendyol’da yüklü; fatura dosyası siteye alındı.';
    });
    return { tamam: true };
  }
  await faturaGuncelle(k.id, (x) => { x.kanalLink = link; x.kanalDeneme = new Date().toISOString(); }).catch(() => undefined);
  return { tamam: false, hata: r.hata ?? 'dosya bağlantıdan alınamadı' };
}

function faturaNoUret(a: FaturaAdayi, link: string, kullanilan: Set<string>): string {
  const bulunan = (() => { try { return decodeURIComponent(link).match(GIB_NO)?.[0]?.toUpperCase(); } catch { return undefined; } })();
  if (bulunan && !kullanilan.has(bulunan)) return bulunan;
  const temel = ('TY-' + (a.paketNo ?? a.siparisNo)).replace(/[^A-Z0-9./-]/gi, '').slice(0, 36).toUpperCase();
  let no = temel;
  for (let i = 2; kullanilan.has(no); i++) no = `${temel}-${i}`.slice(0, 40);
  return no;
}

/**
 * Faturası sitede kayıtlı olmayan Trendyol siparişlerinde Trendyol'a yüklenmiş faturayı siteye alır.
 * `enFazlaSorgu`: bağlantısı henüz bilinmeyen kaç sipariş için Trendyol'a ayrıca sorulacağı (her biri tek istek).
 */
export async function trendyolFaturalariniAl(secenek: { enFazlaSorgu?: number; sureMs?: number; siparisNo?: string } = {}): Promise<KanalFaturaSonucu> {
  const sonuc: KanalFaturaSonucu = { alinan: [], kontrolEdilen: 0, hatalar: [], dosyasiTamamlanan: [] };
  if (!['canli', 'test'].includes(pazaryeriApiDurumu('trendyol'))) return sonuc;
  const bitis = Date.now() + (secenek.sureMs ?? 20_000);
  const [finans, web, py, ayar] = await Promise.all([finansOku(), siparisleriOku(), pazaryeriSiparisleriOku(), envanterAyarlariOku().catch(() => undefined)]);
  const adaylar = faturaAdaylari(finans, web, py, ayar)
    .filter((a) => a.kanal === 'trendyol' && !a.fatura && a.py && a.paketNo && (!secenek.siparisNo || a.siparisNo === secenek.siparisNo))
    // Önce bağlantısı bilinenler (sorgu gerekmez), sonra en yeniler
    .sort((x, y) => Number(!!y.py!.kanalFatura) - Number(!!x.py!.kanalFatura) || Date.parse(y.tarih) - Date.parse(x.tarih));
  const kullanilan = new Set(finans.faturalar.filter((x) => !x.iptal).map((x) => x.no.toUpperCase()));
  let sorgu = 0;
  const enFazla = secenek.enFazlaSorgu ?? 6;
  for (const a of adaylar) {
    if (Date.now() > bitis - 3000) break;
    let link = a.py!.kanalFatura?.link;
    if (!link) {
      // 60 günden eski siparişler için Trendyol'a sorulmaz (satıcı panelinden zaten kapanmıştır)
      if (sorgu >= enFazla || Date.now() - Date.parse(a.tarih) > 60 * 86_400_000) continue;
      sorgu++;
      try {
        link = (await tyPaketFaturaLinkleri(a.siparisNo)).get(a.paketNo!);
      } catch (e) {
        sonuc.hatalar.push(`${a.siparisNo}: ${e instanceof PazaryeriApiHatasi ? e.message : 'Trendyol okunamadı'}`);
        continue;
      }
    }
    sonuc.kontrolEdilen++;
    if (!link) continue;
    const no = faturaNoUret(a, link, kullanilan);
    const { dosya } = await faturaDosyasiIndir(link);
    try {
      const { kayit } = await faturaKaydet({
        kanal: 'trendyol', kayit: a.kayit, siparisNo: a.siparisNo, no,
        tarih: finansGunu(Date.parse(a.py!.kanalFatura?.tarih ?? '') || Date.now()),
        alici: (a.alici.firma || a.alici.ad || 'Trendyol müşterisi').slice(0, 200),
        matrah: a.toplam.matrah, kdv: a.toplam.kdv, toplam: a.toplam.genel,
      }, dosya);
      await faturaGuncelle(kayit.id, (x) => {
        x.kanalLink = link;
        x.kanalDeneme = new Date().toISOString();
        x.iletim = {
          durum: 'gonderildi', tarih: new Date().toISOString(),
          mesaj: dosya ? 'Trendyol’da yüklü; fatura dosyası siteye alındı.' : 'Trendyol’da yüklü; dosyası bir sonraki denemede alınacak (PDF düğmesiyle de açılabilir).',
        };
      });
      kullanilan.add(no);
      sonuc.alinan.push({ siparisNo: a.siparisNo, no, dosya: !!dosya });
    } catch (e) {
      // Aynı anda panelden kaydedilmişse ("zaten kayıtlı") sessizce geç
      const m = e instanceof Error ? e.message : '';
      if (!/zaten kayıtlı/i.test(m)) sonuc.hatalar.push(`${a.siparisNo}: ${m.slice(0, 160) || 'fatura kaydedilemedi'}`);
    }
  }
  // Önceden alınıp dosyası eklenemeyenler: kendiliğinden yalnız bir kez denenir (Trendyol dosyayı entegrasyona vermeyebiliyor,
  // ör. HTTP 403); sonra panelde "PDF" düğmesiyle elle denenebilir. En fazla 3 kayıt.
  const eksikler = finans.faturalar.filter((x) => x.kanal === 'trendyol' && !x.iptal && !x.ek && faturaKanalLinki(x)
    && Date.now() - Date.parse(x.olusturma) < 60 * 86_400_000 && !x.kanalDeneme).slice(0, 3);
  for (const x of eksikler) {
    if (Date.now() > bitis - 3000) break;
    const r = await kanalFaturaDosyasiniTamamla(x).catch((e) => ({ tamam: false, hata: e instanceof Error ? e.message : 'hata' }));
    if (r.tamam) sonuc.dosyasiTamamlanan.push(x.siparisNo);
    else if (r.hata) sonuc.hatalar.push(`${x.siparisNo} fatura dosyası: ${r.hata}`);
  }
  return sonuc;
}
