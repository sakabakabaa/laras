import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const sandbox = {module: {exports: {} as any}};
runInNewContext(readFileSync(resolve('../pocketbase/pb_hooks/scheduled-classes-domain.js'), 'utf8'), sandbox);
const rules = sandbox.module.exports;
const start = Date.parse('2026-10-27T02:00:00Z');
const draft = () => ({title: 'Kelas mandiri', startsAt: new Date(start).toISOString(), joinUntil: new Date(start + 10 * 60000).toISOString(), lateAfterMin: 5, activities: [
  {kind: 'material', title: 'Baca', minutes: 10, required: true, content: 'Baca materi.'},
  {kind: 'quiz', title: 'Kuis', minutes: 10, required: true, questions: [{text: 'Pilih A', options: ['A', 'B'], correctIndex: 0, points: 2}]},
]});

describe('scheduled-class timing and assessment rules', () => {
  it('preserves incomplete draft content but refuses to schedule it', () => {
    const incomplete = {...draft(), activities: [{kind: 'material', title: 'Materi', content: '', minutes: 10}, {kind: 'quiz', title: 'Kuis', minutes: 10, questions: [{text: '', options: ['', ''], correctIndex: -1, points: 0}]}]};
    expect(() => rules.validatePlan(incomplete, start - 1, false)).not.toThrow();
    expect(() => rules.validatePlan(incomplete, start - 1, true)).toThrow();
  });
  it('builds contiguous fixed windows independent of student entry time', () => {
    const plan = rules.validatePlan(draft(), start - 1, true);
    const windows = rules.windows(plan, plan.activities);
    expect(Date.parse(windows[0].startsAt)).toBe(start);
    expect(windows[0].endsAt).toBe(windows[1].startsAt);
    expect(Date.parse(windows[1].endsAt)).toBe(start + 20 * 60000);
    expect(rules.phase({...plan, status: 'scheduled'}, start - 1)).toBe('scheduled');
    expect(rules.phase({...plan, status: 'scheduled'}, start)).toBe('open');
    expect(rules.phase({...plan, status: 'scheduled'}, Date.parse(plan.endsAt))).toBe('closed');
  });
  it('rejects invalid timing, past publication, missing keys and unsafe material URLs', () => {
    expect(() => rules.validatePlan(draft(), start, true)).toThrow();
    expect(() => rules.validatePlan({...draft(), joinUntil: new Date(start - 1).toISOString()}, start - 1, true)).toThrow();
    expect(() => rules.validatePlan({...draft(), joinUntil: new Date(start + 20 * 60000).toISOString()}, start - 1, true)).toThrow();
    const invalid = draft(); invalid.activities[1].questions![0].correctIndex = -1;
    expect(() => rules.validatePlan(invalid, start - 1, true)).toThrow();
    expect(() => rules.validatePlan({...draft(), activities: [{kind: 'material', title: 'Bad', minutes: 1, url: 'javascript:alert(1)'}]}, start - 1, true)).toThrow();
  });
  it('whitelists answers and ignores client-provided score and completion', () => {
    const a = rules.validatePlan(draft(), start - 1, true).activities[1];
    const answers = rules.cleanAnswers(a, {q0: 1, score: 100, complete: true, q999: 0});
    expect({...answers}).toEqual({q0: 1});
    expect({...rules.result(a, answers)}).toEqual({score: 0, complete: true});
    expect({...rules.result(a, {})}).toEqual({score: 0, complete: false});
    expect(() => rules.cleanAnswers(a, {q0: 9})).toThrow();
  });
  it('uses participation rather than accuracy for attendance, and requires finalization', () => {
    const c = {startsAt: new Date(start).toISOString(), lateAfterMin: 5};
    const activities = [{id: 'quiz', required: true}, {id: 'optional', required: false}];
    const participant = {checkedInAt: new Date(start + 6 * 60000).toISOString()};
    expect(rules.attendance(c, participant, activities, [{activity: 'quiz', status: 'draft', complete: true}]).suggestion).toBe('absent');
    expect(rules.attendance(c, participant, activities, [{activity: 'quiz', status: 'expired', complete: true, score: 0}]).suggestion).toBe('late');
    expect(rules.attendance(c, null, activities, []).suggestion).toBe('absent');
  });
});

it('preserves optional exit feedback separately from reflection answers and scoring',()=>{
 const activity={kind:'exit_ticket',snapshot:{}};
 const answers=rules.cleanAnswers(activity,{text:'My reflection',feedback:'  More speaking practice, please.  '});
 expect(answers.feedback).toBe('More speaking practice, please.');
 expect(answers.text).toBe('My reflection');expect(rules.result(activity,answers).complete).toBe(true);
 expect(rules.result(activity,rules.cleanAnswers(activity,{feedback:'Feedback alone'})).complete).toBe(false);
 expect(rules.cleanAnswers({...activity,kind:'assignment'},{text:'Answer',feedback:'Injected'}).feedback).toBeUndefined();
 expect(rules.cleanAnswers(activity,{text:'Reflection',feedback:'x'.repeat(5000)}).feedback).toHaveLength(4000);
 const sheet={kind:'exit_ticket',snapshot:{worksheet:{items:[{id:'r',prompt:'Reflect',type:'text'}]}}};
 const worksheet=rules.cleanAnswers(sheet,{responses:{r:'I learned modal verbs'},feedback:'More examples'});
 expect(worksheet.feedback).toBe('More examples');expect(worksheet.responses.r).toBe('I learned modal verbs');
 expect(rules.result(sheet,worksheet)).toEqual({complete:true});
});
