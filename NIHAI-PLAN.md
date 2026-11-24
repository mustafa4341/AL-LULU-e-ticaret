# Al Lulu Home — Nihai Plan (v3 · 17 Kasım 2026)

## v3 güncellemesi: yönetim paneli ve Trendyol/Amazon mantığı

- **Yönetim paneli (/yonetim):** Ürün, fiyat, stok, görsel, indirim, sepette indirim, set, kategori, sipariş ve site ayarları panelden yönetiliyor. Değişiklikler sitede anında görünüyor. Kullanımı README.md dosyasında.
- **İletişim:** WhatsApp destek hattı ve mağaza e-postası (site ayarlarındaki adres). Header'da, mobil alt menüde, masaüstünde yüzen butonda, ürün sayfasında ("Bu ürünle ilgili sorunuz mu var?"), ödeme sayfasında ve footer'da görünüyor.
- **Tek menü:** Hamburger menü ve mobildeki kategori şeridi kaldırıldı. Mobilde kategoriler alt menüden (Ana Sayfa · Kategoriler · Sepetim · WhatsApp), masaüstünde başlığın altından açılıyor.
- **Renkler:** Sepete Ekle sarı-altın, Hemen Al turuncu, indirim kırmızı, kazanç ve kargo bedava yeşil; sayfa zemini açık gri, kartlar beyaz.
- **Büyüteç:** Masaüstünde fareyle üzerine gelince yakınlaştırma; dokununca tam ekran, iki parmakla yakınlaştırma ve çift dokunma.
- **Animasyonlar:** Sepete uçan ürün, sepet ikonunun sallanması, kaydırınca beliren kartlar, damga girişi, buton parıltısı, hero süzülmesi. Hareket azaltma ayarı açık kullanıcılarda kapanıyor.
- **"Üyelik gerekmez" yazıları kaldırıldı.** Sipariş bilgisi SMS ile gidiyor (e-posta isteğe bağlı); sipariş takip sayfası "sipariş no + telefon" ile çalışıyor.
- **"14.000'den 13.000'e" isteği:** Eski fiyat artık fiyat geçmişinden otomatik hesaplanıyor. Ürün 30 gün boyunca gerçekten 14.000 TL'den satılırsa, 13.000'e düşürüldüğünde üstü çizili fiyat ve "Son 30 günün en düşük fiyatı" kendiliğinden çıkıyor. Kısa süreli yapay yükseltme ve 30 günden yeni ürünler için indirim gösterilmiyor (birim testleriyle doğrulandı).
- **"Çok satan" etiketi:** Gerçek satışlardan otomatik veriliyor; elle yazılmıyor.
- **Sipariş akışı:** Sunucu fiyatı ve stoğu yeniden hesaplıyor, siparişi kaydediyor; "Ödendi" durumunda stok düşüyor. Ödeme kuruluşu bağlanınca kart adımı eklenecek.
- **Kalanlar:** Ödeme kuruluşu, SMS sağlayıcısı, SMTP ayarı, barındırma (Node + kalıcı disk ya da Supabase), yüksek çözünürlüklü fotoğraflar, gerçek ürün listesi, hukuk metinleri.

---

## v2 güncellemesi: tek üründen çok kategorili mağazaya

