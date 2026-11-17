// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://allulu.com.tr', // DOĞRULA: gerçek alan adı
  output: 'server',              // sayfalar her istekte güncel veriyle üretilir (panel değişiklikleri anında yansır)
  adapter: node({ mode: 'standalone' }),
  trailingSlash: 'never',
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  security: { checkOrigin: true }, // başka sitelerden form gönderimini engeller (CSRF)
  devToolbar: { enabled: false },
});
