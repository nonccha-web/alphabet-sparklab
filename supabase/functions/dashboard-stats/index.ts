const base=Deno.env.get('SUPABASE_URL')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers={'Content-Type':'application/json','Cache-Control':'public, max-age=15','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
async function db(path:string,body?:unknown){
 const r=await fetch(base+'/rest/v1/'+path,{method:body?'POST':'GET',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 if(!r.ok)throw Error('Database unavailable');return r.json();
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='GET')return json({error:'Method not allowed'},405);
 const u=new URL(req.url),start=new Date(u.searchParams.get('start')||''),end=new Date(u.searchParams.get('end')||'');
 if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||+end-+start>366*86400000)return json({error:'Invalid date range'},400);
 try{
 const [result,settings]=await Promise.all([db('rpc/tracking_stats',{p_start:start.toISOString(),p_end:end.toISOString(),p_mode:u.searchParams.get('mode')==='test'?'test':'live'}),db('tracking_settings?id=eq.true&select=pixel_id,window_days,window_mode,campaign_start,campaign_end,window_confirmed,meta_enabled')]);
 const s=settings[0],configured=!!Deno.env.get('META_CAPI_ACCESS_TOKEN');
 return json({...result,settings:{...s,token_configured:configured,ready:configured&&s.window_confirmed&&s.meta_enabled},updated_at:new Date().toISOString()});
 }catch{return json({error:'โหลดข้อมูลไม่สำเร็จ'},503)}
});
