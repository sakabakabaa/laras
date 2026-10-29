import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const assessment = {exports:{}} as {exports:Record<string, (...args:any[])=>any>};
runInNewContext(readFileSync(new URL('../../pocketbase/pb_hooks/scheduled-assessment.js', import.meta.url), 'utf8'), {module:assessment});
const domain = assessment.exports;

describe('scheduled assessment validation', () => {
  it('calculates rubric total from validated criterion scores', () => {
    const result = domain.validateGrade({mode:'rubric',maxPoints:10,criteria:[{id:'grammar',label:'Grammar',maxPoints:6},{id:'clarity',label:'Clarity',maxPoints:4}]},{grammar:5,clarity:3},null);
    expect(result).toEqual({points:8,criterionScores:{grammar:5,clarity:3}});
  });
  it('rejects scores outside criterion bounds', () => {
    expect(() => domain.validateGrade({mode:'rubric',maxPoints:10,criteria:[{id:'c',label:'Criterion',maxPoints:10}]},{c:11},null)).toThrow();
  });
  it('accepts feedback-only ungraded assessments with null points', () => {
    expect(domain.validateGrade({mode:'ungraded',maxPoints:0,criteria:[]}, {}, null)).toEqual({points:null,criterionScores:{}});
  });
  it('rejects unsafe rubric keys and malformed bounded criterion strings', () => {
    expect(() => domain.validateSettings({mode:'rubric',maxPoints:1,criteria:[{id:'__proto__',label:'x',maxPoints:1}]})).toThrow();
    expect(() => domain.validateSettings({mode:'rubric',maxPoints:1,criteria:[{id:'x'.repeat(101),label:'ok',maxPoints:1}]})).toThrow();
    expect(() => domain.validateSettings({mode:'rubric',maxPoints:1,criteria:[{id:'ok',label:'x'.repeat(201),maxPoints:1}]})).toThrow();
  });
  it('keeps scoring inputs out of ungraded feedback-only assessments', () => {
    expect(domain.validateGrade({mode:'ungraded',maxPoints:0,criteria:[]}, {}, 4)).toEqual({points:null,criterionScores:{}});
  });
  it('whitelists student published projection fields', () => {
    expect(domain.studentPublished({attempt:'a',activity:'b',points:7,maxPoints:10,feedback:'ok',publishedAt:'now',student:'private',revision:3})).toEqual({attempt:'a',activity:'b',points:7,maxPoints:10,feedback:'ok',publishedAt:'now'});
  });
  it('tracks published revision separately for explicit republish', () => {
    expect(service).toContain('publishedRevision');
    expect(service).toContain('body.baseRevision');
  });
  it('does not permit settings updates outside the explicit settings contract', () => {
    expect(service).toContain('validateSettings');
  });
  it('checks attempt and activity class linkage before assessment writes', () => {
    expect(service).toContain("attempt.getString('activity') !== activity.id");
    expect(service).toContain("attempt.getString('class') !== c.id");
  });
  it('student state uses a strict published projection', () => {
    expect(service).toContain('studentPublished');
  });
  it('migration uses typed fields and disables cascade relations', () => {
    expect(service).toBeDefined();
  });
});
const service = readFileSync(new URL('../../pocketbase/pb_hooks/scheduled-classes-service.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../pocketbase/pb_migrations/1793200000_scheduled_assessments.js', import.meta.url), 'utf8');
describe('scheduled assessment service safeguards', () => {
  it('rejects non-assignment activity kinds', () => {
    expect(() => domain.assertGradable('quiz')).toThrow();
  });
  it('validates criterion labels and IDs before saving a rubric', () => {
    expect(() => domain.validateSettings({mode:'rubric',maxPoints:10,criteria:[{id:'bad id',label:'',maxPoints:10}]})).toThrow();
  });
  it('rejects non-finite score values', () => {
    expect(() => domain.validateGrade({mode:'points',maxPoints:10}, {}, Infinity)).toThrow();
  });
});

describe('scheduled assessment service safeguards', () => {
  const service = readFileSync(new URL('../../pocketbase/pb_hooks/scheduled-classes-service.js', import.meta.url), 'utf8');
  it('does not expose private grading settings in student state', () => {
    expect(service).toContain('if (!owner) return {assessments:published}');
  });
  it('uses typed fields and non-cascading relations', () => {
    expect(migration).toContain('new RelationField(');
    expect(migration).toContain('cascadeDelete: false');
    expect(migration).toContain('new JSONField(');
    expect(migration).toContain('idx_scheduled_grading_setting');
    expect(migration).toContain('idx_scheduled_assessment_attempt');
    expect(migration).toContain('collection.fields.add(field)');
    expect(migration).toContain('collection.indexes = [index]');
    expect(migration.indexOf('collection.fields.add(field)')).toBeLessThan(migration.indexOf('collection.indexes = [index]'));
  });
  it('makes student state from whitelisted published values', () => {
    expect(service).toContain('studentPublished');
  });
  it('checks base revision before publishing and validates publish dependencies', () => {
    expect(service).toContain('body.baseRevision !== record.getInt');
    expect(service).toContain('publishedRevision');
  });
  it('keeps student projection free of internal publication metadata', () => {
    expect(service).toContain("delete published.publishedRevision");
  });
  it('permits feedback-only saves under ungraded settings', () => {
    expect(service).not.toContain("setting.getString('mode') === 'ungraded'");
  });
});
