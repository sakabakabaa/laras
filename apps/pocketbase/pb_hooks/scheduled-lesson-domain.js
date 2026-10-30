function fail(){throw new Error('Materi dwibahasa belum lengkap atau formatnya tidak valid.');}
function str(v,max){if(typeof v!=='string'||!v.trim()||v.length>max)fail();return v.trim();}
function pair(v,max){if(!v||typeof v!=='object')fail();return{de:str(v.de,max),id:str(v.id,max)};}
exports.validate=function(value,materials){
 if(value===undefined||value===null)return undefined;
 if(JSON.stringify(value).length>100000)fail();
 if(!value||!Array.isArray(value.steps)||!value.steps.length||value.steps.length>8||!Array.isArray(value.scenes)||value.scenes.length>10)fail();
 const out={goal:pair(value.goal,500),steps:value.steps.map(v=>pair(v,800)),scenes:value.scenes.map(s=>{
  if(!s||!['context','comparison','sentence','conjugation','dialogue'].includes(s.kind))fail();
  const scene={kind:s.kind,title:pair(s.title,200),intro:pair(s.intro,1500)};
  if(s.cards!==undefined){if(!Array.isArray(s.cards)||s.cards.length>8)fail();scene.cards=s.cards.map(c=>{if(!['neutral','must','may','stop'].includes(c.tone))fail();return{label:str(c.label,100),tone:c.tone,text:pair(c.text,1000)};});}
  if(s.sentence!==undefined){const v=s.sentence;if(!Array.isArray(v.words)||v.words.length<2||v.words.length>12||!Array.isArray(v.roles)||v.roles.length!==v.words.length)fail();scene.sentence={words:v.words.map(w=>str(w,100)),roles:v.roles.map(w=>str(w,100)),translation:str(v.translation,800)};}
  if(s.turns!==undefined){if(!Array.isArray(s.turns)||s.turns.length<2||s.turns.length>16)fail();scene.turns=s.turns.map(t=>{if(!['doctor','patient'].includes(t.role))fail();return{role:t.role,text:pair(t.text,800)};});}
  if(s.kind==='dialogue'&&!scene.turns||s.kind==='sentence'&&!scene.sentence)fail();
  return scene;
 })};
 if(value.videos!==undefined){
  if(!Array.isArray(value.videos)||value.videos.length<1||value.videos.length>5)fail();
  const ids=[];
  const asset=(v,extension)=>{const path=str(v,300);if(!/^\/media\/lessons\/[a-z0-9/-]+\.(mp4|jpg)$/.test(path)||!path.endsWith('.'+extension))fail();return path;};
  out.videos=value.videos.map(v=>{const id=str(v.id,60);if(ids.includes(id))fail();ids.push(id);return{id,title:pair(v.title,200),src:asset(v.src,'mp4'),poster:asset(v.poster,'jpg'),duration:str(v.duration,10)};});
 }
 if(value.videoNote)out.videoNote=pair(value.videoNote,1000);
 if(value.note)out.note=pair(value.note,1000);
 if(value.source){const v=value.source;if(!materials.includes(v.sourceMaterialId)||!Number.isInteger(v.sourcePage)||v.sourcePage<1||v.sourcePage>10000)fail();out.source={sourceMaterialId:v.sourceMaterialId,sourcePage:v.sourcePage,sourceLabel:str(v.sourceLabel,160)};}
 return out;
};
