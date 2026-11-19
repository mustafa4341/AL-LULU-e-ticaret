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
  adapter: vercelOrtam
    ? vercel({ includeFiles: ['./public/img/logo/yazi.png'], maxDuration: 60 }) // 60 sn her Vercel planında geçerli (Hobby dahil)
    : node({ mode: 'standalone' }),
  trailingSlash: 'never',
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  security: {
    checkOrigin: false, // src/middleware.ts aynı origin'i zorunlu tutar; PayTR bildirimi kendi imzasıyla doğrulanır
    // ZORUNLU: Astro 5.14+ bu liste olmadan canlı sunucuda adresi "localhost" sayar.
    // O zaman sipariş, ödeme ve panel formları 403 verir, e-postalardaki bağlantılar localhost olur.
    allowedDomains: [
      { protocol: 'https', hostname: ALAN },
      { protocol: 'https', hostname: `www.${ALAN}` },
      { protocol: 'https', hostname: '**.vercel.app' },
      { protocol: 'http', hostname: 'localhost' },  // yerelde `npm run preview` / test
      { protocol: 'http', hostname: '127.0.0.1' },
    ],
  },
  devToolbar: { enabled: false },
});
