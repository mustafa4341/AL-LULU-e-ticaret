/**
 * Aylık veri yedeği (panel: Genel Bakış > "Veri yedeği indir").
 * Tek ZIP: siparişler (JSON + Excel'de açılan CSV), mağaza (ürünler, setler, ayarlar),
 * onaylanan sözleşmeler, finans kayıtları. Fotoğraflar boyut nedeniyle dahil değildir.
 * Son yedek tarihi Supabase medya_dosyalari'nda "_yedek/son.json" olarak tutulur.
 */
import { magazaOku, siparisleriOku, sozlesmeOku, supabaseIstemci, type SozlesmeKaydi } from './depo';
import { finansOku } from './finansDepo';
import { csvOlustur, zipOlustur } from './finansArsiv';
import { SIPARIS_DURUM_ADLARI } from './sema';

const SON_YEDEK = '_yedek/son.json';
export const YEDEK_ARALIGI_GUN = 30;

export async function sonYedekTarihi(): Promise<string | undefined> {
  const sb = supabaseIstemci();
  if (!sb) return undefined;
  const { data } = await sb.from('medya_dosyalari').select('veri_base64').eq('yol', SON_YEDEK).eq('aktif', true).maybeSingle();
  if (!data?.veri_base64) return undefined;
  try { return (JSON.parse(Buffer.from(data.veri_base64, 'base64').toString('utf8')) as { tarih?: string }).tarih; } catch { return undefined; }
}

async function sonYedekKaydet(tarih: string) {
  const sb = supabaseIstemci();
  if (!sb) return;
  const buf = Buffer.from(JSON.stringify({ tarih }), 'utf8');
  const { error } = await sb.from('medya_dosyalari').upsert({
    yol: SON_YEDEK, icerik_turu: 'application/json', boyut: buf.length, veri_base64: buf.toString('base64'), aktif: true,
  });
  if (error) console.error('[yedek] Son yedek tarihi kaydedilemedi:', error.message);
}

async function tumSozlesmeler(nolar: string[]): Promise<SozlesmeKaydi[]> {
  const sb = supabaseIstemci();
  if (!sb) return (await Promise.all(nolar.map(sozlesmeOku))).filter((x): x is SozlesmeKaydi => !!x);
  const sonuc: SozlesmeKaydi[] = [];
  for (let bas = 0; ; bas += 500) {
    const { data, error } = await sb.from('sozlesmeler')
      .select('no, surum, onay_tarihi, ip, tarayici, on_bilgilendirme, mesafeli_satis')
      .order('no').range(bas, bas + 499);
    if (error) throw new Error('Sözleşmeler okunamadı: ' + error.message);
    for (const d of data ?? []) sonuc.push({
      no: d.no, surum: d.surum, onayTarihi: d.onay_tarihi, ip: d.ip, tarayici: d.tarayici ?? undefined,
      onBilgilendirme: d.on_bilgilendirme, mesafeliSatis: d.mesafeli_satis,
    });
    if (!data || data.length < 500) break;
  }
  return sonuc;
}

const json = (v: unknown) => Buffer.from(JSON.stringify(v, null, 2), 'utf8');
const saat = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' });

/** Yedek ZIP'ini hazırlar ve son yedek tarihini kaydeder */
export async function yedekOlustur(): Promise<{ ad: string; veri: Buffer }> {
  const [magaza, siparisler, finans] = await Promise.all([magazaOku(), siparisleriOku(), finansOku()]);
  const sozlesmeler = await tumSozlesmeler(siparisler.map((s) => s.no));
  const simdi = new Date();
  const gun = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(simdi);

  const tablo = [
    ['Sipariş no', 'Tarih', 'Durum', 'Ad', 'Soyad', 'Telefon', 'E-posta', 'İl', 'İlçe', 'Adres', 'Ürünler', 'Toplam (TL)', 'Kargo takip', 'Ödeme'],
    ...siparisler.map((s) => [
      s.no, saat.format(new Date(s.tarih)), SIPARIS_DURUM_ADLARI[s.durum] ?? s.durum, s.musteri.ad, s.musteri.soyad, s.musteri.tel,
      s.musteri.eposta ?? '', s.teslimat.il, s.teslimat.ilce, s.teslimat.adres,
      s.kalemler.map((k) => `${k.adet} x ${k.ad}`).join(' | '), s.toplam, s.kargoTakip ?? '',
      s.paytr ? (s.paytr.test ? 'PayTR (test)' : 'PayTR') : 'Havale/diğer',
    ]),
  ];

  const okubeni = [
    `Al Lulu Home veri yedeği — ${saat.format(simdi)}`,
    '',
    'siparisler.csv        Siparişler (Excel ile açılır)',
    'siparisler.json       Siparişlerin tam kaydı (geri yükleme için)',
    'magaza.json           Ürünler, setler, kategoriler ve site ayarları',
    'sozlesmeler.json      Müşterilerin onayladığı sözleşmelerin tam metni (yasal kayıt)',
    'finans.json           Belgeler, giderler ve Trendyol kayıtları',
    '',
    'Fotoğraflar bu yedekte yoktur. Bu dosyada müşteri kişisel verileri bulunur:',
    'şifreli bir klasörde / güvenli bir yerde saklayın, kimseyle paylaşmayın.',
  ].join('\r\n');

  const veri = zipOlustur([
    { ad: 'OKUBENI.txt', veri: Buffer.from('﻿' + okubeni, 'utf8') },
    { ad: 'siparisler.csv', veri: csvOlustur(tablo) },
    { ad: 'siparisler.json', veri: json(siparisler) },
    { ad: 'magaza.json', veri: json(magaza) },
    { ad: 'sozlesmeler.json', veri: json(sozlesmeler) },
    { ad: 'finans.json', veri: json(finans) },
  ], true);
  await sonYedekKaydet(simdi.toISOString());
  return { ad: `allulu-yedek-${gun}.zip`, veri };
}
