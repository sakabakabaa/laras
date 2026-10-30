// Run in the web container; credentials stay in its environment. Default is read-only.
import {createHash} from 'node:crypto';
const apply=process.argv.includes('--apply');
const base=process.env.POCKETBASE_URL||'http://pocketbase:8090';
const auth=await fetch(base+'/api/collections/_superusers/auth-with-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identity:process.env.PB_SUPERUSER_EMAIL,password:process.env.PB_SUPERUSER_PASSWORD})});
if(!auth.ok)throw Error('Authentication failed');const {token}=await auth.json();
async function request(path,body){const r=await fetch(base+path,{method:body?'PATCH':'GET',headers:{Authorization:token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(!r.ok)throw Error('Request failed '+r.status);return r.json();}
async function rows(collection,fields){const result=[];for(let page=1;;page++){const r=await request(`/api/collections/${collection}/records?perPage=500&page=${page}&sort=id${fields?'&fields='+fields:''}`);result.push(...r.items);if(page>=r.totalPages)break;}return result;}
const [users,roster,enrollments,sections]=await Promise.all([rows('users','id,nim,email,role'),rows('course_roster','id,course,nim,section'),rows('enrollments','id,course,owner,section'),rows('course_sections','id,course')]);
const userMap=new Map(users.map(u=>[u.id,u])),sectionMap=new Map(sections.map(s=>[s.id,s.course]));
const plan=[];let matched=0,already=0,unmatched=0,conflicts=0;
for(const enrollment of enrollments){const user=userMap.get(enrollment.owner);const nim=user?.role==='student'?(user.nim?.trim()||user.email?.match(/^(\d+)@student\.upi\.edu$/)?.[1]||''):'';const matches=roster.filter(r=>r.course===enrollment.course&&r.nim.trim()===nim&&nim);if(matches.length!==1||!matches[0].section){unmatched++;continue;}const desired=matches[0].section;if(sectionMap.get(desired)!==enrollment.course)throw Error('Invalid roster class relation');matched++;if(enrollment.section===desired){already++;continue;}if(enrollment.section){conflicts++;continue;}plan.push({id:enrollment.id,course:enrollment.course,previous:'',section:desired});}
console.log(JSON.stringify({mode:apply?'apply':'dry-run',matched,already,unmatched,conflicts,planned:plan.length}));
if(apply){if(conflicts)throw Error('Conflicting existing enrollment classes require review');
const protectedCollections=['assignment_submissions','public_submissions','grade_entries','grade_publications','grade_overrides','grade_components','ai_evaluations'];
async function digest(){const hash=createHash('sha256');for(const c of protectedCollections)hash.update(JSON.stringify(await rows(c)));return hash.digest('hex');}
const before=await digest();for(const change of plan){const current=await request(`/api/collections/enrollments/records/${change.id}`);if(current.section!==change.previous)throw Error('Enrollment changed during reconciliation');await request(`/api/collections/enrollments/records/${change.id}`,{section:change.section});}
const after=await digest();if(before!==after)throw Error('Protected academic records changed unexpectedly');console.log(JSON.stringify({applied:plan.length,protectedAcademicRecordsUnchanged:true}));}
