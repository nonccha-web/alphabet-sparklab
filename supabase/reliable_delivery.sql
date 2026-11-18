-- Preserve raw records and separate the explicitly identified setup tests.
alter table public.tracking_visits add column is_test boolean not null default false;
create table public.tracking_test_visitors(visitor_id uuid primary key,reason text not null default 'setup QA');
alter table public.tracking_test_visitors enable row level security;
revoke all on public.tracking_test_visitors from public,anon,authenticated;
grant all on public.tracking_test_visitors to service_role;
insert into public.tracking_test_visitors(visitor_id) select distinct visitor_id from public.tracking_visits where created_at between '2026-11-18T16:40:00+07:00' and '2026-11-18T16:43:30+07:00' on conflict do nothing;
update public.tracking_visits set is_test=true where created_at between '2026-11-18T16:40:00+07:00' and '2026-11-18T16:43:30+07:00';
create function public.tracking_tag_test() returns trigger language plpgsql security invoker set search_path=public as $$ begin new.is_test:=exists(select 1 from tracking_test_visitors where visitor_id=new.visitor_id); return new; end $$;
revoke all on function public.tracking_tag_test() from public,anon,authenticated;
grant execute on function public.tracking_tag_test() to service_role;
create trigger tracking_tag_test before insert on public.tracking_visits for each row execute function public.tracking_tag_test();
alter table public.tracking_meta_events add column retryable boolean not null default true, add column next_attempt_at timestamptz default now(), add column lease_token uuid;
alter table public.tracking_settings add column retry_key_hash text;
create index tracking_retry_due on public.tracking_meta_events(next_attempt_at) where status in ('pending','failed','sending');

create or replace function public.tracking_consent(p_visit uuid,p_visitor uuid,p_granted boolean,p_ready boolean)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v tracking_visits; e tracking_meta_events; s tracking_settings;
begin
 select * into v from tracking_visits where id=p_visit and visitor_id=p_visitor for update;
 if not found or v.created_at<now()-interval '1 hour' then raise exception 'Invalid visit'; end if;
 update tracking_visits set consent=case when p_granted then 'granted' else 'denied' end,consent_at=now(),consent_version='alphabet-marketing-v1' where id=p_visit;
 select * into s from tracking_settings where id;
 if not p_granted or not p_ready or not s.meta_enabled or not s.window_confirmed or v.unique_id is null then return jsonb_build_object('dispatch',false); end if;
 insert into tracking_meta_events(event_id,visit_id,event_name,event_time) select v.unique_id,v.id,l.event_name,now() from tracking_links l where l.slug=v.link_slug on conflict do nothing;
 select * into e from tracking_meta_events where event_id=v.unique_id for update;
 -- Only the first initial claim dispatches browser Pixel. Retries run through the outbox.
 if e.status!='pending' or e.attempts>0 then return jsonb_build_object('dispatch',false); end if;
 update tracking_meta_events set status='sending',locked_at=now(),attempts=1,lease_token=gen_random_uuid() where event_id=e.event_id returning * into e;
 return jsonb_build_object('dispatch',true,'event',to_jsonb(e),'visit',to_jsonb(v));
end $$;
create function public.tracking_claim_retries(p_limit integer default 10) returns jsonb language plpgsql security invoker set search_path=public as $$
declare outbox jsonb;
begin
 if not exists(select 1 from tracking_settings where id and meta_enabled and window_confirmed) then return '[]'::jsonb; end if;
 update tracking_meta_events set status='failed',retryable=false,error_code='retry_expired',next_attempt_at=null where status!='accepted' and (event_time<=now()-interval '47 hours' or attempts>=10) and (status!='sending' or locked_at<now()-interval '2 minutes');
 with candidates as (
 select e.event_id from tracking_meta_events e join tracking_visits v on v.id=e.visit_id
 where v.consent='granted' and e.retryable and e.attempts<10 and e.event_time>now()-interval '47 hours'
 and ((e.status in ('pending','failed') and e.next_attempt_at<=now()) or (e.status='sending' and e.locked_at<now()-interval '2 minutes'))
 order by e.event_time limit least(greatest(p_limit,1),10) for update of e skip locked
 ), claimed as (
 update tracking_meta_events e set status='sending',locked_at=now(),lease_token=gen_random_uuid(),attempts=attempts+1 from candidates c where e.event_id=c.event_id returning e.*
 ) select coalesce(jsonb_agg(jsonb_build_object('event',to_jsonb(c),'visit',to_jsonb(v))),'[]'::jsonb) into outbox from claimed c join tracking_visits v on v.id=c.visit_id;
 return outbox;
