import test from 'node:test';import assert from 'node:assert/strict';
import {classifyMeta,deliver} from '../supabase/functions/tracking-api/delivery.ts';
const e={event_id:'same-id',event_name:'Facade Care',event_time:'2026-11-18T09:00:00Z',lease_token:'lease'};
const v={visitor_id:'test-visitor',source_url:'https://tracking.test/t/facade-care',user_agent:'test',is_test:true};
test('transient errors retry; authorization and validation failures stop',()=>{
 assert.equal(classifyMeta(429,{}).retryable,true);assert.equal(classifyMeta(503,{}).retryable,true);
 assert.equal(classifyMeta(400,{error:{is_transient:true}}).retryable,true);
 assert.equal(classifyMeta(400,{error:{code:190}}).retryable,false);
 assert.equal(classifyMeta(200,{events_received:0}).accepted,false);
 assert.equal(classifyMeta(200,{events_received:1}).accepted,true);
});
test('retry preserves exact event ID/name/time and commits only its lease',async()=>{
 const requests=[],writes=[];const db=async(p,b)=>writes.push({p,b});
 const fail=async(url,req)=>{requests.push(JSON.parse(req.body));return Response.json({error:{is_transient:true,code:2}},{status:503})};
 const success=async(url,req)=>{requests.push(JSON.parse(req.body));return Response.json({events_received:1,fbtrace_id:'trace'})};
 await deliver(e,v,'pixel','not-a-real-token','TEST_FAKE',db,fail);await deliver({...e,lease_token:'lease2'},v,'pixel','not-a-real-token','TEST_FAKE',db,success);
 assert.deepEqual(requests[0].data,requests[1].data);assert.equal(requests[0].test_event_code,'TEST_FAKE');
 assert.equal(writes[0].b.p_retryable,true);assert.equal(writes[1].b.p_accepted,true);assert.equal(writes[1].b.p_lease,'lease2');
});
test('network timeout is retained for retry and live events never get test code',async()=>{
 const writes=[];await deliver(e,{...v,is_test:false},'pixel','fake','TEST_FAKE',async(p,b)=>writes.push(b),async(url,req)=>{assert.equal(JSON.parse(req.body).test_event_code,undefined);throw Error('timeout')});
 assert.equal(writes[0].p_retryable,true);assert.equal(writes[0].p_error,'network_error');
});
