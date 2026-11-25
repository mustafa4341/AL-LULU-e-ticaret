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
import { faturaGuncelle, faturaKaydet, finansOku } from './finansDepo';
import { PazaryeriApiHatasi, pazaryeriApiDurumu } from './pazaryeriApi';
import { envanterAyarlariOku, pazaryeriSiparisleriOku } from './pazaryeriDepo';
import { tyPaketFaturaLinkleri } from './trendyolApi';

export type KanalFaturaSonucu = { alinan: { siparisNo: string; no: string; dosya: boolean }[]; kontrolEdilen: number; hatalar: string[] };

const GIB_NO = /[A-Z0-9]{3}20\d{2}\d{9}/i;
const EN_BUYUK = 4 * 1024 * 1024;

/** Fatura bağlantısındaki dosyayı indirir (yalnız https, IP/yerel adres değil, en fazla 4 MB, PDF/JPEG/PNG). */
async function faturaDosyasiIndir(link: string): Promise<File | undefined> {
  let url: URL;
  try { url = new URL(link); } catch { return undefined; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || isIP(host.replace(/^\[|\]$/g, '')) || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return undefined;
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
    return new File([new Uint8Array(veri)], 'fatura.' + (tur === 'application/pdf' ? 'pdf' : tur === 'image/png' ? 'png' : 'jpg'), { type: tur });
  } catch { return undefined; }
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
  const sonuc: KanalFaturaSonucu = { alinan: [], kontrolEdilen: 0, hatalar: [] };
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
    const dosya = await faturaDosyasiIndir(link);
    try {
      const { kayit } = await faturaKaydet({
        kanal: 'trendyol', kayit: a.kayit, siparisNo: a.siparisNo, no,
        tarih: finansGunu(Date.parse(a.py!.kanalFatura?.tarih ?? '') || Date.now()),
        alici: (a.alici.firma || a.alici.ad || 'Trendyol müşterisi').slice(0, 200),
        matrah: a.toplam.matrah, kdv: a.toplam.kdv, toplam: a.toplam.genel,
      }, dosya);
      await faturaGuncelle(kayit.id, (x) => {
        x.iletim = {
          durum: 'gonderildi', tarih: new Date().toISOString(),
          mesaj: (`Trendyol’da yüklü (satıcı panelinden ya da API ile). Siteye otomatik alındı${dosya ? '' : '; dosya bağlantıdan indirilemedi'}. Bağlantı: ${link}`).slice(0, 500),
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
  return sonuc;
}
