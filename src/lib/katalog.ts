/**
 * Katalog — mağaza verisinin sorgulanan hali.
 * Her istekte middleware tarafından oluşturulur ve Astro.locals.katalog ile her bileşene ulaşır.
 */
import type { Durum, Kategori, Magaza, Urun, UrunSeti } from './sema';
import { gecerliSepetteIndirim, oncekiFiyat, sepetteFiyat, setToplamlari, sonGunlerinEnDusugu, type IstemciKatalog, type IstemciSet, type IstemciUrun } from './fiyat';

export interface FiyatBilgisi {
  fiyat: number;
  /** İndirimde üstü çizili gösterilecek fiyat (geçmişten otomatik) */
  onceki?: number;
  yuzde?: number;
  etiket?: string;
  /** "Son N günün en düşük fiyatı" */
  enDusuk: boolean;
  enDusukGun: number;
  /** Sepette ek indirim */
  sepette?: { yuzde: number; fiyat: number };
  /** Aktif fırsat (gerçek bitiş saatiyle) */
  firsat?: { etiket: string; bitis?: string; stil?: 'firsat' | 'flas' | 'ozel' };
}

export interface SetKalemDokumu {
  urun: Urun;
  adet: number;
  /** Bu kalemin normal birim fiyatı */
  birim: number;
  /** "Belirli ürüne indirim" setlerinde bu kalemin indirimli birim fiyatı */
  indirimliBirim?: number;
  oran?: number;
}

export interface Rozetler {
  /** Yuvarlak turuncu damga (en fazla 1) */
  damga?: string;
  /** Görselin altındaki şerit, ör. "Kargo Bedava" */
  serit?: string;
  /** Küçük rozetler */
  kucuk: string[];
}

export class Katalog {
  readonly site: Magaza['site'];
  readonly anaSayfa: Magaza['anaSayfa'];
  private readonly urunListesi: Urun[];
  private readonly urunMap: Map<string, Urun>;

  constructor(
    readonly magaza: Magaza,
    /** Son 30 günde satılan adetler (çok satan etiketi için) */
    private readonly satislar: Map<string, number> = new Map(),
    readonly taslaklarGorunur = false,
  ) {
    this.site = magaza.site;
    this.anaSayfa = magaza.anaSayfa;
    this.urunListesi = magaza.urunler
      .filter((u) => this.gorunur(u.durum))
      .sort((a, b) => b.oncelik - a.oncelik);
    this.urunMap = new Map(this.urunListesi.map((u) => [u.id, u]));
  }

  private gorunur(d: Durum): boolean {
    return d === 'yayinda' || (d === 'taslak' && this.taslaklarGorunur);
  }

  /* ---------------- Ürünler ---------------- */
  tumUrunler(): Urun[] { return this.urunListesi; }
  urunBul(id: string): Urun | undefined { return this.urunMap.get(id); }
  stoktaMi(u: Urun): boolean { return u.stok > 0; }
  maxAdet(u: Urun): number { return Math.max(0, Math.min(u.maxAdet, u.stok)); }
  anaGorsel(u: Urun) { return u.gorseller[0]; }
  oneCikanUrunler(): Urun[] { return this.urunListesi.filter((u) => u.oneCikan); }
  birlikteIyiGiderler(u: Urun): Urun[] {
    return u.birlikteIyiGider.map((id) => this.urunBul(id)).filter((x): x is Urun => !!x && this.stoktaMi(x));
  }
  birlikteIyiGiderOnizleme(u: Urun): Urun[] {
    return u.birlikteIyiGider.flatMap((id) => this.magaza.urunler.find((x) => x.id === id) ?? []);
  }

  /** Fırsat işaretliyse ve bitiş saati geçmemişse fırsat aktiftir */
  firsatAktif(u: Urun, simdi = Date.now()): boolean {
    if (!u.firsat) return false;
    if (u.firsat.bitis && simdi >= Date.parse(u.firsat.bitis)) return false;
    return true;
  }

  fiyatBilgisi(u: Urun, simdi = Date.now()): FiyatBilgisi {
    const gun = this.site.indirimReferansGun;
    const gecmis: typeof u.fiyatGecmisi = [];
    for (const kayit of u.fiyatGecmisi) {
      if (kayit.dogrulandi) gecmis.push(kayit);
      else gecmis.length = 0;
    }
    const elle = u.kampanya?.oncekiFiyat;
    const onceki = u.kampanya
      ? elle && elle > u.fiyat ? elle : oncekiFiyat(gecmis, u.kampanya.baslangic, gun, u.fiyat)
      : undefined;
    const sepetteYuzde = gecerliSepetteIndirim({ sepetteIndirim: u.sepetteIndirim, firsatBitis: u.firsat?.bitis }, simdi);
    return {
      fiyat: u.fiyat,
      onceki,
      yuzde: onceki ? Math.round(((onceki - u.fiyat) / onceki) * 100) : undefined,
      etiket: onceki ? u.kampanya?.etiket || undefined : undefined,
      enDusuk: !elle && sonGunlerinEnDusugu(gecmis, gun, u.fiyat, simdi),
      enDusukGun: gun,
      sepette: sepetteYuzde > 0 ? { yuzde: sepetteYuzde, fiyat: sepetteFiyat(u.fiyat, sepetteYuzde) } : undefined,
      firsat: this.firsatAktif(u, simdi) ? {
        etiket: u.firsat!.etiket || (u.firsat!.stil === 'flas' ? 'Flaş İndirim' : u.firsat!.stil === 'ozel' ? 'Özel Seçim' : 'Fırsat Ürünü'),
        bitis: u.firsat!.bitis, stil: u.firsat!.stil,
      } : undefined,
    };
  }

