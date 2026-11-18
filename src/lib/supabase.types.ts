export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      kategoriler: {
        Row: {
          aciklama: string;
          ad: string;
          aktif: boolean;
          ana_sayfada_goster: boolean;
          guncelleme_tarihi: string;
          id: string;
          ikon: string;
          menude_goster: boolean;
          sira: number;
          yakinda_goster: boolean;
        };
        Insert: {
          aciklama?: string;
          ad: string;
          aktif?: boolean;
          ana_sayfada_goster?: boolean;
          guncelleme_tarihi?: string;
          id: string;
          ikon?: string;
          menude_goster?: boolean;
          sira?: number;
          yakinda_goster?: boolean;
        };
        Update: {
          aciklama?: string;
          ad?: string;
          aktif?: boolean;
          ana_sayfada_goster?: boolean;
          guncelleme_tarihi?: string;
          id?: string;
          ikon?: string;
          menude_goster?: boolean;
          sira?: number;
          yakinda_goster?: boolean;
        };
        Relationships: [];
      };
      magaza_yedekler: {
        Row: {
          id: number;
          kayit_tarihi: string;
          surum: number;
          veri: Json;
        };
        Insert: {
          id?: never;
          kayit_tarihi?: string;
          surum: number;
          veri: Json;
        };
        Update: {
          id?: never;
          kayit_tarihi?: string;
          surum?: number;
          veri?: Json;
        };
        Relationships: [];
      };
      medya_dosyalari: {
        Row: {
          aktif: boolean;
          boyut: number;
          icerik_turu: string;
          olusturulma_tarihi: string;
          veri_base64: string;
          yol: string;
        };
        Insert: {
          aktif?: boolean;
          boyut: number;
          icerik_turu?: string;
          olusturulma_tarihi?: string;
          veri_base64: string;
          yol: string;
        };
        Update: {
          aktif?: boolean;
          boyut?: number;
          icerik_turu?: string;
          olusturulma_tarihi?: string;
          veri_base64?: string;
          yol?: string;
        };
        Relationships: [];
      };
      setler: {
        Row: {
          aciklama: string;
          ad: string;
          aktif: boolean;
          durum: string;
          fiyatlama: Json;
          gorsel: Json | null;
          guncelleme_tarihi: string;
          id: string;
          kalemler: Json;
          one_cikan: boolean;
          rozet: string | null;
          sira_no: number;
        };
        Insert: {
          aciklama?: string;
          ad: string;
          aktif?: boolean;
          durum?: string;
          fiyatlama: Json;
          gorsel?: Json | null;
          guncelleme_tarihi?: string;
          id: string;
          kalemler?: Json;
          one_cikan?: boolean;
          rozet?: string | null;
          sira_no?: number;
        };
        Update: {
          aciklama?: string;
          ad?: string;
          aktif?: boolean;
          durum?: string;
          fiyatlama?: Json;
          gorsel?: Json | null;
          guncelleme_tarihi?: string;
          id?: string;
          kalemler?: Json;
          one_cikan?: boolean;
          rozet?: string | null;
          sira_no?: number;
        };
        Relationships: [];
      };
      siparisler: {
        Row: {
          durum: string;
          fatura: Json;
          gecmis: Json;
          guncelleme_tarihi: string;
          iptal_notu: string | null;
          kalemler: Json;
          kampanya_indirimi: number;
          kargo: number;
          kargo_firma: string | null;
          kargo_takip: string | null;
          musteri: Json;
          musteri_ad_soyad: string | null;
          musteri_tel: string | null;
          no: string;
          paytr: Json | null;
          paytr_ref: string | null;
          sepet_indirimi: number;
          set_indirimi: number;
          sozlesme_surumu: string | null;
          stok_dusuldu: boolean;
          tarih: string;
          teslimat: Json;
          token: string;
          toplam: number;
          urunler_toplami: number;
          yonetici_notu: string | null;
        };
        Insert: {
          durum: string;
          fatura: Json;
          gecmis?: Json;
          guncelleme_tarihi?: string;
          iptal_notu?: string | null;
          kalemler: Json;
          kampanya_indirimi?: number;
          kargo?: number;
          kargo_firma?: string | null;
          kargo_takip?: string | null;
          musteri: Json;
          musteri_ad_soyad?: string | null;
          musteri_tel?: string | null;
          no: string;
          paytr?: Json | null;
          paytr_ref?: string | null;
          sepet_indirimi?: number;
          set_indirimi?: number;
          sozlesme_surumu?: string | null;
          stok_dusuldu?: boolean;
          tarih?: string;
          teslimat: Json;
          token: string;
          toplam: number;
          urunler_toplami: number;
          yonetici_notu?: string | null;
        };
        Update: {
          durum?: string;
          fatura?: Json;
          gecmis?: Json;
          guncelleme_tarihi?: string;
          iptal_notu?: string | null;
          kalemler?: Json;
          kampanya_indirimi?: number;
          kargo?: number;
          kargo_firma?: string | null;
          kargo_takip?: string | null;
          musteri?: Json;
          musteri_ad_soyad?: string | null;
          musteri_tel?: string | null;
          no?: string;
          paytr?: Json | null;
          paytr_ref?: string | null;
          sepet_indirimi?: number;
          set_indirimi?: number;
          sozlesme_surumu?: string | null;
          stok_dusuldu?: boolean;
          tarih?: string;
          teslimat?: Json;
          token?: string;
          toplam?: number;
          urunler_toplami?: number;
          yonetici_notu?: string | null;
        };
        Relationships: [];
      };
      site_ayarlari: {
        Row: {
          ana_sayfa: Json;
          guncelleme: string;
          id: number;
          paytr_stok_islemleri: Json;
          site: Json;
          surum: number;
        };
        Insert: {
          ana_sayfa: Json;
          guncelleme?: string;
          id?: number;
          paytr_stok_islemleri?: Json;
          site: Json;
          surum?: number;
        };
        Update: {
          ana_sayfa?: Json;
          guncelleme?: string;
          id?: number;
          paytr_stok_islemleri?: Json;
          site?: Json;
          surum?: number;
        };
        Relationships: [];
      };
      sozlesmeler: {
        Row: {
          ip: string;
          mesafeli_satis: string;
          no: string;
          olusturulma_tarihi: string;
          on_bilgilendirme: string;
          onay_tarihi: string;
          surum: string;
          tarayici: string | null;
        };
        Insert: {
          ip: string;
          mesafeli_satis: string;
          no: string;
          olusturulma_tarihi?: string;
          on_bilgilendirme: string;
          onay_tarihi: string;
          surum: string;
          tarayici?: string | null;
        };
        Update: {
          ip?: string;
          mesafeli_satis?: string;
          no?: string;
          olusturulma_tarihi?: string;
          on_bilgilendirme?: string;
          onay_tarihi?: string;
          surum?: string;
          tarayici?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'sozlesmeler_no_fkey';
            columns: ['no'];
            isOneToOne: true;
            referencedRelation: 'siparisler';
            referencedColumns: ['no'];
          },
        ];
      };
      urunler: {
        Row: {
          ad: string;
          aktif: boolean;
          birlikte_iyi_gider: Json;
          cok_satan: boolean;
          dogrula: Json;
          durum: string;
          faydalar: Json;
          firsat: Json | null;
          fiyat: number;
          fiyat_gecmisi: Json;
          garanti: string | null;
          gorseller: Json;
          guncelleme_tarihi: string;
          hediye: string | null;
          id: string;
          kampanya: Json | null;
          kategoriler: Json;
          kisa_ad: string;
          kutu_icerigi: Json;
          marka: string;
          max_adet: number;
          oncelik: number;
          one_cikan: boolean;
          one_cikan_bilgiler: Json;
          ozet: string;
          pisirme: Json;
          pisirme_notu: string | null;
          rozetler: Json;
          sepette_indirim: number;
          sira_no: number;
          sku: string;
          sss: Json;
          stok: number;
          teknik: Json;
        };
        Insert: {
          ad: string;
          aktif?: boolean;
          birlikte_iyi_gider?: Json;
          cok_satan?: boolean;
          dogrula?: Json;
          durum?: string;
          faydalar?: Json;
          firsat?: Json | null;
          fiyat: number;
          fiyat_gecmisi?: Json;
          garanti?: string | null;
          gorseller?: Json;
          guncelleme_tarihi?: string;
          hediye?: string | null;
          id: string;
          kampanya?: Json | null;
          kategoriler?: Json;
          kisa_ad: string;
          kutu_icerigi?: Json;
          marka: string;
          max_adet?: number;
          oncelik?: number;
          one_cikan?: boolean;
          one_cikan_bilgiler?: Json;
          ozet?: string;
          pisirme?: Json;
          pisirme_notu?: string | null;
          rozetler?: Json;
          sepette_indirim?: number;
          sira_no?: number;
          sku?: string;
          sss?: Json;
          stok?: number;
          teknik?: Json;
        };
        Update: {
          ad?: string;
          aktif?: boolean;
          birlikte_iyi_gider?: Json;
          cok_satan?: boolean;
          dogrula?: Json;
          durum?: string;
          faydalar?: Json;
          firsat?: Json | null;
          fiyat?: number;
          fiyat_gecmisi?: Json;
          garanti?: string | null;
          gorseller?: Json;
          guncelleme_tarihi?: string;
          hediye?: string | null;
          id?: string;
          kampanya?: Json | null;
          kategoriler?: Json;
          kisa_ad?: string;
          kutu_icerigi?: Json;
          marka?: string;
          max_adet?: number;
          oncelik?: number;
          one_cikan?: boolean;
          one_cikan_bilgiler?: Json;
          ozet?: string;
          pisirme?: Json;
          pisirme_notu?: string | null;
          rozetler?: Json;
          sepette_indirim?: number;
          sira_no?: number;
          sku?: string;
          sss?: Json;
          stok?: number;
          teknik?: Json;
        };
        Relationships: [];
      };
    };
    Views: {
      ozet_gunluk_siparis_ciro: {
        Row: {
          bekleyen_tutar_tl: number | null;
          gun: string | null;
          iptal_edilen: number | null;
          odeme_bekleyen: number | null;
          onayli_ciro_tl: number | null;
          onayli_siparis: number | null;
          toplam_siparis: number | null;
        };
        Relationships: [];
      };
      ozet_urun_stok_ve_fiyat: {
        Row: {
          ad: string | null;
          cok_satan: boolean | null;
          durum: string | null;
          guncel_fiyat_tl: number | null;
          guncelleme_tarihi: string | null;
          id: string | null;
          kalan_stok: number | null;
          marka: string | null;
          one_cikan: boolean | null;
          sepette_indirim_yuzde: number | null;
          sku: string | null;
          stok_durumu: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      magaza_kaydet: { Args: { yeni_magaza: Json }; Returns: Json };
      panel_magaza_kaydet: { Args: { yeni_magaza: Json; beklenen_surum: number }; Returns: Json };
      panel_siparis_kaydet: { Args: { yeni_siparis: Json; eski_siparis: Json; yeni_magaza: Json; beklenen_surum: number }; Returns: Json };
      magaza_oku: { Args: Record<string, never>; Returns: Json };
      siparis_kaydet: { Args: { s: Json }; Returns: undefined };
      siparisleri_oku: { Args: Record<string, never>; Returns: Json };
      sunucu_yetkili_mi: { Args: Record<string, never>; Returns: boolean };
      /** p_artir: 0 = oku, 1 = say, null = sıfırla → penceredeki deneme sayısı */
      istek_say: { Args: { p_anahtar: string; p_pencere_sn: number; p_artir: number | null }; Returns: number };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
