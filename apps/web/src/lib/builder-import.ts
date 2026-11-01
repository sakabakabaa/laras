import pb from './pocketbase-client';
import type { BuilderDocument, BuilderKind } from './builder-document';
export type BuilderImportSettings = { kind: BuilderKind; context: BuilderDocument['context']; title?: string; goal?: string };
export type BuilderImportReport = { warnings: string[]; inferredKeys: string[]; missingMedia: string[]; sourceName?: string; activityCount?: number; illustrationCount?: number; questionCount?: number };
export type BuilderImportJob = { id: string; status: 'queued'|'running'|'ready'|'failed'; source: string; settings: BuilderImportSettings; documentId: string; report: BuilderImportReport; error: string; attempts: number; leaseUntil: number };

/** Web AI endpoint; this must not use pb.send (which prefixes /hcgi/platform). */
export async function builderImportRequest<T>(body:FormData|Record<string,unknown>):Promise<T>{
 const multipart=body instanceof FormData;
 const response=await fetch('/api/builder-import',{method:'POST',headers:{Authorization:'Bearer '+pb.authStore.token,...(multipart?{}:{'Content-Type':'application/json'})},body:multipart?body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Impor belum dapat diproses.');return result as T;
}
