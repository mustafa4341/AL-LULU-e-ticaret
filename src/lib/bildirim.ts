/**
 * Sipariş bildirimleri — e-posta (Google Workspace SMTP) ve SMS.
 * Ayar yoksa bildirim gönderilmez, sadece sunucu günlüğüne yazılır; sipariş yine kaydedilir.
 * E-postaların görünümü: lib/epostaSablon.ts
 *
 * .env (ayrıntı: EPOSTA-VE-GOOGLE.md):
 *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465
 *   SMTP_KULLANICI=info@alluluhome.com (tek gerçek hesap)   SMTP_PAROLA=<Google "uygulama şifresi", 16 harf>
 *   SMTP_GONDEREN="Al Lulu Home <musteri@alluluhome.com>"  (takma ad; Gmail > Farklı gönder listesinde olmalı)
 *   EPOSTA_YANIT=musteri@alluluhome.com         (müşteri "Yanıtla"ya basınca buraya gider)
 *   SIPARIS_BILDIRIM_EPOSTA=halime.karsu@alluluhome.com   (yeni sipariş bildirimi; virgülle birden çok adres)
 * SMS için: SMS sağlayıcısı (Netgsm, İletimerkezi vb.) seçildiğinde smsGonder() doldurulacak.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import type { Siparis, SiteAyarlari } from './sema';
import { SIPARIS_DURUM_ADLARI } from './sema';
import { KANALLAR, kurusTL, type PazaryeriSiparisi } from './pazaryeri';
import { formatTL } from './fiyat';
import { EPOSTA_GIDEN_DURUMLAR, durumEpostasi, faturaEpostasi, pazaryeriSiparisEpostasi, siparisAlindiEpostasi, sozlesmelerEpostasi, yeniSiparisEpostasi, type Eposta, type GorselBul } from './epostaSablon';
import { magazaOku, siparisleriOku, sozlesmeOku, supabaseIstemci } from './depo';

const ortam = (ad: string): string | undefined => process.env[ad] ?? (import.meta.env as Record<string, string | undefined>)[ad];

let tasiyici: Transporter | null | undefined;
function eposta(): Transporter | null {
  if (tasiyici !== undefined) return tasiyici;
  const host = ortam('SMTP_HOST');
  if (!host || !ortam('SMTP_PAROLA')) return (tasiyici = null); // şifre girilene kadar gönderme denenmez
  const port = Number(ortam('SMTP_PORT') || 465);
  tasiyici = nodemailer.createTransport({
    host, port, secure: port === 465,
    // Google uygulama şifresi "abcd efgh ijkl mnop" diye boşluklu gösterilir; boşluklar ve tırnaklar silinir
    auth: { user: ortam('SMTP_KULLANICI')?.trim(), pass: ortam('SMTP_PAROLA')?.replace(/[\s"']/g, '') },
    // Sunucusuz ortamda (Vercel) istek uzun süre asılı kalmasın
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
  });
  return tasiyici;
}

/** Panelde gösterilen e-posta türleri. Anahtar: "<tür>:<sipariş no>" (Supabase eposta_kayitlari) */
export const EPOSTA_TUR_ADLARI: Record<string, string> = {
  alindi: 'Sipariş alındı (müşteri)',
  sozlesmeler: 'Sözleşmeler (müşteri)',
  magaza: 'Yeni sipariş (mağaza)',
  'durum-odendi': 'Ödeme onaylandı',
  'durum-kargoda': 'Kargoya verildi',
  'durum-teslim-edildi': 'Teslim edildi',
  'durum-iptal': 'Sipariş iptal edildi',
  fatura: 'Fatura (müşteri)',
  'pazaryeri-yeni': 'Yeni pazaryeri siparişi (mağaza)',
};

/** Yeni Trendyol / Hepsiburada siparişini mağazaya bildirir (aynı sipariş için bir kez). */
export async function pazaryeriSiparisBildir(s: PazaryeriSiparisi): Promise<GonderimSonucu> {
  const { site } = await magazaOku();
  const uyarilar: string[] = [];
  if (s.kalemler.some((k) => !k.urunId)) uyarilar.push('Ürün eşleşmedi: siparişi açıp doğru ürünü seçin, stok o zaman düşer.');
  if (s.kalemler.some((k) => k.eksik > 0)) uyarilar.push('Stok yetmedi: depodaki adedi kontrol edin.');
  const e = pazaryeriSiparisEpostasi(site, {
    kanal: KANALLAR[s.kanal], siparisNo: s.siparisNo, paketNo: s.paketNo, musteri: s.musteri, il: s.il, toplamTL: kurusTL(s.toplam),
    panelYolu: `/yonetim/siparisler/pazaryeri/${encodeURIComponent(s.id)}`,
    kalemler: s.kalemler.map((k) => ({ ad: k.ad, adet: k.adet, eslesmedi: !k.urunId })),
    sonKargo: s.sonKargoTarihi ? new Date(s.sonKargoTarihi).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short' }) : undefined,
    uyarilar,
  });
  return epostaGonder(magazaAdresi(site), e, { no: s.id.slice(0, 60), tur: 'pazaryeri-yeni' });
}

