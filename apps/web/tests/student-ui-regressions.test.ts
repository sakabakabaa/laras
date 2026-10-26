import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/pocketbase-client', () => ({ default: { authStore: { record: { id: 'student123', role: 'student', language: 'de' }, onChange: () => () => {} }, files: { getURL: (_record: unknown, name: string) => `/files/${name}` } } }));
vi.mock('@/hooks/use-unsaved-work', () => ({ useUnsavedWork: () => {} }));
import { StudentAnswerSheet } from '@/components/app/student-answer-sheet';
import { WritingWorkspace } from '@/components/app/task-workspaces/writing-workspace';
import { parseWritingConfig, normalizeEditableConfig, validateEditableConfig, splitTaskConfigForSave } from '@/lib/task-types';
import type { Assignment, AssignmentSubmission } from '@/lib/assignments';

const assignment = { id: 'task123', owner: 'teacher123', course: 'course123', title: 'Correction exercise', instructions: 'Correct the passage.', status: 'published', shape: 'writing', activityType: 'formal', mode: 'individual', deadline: '', taskConfig: { prompt: 'Correct the passage.', requiresSourceText: true, sourceText: 'Ich habe ein Hund.', allowText: true } } as Assignment;

describe('student worksheet regressions', () => {
 it.each(['Weiter', 'Continue', 'Lanjut'])('does not render a second footer when the workspace owns actions (%s)', primaryLabel => {
  const html = renderToStaticMarkup(React.createElement(StudentAnswerSheet, { title: 'Task', badges: [], instructions: [], materials: [], info: [], formative: false, step: 2, onStep: () => {}, workspace: true, workspaceOwnsActions: true, identity: null, answer: 'Editor', review: null, tips: [], primaryLabel, onPrimary: () => {} }));
  expect(html).toContain('Editor');
  expect(html).not.toContain('sas-foot');
  expect(html).not.toContain(`>${primaryLabel}`);
 });
 it('keeps the parent action available for the generic answer flow', () => {
  const html = renderToStaticMarkup(React.createElement(StudentAnswerSheet, { title: 'Task', badges: [], instructions: [], materials: [], info: [], formative: false, step: 2, onStep: () => {}, identity: null, answer: 'Editor', review: null, tips: [], primaryLabel: 'Next', onPrimary: () => {} }));
  expect(html).toContain('sas-foot');
  expect(html).toContain('Next');
 });
 it('shows the actual submitted answer and attachments instead of hiding them behind a completion card', () => {
  const submission = { id: 'sub123', content: 'Meine eingereichte Antwort.', status: 'submitted', files: ['answer.pdf'], taskAnswers: {} } as AssignmentSubmission;
  const html = renderToStaticMarkup(React.createElement(WritingWorkspace, { assignment, submission, onSaved: () => {} }));
  expect(html).toContain('Meine eingereichte Antwort.');
  expect(html).toContain('answer.pdf');
  expect(html).toContain('Arbeit eingereicht');
  expect(html).not.toContain('textarea');
 });
 it('shows the authored source passage separately from the student editor in the selected language', () => {
  const html = renderToStaticMarkup(React.createElement(WritingWorkspace, { assignment, submission: null, onSaved: () => {}, asideChecks: true }));
  expect(html).toContain('Ich habe ein Hund.');
  expect(html).toContain('Ausgangstext');
  expect(html).toContain('Entwurf speichern');
  expect(html).toContain('Aufgabe abgeben');
 });
 it('preserves and validates a required source passage through authoring normalization and serialization', () => {
  const writing = parseWritingConfig(assignment.taskConfig);
  const normalized = normalizeEditableConfig({ kind: 'writing', writing });
  expect(normalized.kind === 'writing' && normalized.writing.sourceText).toBe('Ich habe ein Hund.');
  expect(splitTaskConfigForSave(normalized).taskConfig).toMatchObject({ requiresSourceText: true, sourceText: 'Ich habe ein Hund.' });
  const warnings = validateEditableConfig({ kind: 'writing', writing: { ...writing, sourceText: '' } });
  expect(warnings.some(w => w.field === 'sourceText')).toBe(true);
 });
});
