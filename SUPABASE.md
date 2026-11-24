# Al Lulu Home — Supabase Veritabanı ve Altyapı Raporu

Bu belge, **Al Lulu Home** projesi için Supabase (`yrbvywobqnrqqvkndvqj`) üzerinde yapılan tüm veritabanı, tablo, güvenlik (RLS), fonksiyon (RPC), tetikleyici (Trigger), görünüm (View), dosya depolama (Storage), veri aktarımı (Seed) ve uygulama kodu işlemlerini tek tek açıklar.

---

## 1. Supabase Proje Bilgileri

- **Proje Adı:** `allulu`
- **Proje ID (Ref):** `yrbvywobqnrqqvkndvqj`
- **Dashboard Adresi:** https://supabase.com/dashboard/project/yrbvywobqnrqqvkndvqj
- **Table Editor Adresi:** https://supabase.com/dashboard/project/yrbvywobqnrqqvkndvqj/editor
- **API URL:** `https://yrbvywobqnrqqvkndvqj.supabase.co`
- **Veritabanı Motoru:** PostgreSQL `17.12` (`ACTIVE_HEALTHY`)

---

## 2. Oluşturulan Veritabanı Tabloları (`public` Şeması)

Veritabanında tüm mağaza, katalog, sipariş, sözleşme, yedek ve medya verileri için **8 adet tablo** oluşturuldu:

### 2.1. `public.site_ayarlari`
Mağazanın genel ayarlarını, iletişim bilgilerini, kargo/taksit kurallarını, tadilat modunu, ana sayfa bölüm sıralamasını ve PayTR stok işlem kayıtlarını tutar.
- `id` (`integer`, Primary Key, varsayılan `1`, `check (id = 1)` — tekil kayıt)
- `surum` (`integer`, her mağaza güncellemesinde 1 artar)
- `guncelleme` (`timestamptz`, son güncellenme zamanı)
- `site` (`jsonb`, mağaza iletişim, satıcı, kargo, taksit, duyuru ve tadilat ayarları)
- `ana_sayfa` (`jsonb`, hero ürünü, bölüm sıralaması, başlıklar ve ana sayfa SSS)
- `paytr_stok_islemleri` (`jsonb`, mükerrer stok düşümünü önleyen PayTR referans listesi)

### 2.2. `public.kategoriler`
Mağazadaki ürün kategorilerini tutar.
- `id` (`text`, Primary Key, `^[a-z0-9-]+$` formatında)
- `ad` (`text`, kategori adı)
- `aciklama` (`text`, kategori açıklaması)
- `ikon` (`text`, kategori ikonu)
- `sira` (`integer`, menü ve sayfa sıralaması — `kategoriler_sira_idx` indeksli)
- `menude_goster` (`boolean`, üst/alt menüde görünürlük)
- `ana_sayfada_goster` (`boolean`, ana sayfada görünürlük)
- `yakinda_goster` (`boolean`, "Yakında" etiketi)
- `aktif` (`boolean`, silinen kategorileri veri kaybı olmadan pasife almak için)
- `guncelleme_tarihi` (`timestamptz`)

