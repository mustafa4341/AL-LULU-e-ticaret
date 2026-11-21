# Web, Trendyol ve Hepsiburada satış akışı

Yönetim panelindeki **Siparişler** ekranında kanal ve durum filtreleri, sipariş numarası araması ve **İşlem gerekli** görünümü bulunur. **Satış kanalları** ekranı (`/yonetim/siparisler/kanallar`) son çekimi, ilan eşleştirmelerini, stok onaylarını ve son stok hareketlerini gösterir.

---

## 19.11.2026 Canlı Kurulum ve Otomatik Stok Özeti (Tamamlanan İşlemler)

1. **Trendyol Canlı API Bağlantısı (Vercel Production):**
   - Trendyol satıcı hesabı canlı ortam (`TRENDYOL_ORTAM=canli`) olarak `al-lulu-e-ticaret` Vercel projesine bağlandı. Satıcı ID ve entegrasyon bilgileri yalnız Vercel ortam değişkenlerinde ve Trendyol Satıcı Paneli > Hesap Bilgilerim > Entegrasyon Bilgileri'nde durur (bu depo herkese açık; buraya yazılmaz).
   - `TRENDYOL_SATICI_ID`, `TRENDYOL_API_KEY` (Sensitive), `TRENDYOL_API_SECRET` (Sensitive) ve 48 karakterlik `CRON_SECRET` (Sensitive) ortam değişkenleri Vercel Production ortamına eklendi ve canlıya (`https://alluluhome.com`) dağıtıldı.
   - Trendyol Canlı Sipariş Akışı (`/integration/order/sellers/{saticiId}/orders/stream`) ve Ürün/Envanter Servisi üzerinden `200 OK` yanıtı doğrulandı (son başarılı çekim 19.11.2026 19:04, "0 yeni" — henüz ilan/sipariş yok).
   - 20.11.2026 itibarıyla zamanlayıcının kurulumu ve izlenmesi aşağıdaki **Otomatik çalıştırma** bölümünde.

2. **Supabase Veritabanı Tabloları ve Atomik Stok Fonksiyonları:**
   - Canlı Supabase projesine (`yrbvywobqnrqqvkndvqj`) şu 3 migration sırasıyla uygulandı:
     - `20261119150000_pazaryeri_ve_stok.sql` (`pazaryeri_siparisleri`, `stok_hareketleri`, `envanter_ayarlari` tabloları, RLS politikaları, `trg_stok_hareketi` stok hareket tetikleyicisi, `pazaryeri_kaydet` ve `envanter_ayar_kaydet` RPC fonksiyonları)
     - `20261119151000_web_siparis_olusturma.sql` (`web_siparis_olustur` atomik web siparişi ve PayTR rezervasyon fonksiyonu)
     - `20261119152000_pazaryeri_senkron_kilidi.sql` (`pazaryeri_senkron_kilidi` tablosu ve dağıtık kilit RPC fonksiyonları)

