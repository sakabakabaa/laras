import type {ScheduledActivity} from '@/lib/scheduled-classes';

/** Printed textbook pages, never the page index of an uploaded excerpt. */
export function activityBookReference(activity:ScheduledActivity){
 const title=activity.title;
 const reference=(book:'KB'|'ÜB',exercise:string,page:string)=>`${book} (${book==='KB'?'Kursbuch':'Übungsbuch'}) · ${exercise} · S. ${page}`;
 const kb=title.match(/^(10[abc])\s*·/i)?.[1];
 if(kb)return reference('KB',kb,'95');
 if(/Arzt oder Patient/.test(title))return reference('ÜB','10a','103');
 if(/Formen von dürfen/.test(title))return reference('ÜB','10e','104');
 if(/Modalverben ergänzen/.test(title))return reference('ÜB','10f','105');
 if(/Eine E-Mail schreiben/.test(title))return reference('ÜB','11c','105');
 const source=[activity.lesson?.source?.sourceLabel,activity.worksheet?.sourceLabel,...(activity.lesson?.steps||[]).filter(step=>/^Bezug:/.test(step.de)).map(step=>step.de)].filter(Boolean).join(' ');
 const page=source.match(/(?:S\.|Seite)\s*(\d+)/)?.[1];
 const exercise=source.match(/Aufgabe\s*(\d+[a-z]?)/i)?.[1];
 return page&&exercise?reference(/Arbeitsbuch|Übungsbuch/.test(source)?'ÜB':'KB',exercise,page):'';
}