### 2.3. `public.urunler`
Mağazadaki tüm ürünleri (yayında, taslak, gizli), fiyat geçmişlerini, indirim/fırsat ayarlarını, stoklarını ve teknik detaylarını tutar.
- `id` (`text`, Primary Key, `^[a-z0-9-]+$` formatında)
- `durum` (`text`, `'yayinda' | 'taslak' | 'gizli'`)
- `marka` (`text`, ürün markası)
- `ad` (`text`, tam ürün adı)
- `kisa_ad` (`text`, kısa vitrin adı)
- `kategoriler` (`jsonb`, bağlı olduğu kategori ID listesi)
- `fiyat` (`integer`, güncel satış fiyatı TL, `check (fiyat > 0)`)
- `fiyat_gecmisi` (`jsonb`, tarih ve fiyat kayıtları — indirimden önceki 10 günün en düşük fiyatı hesabı için)
- `kampanya` (`jsonb`, aktif fiyat düşüşü kampanya başlangıç tarihi ve etiketi)
- `sepette_indirim` (`integer`, `%0`–`%50` arası sepette ek indirim oranı)
- `firsat` (`jsonb`, fırsat etiketi ve geri sayım bitiş tarihi)
- `stok` (`integer`, kalan stok adedi, `check (stok >= 0)`)
- `max_adet` (`integer`, tek siparişte alınabilecek maksimum adet, `1`–`50`)
- `sku` (`text`, model/stok kodu)
- `gorseller` (`jsonb`, ürün görselleri `{ src, alt }` dizisi)
- `ozet` (`text`, kısa ürün özeti)
- `one_cikan_bilgiler` (`jsonb`, ikonlu öne çıkan maddeler)
- `rozetler` (`jsonb`, ürün rozetleri)
- `garanti` (`text`, garanti süresi bilgisi)
- `hediye` (`text`, varsa hediye bilgisi)
- `faydalar` (`jsonb`, ürün fayda kartları)
- `pisirme` (`jsonb`, pişirme süreleri tablosu)
- `pisirme_notu` (`text`, pişirme tablosu açıklama notu)
- `teknik` (`jsonb`, teknik özellikler `[başlık, değer]` çiftleri)
- `kutu_icerigi` (`jsonb`, kutu içeriği maddeleri)
- `sss` (`jsonb`, ürüne özel sık sorulan sorular)
- `birlikte_iyi_gider` (`jsonb`, tamamlayıcı ürün ID listesi)
- `one_cikan` (`boolean`, öne çıkanlar vitrininde gösterim)
- `cok_satan` (`boolean`, çok satan rozeti)
- `oncelik` (`integer`, vitrin sıralama önceliği — `urunler_durum_oncelik_idx` indeksli)
- `dogrula` (`jsonb`, yöneticiye özel iç kontrol notları)
- `sira_no` (`integer`, katalog sırası — `urunler_sira_no_idx` indeksli)
- `aktif` (`boolean`)
- `guncelleme_tarihi` (`timestamptz`)

### 2.4. `public.setler`
Birlikte satılan ürün kombinasyonlarını ve set indirim kurallarını tutar.
- `id` (`text`, Primary Key)
- `durum` (`text`, `'yayinda' | 'taslak' | 'gizli'`)
- `ad` (`text`, set adı)
- `aciklama` (`text`, set açıklaması)
- `kalemler` (`jsonb`, setteki `{ urunId, adet }` listesi)
- `fiyatlama` (`jsonb`, yüzde / sabit fiyat / belirli kaleme indirim kuralı)
- `gorsel` (`jsonb`, set görseli)
- `rozet` (`text`, set rozeti)
- `one_cikan` (`boolean`)
- `sira_no` (`integer` — `setler_sira_no_idx` indeksli)
- `aktif` (`boolean`)
- `guncelleme_tarihi` (`timestamptz`)

### 2.5. `public.siparisler`
Oluşturulan tüm siparişleri, müşteri/teslimat/fatura bilgilerini, ödeme durumunu ve durum geçmişini tutar.
- `no` (`text`, Primary Key — ör. `AL261117-7471`)
- `token` (`text`, sipariş görüntüleme güvenlik anahtarı)
- `tarih` (`timestamptz`, sipariş tarihi — `siparisler_tarih_idx` indeksli)
- `durum` (`text`, `'odeme-bekliyor' | 'odendi' | 'hazirlaniyor' | 'kargoda' | 'teslim-edildi' | 'iptal'` — `siparisler_durum_idx` indeksli)
- `musteri` (`jsonb`, `{ ad, soyad, tel, eposta }`)
- `musteri_ad_soyad` (`text`, otomatik üretilen `GENERATED ALWAYS` sütunu — tabloda hızlı arama için)
- `musteri_tel` (`text`, otomatik üretilen `GENERATED ALWAYS` sütunu — `siparisler_musteri_tel_idx` indeksli)
- `teslimat` (`jsonb`, `{ il, ilce, adres, not }`)
- `fatura` (`jsonb`, bireysel/kurumsal fatura bilgileri)
- `kalemler` (`jsonb`, sipariş edilen ürün/set satırları ve parça dökümü)
- `urunler_toplami`, `set_indirimi`, `sepet_indirimi`, `kampanya_indirimi`, `kargo`, `toplam` (`integer`, TL tutarları)
- `kargo_takip` (`text`, kargo takip numarası)
- `kargo_firma` (`text`, kargo firması)
- `yonetici_notu` (`text`, iç yönetici notu)
- `iptal_notu` (`text`, iptal nedeni)
- `stok_dusuldu` (`boolean`, stoğun düşülüp düşülmediği)
- `paytr` (`jsonb`, PayTR işlem referansı, test modu ve ödeme sonucu)
- `paytr_ref` (`text`, otomatik üretilen `GENERATED ALWAYS` sütunu — `siparisler_paytr_ref_uidx` tekil indeksli)
- `sozlesme_surumu` (`text`, onaylanan sözleşme sürümü)
- `gecmis` (`jsonb`, sipariş durum geçiş geçmişi)
- `guncelleme_tarihi` (`timestamptz`)

