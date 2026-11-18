const links:Record<string,{name:string,url:string}>={
 'request-quotation':{name:'Request Quotation',url:'https://www.alphabetfacade.com/request-quotation.html'},
 'project-start':{name:'Project Start',url:'https://www.alphabetfacade.com/project-start.html'},
 'facade-care':{name:'Facade Care',url:'https://www.alphabetfacade.com/facade-care.html'}
};
const escape=(s:string)=>s.replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]!));
const endpoint='https://hvrclmycmpgmnpwyzznw.supabase.co/functions/v1/tracking-api';
const enc=new TextEncoder();
export async function sign(s:string,key:string){const k=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('')}
export async function seal(s:string,key:string){return s+'.'+await sign(s,key)}
export async function unseal(s:string,key:string){const i=s.lastIndexOf('.');if(i<0)return null;const value=s.slice(0,i),sig=s.slice(i+1); const expected=await sign(value,key);if(sig.length!==expected.length)return null;let d=0;for(let j=0;j<sig.length;j++)d|=sig.charCodeAt(j)^expected.charCodeAt(j);return d===0?value:null}
function cookies(r:Request){return Object.fromEntries((r.headers.get('cookie')||'').split(';').map(x=>{const i=x.indexOf('=');return[x.slice(0,i).trim(),x.slice(i+1)]}))}
async function api(env:any,b:any){if(!env.TRACKING_BRIDGE_KEY)throw Error('Configuration missing');const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-tracking-key':env.TRACKING_BRIDGE_KEY},body:JSON.stringify(b),signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Tracking service unavailable');return r.json() as Promise<any>}
function html(title:string,body:string,cookie?:string){const h=new Headers({'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline' https://connect.facebook.net; connect-src 'self' https://www.facebook.com https://connect.facebook.net; img-src 'self' data: https://www.facebook.com; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});if(cookie)h.append('Set-Cookie',cookie);return new Response(`<!doctype html><html lang="th"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Alphabet</title><style>body{font:16px system-ui;background:#f4f5f7;color:#182124;margin:0;display:grid;place-items:center;min-height:100vh}.card{max-width:500px;background:white;padding:40px;border-radius:24px;margin:24px;box-shadow:0 20px 80px #15252c10}small{letter-spacing:3px;color:#667;font-weight:bold}h1{font-size:30px}p{line-height:1.8;color:#59656b}button,a{display:block;box-sizing:border-box;text-align:center;padding:14px;border-radius:10px;font:inherit;margin-top:12px;width:100%;cursor:pointer}button{border:0;background:#145c50;color:white}button.secondary,a{background:#f3f5f4;color:#263b35;border:1px solid #dce2df;text-decoration:none}</style><div class="card"><small>ALPHABET / FACADE</small><h1>${escape(title)}</h1>${body}</div></html>`,{headers:h})}
const cookie=(v:string)=>`alphabet_vid=${v}; Path=/; Max-Age=63072000; Secure; HttpOnly; SameSite=Lax`;
export async function trackingRoute(req:Request,env:any):Promise<Response|null>{
 const url=new URL(req.url),key=env.TRACKING_BRIDGE_KEY;
 if(!url.pathname.startsWith('/t/')&&!url.pathname.startsWith('/api/tracking/'))return null;
 try{
 if(url.pathname==='/api/tracking/stats'&&req.method==='GET'){
 const result=await api(env,{action:'stats',start:url.searchParams.get('start'),end:url.searchParams.get('end')});return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }
 if(url.pathname.startsWith('/t/')&&req.method==='GET'){
 const slug=url.pathname.slice(3),link=links[slug];if(!link)return new Response('Not found',{status:404});
 const c=cookies(req),old=key?await unseal(c.alphabet_vid||'',key):null;const visitor=old&&/^[0-9a-f-]{36}$/.test(old)?old:crypto.randomUUID();
 const id=crypto.randomUUID();
 // Strip all query strings from the stored source, including advertising click IDs.
 await api(env,{action:'visit',id,visitor,slug,source:url.origin+url.pathname,ua:req.headers.get('user-agent')||''});
 const ticket=await seal([id,visitor,slug,Date.now()+3600000].join('|'),key);
 return html(link.name,`<p>คุณกำลังไปยังเว็บไซต์ Alphabet Facade</p><p>ระบบบันทึกจำนวนการเข้าชมและรหัสเบราว์เซอร์แบบ first-party เพื่อคัดซ้ำ โดยไม่ใช้ IP ระบุตัวบุคคล</p><p>อนุญาตให้ส่งเหตุการณ์การเข้าชมและรหัสเบราว์เซอร์ให้ Meta ผ่าน Pixel และ CAPI เพื่อวัดผลและปรับปรุงโฆษณาหรือไม่? คุณสามารถปฏิเสธและเข้าสู่เว็บไซต์ได้เช่นกัน โดยจะถามสิทธิ์ใหม่ทุกครั้งที่ใช้ลิงก์นี้</p><form method="POST" action="/api/tracking/consent"><input type="hidden" name="ticket" value="${escape(ticket)}"><button name="choice" value="allow">ยินยอมและไปยังเว็บไซต์</button><button class="secondary" name="choice" value="deny">ไม่ยินยอม · ไปยังเว็บไซต์</button></form>`,cookie(await seal(visitor,key)));
 }
 if(url.pathname==='/api/tracking/consent'&&req.method==='POST'){
 if(req.headers.get('origin')!==url.origin)return new Response('Forbidden',{status:403});
 const f=await req.formData(),ticket=await unseal(String(f.get('ticket')||''),key);if(!ticket)return new Response('Invalid ticket',{status:400});
 const [visit,visitor,slug,expiry]=ticket.split('|');const link=links[slug];
 if(!link||+expiry<Date.now()||await unseal(cookies(req).alphabet_vid||'',key)!==visitor)return new Response('Expired visit. Open the tracking link again.',{status:400});
 const granted=f.get('choice')==='allow'&&req.headers.get('sec-gpc')!=='1';
 const r=await api(env,{action:'consent',visit,visitor,granted});
 if(!r.dispatch)return new Response(null,{status:303,headers:{Location:link.url,'Cache-Control':'no-store','Referrer-Policy':'same-origin'}});
 const config=JSON.stringify({event:r.event_name,id:r.event_id,pixel:r.pixel_id,dest:link.url,ticket}).replace(/</g,'\\u003c');
 return html('กำลังไปยัง '+link.name,`<p>บันทึกตัวเลือกเรียบร้อย กำลังนำคุณไปยังเว็บไซต์…</p><a href="${link.url}">ไปยังเว็บไซต์</a><script>const c=${config};!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('consent','grant');fbq('init',c.pixel);fbq('trackCustom',c.event,{}, {eventID:c.id});setTimeout(()=>location.replace(c.dest),1500);</script>`);
 }
 return new Response('Not found',{status:404});
 }catch{return new Response(JSON.stringify({error:'ไม่สามารถเชื่อมต่อระบบ Tracking ได้ กรุณาลองใหม่'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}
}
