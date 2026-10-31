import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {assessmentStatus,defaultSessionTab,manualActivities,responseCards,sessionWorkspacePath} from '../src/lib/scheduled-session-workspace';
import {ScheduledReviewWorkspace} from '../src/components/app/scheduled-review-workspace';
import {ScheduledClassReport} from '../src/components/app/scheduled-class-report';
import type {ScheduledClassState,ScheduledActivity,ScheduledAttempt} from '../src/lib/scheduled-classes';

const activity={id:'writing',kind:'assignment',title:'10c · Schreiben',minutes:10,required:true,startsAt:'',endsAt:'',worksheet:{items:[{id:'one',prompt:'Schreiben Sie einen Satz.',type:'text'},{id:'two',prompt:'Noch ein Satz.',type:'text'}]}} as ScheduledActivity;
const attempt={id:'submission',activity:'writing',student:'student',revision:1,status:'submitted',complete:false,answers:{responses:{one:'Ich bin krank.'},text:'Combined export should not duplicate answers'}} as ScheduledAttempt;
function fixture():ScheduledClassState{return {owner:true,session:{id:'session',title:'Beim Arzt',course:'course'},class:{id:'class',phase:'closed',status:'closed'} as ScheduledClassState['class'],activities:[activity,{...activity,id:'quiz',kind:'quiz'}],attempts:[attempt,{...attempt,id:'quiz-answer',activity:'quiz'}],report:[{roster:'roster',student:'student',name:'Student One',nim:'123',checkedInAt:'2026-10-29T06:00:00Z',lastSeenAt:'',suggestion:'absent',attendance:'0resent',completed:0,total:2,reason:'',attempts:[attempt]},{roster:'missing',student:'',name:'Student Missing',nim:'124',checkedInAt:'',lastSeenAt:'',suggestion:'absent',attendance:'absent',completed:0,total:2,reason:'',attempts:[]}],gradingSettings:[],assessments:[],events:[],serverNow:''};}

