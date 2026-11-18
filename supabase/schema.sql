-- All raw records are private. Only the server service role can call RPCs.
create table public.tracking_settings (
 id boolean primary key default true check(id), pixel_id text not null,
 window_days integer not null default 30 check(window_days between 1 and 730),
 window_mode text not null default 'rolling' check(window_mode in ('rolling','campaign')),
 campaign_start timestamptz, campaign_end timestamptz,
 window_version uuid not null default gen_random_uuid(), window_confirmed boolean not null default false,
 meta_enabled boolean not null default false, bridge_key_hash text,
 check(window_mode='rolling' or (campaign_start is not null and campaign_end>campaign_start))
);
insert into public.tracking_settings(id,pixel_id) values(true,'1038711025904592');
create table public.tracking_links(slug text primary key,event_name text not null unique,destination text not null);
insert into public.tracking_links values
 ('request-quotation','Request Quotation','https://www.alphabetfacade.com/request-quotation.html'),
 ('project-start','Project Start','https://www.alphabetfacade.com/project-start.html'),
 ('facade-care','Facade Care','https://www.alphabetfacade.com/facade-care.html');
create table public.tracking_uniques(
 id uuid primary key default gen_random_uuid(),visitor_id uuid not null,link_slug text not null references public.tracking_links,
 window_version uuid not null,starts_at timestamptz not null,ends_at timestamptz not null,
 created_at timestamptz not null default now(), unique(visitor_id,link_slug,window_version,starts_at)
);
create index tracking_unique_lookup on public.tracking_uniques(visitor_id,link_slug,window_version,ends_at);
create table public.tracking_visits(
 id uuid primary key,visitor_id uuid not null,link_slug text not null references public.tracking_links,
 unique_id uuid references public.tracking_uniques, is_unique boolean not null default false,
 created_at timestamptz not null default now(),consent text not null default 'unknown' check(consent in ('unknown','granted','denied')),
 consent_at timestamptz, consent_version text,source_url text not null,user_agent text
);
create index tracking_visits_date on public.tracking_visits(created_at,link_slug);
create index tracking_visits_unique on public.tracking_visits(unique_id);
create table public.tracking_meta_events(
 event_id uuid primary key references public.tracking_uniques(id),visit_id uuid not null references public.tracking_visits,
 event_name text not null,event_time timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','sending','accepted','failed')),
 attempts integer not null default 0,accepted_at timestamptz,error_code text,fbtrace_id text,
 browser_dispatched_at timestamptz,locked_at timestamptz
);
create index tracking_meta_visit on public.tracking_meta_events(visit_id);
create or replace function public.tracking_record_visit(p_id uuid,p_visitor uuid,p_slug text,p_source text,p_ua text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare s tracking_settings; u tracking_uniques; v tracking_visits; fresh boolean:=false; t timestamptz:=now();
begin
 select * into s from tracking_settings where id;
 perform pg_advisory_xact_lock(hashtextextended(p_visitor::text||':'||p_slug,0));
 select * into v from tracking_visits where id=p_id;
 if found then return to_jsonb(v); end if;
 if not exists(select 1 from tracking_links where slug=p_slug) then raise exception 'Unknown link'; end if;
 if s.window_mode='rolling' or (t>=s.campaign_start and t<s.campaign_end) then
 select * into u from tracking_uniques where visitor_id=p_visitor and link_slug=p_slug and window_version=s.window_version and starts_at<=t and ends_at>t order by starts_at desc limit 1;
 if not found then
 insert into tracking_uniques(visitor_id,link_slug,window_version,starts_at,ends_at)
 values(p_visitor,p_slug,s.window_version,case when s.window_mode='campaign' then s.campaign_start else t end,case when s.window_mode='campaign' then s.campaign_end else t+make_interval(days=>s.window_days) end) returning * into u;
 fresh:=true;
 end if;
 end if;
 insert into tracking_visits(id,visitor_id,link_slug,unique_id,is_unique,source_url,user_agent) values(p_id,p_visitor,p_slug,u.id,fresh,p_source,left(p_ua,512)) returning * into v;
 return to_jsonb(v);
end $$;
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
 if e.status='accepted' or e.status='sending' or e.attempts>=6 or e.event_time<now()-interval '47 hours' then return jsonb_build_object('dispatch',false); end if;
 update tracking_meta_events set status='sending',locked_at=now(),attempts=attempts+1 where event_id=e.event_id;
 return jsonb_build_object('dispatch',true,'event',to_jsonb(e),'visit',to_jsonb(v));
end $$;
alter table public.tracking_settings enable row level security;
alter table public.tracking_links enable row level security;
alter table public.tracking_uniques enable row level security;
alter table public.tracking_visits enable row level security;
alter table public.tracking_meta_events enable row level security;
revoke all on public.tracking_settings,public.tracking_links,public.tracking_uniques,public.tracking_visits,public.tracking_meta_events from anon,authenticated;
revoke all on function public.tracking_record_visit(uuid,uuid,text,text,text),public.tracking_consent(uuid,uuid,boolean,boolean) from public,anon,authenticated;
grant all on public.tracking_settings,public.tracking_links,public.tracking_uniques,public.tracking_visits,public.tracking_meta_events to service_role;
grant execute on function public.tracking_record_visit(uuid,uuid,text,text,text),public.tracking_consent(uuid,uuid,boolean,boolean) to service_role;
create or replace function public.tracking_stats(p_start timestamptz,p_end timestamptz)
returns jsonb language sql stable security invoker set search_path=public as $$
select jsonb_build_object(
 'links',(select jsonb_agg(jsonb_build_object('slug',l.slug,'event_name',l.event_name,'destination',l.destination,'visits',(select count(*) from tracking_visits v where v.link_slug=l.slug and v.created_at>=p_start and v.created_at<p_end),'uniques',(select count(*) from tracking_visits v where v.link_slug=l.slug and v.is_unique and v.created_at>=p_start and v.created_at<p_end),'consented',(select count(*) from tracking_visits v where v.link_slug=l.slug and v.consent='granted' and v.created_at>=p_start and v.created_at<p_end),'accepted',(select count(*) from tracking_meta_events e join tracking_uniques u on u.id=e.event_id where u.link_slug=l.slug and e.event_time>=p_start and e.event_time<p_end and e.status='accepted'),'failed',(select count(*) from tracking_meta_events e join tracking_uniques u on u.id=e.event_id where u.link_slug=l.slug and e.event_time>=p_start and e.event_time<p_end and e.status='failed'))) from tracking_links l),
 'daily',(select coalesce(jsonb_agg(x),'[]') from (select (v.created_at at time zone 'Asia/Bangkok')::date as day,v.link_slug,count(*) as visits,count(*) filter(where v.is_unique) as uniques from tracking_visits v where v.created_at>=p_start and v.created_at<p_end group by 1,2 order by 1) x),
 'meta_daily',(select coalesce(jsonb_agg(x),'[]') from (select (e.event_time at time zone 'Asia/Bangkok')::date as day,u.link_slug,count(*) filter(where e.status='accepted') as accepted from tracking_meta_events e join tracking_uniques u on u.id=e.event_id where e.event_time>=p_start and e.event_time<p_end group by 1,2 order by 1) x)
);
$$;
revoke all on function public.tracking_stats(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.tracking_stats(timestamptz,timestamptz) to service_role;
