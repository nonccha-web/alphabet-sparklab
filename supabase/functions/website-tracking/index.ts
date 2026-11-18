import {createHandler} from './handler.ts';
const base=Deno.env.get('SUPABASE_URL')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function db(path:string,body?:unknown,method?:string){
 const r=await fetch(base+'/rest/v1/'+path,{method:method||(body?'POST':'GET'),headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',Prefer:'return=representation'},body:body?JSON.stringify(body):undefined});
 if(!r.ok)throw Error('Database request failed');return r.status===204?null:r.json();
}
// Public visit ingestion; origin/page allowlist is not user authentication.
// Subsequent consent/ack requests require a short-lived server-signed visit ticket.
// Service key is used only inside the server and never returned to the browser.
Deno.serve(createHandler(db,service,Deno.env.get('META_CAPI_ACCESS_TOKEN'),Deno.env.get('META_TEST_EVENT_CODE')));
