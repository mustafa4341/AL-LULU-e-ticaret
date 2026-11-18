# Al Lulu Home — Yönetim Paneli Rehberi ve Yapılan Tüm Geliştirmeler (`YONETIM.md`)

Bu doküman, **Al Lulu Home** yönetim panelinde (`/yonetim`) yapılan tüm geliştirmeleri, eklenen özellikleri, hangi alanın sitede nereye etki ettiğini ve panelin nasıl kullanıldığını **tek tek ve eksiksiz** olarak açıklar.

---

## 1. Genel Bakış: Yönetim Panelinde Neler Değişti?

1. **Sol Menü ve Üst Bar Yenilendi (`src/layouts/Yonetim.astro`):**
   - Sol menüdeki her sekmenin altına ne işe yaradığını anlatan açıklamalar eklendi (*Genel Bakış*, *Sipariş & Satış*, *Ürünler & Stok*, *Setler*, *Kategoriler*, *Site Düzeni*).
   - **Canlı Uyarı Rozetleri:** Bekleyen/kargolanacak sipariş sayısı **Sipariş & Satış** sekmesinde turuncu rozetle; kritik stoktaki (≤ 3 adet) ürün sayısı **Ürünler & Stok** sekmesinde kırmızı rozetle anlık gösterilir.
   - **Her Sayfada Tek Adımda Tadilat Düğmesi:** Üst barda sitenin anlık durumu (`🟢 Yayında` veya `🟠 Tadilatta`) görünür ve tek tıkla **🛠️ Tadilata Al** / **🚀 Yayına Aç** işlemi yapılabilir.

---

## 2. Birebir Canlı Vitrin Önizlemesi ve "Nereye Ne Yazdığımın Önizlemesi" (`/yonetim/urunler/[id]`)

Ürün ekleme (`/yonetim/urunler/yeni`) ve ürün düzenleme (`/yonetim/urunler/[id]`) ekranı **iki sütunlu canlı stüdyo** yapısına kavuşturuldu:

### A. Otomatik Odaklanma, Kaydırma ve Sarı Konum Etiketi
- Sol taraftaki formda **herhangi bir kutuya tıkladığınızda veya yazı yazdığınızda**:
  1. Sağdaki canlı önizleme paneli **otomatik olarak o bilginin bulunduğu yere kayar**.
  2. İlgili alan **altın sarısı çerçeveyle (`is-odak`)** vurgulanır.
  3. Tam o alanın üstünde **`📍 Kampanya Etiketi tam olarak burada görünür`** gibi yüzen bir konum etiketi ve üst bilgi kutusunda detaylı açıklama çıkar.
- Sağ üstteki **`⤢ Genişlet`** butonu ile önizleme sütununu istediğiniz zaman genişletebilirsiniz.

### B. Formdaki Her Alan Sitede Tam Olarak Nereye Yazılır? (Tek Tek Liste)

1. **Yayın Durumu (`Yayında` / `Taslak` / `Gizli`):**
   - **Yayında:** Ürün sitede tüm müşterilere açılır ve satın alınabilir.
   - **Taslak:** Müşteriler ürünü görmez. Yalnızca siz yönetici girişi yapmışken sitede sarı **`Örnek ürün · canlıda görünmez`** ve kartta **`Örnek`** etiketiyle görürsünüz.
   - **Gizli:** Ürün vitrinde, kategorilerde ve menülerde hiç görünmez.
2. **Marka (`marka`):**
   - **Vitrin Kartında:** Ürün adının en başında kalın harflerle yazar (ör. **Fissler**).
   - **Ürün Sayfasında:** Ana başlığın hemen üstünde altın sarısı büyük harflerle (`FISSLER · 6 LİTRE`) görünür.
   - **Sepet ve Sayfa Sonu Özetinde:** Kısa adın başında yer alır.
3. **Kısa Ad (`kisaAd`):**
   - Kısa ad kutusuna tıkladığınızda sağdaki önizlemede **kullanıldığı 3 yer birden** canlı olarak işaretlenir ve güncellenir:
     1. **Sayfa Üstü Konum (Kırıntı) Çubuğu:** `Ana sayfa › Düdüklü Tencereler › Vitaquick® Premium 6 L`
     2. **Sepet Çekmecesi Satırı:** Müşteri ürünü sepete eklediğinde sepette `Fissler Vitaquick® Premium 6 L` olarak görünür.
     3. **Sayfa Sonu "Özetle" Kutusu:** Sayfanın en altındaki hızlı satın alma özetinde başlık olarak yazar.
