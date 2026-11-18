import {deliver} from '../tracking-api/delivery.ts';
export const origin='https://www.alphabetfacade.com';
export const pages:Record<string,string>={'/request-quotation.html':'request-quotation','/project-start.html':'project-start','/facade-care.html':'facade-care'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const enc=new TextEncoder();
async function signature(value:string,key:string){const k=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode('alphabet-website-v1:'+value)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export function createHandler(db:any,secret:string,token?:string,testCode?:string,send=deliver){
 return async(req:Request)=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type','Access-Control-Max-Age':'600'};
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.headers.get('origin')!==origin)return json({error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{
 const raw=await req.text();if(raw.length>4096)return json({error:'Request too large'},413);
 let b;try{b=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
 if(b.action==='visit'){
 let page;try{page=new URL(b.page)}catch{return json({error:'Invalid page'},400)}
 const slug=pages[page.pathname];
 if(page.origin!==origin||!slug||!uuid.test(b.id)||!uuid.test(b.visitor))return json({error:'Invalid visit'},400);
 await db('rpc/tracking_record_visit',{p_id:b.id,p_visitor:b.visitor,p_slug:slug,p_source:origin+page.pathname,p_ua:(req.headers.get('user-agent')||'').slice(0,1024)});
 const value=[b.id,b.visitor,slug,Date.now()+3600000].join('|');
 return json({ticket:value+'.'+await signature(value,secret)});
 }
 if(!['consent','browser-dispatched'].includes(b.action))return json({error:'Unknown action'},400);
 const ticket=String(b.ticket||''),i=ticket.lastIndexOf('.'),value=ticket.slice(0,i),sig=ticket.slice(i+1),expected=await signature(value,secret);
 let mismatch=sig.length^expected.length;for(let n=0;n<expected.length;n++)mismatch|=(sig.charCodeAt(n)||0)^expected.charCodeAt(n);
 const [visit,visitor,slug,expires]=value.split('|');
 if(i<0||mismatch||!uuid.test(visit)||!uuid.test(visitor)||!Object.values(pages).includes(slug)||!Number.isFinite(+expires)||+expires<Date.now())return json({error:'Invalid or expired ticket'},401);
 if(b.action==='browser-dispatched'){
 const rows=await db('tracking_visits?id=eq.'+visit+'&visitor_id=eq.'+visitor+'&consent=eq.granted&select=unique_id');
 if(rows[0]?.unique_id)await db('tracking_meta_events?event_id=eq.'+rows[0].unique_id,{browser_dispatched_at:new Date().toISOString()},'PATCH');
 return json({ok:true});
 }
 const [s]=await db('tracking_settings?id=eq.true&select=pixel_id,window_confirmed,meta_enabled');
 const ready=!!token&&s.window_confirmed&&s.meta_enabled;
 const granted=b.granted===true&&req.headers.get('sec-gpc')!=='1';
 const c=await db('rpc/tracking_consent',{p_visit:visit,p_visitor:visitor,p_granted:granted,p_ready:ready});
 if(!c.dispatch)return json({dispatch:false});
 const outcome=await send(c.event,c.visit,s.pixel_id,token!,testCode,db);
 return json({dispatch:true,pixel_id:s.pixel_id,event_name:c.event.event_name,event_id:c.event.event_id,accepted:outcome.accepted});
 }catch{return json({error:'Tracking service unavailable'},503)}
 };
}
