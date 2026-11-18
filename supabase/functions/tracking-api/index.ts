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
 if(await hash(key)!==s.bridge_key_hash) return json({error:'Unauthorized'},401);
 const b=await req.json(); const token=Deno.env.get('META_CAPI_ACCESS_TOKEN');
 const ready=!!token&&s.window_confirmed&&s.meta_enabled;
 if(b.action==='stats'){
 const start=new Date(b.start),end=new Date(b.end);
 if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||+end-+start>366*86400000) return json({error:'Invalid date range'},400);
 const result=await db('rpc/tracking_stats',{p_start:start.toISOString(),p_end:end.toISOString()});
 return json({...result,settings:{pixel_id:s.pixel_id,window_days:s.window_days,window_mode:s.window_mode,campaign_start:s.campaign_start,campaign_end:s.campaign_end,window_confirmed:s.window_confirmed,meta_enabled:s.meta_enabled,token_configured:!!token,ready},updated_at:new Date().toISOString()});
 }
 if(b.action==='visit') return json(await db('rpc/tracking_record_visit',{p_id:b.id,p_visitor:b.visitor,p_slug:b.slug,p_source:b.source,p_ua:b.ua}));
 if(b.action==='consent'){
 const c=await db('rpc/tracking_consent',{p_visit:b.visit,p_visitor:b.visitor,p_granted:b.granted===true,p_ready:ready});
 if(!c.dispatch) return json({dispatch:false,ready});
 const e=c.event,v=c.visit; let accepted=false,error='network_error',trace=null;
 const payload={data:[{event_name:e.event_name,event_id:e.event_id,event_time:Math.floor(new Date(e.event_time).getTime()/1000),action_source:'website',event_source_url:v.source_url,user_data:{external_id:[await hash(v.visitor_id)],client_user_agent:v.user_agent}}],...(Deno.env.get('META_TEST_EVENT_CODE')?{test_event_code:Deno.env.get('META_TEST_EVENT_CODE')}: {})};
 for(let attempt=0;attempt<3;attempt++){
 try{
 const r=await fetch('https://graph.facebook.com/v25.0/'+s.pixel_id+'/events',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(6000)});
 const result=await r.json(); accepted=r.ok&&result.events_received===1;trace=result.fbtrace_id||result.error?.fbtrace_id||null;error=String(result.error?.code||r.status);
 if(accepted||(!result.error?.is_transient&&r.status<500&&r.status!==429))break;
 }catch{error='network_error'}
 }
 await db('tracking_meta_events?event_id=eq.'+e.event_id,{status:accepted?'accepted':'failed',accepted_at:accepted?new Date().toISOString():null,error_code:accepted?null:error,fbtrace_id:trace},'PATCH');
 return json({dispatch:true,event_id:e.event_id,event_name:e.event_name,pixel_id:s.pixel_id,accepted});
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