4. **Tam Ürün Adı (`ad`):**
   - Ürün detay sayfasının **en büyük ana başlığıdır (`H1`)** ve vitrin kartlarında markanın yanında yazar.
5. **Otomatik Sayfa Adresi (`/urun/...`):**
   - Sizin elle adres veya kod girmenize **gerek yoktur**.
   - Yazdığınız **Marka** ve **Ürün Adı** bilgisinden Türkçe karakterler dönüştürülerek (`/urun/fissler-vitaquick-premium-6-l`) otomatik oluşturulur ve yeşil bilgi kutusunda canlı gösterilir.
6. **Kategoriler (`kategoriler`):**
   - Seçilen ilk kategori ürünün ana kategorisi olur; sayfa üstü konum çubuğunda (`Ana sayfa › Düdüklü Tencereler`) yazar ve ürün seçilen tüm kategori sayfalarında listelenir.
7. **Kısa Açıklama / Özet (`ozet`):**
   - Ürün sayfasında ana başlığın altında ve Google/WhatsApp bağlantı paylaşımlarında özet metin olarak görünür.
8. **Satış Fiyatı (`fiyat`):**
   - Müşterinin ödeyeceği KDV dahil fiyattır.
   - Fiyat, ayarlarda belirlenen **Ücretsiz Kargo Sınırı** (ör. `1.000 TL`) ve üzerindeyse:
     - Ürün sayfası en üst duyuru şeridinde otomatik **`Bu üründe kargo bedava`** yazar,
     - Fiyat kutusunun altında yeşil **`Kargo Bedava`** ibaresi çıkar,
     - Ürün kartının fotoğrafının altında koyu **`🚚 Kargo Bedava`** şeridi görünür.
9. **Sepette Ek İndirim % (`sepetteIndirim`):**
   - `0`’dan büyük bir oran (ör. `10`) girdiğiniz anda hem ürün sayfasında hem ürün kartında yeşil **`Sepette %10 İndirim → Sepette X TL`** kutusu açılır ve sepetteki fiyattan otomatik düşülür.
10. **Fiyat Düşüşünü Üstü Çizili İndirim Olarak Göster (`kampanya`) & Önceki Fiyat (`onceki_fiyat`):**
    - Kutucuğu işaretleyip **Önceki Fiyat (Üstü Çizili Eski Fiyat)** alanına satış fiyatından yüksek bir tutar girdiğinizde (ör. Önceki Fiyat: `13.999 TL`, Satış Fiyatı: `12.999 TL`):
      - Fotoğrafın sağ üst köşesinde kırmızı **`%7 İndirim`** çipi çıkar,
      - Fiyat kutusunun üstünde **`Son 30 Günün En Düşük Fiyatı`** etiketi görünür,
      - Eski fiyat üstü çizili (`13.999 TL`), yeni fiyat bordo/kırmızı (`12.999 TL`) ve yanında **`%7 İndirim`** rozeti çıkar,
      - Altında yeşil **`1.000 TL daha az ödüyorsunuz`** satırı yer alır.
11. **Kampanya Etiketi (`kampanya_etiket`):**
    - Örn. `Kasım Fırsatı` veya `Özel Kampanya Fiyatı` yazdığınızda, hem **ürün sayfasındaki fiyat kutusunun hemen içinde** hem de **vitrin kartında** kırmızı kalın vurgu yazısı (`.indirim-etiket`) olarak görünür.
12. **Fırsat Ürünü (`firsat`), Fırsat Etiketi (`firsat_etiket`) ve Bitiş Tarihi (`firsat_bitis`):**
    - İşaretlediğiniz anda ana sitedeki `<FirsatSayaci />` bileşeni birebir aktif olur:
      - **Ürün Sayfasında:** Başlığın üstünde kırmızı yıldırım ikonlu fırsat rozeti ve bitiş tarihi seçildiyse **saniyesi saniyesine çalışan canlı geri sayım sayacı (`04:12:38`)** çıkar.
      - **Vitrin Kartında:** Kartın çerçevesi pembe fırsat rengine döner, fotoğrafın sol üstünde yuvarlak turuncu fırsat damgası (`En Çok Satan` kapalıysa) ve ürün adının altında kırmızı yıldırım ikonlu fırsat sayacı görünür.
      - **Ana Sayfada:** Ürün otomatik olarak ana sayfadaki **"Fırsat Ürünleri — Kaçırmayın"** vitrinine eklenir.
