# Al Lulu Home — mağaza + yönetim paneli

Mobil öncelikli e-ticaret sitesi ve yönetim paneli. [Astro](https://astro.build) ile sunucuda çalışır: panelde yaptığınız her değişiklik (fiyat, görsel, indirim, ürün…) sitede **anında** görünür.

> **Güncel mimari (24.11.2026):** Canlıda Vercel (sunucu bölgesi `hnd1` Tokyo, `vercel.json`) + Supabase (Tokyo, `ap-northeast-1`).
> Ürünler, siparişler, sözleşmeler, pazaryeri kayıtları **ve finans** (fatura/gider/belge; `medya_dosyalari` içinde `_finans/…`) Supabase'te tutulur;
> `veri/` klasörü yalnız yerel geliştirme kopyasıdır. İndirimde "önceki fiyat" yürürlükteki yönetmelik gereği **10 gün** (`lib/fiyat.ts`
> `YASAL_INDIRIM_GUN`), başka satış kanalındaki fiyat esas alınamaz. Aşağıdaki bazı bölümler bu tarihten önce yazıldı; çelişkide bu not geçerlidir.
> Denetim düzeltmeleri ve bekleyen veritabanı değişiklikleri: `supabase/migrations/20261124*.sql`.

## Çalıştırma (kendi bilgisayarınızda)

```bash
npm install
```

```bash
npm run dev
```

- Site: http://localhost:4321
- Yönetim paneli: http://localhost:4321/yonetim
- Panel parolası proje klasöründeki **`.env`** dosyasında, `YONETIM_PAROLA=` satırında. İstediğiniz zaman değiştirebilirsiniz (uzun ve tahmin edilemez olsun).

## Panelden neler yapılır?

| Ekran | Yapabildikleriniz |
|---|---|
| **Genel Bakış (`/yonetim`)** | Tek adımda siteyi tadilata (bakıma) alma / yayına açma · Onaylı ciro, kargolanacaklar, kargodakiler, iptal edilenler · Son siparişlerde tek tıkla "Kargolandı / Ödendi / İptal Et" · Eklenen tüm ürünlerin stok, indirim ve satış tablosu · Son fiyat değişimleri günlüğü |
| **Sipariş & Satış (`/yonetim/siparisler`)** | Satış ve ciro özeti · Ürün bazlı satış/kargo/iptal/kalan stok raporu · Sipariş listesinde tek adımda **"Ürün Kargolandı"** (takip no + kargo firması + hazır WhatsApp mesajı) ve **"Sipariş İptal Edildi"** (iptal nedeni + otomatik stok iadesi) alanları |
| **Ürünler & Stok (`/yonetim/urunler`)** | Filtre sekmeleri (Yayında, Taslak, İndirim & Fırsat, Kritik Stok) ve anlık arama · Satır içi hızlı fiyat, sepette % indirim, üstü çizili kampanya, stok ve durum güncelleme · Her ürünün açılır fiyat geçmişi ve tüm fiyat değişimleri günlüğü |
| **Ürün Ekle / Düzenle (`/yonetim/urunler/[id]`)** | **Canlı Vitrin Demosu:** Sol tarafta yazarken sağda **Ürün Kartı**, **Ürün Detay Sayfası** ve **"Kaydedince Sitede Neler Değişecek?"** etki listesini anlık önizleme · Hangi kutuya ne yazıldığının sitedeki yerini gösteren akıllı alan rehberi |
| **Setler (`/yonetim/setler`)** | Ürün kombinasyonları: belirli ürüne %, tüm sete % ya da sabit set fiyatı. Sitede "Ayrı ayrı X TL → Set Y TL" olarak görünür. |
| **Kategoriler (`/yonetim/kategoriler`)** | Ekle, sırala, ikon seç, menüde/ana sayfada göster |
| **Site Düzeni (`/yonetim/ayarlar`)** | **Canlı Site & Tadilat Önizlemeli:** Tek adımda tadilat (bakım) modu ve bakım mesajı · Ana sayfa vitrin (Hero) ürünü, başlıkları ve **↑/↓ butonlarıyla görsel bölüm sıralama** · Üst şerit duyuruları · Hazır kargo takip şablonları (Yurtiçi, Aras, MNG, Sürat, PTT, HepsiJet, Kolay Gelsin) · İletişim ve yasal satıcı bilgileri |

Taslak ürünler sadece siz giriş yapmışken sitede görünür ("Örnek" etiketiyle), müşteriler göremez.

## İndirimler nasıl çalışır?

1. **Fiyat düşüşünü indirim olarak göstermek** (üstü çizili eski fiyat, kırmızı fiyat, "Son 30 günün en düşük fiyatı"): Eski fiyat **elle girilmez**; sistem fiyat geçmişinden otomatik hesaplar. Bu yasal kuraldır: eski fiyat, indirimden önceki 10 günde bu sitede gerçekten uygulanan en düşük fiyat olmalıdır (RG 01.07.2026/33297, yürürlük 01.08.2026).
   - Örnek: Vitaquick'i 14.000 TL'den 13.000 TL'ye indirimli göstermek için ürün indirimden önceki 10 gün boyunca bu sitede gerçekten 14.000 TL'den satışta olmalı. Sonra fiyatı 13.000 yapıp "indirim olarak göster" kutusunu işaretlersiniz.
   - Panel, kaydetmeden önce sitede ne görüneceğini önizler.
2. **Sepette indirim** (Trendyol'daki yeşil "Sepette %10 İndirim"): Hemen kullanılabilir, tamamen yasal. Ürün kartında yeşil "Sepette X TL" görünür, sepette otomatik düşer.
3. **Set indirimi:** Ayrı ayrı toplam ile set fiyatı arasındaki fark, gerçek kazanç olarak gösterilir.
4. **Otomatik rozetler:** "En Çok Satan" (gerçek satışlardan, eşik Ayarlar'da), "Son X Adet" (stok ≤ 3), "Kargo Bedava" (sınırın üzerindeki ürünler).

## Veriler, Bulut Veritabanı (Supabase) ve Yedek

- **Supabase Bulut Veritabanı & Storage (`yrbvywobqnrqqvkndvqj`):** `.env` dosyasında `SUPABASE_URL`, `SUPABASE_KEY` ve `SUPABASE_SUNUCU_ANAHTARI` tanımlı olduğunda tüm mağaza, ürün, kategori, set, sipariş, sözleşme ve görsel işlemleri doğrudan **Supabase Postgres + Storage** üzerinde çalışır:
  - Tablolar: `site_ayarlari`, `kategoriler`, `urunler`, `setler`, `siparisler`, `sozlesmeler`, `magaza_yedekler`, `medya_dosyalari` ve `storage.buckets` (`medya`).
  - Rapor Görünümleri (Views): `ozet_urun_stok_ve_fiyat`, `ozet_gunluk_siparis_ciro`.
  - Otomatik Tetikleyiciler (Triggers): Supabase Table Editor üzerinden doğrudan yapılan ürün fiyat değişiklikleri otomatik olarak `fiyat_gecmisi` dizisine, sipariş durum/kargo takip değişiklikleri ise `gecmis` dizisine işlenir.
- **Yerel Senkron Yedek:** Supabase aktifken bile yapılan her değişiklik yerel `veri/magaza.json`, `veri/siparisler.json`, `veri/sozlesmeler/`, `veri/yuklemeler/` ve `veri/yedekler/` altına eşzamanlı olarak yedeklenir.

## Yayına alma (canlı site)

Site bir **Node.js sunucusu** ve **kalıcı disk** ister (panelden yüklenen görseller ve siparişler diske yazılır).

```bash
npm run build
```

```bash
node --env-file=.env dist/server/entry.mjs
```

Uygun seçenekler: küçük bir VPS (ör. Hetzner, DigitalOcean) ya da kalıcı diski olan Render/Railway. Disk yerine bulut veritabanı (Supabase) kullanmak isterseniz yalnızca `src/lib/depo.ts` değişir; bu durumda Vercel'de de çalışır.

Canlıya almadan önce:
- `.env` içindeki parolayı değiştirin, `OTURUM_GIZLI` en az 32 karakter rastgele olsun.
- Siteyi HTTPS ile yayınlayın (oturum çerezi canlıda yalnızca HTTPS üzerinden gönderilir).

## Bildirimler (e-posta / SMS)

- **E-posta:** `.env` dosyasına SMTP bilgilerini yazın. Gmail için Google hesabınızda "Uygulama şifresi" oluşturun. Sipariş gelince hem size hem müşteriye e-posta gider.
- **SMS:** Bir SMS sağlayıcısıyla (Netgsm, İletimerkezi vb.) anlaşınca `src/lib/bildirim.ts → smsGonder()` doldurulacak.
- Ayar yoksa sipariş yine kaydedilir; bildirim sadece sunucu günlüğüne yazılır.

## Ödeme

Kartlı ödeme PayTR Sanal POS iFrame API ile çalışır. Varsayılan `PAYTR_MOD=kapali` ayarı mevcut sipariş kaydı akışını kullanır.

1. [PayTR Sanal POS](https://www.paytr.com/paytr-sanal-pos) başvurusunu mağazanın yasal sahibi tamamlar. PayTR Mağaza Paneli → Destek & Kurulum → Entegrasyon Bilgileri bölümünden mağaza numarası, anahtar ve salt alınır.
2. HTTPS test sunucusunda `PAYTR_MOD=test`, `PAYTR_SITE_URL` (adresin yalnızca origin kısmı), `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY` ve `PAYTR_MERCHANT_SALT` sunucu ortamına girilir. Anahtarlar ve salt hosting servisinin gizli değişkenlerinde tutulur. Üretimden ayrı `VERI_KLASORU` kullanılır.
3. PayTR Mağaza Paneli → Destek & Kurulum → Ayarlar → Bildirim URL alanına `https://<site>/api/odeme/paytr` yazılır. Bu adres internete açık olmalı. Ters vekil dışarıdan gelen yönlendirme başlıklarını güvenilir HTTPS ve istemci IP değerleriyle değiştirmeli. Dosya deposu için tek Node.js örneği ve kalıcı disk kullanılmalı.
4. [PayTR test akışında](https://dev.paytr.com/iframe-api) başarılı, reddedilen ve yarım bırakılan işlemler ile mobil banka doğrulaması, bildirim ve sipariş durumu kontrol edilir. 3D Secure zorunluluğu mağaza hesabı için PayTR ile doğrulanır. Test siparişleri gerçek stok, ciro veya müşteri bildirimi oluşturmaz. PayTR onayından sonra canlı sunucuda `PAYTR_MOD=canli` ile açılır. Entegrasyon tek çekime ayarlıdır.

Kart alanları PayTR iFrame’i içinde açılır. Siparişin kesinleşmesi, imza ve tutarı doğrulanmış sunucudan sunucuya bildirime bağlıdır. Ödeme tamamlanana kadar stok geçici ayrılır. İşlem sonunda stok uyuşmazlığı kaldıysa yönetim panelinde uyarı görünür. İadeler PayTR Mağaza Paneli'nden takip edilir ve mağaza kayıtlarıyla mutabakat gerektirir.

## Güvenlik özeti

- Panel: parola + imzalı, HttpOnly, SameSite=Strict oturum çerezi (12 saat).
- **Gizli giriş adresi:** `YONETIM_GIRIS_YOLU` (.env ve Vercel → Settings → Environment Variables) tanımlıysa giriş formu yalnızca `https://alluluhome.com/<YONETIM_GIRIS_YOLU>` adresinde açılır. Giriş yapmamış biri için `/yonetim` ile başlayan her adres sıradan "sayfa bulunamadı" sayfasıdır; robots.txt panel adresini anmaz. Tanımlı değilse eski `/yonetim/giris` adresi çalışır.
- Deneme sınırları Supabase'te kalıcıdır (`istek_sinirlari` tablosu, `istek_say` fonksiyonu): yönetim girişi IP başına 15 dakikada 5 + tüm siteye saatte 30 hatalı parola; sipariş IP başına saatte 10; sipariş takip IP başına 10 dakikada 10. Ham IP saklanmaz (HMAC özeti).
- Site Cloudflare arkasında: gerçek ziyaretçi IP'si yalnızca istek Cloudflare adreslerinden geldiyse `cf-connecting-ip` başlığından alınır (`src/lib/guvenlik.ts`). Sözleşme kaydı ve PayTR'ye giden IP budur.
- Tüm sayfalarda tıklama tuzağı (başka sitenin çerçevesi), tür karışıklığı ve kamera/mikrofon/konum izinlerine karşı güvenlik başlıkları; ödeme sayfası yalnızca PayTR çerçevesine izin verir.
- Panelde seçilen büyük fotoğraflar gönderilmeden önce tarayıcıda küçültülür (Vercel tek istekte ~4,5 MB sınırı).
- Başka sitelerden gelen form gönderimleri engellenir (CSRF).
- Yüklenen görseller yeniden kodlanır (konum/EXIF bilgisi silinir) ve küçültülür.
- Taslak ürünler ve iç notlar canlı sitenin koduna girmez.
- Sipariş sayfaları tahmin edilemez bağlantıyla açılır; sipariş takibi "sipariş no + telefon" ister.

## Klasör yapısı

```
src/lib/        sema.ts (veri kuralları), depo.ts (dosya deposu), katalog.ts, fiyat.ts (sepet/indirim hesabı), oturum.ts, bildirim.ts
src/pages/      vitrin sayfaları · yonetim/ (panel) · api/siparis.ts · siparis/ · medya/ (yüklenen görseller)
src/components/ vitrin bileşenleri (UrunKarti, Fiyat, Galeri, AltMenu…)
src/scripts/    sepet.ts, ui.ts (animasyonlar), buyutec.ts (yakınlaştırma), odeme.ts, yonetim.ts
veri/           mağaza verisi, siparişler, yüklemeler, yedekler
```