- **Marka:** Al Lulu Home. Logo amblem + yazı olarak ikiye ayrıldı; renkler logodaki altın ve siyahtan türetildi.
- **Kapsam:** Ev ve mutfak gereçleri mağazası. Kategoriler, setler/kombinasyonlar, öne çıkanlar. Vitaquick amiral ürün olarak ana sayfada ve menünün en üstünde.
- **Garanti:** 2 yıl ✅, orijinal ürün ✅ (sahip teyidi).
- **Altyapı:** Astro (statik, hızlı, SEO dostu). Bütün içerik `src/data/katalog.ts` ve `src/data/site.ts` dosyalarından yönetiliyor; hatalı veri derlemeyi durduruyor. Ayrıntılar `README.md` dosyasında.
- **Üyeliksiz sipariş:** Sepet tarayıcıda tutuluyor, ödeme tek sayfa.
- **"14.000'den 13.000'e düştü" isteği:** Altyapıda var (`indirim.oncekiFiyat`), ama Vitaquick için **kapalı**. Ürün bu sitede hiç 14.000 TL'ye satılmadığı için bu gösterim haksız ticari uygulama sayılır. Bunun yerine gerçek dikkat çekiciler eklendi: set indirimi (gerçek kazanç), canlı "bugün kargoda" sayacı, ücretsiz kargo ilerleme çubuğu, sepette "bununla iyi gider" önerisi, hediye alanı, taksit satırı.
- **Örnek ürünler:** Buhar aparatı, tava, saklama seti ve spatula `taslak` olarak eklendi. Yalnızca `npm run dev` ile görünür, canlıda gizli. Gerçek ürünlerle değiştirilecek.

---

Ürün: **Fissler Vitaquick® Premium Düdüklü Tencere 6 L** (22 cm)
Satış fiyatı: **13.000 TL** (vergiler dahil)
Site (v1): tek ürünlü, mobil öncelikli, çok hızlı D2C mağaza.

---

## 0. Ürün gerçekleri

| Bilgi | Durum | Kaynak / not |
|---|---|---|
| 6 L, Ø 22 cm | ✅ Doğrulandı | Perakendeci listeleri, Fissler |
| 2 pişirme kademesi (hassas / hızlı) | ✅ Doğrulandı | fissler.com (US ürün sayfası) |
| İndüksiyon dahil tüm ocaklara uygun | ✅ Doğrulandı | fissler.com |
| Almanya'da üretim, 18/10 paslanmaz çelik | ✅ Doğrulandı | fissler.com |
| Model kodu 602-410-06-000/0 (buhar aparatsız) | ⚠️ Faturayla eşleştir | Buhar aparatlı set: 602-410-06-070/0 |
| Garanti süresi | ✅ 2 yıl | Sahip teyidi (garantiyi veren firma adı hâlâ eksik) |
| Orijinal ürün | ✅ | Sahip teyidi |
| Buhar aparatı kutuya dahil mi? | ❌ Teyit edilmedi | Gönderilen 4. fotoğrafta aparat var; şimdilik yalnızca set görselinde kullanıldı |
| Bulaşık makinesi (gövde / kapak) | ❌ Teyit edilmedi | Kullanım kılavuzundan al |
| Güvenlik mekanizmalarının tam listesi | ❌ Teyit edilmedi | Kullanım kılavuzundan al |

> Sitede teyit edilmemiş her cümle `data-verify` ile işaretli. Adres çubuğuna `?dev` eklersen (ör. `index.html?dev`) bu cümleler sarı kesik çizgiyle çerçevelenir ve üzerine gelince ne doğrulanacağı yazar.

---

## 1. Stratejiyi çürütme denemesi

Her madde: **iddia → itiraz → karar**.

### 1.1 "En ucuz olmaya çalışmayın, değeri anlatın" — *büyük ölçüde çürüdü*
- **İtiraz:** Aynı ürün kodu büyük mağazalarda zaten satılıyor. Kasım 2026 aramasında bulunan fiyatlar (tarihleri belirsiz olabilir): Amazon ~13.971 TL, Hepsiburada ~13.999 TL, Teknosa 16.999 TL, idefix 18.000 TL. Müşteri iki ayrı karar veriyor: **(a) Vitaquick mi?** ve **(b) Nereden?** Strateji yalnızca (a)'yı çözüyor. (a)'yı Fissler ve pazaryerleri zaten anlatıyor. Al Lulu'nun kazanması gereken karar **(b)**. Google Alışveriş'te yan yana çıktığında belirleyici olan fiyat, güven ve teslimat süresi olur.
- **Karar:** İlk ekran "neden Al Lulu'dan?" sorusunu cevaplar: net fiyat + teslimat tarihi + orijinallik kanıtı + gerçek insan desteği. Rakip adı ya da fiyatı yazılmaz (karşılaştırmalı reklam riski). Fiyat zaten piyasanın altında, bunu müşteri kendi kontrol eder.

