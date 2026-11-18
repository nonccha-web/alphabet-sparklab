import test from 'node:test';
import assert from 'node:assert/strict';
import {sign,seal,unseal,trackingRoute} from '../worker/tracking.ts';
const key='k'.repeat(64),env={TRACKING_BRIDGE_KEY:key};
test('signed first-party identity rejects forgery',async()=>{
 const value=await seal('visitor',key);assert.equal(await unseal(value,key),'visitor');assert.equal(await unseal(value+'x',key),null);assert.equal(await unseal(value,'wrong'),null);
});
test('unknown link does not write; known visits reuse browser identity',async()=>{
 const original=global.fetch;const calls=[];global.fetch=async(_,init)=>{calls.push(JSON.parse(init.body));return Response.json({})};
 try{
 assert.equal((await trackingRoute(new Request('https://tracking.test/t/missing'),env)).status,404);assert.equal(calls.length,0);
 const visitor='22222222-2222-4222-8222-222222222222';const ck='alphabet_vid='+await seal(visitor,key);
 for(let i=0;i<2;i++){const r=await trackingRoute(new Request('https://tracking.test/t/request-quotation?fbclid=secret',{headers:{cookie:ck,'User-Agent':'iPhone'}}),env);assert.equal(r.status,200);const text=await r.text();assert.ok(!text.includes('fbevents.js'));assert.ok(text.includes('ไม่ยินยอม'));assert.match(r.headers.get('set-cookie'),/HttpOnly/)}
 assert.equal(calls[0].visitor,visitor);assert.equal(calls[1].visitor,visitor);assert.notEqual(calls[0].id,calls[1].id);assert.equal(calls[0].source,'https://tracking.test/t/request-quotation');assert.equal(calls[0].ua,'iPhone');
 }finally{global.fetch=original}
});
test('consent requires matching cookie, signature, expiry and origin; GPC overrides allow',async()=>{
 const original=global.fetch;const calls=[];global.fetch=async(_,init)=>{calls.push(JSON.parse(init.body));return Response.json({dispatch:false})};
 try{
 const visitor=crypto.randomUUID(),visit=crypto.randomUUID();const ticket=await seal([visit,visitor,'facade-care',Date.now()+60000].join('|'),key);
 const post=async(origin,ck,choice='allow',gpc='0')=>trackingRoute(new Request('https://tracking.test/api/tracking/consent',{method:'POST',headers:{origin,cookie:ck,'sec-gpc':gpc},body:new URLSearchParams({ticket,choice})}),env);
 const ck='alphabet_vid='+await seal(visitor,key);
 assert.equal((await post('https://evil.test',ck)).status,403);assert.equal((await post('https://tracking.test','')).status,400);assert.equal(calls.length,0);
 const denied=await post('https://tracking.test',ck,'deny');assert.equal(denied.status,303);assert.equal(calls[0].granted,false);assert.equal(denied.headers.get('Location'),'https://www.alphabetfacade.com/facade-care.html');
 await post('https://tracking.test',ck,'allow','1');assert.equal(calls[1].granted,false);
 }finally{global.fetch=original}
});
test('browser event uses exact server event name and event_id',async()=>{
 const original=global.fetch;global.fetch=async()=>Response.json({dispatch:true,event_name:'Project Start',event_id:'stable-event',pixel_id:'1038711025904592'});
 try{
 const visitor=crypto.randomUUID();const ticket=await seal([crypto.randomUUID(),visitor,'project-start',Date.now()+60000].join('|'),key);
 const r=await trackingRoute(new Request('https://tracking.test/api/tracking/consent',{method:'POST',headers:{origin:'https://tracking.test',cookie:'alphabet_vid='+await seal(visitor,key)},body:new URLSearchParams({ticket,choice:'allow'})}),env);
 const text=await r.text();assert.ok(text.includes('Project Start'));assert.ok(text.includes('stable-event'));assert.ok(text.includes("fbq('trackCustom',c.event,{}, {eventID:c.id})"));assert.ok(!text.includes("'PageView'"));
 }finally{global.fetch=original}
});