### 2.6. `public.sozlesmeler`
Her siparişte müşterinin onayladığı Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi metinlerini yasal ispat yükümlülüğü kapsamında saklar.
- `no` (`text`, Primary Key, `public.siparisler(no)` Foreign Key)
- `surum` (`text`, sözleşme sürüm tarihi)
- `onay_tarihi` (`timestamptz`, onay zamanı)
- `ip` (`text`, onaylayan istemci IP adresi)
- `tarayici` (`text`, `User-Agent` bilgisi)
- `on_bilgilendirme` (`text`, onaylanan Ön Bilgilendirme Formu HTML metni)
- `mesafeli_satis` (`text`, onaylanan Mesafeli Satış Sözleşmesi HTML metni)
- `olusturulma_tarihi` (`timestamptz`)

### 2.7. `public.magaza_yedekler`
Mağaza verisinde yapılan her değişiklikten önce önceki sürümü otomatik olarak yedekler.
- `id` (`bigint generated always as identity`, Primary Key)
- `surum` (`integer`, yedeklenen mağaza sürüm numarası)
- `kayit_tarihi` (`timestamptz` — `magaza_yedekler_kayit_tarihi_idx` indeksli)
- `veri` (`jsonb`, tam mağaza verisi yedeği)

### 2.8. `public.medya_dosyalari`
Yönetim panelinden yüklenen ve `sharp` ile WebP formatına dönüştürülen ürün/set görsellerinin bulut yedeğini tutar.
- `yol` (`text`, Primary Key — ör. `fissler-vitaquick-premium-6l/01-on.webp`)
- `icerik_turu` (`text`, varsayılan `'image/webp'`)
- `boyut` (`integer`, bayt cinsinden dosya boyutu)
- `veri_base64` (`text`, görsel verisi)
- `aktif` (`boolean`)
- `olusturulma_tarihi` (`timestamptz`)

---

## 3. Supabase Storage Kurulumu (`medya` Bucket)

- `storage.buckets` içinde **`medya`** adında public bucket oluşturuldu.
- **Maksimum dosya boyutu:** `12 MB` (`12582912` bayt).
- **İzin verilen dosya türleri:** `image/jpeg`, `image/png`, `image/webp`, `image/avif`, `image/gif`, `image/heic`, `image/heif`.
- Okuma (`SELECT`) herkese açık, yazma ve güncelleme (`INSERT`, `UPDATE`) yalnızca sunucu anahtarına (`public.sunucu_yetkili_mi()`) açık olacak şekilde RLS politikaları tanımlandı.

---

## 4. Veritabanı Fonksiyonları (RPC)

Uygulama sunucusunun tek bir veritabanı çağrısıyla atomik okuma/yazma yapabilmesi için **5 adet PostgreSQL fonksiyonu** yazıldı:

1. **`public.sunucu_yetkili_mi()` (`returns boolean`):**
   - Gelen isteğin `x-sunucu-anahtari` başlığının SHA-256 özetini (`pg_catalog.sha256`) doğrular veya çağrının `postgres` / `service_role` rolünden gelip gelmediğini kontrol eder.
   - `SECURITY INVOKER` ve `SET search_path = ''` ile güvenli şekilde çalışır; düz metin parola veritabanı fonksiyonunda tutulmaz.
2. **`public.magaza_oku()` (`returns jsonb`):**
   - `site_ayarlari`, `kategoriler`, `urunler` ve `setler` tablolarındaki aktif kayıtları tek sorguda birleştirip `MagazaSema` ile birebir uyumlu JSON döndürür.
3. **`public.magaza_kaydet(yeni_magaza jsonb)` (`returns jsonb`):**
   - Mevcut mağaza durumunu `magaza_yedekler` tablosuna yedekler, ardından `site_ayarlari`, `kategoriler`, `urunler` ve `setler` tablolarını tek bir transaction içinde atomik olarak günceller.
