export function classifyMeta(status:number,result:any){
 const accepted=status>=200&&status<300&&result.events_received===1;
 return {accepted,retryable:!accepted&&(status===429||status>=500||result.error?.is_transient===true),error:String(result.error?.code||status),trace:result.fbtrace_id||result.error?.fbtrace_id||null};
}
export async function deliver(e:any,v:any,pixel:string,token:string,testCode:string|undefined,db:any,fetcher:typeof fetch=fetch){
 // Preserve the original event ID, name and time across every attempt.
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v.visitor_id));
 const external=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
 const payload:any={data:[{event_name:e.event_name,event_id:e.event_id,event_time:Math.floor(new Date(e.event_time).getTime()/1000),action_source:'website',event_source_url:v.source_url,user_data:{external_id:[external],client_user_agent:v.user_agent}}]};
 if(v.is_test&&testCode)payload.test_event_code=testCode;
 let outcome={accepted:false,retryable:true,error:'network_error',trace:null as string|null};
 try{
 const r=await fetcher('https://graph.facebook.com/v25.0/'+pixel+'/events',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
 let result;try{result=await r.json()}catch{result={};}
 outcome=classifyMeta(r.status,result);
 }catch{}
 await db('rpc/tracking_finish_attempt',{p_event:e.event_id,p_lease:e.lease_token,p_accepted:outcome.accepted,p_retryable:outcome.retryable,p_error:outcome.error,p_trace:outcome.trace});
 return outcome;
}
