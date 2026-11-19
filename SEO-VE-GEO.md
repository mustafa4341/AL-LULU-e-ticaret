# SEO ve GEO (Yapay Zekâ Aramaları) Planı — Al Lulu Home

Güncelleme: 18.11.2026. ✅ = sitede yapıldı, 👤 = Google/Bing panellerinde sizin yapmanız gereken.

## Gerçekçi beklenti

"tencere" Türkiye'nin en rekabetçi aramalarından biridir; ilk sırada Trendyol, Hepsiburada, Karaca, Emsan,
Korkmaz gibi yüzlerce ürün ve yıllardır içerik üreten siteler var. **Bunu kimse garanti edemez**, para verilerek de
organik sıra satın alınamaz. Kazanılabilir yol şudur:

1. **Önce dar ve satın almaya yakın aramalar:** "Fissler Vitaquick 6 L", "Fissler düdüklü tencere fiyat",
   "Fissler Vitaquick Premium orijinal", "indüksiyon düdüklü tencere 6 litre". Bunlarda birkaç hafta–birkaç ayda üst sıralar mümkün.
2. **Sonra rehber içerikler:** "düdüklü tencere nasıl seçilir", "Fissler conta ne zaman değişir", "düdüklü tencerede
   nohut kaç dakika" gibi sorulara uzman cevaplar → hem Google'da hem ChatGPT/Gemini/Perplexity cevaplarında kaynak olarak görünme.
