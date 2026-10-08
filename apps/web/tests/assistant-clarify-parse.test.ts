import { describe, expect, it } from 'vitest';
import { hasClarifyProtocol, parseClarifyBlock, stripClarifyBlock } from '@/lib/assistant/parsing';

/**
 * Regression for the lecturer-visible leak: the model emitted an unclosed
 * ```clarify fence and the raw JSON was rendered in the bubble.
 */
const LEAKED = `Baik, saya coba lagi. Agar saya bisa membuat draf tugasnya, saya perlu jenis aktivitas tugasnya (format kerja) yang Anda maksud di LARAS.
\`\`\`clarify
{"questions":[{"prompt":"Tugas menulis ini termasuk aktivitas apa: formal atau formatif?","placeholder":"Ketik: formal / formatif"}]}`;

describe('clarify protocol leak', () => {
	it('parses the unclosed fence format shown in the assistant bubble', () => {
		expect(parseClarifyBlock(LEAKED)).toEqual([
			{
				prompt: 'Tugas menulis ini termasuk aktivitas apa: formal atau formatif?',
				placeholder: 'Ketik: formal / formatif',
			},
		]);
	});

	it('never leaves protocol markers or raw JSON in lecturer-visible text', () => {
		const visible = stripClarifyBlock(LEAKED);
		expect(visible).toContain('Baik, saya coba lagi.');
		expect(visible).not.toMatch(/```/);
		expect(visible).not.toMatch(/clarify/i);
		expect(visible).not.toMatch(/"questions"/);
		expect(visible).not.toMatch(/placeholder/);
		expect(hasClarifyProtocol(visible)).toBe(false);
	});

	it('still parses a closed fence', () => {
		const closed = `${LEAKED}\n\`\`\``;
		expect(parseClarifyBlock(closed)?.[0]?.prompt).toMatch(/formal atau formatif/);
		expect(stripClarifyBlock(closed)).not.toMatch(/```/);
	});

	it('repairs a questions object whose strings contain newlines', () => {
		const wrapped = `Pengantar.\n\`\`\`clarify\n{"questions":[{"prompt":"Tugas\\nmenulis ini formal atau\\nformatif?","placeholder":"Ketik:\\nformal / formatif"}]}`;
		const questions = parseClarifyBlock(wrapped);
		expect(questions?.[0]?.prompt).toMatch(/formal atau formatif/);
		expect(stripClarifyBlock(wrapped)).toBe('Pengantar.');
	});
});
