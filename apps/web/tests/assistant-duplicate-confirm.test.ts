import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	ROSTER_ADD_CONFIRM_NOTE,
	collapseAssistantThread,
	collapseRepeatedAssistantText,
	decideAssistantVisible,
} from '@/lib/assistant/parsing';

const CONFIRM = 'Saya akan menambahkan seluruh mahasiswa pada section/kelas “A” di VERSTEHEN (JR241) ke mata kuliah SCHREIBEN (JR242), dengan mode: menambahkan tanpa menghapus roster SCHREIBEN yang sudah ada. Mohon konfirmasi agar saya menjalankan penambahan roster tersebut.';

const TRUNCATED = 'Saya akan menambahkan seluruh mahasiswa pada section/kelas “A” di VERSTEHEN (JR241) ke mata kuliah SCHREIBEN (JR242), dengan mode: menambahkan tanpa menghapus roster SCHREIBEN yang sudah ada. Mohon konfirmasi agar saya menjalankan penambahan roster';

describe('assistant duplicate confirmation', () => {
	it('collapses a confirmation paragraph that was repeated inside one reply', () => {
		const doubled = `${CONFIRM}\n\n${TRUNCATED}`;
		expect(collapseRepeatedAssistantText(doubled)).toBe(CONFIRM);
		expect(collapseRepeatedAssistantText(doubled).match(/Saya akan menambahkan/g)).toHaveLength(1);
	});

	it('does not show the same roster-add request again, and does not treat chat “ok” as a write', () => {
		const first = decideAssistantVisible(CONFIRM, []);
		expect(first).toEqual({ action: 'show', text: CONFIRM });

		const repeated = decideAssistantVisible(CONFIRM, [CONFIRM]);
		expect(repeated.action).toBe('note');
		if (repeated.action === 'note') {
			expect(repeated.text).toBe(ROSTER_ADD_CONFIRM_NOTE);
			expect(repeated.text).toMatch(/belum diubah/i);
			expect(repeated.text).not.toMatch(/Saya akan menambahkan/);
		}

		const again = decideAssistantVisible(`${CONFIRM}\n\n${CONFIRM}`, [CONFIRM, ROSTER_ADD_CONFIRM_NOTE]);
		expect(again).toEqual({ action: 'suppress' });
	});

	it('hides a second stored bubble with the same confirmation', () => {
		const thread = collapseAssistantThread([
			{ role: 'assistant', content: CONFIRM },
			{ role: 'user', content: 'ok' },
			{ role: 'assistant', content: `${CONFIRM}\n\n${TRUNCATED}` },
		]);
		expect(thread).toHaveLength(2);
		expect(thread[0].content).toBe(CONFIRM);
		expect(thread[1]).toMatchObject({ role: 'user', content: 'ok' });
	});
});

describe('assistant panel scrollbar', () => {
	const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

	it('scrolls inside the chat thread, with the thumb at the card edge and no track', () => {
		const thread = css.match(/\.asst-thread\{[^}]+\}/)?.[0] ?? '';
		expect(thread).toContain('overflow-y:auto');
		expect(thread).toContain('min-height:0');
		expect(thread).toContain('scrollbar-color:rgba(23,32,51,.45) transparent');
		expect(css).toContain('.asst-thread::-webkit-scrollbar-track,.asst-thread::-webkit-scrollbar-track-piece{background:transparent');
		expect(css).toContain('.asst-thread::-webkit-scrollbar-thumb{background:rgba(23,32,51,.42)');
		expect(css).toMatch(/\.ld-stage\{[^}]*overflow:hidden/);
		expect(css).toMatch(/\.ld-agent-body\{[^}]*overflow:hidden/);
		expect(css).toMatch(/\.asst-drawer\{[^}]*overflow:hidden/);
		expect(css).toContain('.ld-stage.agent-open .ld-agent-panel{flex:1 1 0;width:auto;min-width:0;max-height:100%');
	});
});