end $$;
create function public.tracking_finish_attempt(p_event uuid,p_lease uuid,p_accepted boolean,p_retryable boolean,p_error text,p_trace text) returns boolean language plpgsql security invoker set search_path=public as $$
begin
 update tracking_meta_events set status=case when p_accepted then 'accepted' else 'failed' end,accepted_at=case when p_accepted then now() else null end,retryable=not p_accepted and p_retryable and attempts<10,error_code=case when p_accepted then null else left(p_error,150) end,fbtrace_id=left(p_trace,200),next_attempt_at=case when not p_accepted and p_retryable and attempts<10 then now()+make_interval(secs=>least(3600,(60*power(2,attempts-1))::integer)) else null end,lease_token=null where event_id=p_event and lease_token=p_lease and status='sending';
 return found;
end $$;
revoke all on function public.tracking_claim_retries(integer),public.tracking_finish_attempt(uuid,uuid,boolean,boolean,text,text) from public,anon,authenticated;
grant execute on function public.tracking_claim_retries(integer),public.tracking_finish_attempt(uuid,uuid,boolean,boolean,text,text) to service_role;
create or replace function public.tracking_stats(p_start timestamptz,p_end timestamptz,p_mode text)
returns jsonb language sql stable security invoker set search_path=public as $$
with selected_visits as (select * from tracking_visits where (p_mode='test' and is_test) or (p_mode='live' and not is_test)), selected_events as (select e.* from tracking_meta_events e join selected_visits v on v.id=e.visit_id)
select jsonb_build_object(
 'mode',p_mode,'excluded_tests',(select count(*) from tracking_visits where is_test and created_at>=p_start and created_at<p_end),
 'links',(select jsonb_agg(jsonb_build_object('slug',l.slug,'event_name',l.event_name,'destination',l.destination,'visits',(select count(*) from selected_visits v where v.link_slug=l.slug and v.created_at>=p_start and v.created_at<p_end),'uniques',(select count(*) from selected_visits v where v.link_slug=l.slug and v.is_unique and v.created_at>=p_start and v.created_at<p_end),'consented',(select count(*) from selected_visits v where v.link_slug=l.slug and v.consent='granted' and v.created_at>=p_start and v.created_at<p_end),'accepted',(select count(*) from selected_events e join tracking_uniques u on u.id=e.event_id where u.link_slug=l.slug and e.event_time>=p_start and e.event_time<p_end and e.status='accepted'),'failed',(select count(*) from selected_events e join tracking_uniques u on u.id=e.event_id where u.link_slug=l.slug and e.event_time>=p_start and e.event_time<p_end and e.status='failed'))) from tracking_links l),
 'daily',(select coalesce(jsonb_agg(x),'[]') from (select (v.created_at at time zone 'Asia/Bangkok')::date as day,v.link_slug,count(*) as visits,count(*) filter(where v.is_unique) as uniques from selected_visits v where v.created_at>=p_start and v.created_at<p_end group by 1,2 order by 1) x),
 'meta_daily',(select coalesce(jsonb_agg(x),'[]') from (select (e.event_time at time zone 'Asia/Bangkok')::date as day,u.link_slug,count(*) filter(where e.status='accepted') as accepted from selected_events e join tracking_uniques u on u.id=e.event_id where e.event_time>=p_start and e.event_time<p_end group by 1,2 order by 1) x)
);
$$;
revoke all on function public.tracking_stats(timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.tracking_stats(timestamptz,timestamptz,text) to service_role;

create or replace function public.tracking_stats(p_start timestamptz,p_end timestamptz) returns jsonb language sql stable security invoker set search_path=public as $$ select tracking_stats(p_start,p_end,'live') $$;
