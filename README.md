# Al Lulu Home — mağaza + yönetim paneli

Mobil öncelikli e-ticaret sitesi ve yönetim paneli. [Astro](https://astro.build) ile sunucuda çalışır: panelde yaptığınız her değişiklik (fiyat, görsel, indirim, ürün…) sitede **anında** görünür.

## Çalıştırma (kendi bilgisayarınızda)

```bash
npm install
```

```bash
npm run dev
```

- Site: http://localhost:4321
- Yönetim paneli: http://localhost:4321/yonetim
- Panel parolası proje klasöründeki **`.env`** dosyasında, `YONETIM_PAROLA=` satırında. İstediğiniz zaman değiştirebilirsiniz (uzun ve tahmin edilemez olsun).

## Panelden neler yapılır?

| Ekran | Yapabildikleriniz |
|---|---|
| **Özet** | Bugünkü siparişler, gönderilecekler, ciro, stoğu azalan ürünler |
| **Ürünler** | Listeden hızlı fiyat/stok/durum değişikliği · Yeni ürün · Görsel yükleme/sıralama/silme · İndirim · Sepette indirim · Rozetler · Özellikler · SSS · Tamamlayıcı ürünler |
| **Siparişler** | Durum değiştirme (Ödendi → Hazırlanıyor → Kargoda → Teslim edildi), kargo takip no, müşteriye tek tıkla WhatsApp. "Ödendi"de stok otomatik düşer, "İptal"de geri eklenir. |
| **Setler** | Ürün kombinasyonları: yüzde ya da sabit set fiyatı. Sitede "Ayrı ayrı X TL → Set Y TL" olarak görünür. |
| **Kategoriler** | Ekle, sırala, ikon seç, menüde/ana sayfada göster |
| **Ayarlar** | WhatsApp/telefon, e-posta, kargo ücreti ve "kargo bedava" sınırı, kesim saati, taksit, üst şerit duyuruları, ana sayfa bölümleri ve sırası, satıcı (yasal) bilgileri |

Taslak ürünler sadece siz giriş yapmışken sitede görünür ("Örnek" etiketiyle), müşteriler göremez.

## İndirimler nasıl çalışır?

1. **Fiyat düşüşünü indirim olarak göstermek** (üstü çizili eski fiyat, kırmızı fiyat, "Son 30 günün en düşük fiyatı"): Eski fiyat **elle girilmez**; sistem fiyat geçmişinden otomatik hesaplar. Bu yasal kuraldır: eski fiyat, son 30 günde sitede gerçekten uygulanan en düşük fiyat olmalıdır.
   - Örnek: Vitaquick'i 14.000 TL'den 13.000 TL'ye indirimli göstermek için ürün en az 30 gün boyunca gerçekten 14.000 TL'den satışta olmalı. Sonra fiyatı 13.000 yapıp "indirim olarak göster" kutusunu işaretlersiniz.
   - Panel, kaydetmeden önce sitede ne görüneceğini önizler.
2. **Sepette indirim** (Trendyol'daki yeşil "Sepette %10 İndirim"): Hemen kullanılabilir, tamamen yasal. Ürün kartında yeşil "Sepette X TL" görünür, sepette otomatik düşer.
3. **Set indirimi:** Ayrı ayrı toplam ile set fiyatı arasındaki fark, gerçek kazanç olarak gösterilir.
4. **Otomatik rozetler:** "En Çok Satan" (gerçek satışlardan, eşik Ayarlar'da), "Son X Adet" (stok ≤ 3), "Kargo Bedava" (sınırın üzerindeki ürünler).

## Veriler ve yedek

- Tüm mağaza verisi: `veri/magaza.json` · Siparişler: `veri/siparisler.json` · Yüklenen görseller: `veri/yuklemeler/`
- Panelde her kayıtta `veri/yedekler/` altına otomatik yedek alınır (son 50 kayıt).
- **`veri/` klasörünü düzenli olarak yedekleyin**, siparişler oradadır.

## Yayına alma (canlı site)

Site bir **Node.js sunucusu** ve **kalıcı disk** ister (panelden yüklenen görseller ve siparişler diske yazılır).

```bash
npm run build
```

```bash
node --env-file=.env dist/server/entry.mjs
```

Uygun seçenekler: küçük bir VPS (ör. Hetzner, DigitalOcean) ya da kalıcı diski olan Render/Railway. Disk yerine bulut veritabanı (Supabase) kullanmak isterseniz yalnızca `src/lib/depo.ts` değişir; bu durumda Vercel'de de çalışır.

Canlıya almadan önce:
- `.env` içindeki parolayı değiştirin, `OTURUM_GIZLI` en az 32 karakter rastgele olsun.
- Siteyi HTTPS ile yayınlayın (oturum çerezi canlıda yalnızca HTTPS üzerinden gönderilir).

## Bildirimler (e-posta / SMS)

- **E-posta:** `.env` dosyasına SMTP bilgilerini yazın. Gmail için Google hesabınızda "Uygulama şifresi" oluşturun. Sipariş gelince hem size hem müşteriye e-posta gider.
- **SMS:** Bir SMS sağlayıcısıyla (Netgsm, İletimerkezi vb.) anlaşınca `src/lib/bildirim.ts → smsGonder()` doldurulacak.
- Ayar yoksa sipariş yine kaydedilir; bildirim sadece sunucu günlüğüne yazılır.

## Ödeme

Ödeme kuruluşu (iyzico / PayTR) henüz bağlı değil. Siparişler "Ödeme bekleniyor" durumunda kaydedilir. Bağlantı noktası: `src/pages/api/siparis.ts` (TODO). Fiyatlar ve stok sunucuda yeniden hesaplanır; tarayıcıdan gelen tutara güvenilmez.

## Güvenlik özeti

- Panel: parola + imzalı, HttpOnly, SameSite=Strict oturum çerezi (12 saat); IP başına giriş denemesi sınırı.
- Başka sitelerden gelen form gönderimleri engellenir (CSRF).
- Yüklenen görseller yeniden kodlanır (konum/EXIF bilgisi silinir) ve küçültülür.
- Taslak ürünler ve iç notlar canlı sitenin koduna girmez.
- Sipariş sayfaları tahmin edilemez bağlantıyla açılır; sipariş takibi "sipariş no + telefon" ister.

## Klasör yapısı

```
src/lib/        sema.ts (veri kuralları), depo.ts (dosya deposu), katalog.ts, fiyat.ts (sepet/indirim hesabı), oturum.ts, bildirim.ts
src/pages/      vitrin sayfaları · yonetim/ (panel) · api/siparis.ts · siparis/ · medya/ (yüklenen görseller)
src/components/ vitrin bileşenleri (UrunKarti, Fiyat, Galeri, AltMenu…)
src/scripts/    sepet.ts, ui.ts (animasyonlar), buyutec.ts (yakınlaştırma), odeme.ts, yonetim.ts
veri/           mağaza verisi, siparişler, yüklemeler, yedekler
```
