import { writeFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ prompts: [] as string[], reply: 'Naya heißt Naya.' }));

vi.mock('node:child_process', () => ({
	execFile: (cmd: string, args: string[], _opts: unknown, cb: (e: Error | null, out?: unknown) => void) => {
		if (cmd === 'pdfinfo') return cb(null, { stdout: 'Pages: 1' });
		const prefix = args[args.length - 1];
		writeFileSync(`${prefix}-1.png`, Buffer.from([137, 80, 78, 71]));
		return cb(null, { stdout: '' });
	},
}));
vi.mock('@/lib/hostinger-model.server', () => ({
	collectHostingerText: vi.fn(async (input: { prompt: string }) => {
		state.prompts.push(input.prompt);
		return { content: state.reply };
	}),
}));

import { ocrPdf } from '@/lib/pdf-ocr.server';
import { answerTextFromExtraction, stripExtractionMarkers, stripScannerWatermarks } from '@/lib/ocr-clean';

beforeEach(() => {
	state.prompts = [];
	state.reply = 'Naya heißt Naya.';
});

describe('ocrPdf purpose', () => {
	it('reads the whole page for course material by default', async () => {
		await ocrPdf(Buffer.from('%PDF'));
		expect(state.prompts[0]).toContain('Ekstrak seluruh teks yang terlihat');
	});
	it('reads only the participant\'s own writing for an answer', async () => {
		const result = await ocrPdf(Buffer.from('%PDF'), { purpose: 'answer' });
		expect(result.ok).toBe(true);
		const prompt = state.prompts[0];
		expect(prompt).toContain('HANYA jawaban yang ditulis atau diketik mahasiswa');
		expect(prompt).toContain('JANGAN menyalin teks bawaan lembar kerja');
		expect(prompt).toContain('CamScanner');
		expect(prompt).not.toContain('Ekstrak seluruh teks yang terlihat');
	});
});

describe('stripScannerWatermarks', () => {
	it('removes a trailing watermark from the last line of text', () => {
		expect(stripScannerWatermarks('Sie ist Studentin. Dipindai dengan CamScanner')).toBe('Sie ist Studentin.');
	});
	it('removes a watermark that sits on its own line', () => {
		expect(stripScannerWatermarks('Zeile eins\nScanned with CamScanner\nZeile zwei')).toBe('Zeile eins\n\nZeile zwei');
	});
	it('handles other scanner apps and leaves normal German untouched', () => {
		expect(stripScannerWatermarks('Hallo\nDipindai dengan Adobe Scan')).toBe('Hallo');
		const german = 'Ich lerne Deutsch. Meine Handynummer ist 0857.';
		expect(stripScannerWatermarks(german)).toBe(german);
	});
});

describe('stripExtractionMarkers', () => {
	it('drops file and page headers but keeps the answer', () => {
		const raw = '[DOKUMEN PINDAI: tp1.pdf]\n[Halaman 1]\nNaya heißt Naya.\n\n[Halaman 2]\nSie wohnt in Bandung.';
		expect(stripExtractionMarkers(raw)).toBe('Naya heißt Naya.\n\nSie wohnt in Bandung.');
	});
	it('drops an image header', () => {
		expect(stripExtractionMarkers('[LAMPIRAN GAMBAR: a.jpg, b.jpg]\nText')).toBe('Text');
	});
	it('does not touch bracketed words inside the answer', () => {
		expect(stripExtractionMarkers('Er sagte [tidak terbaca] und ging.')).toBe('Er sagte [tidak terbaca] und ging.');
	});
});

describe('answerTextFromExtraction', () => {
	it('turns the reported scan into just the answer', () => {
		const raw = '[DOKUMEN PINDAI: tp1_yasyfa.pdf]\n[Halaman 1]\nSie heißt Naya. Sie ist Studentin. Dipindai dengan CamScanner';
		expect(answerTextFromExtraction(raw)).toBe('Sie heißt Naya. Sie ist Studentin.');
	});
});