13. **Mevcut Stok Adedi (`stok`):**
    - **4 ve üzeri:** Yeşil nokta ile `Stokta · hemen gönderime hazır` yazar ve satın alma butonları açıktır.
    - **1, 2 veya 3 adet (Kritik Stok):** Ürün sayfasında kırmızı yanıp sönen `Stokta son X adet` uyarısı ve ürün kartında yuvarlak `Son X Adet` damgası çıkar.
    - **0 adet (Tükendi):** `Şimdi Al / Sepete Ekle` butonları gizlenir, kartta `Tükendi` yazar ve ürün sayfasında `Şu an stokta yok` uyarısıyla birlikte yeşil **`Stoğa girince haber ver (WhatsApp)`** butonu açılır.
14. **Model / Stok Kodu (`sku`):**
    - Ürün sayfasında WhatsApp soru kutusunun hemen altında `Model kodu: ...` olarak ve sipariş/fatura kayıtlarında görünür.
15. **Görseller (`yeni_gorsel`, `gorsel_sira`, `gorsel_alt`, `gorsel_sil`):**
    - Bilgisayarınızdan veya telefonunuzdan yeni fotoğraf seçtiğiniz anda, **daha kaydetmeden** sağdaki ürün galerisinde ve vitrin kartında canlı olarak görünür. Birden fazla fotoğraf varsa küçük galeri resimleri (`galeri__kucukler`) otomatik oluşur.
16. **Güvence Rozetleri (`rozetler`):**
    - Her satıra yazdığınız ifade (ör. `2 Yıl Garanti`, `Orijinal Ürün`), ürün sayfasında başlığın altında yeşil `✓` işaretiyle, ürün kartında ise kalkan ikonuyla görünür.
17. **Garanti Süresi (`garanti`):**
    - Ürün sayfasının altındaki güvence listesinde `2 yıl garanti · Garanti koşulları` ve sayfa sonu özet kutusunda görünür.
18. **Yanında Hediye (`hediye`):**
    - Doldurulduğunda teslimat kutusunun altında altın sarısı hediye ikonuyla özel bir kutu olarak açılır.
19. **"En Çok Satan" Damgası (`cokSatan`):**
    - Açıldığında hem ürün sayfası fotoğrafının hem de vitrin kartının sol üst köşesine birebir ana sitedeki 3 boyutlu yuvarlak turuncu **`EN ÇOK SATAN`** damgasını yerleştirir.
20. **Öne Çıkan Bilgiler (`bilgi_ikon` + `bilgi_metin`):**
    - Fiyat kutusunun hemen altında renkli ikon kutularıyla (`saat` mavi, `ates` turuncu, `gosterge` mor, `konum` kehribar, `kalkan` yeşil, `tencere` turkuaz) listelenir.
    - Metin içine `|` koyarsanız (ör. `Mutfakta daha az bekleyin|Normal tencereye göre %70 daha kısa süre*`), üst satır kalın başlık, alt satır açıklama olur. Metinde `*` varsa altında dipnot açılır.
21. **Fayda Bölümleri (`fayda_baslik`, `fayda_metin`, `fayda_ikon`, `fayda_kaynak`):**
    - Ürün sayfasının orta kısmındaki *"Neden bu ürün? — Daha az bekleme. Daha çok sofra keyfi."* bölümünde ikonlu kartlar olarak görünür. İlk 3 fayda başlığı sayfa sonundaki **Özetle** kutusuna da otomatik eklenir.
22. **Pişirme Süreleri (`pis_yemek`, `pis_sure`, `pis_kademe`, `pis_miktar`, `pisirmeNotu`):**
    - Koyu kahve *"Bugün ne pişirmek istersiniz?"* panelini oluşturur. İlk 4 yemek altın çerçeveli (`is-vurgu`) görünür ve önizlemede kartlara tıkladığınızda kademe/miktar detayı tıpkı ana sitedeki gibi açılır.
