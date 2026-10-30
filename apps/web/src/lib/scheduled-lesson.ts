export type BilingualText={de:string;id:string};
export type LessonScene={kind:'context'|'comparison'|'sentence'|'conjugation'|'dialogue';title:BilingualText;intro:BilingualText;cards?:{label:string;text:BilingualText;tone:'neutral'|'must'|'may'|'stop'}[];sentence?:{words:string[];roles:string[];translation:string};turns?:{role:'doctor'|'patient';text:BilingualText}[]};
export type LessonVideo={id:string;title:BilingualText;src:string;poster:string;duration:string};
export type ScheduledLesson={videos?:LessonVideo[];videoNote?:BilingualText;goal:BilingualText;steps:BilingualText[];note?:BilingualText;source?:{sourceMaterialId:string;sourcePage:number;sourceLabel:string};scenes:LessonScene[]};