### 1.2 "Ana sayfa satış sunumu, ürün sayfası kanıt alanı" — *çürüdü*
- **İtiraz:** Tek ürün için iki sayfa, fazladan bir tık demek. Model kodunu aratarak gelen kullanıcı hikâye değil fiyat, teslimat ve buton ister.
- **Karar:** **Tek sayfa.** İlk ekran tam bir satın alma kutusu (ad, fiyat, taksit, teslimat tarihi, adet, CTA). Hikâye ve kanıtlar aşağıda, isteyen okur.

### 1.3 Hero: "Mutfağınızda her gün kullanacağınız kalite" — *çürüdü*
- **İtiraz:** Her tencere markası bu cümleyi kurabilir. Ürünün adını saklıyor.
- **Karar:** H1 = ürün adı. Duygusal cümle yalnızca kısa alt başlıkta.

### 1.4 13.000 TL piyasa altı = avantaj — *kısmen çürüdü*
- **İtiraz:** Bilinmeyen bir sitede piyasa altı fiyat "sahte mi, paralel ithalat mı, garantisi var mı?" şüphesi yaratır. Ayrıca distribütörün fiyat politikası ve garantinin geçerliliği belirsiz.
- **Karar:** Lansmandan önce **yazılı olarak** netleşmeli: tedarik kaynağı, fatura zinciri, garanti belgesini kimin verdiği, Türkiye servisinin bu ürüne bakıp bakmadığı. Paralel ithalatsa "Türkiye servis" vaadi siteden çıkar. Bu cevap, sitenin en kritik güven cümlesini belirleyecek.

### 1.5 Taksit "yan bilgi" — *çürüdü*
- **İtiraz:** Türkiye'de 13.000 TL'lik alımda taksit ana karar unsurlarından biri. Pazaryerleri "peşin fiyatına 6 taksit" gösteriyor.
- **Karar:** Satın alma kutusunda net bir taksit satırı olacak. Ödeme kuruluşu seçiminde ana kriter taksit komisyonu olacak, bu komisyon da marja eklenecek. Kesin taksit metni sözleşmeden sonra yazılacak.

### 1.6 "Shopify veya Next.js" — *kısmen çürüdü*
- **İtiraz:** Türkiye'de e-Arşiv, kargo entegrasyonu, iyzico/PayTR ve ETBİS süreçleri için yerli altyapılar (ikas, Ticimax, IdeaSoft, T-Soft) operasyonu hızlandırır. Öte yandan tek ürün, özel tasarım ve hız için hafif, statik bir ön yüz rakipsiz.
- **Karar:** Ön yüzü biz yazıyoruz: framework yok, statik dosyalar, çok hızlı. Ödeme için iyzico veya PayTR'nin hazır ödeme formu ve küçük bir sunucu fonksiyonu (ör. Vercel) kullanılacak. Fatura ve kargo, günde birkaç siparişte yarı manuel yürür; hacim artınca entegre edilir. Operasyon yükü istenmezse tasarım ikas temasına taşınabilir.

### 1.7 8 haftalık yol haritası — *çürüdü*
- **İtiraz:** Tek ürün için uzun. Kritik yolu tasarım değil, **ödeme kuruluşu başvurusu ve şirket evrakı** belirliyor.
- **Karar:** Ödeme başvurusu hemen başlasın, diğer işler paralel yürüsün. Hedef: 3 hafta.

