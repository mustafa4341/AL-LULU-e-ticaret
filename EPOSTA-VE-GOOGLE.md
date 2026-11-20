# E-posta ve Google Kurulumu — Al Lulu Home

Sıra önem derecesine göredir. ✅ = hazır, 👤 = sizin yapmanız gereken (giriş/parola gerektiği için).

## Durum özeti (20.11.2026)

| Konu | Durum |
|---|---|
| Alan adının e-postası Google'a yönleniyor (MX) | ✅ Cloudflare'de doğru |
| SPF kaydı | ✅ `v=spf1 include:_spf.google.com ~all` |
| Google alan adı doğrulaması | ✅ TXT kaydı var |
| **DKIM imzası** | ✅ yayında ve Google'da başlatıldı |
| **DMARC kaydı** | ✅ yayında (`p=none`); 2–4 hafta sonra `p=quarantine` |
| Sipariş e-posta şablonları + gönderim kodu | ✅ canlıda |
| Vercel SMTP ayarları | ✅ `SMTP_PAROLA` dahil Production ayarları mevcut. Sipariş e-postasının teslimi henüz uçtan uca doğrulanmadı. |
| E-posta kaydı, tekrar gönderim engeli, panelden yeniden gönder | ✅ Supabase `eposta_kayitlari` |
| Çerez onayı + Google Tag Manager (Consent Mode, temel) | ✅ `GTM_KIMLIGI` Production ayarında kayıtlı (Adım 6) |
| GA4 e-ticaret olayları | ✅ view_item_list, select_item, view_item, add_to_cart, remove_from_cart, view_cart, begin_checkout, add_shipping_info, add_payment_info, purchase |
| Google arama ikonu, webmanifest | ✅ 32/48/192 px, `/favicon.ico`, `/site.webmanifest` |
| Ürün yapısal verisi (Merchant Center) | ✅ fiyat, stok, marka, SKU + kargo ve iade bilgisi |

**Bilinçli olarak yapılmayanlar:**
- **Resend / Supabase Edge Function:** Aynı işi Google Workspace hesabınızla ek ücretsiz ve ikinci bir DNS/SPF kurulumu olmadan yapıyoruz. Günde 2.000 e-postayı geçerseniz veya teslim/geri dönme (bounce) takibi gerekirse Resend'e geçilir; şablonlar aynen kullanılır.
- **Teslim edildi / geri döndü takibi:** Gmail SMTP bunu bildirmez. Ulaşmayan e-postalar "Teslim edilemedi" yanıtı olarak info@ gelen kutusuna düşer.
- **GA4 "refund" (iade):** Sunucudan GA4'e veri göndermek için ayrı API anahtarı gerekir; iade sayısı az olduğu için şimdilik yok.
- **Siparişe reklam/indirim eklenmez:** İşlem e-postalarında tanıtım olursa ticari ileti (İYS) kurallarına girer.

## Hangi e-posta ne işe yarıyor?

Workspace'te **tek gerçek hesap var: info@alluluhome.com**. musteri@ ve halime.karsu@ onun takma adı (alias); takma adla giriş yapılamaz, gelen her şey info@ kutusuna düşer.

| Adres | Görevi |
|---|---|
| **info@alluluhome.com** | Giriş yapılan tek hesap; site e-postaları bu hesabın uygulama şifresiyle gönderilir. Sitede alt bilgide "Kurumsal" adres |
| **musteri@alluluhome.com** (takma ad) | Müşteri hizmetleri: e-postaların **göndereni** ve **yanıt adresi**; sitede, sözleşmelerde ve iade bildiriminde görünen adres |
| **halime.karsu@alluluhome.com** (takma ad) | Her yeni siparişte "Yeni sipariş geldi" bildirimi |

Hepsi aynı info@ kutusuna düşer. Gmail filtresiyle ayırın: Ayarlar → Filtreler → **Kime:** `halime.karsu@alluluhome.com` → etiket "Siparişler", **Asla spam'e gönderme**. Aynı şekilde `musteri@` için "Müşteri" etiketi.
Not: Gmail, hesabın kendi takma adına gönderdiği bir e-postayı bazen yalnızca "Gönderilenler"de gösterir. İlk deneme siparişinde bildirim gelen kutusunda görünmezse bildirim adresini başka bir kutuya alırız.

## Otomatik giden e-postalar

| Ne zaman | Kime | İçerik |
|---|---|---|
| Sipariş verildi (kartla ödendiğinde) | Müşteri | Sipariş özeti, adres, takip butonu, sözleşmeler (yasal zorunluluk) |
| Sipariş verildi | Mağaza bildirim adresi | Müşteri bilgisi, adres, ürünler, "Panelde Aç" butonu. Yanıtla → müşteriye gider |
| Panelde "Ödendi" (manuel onay) | Müşteri | Ödemeniz onaylandı |
| Panelde kargo takip no girildi | Müşteri | Kargo firması, takip no, **"Kargomu Takip Et"** butonu |
| Panelde "Teslim edildi" | Müşteri | Teşekkür + garanti hatırlatması |
| Panelde "İptal" | Müşteri | İptal + (ödendiyse) iade bilgisi |