  firsatUrunleri(): Urun[] {
    return this.urunListesi.filter((u) => this.firsatAktif(u) && this.stoktaMi(u));
  }

  /** Sitedeki son 30 günlük satış eşiği dolduysa ya da mağaza sahibi diğer kanallardaki satışlara dayanarak açtıysa */
  cokSatanMi(u: Urun): boolean {
    return u.cokSatan || (this.satislar.get(u.id) ?? 0) >= this.site.cokSatanEsik;
  }

  /** Sadece DOĞRU bilgilerden oluşan rozetler */
  rozetler(u: Urun): Rozetler {
    const kucuk: string[] = [];
    let damga: string | undefined;
    if (this.cokSatanMi(u)) damga = 'En Çok Satan';
    else if (this.firsatAktif(u)) damga = u.firsat?.etiket || 'Fırsat Ürünü';
    else if (u.stok > 0 && u.stok <= 3) damga = `Son ${u.stok} Adet`;
    // Elle yazılan rozetler (ör. "2 Yıl Garanti") ürünün önüne geçmesin: küçük güven etiketi olarak gösterilir
    for (const r of u.rozetler) kucuk.push(r);
    if (this.site.taksit.pesinFiyatinaTaksit) kucuk.push(`Peşin fiyatına ${this.site.taksit.pesinFiyatinaTaksit} taksit`);
    const serit = u.fiyat >= this.site.kargo.ucretsizEsik ? 'Kargo Bedava' : undefined;
    return { damga, serit, kucuk };
  }

  /* ---------------- Kategoriler ---------------- */
  kategoriBul(id: string): Kategori | undefined { return this.magaza.kategoriler.find((k) => k.id === id); }
  kategoriUrunleri(id: string): Urun[] { return this.urunListesi.filter((u) => u.kategoriler.includes(id)); }
  gorunurKategoriler(f: { menu?: boolean; anaSayfa?: boolean } = {}): Kategori[] {
    return this.magaza.kategoriler
      .filter((k) => (f.menu ? k.menudeGoster : true))
      .filter((k) => (f.anaSayfa ? k.anaSayfadaGoster : true))
      // Menüde yalnızca ürünü olan kategoriler (boş sayfaya götürmesin); "Yakında" kutuları yalnız listelerde
      .filter((k) => this.kategoriUrunleri(k.id).length > 0 || (k.yakindaGoster && !f.menu))
      .sort((a, b) => a.sira - b.sira);
  }

  /* ---------------- Setler ---------------- */
  tumSetler(): UrunSeti[] {
    return this.magaza.setler.filter(
      (s) => this.gorunur(s.durum) && this.setEngelleri(s, this.taslaklarGorunur).length === 0,
    );
  }
  setBul(id: string): UrunSeti | undefined { return this.tumSetler().find((s) => s.id === id); }
  setEngelleri(s: UrunSeti, taslakIzinli = false): string[] {
    const adetler = new Map<string, number>();
    for (const { urunId, adet } of s.kalemler) adetler.set(urunId, (adetler.get(urunId) ?? 0) + adet);
    const sorunlar: string[] = [];
    for (const [id, adet] of adetler) {
      const u = this.magaza.urunler.find((u) => u.id === id);
      if (!u) sorunlar.push('Sette bulunamayan bir ürün var.');
      else if (u.durum !== 'yayinda' && !(taslakIzinli && u.durum === 'taslak')) sorunlar.push(u.kisaAd + ' yayında değil.');
      else if (Math.min(u.stok, u.maxAdet) < adet) sorunlar.push(u.kisaAd + ' için yeterli stok veya alım adedi yok.');
      else if (!u.gorseller.length && !s.gorsel && !taslakIzinli) sorunlar.push(u.kisaAd + ' için fotoğraf gerekli.');
    }
    const { fiyat, ayriAyri } = this.setFiyati(s);
    if (s.kalemler.length < 2 || fiyat <= 0 || fiyat > ayriAyri) sorunlar.push('En az iki ürün ve geçerli set fiyatı gerekli.');
    return sorunlar;
  }
  setFiyati(s: UrunSeti) {
    const f = s.fiyatlama;
    const dokum: SetKalemDokumu[] = s.kalemler
      .map((k) => ({ k, u: this.urunBul(k.urunId) ?? this.magaza.urunler.find((x) => x.id === k.urunId) }))
      .filter((x): x is { k: (typeof s.kalemler)[number]; u: Urun } => !!x.u)
      .map(({ k, u }) => {
        const d: SetKalemDokumu = { urun: u, adet: k.adet, birim: u.fiyat };
        if (f.tip === 'kalem' && f.urunId === u.id) {
          d.oran = f.oran;
          d.indirimliBirim = u.fiyat - Math.round((u.fiyat * f.oran) / 100);
        }
        return d;
      });
    return { ...setToplamlari(dokum, f), dokum };
  }
  urunuIcerenSetler(urunId: string): UrunSeti[] {
    return this.tumSetler().filter((s) => s.kalemler.some((k) => k.urunId === urunId));
  }

