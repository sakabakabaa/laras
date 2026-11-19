import type {ScheduledActivity} from './scheduled-classes';

export type MatchingTarget={value:string;title:string;url:string;readingText?:string};
export function cardMatchingTargets(activity:ScheduledActivity):MatchingTarget[]{
  const items=activity.worksheet?.items;
  if(!items?.length)return [];
  const images=(activity.sources||[]).filter(s=>s.available&&s.id&&(s.url||s.filename)&&/\.(jpe?g|png|webp|gif|svg)$/i.test(s.url||s.filename||''));
  const matchBlock=activity.worksheet?.blocks?.find((b):b is Extract<NonNullable<NonNullable<ScheduledActivity['worksheet']>['blocks']>[number],{type:'match'}>=>b.type==='match');
  if(matchBlock&&matchBlock.destinations?.length>=2&&matchBlock.destinations.length<=7){
    const matchItems=matchBlock.cardItemIds?.length?items.filter(i=>matchBlock.cardItemIds.includes(i.id)):items;
    if(!matchItems.length||matchItems.some(i=>i.type!=='select'))return [];
    const matchOptions=matchItems[0].options||[];
    if(matchOptions.length<2||matchOptions.length>7||matchItems.some(i=>JSON.stringify(i.options)!==JSON.stringify(matchOptions)))return [];
    const explicit=matchBlock.destinations.map(dest=>{
      const value=dest.label;
      const titleText=[dest.title?.de,dest.title?.id].filter(Boolean).join(' · ')||value;
      const title=titleText.startsWith(`${value} ·`)||/\bBild /i.test(titleText)?titleText:`${value} · ${titleText}`;
      if(dest.image){
        const img=images.find(s=>s.id===dest.image);
        if(!img)return null;
        return {value,title,readingText:dest.readingText,url:img.url||`/hcgi/platform/api/files/file_library/${img.id}/${encodeURIComponent(img.filename!)}`};
      }
      return {value,title,url:''};
    });
    if(explicit.every(Boolean))return expandKaufhausTargets(explicit as MatchingTarget[]);
  }
  if(items.some(i=>i.type!=='select'))return [];
  const options=items[0].options||[];
  if(options.length<2||options.length>4||items.some(i=>JSON.stringify(i.options)!==JSON.stringify(options)))return [];
  const targets=options.map(value=>{
    const matches=images.filter(s=>(s.title.match(/\bBild ([A-Z])\b/i)?.[1]||s.title.match(/^([A-Z])\s*·/)?.[1])===value);
    if(matches.length!==1)return null;
    const image=matches[0];
    return {value,title:image.title,url:image.url||`/hcgi/platform/api/files/file_library/${image.id}/${encodeURIComponent(image.filename!)}`};
  });
  return targets.some(t=>!t)?[]:targets as MatchingTarget[];
}

export function cardMatchingItemImages(activity:ScheduledActivity):Record<string,string>{
  const items=activity.worksheet?.items;
  if(!items?.length)return {};
  const byId=new Map((activity.sources||[]).filter(s=>s.available&&s.id&&(s.url||s.filename)&&/\.(jpe?g|png|webp|gif|svg)$/i.test(s.url||s.filename||'')).map(s=>[s.id!,s.url||`/hcgi/platform/api/files/file_library/${s.id}/${encodeURIComponent(s.filename!)}`]));
  const out:Record<string,string>={};
  for(const item of items)if(item.image&&byId.has(item.image))out[item.id]=byId.get(item.image)!;
  return out;
}

export type KaufhausFloorSpec = {
  value: string;
  badge: string;
  name: string;
  tag?: string;
  departments: string;
  dividerBefore?: 'awning' | 'street';
};

export const KAUFHAUS_FLOORS: KaufhausFloorSpec[] = [
  {
    value: '5. Stock',
    badge: '5',
    name: '5. Stock',
    departments: 'Alles für den Sport · Sportkleidung · Fitnessgeräte · Bademode · Café',
  },
  {
    value: '4. Stock',
    badge: '4',
    name: '4. Stock',
    departments: 'Computer · Technik · Fotozubehör · CDs · Elektrogeräte · Kasse',
  },
  {
    value: '3. Stock',
    badge: '3',
    name: '3. Stock',
    departments: 'Mode für Kinder und Jugendliche · Spielwaren',
  },
  {
    value: '2. Stock',
    badge: '2',
    name: '2. Stock',
    departments: 'Herrenmode · Anzüge · Hemden · Freizeitkleidung',
  },
  {
    value: '1. Stock',
    badge: '1',
    name: '1. Stock',
    departments: 'Damenmode · Freizeitkleidung · Abendkleidung · Schuhe für Sie & Ihn',
  },
  {
    value: 'EG',
    badge: 'EG',
    name: 'Erdgeschoss',
    tag: 'Pintu masuk',
    departments: 'Kosmetik · Parfümerie · Uhren · Schmuck · Schreibwaren · Bücher · Zeitschriften · Kasse',
    dividerBefore: 'awning',
  },
  {
    value: 'UG',
    badge: 'UG',
    name: 'Untergeschoss',
    tag: 'Bawah tanah',
    departments: 'Lebensmittel · Alles für die Küche · Haushaltswaren',
    dividerBefore: 'street',
  },
];

const KAUFHAUS_VALUE_RE = /^(UG|EG|[1-5]\.\s*Stock)$/i;

export function isKaufhausFloorValue(value: string): boolean {
  return KAUFHAUS_VALUE_RE.test(value.trim());
}

export function isKaufhausFloorOptionList(options?: string[]): boolean {
  return Boolean(options && options.length >= 2 && options.every((option) => isKaufhausFloorValue(option)));
}

export function kaufhausTargetFloor(
  target: Pick<MatchingTarget, 'value'> & { title?: string },
): string | undefined {
  const val = target.value.trim();
  if (KAUFHAUS_VALUE_RE.test(val)) return val.toLowerCase();
  const prefix = target.title?.split(' · ')[0]?.trim() || '';
  if (KAUFHAUS_VALUE_RE.test(prefix)) return prefix.toLowerCase();
  return undefined;
}

export function isKaufhausTargets(
  targets: (Pick<MatchingTarget, 'value'> & { title?: string })[],
): boolean {
  if (targets.length < 2) return false;
  return targets.every((target) => Boolean(kaufhausTargetFloor(target)));
}

export function expandKaufhausTargets(targets: MatchingTarget[]): MatchingTarget[] {
  if (!isKaufhausTargets(targets)) return targets;
  const byFloor = new Map(targets.map((target) => [kaufhausTargetFloor(target)!, target]));
  return KAUFHAUS_FLOORS.map(
    (floor) =>
      byFloor.get(floor.value.toLowerCase()) || {
        value: floor.value,
        title: `${floor.value} · ${floor.departments}`,
        url: '',
      },
  );
}

export function moveMatchingCard(responses:Record<string,string>,ids:string[],targets:MatchingTarget[],id:string,target:string){
  if(!ids.includes(id)||(target!==''&&!targets.some(t=>t.value===target)))return responses;
  const next={...responses};if(target)next[id]=target;else delete next[id];return next;
}