/** Fatura merkezi: kesilen faturayı web müşterisine e-postayla gönderir (tekrar gönderimde zorla). */
export async function faturaGonder(s: Siparis, faturaNo: string, ek: { dosyaAdi: string; icerik: Buffer; tur: string }, origin: string, zorla = false): Promise<GonderimSonucu> {
  if (!s.musteri.eposta) return 'kapali';
  const { site } = await magazaOku();
  const takipUrl = new URL(`/siparis/${s.no}?t=${s.token}`, origin).href;
  // Tekrar engeli fatura numarasına göre: ilk fatura iptal edilip düzeltilmiş fatura kesilince o da müşteriye gider.
  return epostaGonder(s.musteri.eposta, faturaEpostasi(s, site, faturaNo, takipUrl, ek), { no: s.no, tur: 'fatura', zorla, ek: faturaNo });
}

export type GonderimSonucu = 'gonderildi' | 'zaten-gonderildi' | 'hata' | 'kapali';

interface Kayit {
  no: string; tur: string; zorla?: boolean;
  /** Aynı siparişte aynı türden birden çok e-posta olabiliyorsa (ör. düzeltilmiş fatura) tekrar engeli anahtarına eklenir */
  ek?: string;
}

/**
 * Tek bir e-posta gönderir. Kayıt verilirse Supabase'te aynı e-postanın ikinci kez gitmesi engellenir
 * (PayTR bildirimi tekrar gelebilir, panelde iki kez basılabilir) ve sonuç panelde görünür.
 */
async function epostaGonder(kime: string, e: Eposta, kayit?: Kayit, yanit?: string): Promise<GonderimSonucu> {
  const t = eposta();
  if (!t) return 'kapali';
  const sb = kayit ? supabaseIstemci() : null;
  const anahtar = kayit ? `${kayit.tur}:${kayit.no}${kayit.ek ? ':' + kayit.ek.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60) : ''}` : '';
  if (sb && kayit) {
    const { data, error } = await sb.rpc('eposta_gonderim_al', {
      p_anahtar: anahtar, p_siparis_no: kayit.no, p_tur: kayit.tur, p_alici: kime, p_zorla: !!kayit.zorla,
    });
    if (error) console.error('[bildirim] E-posta kaydı alınamadı, yine de gönderiliyor:', error.message);
    else if (data === false) return 'zaten-gonderildi';
  }
  let sonuc: GonderimSonucu = 'gonderildi';
  let hata: string | null = null;
  let mesajId: string | null = null;
  try {
    const bilgi = await t.sendMail({
      from: ortam('SMTP_GONDEREN') || ortam('SMTP_KULLANICI'),
      to: kime,
      replyTo: yanit || ortam('EPOSTA_YANIT') || undefined,
      subject: e.konu.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 250), text: e.metin, html: e.html, // konu satırına satır sonu girmesin
      attachments: e.ekler?.map((x) => ({ filename: x.dosyaAdi, content: x.icerik, contentType: x.tur.startsWith('text/') ? `${x.tur}; charset=utf-8` : x.tur })),
    });
    mesajId = bilgi.messageId ?? null;
  } catch (h) {
    sonuc = 'hata';
    hata = String((h as Error)?.message ?? h).slice(0, 500);
    console.error('[bildirim] E-posta gönderilemedi:', hata);
  }
  if (sb && kayit) {
    const simdi = new Date().toISOString();
    const { error } = await sb.from('eposta_kayitlari').update({
      durum: sonuc, son_hata: hata, mesaj_id: mesajId, guncelleme: simdi, ...(sonuc === 'gonderildi' ? { gonderim: simdi } : {}),
    }).eq('anahtar', anahtar);
    if (error) console.error('[bildirim] E-posta sonucu kaydedilemedi:', error.message);
  }
  return sonuc;
}

export interface EpostaKaydi { tur: string; ad: string; alici: string; durum: string; deneme: number; sonHata?: string; tarih: string }

