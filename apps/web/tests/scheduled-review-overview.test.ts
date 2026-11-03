import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {ScheduledExactAnswerOverview} from '../src/components/app/scheduled-exact-answer-overview';
import {ScheduledWrittenAnswer} from '../src/components/app/scheduled-written-answer';
import type {ScheduledActivity,ScheduledAttempt} from '../src/lib/scheduled-classes';
import {responseVerdicts} from '../src/lib/session-review-verdict';

const activity:ScheduledActivity={id:'exact',title:'Choose the answer',kind:'assignment',minutes:5,required:true,startsAt:'',endsAt:'',worksheet:{items:[
  {id:'correct',prompt:'Correct',type:'select',options:['A','B']},
  {id:'wrong',prompt:'Wrong',type:'text'},
  {id:'blank',prompt:'Blank',type:'text'},
],answerKey:{version:1,items:{correct:{mode:'exact',accepted:['A'],points:1},wrong:{mode:'exact',accepted:['A'],points:1},blank:{mode:'exact',accepted:['A'],points:1}}}}};
const attempt:ScheduledAttempt={id:'attempt',activity:activity.id,student:'s',answers:{responses:{correct:'A',wrong:'B',blank:''}},revision:1,status:'submitted',savedAt:'',finalizedAt:'',complete:true,score:33.33};
const renderOverview=(current=activity,submitted=true,cards=responseVerdicts(current,attempt),score:number|undefined=attempt.score)=>renderToStaticMarkup(createElement(ScheduledExactAnswerOverview,{entries:[{activity:current,index:0,cards,score,submitted}],selectedActivity:current.id,onSelect:()=>{}}));

describe('scheduled exact-answer overview',()=>{
  it('shows correct, wrong and missing responses separately without inventing a score',()=>{
    const html=renderOverview();
    expect(html).toContain('1 benar, 1 salah, 1 belum dijawab');
    expect(html).toContain('Nilai otomatis 33.33 / 100');
    expect(html).toContain('sr-donut-correct');
    expect(html).toContain('sr-donut-wrong');
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain('Nilai otomatis 33.333');
  });
  it('shows an empty ring rather than a zero grade when no submission exists',()=>{
    const html=renderOverview(activity,false,responseVerdicts(activity,undefined),undefined);
    expect(html).toContain('0 benar, 0 salah, 3 belum dijawab');
    expect(html).toContain('Belum mengirim');
    expect(html).not.toContain('class="sr-donut-correct"');
    expect(html).not.toContain('Nilai otomatis');
  });
  it('does not turn essays or reflection into donut charts',()=>{
    const writing:ScheduledActivity={...activity,worksheet:{items:[{id:'essay',prompt:'Write an email',type:'text'}]}};
    expect(renderOverview(writing)).toBe('');
  });
  it('counts only keyed items in a mixed exact-answer and essay activity',()=>{
    const mixed:ScheduledActivity={...activity,worksheet:{...activity.worksheet!,items:[...activity.worksheet!.items,{id:'essay',prompt:'Explain',type:'text'}]}};
    expect(renderOverview(mixed)).toContain('1 benar, 1 salah, 1 belum dijawab');
  });
  it('reflects lecturer overrides in the ring and retains the authoritative score',()=>{
    const cards=responseVerdicts(activity,attempt).map(card=>card.id==='wrong'?{...card,verdict:'correct' as const}:card);
    const html=renderOverview(activity,true,cards,66.67);
    expect(html).toContain('2 benar, 0 salah, 1 belum dijawab');
    expect(html).toContain('Nilai otomatis 66.67 / 100');
  });
  it('includes quizzes in the same donut overview',()=>{
    const quiz:ScheduledActivity={...activity,kind:'quiz',worksheet:undefined,questions:[{id:'question',text:'Choose',options:['A','B'],correctIndex:0,points:1,explanation:''}]};
    const cards=responseVerdicts(quiz,{...attempt,answers:{question:0}});
    expect(renderOverview(quiz,true,cards,100)).toContain('1 benar, 0 salah, 0 belum dijawab');
  });
});

it('renders full written answers with Tugas line numbering and preserves blank lines',()=>{
  const html=renderToStaticMarkup(createElement(ScheduledWrittenAnswer,{card:{id:'essay',number:1,prompt:'Write an email',answer:'Dear teacher,\n\nI cannot come today.\nKind regards.',verdict:'manual'}}));
  expect(html).toContain('evx-script sr-written-script');
  expect(html.match(/class="evx-line"/g)).toHaveLength(4);
  expect(html).toContain('I cannot come today.');
  expect(html).toContain('Kind regards.');
  expect(html).not.toContain('sr-row-answer');
});
