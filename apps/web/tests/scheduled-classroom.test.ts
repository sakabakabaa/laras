import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduledClassState } from '@/lib/scheduled-classes';

vi.mock('@/lib/pocketbase-client', () => ({default: {authStore: {record: {id: 'student', language: 'en'}}}}));
import { ScheduledClassroom } from '@/components/app/scheduled-classroom';

const now = Date.parse('2026-10-28T06:00:00Z');
const iso = (minutes: number) => new Date(now + minutes * 60000).toISOString();
function fixture(): ScheduledClassState {
  return {
    serverNow: iso(0), owner: false, session: {id: 'session', title: 'Test class', course: 'course'},
    class: {id: 'class', title: 'Test class', instructions: 'Read and answer.', section: '', startsAt: iso(-5), endsAt: iso(20), joinUntil: iso(10), lateAfterMin: 5, revision: 1, releaseResults: false, status: 'scheduled', phase: 'open'},
    participant: {checkedInAt: iso(-4), lastSeenAt: iso(0)},
    activities: [
      {id: 'read', title: 'Read the chapter', kind: 'material', required: true, minutes: 10, startsAt: iso(-5), endsAt: iso(5), content: 'Public chapter excerpt'},
      {id: 'quiz', title: 'Chapter quiz', kind: 'quiz', required: true, minutes: 15, startsAt: iso(5), endsAt: iso(20)},
    ], attempts: [], report: [], events: [],
  };
}
const render = (state: ScheduledClassState, time = now) => renderToStaticMarkup(createElement(ScheduledClassroom, {state, now: time, connected: true, onState: () => {}}));

describe('student scheduled classroom', () => {
  it('leads with the active activity and shows a server-clock countdown', () => {
    const html = render(fixture());
    expect(html).toContain('05:00');
    expect(html).toContain('Public chapter excerpt');
    expect(html.indexOf('sc-student-schedule')).toBeLessThan(html.indexOf('sc-workspace'));
		expect(html).not.toContain('sc-activity-plan');
    expect(html).toContain('Time remaining');
    expect(html).not.toContain('Chapter quiz');
  });
  it('withholds the workspace until check-in and disables joining before class opens', () => {
    const state = fixture(); state.participant = null; state.class!.phase = 'scheduled';
    const html = render(state);
    expect(html).not.toContain('Public chapter excerpt');
    expect(html).toContain('Class starts soon');
    expect(html).toMatch(/<button class="sc-primary" disabled=""/);
  });
  it('shows a completed-session summary without implying attendance approval or released results', () => {
    const state = fixture(); state.class!.phase = 'closed';
    state.attempts = [{id: 'attempt', activity: 'read', student: 'student', answers: {acknowledged: true}, revision: 1, status: 'submitted', savedAt: iso(-1), finalizedAt: iso(-1), complete: true}];
    const html = render(state, now + 30 * 60000);
    expect(html).toContain('Your class session has ended');
    expect(html).toContain('Quiz results become available when your lecturer releases them.');
    expect(html).not.toContain('Submit answers');
    expect(html).not.toContain('Attendance recorded');
  });
  it('does not present cancelled activities as available', () => {
    const state = fixture(); state.class!.phase = 'cancelled';
    const html = render(state);
    expect(html).toContain('Your lecturer cancelled this class.');
    expect(html).not.toContain('Public chapter excerpt');
    expect(html).not.toContain('Mark as complete');
  });
  it('labels optional activities without restoring the removed progress panel', () => {
    const state = fixture(); state.activities[0].required = false;
    const html = render(state);
    expect(html).not.toContain('Required activities completed');
    expect(html).toContain('Class schedule');
		expect(html).toContain('Checked in');
    expect(html).toContain('Optional');
    expect(html).not.toContain('sc-plan-heading');
  });
  it('offers finishing the last activity instead of waiting for a nonexistent next step', () => {
    const state = fixture(); state.activities[1].content = 'Final question';
    const html = render(state, now + 10 * 60000);
    expect(html).toContain('Finish activity');
    expect(html).toContain('Final question');
  });

});
