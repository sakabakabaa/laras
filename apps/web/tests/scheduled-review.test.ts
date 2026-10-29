import {describe, expect, it} from 'vitest';
import {buildAssessmentPayload, buildGradingSettingsPayload, buildPublishPayload, formatScheduledResponse, hydrateGradeDraft, validateManualGrade} from '../src/lib/scheduled-review';

const emptyGradeDraft = {feedback: '', points: '', criterionScores: {}};

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


describe('grade draft hydration', () => {
  it('discards dirty draft when submission identity changes', () => {
    const result = hydrateGradeDraft({feedback: 'grade for A', points: '8', criterionScores: {}}, 'attempt-a', 'attempt-b', null);
    expect(result).toEqual({draft: emptyGradeDraft, changedIdentity: true});
  });

  it('loads target saved feedback instead of leaking previous submission draft', () => {
    expect(hydrateGradeDraft({feedback: 'unsaved A', points: '8', criterionScores: {}}, 'attempt-a', 'attempt-b', {feedback: 'saved B', points: 4, criterionScores: {}})).toEqual({draft: {feedback: 'saved B', points: '4', criterionScores: {}}, changedIdentity: true});
  });

  it('preserves dirty draft on same-submission polling', () => {
    const dirty = {feedback: 'unsaved', points: '8', criterionScores: {}};
    expect(hydrateGradeDraft(dirty, 'attempt-a', 'attempt-a', {attempt: 'attempt-a', feedback: 'saved', points: 5, criterionScores: {}})).toEqual({draft: dirty, changedIdentity: false});
  });

  it('hydrates clean same-submission revisions, including empty criteria', () => {
    expect(hydrateGradeDraft({feedback: 'old', points: '5', criterionScores: {x: '2'}}, 'attempt-a', 'attempt-a', {attempt: 'attempt-a', revision: 2, feedback: '', points: null, criterionScores: {}}, false)).toEqual({draft: emptyGradeDraft, changedIdentity: false});
  });
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
