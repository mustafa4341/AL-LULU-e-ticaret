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
  }
}
