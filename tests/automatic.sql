begin;
do $$
declare visitor uuid:=gen_random_uuid(); visit uuid:=gen_random_uuid(); repeat_visit uuid:=gen_random_uuid(); c jsonb; claim jsonb; event uuid;
begin
 perform tracking_record_visit(visit,visitor,'project-start','https://www.alphabetfacade.com/project-start.html','SQL rollback test');
 c:=tracking_automatic(visit,visitor,true);
 if c->>'dispatch'!='true' then raise exception 'Automatic dispatch missing'; end if;
 if not exists(select 1 from tracking_visits where id=visit and consent='unknown' and consent_at is null and automatic_delivery_allowed) then raise exception 'Consent incorrectly recorded'; end if;
 event:=(c->'event'->>'event_id')::uuid;
 perform tracking_record_visit(repeat_visit,visitor,'project-start','https://www.alphabetfacade.com/project-start.html','SQL rollback test');
 if tracking_automatic(repeat_visit,visitor,true)->>'dispatch'!='false' then raise exception 'Duplicate dispatch'; end if;
 update tracking_meta_events set status='failed',next_attempt_at=now()-interval '1 minute' where event_id=event;
 c:=tracking_claim_retries(10);
 select value into claim from jsonb_array_elements(c) where value->'event'->>'event_id'=event::text;
 if claim is null then raise exception 'Automatic retry missing'; end if;
 perform tracking_opt_out(visitor);
 update tracking_meta_events set status='failed',next_attempt_at=now()-interval '1 minute' where event_id=event;
 c:=tracking_claim_retries(10);
 if exists(select 1 from jsonb_array_elements(c) where value->'event'->>'event_id'=event::text) then raise exception 'Opt-out ignored'; end if;
 if tracking_automatic(repeat_visit,visitor,true)->>'dispatch'!='false' then raise exception 'Opt-out bypassed'; end if;
end $$;
select 'PASS' as result;
rollback;