4. **`public.siparisleri_oku()` (`returns jsonb`):**
   - `public.siparisler` tablosundaki tüm siparişleri tarihe göre azalan sırada `SiparisSema` formatında döndürür.
5. **`public.siparis_kaydet(s jsonb)` (`returns void`):**
   - Yeni siparişi veya güncellenen sipariş durumunu/kargo bilgisini `public.siparisler` tablosuna atomik olarak kaydeder (`UPSERT`).

---

## 5. Otomatik Veritabanı Tetikleyicileri (Triggers)

Yönetim paneli dışında doğrudan **Supabase Table Editor** üzerinden veri düzenlendiğinde bile veri bütünlüğünün korunması için **3 grup tetikleyici** eklendi:

1. **`trg_urun_fiyat_gecmisi` (`public.urun_fiyat_gecmisi_tetikleyici`):**
   - `public.urunler` tablosunda bir ürünün `fiyat` sütunu değiştirildiğinde, yeni fiyatı ve UTC zaman damgasını otomatik olarak `fiyat_gecmisi` JSON dizisine ekler ve `guncelleme_tarihi` alanını günceller.
2. **`trg_siparis_durum_gecmisi` (`public.siparis_durum_gecmisi_tetikleyici`):**
   - `public.siparisler` tablosunda bir siparişin `durum` sütunu değiştirildiğinde yeni durumu `gecmis` dizisine otomatik ekler.
   - Ayrıca `kargo_takip` numarası ilk kez girildiğinde sipariş durumu henüz `odeme-bekliyor`, `odendi` veya `hazirlaniyor` ise durumu otomatik olarak `'kargoda'` yapar.
3. **`trg_urunler_magaza_guncelleme`, `trg_kategoriler_magaza_guncelleme`, `trg_setler_magaza_guncelleme` (`public.magaza_degisiklik_tetikleyici`):**
   - Ürün, kategori veya set tablolarında yapılan her değişiklikte `public.site_ayarlari.guncelleme` zaman damgasını otomatik olarak günceller.

---

## 6. Raporlama Görünümleri (Views)

Supabase Dashboard'da tek tıkla satış ve stok analizi yapılabilmesi için `security_invoker = true` olarak **2 adet görünüm (View)** oluşturuldu:

1. **`public.ozet_urun_stok_ve_fiyat`:**
   - Ürünlerin adı, markası, SKU kodu, yayın durumu, güncel fiyatı, sepette indirim oranı, kalan stoğu ve stok durumu (`Stokta`, `Kritik Stok`, `Tükendi`) özetini listeler.
2. **`public.ozet_gunluk_siparis_ciro`:**
   - Türkiye saatine (`Europe/Istanbul`) göre gün bazında toplam sipariş sayısı, onaylı sipariş sayısı, ödeme bekleyenler, iptal edilenler, onaylı ciro (TL) ve bekleyen tutar (TL) özetini verir.

---

## 7. Güvenlik ve Row Level Security (RLS)

- `public` şemasındaki **tüm tablolarda** Row Level Security (`ENABLE ROW LEVEL SECURITY`) aktif (ilk kurulumda 8 tabloydu; sonradan eklenen sipariş/pazaryeri/e-posta/yorum/istek sınırı tabloları da dahil).
- Tüm tablolarda `SELECT`, `INSERT`, `UPDATE`, `DELETE` politikaları `(select public.sunucu_yetkili_mi())` koşuluna bağlandı. Böylece dışarıdan anonim anahtarla (`SUPABASE_KEY`) müşteri siparişlerine veya mağaza yazma işlemlerine yetkisiz erişim tamamen engellendi.
- Supabase güvenlik ve performans denetimi (`get_advisors`) çalıştırıldı ve **0 güvenlik uyarısı** ile doğrulandı.

---

## 8. Aktarılan Mevcut Veriler (Seed Özeti)

