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
    expect(html).toContain('00:20:00');
    expect(html).toContain('Public chapter excerpt');
    expect(html.indexOf('sc-student-schedule')).toBeLessThan(html.indexOf('sc-workspace'));
		expect(html).not.toContain('sc-activity-plan');
    expect(html).toContain('Session time remaining');
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
    state.attempts=[{id:'done',activity:'read',student:'student',answers:{acknowledged:true},revision:1,status:'submitted',savedAt:iso(0),finalizedAt:iso(0),complete:true}];
    const html = render(state, now + 10 * 60000);
    expect(html).toContain('Finish activity');
    expect(html).toContain('Final question');
  });

});

it('offers an optional feedback field on exit tickets without changing other activities',()=>{
 const state=fixture();state.activities=[{...state.activities[0],kind:'exit_ticket',content:'Reflect on your learning'}];
 const html=render(state);
 expect(html).toContain('Learning feedback');expect(html).toContain('Optional');expect(html).toContain('maxLength="4000"');
 expect(html).toContain('It does not affect your score or completion.');
 expect(render(fixture())).not.toContain('Learning feedback');
});

it('renders Wortkasten heading cleanly and prefers lesson videos over duplicate book images on worksheet activities',()=>{
 const state=fixture();
 state.activities=[{
  ...state.activities[0],
  kind:'assignment',
  title:'12d · Schreiben Sie einen Text über Ihre Stadt',
  content:'Schreiben Sie einen Text über Ihre Stadt.',
  lesson:{
   goal:{de:'Schreiben',id:'Menulis'},
   steps:[{de:'Sehen Sie das Video an.',id:'Tonton video.'}],
   videos:[{id:'v1',title:{de:'Eine Stadt vorstellen',id:'Kota'},src:'/media/lessons/im-kaufhaus/berlin-3-stadt.mp4',poster:'/media/lessons/im-kaufhaus/berlin-3-stadt.jpg',duration:'1:07'}],
   videoNote:{de:'Beschreibung DE',id:'Deskripsi ID'},
   scenes:[{kind:'sentence',title:{de:'Satzmodell',id:'Pola'},intro:{de:'Beispiel',id:'Contoh'},sentence:{words:['In Berlin'],roles:['Ort'],translation:'Di Berlin'}}],
  },
  sources:[{id:'img1',title:'Berlin Texte A-D',version:1,available:true,filename:'berlin_a_d.jpg'}],
  worksheet:{items:[{id:'w1',type:'text',prompt:'Schreiben Sie (Ich lebe in …)'}]},
 }];
 const html12d=render(state);
 expect(html12d).toContain('Lernvideos · Video pembelajaran');
 expect(html12d).toContain('berlin-3-stadt.mp4');
 expect(html12d).not.toContain('sc-picture-reference');
 expect(html12d).not.toContain('sl-video-link');
 expect(html12d).not.toContain('Buka video di tab baru');
 expect(html12d).not.toContain('sl-video-language-note');
 expect(html12d).not.toContain('Deskripsi ID');
 expect(html12d).not.toContain('sl-goal');
 expect(html12d).not.toContain('sl-stage');

 state.activities=[{
  ...state.activities[0],
  kind:'assignment',
  title:'ÜB 11a · Wo finde ich ...?',
  content:'Wortkasten / Pilihan kata: brauchen · finden · geben · kaufen · suchen',
  worksheet:{items:[{id:'g1',type:'text',prompt:'Dialog A · Lücke 1: Wo ______ es Tee?'}]},
 }];
 const htmlUb11a=render(state);
 expect(htmlUb11a).toContain('<h3>Wortkasten · Pilihan kata</h3>');
 expect(htmlUb11a).toContain('brauchen · finden · geben · kaufen · suchen');
});
