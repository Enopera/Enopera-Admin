-- Cron jobs per richiamare le Edge Functions periodicamente.
-- Da eseguire una sola volta nel SQL Editor (quando le functions saranno deployate
-- e le STARTY_* secrets configurate).

-- Abilita pg_cron + pg_net se non già attivi (in genere su Supabase sono pre-installati)
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;

-- Variabili d'esempio (sostituisci PROJECT_REF):
--   url:     https://<PROJECT_REF>.supabase.co/functions/v1/<function-name>
--   headers: { Authorization: "Bearer <ANON_KEY>" }

-- Ogni 15 minuti — sync giacenze
select cron.schedule(
  'sync-stock',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-stock',
      headers := jsonb_build_object(
        'Authorization', 'Bearer YOUR_ANON_KEY',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Ogni 6 ore — sync catalogo prodotti
select cron.schedule(
  'sync-products',
  '0 */6 * * *',
  $$
    select net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-products',
      headers := jsonb_build_object(
        'Authorization', 'Bearer YOUR_ANON_KEY',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Per disabilitare un job:
--   select cron.unschedule('sync-stock');
-- Per vedere i job attivi:
--   select * from cron.job;