3. **Çift Yönlü Otomatik Stok Senkronizasyonu (`PAZARYERI_STOK_YAZ=1` & `PAZARYERI_STOK_ARTIR=1`):**
   - Vercel Production ortamında `PAZARYERI_STOK_YAZ=1` ve `PAZARYERI_STOK_ARTIR=1` aktif edildi.
   - **Başlangıç Sayımı ve Güvenlik Payı:** Trendyol kanalı için başlangıç sayımı `19.11.2026 18:00` ve güvenlik payı `1 adet` olarak kaydedildi.
   - **Nasıl Çalışır?**
     - **Trendyol'dan sipariş geldiğinde:** Sipariş yönetim panelindeki **Siparişler** ekranına düşer ve ilgili ürünün stoğu merkezi depodan otomatik olarak **1 kez** düşülür. Sipariş iptal edilirse stok otomatik geri eklenir.
     - **Web sitesinden satış olduğunda veya panelden stok değiştiğinde:** Eşleştirilmiş ürünlerin yeni stok adedi (`Depodaki Satılabilir Stok − 1 Güvenlik Payı`) Trendyol'a otomatik olarak gönderilir ve Trendyol ilan stoğu güncellenir.
     - **Ürünleri (Tencere, Tava vb.) Otomatik Tanıma:**
       1. Trendyol'da açtığınız ilanın **Barkod** (veya stok kodu) değeri sitedeki ürünün barkodu/model kodu (`sku`) ile aynıysa sistem ürünü kendiliğinden tanır.
       2. Barkodu daha önce girilmemiş bir ürün satılırsa sipariş ekranında kırmızı **"Eşleşme bekliyor"** uyarısı çıkar. Sipariş detayından ürünü **1 kere** seçip eşleştirdiğinizde hem o siparişin stoğu düşer hem de barkod hafızaya alınır; sonraki tüm siparişlerde ve stok güncellemelerinde otomatik çalışır.
       3. Dilerseniz Trendyol'da ilanlarınız onaylandıkça `/yonetim/siparisler/kanallar` sayfasındaki **Adım 3 · Ürün eşleştirmeleri** bölümünden barkodları önceden de kaydedebilirsiniz.

---

## Canlıya geçiş sırası

1. Supabase ve mevcut kanal stoklarının yedeğini alın. `supabase/migrations` klasöründeki `20261119150000`, `20261119151000` ve `20261119152000` migration’larını zaman damgası sırasıyla uygulayın. Web siparişinin yeni atomik kayıt fonksiyonu uygulama yayına alınmadan önce veritabanında bulunmalı.
2. Ayrı bir Supabase projesi ve ayrı bir test dağıtımıyla PayTR, Trendyol Stage ve Hepsiburada Test akışını doğrulayın. Ortam değişkenlerinin listesi `.env.example` dosyasında. Test ortamında `PAZARYERI_TEST_VERITABANI=1` kullanın. Canlı ve test hesapları aynı senkron işinde kullanılamaz.
3. Canlıda satışları kısa süreliğine durdurup depoyu sayın. Sayıma kadar gelen siparişleri, ayrılmış ürünleri ve depoya dönen iadeleri hesaplayın. Panel stok alanına, açık PayTR oturumlarına ayrılan adetler dahil olmak üzere siparişe henüz düşülmemiş satılabilir adedi girin. **Satış kanalları** ekranında her kanal için sayımın tamamlandığı tarihi ve saati (Türkiye saati) kaydedin. Bundan eski ilk kez görülen siparişler geçmiş kayıt olarak kalır. Geçiş öncesinde depoda hesaba katılmış ama geçiş sonrasında iade edilen eski satışlar için stok düzeltmesini fiziksel kontrolden sonra elle girin.
4. İlanları ürün kartlarına bağlayın. Trendyol’da satıcı panelindeki ilan barkodunu, Hepsiburada’da `merchantSku` değerini girin. Setin birden çok depo kalemine ayrılması web tarafında destekleniyor. Ayrı bir pazaryeri set ilanını tek bir bileşenin koduyla eşleştirmeyin. Böyle bir ilan için otomasyon öncesi set reçetesi gerekir.
5. Canlı API bilgilerini sunucu ortam değişkenlerine girin ve ilgili `*_ORTAM` değerini `canli` yapın. `PAZARYERI_STOK_YAZ=0` ile **Şimdi eşitle** düğmesini kullanarak önce siparişleri ve merkezi stok hareketlerini doğrulayın. Satıcı panelindeki sipariş numarası, adet, durum ve kargo terminini karşılaştırın. Bir kanalı pilot olarak açıyorsanız diğer kanalın satışını bu aşamada kapalı tutun.
6. Mevcut ilan adetlerini gözden geçirip ilk stokları satıcı panellerinden düşük adetle açın. `PAZARYERI_STOK_YAZ=1` ayarı otomatik stok düşüşü ve kapatılan ilanı sıfırlama işlemini açar. Otomatik stok artışı ayrıca `PAZARYERI_STOK_ARTIR=1` ister. İlk pilotta artışı kapalı tutun. Stok gönderimi sürerken yeni bir gönderim yapılmaz. Kanal cevabıyla doğrulanan değer **Kanalda** alanında görünür.
7. Zamanlayıcıyı açın ve üç kanalda uçtan uca test siparişiyle web rezervasyonunu, başarılı ödemeyi, iptali, kargo durumunu ve stok düşümünü kontrol edin. Paket bölünmesi, tekrar eden sipariş bildirimi ve iade teslim alma senaryolarını da pilotta doğrulayın.

