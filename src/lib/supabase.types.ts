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
      envanter_ayarlari: {
        Row: { id: number; surum: number; veri: Json; guncelleme: string };
        Insert: { id?: number; surum?: number; veri?: Json; guncelleme?: string };
        Update: { surum?: number; veri?: Json; guncelleme?: string };
        Relationships: [];
      };
      pazaryeri_siparisleri: {
        Row: { id: string; kanal: string; tarih: string; durum: string; surum: number; veri: Json; guncelleme: string; siparis_no: string };
        Insert: { id: string; kanal: string; tarih: string; durum: string; surum?: number; veri: Json; guncelleme?: string };
        Update: { tarih?: string; durum?: string; surum?: number; veri?: Json; guncelleme?: string };
        Relationships: [];
      };
      stok_hareketleri: {
        Row: { id: number; tarih: string; urun_id: string; onceki: number; sonraki: number; sebep: string };
        Insert: { id?: never; tarih?: string; urun_id: string; onceki: number; sonraki: number; sebep?: string };
        Update: never;
        Relationships: [];
      };
      eposta_kayitlari: {
        Row: {
          anahtar: string; siparis_no: string; tur: string; alici: string; durum: string; deneme: number;
          son_hata: string | null; mesaj_id: string | null; olusturma: string; gonderim: string | null; guncelleme: string;
        };
        Insert: {
          anahtar: string; siparis_no: string; tur: string; alici: string; durum?: string; deneme?: number;
          son_hata?: string | null; mesaj_id?: string | null; olusturma?: string; gonderim?: string | null; guncelleme?: string;
        };
        Update: {
          anahtar?: string; siparis_no?: string; tur?: string; alici?: string; durum?: string; deneme?: number;
          son_hata?: string | null; mesaj_id?: string | null; olusturma?: string; gonderim?: string | null; guncelleme?: string;
        };
        Relationships: [];
      };
      yorumlar: {
        Row: {
          id: string; siparis_no: string; urun_id: string; ad: string; puan: number; metin: string;
          durum: string; yanit: string | null; olusturma: string; guncelleme: string;
        };
        Insert: {
          id?: string; siparis_no: string; urun_id: string; ad: string; puan: number; metin?: string;
          durum?: string; yanit?: string | null; olusturma?: string; guncelleme?: string;
        };
        Update: {
          id?: string; siparis_no?: string; urun_id?: string; ad?: string; puan?: number; metin?: string;
          durum?: string; yanit?: string | null; olusturma?: string; guncelleme?: string;
        };
        Relationships: [];
      };
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
          fayda_alt_baslik: string | null;
          fayda_baslik: string | null;
          fayda_ust_baslik: string | null;
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
          fayda_alt_baslik?: string | null;
          fayda_baslik?: string | null;
          fayda_ust_baslik?: string | null;
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
          fayda_alt_baslik?: string | null;
          fayda_baslik?: string | null;
          fayda_ust_baslik?: string | null;
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
      panel_magaza_kaydet_sebep: { Args: { yeni_magaza: Json; beklenen_surum: number; sebep: string }; Returns: Json };
      panel_siparis_kaydet: { Args: { yeni_siparis: Json; eski_siparis: Json; yeni_magaza: Json; beklenen_surum: number }; Returns: Json };
      pazaryeri_kaydet: {
        Args: { kayitlar: Json; beklenen: Json; yeni_magaza: Json; beklenen_surum: number; ayarlar: Json; ayar_surum: number; sebep: string };
        Returns: Json;
      };
      pazaryeri_aktarim_kayitlari_oku: {
        Args: { p_kanal: string; p_siparis_nolari: string[]; p_son_id: string };
        Returns: { id: string; surum: number; veri: Json }[];
      };
      envanter_ayar_kaydet: { Args: { ayarlar: Json; ayar_surum: number }; Returns: number };
      pazaryeri_senkron_kilitle: { Args: { sahip: string }; Returns: boolean };
      pazaryeri_senkron_kilidi_birak: { Args: { sahip: string }; Returns: undefined };
      magaza_oku: { Args: Record<string, never>; Returns: Json };
      siparis_kaydet: { Args: { s: Json }; Returns: undefined };
      web_siparis_olustur: { Args: { yeni_siparis: Json; belge: Json | null }; Returns: undefined };
      siparisleri_oku: { Args: Record<string, never>; Returns: Json };
      sunucu_yetkili_mi: { Args: Record<string, never>; Returns: boolean };
      /** p_artir: 0 = oku, 1 = say, null = sıfırla → penceredeki deneme sayısı */
      istek_say: { Args: { p_anahtar: string; p_pencere_sn: number; p_artir: number | null }; Returns: number };
      eposta_gonderim_al: { Args: { p_anahtar: string; p_siparis_no: string; p_tur: string; p_alici: string; p_zorla?: boolean }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