/** Panel: bir siparişin e-posta geçmişi */
export async function epostaKayitlari(no: string): Promise<EpostaKaydi[]> {
  const sb = supabaseIstemci();
  if (!sb) return [];
  const { data, error } = await sb.from('eposta_kayitlari').select('*').eq('siparis_no', no).order('olusturma');
  if (error || !data) return [];
  return data.map((r) => ({
    tur: r.tur, ad: EPOSTA_TUR_ADLARI[r.tur] ?? r.tur, alici: r.alici, durum: r.durum, deneme: r.deneme,
    sonHata: r.son_hata ?? undefined, tarih: r.gonderim ?? r.guncelleme,
  }));
}

/** Servis tanılama: son hatalı e-posta gönderim kayıtları */
export async function hataliEpostalariOku(limit = 10): Promise<(EpostaKaydi & { siparisNo: string })[]> {
  const sb = supabaseIstemci();
  if (!sb) return [];
  const { data, error } = await sb.from('eposta_kayitlari').select('*').eq('durum', 'hata').order('guncelleme', { ascending: false }).limit(limit);
  if (error || !data) return [];
  return data.map((r) => ({
    siparisNo: r.siparis_no,
    tur: r.tur,
    ad: EPOSTA_TUR_ADLARI[r.tur] ?? r.tur,
    alici: r.alici,
    durum: r.durum,
    deneme: r.deneme,
    sonHata: r.son_hata ?? undefined,
    tarih: r.guncelleme,
  }));
}

/** Servis tanılama: SMTP sunucu bağlantısını ve uygulama şifresini canlı doğrular */
export async function smtpDogrula(): Promise<{ ok: boolean; sureMs: number; hata?: string }> {
  const t = eposta();
  const bas = Date.now();
  if (!t) return { ok: false, sureMs: 0, hata: 'SMTP_HOST veya SMTP_PAROLA tanımlı değil.' };
  try {
    await t.verify();
    return { ok: true, sureMs: Date.now() - bas };
  } catch (e) {
    return { ok: false, sureMs: Date.now() - bas, hata: String((e as Error)?.message ?? e).slice(0, 300) };
  }
}

/** Servis tanılama: mağaza bildirim adresine canlı test e-postası gönderir */
export async function testEpostasiGonder(hedef?: string): Promise<{ ok: boolean; alici: string; hata?: string }> {
  const { site } = await magazaOku();
  const alici = (hedef?.trim() || magazaAdresi(site)).trim();
  const t = eposta();
  if (!t) return { ok: false, alici, hata: 'SMTP_HOST veya SMTP_PAROLA tanımlı değil.' };
  const zaman = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'medium' });
  try {
    await t.sendMail({
      from: ortam('SMTP_GONDEREN') || ortam('SMTP_KULLANICI'),
      to: alici,
      replyTo: ortam('EPOSTA_YANIT') || undefined,
      subject: `${site.ad} · Servis ve E-posta Bağlantı Testi (${zaman})`,
      text: `${site.ad} yönetim panelinden gönderilen canlı SMTP bağlantı testi başarılı.\nGönderim zamanı: ${zaman}\nAlıcı: ${alici}`,
      html: `<div style="font-family:sans-serif;max-width:520px;padding:20px;border:1px solid #e6dccf;border-radius:12px;background:#faf7f2;color:#261c14"><h2 style="margin:0 0 10px">${site.ad} · E-posta Bağlantı Testi</h2><p style="margin:0 0 8px">Bu ileti <strong>Servis ve API Tanılama Merkezi</strong> üzerinden SMTP bağlantısını doğrulamak için gönderilmiştir.</p><p style="margin:0;color:#6e6256;font-size:13px">Zaman: ${zaman} · Alıcı: ${alici}</p></div>`,
    });
    return { ok: true, alici };
  } catch (e) {
    return { ok: false, alici, hata: String((e as Error)?.message ?? e).slice(0, 350) };
  }
}

/** Panel: e-postayı yeniden gönder (gönderilmiş olsa bile) */
export async function epostaYenidenGonder(no: string, tur: string, origin: string): Promise<GonderimSonucu> {
  const s = (await siparisleriOku()).find((x) => x.no === no);
  if (!s) throw new Error('Sipariş bulunamadı.');
  const m = await magazaOku();
  const { site } = m;
  const gorsel = gorselBulucu(m);
  const takipUrl = new URL(`/siparis/${s.no}?t=${s.token}`, origin).href;
  const kayit = { no, tur, zorla: true };
  if (tur === 'magaza') return epostaGonder(magazaAdresi(site), yeniSiparisEpostasi(s, site, gorsel), kayit, s.musteri.eposta);
  if (!s.musteri.eposta) throw new Error('Müşterinin e-posta adresi yok.');
  if (tur === 'alindi' || tur === 'sozlesmeler') {
    const belge = await sozlesmeOku(no);
    const baglanti = new URL(`/siparis/${s.no}/sozlesmeler?t=${s.token}`, origin).href;
    if (tur === 'alindi') return epostaGonder(s.musteri.eposta, siparisAlindiEpostasi(s, site, takipUrl, belge ? { ...belge, baglanti } : undefined, gorsel), kayit);
    if (!belge) throw new Error('Bu siparişin sözleşme kaydı bulunamadı.');
    return epostaGonder(s.musteri.eposta, sozlesmelerEpostasi(s, site, { ...belge, baglanti }), kayit);
  }
  if (tur === `durum-${s.durum}`) {
    const e = durumEpostasi(s, site, takipUrl, gorsel);
    if (e) return epostaGonder(s.musteri.eposta, e, kayit);
  }
  throw new Error('Bu e-posta siparişin şu anki durumu için gönderilemez.');
}