### 1.8 12 kare çekim + video lansman şartı — *çürüdü*
- **İtiraz:** Maliyetli ve lansmanı geciktiriyor. Fissler'in resmi görsellerini izinsiz kullanmak telif riski taşır.
- **Karar:** Lansman için **6 kare** yeterli: beyaz fon, 45°, kapak açık/iç, taban, ocak üzerinde ölçek, kutu + model etiketi. İyi gün ışığında telefonla da çekilebilir. Video lansmandan sonra gelir.

### 1.9 16 GA4 olayı + deney backlog'u — *çürüdü*
- **İtiraz:** Trafik yokken ölçülecek bir şey de yok. Çerez onayı verilerin bir kısmını zaten görünmez kılacak.
- **Karar:** 6 temel olay yeterli: `view_item`, `add_to_cart`, `begin_checkout`, `add_payment_info`, `purchase`, `faq_open`. İlk ~100 sipariş gelmeden A/B testi yapılmayacak. Onun yerine 6 kişilik kullanıcı testi (strateji bu konuda haklı).

### 1.10 Çerez banner'ı — *koşullu*
- **İtiraz:** Zorunlu olmayan çerez kullanılmıyorsa banner'a da gerek yok. Mobilde ilk ekranın üçte birini kaplayan bir banner dönüşümü düşürür.
- **Karar:** Lansmanda analitik veya reklam pikseli yoksa banner da yok. Eklendiği gün eşdeğer "Kabul / Reddet / Tercihler" seçenekleriyle gelir.

### 1.11 "Güvenli ödeme • Faturalı • Kolay iade" şeridi — *zayıf*
- **İtiraz:** Bunu herkes yazıyor, ayırt edici değil.
- **Karar:** Somut ve kontrol edilebilir vaatler kullanılacak: "14:00'e kadar verilen siparişler aynı gün kargoda", "14 gün içinde iade", footer'da açık ticari unvan ve adres, gerçek telefon. Küçük satıcının pazaryerine karşı tek gerçek avantajı insan teması. Bu yüzden **WhatsApp + telefon** desteği olacak (tek kanal olarak değil, ek kanal olarak).

### 1.12 "Sepete Ekle + Hızlı Al" testi — *sadeleşti*
- **Karar:** Test edilmeyecek, ikisi birlikte kullanılacak. **Sepete Ekle** sepet panelini hemen açar ve "Ödemeye Geç" butonu başparmak bölgesinde durur (mobilde alttan açılan panel). **Hemen Al** doğrudan ödemeye götürür. Kasa tek sayfa ve üyeliksiz.