23. **Teknik Özellikler (`teknik_etiket`, `teknik_deger`) ve Kutu İçeriği (`kutuIcerigi`):**
    - Sayfanın alt kısmında 2 sütunlu **Teknik Özellikler** tablosunu ve yeşil `✓` işaretli **Kutu İçeriği** listesini oluşturur. Teknik tabloda `Hacim` satırı varsa değeri ürün başlığının üstünde markanın yanına da (`FISSLER · 6 LİTRE`) otomatik yazılır.
24. **Sık Sorulan Sorular (`sss_soru`, `sss_cevap`):**
    - Sayfa altında açılır-kapanır akordiyon (`<details>`) olarak canlı önizlenir.

### C. "🔄 Neler Değişecek?" Sekmesi
- Kaydet butonuna basmadan önce sitede gerçekleşecek tüm etkileri (yayın durumu, görsel/kategori eksikliği uyarısı, eski fiyattan yeni fiyata geçiş, kargo bedava şeridi, stok ve set etkisi, vitrin konumu) tek bakışta kontrol listesi olarak sunar.

---

## 3. Tek Adımda Siteyi Tadilata (Bakıma) Alma Sistemi

1. **Nereden Açılır / Kapatılır?**
   - Yönetim panelinin en üst çubuğundaki **`🛠️ Tadilata Al`** / **`🚀 Yayına Aç`** düğmesinden,
   - **Genel Bakış (`/yonetim`)** sayfasının en üstündeki Site Durumu kartından,
   - **Site Düzeni (`/yonetim/ayarlar`)** sayfasındaki Tadilat Modu bölümünden,
   - Veya canlı sitede yönetici şeridindeki (`yonetici-serit`) tek tık butonundan.
2. **Tadilat Modu Açıkken Ne Olur? (`src/middleware.ts` & `src/pages/tadilat.astro`)**
   - Normal ziyaretçiler (müşteriler) siteye girdiğinde otomatik olarak şık **Al Lulu Home Bakım & Yenileme Çalışması** ekranını (`HTTP 503`) görür ve yeni sipariş gönderemez.
   - Bakım ekranında logonuz, özelleştirilebilir bakım başlığınız, açıklamanız, varsa **tahmini açılış süreniz**, **WhatsApp destek butonunuz** ve mevcut müşterilerin kargolarını sorgulayabilmesi için **Mevcut Siparişimi Takip Et** bağlantısı yer alır.
   - **Yönetici Girişi Açıkken:** Siz yönetici olduğunuz için siteyi normal şekilde gezmeye, ürün eklemeye ve fiyatları düzenlemeye devam edebilirsiniz. Müşterinin gördüğü ekranı test etmek için **"Bakım Ekranını Gör ↗"** veya **"Müşteri Gibi Gör"** bağlantısını kullanabilirsiniz.

---

## 4. Ürün Kargolandı, İptal Edildi ve Satış Takip Alanları (`/yonetim/siparisler` & `/yonetim/siparisler/[no]`)

1. **Satış ve Ciro Takip Kartları (Üst Panel):**
   - **💰 Toplam Onaylı Satış (Ciro):** Tüm zamanlar, son 30 gün ve bugünkü onaylı ciro.
   - **📦 Kargolanacak Siparişler (`Ödendi` + `Hazırlanıyor`):** Hemen kargoya verilmesi gereken siparişlerin sayısı ve tek tıkla filtrelenmesi.
   - **🚚 Kargolananlar (`Kargoda`):** Yoldaki kargolar.
   - **🎉 Teslim Edilenler (`Teslim edildi`):** Tamamlanan siparişler.
   - **⏳ Ödeme Bekleyenler (`Ödeme bekleniyor`):** Henüz stoktan düşmemiş kayıtlar.
   - **❌ İptal Edilenler (`İptal edildi`):** İptal edilen siparişler.
2. **📊 Ürün Bazlı Satış, Kargo, İptal ve Kalan Stok Raporu:**
   - Mağazadaki her üründen kaç adet onaylı satış yapıldığını, ne kadar ciro getirdiğini, kaç adedinin kargolandığını, kaç adedinin ödeme beklediğini, kaç adedinin iptal edildiğini ve güncel kalan stoğunu tek tabloda gösterir.