"Hazırlanıyor" aşamasında e-posta gönderilmez; müşteriyi gereksiz e-postayla yormamak için.
Görünüm dosyası: `src/lib/epostaSablon.ts`. Örnek önizleme: `eposta-onizleme.html`.

> Not: Supabase'in kendi e-posta servisi yalnızca üyelik/şifre e-postaları içindir; sipariş e-postası gönderemez.
> Bu yüzden e-postalar sitenin sunucusundan, sizin Google Workspace hesabınızla gönderilir: ek ücret yok, günde 2.000 e-postaya kadar.

---

## Adım 1 — DKIM (en önemli) 👤 ~10 dk

1. <https://admin.google.com> → **Uygulamalar → Google Workspace → Gmail → E-postanın kimliğini doğrulama**
2. Alan: `alluluhome.com` → **Yeni kayıt oluştur** → 2048 bit → Oluştur
3. Çıkan **TXT kaydı adı** (`google._domainkey`) ve **değeri** (`v=DKIM1; k=rsa; p=...`) kopyalayın.
4. <https://dash.cloudflare.com> → alluluhome.com → **DNS → Kayıt ekle**
   - Tür: `TXT` · Ad: `google._domainkey` · İçerik: kopyaladığınız uzun değer
5. 15–30 dk sonra Google yönetici sayfasına dönüp **Kimlik doğrulamayı başlat**'a basın. "E-postaları kimlik doğrulaması yapılarak gönderiliyor" yazmalı.

## Adım 2 — DMARC 👤 ~2 dk

Cloudflare → DNS → Kayıt ekle:
- Tür: `TXT` · Ad: `_dmarc` · İçerik:
  ```
  v=DMARC1; p=none; rua=mailto:info@alluluhome.com; adkim=r; aspf=r
  ```
2–4 hafta sorun çıkmazsa `p=none` → `p=quarantine` yapın (sahte e-postalar spama gider).

## Adım 3 — Sitenin e-posta göndermesi 👤 ~10 dk

**a) Uygulama şifresi (info@ hesabında)**
1. Yönetici panelinde: **Güvenlik → Kimlik doğrulama → 2 Adımlı Doğrulama → "Kullanıcıların açmasına izin ver"** işaretli olsun.
2. info@alluluhome.com ile giriş yapın → <https://myaccount.google.com/security> → **2 Adımlı Doğrulama**'yı açın.
   Ardından Gmail → ⚙️ **Tüm ayarları gör → Hesaplar → Farklı gönder**: `musteri@alluluhome.com` listede yoksa **Başka bir e-posta adresi ekle** → ad `Al Lulu Home`, "Takma ad olarak değerlendir" işaretli → ekle. (Listede değilse Gmail gönderen adresini info@ yapar.)
3. <https://myaccount.google.com/apppasswords> → ad: `Al Lulu Site` → **Oluştur** → çıkan 16 harfli şifreyi kopyalayın (boşluksuz).
   Bu şifreyi kimseyle/sohbette paylaşmayın; doğrudan Vercel'e yazın.

**b) Vercel'e ayarları girin** → Vercel → proje → **Settings → Environment Variables** (Production):

