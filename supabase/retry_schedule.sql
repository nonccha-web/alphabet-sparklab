create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- A narrowly scoped key may call only the retry action. It cannot record visits or read statistics.
do $$ declare k text; begin
 if not exists(select 1 from vault.secrets where name='alphabet_retry_key') then
 k:=encode(extensions.gen_random_bytes(32),'hex');
 perform vault.create_secret(k,'alphabet_retry_key','Alphabet CAPI scheduled retries');
 else select decrypted_secret into k from vault.decrypted_secrets where name='alphabet_retry_key'; end if;
 update public.tracking_settings set retry_key_hash=encode(extensions.digest(k,'sha256'),'hex') where id;
end $$;
select cron.schedule('alphabet-capi-retry','* * * * *',$job$
 select net.http_post(
 url:='https://hvrclmycmpgmnpwyzznw.supabase.co/functions/v1/tracking-api',
 headers:=jsonb_build_object('Content-Type','application/json','x-tracking-key',(select decrypted_secret from vault.decrypted_secrets where name='alphabet_retry_key')),
 body:='{"action":"retry"}'::jsonb,timeout_milliseconds:=20000
 );
$job$);
