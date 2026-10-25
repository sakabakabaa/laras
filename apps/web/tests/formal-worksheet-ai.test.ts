import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CheckAnswerPanel } from '@/components/app/task-workspaces/check-answer-panel';

describe('formal worksheet AI boundary', () => {
	it.each(['enrolled', 'public'] as const)('does not mount a checker for %s formal work, even with stale check flags', (channel) => {
		const buildResponse = vi.fn(() => ({ kind: 'writing' as const, content: 'Student work' }));
		const markup = renderToStaticMarkup(React.createElement(CheckAnswerPanel, { channel, assignment: {
			id: 'assignment123', activityType: 'formal', mode: 'individual', status: 'published', deadline: '', checkEnabled: true,
		}, buildResponse }));
		expect(markup).toBe('');
		expect(buildResponse).not.toHaveBeenCalled();
	});
	it('treats legacy assignments without an activity type as formal', () => {
		expect(renderToStaticMarkup(React.createElement(CheckAnswerPanel, { channel: 'enrolled', assignment: {
			id: 'assignment123', mode: 'individual', status: 'published', deadline: '',
		}, buildResponse: () => ({ kind: 'writing', content: '' }) }))).toBe('');
	});
});