## Otomatik çalıştırma

- [x] GitHub Actions için beş dakikalık eşitleme tanımı eklendi. Vercel Production ve GitHub Actions için ortak `CRON_SECRET` tanımlandı. İş, canlı sitedeki `GET /api/pazaryeri-senkron` adresini bu anahtarla çağırır.
- [x] **Satış kanalları** ekranında son başarılı çekim ve son otomatik çekim ayrı alanlarda görünür. Elle eşitleme otomatik çekimin saatini değiştirmez. İki çalışma aynı veritabanı kilidini kullanır.
- [ ] Hepsiburada canlı bağlantısı. Vercel Production’a `HEPSIBURADA_MERCHANT_ID`, `HEPSIBURADA_KULLANICI`, `HEPSIBURADA_PAROLA`, `HEPSIBURADA_USER_AGENT` ve `HEPSIBURADA_ORTAM=canli` eklenince panelden başlangıç sayımını kaydedin. Ardından sipariş ve stok mutabakatını yapın. Aynı zamanlayıcı iki kanalı çalıştırır.
- [ ] İlk gerçek Trendyol ve Hepsiburada siparişlerinde eşleşme, merkezi stok düşümü, kanal stok onayı ve iptal akışını satıcı panelleriyle karşılaştırın.

GitHub **Actions → Pazaryeri eşitleme** çalıştırma geçmişini gösterir. Başarısız çalışmada kanal hataları panelde görünür. GitHub zamanlanmış işleri yoğunlukta geciktirebilir ve herkese açık depoda 60 gün etkinlik olmazsa zamanlamayı kapatabilir. Panel 30 dakika boyunca başarılı otomatik çekim gelmezse uyarır. Vercel Hobby zamanlaması günde bir kezle sınırlı. [GitHub zamanlama belgeleri](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) · [Vercel Cron sınırları](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing)

## Operasyon ve hata durumları

| Durum | Yapılacak işlem |
| --- | --- |
| Ödeme alındı, web stoğu ayrılamadı | Sipariş ekranından **Stoğu ayır** ile yeniden deneyin. Ürün sağlanamazsa PayTR’de geri ödemeyi tamamlayıp siparişi iptal edin. |
| Pazaryeri ürünü eşleşmedi | Satış kanallarında ilan kodunu düzeltin. Açık sipariş kaleminde ürünü bağlayın ve ayrılan adedi doğrulayın. |
| Pazaryeri siparişinin stoğu eksik | Katalogdaki fiziksel stoku kontrol edin. Eksik ürün geldiğinde sipariş detayından stok ayrımını tamamlayın. Ürün sağlanamazsa ilgili satıcı panelinde işlem yapın. |
| Paket iptal edildi veya bölündü | Gönderilmemiş kalemlerin ayrımı bırakılır. Kargoya çıkmış ürünü, demirbaş sayımına veya yeni satışa eklemeden önce dönüşü depoda kontrol edin. |
| İade veya teslim edilemedi | Fiziksel ürün ulaştığında sipariş kaleminde satılabilir ya da hasarlı olarak kaydedin. Hepsiburada’nın ayrı talep ekranındaki kısmi iadeleri satıcı paneli ve depo ile karşılaştırın. Sipariş akışına yansımayan talepleri mevcut stok hareketiyle mutabakat yaparak elle düzeltin. |
| Kanalın çekimi gecikti veya hata var | Satıcı panelini kontrol edin, son başarılı andan itibaren siparişleri karşılaştırın ve eşitlemeyi yeniden çalıştırın. Etkin kanalların çekimi tamamlanana kadar stok gönderimi bekler. Uzun kesintide API sorgu aralığı aşılırsa eksik dönemi satıcı raporuyla mutabakata alın. |
| Stok isteğinin takip numarası alınamadı | Hedefler API okumasıyla doğrulanınca bekleyen işlem kapanır. Fark sürüyorsa satıcı panelinde önceki toplu işlemin artık beklemediğini doğrulayın. Ardından **Bekleyen stok işlemini çöz** üzerinden kaydı kapatın ve **Şimdi eşitle** ile ilanları yeniden okuyun. |
| Fatura, kargo ve geri ödeme | Web siparişleri mevcut panelde ilerler. Pazaryeri işlemleri ilgili satıcı panelinde tamamlanır. Hakediş mutabakatında sipariş tutarı ve bankaya yatan tutar ayrı kayıtlardır. |

