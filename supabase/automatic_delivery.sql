alter table public.tracking_settings add column automatic_delivery_enabled boolean not null default false;
alter table public.tracking_visits add column automatic_delivery_allowed boolean not null default false;
create function public.tracking_automatic(p_visit uuid,p_visitor uuid,p_ready boolean)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v tracking_visits; e tracking_meta_events; s tracking_settings;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_visitor::text,1));
 select * into v from tracking_visits where id=p_visit and visitor_id=p_visitor for update;
 if not found or v.created_at<now()-interval '1 hour' then raise exception 'Invalid visit'; end if;
 select * into s from tracking_settings where id;
 if not p_ready or not s.meta_enabled or not s.window_confirmed or not s.automatic_delivery_enabled or v.unique_id is null or exists(select 1 from tracking_visits where visitor_id=p_visitor and consent='denied') then return jsonb_build_object('dispatch',false); end if;
 update tracking_visits set automatic_delivery_allowed=true where id=p_visit returning * into v;
 insert into tracking_meta_events(event_id,visit_id,event_name,event_time) select v.unique_id,v.id,l.event_name,now() from tracking_links l where l.slug=v.link_slug on conflict do nothing;
 select * into e from tracking_meta_events where event_id=v.unique_id for update;
 if e.status!='pending' or e.attempts>0 then return jsonb_build_object('dispatch',false); end if;
 update tracking_meta_events set status='sending',locked_at=now(),attempts=1,lease_token=gen_random_uuid() where event_id=e.event_id returning * into e;
 return jsonb_build_object('dispatch',true,'event',to_jsonb(e),'visit',to_jsonb(v));
end $$;
create function public.tracking_opt_out(p_visitor uuid) returns void language plpgsql security invoker set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_visitor::text,1));
 update tracking_visits set consent='denied',consent_at=now(),consent_version='alphabet-opt-out-v1',automatic_delivery_allowed=false where visitor_id=p_visitor;
end $$;
revoke all on function public.tracking_automatic(uuid,uuid,boolean),public.tracking_opt_out(uuid) from public,anon,authenticated;
grant execute on function public.tracking_automatic(uuid,uuid,boolean),public.tracking_opt_out(uuid) to service_role;
create or replace function public.tracking_claim_retries(p_limit integer default 10) returns jsonb language plpgsql security invoker set search_path=public as $$
declare outbox jsonb; auto_enabled boolean;
begin
 if not exists(select 1 from tracking_settings where id and meta_enabled and window_confirmed) then return '[]'::jsonb; end if;
 select automatic_delivery_enabled into auto_enabled from tracking_settings where id;
 update tracking_meta_events set status='failed',retryable=false,error_code='retry_expired',next_attempt_at=null where status!='accepted' and (event_time<=now()-interval '47 hours' or attempts>=10) and (status!='sending' or locked_at<now()-interval '2 minutes');
 with candidates as (
 select e.event_id from tracking_meta_events e join tracking_visits v on v.id=e.visit_id
 where v.consent!='denied' and (v.consent='granted' or (v.automatic_delivery_allowed and auto_enabled)) and e.retryable and e.attempts<10 and e.event_time>now()-interval '47 hours'
 and ((e.status in ('pending','failed') and e.next_attempt_at<=now()) or (e.status='sending' and e.locked_at<now()-interval '2 minutes'))
 order by e.event_time limit least(greatest(p_limit,1),10) for update of e skip locked
 ), claimed as (
 update tracking_meta_events e set status='sending',locked_at=now(),lease_token=gen_random_uuid(),attempts=attempts+1 from candidates c where e.event_id=c.event_id returning e.*
 ) select coalesce(jsonb_agg(jsonb_build_object('event',to_jsonb(c),'visit',to_jsonb(v))),'[]'::jsonb) into outbox from claimed c join tracking_visits v on v.id=c.visit_id;
 return outbox;
end $$;
update public.tracking_settings set automatic_delivery_enabled=true where id;
