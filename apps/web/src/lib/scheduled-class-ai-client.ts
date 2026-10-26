import pb from './pocketbase-client';
export async function scheduledAiRequest<T>(sessionId:string,action:'context'|'generate',body:Record<string,unknown>={}):Promise<T>{
 const response=await fetch('/api/scheduled-class-draft',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${pb.authStore.token}`},body:JSON.stringify({sessionId,action,...body}),signal:AbortSignal.timeout(120000)});
 const data=await response.json();
 if(!response.ok)throw new Error(data.error?.message||data.error||data.message||'Draf belum dapat dibuat.');
 return data as T;
}
