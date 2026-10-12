// Run inside the web container. Credentials come from its environment, never arguments/logs.
// Default is read-only. --apply is explicit. Only the authorized JR242 TP/TK mapping is supported.
const base=process.env.POCKETBASE_URL||'http://pocketbase:8090';
const authResponse=await fetch(`${base}/api/collections/_superusers/auth-with-password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identity:process.env.PB_SUPERUSER_EMAIL,password:process.env.PB_SUPERUSER_PASSWORD})});
if(!authResponse.ok)throw new Error('Backend authentication failed');
const {token}=await authResponse.json();
async function request(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const json=await r.json();if(!r.ok)throw new Error(`Backend request failed (${r.status}): ${json.message||''}`);return json;}
const apply=process.argv.includes('--apply');
const courses=await request('/api/collections/courses/records?perPage=200');const matches=courses.items.filter(c=>c.code==='JR242');
if(matches.length!==1)throw new Error('Expected exactly one JR242 course');
const course=matches[0];const result=await request('/api/collections/assignments/records?perPage=200');
const tasks=result.items.filter(a=>a.course===course.id);const reports=[];
for(const number of [1,2,3]){
 const originals=tasks.filter(a=>new RegExp(`^TP${number}\\s*[—–-]`).test(a.title));
 const revisions=tasks.filter(a=>new RegExp(`^TK${number}\\s*[—–-]`).test(a.title));
 if(originals.length!==1||revisions.length!==1)throw new Error(`Ambiguous TP${number}/TK${number} task identity`);
 const body={assignmentId:revisions[0].id,originalAssignmentId:originals[0].id,source:'historical',sequenceConfirmed:true,ownerId:course.owner,confirmedBy:'authorized_operator'};
 const plan=await request('/api/laras/revisions',body);reports.push({pair:`TK${number} → TP${number}`,body,plan});
}
// All task identities and plans are checked before any write.
for(const report of reports){const plan=apply?await request('/api/laras/revisions',{...report.body,apply:true}):report.plan;delete report.body;report.plan=plan;}
console.log(JSON.stringify({mode:apply?'apply':'dry-run',courseId:course.id,generatedAt:new Date().toISOString(),reports},null,2));