  /* ---------------- Tarayıcıya giden özet ----------------
     Yalnızca görünür ürünlerin satış için gereken alanları; iç notlar (dogrula) ve taslaklar girmez. */
  private istemciOnbellek?: IstemciKatalog;
  istemci(): IstemciKatalog {
    if (this.istemciOnbellek) return this.istemciOnbellek;
    const urunler: Record<string, IstemciUrun> = {};
    for (const u of this.urunListesi) {
      urunler[u.id] = {
        id: u.id, marka: u.marka, kisaAd: u.kisaAd, fiyat: u.fiyat,
        onceki: this.fiyatBilgisi(u).onceki,
        sepetteIndirim: u.firsat?.bitis && Date.now() >= Date.parse(u.firsat.bitis) ? 0 : u.sepetteIndirim,
        firsatBitis: u.firsat?.bitis,
        maxAdet: this.maxAdet(u), sku: u.sku, gorsel: this.anaGorsel(u)?.src,
        ikon: this.kategoriBul(u.kategoriler[0]!)?.ikon ?? 'kutu',
        birlikte: this.birlikteIyiGiderler(u).map((x) => x.id),
      };
    }
    const setler: Record<string, IstemciSet> = {};
    for (const s of this.tumSetler()) {
      const f = this.setFiyati(s);
      setler[s.id] = {
        id: s.id, ad: s.ad, kalemler: s.kalemler, fiyat: f.fiyat, ayriAyri: f.ayriAyri,
        gorsel: s.gorsel?.src ?? urunler[s.kalemler[0]!.urunId]?.gorsel,
      };
    }
    const k = this.site.kargo;
    this.istemciOnbellek = {
      urunler, setler, heroId: this.anaSayfa.hero.urunId,
      kargo: { ucret: k.ucret, ucretsizEsik: k.ucretsizEsik, kesimSaati: k.kesimSaati, teslimGun: k.teslimGun },
      whatsapp: this.site.whatsapp,
    };
    return this.istemciOnbellek;
  }

  /** Kargo takip bağlantısı ({kod} yerine takip numarası) */
  kargoTakipUrl(kod: string): string {
    return this.site.kargo.takipUrl.replace('{kod}', encodeURIComponent(kod.trim()));
  }

  /** WhatsApp bağlantısı (isteğe bağlı hazır mesajla) */
  whatsapp(mesaj?: string): string {
    return `https://wa.me/${this.site.whatsapp}${mesaj ? `?text=${encodeURIComponent(mesaj)}` : ''}`;
  }
}

/* ---------------- Kayıt öncesi tutarlılık kontrolü ---------------- */
export function magazaTutarlilik(m: Magaza): string[] {
  const h: string[] = [];
  const tekil = (l: { id: string }[], ad: string) => {
    const g = new Set<string>();
    for (const x of l) { if (g.has(x.id)) h.push(`Aynı ${ad} kodu iki kez kullanılmış: "${x.id}"`); g.add(x.id); }
  };
  tekil(m.urunler, 'ürün'); tekil(m.kategoriler, 'kategori'); tekil(m.setler, 'set');
  const uIds = new Set(m.urunler.map((u) => u.id));
  const kIds = new Set(m.kategoriler.map((k) => k.id));
  for (const u of m.urunler) {
    for (const k of u.kategoriler) if (!kIds.has(k)) h.push(`"${u.ad}" bilinmeyen kategoriye bağlı: "${k}"`);
    for (const b of u.birlikteIyiGider) if (!uIds.has(b)) h.push(`"${u.ad}" → bilinmeyen tamamlayıcı ürün: "${b}"`);
    if (u.durum === 'yayinda' && !u.gorseller.length) h.push(`Yayındaki "${u.ad}" ürününün en az bir görseli olmalı`);
  }
  for (const s of m.setler) {
    for (const k of s.kalemler) if (!uIds.has(k.urunId)) h.push(`"${s.ad}" seti bilinmeyen ürün içeriyor: "${k.urunId}"`);
    if (s.fiyatlama.tip === 'kalem' && !s.kalemler.some((k) => k.urunId === (s.fiyatlama as { urunId: string }).urunId))
      h.push(`"${s.ad}" setinde indirimli seçilen ürün sette yok`);
  }
  if (!uIds.has(m.anaSayfa.hero.urunId)) h.push(`Ana sayfadaki öne çıkan ürün bulunamadı: "${m.anaSayfa.hero.urunId}"`);
  return h;
}
