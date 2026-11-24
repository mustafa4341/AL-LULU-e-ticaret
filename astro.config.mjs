// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';

const SITE = 'https://alluluhome.com'; // gerçek alan adı (değişirse burayı ve paneldeki "Site Adresi"ni değiştirin)
const ALAN = new URL(SITE).hostname.replace(/^www\./, '');
const vercelOrtam = Boolean(process.env.VERCEL);

export default defineConfig({
  site: SITE,
  output: 'server',              // sayfalar her istekte güncel veriyle üretilir (panel değişiklikleri anında yansır)
  // Sunucu bölgesi vercel.json'da: hnd1 (Tokyo). Supabase veritabanı Tokyo'da (ap-northeast-1); sunucu
  // Frankfurt'tayken her veri okuması ~250 ms dünyayı dolaşıyordu, panel sayfaları 2–5 sn sürüyordu.
  // Veritabanı başka bölgeye taşınırsa bu bölge de onunla aynı yapılmalı.
  adapter: vercelOrtam
    ? vercel({
      includeFiles: [
        './public/img/logo/yazi.png',
        './public/fonts/DejaVuSans.ttf',
        './public/fonts/DejaVuSans-Bold.ttf',
      ],
      maxDuration: 60,
    }) // 60 sn her Vercel planında geçerli (Hobby dahil)
    : node({ mode: 'standalone' }),
  trailingSlash: 'never',
  // Önyükleme yalnız açıkça işaretli (data-astro-prefetch) vitrin bağlantılarında. Eskiden TÜM bağlantılar fareyle
  // üzerine gelince yükleniyordu: "Yedek indir"e gelmek yedeği alınmış sayıyor, "Müşteri gibi bak" çerezi kendiliğinden
  // açılıyor, Trendyol menüleri canlı API'yi çağırıyordu (denetim AUD-006).
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  security: {
    checkOrigin: false, // src/middleware.ts aynı origin'i zorunlu tutar; PayTR bildirimi kendi imzasıyla doğrulanır
    // ZORUNLU: Astro 5.14+ bu liste olmadan canlı sunucuda adresi "localhost" sayar.
    // O zaman sipariş, ödeme ve panel formları 403 verir, e-postalardaki bağlantılar localhost olur.
    allowedDomains: [
      { protocol: 'https', hostname: ALAN },
      { protocol: 'https', hostname: `www.${ALAN}` },
      // Yalnız bu projenin Vercel adresi (eskiden her *.vercel.app kabul ediliyordu — denetim AUD-009).
      // Dal önizlemelerinde (rastgele adlı *.vercel.app) formlar bu yüzden 403 verir; önizlemede panel denenecekse adı buraya ekleyin.
      { protocol: 'https', hostname: 'al-lulu-e-ticaret.vercel.app' },
      { protocol: 'http', hostname: 'localhost' },  // yerelde `npm run preview` / test
      { protocol: 'http', hostname: '127.0.0.1' },
    ],
  },
  // Astro'nun /_image dönüştürücüsü kullanılmıyor (görseller lib/depo.ts'de işleniyor). Açıklı sharp/libheif yolu
  // dışarıdan tetiklenemesin diye işlem yapmayan servis seçildi (denetim AUD-009).
  image: { service: { entrypoint: 'astro/assets/services/noop' } },
  devToolbar: { enabled: false },
});
