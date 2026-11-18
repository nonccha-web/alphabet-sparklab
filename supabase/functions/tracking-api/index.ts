import {deliver} from './delivery.ts';
// This endpoint authenticates the Sites server; never expose the bridge key in a browser.
const base = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function db(path:string, body?:unknown, method?:string) {
 const r=await fetch(base+'/rest/v1/'+path,{method:method||(body?'POST':'GET'),headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined});
 if(!r.ok) throw new Error('Database request failed: '+r.status); return r.status===204?null:r.json();
}
async function hash(v:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(x=>x.toString(16).padStart(2,'0')).join('')}
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 try {
 if(req.method!=='POST') return json({error:'Method not allowed'},405);
 const key=req.headers.get('x-tracking-key');if(!key||key.length!==64) return json({error:'Unauthorized'},401);
 const [s]=await db('tracking_settings?id=eq.true&select=*');
 const digest=await hash(key); const isBridge=digest===s.bridge_key_hash; const isRetry=digest===s.retry_key_hash;
 if(!isBridge&&!isRetry) return json({error:'Unauthorized'},401);
 const b=await req.json(); const token=Deno.env.get('META_CAPI_ACCESS_TOKEN');
 const ready=!!token&&s.window_confirmed&&s.meta_enabled;
 if(isRetry&&b.action!=='retry')return json({error:'Forbidden'},403);
 if(b.action==='retry'){
 if(!ready)return json({processed:0,reason:'delivery_disabled'});
 const claims=await db('rpc/tracking_claim_retries',{p_limit:10});
 const outcomes=await Promise.all(claims.map(async(c:any)=>{
 const current=await db('tracking_visits?id=eq.'+c.visit.id+'&select=consent');
 if(current[0]?.consent!=='granted'){
 await db('rpc/tracking_finish_attempt',{p_event:c.event.event_id,p_lease:c.event.lease_token,p_accepted:false,p_retryable:false,p_error:'consent_revoked',p_trace:null});return {accepted:false};}
 return deliver(c.event,c.visit,s.pixel_id,token!,Deno.env.get('META_TEST_EVENT_CODE'),db);
 }));
 return json({processed:outcomes.length,accepted:outcomes.filter((r:any)=>r.accepted).length});
 }
 if(b.action==='stats'){
 const start=new Date(b.start),end=new Date(b.end);
 if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||+end-+start>366*86400000) return json({error:'Invalid date range'},400);
 const result=await db('rpc/tracking_stats',{p_start:start.toISOString(),p_end:end.toISOString(),p_mode:b.mode==='test'?'test':'live'});
 return json({...result,settings:{pixel_id:s.pixel_id,window_days:s.window_days,window_mode:s.window_mode,campaign_start:s.campaign_start,campaign_end:s.campaign_end,window_confirmed:s.window_confirmed,meta_enabled:s.meta_enabled,token_configured:!!token,ready},updated_at:new Date().toISOString()});
 }
 if(b.action==='visit') return json(await db('rpc/tracking_record_visit',{p_id:b.id,p_visitor:b.visitor,p_slug:b.slug,p_source:b.source,p_ua:b.ua}));
 if(b.action==='consent'){
 const c=await db('rpc/tracking_consent',{p_visit:b.visit,p_visitor:b.visitor,p_granted:b.granted===true,p_ready:ready});
 if(!c.dispatch) return json({dispatch:false,ready});
 const e=c.event,v=c.visit; const {accepted}=await deliver(e,v,s.pixel_id,token!,Deno.env.get('META_TEST_EVENT_CODE'),db);
 return json({dispatch:true,event_id:e.event_id,event_name:e.event_name,pixel_id:s.pixel_id,accepted,is_test:v.is_test});
 }
 if(b.action==='browser-dispatched'){
 // Dispatch acknowledgement is not proof that Meta received a browser event.
 const visits=await db('tracking_visits?id=eq.'+b.visit+'&visitor_id=eq.'+b.visitor+'&consent=eq.granted&select=unique_id');
 if(visits[0]?.unique_id) await db('tracking_meta_events?event_id=eq.'+visits[0].unique_id,{browser_dispatched_at:new Date().toISOString()},'PATCH');
 return json({ok:true});
 }
 return json({error:'Unknown action'},400);
 } catch {return json({error:'Tracking service unavailable'},503)}
});
