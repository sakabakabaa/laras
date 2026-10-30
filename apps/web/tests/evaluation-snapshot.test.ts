import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as snapshots from '@/lib/evaluation-snapshot.server';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

describe('generation evidence snapshot', () => {
 it('hashes JSON evidence independent of PocketBase object-key ordering', () => {
  const input = { studentText: '', structuredAnswers: '', task: { z: 1, a: 2 }, rubric: [], userPrompt: 'p', systemPrompt: 's', images: [], link: '', promptVersion: 'v1', systemPromptVersion: 'v1', providerConfig: { provider: 'bynara', model: 'gpt-6-luna' } };
  expect(snapshots.createResearchSnapshot(input).hashes.task).toBe(snapshots.createResearchSnapshot({ ...input, task: { a: 2, z: 1 } }).hashes.task);
 });
 it('hashes the entire generation evidence including image URLs and link', () => {
  const snapshot = snapshots.createResearchSnapshot({ studentText: '', structuredAnswers: '', task: {}, rubric: [], userPrompt: 'p', systemPrompt: 's', images: ['image'], link: 'link', promptVersion: 'v1', systemPromptVersion: 'v1', providerConfig: { provider: 'bynara', model: 'gpt-6-luna' } });
  const { snapshotHash, ...evidence } = snapshot;
  expect(snapshotHash).toBe(hash(snapshots.canonicalEvidenceJson(evidence)));
  expect(snapshots.canonicalEvidenceJson({ z: [{ b: 1, a: 2 }], a: 'text' })).toBe('{"a":"text","z":[{"a":2,"b":1}]}');
  expect(snapshot.buildId).toBe('unknown');
 });
 it('captures detached exact consumed evidence and secret-free provider config with honest unknown revision', () => {
  const task = { title: 'Aufgabe', taskConfig: { criteria: [{ label: 'Grammatik', weight: 1 }] } };
  const snapshot = snapshots.createResearchSnapshot({ studentText: '  Ich bin.\n', structuredAnswers: 'Antwort: ja', task, rubric: task.taskConfig.criteria, userPrompt: 'exact prompt\n', systemPrompt: 'exact system', images: ['https://example.test/photo'], link: '', promptVersion: 'v1', systemPromptVersion: 'v1', providerConfig: { provider: 'bynara', model: 'gpt-6-luna', modelVersion: 'unknown', apiKey: 'must-not-store', headers: { Authorization: 'must-not-store' } }, buildId: 'build-123' });
  task.title = 'changed'; task.taskConfig.criteria[0].label = 'changed';
  expect(snapshot.studentText).toBe('  Ich bin.\n');
  expect(snapshot.task.title).toBe('Aufgabe');
  expect(snapshot.rubric[0].label).toBe('Grammatik');
  expect(snapshot.hashes.studentText).toBe(hash(snapshot.studentText));
  expect(snapshot.hashes.userPrompt).toBe(hash('exact prompt\n'));
  expect(snapshot.hashes.systemPrompt).toBe(hash('exact system'));
  expect(snapshot.buildId).toBe('build-123');
  expect(snapshot.providerConfig.modelVersion).toBe('unknown');
  expect(JSON.stringify(snapshot)).not.toContain('must-not-store');
  expect(Object.isFrozen(snapshot.task)).toBe(true);
 });
});
