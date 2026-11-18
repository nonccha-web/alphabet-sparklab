import test from 'node:test';
import assert from 'node:assert/strict';
import {trackingRoute} from '../worker/tracking.ts';
import {createHandler,origin} from '../supabase/functions/website-tracking/handler.ts';
const id=crypto.randomUUID(),visitor=crypto.randomUUID();
function request(body,o=origin,extra={}){return new Request('https://collector.test',{method:'POST',headers:{origin:o,'Content-Type':'application/json',...extra},body:JSON.stringify(body)})}
test('retired gateway cannot record or dispatch',async()=>{
 for(const path of ['/t/request-quotation','/t/project-start','/t/facade-care','/api/tracking/consent']) assert.equal((await trackingRoute(new Request('https://test'+path),{})).status,410);
});
test('collector accepts only original pages, strips query, preserves visitor identity',async()=>{
 const calls=[];const handler=createHandler(async(...a)=>{calls.push(a);return{}},'secret');
 assert.equal((await handler(request({action:'visit',id,visitor,page:origin+'/request-quotation.html'},'https://evil.test'))).status,403);
 assert.equal((await handler(request({action:'visit',id,visitor,page:origin+'/other.html'}))).status,400);
 assert.equal(calls.length,0);
 for(const slug of ['request-quotation','project-start','facade-care']){
 const r=await handler(request({action:'visit',id,visitor,page:origin+'/'+slug+'.html?fbclid=private'}));assert.equal(r.status,200);assert.ok((await r.json()).ticket);assert.equal(calls.at(-1)[1].p_visitor,visitor);assert.equal(calls.at(-1)[1].p_source,origin+'/'+slug+'.html');}
});
test('signed consent, GPC suppression, event ID shared by browser and CAPI',async()=>{
 const calls=[],sent=[];const event={event_id:crypto.randomUUID(),event_name:'Project Start'};
 const handler=createHandler(async(path,b)=>{calls.push([path,b]);if(path.startsWith('tracking_settings'))return[{pixel_id:'1038711025904592',window_confirmed:true,meta_enabled:true}];if(path==='rpc/tracking_consent')return b.p_granted?{dispatch:true,event,visit:{visitor_id:visitor}}:{dispatch:false};return{}},'secret','token',undefined,async(e)=>{sent.push(e);return{accepted:true}});
 const {ticket}=await(await handler(request({action:'visit',id,visitor,page:origin+'/project-start.html'}))).json();
 assert.equal((await handler(request({action:'consent',ticket:ticket+'x',granted:true}))).status,401);
 assert.equal((await handler(request({action:'consent',ticket:'',granted:true}))).status,401);
 await handler(request({action:'consent',ticket,granted:false}));await handler(request({action:'consent',ticket,granted:true},origin,{'sec-gpc':'1'}));assert.equal(sent.length,0);assert.ok(calls.some(([path,b])=>path==='rpc/tracking_opt_out'&&b.p_visitor===visitor));
 const r=await(await handler(request({action:'consent',ticket,granted:true}))).json();assert.equal(r.event_id,sent[0].event_id);assert.equal(r.event_name,'Project Start');assert.equal(r.pixel_id,'1038711025904592');assert.equal(r.accepted,true);
});

test('automatic requests use separate permission RPC; GPC still blocks sending',async()=>{
 const calls=[],sent=[];const event={event_id:crypto.randomUUID(),event_name:'Project Start'};
 const handler=createHandler(async(path,b)=>{calls.push([path,b]);if(path.startsWith('tracking_settings'))return[{pixel_id:'1038711025904592',window_confirmed:true,meta_enabled:true,automatic_delivery_enabled:true}];if(path==='rpc/tracking_automatic')return{dispatch:true,event,visit:{visitor_id:visitor,consent:'unknown'}};return{}},'secret','token',undefined,async(e,v)=>{sent.push(v);return{accepted:true}});
 const {ticket}=await(await handler(request({action:'visit',id,visitor,page:origin+'/project-start.html'}))).json();
 await handler(request({action:'automatic',ticket,granted:true},origin,{'sec-gpc':'1'}));assert.equal(sent.length,0);
 const result=await(await handler(request({action:'automatic',ticket,granted:true}))).json();assert.equal(result.event_id,event.event_id);assert.equal(sent[0].consent,'unknown');assert.equal(calls.some(([p])=>p==='rpc/tracking_consent'),false);
});
