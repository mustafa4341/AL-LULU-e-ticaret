-- !!! DİKKAT (denetim AUD-031): Aşağıdaki adres CANLI siteye sabittir. Bu dosyayı bir TEST/STAGING Supabase projesine
-- !!! uygulamayın; uygularsanız test veritabanı 5 dakikada bir canlı siteyi tetikler. Test projesinde bu dosyayı atlayın
-- !!! ya da URL'yi test adresine çevirin.
-- Pazaryeri eşitlemesi için 5 dakikalık zamanlayıcı (GitHub Actions zamanlaması saatlerce gecikebiliyordu).
-- pg_cron her 5 dakikada canlı sitedeki /api/pazaryeri-senkron ucunu pg_net ile çağırır.
-- Anahtar depoda DEĞİL: Supabase Vault'ta 'zamanlayici_anahtari' adıyla durur (Vercel'deki ZAMANLAYICI_ANAHTARI ile aynı).
-- Anahtarı yenilemek: select vault.update_secret((select id from vault.secrets where name = 'zamanlayici_anahtari'), '<yeni>');
-- ve Vercel'de ZAMANLAYICI_ANAHTARI'nı aynı değerle güncelleyip yeniden yayınlayın.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname in ('pazaryeri-senkron', 'zamanlayici-temizlik');

select cron.schedule(
  'pazaryeri-senkron',
  '1-59/5 * * * *',
  $$
  select net.http_get(
    url := 'https://alluluhome.com/api/pazaryeri-senkron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'zamanlayici_anahtari'),
      'User-Agent', 'allulu-supabase-zamanlayici'
    ),
    timeout_milliseconds := 65000
  );
  $$
);

-- Zamanlayıcı kayıtları birikmesin: her gece 3 günden eski çalışma kayıtlarını sil.
select cron.schedule(
  'zamanlayici-temizlik',
  '17 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '3 days'; $$
);