Merkezi stok hareketi aktarım sırasında tek işlemde yazılır. Üç satış kanalının birbirinden bağımsız ödeme ve sipariş kabul sistemleri vardır. Kanal API’sinde ve zamanlayıcıda gecikme olabileceği için düşük stokta varsayılan güvenlik payı kanal başına bir adettir. Son birkaç adedi tek kanalda açmak çakışma riskini azaltır. Senkron hatasında satıcı panelindeki ilan adedi son bilinen değerde kalabilir.

## Hepsiburada finans ve kâr hesabı

Yönetim panelinde **Finans › Hepsiburada** (`/yonetim/finans/hepsiburada`) iki bölümden oluşur.

- **Hesap makinesi:** Satış fiyatı, kategori komisyonu, desi, kargo firması, işlem ve hizmet bedeli ile stopajdan "hesaba yatacak" tutarı, net kârı ve başa baş fiyatı hesaplar. Komisyon oranları Hepsiburada EK-4 (V13) tablosundan alındı. Kargo ücretleri 05.10.2026 tarihli desi tablosundan alındı ve `src/lib/hepsiburadaKargoTablosu.ts` dosyasına PDF'ten otomatik üretildi. Tablonun 4501 satırı ve 11 firması ile karşılaştırıldı, fark 0 kuruş. İşlem ve hizmet bedeli belgelerde yok, ayarlardan girilir. Yeni tablo gelince dosya aynı yöntemle yeniden üretilmeli.
- **Hepsiburada hesabım:** Muhasebe servisinden (`mpfinance-external`, kayıt bazlı ve performans servisi) son 30, 60 veya 90 günün kayıtlarını çeker. Ödenen ve ödenecek tutarları ve vade günlerini gösterir. Sipariş bazında kayıt toplamını Hepsiburada'nın hakediş tutarıyla karşılaştırır. Bunun için Hepsiburada'dan **Muhasebe entegrasyonu** yetkisi istenmeli.
- İlk gerçek bağlantıda test ortamında doğrulanacak noktalar:
  - `amount`, `taxAmount` ve `netAmount` alanlarının anlamı.
  - `TotalPayment` kaydının hakedişe eklenmemesi.
  - Mutabakatta fark çıkmaması.

## Trendyol: ürün gönderme, fiyat, fatura ve hakediş (21.11.2026)

Servis yolları developers.trendyol.com belgelerinden (Ürün Entegrasyonu V2, Sipariş, Fatura, Yurtiçi Cari Hesap Ekstresi) 21.11.2026'da doğrulandı. Kod: `src/lib/trendyolApi.ts`, `trendyolIlan.ts`, `trendyolIlanIslem.ts`, `trendyolFinans.ts`.

