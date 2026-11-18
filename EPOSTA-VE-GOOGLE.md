# E-posta ve Google Kurulumu — Al Lulu Home

Sıra önem derecesine göredir. ✅ = hazır, 👤 = sizin yapmanız gereken (giriş/parola gerektiği için).

## Durum özeti (18.11.2026)

| Konu | Durum |
|---|---|
| Alan adının e-postası Google'a yönleniyor (MX) | ✅ Cloudflare'de doğru |
| SPF kaydı | ✅ `v=spf1 include:_spf.google.com ~all` |
| Google alan adı doğrulaması | ✅ TXT kaydı var |
| **DKIM imzası** | ✅ DNS'te yayında (seçici `alluluhome.com`); Google'da "Kimlik doğrulamayı başlat" basılmalı |
| **DMARC kaydı** | ✅ yayında (`p=none`); 2–4 hafta sonra `p=quarantine` |
| Sipariş e-posta şablonları + gönderim kodu | ✅ hazır, SMTP bilgisi girilince çalışır (Adım 3) |
| Google arama ikonu (favicon) | ✅ 48 ve 192 piksel eklendi |

## Hangi e-posta ne işe yarıyor?

Workspace'te **tek gerçek hesap var: info@alluluhome.com**. musteri@ ve halime.karsu@ onun takma adı (alias); takma adla giriş yapılamaz, gelen her şey info@ kutusuna düşer.

| Adres | Görevi |
|---|---|
| **info@alluluhome.com** | Giriş yapılan hesap; site e-postaları bu hesabın uygulama şifresiyle gönderilir. Müşteri "Yanıtla"ya basınca cevap buraya gelir |
| **musteri@alluluhome.com** (takma ad) | Müşterinin gördüğü **gönderen** ("Al Lulu Home <musteri@…>") |
| **Yeni sipariş bildirimi** | info@ **dışında** bir kutu (ör. kişisel Gmail). Gmail, bir hesabın kendi takma adına gönderdiği e-postayı gelen kutusuna koymaz; halime.karsu@'ya gönderilirse bildirimi görmezsiniz |

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
| `EPOSTA_YANIT` | `info@alluluhome.com` |
| `SIPARIS_BILDIRIM_EPOSTA` | info@ dışında bakılan bir adres (ör. kişisel Gmail) |

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
6. **Google Analytics (GA4):** KVKK gereği çerez onay penceresi olmadan eklenmemeli. İsterseniz onay penceresiyle birlikte ekleriz (sonraki iş).