3. **🚚 Tek Adımda "Ürün Kargolandı" Alanı:**
   - Hem sipariş listesinde (`/yonetim/siparisler`) hem sipariş detay sayfasında (`/yonetim/siparisler/[no]`) yer alır.
   - Kargo firmasını ve **Kargo Takip Numarasını** girip **`🚚 Kargolandı İşaretle`** butonuna bastığınız anda:
     1. Sipariş durumu otomatik olarak **`Kargoda`** olur,
     2. Ürünler henüz stoktan düşülmediyse **otomatik olarak stoktan düşülür**,
     3. Müşterinin sipariş takip sayfasında **`Kargonu Takip Et`** butonu aktifleşir,
     4. Yanındaki **`📲 Kargo Bilgisini WhatsApp'tan Gönder`** butonu ile müşteriye takip numarası ve takip linki içeren hazır mesajı tek tıkla gönderebilirsiniz.
4. **❌ Tek Adımda "Sipariş İptal" Alanı:**
   - İptal nedenini/notunu (`iptalNotu`) yazıp **`❌ Siparişi İptal Et`** butonuna bastığınızda:
     1. Sipariş durumu **`İptal edildi`** olur ve iptal nedeni kaydedilir,
     2. Eğer siparişin ürünleri daha önce stoktan düşüldüyse **otomatik olarak stoğa geri eklenir**,
     3. Sipariş geçmişine tarih, saat ve iptal notuyla kayıt düşülür.
5. **Görsel 5 Aşamalı Sipariş Çubuğu ve Anlık Arama:**
   - Sipariş detayında `Ödeme Bekleniyor → Ödendi → Hazırlanıyor → Kargoda → Teslim Edildi` aşamaları görsel ilerleme çubuğuyla gösterilir.
   - Sipariş listesinde sipariş numarası, müşteri adı, telefon, il/ilçe veya ürün adına göre anında arama yapılabilir.

---

## 5. Neler Ekledim, İndirimler, Fiyat Değişimleri ve Stok Takibi (`/yonetim` & `/yonetim/urunler`)

1. **Hızlı Filtre Sekmeleri ve Arama (`/yonetim/urunler`):**
   - `Tümü`, `🟢 Yayında`, `🟡 Taslak / Örnek`, `🏷️ İndirim & Fırsat` ve `⚠️ Kritik Stok ≤3` sekmeleriyle ürünleri tek tıkla süzebilirsiniz.
2. **Satır İçi Hızlı Düzenleme:**
   - Ürün detayına girmeden liste üzerinden **Satış Fiyatı (TL)**, **Sepette % İndirim**, **Üstü Çizili İndirim Göster** onayı, **Stok Adedi** ve **Yayın Durumu** değiştirilip **`Hızlı Kaydet`** ile anında kaydedilebilir.
3. **Fiyat Değişimleri Günlüğü (Fiyat Geçmişi):**
   - Hem her ürün kartının altındaki açılır **`📈 Fiyat geçmişi`** kutusunda hem de sayfa altındaki **Tüm Fiyat Değişimleri Günlüğü** tablosunda; hangi ürünün fiyatının hangi tarihte kaç TL'den kaç TL'ye değiştiği (`📉 −1.000 TL / −%7` veya `📈 Artış`) kronolojik olarak listelenir.
4. **Stok Sağlığı Göstergeleri:**
   - Her üründe `🟢 X adet stokta`, `🟠 Kritik Stok: Son X adet` veya `🔴 Tükendi (0 adet)` rozetleri ve o ürünün satış/kargo/iptal özeti yer alır.

---

## 6. Canlı Önizlemeli Site Düzenleme (`/yonetim/ayarlar`)

1. **Canlı Ana Sayfa & Tadilat Önizlemesi:**
   - Sağ sütundaki canlı önizleme panelinde iki sekme yer alır:
     - **🏠 Ana Sayfa & Vitrin:** Üst duyuru şeridini, mağaza adını, WhatsApp numarasını, ana sayfa en üst vitrin (Hero) ürününü, başlıklarını, 3 kısa fayda maddesini, kargo kuralını ve bölüm sıralamasını siz yazarken canlı gösterir.
     - **🛠️ Tadilat Ekranı:** Bakım başlığı, açıklaması, tahmini açılış süresi ve butonların müşterilere nasıl görüneceğini canlı gösterir.
