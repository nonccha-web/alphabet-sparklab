import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../integration/alphabet-tracking.js',import.meta.url),'utf8');
function setup({path='/project-start.html',gpc=false,cmp=true,initial,jar=new Map()}={}){
 const calls=[],scripts=[],events={},children=[];
 const document={currentScript:{dataset:{consent:cmp?'cmp':''}},head:{appendChild:e=>scripts.push(e)},body:{appendChild:e=>children.push(e)},createElement:tag=>({tag,style:{},children:[],setAttribute(){},appendChild(e){this.children.push(e)},remove(){}})};
 Object.defineProperty(document,'cookie',{get:()=>[...jar].map(x=>x.join('=')).join('; '),set:s=>{const[n,v]=s.split(';')[0].split('=');jar.set(n,v)}});
 const win={addEventListener:(name,cb)=>events[name]=cb,alphabetMarketingConsent:initial};
 const ctx={window:win,document,location:{origin:'https://www.alphabetfacade.com',pathname:path},navigator:{globalPrivacyControl:gpc},crypto,console,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},fetch:async(url,init)=>{const b=JSON.parse(init.body);calls.push(b);return Response.json(b.action==='visit'?{ticket:'signed'}:b.granted?{dispatch:true,event_id:'same-server-event',event_name:'Project Start',pixel_id:'1038711025904592'}:{dispatch:false})}};
 vm.runInNewContext(source,ctx);
 return {calls,scripts,events,children,win,jar};
}
const settle=()=>new Promise(r=>setTimeout(r,20));
test('SDK ignores other pages and never loads Meta while CMP unknown/denied',async()=>{
 const other=setup({path:'/index.html'});await settle();assert.equal(other.calls.length,0);
 const s=setup();await settle();assert.equal(s.calls.length,1);assert.equal(s.scripts.length,0);
 s.events['alphabet:marketing-consent']({detail:false});await settle();assert.equal(s.calls.at(-1).granted,false);assert.equal(s.scripts.length,0);
});
test('SDK uses returned server ID, limits dispatch, and reuses first-party visitor',async()=>{
 const s=setup({initial:true});await settle();assert.equal(s.scripts.length,1);const event=s.win.fbq.queue.find(a=>a[0]==='trackSingleCustom');assert.equal(event[1],'1038711025904592');assert.equal(event[2],'Project Start');assert.equal(event[4].eventID,'same-server-event');
 s.events['alphabet:marketing-consent']({detail:true});await settle();assert.equal(s.win.fbq.queue.filter(a=>a[0]==='trackSingleCustom').length,1);
 const repeat=setup({jar:s.jar});await settle();assert.equal(repeat.calls[0].visitor,s.calls[0].visitor);assert.notEqual(repeat.calls[0].id,s.calls[0].id);
});
test('automatic mode has no banner, no fabricated consent, and honors opt-out',async()=>{
 const auto=setup({cmp:false});await settle();assert.equal(auto.children.length,0);assert.equal(auto.calls.at(-1).action,'automatic');assert.equal(auto.jar.has('alphabet_marketing_v1'),false);assert.equal(auto.scripts.length,1);assert.equal(auto.win.fbq.queue.some(a=>a[0]==='consent'&&a[1]==='grant'),false);
 const gpc=setup({cmp:false,gpc:true});await settle();assert.equal(gpc.scripts.length,0);assert.equal(gpc.calls.at(-1).granted,false);
 const saved=setup({cmp:false,jar:new Map([['alphabet_marketing_v1','no']])});await settle();assert.equal(saved.scripts.length,0);assert.equal(saved.calls.at(-1).granted,false);
 const denied=setup({cmp:false,initial:false});await settle();assert.equal(denied.scripts.length,0);
 auto.win.AlphabetTracking.optOut();await settle();assert.equal(auto.calls.at(-1).granted,false);
});
