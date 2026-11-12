import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {ScheduledReviewWorkspace} from '../src/components/app/scheduled-review-workspace';

/**
 * The lecturer review surface is a plain scrolling document.
 *
 * These assertions exist because the page previously had four independent
 * scroll-following behaviours (a sticky verdict bar, a sticky student column with
 * its own scroll box, a sticky grading column, and programmatic scrollIntoView on
 * every selection). They are easy to reintroduce by copying a rule from another
 * workspace, so the contract is pinned here rather than left to review.
 */

const stylesheet = (name: string) => readFileSync(new URL(`../src/styles/${name}`, import.meta.url), 'utf8');
const reviewStyles = ['scheduled-session-workspace.css', 'scheduled-review-student-sidebar.css', 'scheduled-review-overview.css'];

describe('review layout is static', () => {
	it('has no sticky positioning in the review stylesheets', () => {
		for (const name of reviewStyles) {
			expect(stylesheet(name), name).not.toMatch(/position\s*:\s*sticky/);
		}
	});

	it('has no scroll offsets that only existed to clear a sticky header', () => {
		for (const name of reviewStyles) {
			expect(stylesheet(name), name).not.toMatch(/scroll-margin/);
		}
	});

	it('does not scroll the page when the selection changes', () => {
		const source = readFileSync(new URL('../src/components/app/scheduled-review-workspace.tsx', import.meta.url), 'utf8');
		expect(source).not.toContain('scrollIntoView');
		expect(source).not.toContain('scroll-margin');
	});
});

describe('review stylesheets carry no superseded or unreadable rules', () => {
	it('defines the review grid once, on the element that actually owns it', () => {
		const session = stylesheet('scheduled-session-workspace.css');
		const sidebar = stylesheet('scheduled-review-student-sidebar.css');
		// The base rule only establishes the grid; the columns live on the
		// `.sr-workspace` rule that outranks it.
		expect(session).toContain('.sr-review-grid{display:grid;align-items:start}');
		expect(session).toMatch(/\.sr-workspace \.sr-review-grid\{grid-template-columns:/);
		// The competing base rule and the `.ss-workspace` variants never applied.
		expect(sidebar).not.toContain('sr-review-grid');
		expect(session).not.toContain('.ss-workspace .sr-review-grid');
	});

	it('keeps every font size in the review workspace at 10px or above', () => {
		const session = stylesheet('scheduled-session-workspace.css');
		expect(session).not.toMatch(/font-size:9px/);
	});

	it('does not style the removed grading-panel family', () => {
		for (const name of reviewStyles) {
			const css = stylesheet(name);
			expect(css, name).not.toMatch(/\.sr-grading[^-\w]/);
			expect(css, name).not.toContain('sr-grading-header');
			expect(css, name).not.toContain('sr-grading-mode');
			expect(css, name).not.toContain('sr-grade-context');
		}
	});

	it('sizes the grading panel call to action at body size', () => {
		const session = stylesheet('scheduled-session-workspace.css');
		expect(session).toContain('.sr-configure h4{font-size:14px}');
		expect(session).toContain('.sr-configure p{font-size:12px');
	});
});

const state: any = {
	owner: true,
	session: {id: 'session'},
	class: {id: 'class', phase: 'closed', revision: 4},
	activities: [
		{
			id: 'a',
			kind: 'assignment',
			title: 'Email writing',
			minutes: 10,
			required: true,
			startsAt: '',
			endsAt: '',
			worksheet: {items: [{id: 'i', prompt: 'Prompt', type: 'text'}]},
		},
	],
	attempts: [{id: 'attempt', activity: 'a', student: 's', answers: {responses: {i: 'My response'}}, revision: 2, status: 'submitted', complete: true}],
	report: [{student: 's', name: 'Student', nim: '1', attempts: []}],
	gradingSettings: [{id: 'settings', activity: 'a', revision: 1, mode: 'points', maxPoints: 10, criteria: []}],
	assessments: [],
	events: [],
	serverNow: '',
};

const render = (input: any = state) =>
	renderToStaticMarkup(createElement(ScheduledReviewWorkspace, {state: input, onAction: async () => {}}));

describe('review layout removes duplicated controls and labels', () => {
	it('renders exactly one student pager', () => {
		const html = render();
		const previousButtons = html.split('aria-label="Mahasiswa sebelumnya"').length - 1;
		expect(previousButtons).toBe(1);
		expect(html).not.toContain('evx-pager');
	});

	it('does not repeat the activity title and mode inside the grading panel', () => {
		const html = render();
		// The panel used to carry its own title block, repeating the activity header.
		expect(html).not.toContain('sr-assessment-card-title');
		// The score was printed in the bar, the activity header and the panel.
		expect(html).not.toContain('sr-grading-section-score');
	});

	it('still renders the grading controls a lecturer needs', () => {
		const html = render();
		expect(html).toContain('Simpan draf');
		expect(html).toContain('Ditinjau');
		expect(html).toContain('Pengaturan penilaian kegiatan');
		expect(html).toContain('My response');
	});
});