### 1.13 Kapıda ödeme — *stratejide eksik*
- **Karar:** Lansmanda olmayacak (13.000 TL'de ret/iade ve nakit riski yüksek). Ödeme kuruluşunun alıcı koruma programı varsa görünür yapılacak, bu da teyit edilecek.

### 1.14 Hukuk tarihleri (1 Ağu 2026 indirim kuralı, 17 Ağu 2026 rehber)
- Bu tarihleri ben doğrulamadım. Sitede üstü çizili fiyat ya da indirim kullanmadığımız için bizi doğrudan etkilemiyor. Metinleri yine de hukukçu kontrol etmeli.

### 1.15 Hayatta kalanlar (strateji haklı)
Sahte yorum, sayaç ya da stok oyunu yok. Stereotip yok. Doğrulanmamış iddia yok. Mobil sticky CTA. Ölçek görselleri. Core Web Vitals hedefleri. 14 gün cayma hakkı (tencereye "hijyen istisnası" uygulanmayacak). Kullanıcı testi > A/B.

---

## 2. Sayfa mimarisi (uygulandı)

1. Üst şerit: kargo / teslimat vaadi
2. Header: logo · menü (masaüstü) · sepet
3. **Satın alma kutusu:** galeri (mobilde kaydırmalı) · ürün adı · fiyat · taksit satırı · teslimat tarihi · adet · Sepete Ekle / Hemen Al · 3 güven maddesi
4. Hızlı bilgi şeridi: 6 L/22 cm · 2 kademe · indüksiyon · Almanya
5. Neden Vitaquick? (3 fayda)
6. Detaylarda kalite (etkileşimli işaretli görsel)
7. 6 litre ne kadar? (ölçek)
8. Neden Al Lulu? (orijinallik, kargo, iade, insan desteği)
9. Yorumlar (dürüst boş durum)
10. SSS
11. Son CTA
12. Footer: satıcı kimliği, yasal linkler
13. Mobil sticky bar (satın alma kutusu geçilince açılır, son CTA'da kaybolur)
14. Sepet paneli (mobilde alttan, masaüstünde sağdan)
15. `odeme.html`: tek sayfa kasa, otomatik doldurma, ön bilgilendirme penceresi
16. `bilgi.html`: satıcı, teslimat, iade, garanti, sözleşmeler, KVKK (taslak)

### Mobil sipariş akışı: 3 dokunuş + form
`Sepete Ekle` → `Ödemeye Geç` → form (tarayıcının otomatik doldurmasıyla saniyeler) → `Ödemeye Geç` → 3D Secure

---

## 3. Senden gereken bilgiler (lansman öncesi)

- [x] Logo dosyası (alındı; SVG versiyonu varsa daha keskin olur)
- [ ] Yüksek çözünürlüklü ürün fotoğrafları (eldekiler 360×480; tedarikçiden resmi görsel paketi istenmeli)
- [x] İlk 13 yeni ürün fiyat ve görselleriyle yayımlandı. Barkod, garanti ve ek görseller yerel kontrol listesinde izleniyor.
- [ ] Tam model kodu (fatura üzerindeki)
- [ ] Tedarik kaynağı, garanti belgesini veren firma, Türkiye servis durumu
- [ ] Ticari unvan, açık adres, MERSİS/vergi no, telefon, e-posta, KEP (varsa)
- [ ] ETBİS kaydı
- [ ] Ödeme kuruluşu (iyzico / PayTR), taksit tablosu ve komisyon
- [ ] Kargo firması, kesim saati (14:00 varsayıldı), ücretsiz kargo var mı?
- [ ] İade kargosunu kim ödüyor?
- [ ] 6 ürün fotoğrafı
- [ ] Mesafeli satış ve KVKK metinleri: hukukçu onayı
- [ ] Fatura akışı: mali müşavir onayı

## 4. 3 haftalık yol haritası

| Hafta | İş |
|---|---|
| 1 | Ödeme kuruluşu başvurusu · ETBİS · tedarik/garanti yazılı teyidi · fotoğraf çekimi · ön yüz (✅ ilk sürüm hazır) |
| 2 | Ödeme sandbox entegrasyonu (3D Secure, başarısız ödeme, çift tıklama, tekrar eden webhook) · sipariş e-postası · hukuk metinleri · gerçek cihaz testi · 6 kişilik kullanıcı testi |
| 3 | Canlı ödeme · alan adı + SSL · soft launch · ilk 20–50 siparişin incelenmesi |

## Kaynaklar (Kasım 2026 araması)
- Fissler US — Vitaquick Premium 6.3 qt: https://www.fissler.com/us/p/vitaquick-premium-pressure-cooker-6-3-quart
- Fissler Global — Vitaquick Premium 6 L buhar aparatlı: https://preview-global.fissler.com/en/products/vitaquick-premium-schnellkochtopf-6-liter-mit-daempfeinsatz
- Model kodu 602-410-06-000/0: https://knivesandtools.com/en/pt/-fissler-vitaquick-premium-602-410-06-000-0-pressure-cooker-22-cm-60l.htm
- Türkiye fiyatları: https://www.cimri.com/marka/fissler · https://www.teknosa.com/fissler-vitaquick-premium-6-l-duduklu-tencere-p-790682819 · https://www.idefix.com/fissler-vitaquick-premium-6-lt-duduklu-tencere-p-2026853
