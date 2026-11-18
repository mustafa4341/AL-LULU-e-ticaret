# Al Lulu Home — Fiyat Sunumu, Ürün Anlatımı ve Sayfa Akışı Raporu

17 Kasım 2026 · Bu rapordaki önerilerin çoğu sitede **uygulandı** (her maddede "Durum" satırı var).

**İncelenen önceki araştırmalar:**
- `deep-research-report.md` ("Satış psikolojisi ve UI/UX mikro etkileşim raporu", aşağıda **R1**)
- Projenin başındaki strateji metni (aşağıda **R0**)

**Ölçüm yöntemi:** Sayfalar 390×844 (telefon) ve 1366×768 (dizüstü) boyutlarında açıldı. Öğelerin ekrandaki konumu piksel olarak ölçüldü.

---

## 0. Kısa cevaplar: müşteri ilk bakışta ne görüyor?

| Soru | Önce | Şimdi |
|---|---|---|
| Göz ilk nereye gidiyor? | Ürün görseline (doğru) | Aynı; görsel telefonda küçültüldü, ad ve fiyat yukarı çıktı |
| Ürün yeterince dikkat çekiyor mu? | Evet, ama "neden değerli?" cevabı yoktu | Ana sayfada 3 fayda maddesi, ürün sayfasında başlığın altında tek cümlelik değer önerisi |
| Fiyat kolay fark ediliyor mu? | Telefonda fiyat kutusu ekranın altında yarıda kesiliyordu (744–866 px) | İlk ekranda tam (647–738 px) |
| Satın alma butonu belirgin mi? | Telefonda sayfa içindeki buton ilk ekranın dışındaydı (878 px); sadece alttaki sabit çubuk vardı | İlk ekranda tam (748–800 px). Buton yarım kalırsa alttaki çubuk otomatik çıkıyor |
| Gereksiz kaydırma var mı? | Ürün sayfasında evet | Hayır: ad, değer, fiyat, iki buton ve stok aynı ekranda |
| Fazla bilgi/dekor var mı? | Sayfa yolu, sürekli dönen halka, sürekli parlayan buton | Telefonda sayfa yolu kaldırıldı; döngülü animasyonlar tek seferliğe indirildi (R1'in önerisi) |
| Hareketler değeri mi güçlendiriyor? | Kısmen; bazıları dikkat dağıtıyordu | Yalnızca geri bildirim hareketleri kaldı (sepete uçma, onay, sayaç) |

> Ölçümler yönetici şeridi açıkken alındı; müşteri görünümünde her şey yaklaşık 30 px daha yukarıdadır.

---

## 1. İdeal ürün sayfası: yukarıdan aşağıya bölüm sırası (uygulandı)

Her bölüm, müşterinin bir sonraki sorusunu cevaplıyor:

| # | Bölüm | Cevapladığı soru | Neden burada? |
|---|---|---|---|
| 1 | Galeri + fırsat/rozet satırı | "Bu ne?" | İlk bakış görsele gider; ürünü 5 saniyede tanıtmak gerekir (R1 "Sayfanın ideal ikna akışı") |
| 2 | Ad + model + **tek cümle değer** | "Bana ne faydası var?" | Model satırı yanlış ürün alma riskini azaltır (R1 P0 "SKU/model satırı") |
| 3 | Fiyat kutusu | "Ne kadar? Gerçek avantaj var mı?" | Fiyat, başlık ve buton tek blok olmalı; kopuk durmamalı (görev 2) |
| 4 | **Şimdi Al · Sepete Ekle** | "Nereye tıklayacağım?" | Fiyatın hemen altında; telefonda ilk ekranda |
| 5 | Stok + 4 kısa bilgi (6 L, 2 kademe, her ocak, Almanya) | "Teknik olarak uygun mu?" | Kararı veren ama okumayan kullanıcı için hızlı tarama |
| 6 | Teslimat kutusu (kargo sayacı + tahmini tarih) | "Ne zaman elimde olur?" | Teslimat belirsizliği terkin önde gelen nedenlerinden (R0) |
| 7 | Birlikte Al (set) | "Daha avantajlı alabilir miyim?" | Tamamlayıcı set, ana karardan sonra gelir (R1 P1 "Set oluştur") |
| 8 | WhatsApp'tan sor + güvenceler | "Takılırsam ne olur? Bu mağaza güvenilir mi?" | Risk azaltma CTA'nın hemen çevresinde (R1 P0) |
| 9 | **Fayda listesi** (ikon + kalın başlık + tek cümle; telefonda liste, masaüstünde 3 sütun) | "Neden bu kadar pahalı?" | Fiyatı haklı çıkarmak; teknik özelliği sonuca çevirmek (R1 P0 "Neden buna değer?") |
| 10 | **Ne kadar sürede pişer?** (masaüstünde galerinin altındaki boşlukta yapışık panel; telefonda satın alma kutusunun ardından tek sıra kaydırmalı kartlar) | "Günlük hayatımda nasıl kullanırım?" | Kullanıcının kendini ürünü kullanırken hayal etmesini sağlar (R1 P1 "Bugün ne pişirirsin?") |
| 11 | Teknik özellikler + kutu içeriği | "Detaylar ne?" | Araştıran kullanıcı için, daha aşağıda |
| 12 | Değerlendirmeler (dürüst boş durum) | "Başkaları ne diyor?" | Sahte yorum yerine açık not (R1 P0) |
| 13 | Sık sorulanlar | "Aklımdaki son sorular?" | İtiraz giderme |
| 14 | Bununla iyi gider | "Yanına ne alayım?" | Çapraz satış ana kararı gölgelememeli (R1 P2) |
| 15 | **Son çağrı** (görsel + fiyat + iki buton) | "Tamam, alıyorum, nerede?" | Uzun sayfayı okuyan kişi en altta da ne yapacağını görmeli (R1 "en altta tekrar CTA") |

Telefonda alttaki sabit çubuk (fiyat + Şimdi Al + Sepete Ekle), sayfa içindeki buton tam görünmediği her an açık kalıyor.

---

## 2. İlk ekran yerleşimi

**Ürün sayfası, telefon (390×844), yukarıdan aşağıya:**
1. Duyuru şeridi
2. Logo, WhatsApp, sepet
3. Ürün görseli (en fazla 330 px yükseklik) + "2 Yıl Garanti" damgası
4. Rozetler (2 Yıl Garanti · Orijinal Ürün)
5. **Fissler** Vitaquick® Premium Düdüklü Tencere 6 L
6. Model satırı
7. Değer cümlesi (en fazla 2 satır)
8. Fiyat kutusu: **12.999 TL** · Vergiler dahil · Kargo Bedava
9. [Şimdi Al] [Sepete Ekle]
10. ● Stokta · hemen gönderime hazır

**Ürün sayfası, masaüstü:** Solda galeri (küçük resimler + büyük görsel), sağda aynı sırayla bilgi kolonu. Sağ kolon kaydırırken yapışık kalıyor; fiyat ve buton hep görünür.

**Ana sayfa, telefon:** Görsel (190 px) → "Öne çıkan ürün" → ürün adı → 3 fayda maddesi → fiyat → Kargo Bedava → [Şimdi Al] [Sepete Ekle] → kargo sayacı. Butonlar 623–675 px'te, alt menünün üstünde.

---

## 3. Fiyat ve indirim sunumu

### Mevcut durum → Sorun
- Fiyat 12.999 TL ve sitede **gerçek bir indirim yok**. Ürün 14.999 TL'den hiç satılmadı.
- Görevdeki "14.999 → 12.999" örneği bugün sitede gösterilemez. Gösterilirse uydurma eski fiyat olur (yasal risk; R0, R1).
- Sistem bunu zaten engelliyor: eski fiyat yalnızca fiyat geçmişinden ve 30 günlük satış süresinden sonra hesaplanıyor.

### Üç seçeneğin karşılaştırması (hepsi sitede hazır)
Panel → Ayarlar → "Fiyat ve indirim sunumu" ile seçilir. Panel → Ayarlar'daki "üçünü yan yana görün" bağlantısı, üçünü örnek rakamlarla gösterir; bu sayfa yalnızca panelde açılır.

| | A — Sade | B — Güçlü kampanya | **C — Dengeli premium (seçili)** |
|---|---|---|---|
| Güncel fiyat | Büyük, siyah | Daha büyük (36 px), kırmızı | Büyük, bordo |
| Eski fiyat | Küçük, gri, üstü çizili | Küçük, gri, üstü çizili | Fiyatın solunda, küçük, gri, üstü çizili |
| İndirim | Küçük kırmızı "%13" yazısı | Büyük kırmızı "%13 İNDİRİM" rozeti | Küçük kırmızı "%13" rozeti |
| Tasarruf | Yok | Kırmızı zeminde "2.000 TL tasarruf" | Yeşil "2.000 TL daha az ödüyorsunuz" |
| "Son 30 günün en düşük fiyatı" | Küçük kırmızı satır | Rozetin yanında | Açık kırmızı zeminli küçük etiket |
| Uygun olduğu durum | Küçük indirim, marka önceliği | Kısa süreli büyük kampanya | Sürekli kullanım |

**Öneri: C.** Gerekçeler:
1. **Kırmızıyı yalnızca gerçek indirimde ve sınırlı kullanmak** premium algıyı korur (R1 "Kırmızı da sihirli bir satış rengi değildir"). Normal fiyat hiçbir seçenekte kırmızı değil.
2. **Tasarrufu TL olarak göstermek:** Yüksek fiyatlı ürünlerde TL tutarındaki indirim, aynı indirimin yüzdesinden daha büyük algılanır; düşük fiyatlı üründe tersi olur ([Chen, Monroe & Lou, 1998, *Journal of Retailing* 74(3)](https://experts.illinois.edu/en/publications/the-effects-of-framing-price-promotion-messages-on-consumers-perc/)). 12.999 TL'lik bir üründe "2.000 TL" ifadesi "%13"ten güçlüdür; bu yüzden C'de TL büyük, yüzde küçük.
3. B'yi sürekli kullanmak "pazar yeri" hissi verir. R1 de aynı ekranda indirim, sayaç ve rozetin üst üste binmesine karşı uyarıyor.

**İndirim yokken (bugün):** Fiyat büyük ve siyah. Değeri şunlar anlatıyor:
- Fiyat kutusunda "Kargo Bedava", altında teslimat sayacı.
- Ürün sayfasında başlık altındaki tek cümle; ana sayfada 3 fayda maddesi.
- Fayda bölümleri.

Sahte eski fiyat yok.

**Örnek metinler (C):**
- Etiket: "Son 30 Günün En Düşük Fiyatı"
- Fiyat satırı: ~~14.999 TL~~ %13 **12.999 TL**
- Tasarruf: "2.000 TL daha az ödüyorsunuz"

**Uygulama:** `src/components/Fiyat.astro` (üç sunum), `src/pages/yonetim/fiyat-onizleme.astro`, ayar alanı: `site.fiyatSunumu`.

**Nasıl test edilir:** Trafik az olduğu için aynı anda bölünmüş test yerine **sırayla** test önerilir (R1 "A/B test programı"). Gerçek bir indirim dönemi geldiğinde:
1. İlk 2 hafta C, sonraki 2 hafta A kullanılır.
2. Karşılaştırılacak ana ölçü: tamamlanan sipariş oranı. Ara ölçüler: sepete ekleme oranı, ödemeye başlama oranı.
3. Her dönemde en az 300–500 ürün sayfası ziyareti biriktirmeden sonuç okunmamalı.

---

## 4. Ürünün fayda başlıkları (uygulandı, panelden düzenlenebilir)

Kural: yalnızca doğrulanabilir iddialar. Kaynağı olan maddelerin altında küçük kaynak notu var.

| # | Başlık | Kısa açıklama | Doğrulama |
|---|---|---|---|
| 1 | **Normal tencereye göre %70'e kadar daha kısa süre** | Basınçla pişirme, güveç ve haşlamalarda süreyi %70'e kadar, sebzelerde %20–50 kısaltır. | Fissler: [ürün sayfası](https://us.fissler.com/products/vitaquick-premium-pressure-cooker), [Vitaquick Premium](https://fissler.com/en/collections/vitaquick-premium), [düdüklü tencereler](https://www.fissler.com/us/pressure-cookers) ("stews up to 70%, vegetables 20–50%"). Bu, üreticinin kendi test iddiası; bağımsız test bulunamadı. |
| 2 | **Hafta içi akşam yemeği, telaşsız** | Dana kuşbaşı 20–25 dk, pilav 5–7 dk, ıslatılmış kuru fasulye ~16 dk. Süreler basınç oluştuktan sonra başlar. | [Fissler resmi pişirme tablosu](https://global.fissler.com/en/blogs/product-knowledge/pressure-cooker-cooking-time-finder) (400–500 g) |
| 3 | **Hassas mı, hızlı mı? İki kademe** | Sebze/balık için 1. kademe, et ve kuru baklagil için 2. kademe; kapaktaki gösterge doğru basıncı gösterir. | Fissler: iki pişirme kademesi; tablolarda sebzeler kademe 1, et ve baklagiller kademe 2 |
| 4 | **Her ocakta çalışır** | İndüksiyon, elektrikli, seramik, gazlı ocaklarla uyumlu. | Fissler ürün sayfası ("all stovetops, including induction") |
| 5 | **Yıllarca kullanım için yapıldı** | 18/10 paslanmaz çelik, Almanya'da üretim, 2 yıl garanti. | Fissler (malzeme, üretim yeri); garanti mağaza sahibinin teyidi |
| 6 | **Güvenlik düşünülerek tasarlandı** | Kapak doğru kilitlenmeden basınç oluşmaz; emniyet sistemleri fazla basıncı kontrollü tahliye eder. | ⚠️ Kullanım kılavuzundan teyit edilecek (panelde iç not var) |

Ana sayfadaki 3 kısa madde:
- "Normal tencereye göre %70'e kadar daha kısa pişirme*"
- "İndüksiyon dahil her ocakta, iki pişirme kademesi"
- "Orijinal ürün · 2 yıl garanti · Kargo bedava"

Altında yıldızlı dipnot: "Fissler verisi; yemeğe ve miktara göre değişir."

### Pişirme süreleri (Fissler resmi tablosu, Vitaquick kademeleri)

Kaynaklar: [Global](https://global.fissler.com/en/blogs/product-knowledge/pressure-cooker-cooking-time-finder) · [ABD](https://us.fissler.com/blogs/product-guide/pressure-cooking-time-finder) · [Avustralya](https://fissler.com.au/pages/pressure-cooking-time-finder)

| Yemek | Süre | Kademe | Miktar |
|---|---|---|---|
| Pilav (beyaz pirinç) | 5–7 dk | 2 | 500 g |
| Kuru fasulye (ıslatılmış) | 16 dk | 2 | 400 g |
| Mercimek | 10–15 dk | 2 | 400 g |
| Dana kuşbaşı / gulaş | 20–25 dk | 2 | 500 g |
| Kuzu yahni | 10–15 dk | 2 | 500 g |
| Tavuk (göğüs / but) | 15–20 dk | 2 | 500 g |
| Patates (soyulmuş parça) | 6–8 dk | 2 | 500 g |
| Taze fasulye | 6–8 dk | 1 | 500 g |
| Havuç | 4–6 dk | 1 | 500 g |

**Bilinçli olarak yazılmayanlar:**
- **Nohut:** Fissler'in üç tablosunda da yok, bu yüzden "nohut X dakikada" yazmadık.
- **Tam tavuk:** Listelenmemiş.

**Sitede gösterilen not:** "Süreler kapaktaki sarı halka göründükten (basınç oluştuktan) sonra başlar; miktar, parça büyüklüğü ve ocağa göre değişebilir." Bu, Fissler'in kendi uyarısının özetidir.

**Kapasite:** R1, Fissler'in 6 L'yi "yaklaşık 3–4 kişilik" olarak konumlandırdığını aktarıyor. Bunu kendim doğrulayamadım. Sitedeki SSS hâlâ "4–6 kişilik (kendi tahminimiz)" diyor; üretici kılavuzundan teyit edilip güncellenmeli.

---

## 5. Görsel olarak güçlü fayda bölümleri

| Bölüm | Yerleşim | Görsel | Metin |
|---|---|---|---|
| Fayda 1–6 | İkon + kalın başlık + tek cümle (kullanıcı geri bildirimi: büyük görselli sürüm telefonda çok uzundu) | Panelden seçilen ikon | Başlık 3–6 kelime, açıklama tek cümle, altında küçük kaynak notu |
| Pişirme süreleri | Koyu panel; masaüstünde galerinin altında 3 sütun, telefonda yana kaydırılan tek sıra | Saat ikonu. Yemek fotoğrafı yok, çünkü uydurma ya da stok görsel kullanmadık | Yemek, süre, kademe, miktar |
| Teknik + kutu içeriği | Tablo + kontrol listesi | — | — |

**Eksik görseller** (çekilince panelden eklenir; fayda bölümüne görsel seçmek tek tık):
- Kapaktaki pişirme göstergesinin yakın çekimi → Fayda 3 ("iki kademe") için.
- Taban yakın çekimi → Fayda 4 ("her ocakta") için.
- Ocakta, yanında hazırlanmış bir yemekle kullanım fotoğrafı → Fayda 2 ve pişirme bölümü için.
- Bunlar R1'in P0/P1 listesindeki "kullanım bağlamı" ve "yakın plan malzeme" görselleriyle aynı.

---

## 6. Ürün görsellerinin ideal sıralaması

| Sıra | Görsel | Amacı | Şu an |
|---|---|---|---|
| 1 | Beyaz fon, önden | Ürünü tanıtır | ✅ var |
| 2 | Yan / 45°, uzun kulp | Biçim ve ergonomi | ✅ var |
| 3 | Kapak açık, iç gövde | Kalite ve iç hacim | ✅ var |
| 4 | Gösterge ve kilit yakın çekim | Güvenlik ve kademe | ❌ çekilecek |
| 5 | Taban yakın çekim | Isı dağılımı, indüksiyon | ❌ çekilecek |
| 6 | Ocakta, elle ölçek | 6 L'nin gerçek büyüklüğü | ❌ çekilecek |
| 7 | Yemekle kullanım | Kendini hayal etme | ❌ çekilecek |
| 8 | Kutu içeriği + model etiketi | Beklenti ve orijinallik | ❌ çekilecek |

Not: Elindeki görseller 360×480 px; büyüteçte yumuşak görünüyor. En az 1500 px önerilir. Ayrıca 4. fotoğraftaki (buhar aparatlı) tencere farklı bir nesil olabilir; teyit edilmeli.

---

## 7. Satın alma butonlarının yerleşimi

| Yer | Telefon | Masaüstü |
|---|---|---|
| Ürün sayfası, fiyatın altı | [Şimdi Al (çerçeveli)] [Sepete Ekle (dolu turuncu)], ilk ekranda | Aynı; sağ kolon yapışık |
| Alt sabit çubuk | Sayfa içi buton tam görünmüyorsa açık: fiyat + iki buton | Yok |
| Birlikte Al | "Seti Sepete Ekle" | Aynı |
| Sayfa sonu | Son çağrı: görsel + fiyat + iki buton | Aynı, yatay |
| Sepet paneli | "Sepeti Onayla · tutar" | Aynı |

**Hiyerarşi:** "Sepete Ekle" tek dolu buton, "Şimdi Al" ikincil. Bu, R1'deki "Sepete Ekle ana CTA, Hızlı Al daha zayıf" önerisi ve senin gönderdiğin Trendyol düzeniyle aynı.

---

## 8. Hareketler (motion)

| Kullanılan | Süre | Amaç |
|---|---|---|
| Sepete ekleyince buton "Eklendi ✓" + görselin sepete uçması + sepet ikonunun sallanması | 150 ms / 720 ms / 600 ms | Eylemin gerçekleştiğini göstermek (R1 P0) |
| Sepet paneli alttan/sağdan açılır | ~300 ms | Mekânsal süreklilik |
| Bölümler kaydırınca hafifçe belirir | 550 ms, bir kez | Okuma ritmi |
| Fırsat geri sayımı | Saniyede bir | Gerçek bitiş saati |
| Kargo sayacı | 30 sn'de bir | Gerçek kesim saati |
| Ödeme formunda doğru alan için ✓ | 300 ms | Form tamamlama güveni |
| Sipariş onayında tik çizimi | 600 ms | Kapanış hissi |

**Kaldırılan / tek seferliğe indirilen:**
- Butondaki sürekli parıltı → sayfa açılınca bir kez ve üzerine gelince.
- Hero'daki dönen halka ve süzülen ürün → kaldırıldı.
- WhatsApp butonunun nabız efekti → 3 kez.
- "Son X adet" noktasının sürekli zıplaması → 3 kez.

Gerekçe: R1 sürekli döngüleri ve dekoratif hareketi önermiyor. "Hareketi azalt" ayarını açan kullanıcılarda tüm hareketler kapanıyor (W3C önerisi, R1).

---

## 9. Telefon ve masaüstü arasındaki farklar

| Konu | Telefon | Masaüstü |
|---|---|---|
| Sayfa yolu (Ana sayfa › …) | Gizli (yer kazanmak için) | Görünür |
| Galeri | Kaydırmalı, en fazla 330 px yükseklik, nokta göstergesi | Solda küçük resimler, büyük görsel, fareyle yakınlaştırma |
| Fiyat altı taksit metni | Gizli (tek satır) | Görünür |
| Satın alma | Alt sabit çubuk + sayfa içi buton | Yapışık sağ kolon |
| Ana sayfa alt metni | Yerine 3 kısa madde | Alt metin + 3 madde |
| Kategoriler | Alt menü → Kategoriler | Başlığın altındaki satır |
| WhatsApp | Alt menüde | Sağ altta yüzen buton + başlıkta numara |

---

## 10. Önerilerin dört kategoriye ayrılması

**1. Önceki araştırmada (R0/R1) desteklenenler:**
- Sahte eski fiyat, sayaç ve yorum yok.
- Kırmızı yalnızca gerçek promosyonda.
- Sepete Ekle ana, Hızlı Al ikincil.
- Telefonda sabit satın alma çubuğu; buton görününce gizleniyor.
- Ürün adı, model ve değer cümlesi ilk ekranda.
- "Neden buna değer?" bölümü; teknik özellik yerine sonuç dili.
- Kullanım senaryoları.
- Gerçek stok uyarısı.
- Kargo bedava eşiği ürünün altında kaldığı için doğrudan "Kargo Bedava" yazmak.
- Sepette tek bir çapraz satış önerisi.
- Dürüst yorum boş durumu.
- Döngülü animasyon yok; hareketi azaltma ayarına saygı.
- Sıralı test (aynı anda çoklu test değil).

**2. Güvenilir dış kaynaklarla desteklenen ek öneriler:**
- Tasarrufu TL olarak gösterme (Chen, Monroe & Lou, 1998).
- Pişirme sürelerini yalnızca Fissler'in resmi tablosundan alma ve koşullarını yazma (Fissler'in üç bölge sitesi).
- "%70'e kadar" iddiasını "normal tencereye göre" bağlamıyla ve dipnotla verme (Fissler'in kendi ifadesi).

**3. Profesyonel tasarım değerlendirmeleri (deneysel kanıt değil):**
- Bordo fiyat (C seçeneği).
- Sağlı sollu fayda bölümleri.
- Sayfa sonu son çağrı kutusu.
- Telefonda sayfa yolunun gizlenmesi.
- Hero görselinin telefonda 190 px'e indirilmesi.

**4. Test ile doğrulanması gereken hipotezler (sırayla, 2'şer hafta):**

| Hipotez | Ölçü |
|---|---|
| C, A'dan daha fazla sipariş getirir (gerçek indirim döneminde) | Sipariş oranı |
| Ana sayfadaki 3 fayda maddesi, uzun alt metinden iyidir | Ürün sayfasına geçiş, sepete ekleme |
| İlk görsel olarak kullanım fotoğrafı beyaz fondan iyidir (çekilince) | Galeri etkileşimi, sepete ekleme |
| 12.999 ile 13.000 arasında fark var mı? | Gelir / ziyaret |

R1 13.000 öneriyor; biz marketplace fiyatları nedeniyle 12.999 seçtik. R1'in kendisi de etkinin küçük ve bağlama bağlı olduğunu söylüyor.

---

## 11. Önceki araştırmayla uyum tablosu

| R1 önerisi | Sitedeki karşılığı | Durum |
|---|---|---|
| Büyük hero görsel, CTA'dan önce tek güçlü görsel | Galeri + damga; telefonda boyut sınırı | ✅ |
| Hero başlığı + tek cümle değer önerisi | Ad + model + değer cümlesi | ✅ |
| Sahte üstü çizili fiyat kullanma | Eski fiyat yalnızca 30 günlük geçmişten | ✅ |
| Sepete Ekle ana, Hızlı Al zayıf | Dolu turuncu / çerçeveli | ✅ |
| Mobil sticky bar, hero CTA görününce gizlensin | Buton tam görünmüyorsa açık | ✅ |
| Ekleyince "✓ Sepete eklendi" | Buton durumu + uçma + bildirim | ✅ |
| Sağdan mini sepet, kendiliğinden kapanmasın | Sepet paneli (telefonda alttan) | ✅ |
| 3 güven/değer satırı | Güvenceler + ana sayfa maddeleri | ✅ |
| "Neden buna değer?" fayda dili | Fayda bölümleri | ✅ |
| Kullanım bağlamı ve ölçek görseli | Bölüm hazır, fotoğraflar çekilecek | ⏳ |
| Gerçek stok durumu | "Stokta son X adet" yalnızca stok ≤ 3 | ✅ |
| Gerçek yorum / boş durum | Dürüst boş durum | ✅ (yorum sistemi yok) |
| SKU/model satırı | Başlık altında | ✅ |
| "Bugün ne pişirirsin?" | Pişirme süreleri bölümü | ✅ |
| Ücretsiz kargo eşiği ürünün altındaysa doğrudan "Kargo bedava" | Fiyat kutusu + kart şeridi | ✅ |
| Gerçek süreli kampanyada geri sayım, yenilemede sıfırlanmasın | Fırsat ürünü sayacı (panelde bitiş) | ✅ |
| Cross-sell sepete ekledikten sonra, tek kart | Sepette "Bununla iyi gider" (1 kart) | ✅ |
| Confetti, sürekli parlayan buton yok | Döngüler kaldırıldı | ✅ |
| Exit-intent popup kullanma | Yok; yalnızca geri dönen ziyaretçiye tek seferlik nazik sepet kartı | ✅ (dikkat: test edilmeli) |
| prefers-reduced-motion | Tüm hareketlerde | ✅ |

---

## 12. Kalan işler
- Yakın çekim, ölçek ve kullanım fotoğrafları (bölümler hazır, panelden eklenir).
- Güvenlik maddesi ve kapasite (3–4 / 4–6 kişi) için kullanım kılavuzu teyidi.
- %70 iddiasının elimizdeki SKU'ya ait olduğunun teyidi (Fissler bunu "Vitaquick" için söylüyor).
- Gerçek yorum sistemi (siparişten sonra yorum isteme).
- Supabase / Vercel geçişi (önceki turdan bekliyor).

---

## v3.4 — Dış tasarım değerlendirmesine göre yapılanlar (17.11.2026)

| Öneri | Durum |
|---|---|
| İlk ekran hiyerarşisi: marka satırı → başlık → değer cümlesi → ✓ güvenceler → fiyat → butonlar | Uygulandı. "FISSLER · 6 LİTRE" satırı, kalın başlık, ✓ 2 Yıl Garanti ✓ Orijinal Ürün ✓ Kargo Bedava. Model kodu güvenceler bölümüne taşındı. |
| Turuncu garanti damgası fazla baskın | Elle yazılan rozetler artık damga olmuyor; damga yalnız gerçek durumlarda (En Çok Satan, Fırsat, Son N Adet). Ürün sayfasında görsel üstü damga kaldırıldı (bilgi sütununda zaten var). |
| Görselde fazla boşluk | Ürün görselleri kırpılıp kare yapıldı (orijinaller: `veri/gorsel-yedek/`). Panelden yüklenen beyaz fonlu fotoğraflar da otomatik kırpılıyor. Not: mevcut görseller 360 px; yüksek çözünürlüklü fotoğraf gerekli. |
| Küçük/soluk yazılar | `--ink-3` #6E675D'ye koyulaştırıldı, küçük notlar 12–12.5 px. |
| Fayda başlığı zayıf | "Daha az bekleme. Daha çok sofra keyfi." |
| Pişirme kartları tekdüze; basınç süresi dahil mi? | "Bugün ne pişirmek istersiniz?" — ilk 4 yemek vurgulu, dokununca kademe ve miktar açılıyor; "basınca ulaşma ve boşaltma süreleri dahil değildir" notu eklendi. |
| Üstteki "1.000 TL üzeri kargo bedava" ilgisiz | Ürün sayfasında ilk duyuru "Bu üründe kargo bedava · 14:00'e kadar aynı gün kargoda"; genel sırada orijinal/garanti ilk. |
| Alt menü + yapışkan çubuk yer kaplıyor | Alt menü aşağı kayarken gizleniyor, yukarı kayınca geri geliyor (ürün sayfasında zaten yalnız satın alma çubuğu var). |
| "Karar verdiniz mi?" tekrarı | Son bölüm "Özetle" + 3 temel fayda + fiyat + butonlar. |
| "Örnek Marka" ürünü görünüyor | Örnek ürünler canlıda zaten gizli; yönetici için şeritte "Müşteri gibi gör" anahtarı eklendi. |
| Hareket süreleri | Kaydırma belirmesi 350 ms/12 px, hero 350–450 ms, yapışkan çubuk 200 ms, kart dokunuşu 150 ms, detay açılışı 220 ms. |
| Arka plan sıcaklığı | `--bg` #F7F5F0 (hafif krem). |

Bilerek uygulanmayanlar: buton sırası (kullanıcının istediği Trendyol düzeni korunuyor), alt menünün tamamen kaldırılması (çok kategorili mağaza), indirim fiyatı (gerçek 30 günlük fiyat geçmişi olmadan üstü çizili fiyat gösterilmez).

---

## v3.5 — 20 ekranlık dış incelemeye göre yapılanlar (18.11.2026)

| İnceleme maddesi | Durum |
|---|---|
| Ödeme bağlı değilken "Siparişiniz alındı!" deniyor | **Düzeltildi.** Ödeme alınmamış siparişte saat ikonu + "Sipariş kaydınız oluşturuldu · Ödeme henüz alınmadı". Yeşil tik ve "Siparişiniz onaylandı" yalnız ödenmiş siparişte. |
| Ödeme sayfasında 3D Secure anlatılıyor, buton "Siparişi Tamamla" | **Düzeltildi.** Ödeme bağlı değilken buton "Sipariş Kaydı Oluştur", kutuda "Online ödeme henüz devrede değil; kartınızdan ücret alınmaz". Bağlanınca `src/lib/altyapi.ts` → `ODEME_BAGLI = true` yapılır, eski metinler ("Ödemeye Geç", 3D Secure) kendiliğinden döner. |
| SMS/e-posta vaadi (altyapı yok) | **Düzeltildi.** Ödeme formu, sipariş sonucu, sipariş takip, ana sayfa "Neden biz", ürün sayfası güvenceleri: SMS sağlayıcı ve SMTP bağlanmadan söz verilmiyor (`SMS_BAGLI`, `.env` SMTP_HOST). Yasal metinlerdeki SMS ifadeleri diğer oturumun alanında. |
| Ana sayfa: kesikli çember, tıklanabilir görünmüyor | **Yenilendi.** Krem zeminli büyük görsel alanı (telefonda 252 px), görselin tamamı ürün sayfasına gider, sağ altta "Ürünü incele ›" hapı, sol üstte "Öne çıkan ürün" (gerçek satış verisi varsa "En Çok Satan"), butonların altında "Ürünü incele · Fotoğraflar, pişirme süreleri, teknik özellikler" satırı. Butonlar telefonda hâlâ ilk ekranda. |
| 13.999 → 12.999 %7 indirim gösterilmeli | **Gösterilmedi (bilerek).** Fiyat geçmişinde 13.999 hiç yok; Haksız Ticari Uygulamalar Yönetmeliği'ne göre eski fiyat son 30 günün en düşük uygulanan fiyatı olmalı. Gerçek indirim oluştuğunda artık her yerde tutarlı görünür: ana sayfa görselinde ve ürün galerisinde "%X İndirim" rozeti, kartta rozet, fiyat kutusunda üstü çizili fiyat, sepette üstü çizili satır + "Bu siparişte X TL avantaj". |
| "Çok Satan" mı "2 Yıl Garanti" mi | "En Çok Satan" yalnız gerçek satıştan (eşik: panel). Yoksa "Öne çıkan ürün". Garanti küçük güven işareti olarak kaldı. |
| Tek ürün kartı ekranın yarısında | **Düzeltildi.** Tek ürün varken tam genişlik yatay kart, "Tümünü gör" gizli. |
| Kategorilerin çoğu "Yakında" | **Düzeltildi.** Ürünü olan kategori 2'den azsa ana sayfada kategori bölümü gizli (menüde duruyor; ikinci kategoriye ürün eklenince kendiliğinden açılır). |
| Aynı gün / yarın kargo çelişkisi | Hesap doğruydu (14:00 sonrası yarın). Metin netleşti: "Bugünkü kargo 14:00'te çıktı. Şimdi sipariş verirsen Yarın kargoda" / hafta sonu "Hafta sonu kargo çıkmıyor". Ürün şeridi "Hafta içi 14:00'e kadar". Panel → duyurulardaki "14:00'e kadar…" metnine "Hafta içi" eklenmesi önerilir. |
| Galeride 1/3, diğer fotoğraflar belirsiz | Telefonda noktalar yerine küçük resimler. |
| Pişirme kartları yana kaydırılabilir mi belli değil | "9 yemek · yana kaydırın ›" ipucu. |
| Teknik tablo uzun | İlk 6 satır açık, kalanı "Tüm teknik özellikler (+4)". |
| Boş yorum alanı büyük | Tek satırlık not. |
| Sepet "Sepeti Onayla" | "Ödemeye Geç". |
| Sipariş özetinde ad/fiyat dağınık | Fiyat sağda tek satır; telefon 05xx xxx xx xx biçiminde. |
| Footer'da telefon/e-posta kelime ortasından bölünüyor | İletişim sütunu telefonda tam genişlik, kelime ortasından bölme yok. |

**Bilerek değiştirilmeyenler:**
- **"Hemen Satın Al" ana buton önerisi:** Senin seçtiğin Trendyol düzeni (Sepete Ekle dolu turuncu) korunuyor.
- **Footer'daki [Ticari Unvan], [Açık adres], [ETBİS] yer tutucuları:** Gerçek bilgiler sende; yasal sayfalar paralel oturumda düzenleniyor. Canlıya çıkmadan Panel → Ayarlar'dan doldurulmalı.
- **İl/ilçe:** İl zaten seçmeli; ilçe listesi (973 ilçe) henüz eklenmedi.
- **Sipariş takibi güvenliği:** Zaten korumalı: sipariş sayfası 128 bit gizli anahtarla açılıyor, numara+telefon araması IP başına 10 dakikada 10 deneme ile sınırlı.

### v3.5.1 — Öne çıkan özellikler ve indirim görünümü (18.11.2026)
- Ürün sayfasındaki 4 gri kutu (6 L · Ø 22 cm, 2 pişirme kademesi…) yerine, fiyatın hemen altında **renkli ikonlu fayda listesi**: "%70'e kadar daha hızlı pişirir*", "2 pişirme kademesi: sebzeye hassas, ete hızlı", "İndüksiyon dahil tüm ocaklarda çalışır", "Almanya'da üretim, 18/10 paslanmaz çelik". Aynı stil ana sayfadaki 3 maddede de var. Maddeler panelden (ürün → Öne çıkan bilgiler) düzenlenir; ikon rengi seçilen ikona göre otomatik. Eski hâli `veri/yedekler/` içinde.
- Gerçek indirimde fiyat: kırmızı "↘ %7 İndirim" rozeti (düşüş ikonu), üstü çizili eski fiyat, kırmızı yeni fiyat, yeşil "1.000 TL daha az ödüyorsunuz". Panel → Ayarlar → fiyat önizlemesi artık 13.999 → 12.999 örneğiyle gösteriyor.
- **Uygulanmayan:** Satış verisi olmadan "Çok Satan" rozeti ve fiyat geçmişine yazılmış sahte 13.999 TL. İkisi de gerçek olduğunda sistem kendiliğinden gösterir.

### v3.5.2 — Çok Satan ve 13.999 → 12.999 indirimi (18.11.2026)
- **En Çok Satan:** Panel → Ürün → "En Çok Satan rozeti" kutusu eklendi (yeni alan `cokSatan`). Mağaza sahibi, ürünün başka kanallarda gerçekten satıldığını belirttiği için Vitaquick'te açıldı. Rozet ana sayfa görselinde, ürün sayfasında ve kartta görünür.
- **İndirim:** Mağaza sahibi, ürünü son 30 gün içinde 13.999 TL'den sattığını ve daha ucuza satmadığını beyan etti. Fiyat geçmişine "17.10.2026'dan beri 13.999 TL → 18.11.2026'da 12.999 TL" olarak işlendi ve kampanya açıldı. Önceki fiyat yine sistemin 30 gün kuralıyla hesaplanıyor. Geliştirme sırasında sitede (henüz yayında değilken) girilen 12.999 kaydı geçmişten çıkarıldı. Önceki veri `veri/yedekler/` içinde.
- **Saklanması gerekenler:** 13.999 TL'lik satışların fatura ve sipariş kayıtları. Bir şikâyette indirimin gerçek olduğunu bunlar kanıtlar. Ürünün iç notlarına (`dogrula`) da yazıldı.
- 30 gün dolmadan fiyat yükseltilip yeniden düşürülürse sistem yeni indirimi göstermez (kural korunuyor).