| Ad | Değer |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_KULLANICI` | `info@alluluhome.com` |
| `SMTP_PAROLA` | *16 harfli uygulama şifresi* |
| `SMTP_GONDEREN` | `Al Lulu Home <musteri@alluluhome.com>` |
| `EPOSTA_YANIT` | `musteri@alluluhome.com` |
| `SIPARIS_BILDIRIM_EPOSTA` | `halime.karsu@alluluhome.com` |

Kaydettikten sonra **Deployments → son dağıtım → Redeploy**. (Yerelde denemek için aynıları `.env` dosyasına.)

**c) Panelde iletişim adresi:** Yönetim → Ayarlar → E-posta: `info@alluluhome.com` (şu an kişisel Gmail adresi görünüyor; sözleşmelerde ve sitede bu adres yazar).

**d) Deneme:** Kendi e-postanızla bir sipariş verin ya da paneldeki bir deneme siparişine kargo takip no girin; e-posta 1 dk içinde gelmeli. Spama düşerse Adım 1–2 tamam mı kontrol edin.

## Adım 4 — E-postalarda logomuzun görünmesi (ikon) 👤 ~5 dk

- **Hemen, ücretsiz:** info@ hesabının profil fotoğrafını logo yapın (takma adlar da bunu kullanır):
  <https://myaccount.google.com> → profil resmi → `public/img/logo/icon-512.png` dosyasını yükleyin.
  Gmail kullanan müşteriler gönderen yanında bu logoyu görür.
- E-postaların içinde logo zaten var (`public/img/logo/eposta-logo.png`, site yayına alınınca görünür).
- **Sonra (isteğe bağlı) BIMI:** Tüm e-posta programlarında doğrulanmış logo (mavi tik) için DMARC `p=quarantine` + **tescilli marka** ve yıllık ücretli VMC/CMC sertifikası gerekir. Marka tescili bitince değerlendirin.

## Adım 5 — Google'dan trafik 👤 ~20 dk

1. **Search Console** <https://search.google.com/search-console> → **Alan** mülkü: `alluluhome.com` (DNS TXT kaydı zaten var, otomatik doğrulanabilir).
2. **Site haritaları** → `sitemap.xml` gönderin (adres: <https://alluluhome.com/sitemap.xml>, hazır).
3. **URL denetimi** → ana sayfa ve ürün sayfası → **Dizine eklenmesini iste**.
4. **Google İşletme Profili** <https://business.google.com> → mağaza adı, telefon, site, logo. Haritalarda ve marka aramasında görünür.
5. **Google Merchant Center** <https://merchants.google.com> → ücretsiz ürün listelemeleri ("Alışveriş" sekmesi). Ürün sayfalarında gerekli yapısal veri (fiyat, stok, marka) zaten var; Merchant Center'da "web sitesinden otomatik bul" seçilebilir.
6. Google Analytics için Adım 6'ya geçin.

## Adım 6 — Google Analytics 4 ✅ KURULDU (18.11.2026)

- GA4 hesabı "Al Lulu Home", mülk `alluluhome.com` (Türkiye saati, TL), veri akışı "Al Lulu Home web" — info@alluluhome.com hesabında.
- Google'ın oluşturduğu etiket: **GTM-5BLF4TXQ** → Vercel `GTM_KIMLIGI`. Site, çerez onayı verilince bu etiketi yükler.
- E-ticaret olayları `gtag('event', …)` ile doğrudan GA4'e gider; Tag Manager'da ayrıca etiket kurmak **gerekmez**.
- Raporlar: <https://analytics.google.com/analytics/web/?authuser=1> → Raporlar → Gerçek zamanlı / Para kazanma.
- Veri paylaşımı ayarlarında "Google ürünleri", "Modelleme" ve "İşletme önerileri" kapalı bırakıldı (gizlilik).
- Aşağıdaki adımlar artık yalnızca bilgi amaçlıdır.

### (bilgi) Elle kurulum adımları

Sitede çerez onay penceresi ve tüm e-ticaret olayları hazır; yalnızca Google tarafındaki hesaplar açılıp kimlik girilecek.
Pencere, kimlik girilene kadar **görünmez** (o zamana kadar sitede analitik çerez yoktur).

1. **GA4:** <https://analytics.google.com> → Yönetici → **Mülk oluştur** (Al Lulu Home, Türkiye, TRY, İstanbul saati) → **Veri akışı: Web** → `https://alluluhome.com`. Çıkan **Ölçüm kimliğini** (`G-XXXXXXX`) not edin.
2. **GTM:** <https://tagmanager.google.com> → Hesap oluştur → Kapsayıcı: `alluluhome.com`, **Web**. Çıkan **`GTM-XXXXXXX`** kimliğini not edin. Siteye kod yapıştırmanız GEREKMEZ; site bunu kendisi yükler.
3. GTM içinde:
   - **Etiket → Google Etiketi** → Etiket kimliği `G-XXXXXXX` → Tetikleyici: **Initialization - All Pages**.
   - **Etiket → GA4 Etkinliği** → Ölçüm kimliği `G-XXXXXXX`, Etkinlik adı `{{Event}}`, **Diğer ayarlar → E-ticaret verilerini gönder → Data Layer** → Tetikleyici: **Özel etkinlik**, "normal ifade" işaretli, etkinlik adı:
     `view_item_list|select_item|view_item|add_to_cart|remove_from_cart|view_cart|begin_checkout|add_shipping_info|add_payment_info|purchase`
   - **Önizle** ile siteyi açıp çerezi kabul edin, ürüne bakın, sepete ekleyin; olaylar Tag Assistant'ta görünmeli → **Yayınla**.
4. **Vercel** → al-lulu-e-ticaret → Settings → Environment Variables → `GTM_KIMLIGI` = `GTM-XXXXXXX` (Production) → Redeploy. İsterseniz kimliği bana yazın, ben girerim (gizli bilgi değildir).
5. GA4 → Yönetici → **DebugView**'de olayları kontrol edin. "purchase" yalnızca ödemesi onaylanmış siparişte, sipariş sayfasında bir kez gönderilir.

**Çerez penceresi:** "Reddet" ve "Tümünü kabul et" eşit görünür; kabul edilmeden Google Tag Manager hiç yüklenmez (Consent Mode, temel yöntem).
Tercih 12 ay saklanır; alt bilgideki **"Çerez tercihleri"** ile değiştirilir. Gizlilik ve Çerez Politikası buna göre güncellendi.
Yönetici girişliyken ve panel önizlemesinde ölçüm yapılmaz. Analitik verisi Google'ın yurt dışı sunucularında işlenir; KVKK aydınlatma metni ve yurt dışı aktarım için mali müşavir/hukukçu teyidi önerilir.