2. **↑ / ↓ Butonlarıyla Görsel Bölüm Sıralama:**
   - Ana sayfadaki bölümleri (*Öne çıkan ürün*, *Fırsat ürünleri*, *Güvence şeridi*, *Öne çıkan ürünler*, *Kategoriler*, *Setler*, *Amiral ürün hikâyesi*, *Neden biz?*, *Sık sorulan sorular*) tek tıkla açıp kapatabilir ve **↑ / ↓** ok butonlarıyla yukarı-aşağı taşıyarak sıralayabilirsiniz.
3. **Hazır Kargo Takip Şablonları:**
   - Kargo takip bağlantısı alanında **Yurtiçi Kargo**, **Aras Kargo**, **MNG / DHL**, **Sürat Kargo**, **PTT Kargo**, **HepsiJet** ve **Kolay Gelsin** butonlarından birine tıklayarak takip adresini otomatik doldurabilirsiniz.

---

## 7. Güncellenen ve Eklenen Dosyaların Özeti

| Dosya | Açıklama |
|---|---|
| `src/lib/sema.ts` | `TadilatSema` (bakım modu ayarları) ve `SiparisSema` içine `iptalNotu` alanı eklendi. |
| `src/lib/urunIslem.ts` | `fiyatUygula` (önceki fiyat desteğiyle), `siparisDurumGuncelle` (otomatik stok düşüm/iade ve bildirim), `fiyatDegisimleriListesi` ve `urunBazliSatislar` analiz fonksiyonları eklendi. |
| `src/lib/katalog.ts` | Fırsat ürünü ve kampanya etiketi hesaplamaları canlı önizleme ve vitrinle birebir uyumlu hale getirildi. |
| `src/middleware.ts` | Tadilat modu yönlendirmesi (`HTTP 503` bakım ekranı, yöneticiye tam erişim, mevcut müşteriye sipariş takip izni) eklendi. |
| `src/pages/tadilat.astro` | Müşteriler için markalı **Bakım & Yenileme Çalışması** sayfası oluşturuldu. |
| `src/pages/yonetim/tadilat.ts` | Tek adımda siteyi tadilata alma / yayına açma uç noktası oluşturuldu. |
| `src/layouts/Yonetim.astro` | Üst barda tek tıkla tadilat butonu, tadilat uyarı şeridi ve sayaç rozetli yeni sol menü eklendi. |
| `src/layouts/Base.astro` | Canlı sitedeki yönetici şeridine tadilat durumu ve tek tıkla tadilat aç/kapat butonu eklendi. |
| `src/pages/yonetim/index.astro` | Mağaza Kontrol Merkezi: site durumu kartı, 6'lı KPI özeti, son siparişlerde hızlı kargola/iptal et, katalog/stok/satış tablosu ve fiyat değişim günlüğü eklendi. |
| `src/pages/yonetim/urunler/index.astro` | Filtre sekmeleri, anlık arama, satır içi hızlı fiyat/indirim/stok düzenleme ve fiyat geçmişi günlüğü eklendi. |
| `src/pages/yonetim/urunler/[id].astro` | Ana sitedeki ürün sayfasının ve vitrin kartının **birebir canlı önizlemesi**, otomatik kaydırma, sarı konum etiketleri, otomatik URL üretimi ve "Neler Değişecek?" etki analizi eklendi. |
| `src/pages/yonetim/siparisler/index.astro` | Satış KPI kartları, ürün bazlı satış/kargo/iptal raporu, sipariş kartlarında **"Ürün Kargolandı"** ve **"Sipariş İptal"** hızlı işlem alanları eklendi. |
| `src/pages/yonetim/siparisler/[no].astro` | 5 aşamalı görsel sipariş çubuğu, özel kargolama kartı (WhatsApp hazır mesajlı) ve özel iptal/stok iade kartı eklendi. |
| `src/pages/yonetim/ayarlar.astro` | Canlı ana sayfa ve tadilat önizlemeli site düzenleme ekranı, ↑/↓ bölüm sıralayıcı ve hazır kargo şablonları eklendi. |
| `src/scripts/yonetim.ts` | Birebir canlı önizleme motoru, otomatik kaydırma ve odak etiketleme, canlı geri sayım sayacı, bölüm sıralama ve anlık arama kodlandı. |
| `src/styles/yonetim.css` | Tüm yeni yönetim paneli bileşenleri, iki sütunlu canlı önizleme düzeni ve yüzen konum etiketleri tasarlandı. |

