import type {ScheduledActivity} from './scheduled-classes';
export function scheduledAnswerComplete(activity:ScheduledActivity,answers:Record<string,unknown>):boolean{
 if(activity.kind==='material')return answers.acknowledged===true;
 if(activity.kind==='quiz')return Boolean(activity.questions?.length)&&activity.questions!.every(q=>Number.isInteger(answers[q.id])&&Number(answers[q.id])>=0&&Number(answers[q.id])<q.options.length);
 if(activity.worksheet){const responses=answers.responses as Record<string,unknown>|undefined;return Boolean(responses)&&activity.worksheet.items.every(item=>typeof responses![item.id]==='string'&&Boolean((responses![item.id] as string).trim())&&(item.type!=='select'||Boolean(item.options?.includes(responses![item.id] as string))));}
 return typeof answers.text==='string'&&Boolean(answers.text.trim());
}
