const endpoint='https://hvrclmycmpgmnpwyzznw.supabase.co/functions/v1/tracking-api';
export async function trackingRoute(req:Request,env:any):Promise<Response|null>{
 const url=new URL(req.url);
 if(url.pathname.startsWith('/t/')||['/api/tracking/consent','/api/tracking/browser-dispatched'].includes(url.pathname))return new Response('This tracking gateway is retired. Use the original Alphabet Facade website URLs.',{status:410,headers:{'Cache-Control':'no-store'}});
 if(url.pathname!=='/api/tracking/stats')return url.pathname.startsWith('/api/tracking/')?new Response('Not found',{status:404}):null;
 if(req.method!=='GET')return new Response('Method not allowed',{status:405});
 try{
 if(!env.TRACKING_BRIDGE_KEY)throw Error('Configuration missing');
 const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-tracking-key':env.TRACKING_BRIDGE_KEY},body:JSON.stringify({action:'stats',mode:url.searchParams.get('mode')==='test'?'test':'live',start:url.searchParams.get('start'),end:url.searchParams.get('end')}),signal:AbortSignal.timeout(25000)});
 return new Response(await r.text(),{status:r.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 }catch{return Response.json({error:'ไม่สามารถเชื่อมต่อระบบ Tracking ได้ กรุณาลองใหม่'},{status:503})}
}