- **Trendyol'a ürün gönder** (`/yonetim/siparisler/trendyol-urunler`, Satış kanalları › Trendyol kartındaki düğme): ürünü seç → Trendyol kategorisi ara/seç → marka ara/seç → zorunlu özellikler (sitedeki teknik özelliklerden bulunanlar otomatik dolar) → barkod, desi, KDV, fiyat → **Kaydet ve Trendyol'a gönder**. Açıklama ürünün sitedeki özet, öne çıkanlar, teknik tablo, kutu içeriği ve garantisinden; görseller `/jpg/...` dönüştürücüsünden JPG olarak gider. Stok = satılabilir stok − güvenlik payı.
- **Onay takibi:** sayfa her açıldığında (2 dakikada bir) ve “Durumları yenile” ile kuyruk sonucu, red sebepleri ve onay okunur. Onaylanan ilan aynı barkodla **Ürün eşleştirmeleri**ne kendiliğinden bağlanır; stok eşitlemesi oradan devam eder.
- **Fiyat kuralı:** site fiyatı + % + sabit TL, isteğe bağlı ,90 yuvarlama; ürüne özel fiyat yazılabilir. “Fiyatları Trendyol'a gönder” eşleştirilmiş ilanlara fiyatı yollar (adet göndermez). Liste fiyatı = satış fiyatı: üstü çizili fiyat gönderilmez (Yönetmelik m.14); Trendyol'da indirim Trendyol'un kampanya araçlarıyla yapılmalı.
- **Sipariş detayında Trendyol işlemleri:** “Toplamaya başla” (Picking), fatura numarasıyla “Faturalandı” (Invoiced), e-Arşiv/e-Fatura PDF'ini yükleme (`seller-invoice-file`, Vercel istek sınırı nedeniyle pratikte en fazla ~4 MB) veya fatura bağlantısı gönderme (`seller-invoice-links`, 10 yıl erişilebilir olmalı). Mağazanın kendi “sipariş fişi” fatura yerine geçmez.
- **Finans › Trendyol › Şimdi çek:** settlements (Sale, Return, Discount, Coupon, DeliveryFee, Provision, ManualRefund) + otherfinancials (DeductionInvoices, Stoppage, PaymentOrder) 15 günlük parçalarla çekilir, sipariş başına mevcut Trendyol tablosuna yazılır. CommissionAgreementInvoice (komisyon mutabakat faturası) tekrar sayılmaz; TyDiscount/TyCoupon (Trendyol bütçeli) çekilmez. Elle dosya yükleme yedek olarak duruyor.
- **Muhasebeci Excel'i:** yeni “Pazaryeri satışları” sayfası (Trendyol + Hepsiburada siparişleri, durum, adet, tutar).
- İlk gerçek siparişte doğrulanacaklar: cari hesap alanlarının (debt/credit/commissionAmount/sellerRevenue) satıcı panelindeki ekstreyle aynı çıkması; DeductionInvoices açıklamalarının kargo/hizmet ayrımı; Picking/Invoiced sonrası durumun eşitlemede gelmesi.
- Henüz yok: e-Arşiv/e-Fatura **kesme** (GİB özel entegratörü hesabı gerekir: Trendyol E-Faturam, Paraşüt vb.), iade (claims) onay/red, müşteri soruları, ortak kargo etiketi, Hepsiburada ürün yükleme (HB entegrasyon erişimi bekleniyor).

## Tek çatı: Faturalar, iadeler, sorular, kargo etiketi (21.11.2026)