3. **Ürün yelpazesi:** "tencere" kategorisi şu an boş (bu yüzden Google'a gösterilmiyor). Tencere ürünleri eklendikçe
   kategori sayfası otomatik olarak site haritasına girer.
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
**Cimri ve Akakçe için:** **<https://alluluhome.com/urun-akisi-jpg.xml>** — aynı akış, görseller JPEG (Cimri'nin resmî akış belgesi .jpg/.png istiyor; sitedeki görseller WebP). Google akışı WebP ile kalır.
- **Cimri:** <https://www.cimri.com/magaza-kayit> → formda istenenler (19.11.2026'da sayfadan okundu): ad soyad, e-posta, cep telefonu, şirket web sitesi, **ünvan**, **vergi kimlik no** (şahıs şirketiyse TCKN), **şirket adresi**, isteğe bağlı "Google Feed Bağlantısı" (yukarıdaki JPG akışı) ve belge yüklemeleri: **vergi levhası, imza sirküleri, ticaret sicili gazetesi, faaliyet belgesi**. Satış başına komisyon.
- **Akakçe:** <https://www.akakce.com/magaza-basvuru/> → Hemen Başvur (önce Akakçe'de kullanıcı hesabı açmak gerekiyor). Tıklama başına ücretlidir. Akakçe sayfasında "tüm firma bilgileriniz (ünvan, adres) açık olarak verilir" yazıyor, yani firma bilgileri Akakçe'de herkese görünür. XML olarak JPG akışını verin; kendi biçimlerini isterlerse gönderdikleri şablonu bana iletin, ikinci bir akış eklerim.
- İkisi de ödeme alınabilen bir site ister: **PayTR canlıya alınmadan başvuru reddedilebilir.**

### (eski adımlar, bilgi için) Search Console
1. <https://search.google.com/search-console> → info@alluluhome.com ile girin.
2. Sol üstte `alluluhome.com` mülkü görünüyorsa **kayıt zaten var** (DNS'teki doğrulama kaydı yerinde). Yoksa **Mülk ekle → Alan** → `alluluhome.com` → Cloudflare'de TXT zaten var, **Doğrula**.
3. **Site haritaları** → `sitemap.xml` → Gönder.
4. **URL denetimi** → `https://alluluhome.com/urun/fissler-vitaquick-premium-6l` → **Dizine eklenmesini iste**. Aynısını ana sayfa için.
5. **Performans** raporu: Google'da hangi aramada kaç kez göründüğünüzü ve tıklandığınızı gösterir (2–3 gün sonra dolmaya başlar). Çerez gerektirmez.

### 2. Google İşletme Profili — "satış yeri", çalışma saatleri, Haritalar (~20 dk)
<https://business.google.com> → **İşletme ekle**:
- Ad: **Al Lulu Home** · Kategori: **Mutfak gereçleri mağazası** (Google'daki İngilizce adı "Kitchen supply store"; ek kategori: "Ev eşyası mağazası")
- "Müşterilerin ziyaret edebileceği bir konum ekleyin mi?" → **Hayır** (yalnız çevrim içi satış; ev adresiniz görünmez)
- Hizmet bölgesi: **Türkiye**
- Telefon `0552 577 85 78`, web sitesi `https://alluluhome.com`
- Çalışma saatleri: **Pazartesi–Cuma 09:00–18:00** (sitedeki ile aynı olmalı; değişirse ikisini birden güncelleyin)
- Logo: `public/img/logo/icon-512.png`, kapak: ürün fotoğrafı
- Doğrulama (video/posta) Google'ın istediği yöntemle sizde.
- Ürünler sekmesine Vitaquick'i ekleyin. Gerçek müşterilerden **yorum isteyin** (yorum satın almayın, kendiniz yazmayın — Google siler ve ceza verir).

### 3. Google Merchant Center — ücretsiz "Alışveriş" listesi (~20 dk)
<https://merchants.google.com> → işletme bilgileri → **Ürünler → Ürün kaynağı ekle → Dosya → Planlanmış getirme (URL)** → `https://alluluhome.com/urun-akisi.xml` (günlük).
Sitedeki ürün verisi (fiyat, stok, kargo, iade) hazır. Kargo ayarı: 1.000 TL üzeri ücretsiz, altı 99 TL, 1–3 iş günü.
Not: Kartlı ödeme (PayTR) kapalıyken Google "satın alınamıyor" uyarısı verebilir; PayTR canlıya alınınca sorun kalmaz.

### 4. Bing Webmaster Tools — ChatGPT ve Copilot aramaları için (~5 dk)
ChatGPT'nin web araması ve Copilot büyük ölçüde **Bing dizinini** kullanır.
<https://www.bing.com/webmasters> → **Google Search Console'dan içe aktar** → site haritası otomatik gelir.

### 5. GA4 + Tag Manager — site içi davranış (EPOSTA-VE-GOOGLE.md → Adım 6)
`GTM_KIMLIGI`'ni bana yazmanız yeterli.

### 6. Satıcı bilgileri (yasal zorunluluk ve güven sinyali)
Panelde **ticari unvan, adres, vergi no, MERSİS, ETBİS** boş. 19.11.2026'dan beri boş alanlar sitede ve sözleşmelerde hiç gösterilmiyor (eskiden "[… girilmedi]" yazıyordu); satıcı adı yerine "Al Lulu Home" yazılıyor.
Panel > Ayarlar'dan doldurulursa kendiliğinden yeniden görünür. Not: 6563 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği satıcının adını/unvanını ve adresini istiyor; Cimri ve Akakçe başvuruları da bu bilgiler olmadan yapılamıyor.

## Sonraki aşamalar (kodda, onayınızla)

1. **Blog / rehber sistemi** (Supabase + panel): başlık, adres (slug), kapak görseli, içerik, SEO başlığı/açıklaması,
   yayın tarihi, taslak/yayında, ilgili ürünler; yazıdan ürün sayfasına bağlantı; Article verisi; site haritasına otomatik ekleme.
   GEO için en büyük kaldıraç budur.
2. **Kategori sayfası içerikleri:** her dolu kategoriye 150–300 kelimelik özgün "nasıl seçilir" metni.
3. **Meta Pixel + Conversions API:** çerez penceresine "Pazarlama" seçeneği eklenir; tarayıcı ve sunucu olayı aynı `event_id` ile
   gönderilir (tekrar sayılmaz). Meta işletme hesabı ve Pixel kimliği sizde açılmalı.
4. **Google Ads dönüşümü:** GTM'de "purchase" olayına bağlanır; kod değişikliği gerekmez.
5. **Ürün sayısı artınca:** kategori filtreleri (marka, hacim, malzeme, ocak tipi) — veri modeli teknik özelliklerden türetilir.
