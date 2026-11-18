-- Owner approved lifetime deduplication; do not reset existing identity records.
alter table public.tracking_settings drop constraint tracking_settings_window_mode_check;
alter table public.tracking_settings drop constraint tracking_settings_check;
alter table public.tracking_settings add constraint tracking_settings_window_mode_check check(window_mode in ('rolling','campaign','lifetime'));
alter table public.tracking_settings add constraint tracking_settings_check check(window_mode in ('rolling','lifetime') or (campaign_start is not null and campaign_end>campaign_start));
create unique index tracking_lifetime_unique on public.tracking_uniques(visitor_id,link_slug) where ends_at='infinity'::timestamptz;
update public.tracking_uniques set ends_at='infinity'::timestamptz;
update public.tracking_settings set window_mode='lifetime',window_confirmed=true where id;
create or replace function public.tracking_record_visit(p_id uuid,p_visitor uuid,p_slug text,p_source text,p_ua text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare s tracking_settings; u tracking_uniques; v tracking_visits; fresh boolean:=false; t timestamptz:=now();
begin
 select * into s from tracking_settings where id;
 perform pg_advisory_xact_lock(hashtextextended(p_visitor::text||':'||p_slug,0));
 select * into v from tracking_visits where id=p_id;
 if found then return to_jsonb(v); end if;
 if not exists(select 1 from tracking_links where slug=p_slug) then raise exception 'Unknown link'; end if;
 if s.window_mode in ('rolling','lifetime') or (t>=s.campaign_start and t<s.campaign_end) then
 select * into u from tracking_uniques where visitor_id=p_visitor and link_slug=p_slug and (s.window_mode='lifetime' or (window_version=s.window_version and starts_at<=t and ends_at>t)) order by starts_at desc limit 1;
 if not found then
 insert into tracking_uniques(visitor_id,link_slug,window_version,starts_at,ends_at)
 values(p_visitor,p_slug,s.window_version,case when s.window_mode='campaign' then s.campaign_start else t end,case when s.window_mode='lifetime' then 'infinity'::timestamptz when s.window_mode='campaign' then s.campaign_end else t+make_interval(days=>s.window_days) end) returning * into u;
 fresh:=true;
 end if;
 end if;
 insert into tracking_visits(id,visitor_id,link_slug,unique_id,is_unique,source_url,user_agent) values(p_id,p_visitor,p_slug,u.id,fresh,p_source,left(p_ua,512)) returning * into v;
 return to_jsonb(v);
end $$;