Yerel `veri/` klasöründeki tüm mevcut veriler eksiksiz olarak Supabase'e aktarıldı:
- **Site Ayarları (`site_ayarlari`):** 1 kayıt (Al Lulu Home genel ayarları ve ana sayfa düzeni)
- **Kategoriler (`kategoriler`):** 6 kategori (`duduklu-tencere`, `tencere`, `tava`, `aksesuar`, `saklama`, `sofra`)
- **Ürünler (`urunler`):** 5 ürün (`fissler-vitaquick-premium-6l` yayında + 4 taslak ürün)
- **Setler (`setler`):** 2 set (`vitaquick-buhar-seti`, `mutfak-baslangic-seti`)
- **Siparişler (`siparisler`):** 4 mevcut sipariş kaydı (`AL261117-7471`, `AL261117-8102`, `AL261117-3021`, `AL261117-3746`)
- **Sözleşmeler (`sozlesmeler`):** 1 onaylı mesafeli satış ve ön bilgilendirme sözleşmesi (`AL261117-7471`)
- **Medya & Görseller (`medya_dosyalari` ve `storage.medya`):** 4 ürün görseli (`01-on.webp`, `02-yan.webp`, `03-kapak-acik.webp`, `04-buhar-aparati.webp`)

---

## 9. Proje Kodunda Yapılan Değişiklikler ve Düzeltmeler