async function smsGonder(_tel: string, _metin: string): Promise<void> {
  // SMS sağlayıcısı seçildiğinde burada API çağrısı yapılacak.
}

/** E-postadaki ürün satırları için kimlik → ilk fotoğraf (ürün veya set) */
function gorselBulucu(m: Awaited<ReturnType<typeof magazaOku>>): GorselBul {
  const harita = new Map<string, string>();
  for (const u of m.urunler) if (u.gorseller[0]) harita.set(u.id, u.gorseller[0].src);
  for (const st of m.setler) {
    const ilk = st.gorsel?.src ?? m.urunler.find((u) => u.id === st.kalemler[0]?.urunId)?.gorseller[0]?.src;
    if (ilk) harita.set(st.id, ilk);
  }
  return (id) => harita.get(id);
}
const gorselGetir = (): Promise<GorselBul | undefined> => magazaOku().then(gorselBulucu, () => undefined);

/** Yeni sipariş bildiriminin gideceği mağaza adres(ler)i */
const magazaAdresi = (site: SiteAyarlari) => ortam('SIPARIS_BILDIRIM_EPOSTA') || site.eposta;

/** Mağaza sahibine iç bildirim (stok uyarısı vb.). E-posta ayarı yoksa gönderilmez. */
export function magazayaBildir(site: SiteAyarlari, e: Eposta): Promise<GonderimSonucu> {
  return epostaGonder(magazaAdresi(site), e);
}

export async function siparisAlindi(
  s: Siparis, site: SiteAyarlari, takipUrl: string,
  belgeler?: { onBilgilendirme: string; mesafeliSatis: string; baglanti: string },
): Promise<void> {
  const gorsel = await gorselGetir();
  const alici = s.musteri.eposta;
  await Promise.all([
    // Tek e-posta: kısa sipariş onayı + "Sözleşmeleriniz" bağlantısı ve ek dosya.
    // Ayrı "Sözleşmeleriniz" e-postası artık kendiliğinden gitmez; panelden elle gönderilebilir.
    alici ? epostaGonder(alici, siparisAlindiEpostasi(s, site, takipUrl, belgeler, gorsel), { no: s.no, tur: 'alindi' }) : Promise.resolve(),
    smsGonder(s.musteri.tel, `${site.ad}: ${s.no} numaralı siparişiniz alındı. Toplam ${formatTL(s.toplam)}. Takip: ${takipUrl}`),
    // Mağazaya gelen bildirimde "Yanıtla" doğrudan müşteriye yazar
    epostaGonder(magazaAdresi(site), yeniSiparisEpostasi(s, site, gorsel), { no: s.no, tur: 'magaza' }, s.musteri.eposta),
  ]);
}

/** zorla: aynı durumun e-postası daha önce gittiyse de yeniden gönderilir (ör. kargo takip numarası düzeltildi) */
export async function durumDegisti(s: Siparis, site: SiteAyarlari, takipUrl: string, zorla = false): Promise<void> {
  const durum = SIPARIS_DURUM_ADLARI[s.durum];
  const ek = s.durum === 'kargoda' && s.kargoTakip ? ` Kargo takip no: ${s.kargoTakip}.` : '';
  const ePosta = (EPOSTA_GIDEN_DURUMLAR as readonly string[]).includes(s.durum) ? durumEpostasi(s, site, takipUrl, await gorselGetir()) : undefined;
  await Promise.all([
    smsGonder(s.musteri.tel, `${site.ad}: ${s.no} numaralı siparişinizin durumu: ${durum}.${ek} Takip: ${takipUrl}`),
    s.musteri.eposta && ePosta ? epostaGonder(s.musteri.eposta, ePosta, { no: s.no, tur: `durum-${s.durum}`, zorla }) : Promise.resolve(),
  ]);
}
