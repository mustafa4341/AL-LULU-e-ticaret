/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly YONETIM_PAROLA?: string;
  readonly OTURUM_GIZLI?: string;
  readonly SUPABASE_URL?: string;
  readonly SUPABASE_KEY?: string;
  readonly SUPABASE_SUNUCU_ANAHTARI?: string;
  readonly PAYTR_MOD?: string;
  readonly PAYTR_SITE_URL?: string;
  readonly PAYTR_MERCHANT_ID?: string;
  readonly PAYTR_MERCHANT_KEY?: string;
  readonly PAYTR_MERCHANT_SALT?: string;
  readonly VERI_KLASORU?: string;
  readonly SMTP_HOST?: string;
  readonly SMTP_PORT?: string;
  readonly SMTP_KULLANICI?: string;
  readonly SMTP_PAROLA?: string;
  readonly SMTP_GONDEREN?: string;
  readonly EPOSTA_YANIT?: string;
  readonly SIPARIS_BILDIRIM_EPOSTA?: string;
  /** Google Tag Manager kapsayıcı kimliği, ör. GTM-ABC1234 (yalnız çerez onayıyla yüklenir) */
  readonly GTM_KIMLIGI?: string;
  /** Panelin gizli giriş adresi (lib/oturum.ts girisYolu) */
  readonly YONETIM_GIRIS_YOLU?: string;
  /** Asıl zamanlayıcı (Supabase pg_cron) anahtarı; anlık bildirim anahtarı da bundan türetilir */
  readonly ZAMANLAYICI_ANAHTARI?: string;
  /** Yedek zamanlayıcı (GitHub Actions) anahtarı */
  readonly CRON_SECRET?: string;
  readonly PAZARYERI_BILDIRIM_ANAHTARI?: string;
  readonly TRENDYOL_ORTAM?: string;
  readonly TRENDYOL_SATICI_ID?: string;
  readonly TRENDYOL_API_KEY?: string;
  readonly TRENDYOL_API_SECRET?: string;
  readonly HEPSIBURADA_ORTAM?: string;
  readonly HEPSIBURADA_MERCHANT_ID?: string;
  readonly HEPSIBURADA_KULLANICI?: string;
  readonly HEPSIBURADA_PAROLA?: string;
  readonly HEPSIBURADA_USER_AGENT?: string;
  readonly PAZARYERI_TEST_VERITABANI?: string;
  readonly PAZARYERI_STOK_YAZ?: string;
  readonly PAZARYERI_STOK_ARTIR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    katalog: import('./lib/katalog').Katalog;
    yonetici: boolean;
    vitrinOnizleme?: boolean;
    musteriGorunumu: boolean;
    /** Panelde yan menü sipariş sayısı (ara katmanda başlatılır, düzen bileşeninde beklenir) */
    panelRozet?: Promise<import('./lib/panelRozet').PanelRozeti>;
  }
}
