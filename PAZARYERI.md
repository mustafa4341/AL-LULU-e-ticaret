# Web, Trendyol ve Hepsiburada satış akışı

Yönetim panelindeki **Siparişler** ekranında kanal ve durum filtreleri, sipariş numarası araması ve **İşlem gerekli** görünümü bulunur. **Satış kanalları** ekranı son çekimi, ilan eşleştirmelerini, stok onaylarını ve son stok hareketlerini gösterir.

## Canlıya geçiş sırası

1. Supabase ve mevcut kanal stoklarının yedeğini alın. `supabase/migrations` klasöründeki `20261119150000`, `20261119151000` ve `20261119152000` migration’larını zaman damgası sırasıyla uygulayın. Web siparişinin yeni atomik kayıt fonksiyonu uygulama yayına alınmadan önce veritabanında bulunmalı.
2. Ayrı bir Supabase projesi ve ayrı bir test dağıtımıyla PayTR, Trendyol Stage ve Hepsiburada Test akışını doğrulayın. Ortam değişkenlerinin listesi `.env.example` dosyasında. Test ortamında `PAZARYERI_TEST_VERITABANI=1` kullanın. Canlı ve test hesapları aynı senkron işinde kullanılamaz.
3. Canlıda satışları kısa süreliğine durdurup depoyu sayın. Sayıma kadar gelen siparişleri, ayrılmış ürünleri ve depoya dönen iadeleri hesaplayın. Panel stok alanına, açık PayTR oturumlarına ayrılan adetler dahil olmak üzere siparişe henüz düşülmemiş satılabilir adedi girin. **Satış kanalları** ekranında her kanal için sayımın tamamlandığı tarihi ve saati (Türkiye saati) kaydedin. Bundan eski ilk kez görülen siparişler geçmiş kayıt olarak kalır. Geçiş öncesinde depoda hesaba katılmış ama geçiş sonrasında iade edilen eski satışlar için stok düzeltmesini fiziksel kontrolden sonra elle girin.
4. İlanları ürün kartlarına bağlayın. Trendyol’da satıcı panelindeki ilan barkodunu, Hepsiburada’da `merchantSku` değerini girin. Setin birden çok depo kalemine ayrılması web tarafında destekleniyor. Ayrı bir pazaryeri set ilanını tek bir bileşenin koduyla eşleştirmeyin. Böyle bir ilan için otomasyon öncesi set reçetesi gerekir.
5. Canlı API bilgilerini sunucu ortam değişkenlerine girin ve ilgili `*_ORTAM` değerini `canli` yapın. `PAZARYERI_STOK_YAZ=0` ile **Şimdi eşitle** düğmesini kullanarak önce siparişleri ve merkezi stok hareketlerini doğrulayın. Satıcı panelindeki sipariş numarası, adet, durum ve kargo terminini karşılaştırın. Bir kanalı pilot olarak açıyorsanız diğer kanalın satışını bu aşamada kapalı tutun.
6. Mevcut ilan adetlerini gözden geçirip ilk stokları satıcı panellerinden düşük adetle açın. `PAZARYERI_STOK_YAZ=1` ayarı otomatik stok düşüşü ve kapatılan ilanı sıfırlama işlemini açar. Otomatik stok artışı ayrıca `PAZARYERI_STOK_ARTIR=1` ister. İlk pilotta artışı kapalı tutun. Stok gönderimi sürerken yeni bir gönderim yapılmaz. Kanal cevabıyla doğrulanan değer **Kanalda** alanında görünür.
7. Zamanlayıcıyı açın ve üç kanalda uçtan uca test siparişiyle web rezervasyonunu, başarılı ödemeyi, iptali, kargo durumunu ve stok düşümünü kontrol edin. Paket bölünmesi, tekrar eden sipariş bildirimi ve iade teslim alma senaryolarını da pilotta doğrulayın.

## Otomatik çalıştırma

Her 2 dakikada bir `GET https://alluluhome.com/api/pazaryeri-senkron` isteği gönderin. `Authorization` başlığının değeri `Bearer <CRON_SECRET>` olmalı. En az 32 karakterlik `CRON_SECRET` oluşturun ve yalnızca sunucuda ve zamanlayıcıda saklayın. Elle çalıştırma ve zamanlayıcı aynı veritabanı kilidini kullanır. Eşzamanlı istek bir önceki işi tamamlanmaya bırakır. Zamanlayıcıda HTTP 503 uyarısını izleyin ve ayrıntılar için **Satış kanalları** ekranına bakın.

Vercel Cron kullanılıyorsa iki dakikalık zamanlama için Pro veya uygun bir ticari plan gerekir. Hobby’de yüksek frekanslı tanım dağıtımı engelleyebildiği için repoda varsayılan cron tanımı yoktur. Uygun plan doğrulanınca `vercel.json` içine `{"crons":[{"path":"/api/pazaryeri-senkron","schedule":"*/2 * * * *"}]}` eklenebilir. Yetkili HTTPS zamanlayıcı da aynı uç noktayı kullanabilir. [Vercel Cron sınırları](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing)

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
