import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-cached-query', () => ({
	useCachedQuery: () => ({ data: undefined, loading: false, reload: vi.fn() }),
}));
vi.mock('@/lib/pocketbase-client', () => ({
	default: { authStore: { record: { name: 'Synthetic Student' }, token: '' } },
}));
vi.mock('@/lib/i18n', () => ({ useLanguage: () => 'id' }));
vi.mock('@/lib/student-home-copy', () => ({ useStudentHomeText: () => (text: string) => text }));
vi.mock('@/components/app/agent-task-panel', () => ({ AgentTaskPanel: () => null }));
vi.mock('@/components/app/practice-mascot', () => ({ PracticeMascot: () => null }));

import { StudentHomeAdventure } from '@/components/app/student-home-adventure';

describe('student empty-course progress state', () => {
	const render = (preview = false) =>
		renderToStaticMarkup(
			createElement(
				MemoryRouter,
				null,
				createElement(StudentHomeAdventure, { courses: [], preview }),
			),
		);

	it('does not invent zero XP or a level goal when the student has no courses', () => {
		const html = render();

		expect(html).not.toContain('0 XP');
		expect(html).not.toContain('0/100');
		expect(html).not.toContain('sd-game-level-track');
		expect(html).toContain('Perjalananmu');
		expect(html).toContain('—');
	});

	it('does not imply personal progress in the lecturer preview when data is unavailable', () => {
		const html = render(true);

		expect(html).toContain('Pratinjau mahasiswa');
		expect(html).not.toContain('0 XP');
		expect(html).not.toContain('0/100');
		expect(html).not.toContain('sd-game-level-track');
		expect(html).toContain('—');
	});
});