## 8. Siparişler, Belgeler ve Finans (18.11.2026 güncellemesi)

**Sabah rutini:** Genel Bakış > "Bugün yapılacaklar" listesi; hazırlanacak, kargoya verilecek, belgesi eksik siparişleri ve hata/çelişki uyarılarını sayılarıyla gösterir. Satıra tıklayınca ilgili liste açılır.

**Siparişler:** Üstteki sekmeler: İşlem bekleyen, Hazırlanacak, Kargoya verilecek, Kargoda, Belgesi eksik, Ödeme bekleyen, Teslim edilen, İptal/İade, Tümü. Her satırda Ödeme, Kargo ve Belge durumu ayrı renkli etiketle görünür (yeşil tamam, turuncu bekliyor, kırmızı sorun). Kutucukla sipariş seçince altta toplu işlem çubuğu çıkar: PDF/ZIP, A4 veya 10×15 hazırlık etiketi, ürün toplama listesi.

**Barkod:** Panelin herhangi bir sayfasında barkod okuyucuyla sipariş barkodunu okutmak siparişi açar. "Numarayla / barkodla aç" penceresi elle yazmak içindir; "AL" ve tire yazılmasa da bulur.

**Sipariş detayı:** Üstte adım çizgisi (Sipariş alındı → Ödeme → Hazırlanıyor → Kargoda → Teslim). Altında tek bir ana işlem düğmesi vardır; diğer işlemler sağ üstteki ••• menüsündedir. İptal edilmiş siparişte kargo takip numarası varsa kırmızı uyarı çıkar.

**Belgeler:** Sipariş detayında "Belge Oluştur" penceresinde tür seçilir, sağda canlı önizleme görünür. Her belgeye yıl ve türe göre sıra numarası verilir (SO sipariş özeti, SF sipariş fişi, PL paketleme listesi, IF iade formu; ör. SO-2026-00001). Aynı belge tekrar istenirse yenisi açılmaz, aynı numaralı belge iner. "Yeni sürüm" seçilirse eskisi "iptal" olarak arşivde kalır. Bu belgeler resmî fatura değildir; e-Fatura/e-Arşiv ve kargo firmasının taşıma etiketi için entegrasyon gerekir.

**Belge ayarları:** Finans & Belgeler > Belgeler > "Belge ayarları": logo, satıcı bilgileri, barkod, fişte fiyat, belge notları ve numara önekleri (canlı önizlemeli). Satıcı unvanı, adresi ve vergi bilgisi "Ayarlar ve yasal bilgiler" sayfasından gelir; doldurulunca belgelerde görünür.

**Finans:** Özet sekmesinde ay seçilir; "Onaylı satış − iade − gider = Kalan" hesabı ve son 6 ayın tablosu görünür. Ürün alış maliyeti girilmemişse kalan tutar kesin değildir ve uyarı çıkar. Giderler ay ay listelenir; ••• menüsünden düzenlenir veya onayla silinir (fiş eki arşivde kalır). Raporlar sekmesinden muhasebeci için tek Excel (aylık özet, satışlar, iade/iptal, giderler, Trendyol, belge listesi) ve belge + fiş arşivi (ZIP) indirilir. Satışlar ödeme tarihine, iadeler geri ödeme tarihine göre sayılır.

**Müşteri tarafı:** Kartla ödeme sonrası müşteri doğrudan sipariş sayfasına gelir; ödeme onayı beklenirken sayfa kendiliğinden yenilenir. Sipariş takip formu numarayı "al 2611181234" gibi yazılsa da tanır. Sipariş numarasındaki tarih Türkiye saatine göredir.

**Önemli:** Finans kayıtları, belge PDF'leri ve gider fişleri şu an sunucu diskinde `veri/finans/` klasöründe durur (Supabase'de değil). Sunucu diski kalıcı değilse bu klasör yedeklenmeli veya Supabase'e taşınmalıdır.