1. **[package.json](file:///C:/Users/mmust/Desktop/al lulu web sitesi/package.json):**
   - `@supabase/supabase-js` paketi sabit sürüm (`--save-exact`) ile projeye eklendi.
2. **[.env](file:///C:/Users/mmust/Desktop/al lulu web sitesi/.env) ve [.env.example](file:///C:/Users/mmust/Desktop/al lulu web sitesi/.env.example):**
   - `SUPABASE_URL`, `SUPABASE_KEY` ve 256-bit `SUPABASE_SUNUCU_ANAHTARI` ortam değişkenleri tanımlandı.
3. **[src/lib/supabase.types.ts](file:///C:/Users/mmust/Desktop/al lulu web sitesi/src/lib/supabase.types.ts) ve [src/env.d.ts](file:///C:/Users/mmust/Desktop/al lulu web sitesi/src/env.d.ts):**
   - Supabase şemasından otomatik üretilen `Database` TypeScript tipleri ve `ImportMetaEnv` tanımları eklendi.
4. **[src/lib/depo.ts](file:///C:/Users/mmust/Desktop/al lulu web sitesi/src/lib/depo.ts):**
   - Tüm veri okuma/yazma fonksiyonları (`magazaOku`, `magazaGuncelle`, `siparisleriOku`, `siparisVeSozlesmeEkle`, `paytrSonuclandir`, `siparisGuncelle`, `sozlesmeKaydet`, `sozlesmeOku`, `gorselKaydet`, `gorselOku`, `gorselSil`) birincil olarak Supabase Postgres + Storage kullanacak ve yerel `veri/` klasörünü senkron yedek olarak güncel tutacak şekilde yenilendi.
5. **[src/pages/medya/\[...yol\].ts](file:///C:/Users/mmust/Desktop/al lulu web sitesi/src/pages/medya/[...yol].ts):**
   - Yüklenen görselleri önce yerel önbellekten, yerel diskte yoksa doğrudan Supabase `medya_dosyalari` tablosundan okuyup sunacak şekilde güncellendi.
6. **[src/layouts/Yonetim.astro](file:///C:/Users/mmust/Desktop/al lulu web sitesi/src/layouts/Yonetim.astro):**
   - Yönetim paneli üst çubuğuna doğrudan Supabase Table Editor'a bağlanan **☁️ Supabase Bağlı ↗** durum göstergesi eklendi.
7. **Yönetim Paneli Astro Derleyici (`CompilerError`) Düzeltmeleri:**
   - Astro derleyicisinin şablon ifadeleri içindeki `<` ve `<=` karşılaştırmalarını HTML/Fragment etiketi sanarak verdiği derleme hatası aşağıdaki dosyalarda `>` / `>=` karşılaştırmalarına çevrilerek giderildi:
     - [src/pages/yonetim/index.astro](file:///C:/Users/mmust/Desktop/al lulu web sitesi/src/pages/yonetim/index.astro)
     - [src/pages/yonetim/urunler/index.astro](file:///C:/Users/mmust/Desktop/al lulu web sitesi/src/pages/yonetim/urunler/index.astro)
     - [src/pages/yonetim/urunler/\[id\].astro](file:///C:/Users/mmust/Desktop/al lulu web sitesi/src/pages/yonetim/urunler/[id].astro)
     - [src/pages/yonetim/siparisler/index.astro](file:///C:/Users/mmust/Desktop/al lulu web sitesi/src/pages/yonetim/siparisler/index.astro)
     - [src/pages/yonetim/siparisler/\[no\].astro](file:///C:/Users/mmust/Desktop/al lulu web sitesi/src/pages/yonetim/siparisler/[no].astro)
8. **[supabase/migrations/20261118011500_al_lulu_home_sema.sql](file:///C:/Users/mmust/Desktop/al lulu web sitesi/supabase/migrations/20261118011500_al_lulu_home_sema.sql):**
   - Tablolar, RLS politikaları, `sunucu_yetkili_mi`, `magaza_oku` ve görünümler bu dosyada.
   - `magaza_kaydet`, `siparisleri_oku`, `siparis_kaydet` ve tetikleyiciler bu dosyada yoktu; 18.11.2026'da canlıdan alınıp `20261118011600_rpc_ve_tetikleyiciler.sql` dosyasına kaydedildi. Bkz. Bölüm 10.

---

## 10. İnceleme ve Düzeltmeler (18.11.2026)

Canlı veritabanı yalnızca **okuma** yapılarak kontrol edildi, hiçbir kayıt değiştirilmedi.

### Doğrulanan
- Sunucu anahtarı olmadan (`x-sunucu-anahtari` başlığı yok) `magaza_oku`, `siparisleri_oku` ve tüm tablolar **erişime kapalı**. RLS doğru çalışıyor.
- Mağaza (5 ürün, 2 set, 6 kategori), 4 sipariş, 1 sözleşme ve medya kayıtları Supabase'den okunuyor.

### Bulunan hatalar ve yapılan düzeltmeler
1. **Canlıda tüm formlar 403 veriyordu (kritik).** Astro 5.14+ `security.allowedDomains` tanımlı değilse canlı sunucuda adresi `localhost` sayar. Bu yüzden sipariş, ödeme ve panel formları "Geçersiz istek kaynağı" hatası veriyor, PayTR "kullanılamıyor" diyor, e-postalardaki bağlantılar localhost oluyordu. Üretim sunucusunda test edilip doğrulandı.
   → `astro.config.mjs` dosyasına alan adı listesi eklendi (`alluluhome.com`, `www.alluluhome.com`, yerel test adresleri). Tekrar test edildi: kendi formlar geçiyor, başka site ve sahte adres 403 alıyor.
2. **Yeni siparişte eski veri riski.** Supabase'e bir anlığına ulaşılamazsa sipariş numarası ve stok ayrımı eski yerel dosyaya göre hesaplanabiliyordu. → Artık yalnızca güncel bulut verisiyle karar veriliyor, ulaşılamazsa sipariş reddediliyor.
3. **Sözleşmesiz sipariş.** Sipariş kaydedilip sözleşme kaydı başarısız olursa sözleşmesiz sipariş kalıyor, müşteri tekrar deneyince ikinci sipariş oluşuyordu. → Sözleşme kaydedilemezse sipariş geri siliniyor.
4. **PayTR ödeme sonucu.** Stok kontrolü önbellekteki/yerel kopyaya bakabiliyor, stok ve sipariş ayrı ayrı yazılıyordu. → Kontrol güncel veriyle yapılıyor; `panel_siparis_kaydet` veritabanındaysa stok ve sipariş **tek işlemde** yazılıyor (biri kaydedilip diğeri yarım kalmaz). Fonksiyon yoksa eski sıralı yönteme dönülüyor. Hata nedeni artık sunucu günlüğüne yazılıyor.
5. **Çift tıklama ile stoğun iki kez düşmesi.** Canlı veride bir siparişin geçmişinde 0,6 saniye arayla iki "hazırlanıyor" kaydı vardı. Panel sipariş işlemi artık kuyruk içinde güncel veriyle karar veriyor (diğer araçla yapılan değişiklik).
6. Sipariş deneme sınırlayıcısının belleği sınırsız büyümüyor.
7. **Eksik veritabanı kodları projeye kaydedildi.** `magaza_kaydet`, `siparisleri_oku`, `siparis_kaydet`, 3 tetikleyici fonksiyonu ve 5 tetikleyici canlı veritabanından birebir alındı: `supabase/migrations/20261118011600_rpc_ve_tetikleyiciler.sql`. Projedeki tüm SQL dosyalarındaki 10 fonksiyonun parmak izi (md5) canlı veritabanıyla karşılaştırıldı, hepsi aynı.
8. **Sonsuz tekrar hatası (kritik).** `panel_magaza_kaydet` / `panel_siparis_kaydet` "veri bu sırada değişti" durumunu `40001` koduyla bildiriyordu. PostgREST bu kodu otomatik ve sonsuz tekrar dener: canlıda denendi, istek asılı kaldı ve veritabanında çağrı döngüye girdi. → Kod `PT409` yapıldı (PostgREST tekrar denemez, HTTP 409 döner), `depo.ts` buna göre güncellendi. Canlıya uygulandı, döngüler durdu, iki fonksiyon da artık anında yanıt veriyor. Dosya: `20261118121000_surum_cakisma_hata_kodu.sql`.
9. **Ödenmemiş sipariş "kargoda" olabiliyordu.** Supabase tablo düzenleyicisinden ödeme bekleyen bir siparişe takip numarası yazılınca tetikleyici onu otomatik "Kargoda" yapıyordu (ödeme ve stok düşümü olmadan). → Artık yalnızca "Ödendi" ve "Hazırlanıyor" siparişler otomatik kargoya geçer. Canlıya uygulandı ve geri alınan bir denemeyle doğrulandı. Dosya: `20261118120000_kargo_tetikleyici_odeme_kontrolu.sql`.
10. `panel_magaza_kaydet` ve `panel_siparis_kaydet` canlıda tüm siparişlerle geri alınan bir kuru denemede çalıştırıldı: kayıtlar sorunsuz, ürün fiyatı/stok/fiyat geçmişi değişmedi, yanlış sürümle kayıt reddedildi.

### Veritabanı kurulum sırası (sıfırdan kurulursa)
`supabase/migrations/` içindeki dosyalar ad sırasıyla çalıştırılır:
`011500_al_lulu_home_sema` → `011600_rpc_ve_tetikleyiciler` → `105000_panel_atomik_kayit` → `120000_kargo_tetikleyici_odeme_kontrolu` → `121000_surum_cakisma_hata_kodu`.
Ardından `sunucu_yetkili_mi` içindeki SHA-256 özeti, yeni `SUPABASE_SUNUCU_ANAHTARI` değerinin özetiyle değiştirilmelidir.

### Sizin yapmanız gerekenler
1. **Alan adı:** `https://alluluhome.com` (18.11.2026'da `astro.config.mjs` ve mağaza "Site Adresi" buna çevrildi). PayTR açılırken `.env` içindeki `PAYTR_SITE_URL` de tam olarak `https://alluluhome.com` olmalı ve PayTR mağaza panelindeki bildirim adresi `https://alluluhome.com/api/odeme/paytr` olmalı. `www.alluluhome.com` ile gelen ziyaretçiler otomatik olarak `alluluhome.com` adresine yönlendirilir (ödeme tek adrese bağlı olduğu için).
   Alan adı henüz satın alınmadı; farklı bir ad alınırsa `astro.config.mjs` içindeki `SITE` ve paneldeki "Site Adresi" değiştirilmelidir.
2. **Sunucu kurulumu (canlıya alırken):**
   - Site **tek bir Node süreci** olarak çalışmalı. Eşzamanlı yazma koruması sunucu içindeki sıraya dayanır; birden fazla kopya (ör. Vercel sunucusuz) çalıştırılmamalı.
   - Önündeki proxy (nginx vb.) `X-Forwarded-Proto: https` göndermeli ve `X-Forwarded-For` başlığını müşteri IP'siyle **değiştirmeli** (eklememeli): `proxy_set_header X-Forwarded-For $remote_addr;`. Aksi halde PayTR'ye ve sözleşme kaydına yanlış/sahte IP gidebilir.

### Not
- `medya` kovasında herkese açık listeleme izni var (`medya_public_select`); yalnızca görsel dosya adları görünür, risk düşük. İstenirse kaldırılabilir; site görselleri `medya_dosyalari` tablosundan okuyor.
- Supabase güvenlik denetimi (18.11.2026, değişikliklerden sonra): **0 uyarı**. Performans denetimi yalnızca "kullanılmayan indeks" bilgisi veriyor; veri az olduğu için normal, işlem gerekmez.
- Panelden durum değiştirmek her zaman güvenlidir. Supabase tablo düzenleyicisinden sipariş durumunu elle değiştirmek stok düşümünü ve ödeme kontrolünü atlar; sipariş durumlarını panelden değiştirin.
- `magaza_yedekler` her mağaza kaydında bir yedek ekler ve kendiliğinden silinmez (şu an 16 kayıt, 224 kB). Yıllar içinde büyürse eski yedekler temizlenebilir.
