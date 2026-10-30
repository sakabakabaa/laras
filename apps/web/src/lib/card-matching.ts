import type {ScheduledActivity} from './scheduled-classes';

export type MatchingTarget={value:string;title:string;url:string};
export function cardMatchingTargets(activity:ScheduledActivity):MatchingTarget[]{
  const items=activity.worksheet?.items;
  if(!items?.length||items.some(i=>i.type!=='select'))return [];
  const options=items[0].options||[];
  if(options.length<2||options.length>4||items.some(i=>JSON.stringify(i.options)!==JSON.stringify(options)))return [];
  const images=(activity.sources||[]).filter(s=>s.available&&s.id&&(s.url||s.filename)&&/\.(jpe?g|png|webp)$/i.test(s.url||s.filename||''));
  const targets=options.map(value=>{
    const matches=images.filter(s=>(s.title.match(/\bBild ([A-Z])\b/i)?.[1]||s.title.match(/^([A-Z])\s*·/)?.[1])===value);
    if(matches.length!==1)return null;
    const image=matches[0];
    return {value,title:image.title,url:image.url||`/hcgi/platform/api/files/file_library/${image.id}/${encodeURIComponent(image.filename!)}`};
  });
  return targets.some(t=>!t)?[]:targets as MatchingTarget[];
}

export function moveMatchingCard(responses:Record<string,string>,ids:string[],targets:MatchingTarget[],id:string,target:string){
  if(!ids.includes(id)||(target!==''&&!targets.some(t=>t.value===target)))return responses;
  const next={...responses};if(target)next[id]=target;else delete next[id];return next;
}
