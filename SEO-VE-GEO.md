# SEO ve GEO (Yapay Zekâ Aramaları) Planı — Al Lulu Home

Son güncelleme 20.11.2026.

## 20.11.2026 kontrolü

- [x] Sitede 14 ürün ve ürün bulunan 7 kategori doğrulandı. Her iki XML akışında 14 ürün ve 2 geçerli GTIN var.
- [x] Yedi kategoriye görünür seçim rehberi ve `CollectionPage` ile `ItemList` verisi eklendi. Site haritası ürün görsellerini içerir. Site haritası ve `llms.txt` yayındaki ürünlerle sınırlıdır. [Google site haritası belgeleri](https://developers.google.com/search/docs/crawling-indexing/sitemaps/image-sitemaps)
- [x] Ürün meta açıklamaları kısaltıldı ve başlıklarda marka tekrarları temizlendi. Üretici model kodu için panelde **Detaylar → Teknik özellikler → MPN** satırını kullanın. [Google MPN kuralları](https://support.google.com/merchants/answer/6324482)
- [x] Google Merchant Center müşteri hizmetlerine mağazadaki destek e-postası ve [iletişim sayfası](https://alluluhome.com/bilgi) kaydedildi.
- [x] Güncellenen site haritası Search Console’a yeniden gönderildi. Google gönderimi kabul etti. [Search Console site haritaları](https://search.google.com/u/1/search-console/sitemaps?resource_id=sc-domain%3Aalluluhome.com)
- [x] 14 ürün ve 7 kategori adresi IndexNow’a iletildi. Hizmet HTTP 200 ile kabul etti. [IndexNow belgeleri](https://www.indexnow.org/documentation)
- [ ] Merchant Center’da 14 ürün incelemede, onaylanan ürün sayısı 0. İnceleme sonrasında **Ürünler → Dikkat gerekiyor** bölümünü kontrol edin.
- [ ] Akakçe ve Cimri onayı doğrulanmadı. Her iki platform için mağaza adına herkese açık eşleşme ve kurumsal posta kutusunda başvuru bildirimi bulunamadı. Başvuru hesabı veya referans numarası varsa durum oradan doğrulanmalı. [Akakçe mağaza başvurusu](https://www.akakce.com/magaza-basvuru/) · [Cimri mağaza kaydı](https://www.cimri.com/magaza-kayit)
- [ ] 12 ürünün kutudan doğrulanacak barkodu var. Panelde **Ürünler & Stok → Barkodu eksik** filtresinden takip edin. [Google GTIN kuralları](https://support.google.com/merchants/answer/6324461)

## Gerçekçi beklenti

"tencere" Türkiye'nin en rekabetçi aramalarından biridir; ilk sırada Trendyol, Hepsiburada, Karaca, Emsan,
Korkmaz gibi yüzlerce ürün ve yıllardır içerik üreten siteler var. **Bunu kimse garanti edemez**, para verilerek de
organik sıra satın alınamaz. Kazanılabilir yol şudur:

1. **Önce dar ve satın almaya yakın aramalar:** "Fissler Vitaquick 6 L", "Fissler düdüklü tencere fiyat",
   "Fissler Vitaquick Premium orijinal", "indüksiyon düdüklü tencere 6 litre". Bunlarda birkaç hafta–birkaç ayda üst sıralar mümkün.
2. **Sonra rehber içerikler:** "düdüklü tencere nasıl seçilir", "Fissler conta ne zaman değişir", "düdüklü tencerede
   nohut kaç dakika" gibi sorulara uzman cevaplar → hem Google'da hem ChatGPT/Gemini/Perplexity cevaplarında kaynak olarak görünme.
3. **Ürün yelpazesi.** Tencereler kategorisi yayında. Ürün eklenen kategoriler site haritasına otomatik girer.
4. **Hemen trafik isterseniz:** Google Ads (Alışveriş reklamları) — ölçüm altyapısı hazır; "purchase" olayı dönüşüm olarak kullanılır.

## Sitede yapılanlar ✅

| Konu | Durum |
|---|---|
| Sunucu tarafı oluşturma (SSR) | Her sayfa tam HTML gelir; Google ve yapay zekâ botları içeriği doğrudan okur |
| Başlık, açıklama, kanonik adres | Tüm sayfalarda; ana sayfa başlığı "Fissler Düdüklü Tencere ve Premium Mutfak Ürünleri" |
| Open Graph / Twitter kartı | og:type, og:url, og:image, twitter:card — WhatsApp/Instagram paylaşımlarında görsel çıkar |
| Ürün verisi (Product/Offer) | Gerçek fiyat (müşterinin ödediği), stok, marka, model kodu, 10 teknik özellik, kargo süresi/ücreti, 14 gün ücretsiz iade |
| Sık sorulanlar (FAQPage) | Ürün sayfası ve ana sayfadaki soru-cevaplar |
| Gezinti yolu (BreadcrumbList) | Ürün, kategori, tüm ürünler, setler |
| Mağaza verisi (OnlineStore) | Ad, logo, müşteri hizmetleri, **çalışma saatleri** (paneldeki metinden), Türkiye geneli satış, iade politikası |
| `/llms.txt` | Yapay zekâ asistanları için mağaza özeti: ürünler, fiyat, kargo, iade, iletişim — panelden otomatik, hep güncel |
| Site haritası, robots.txt | Boş kategori ve setsiz "Setler" sayfası haritada yok ve `noindex`; yapay zekâ botları engellenmiyor |
| İkonlar | favicon 32/48/192, apple-touch-icon, webmanifest, altın amblem |
| Ölçüm | GA4 e-ticaret olayları + çerez onayı (GTM kimliği girilince açılır) |
| Sahte yorum/puan | **Yok ve eklenmeyecek.** Gerçek yorumlar toplandığında eklenir |

## Sizin yapmanız gerekenler 👤 (öncelik sırasıyla)

### ✅ 1. Google Search Console — TAMAMLANDI (18.11.2026)
info@alluluhome.com hesabında `alluluhome.com` alan mülkü doğrulandı, site haritası gönderildi, ana sayfa ve Vitaquick sayfası için dizine ekleme istendi (ana sayfa zaten Google'daydı).
Raporlar: <https://search.google.com/u/1/search-console?resource_id=sc-domain:alluluhome.com> → **Performans** (2–3 gün sonra dolar).

### Ürün akışı (Merchant Center, Akakçe, Cimri) ✅
Adres: **<https://alluluhome.com/urun-akisi.xml>** — Google Alışveriş biçiminde, panelden otomatik, fiyat/stok/kargo hep güncel.
**JPEG ürün akışı** <https://alluluhome.com/urun-akisi-jpg.xml>. Cimri Google RSS biçimini ve JPEG görselleri destekliyor. Akakçe’nin mağazaya özel XML talebi başvuru sırasında doğrulanmalı. [Cimri akış belgesi](https://www.cimri.com/google-feed-doc.pdf)
- **Cimri:** <https://www.cimri.com/magaza-kayit> → formda istenenler (19.11.2026'da sayfadan okundu): ad soyad, e-posta, cep telefonu, şirket web sitesi, **ünvan**, **vergi kimlik no** (şahıs şirketiyse TCKN), **şirket adresi**, isteğe bağlı "Google Feed Bağlantısı" (yukarıdaki JPG akışı) ve belge yüklemeleri: **vergi levhası, imza sirküleri, ticaret sicili gazetesi, faaliyet belgesi**. Satış başına komisyon.
- **Akakçe:** <https://www.akakce.com/magaza-basvuru/> → Hemen Başvur (önce Akakçe'de kullanıcı hesabı açmak gerekiyor). Tıklama başına ücretlidir. Akakçe sayfasında "tüm firma bilgileriniz (ünvan, adres) açık olarak verilir" yazıyor, yani firma bilgileri Akakçe'de herkese görünür. XML olarak JPG akışını verin; kendi biçimlerini isterlerse gönderdikleri şablonu bana iletin, ikinci bir akış eklerim.
- İkisi de ödeme alınabilen bir site ister: **PayTR canlıya alınmadan başvuru reddedilebilir.**

### (eski adımlar, bilgi için) Search Console
1. <https://search.google.com/search-console> → info@alluluhome.com ile girin.
2. Sol üstte `alluluhome.com` mülkü görünüyorsa **kayıt zaten var** (DNS'teki doğrulama kaydı yerinde). Yoksa **Mülk ekle → Alan** → `alluluhome.com` → Cloudflare'de TXT zaten var, **Doğrula**.
3. **Site haritaları** → `sitemap.xml` → Gönder.
4. **URL denetimi** → `https://alluluhome.com/urun/fissler-vitaquick-premium-6l` → **Dizine eklenmesini iste**. Aynısını ana sayfa için.
5. **Performans** raporu: Google'da hangi aramada kaç kez göründüğünüzü ve tıklandığınızı gösterir (2–3 gün sonra dolmaya başlar). Çerez gerektirmez.

### 2. Google İşletme Profili

Mağaza yalnız çevrim içi satış yaptığı sürece Google İşletme Profili uygunluk koşullarını karşılamıyor. [Google uygunluk koşulları](https://support.google.com/business/answer/13763036)

### 3. Google Merchant Center

Ürün kaynağı `https://alluluhome.com/urun-akisi.xml` tanımlı. Ödeme ve mağaza incelemesiyle ilgili uyarılar için 14 ürünün değerlendirme sonucunu takip edin. [Merchant Center](https://merchants.google.com/)

### 4. Bing Webmaster Tools

20.11.2026 kontrolünde oturum açma ekranı görüldü. Alan mülkü doğrulanamadı. Yetkili hesapla **Google Search Console’dan içe aktar** seçeneği kullanılabilir. [Bing Webmaster Tools](https://www.bing.com/webmasters/)

### 5. GA4 + Tag Manager — site içi davranış (EPOSTA-VE-GOOGLE.md → Adım 6)

GA4 kurulumu ve Production etiketi kayıtlı. Canlı ödeme açılınca `purchase` olayını bir onaylı siparişle doğrulayın.

### 6. Satıcı bilgileri (yasal zorunluluk ve güven sinyali)
Panelde **ticari unvan, adres, vergi no, MERSİS, ETBİS** boş. 19.11.2026'dan beri boş alanlar sitede ve sözleşmelerde hiç gösterilmiyor (eskiden "[… girilmedi]" yazıyordu); satıcı adı yerine "Al Lulu Home" yazılıyor.
Panel > Ayarlar'dan doldurulursa kendiliğinden yeniden görünür. Not: 6563 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği satıcının adını/unvanını ve adresini istiyor; Cimri ve Akakçe başvuruları da bu bilgiler olmadan yapılamıyor.

## Sonraki aşamalar (kodda, onayınızla)

1. **Blog / rehber sistemi** (Supabase + panel): başlık, adres (slug), kapak görseli, içerik, SEO başlığı/açıklaması,
   yayın tarihi, taslak/yayında, ilgili ürünler; yazıdan ürün sayfasına bağlantı; Article verisi; site haritasına otomatik ekleme.
   GEO için en büyük kaldıraç budur.
2. **Kategori sayfası içerikleri.** İlk seçim rehberleri eklendi. Arama sorguları ve müşteri soruları arttıkça bu metinleri ürün grubu bazında genişletin.
3. **Meta Pixel + Conversions API:** çerez penceresine "Pazarlama" seçeneği eklenir; tarayıcı ve sunucu olayı aynı `event_id` ile
   gönderilir (tekrar sayılmaz). Meta işletme hesabı ve Pixel kimliği sizde açılmalı.
4. **Google Ads dönüşümü:** GTM'de "purchase" olayına bağlanır; kod değişikliği gerekmez.
5. **Ürün sayısı artınca:** kategori filtreleri (marka, hacim, malzeme, ocak tipi) — veri modeli teknik özelliklerden türetilir.
