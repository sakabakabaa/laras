import {describe, expect, it} from 'vitest';
import {buildAssessmentPayload, buildGradingSettingsPayload, buildPublishPayload, formatScheduledResponse, validateManualGrade} from '../src/lib/scheduled-review';

const sampleActivity = {kind:'assignment', worksheet:{items:[{id:'gap-a',prompt:'Fill gap',type:'text'}],blocks:[{type:'instructions',body:{id:'Read carefully'}}]}, content:'Source text', sources:[{title:'Textbook',version:2,available:true}]};
const sampleAttempt = {answers:{responses:{'gap-a':'answer'},text:'also answer'}, complete:false, status:'submitted'};

it('distinguishes prompt response and source refs while showing submission completeness', () => {
  const view = formatScheduledResponse(sampleActivity, sampleAttempt);
  expect(view).toContain('Fill gap');
  expect(view).toContain('Read carefully');
  expect(view).toContain('answer');
  expect(view).toContain('Textbook');
  expect(view).toContain('Belum lengkap');
});

it('allows ungraded feedback-only reviews and rejects score fields there', () => {
  expect(validateManualGrade({mode:'ungraded',maxPoints:0,criteria:[]}, {points:null,criterionScores:{}})).toBeNull();
  expect(validateManualGrade({mode:'ungraded',maxPoints:0,criteria:[]}, {points:2,criterionScores:{}})).not.toBeNull();
});

it('rejects rubric points that do not equal criterion score total', () => {
  expect(validateManualGrade({mode:'rubric',maxPoints:10,criteria:[{id:'c',label:'Criterion',maxPoints:10}]}, {points:7,criterionScores:{c:8}})).not.toBeNull();
});

it('treats missing worksheet response as incomplete without changing the source answer', () => {
  const view = formatScheduledResponse({kind:'assignment',worksheet:{items:[{id:'gap-a',prompt:'Fill gap',type:'text'}]}}, {answers:{responses:{}}, complete:false, status:'submitted'});
  expect(view).toContain('Fill gap');
  expect(view).toContain('Belum dijawab');
});

it('marks exact answers against the key and shows reference models', () => {
  const activity = {kind:'assignment', worksheet:{items:[{id:'a',prompt:'Q1',type:'select'},{id:'b',prompt:'Q2',type:'select'},{id:'c',prompt:'Q3',type:'text'}], answerKey:{items:{a:{mode:'exact',accepted:['B']},b:{mode:'exact',accepted:['C']},c:{mode:'reference',modelAnswer:'Du musst Tee trinken.',rubric:'Fleksibel'}}}}};
  const view = formatScheduledResponse(activity, {answers:{responses:{a:'B',b:'A',c:'saya minum teh'}}, complete:true, status:'submitted'});
  expect(view).toContain('✓ Benar · Kunci: B');
  expect(view).toContain('✗ Salah · Kunci: C');
  expect(view).toContain('Acuan: Du musst Tee trinken.');
});


describe('scheduled review helpers', () => {
  it('renders worksheet response map without losing text answers', () => {
    expect(formatScheduledResponse({kind:'assignment', worksheet:{items:[{id:'gap-a',prompt:'Fill gap',type:'text'}]}, answers:{responses:{'gap-a':'answer'},text:'also answer'}})).toEqual('Fill gap\nanswer\n\nalso answer');
  });
  it('builds assessment save payloads from the assessment revision', () => {
    expect(buildAssessmentPayload({assessmentRevision: 3, attemptRevision: 2, settingsRevision: 1, status: 'draft', points: null, criterionScores: {}, feedback: 'ok', attemptId: 'a'} as never)).toEqual({attemptId: 'a', baseRevision: 3, attemptRevision: 2, settingsRevision: 1, status: 'draft', points: null, criterionScores: {}, feedback: 'ok'});
  });
  it('builds publish payloads from the assessment revision, not the class revision', () => {
    expect(buildPublishPayload({assessmentRevision: 4, attemptRevision: 2, settingsRevision: 1, attemptId: 'a'} as never)).toEqual({attemptId: 'a', baseRevision: 4, attemptRevision: 2, settingsRevision: 1});
  });
  it('builds grading settings payloads with an explicit rubric criteria array', () => {
    expect(buildGradingSettingsPayload({activityId: 'a', settingsRevision: 2, mode: 'rubric', maxPoints: 10, criteria: [{id: 'c', label: 'Criterion', maxPoints: 10}]} as never)).toEqual({activityId: 'a', baseRevision: 2, mode: 'rubric', maxPoints: 10, criteria: [{id: 'c', label: 'Criterion', maxPoints: 10}]});
  });
  it('validates manual points and rubric totals against configured bounds', () => {
    expect(validateManualGrade({mode:'points',maxPoints:10,criteria:[]}, {points:11,criterionScores:{}})).toBe('Nilai harus antara 0 dan 10.');
    expect(validateManualGrade({mode:'rubric',maxPoints:10,criteria:[{id:'c',label:'Criterion',maxPoints:10}]}, {points:8,criterionScores:{c:8}})).toBeNull();
    expect(validateManualGrade({mode:'rubric',maxPoints:10,criteria:[{id:'c',label:'Criterion',maxPoints:10}]}, {points:8,criterionScores:{}})).not.toBeNull();
  });
});
