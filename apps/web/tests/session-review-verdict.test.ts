import {describe,expect,it} from 'vitest';
import {gradingModeLabel,nextManualTarget,normalizeAnswer,requiresManual,responseVerdicts,reviewTally,verdictTally} from '../src/lib/session-review-verdict';
import type {ScheduledActivity,ScheduledAttempt,ScheduledClassState} from '../src/lib/scheduled-classes';

const sheet: ScheduledActivity = {id:'a',kind:'assignment',title:'10a · Wer sagt was?',minutes:10,required:true,startsAt:'',endsAt:'',worksheet:{
  items:[{id:'one',prompt:'Haben Sie Schmerzen?',type:'select',options:['A','P']},{id:'two',prompt:'Wo tut es weh?',type:'select',options:['A','P']}],
  answerKey:{version:1,items:{one:{mode:'exact',accepted:['A'],points:1},two:{mode:'exact',accepted:['A'],points:1}}},
}} as ScheduledActivity;
const writing: ScheduledActivity = {id:'w',kind:'assignment',title:'Zusatz · Eine E-Mail schreiben',minutes:10,required:true,startsAt:'',endsAt:'',worksheet:{
  items:[{id:'email',prompt:'Ihre E-Mail',type:'text'}],
  answerKey:{version:1,items:{email:{mode:'reference',modelAnswer:'Liebe Frau …, ich kann heute nicht kommen.',rubric:'Salam, alasan, penutup.'}}},
}} as ScheduledActivity;
const exit: ScheduledActivity = {id:'e',kind:'exit_ticket',title:'Refleksi akhir',minutes:5,required:true,startsAt:'',endsAt:'',worksheet:{items:[{id:'r1',prompt:'Schreiben Sie einen Satz.',type:'text'}]}} as ScheduledActivity;
const quiz: ScheduledActivity = {id:'q',kind:'quiz',title:'Kuis',minutes:5,required:true,startsAt:'',endsAt:'',questions:[{id:'q1',text:'Choose.',options:['Hallo','Tschüss'],correctIndex:0,points:1,explanation:''}]} as ScheduledActivity;
const attempt = (id:string,activity:string,answers:Record<string,unknown>,score?:number) => ({id,activity,student:'s1',answers,revision:1,status:'submitted' as const,complete:true,score}) as ScheduledAttempt;

describe('lecturer review verdicts',()=>{
  it('mirrors the server normalisation so a verdict cannot disagree with the stored score',()=>{
    expect(normalizeAnswer('  Hallo  Welt.  ')).toBe('hallo welt');
    expect(normalizeAnswer('Ich bin krank!')).toBe('ich bin krank');
    expect(normalizeAnswer(undefined)).toBe('');
  });
  it('marks correct, wrong and blank items and exposes the accepted answer only for wrong ones',()=>{
    const cards = responseVerdicts(sheet, attempt('t','a',{responses:{one:'P',two:'A'}}));
    expect(cards.map(card=>card.verdict)).toEqual(['wrong','correct']);
    expect(cards[0].accepted).toEqual(['A']);
    expect(cards[1].accepted).toEqual(['A']);
    const tally = verdictTally(cards);
    expect(tally).toMatchObject({correct:1,wrong:1,earned:1,total:2,score:50});
  });
  it('treats items with no key and reference items as manual work, never as correct',()=>{
    const reference = responseVerdicts(writing, attempt('w-1','w',{responses:{email:'Liebe Frau Müller, ich komme nicht.'}}));
    expect(reference[0]).toMatchObject({verdict:'manual'});
    expect(reference[0].modelAnswer).toContain('Liebe Frau');
    expect(reference[0].rubric).toContain('Salam');
    const reflections = responseVerdicts(exit, attempt('e-1','e',{responses:{r1:'Ich darf nicht rauchen.'}}));
    expect(reflections[0].verdict).toBe('manual');
    expect(responseVerdicts(exit, attempt('e-2','e',{responses:{}}))[0].verdict).toBe('ungraded');
  });
  it('scores quiz items automatically and never asks for a manual grade',()=>{
    const cards = responseVerdicts(quiz, attempt('q-1','q',{q1:1}));
    expect(cards[0]).toMatchObject({verdict:'wrong'});
    expect(requiresManual(quiz)).toBe(false);
    expect(requiresManual(sheet)).toBe(false);
    expect(requiresManual(writing)).toBe(true);
    expect(requiresManual(exit)).toBe(true);
    expect(gradingModeLabel(sheet)).toBe('Otomatis · kunci');
    expect(gradingModeLabel(writing)).toBe('Manual · contoh jawaban');
    expect(gradingModeLabel(exit)).toBe('Manual · refleksi');
  });
  it('reports the honest queue size instead of counting every worksheet submission',()=>{
    const state = {owner:true,serverNow:'',session:{id:'s',title:'',course:''},class:{id:'c',phase:'closed'} as ScheduledClassState['class'],
      activities:[sheet,writing,exit],attempts:[
        attempt('t','a',{responses:{one:'A',two:'A'}},100),
        attempt('w-1','w',{responses:{email:'x'}}),
        attempt('e-1','e',{responses:{r1:'y'}}),
      ],assessments:[{attempt:'w-1',activity:'w',points:8,maxPoints:10,status:'reviewed'}],report:[],events:[],
      gradingSettings:[],} as ScheduledClassState;
    expect(reviewTally(state)).toMatchObject({manual:2,reviewed:1,pending:1,auto:1,autoScored:1});
    expect(nextManualTarget(state,[sheet,writing,exit])?.id).toBe('e-1');
  });
  it('counts published manual reviews as complete and skips them in the next-review queue',()=>{
    const state = {owner:true,serverNow:'',session:{id:'s',title:'',course:''},class:{id:'c',phase:'closed'} as ScheduledClassState['class'],
      activities:[writing],attempts:[attempt('w-1','w',{responses:{email:'a'}}),{...attempt('w-2','w',{responses:{email:'b'}}),student:'s2'}],
      assessments:[{attempt:'w-1',activity:'w',points:8,maxPoints:10,status:'published'}],
      report:[{roster:'r1',student:'s1',name:'Satu',nim:'',checkedInAt:'',lastSeenAt:'',suggestion:'',completed:0,total:0,reason:'',attendance:'',attempts:[]},{roster:'r2',student:'s2',name:'Dua',nim:'',checkedInAt:'',lastSeenAt:'',suggestion:'',completed:0,total:0,reason:'',attendance:'',attempts:[]}],events:[]} as unknown as ScheduledClassState;
    expect(reviewTally(state)).toMatchObject({manual:2,reviewed:1,pending:1});
    expect(nextManualTarget(state,[writing])?.id).toBe('w-2');
  });
  it('walks the roster to the next manual submission that still needs review',()=>{
    const rows = ['s1','s2'].map((student,index)=>({roster:`r${index}`,student,name:student,nim:'',checkedInAt:'',lastSeenAt:'',suggestion:'',completed:0,total:0,reason:'',attendance:'',attempts:[]}));
    const state = {owner:true,serverNow:'',session:{id:'s',title:'',course:''},class:{id:'c',phase:'closed'} as ScheduledClassState['class'],
      activities:[writing],attempts:[
        {...attempt('w-1','w',{responses:{email:'a'}}),student:'s1'},
        {...attempt('w-2','w',{responses:{email:'b'}}),student:'s2'},
      ],assessments:[],report:rows,events:[]} as unknown as ScheduledClassState;
    expect(nextManualTarget(state,[writing])?.student).toBe('s1');
    expect(nextManualTarget(state,[writing],{student:'s1',activity:'w'})?.student).toBe('s2');
  });
});