- **Finans › Faturalar** (`/yonetim/finans/faturalar`): web + Trendyol + Hepsiburada siparişleri tek listede. Faturayı mağaza **GİB e-Arşiv Portalı'nda elle** keser (1.1.2026'dan beri e-Fatura'ya geçmemiş mükellefler tüm faturaları portaldan e-Arşiv keser; basit usul / işletme hesabı için 1.1.2027 — muhasebeciye doğrulatın). Ekran her sipariş için alıcıyı (TCKN yoksa 11111111111; kurumsalda VKN, unvan, vergi dairesi), satırları (KDV hariç birim fiyat, KDV oranı ve tutarı, toplam) ve not metnini “Kopyala” düğmeleriyle verir. Fatura no + tarih + PDF kaydedilince: Trendyol'a otomatik yüklenir (`seller-invoice-file`), web müşterisine e-postayla gider (tür `fatura`, eposta_kayitlari'nda), Hepsiburada'da satıcı panelinden yüklenip “Yükledim” işaretlenir (HB fatura servisi belgeden doğrulanamadı). Aynı siparişe ikinci geçerli fatura ve aynı fatura numarası engellenir; iptal yalnız kaydı kapatır, portalda ayrıca iptal edilmeli.
- KDV oranı: ürünün Trendyol ilanındaki / Hepsiburada ayarındaki oran, yoksa %20. Web siparişinde set/sepet indirimi satırlara orantılı dağıtılır, kargo ayrı %20 satır; toplam müşterinin ödediğiyle kuruşu kuruşuna aynı.
- Pazaryeri siparişlerine fatura alıcısı kaydediliyor (`fatura` alanı): Trendyol `invoiceAddress`, `tcIdentityNumber`, `customerEmail` (siparişe özel kriptolu adres); Hepsiburada `invoice` / `invoiceAddress` (HB alan adları ilk gerçek bağlantıda doğrulanacak). Eski siparişlerde alan yok; bir sonraki eşitlemede dolar.
- **Trendyol iadeleri ve soruları** (`/yonetim/siparisler/trendyol-iade-soru`): son 30 günün iadeleri, depoya ulaşan (WaitingInAction) kalemleri onaylama (`claims/{id}/items/approve`); ret talebi fotoğraf istediği için Trendyol panelinde. Cevap bekleyen sorular ve cevaplama (`qna/.../questions/{id}/answers`, 10–2000 karakter).
- **Kargo etiketi:** Trendyol sipariş sayfasında “Kargo etiketini indir (ZPL)” — ortak etiket (TEX / Aras, Trendyol öder), termal yazıcı içindir.
- Ana sayfada “Faturası kesilecek” ve “Faturası müşteriye iletilmedi” iş kalemleri; muhasebeci Excel'inde “Faturalar” sayfası. Para biçimi panelin her yerinde “12.999 TL / 12.999,50 TL”.

## Otomatik işler ve tek tuş (21.11.2026)

- **Bugünkü işler** (`/yonetim/isler`, ana sayfada “Tek tuşla işleri yap”): “Hepsini şimdi yap” = eşitleme + aşağıdaki otomatik işler hemen. Altında yalnız elle yapılacaklar (fatura kesmek, HB'ye fatura yüklemek, paketlemek, eşleşmeyen ürün) sayılarıyla listelenir.
- Zamanlayıcı (GitHub Actions, 5 dk) her eşitlemeden sonra `lib/otomasyon.ts` `otomatikIsler()`'i çalıştırır (süre kalırsa; fonksiyon 60 sn sınırı): yeni Trendyol/HB siparişi → mağazaya e-posta (`pazaryeri-yeni`, siparişte bir kez); isteğe bağlı yeni Trendyol paketi → Picking; iletilemeyen faturalar 30 dk'da bir yeniden denenir (en fazla 3, 14 gün); isteğe bağlı değişen fiyatlar Trendyol'a; günde bir ilan onayları + Trendyol hakedişi (son 15 gün). Ayarlar `envanter_ayarlari.otomasyon` (otoToplama ve otoFiyat varsayılan kapalı), son 20 işlem özeti panelde.
- Müşteri soruları arayüzden kaldırıldı (kullanıcı isteği); servis fonksiyonları `trendyolApi.ts`'de duruyor.
- Faturanın kendisi otomatik **kesilmez**: GİB e-Arşiv Portalı'nın resmî bir programlama arayüzü yok. Tam otomatik kesim için ücretli özel entegratör (e-Arşiv API'si olan bir firma) gerekir; seçilirse `faturaIlet` öncesine “kes” adımı eklenir.
