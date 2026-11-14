import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it} from 'vitest';
import {parseStructuredFindings, type EvalFinding} from '../src/lib/ai-evaluation';
import {anchorDraftFindings, scheduledAttemptMarks, type AttemptMarks, type ScheduledAiFinding} from '../src/lib/scheduled-answer-marks';
import {ScheduledWrittenAnswer} from '../src/components/app/scheduled-written-answer';
import type {ResponseVerdictCard} from '../src/lib/session-review-verdict';

const answers = [
	{id: 'a', answer: 'Ich gehe zu Schule.'},
	{id: 'empty', answer: ''},
	{id: 'b', answer: 'Er hat Hunger. Er hat Hunger.'},
	{id: 'c', answer: 'Wir fahren nach Berlin.'},
];
// What the model's quotes are verified against (answersTextOf).
const joined = answers.map((item) => item.answer).filter(Boolean).join('\n\n');

const raw = (quote: string, severity = 'minor', note = 'Catatan') => ({severity, quote, note, correction: 'Korrektur', explanation: 'Penjelasan'});
const verified = (items: ReturnType<typeof raw>[]): EvalFinding[] => parseStructuredFindings(items, joined, []);

const record = (findings: ScheduledAiFinding[], checked?: ReturnType<typeof anchorDraftFindings>['answers'], revision = 3) => ({
	attempt: 'att', status: 'ready', attemptRevision: revision, draft: {findings, ...(checked ? {answers: checked} : {})},
});
const attempt = {id: 'att', revision: 3};

describe('anchorDraftFindings', () => {
	it('maps joined-text offsets to the answer they lie in, skipping empty answers', () => {
		const result = anchorDraftFindings(verified([raw('zu Schule', 'major'), raw('nach Berlin')]), answers);
		expect(result.findings[0]).toMatchObject({severity: 'major', itemId: 'a', answerIndex: 0, answerStart: 9, answerEnd: 18, quoteStart: 9, quoteEnd: 18});
		// 'c' starts after 'a', the separator and 'b' — the empty answer adds nothing.
		const cStart = joined.indexOf('Wir fahren');
		expect(result.findings[1]).toMatchObject({itemId: 'c', answerIndex: 3, answerStart: 11, answerEnd: 22, quoteStart: cStart + 11});
		expect(result.answers).toEqual([
			{itemId: 'a', answerIndex: 0, length: 19},
			{itemId: 'b', answerIndex: 2, length: 29},
			{itemId: 'c', answerIndex: 3, length: 23},
		]);
	});

	it('keeps ambiguous, invalid and general findings without an answer anchor', () => {
		const result = anchorDraftFindings(verified([raw('Er hat Hunger'), raw('erfunden'), raw('')]), answers);
		expect(result.findings[0]).toMatchObject({anchorAmbiguous: true, itemId: null, answerStart: null});
		expect(result.findings[1]).toMatchObject({anchorValid: false, quote: '', itemId: null});
		expect(result.findings[2]).toMatchObject({quote: '', itemId: null, answerIndex: null});
	});

	it('never anchors a quote that spans two answers', () => {
		const spanning: EvalFinding = {severity: 'minor', quote: 'Schule.\n\nEr', note: 'x', evidence: '', anchorValid: true, anchorAmbiguous: false, quoteStart: 12, quoteEnd: 23};
		expect(anchorDraftFindings([spanning], answers).findings[0]).toMatchObject({itemId: null, answerStart: null});
	});
});

describe('scheduledAttemptMarks', () => {
	const cards = [{id: 'a', answer: '  Ich gehe zu Schule.'}, {id: 'b', answer: 'Er hat Hunger. Er hat Hunger.'}, {id: 'c', answer: 'Wir fahren nach Berlin.'}];

	it('places stored anchors in the original (untrimmed) answer and marks the read range as checked', () => {
		const stored = anchorDraftFindings(verified([raw('zu Schule', 'major')]), answers);
		const marks = scheduledAttemptMarks(record(stored.findings, stored.answers), attempt, cards);
		if (marks.status !== 'ready') throw new Error('expected marks');
		expect(marks.legacy).toBe(false);
		expect(marks.cards.a.findings[0]).toMatchObject({severity: 'major', quote: 'zu Schule', quoteStart: 11, quoteEnd: 20});
		expect(marks.cards.a.checked).toEqual({start: 2, end: 21});
		expect(marks.cards.b).toEqual({findings: [], checked: {start: 0, end: 29}});
	});

	it('drops a mark and the green range when stored offsets no longer match the text', () => {
		const stored = anchorDraftFindings(verified([raw('zu Schule')]), answers);
		const marks = scheduledAttemptMarks(record(stored.findings, stored.answers), attempt, [{id: 'a', answer: 'Ich ging in die Schule.'}]);
		expect(marks).toEqual({status: 'ready', legacy: false, cards: {a: {findings: [], checked: null}}, meta: {cefrLevel: undefined, usedRubric: undefined}});
	});

	it('shows nothing for a changed answer, a failed draft or another attempt', () => {
		expect(scheduledAttemptMarks(record([], [], 2), attempt, cards)).toEqual({status: 'stale'});
		expect(scheduledAttemptMarks({...record([], []), status: 'failed'}, attempt, cards)).toEqual({status: 'none'});
		expect(scheduledAttemptMarks(record([], []), {id: 'other', revision: 3}, cards)).toEqual({status: 'none'});
		expect(scheduledAttemptMarks(undefined, attempt, cards)).toEqual({status: 'none'});
	});

	it('falls back to a unique quote for old drafts, as minor and never green', () => {
		const old: ScheduledAiFinding[] = [
			{quote: 'zu Schule', note: 'Artikel', correction: 'zur Schule'},
			{quote: 'Er hat Hunger', note: 'doppelt'},
			{quote: 'fahren', note: 'ok'},
			{quote: 'nicht da', note: 'fehlt'},
		];
		const marks = scheduledAttemptMarks(record(old), attempt, [...cards, {id: 'd', answer: 'Sie fahren.'}]);
		if (marks.status !== 'ready') throw new Error('expected marks');
		expect(marks.legacy).toBe(true);
		expect(marks.cards.a).toEqual({findings: [expect.objectContaining({severity: 'minor', quote: 'zu Schule', quoteStart: 11, correction: 'zur Schule'})], checked: null});
		// Repeated inside one answer, or present in two answers: not placed.
		expect(marks.cards.b.findings).toEqual([]);
		expect(marks.cards.c.findings).toEqual([]);
		expect(marks.cards.d.findings).toEqual([]);
	});
});

describe('scheduled written answer marks', () => {
	const card: ResponseVerdictCard = {id: 'a', number: 1, prompt: 'Schreiben Sie.', answer: 'Ich gehe zu Schule.\nEr ist  müde.', verdict: 'manual'};
	const text = card.answer;
	const findings: EvalFinding[] = parseStructuredFindings([raw('zu Schule', 'major', 'Artikel fehlt'), raw('ist  müde', 'minor', 'Spasi ganda')], text, []);

	it('renders green, yellow and red passages with an accessible popover and legend', () => {
		const stored = anchorDraftFindings(findings, [{id: 'a', answer: text}]);
		const marks = scheduledAttemptMarks(record(stored.findings, stored.answers), attempt, [card]);
		const html = renderToStaticMarkup(createElement(ScheduledWrittenAnswer, {card, marks}));
		expect(html).toContain('class="aev-mark ok" title="tidak ditandai AI">Ich gehe ');
		expect(html).toMatch(/class="aev-mark major" tabindex="0" aria-describedby="[^"]+">zu Schule<span class="sr-only"> \(Kesalahan berarti\)/);
		expect(html).toContain('class="aev-mark minor"');
		expect(html).toContain('<span class="aev-chip major">Kesalahan berarti</span>');
		expect(html).toContain('<span class="aev-mark-pop-note">Artikel fehlt</span>');
		expect(html).toContain('Koreksi: <span lang="de">Korrektur</span>');
		expect(html).toContain('Penjelasan');
		expect(html).toContain('<span class="evx-ln" aria-hidden="true">2</span>');
		expect(html).toContain('tidak ditandai AI');
		expect(html).toContain('tidak terbaca');
		expect(html).not.toContain('tidak ada temuan');
		expect(html).toContain('saran kecil');
		expect(html).toContain('kesalahan berarti');
		expect(html).not.toContain('Buat ulang draf AI untuk warna lengkap');
	});

	it('renders plain text without a draft, and a hint for old or outdated drafts', () => {
		const plain = renderToStaticMarkup(createElement(ScheduledWrittenAnswer, {card}));
		expect(plain).not.toContain('aev-mark');
		expect(plain).toContain('Ich gehe zu Schule.');

		const legacy = renderToStaticMarkup(createElement(ScheduledWrittenAnswer, {card, marks: scheduledAttemptMarks(record([{quote: 'zu Schule', note: 'Artikel'}]), attempt, [card])}));
		expect(legacy).toContain('class="aev-mark minor"');
		expect(legacy).not.toContain('aev-mark ok');
		expect(legacy).toContain('Buat ulang draf AI untuk warna lengkap');
		expect(legacy).not.toContain('tidak ada temuan');

		const stale = renderToStaticMarkup(createElement(ScheduledWrittenAnswer, {card, marks: scheduledAttemptMarks(record([], [], 1), attempt, [card])}));
		expect(stale).not.toContain('aev-mark');
		expect(stale).toContain('Jawaban berubah setelah draf AI dibuat');
	});
});

describe('honest colours', () => {
	const mk = (answer: string, checked = true) => {
		const card: ResponseVerdictCard = {id: 'a', number: 1, prompt: 'P', answer, verdict: 'manual'};
		const marks: AttemptMarks = {status: 'ready', legacy: false, meta: {}, cards: {a: {findings: [], checked: checked ? {start: 0, end: answer.length} : null}}};
		return renderToStaticMarkup(createElement(ScheduledWrittenAnswer, {card, marks}));
	};

	it('paints green on a current draft with zero findings', () => {
		expect(mk('Ich gehe heute in die Schule.')).toContain('class="aev-mark ok"');
	});

	it('never paints [tidak terbaca] green: it is grey with an sr-only label', () => {
		const html = mk('Ich gehe [tidak terbaca] heute nach Hause.');
		expect(html).toContain('class="aev-mark unreadable" title="tidak terbaca">[tidak terbaca]');
		expect(html).toContain('<span class="sr-only"> (tidak terbaca)</span>');
		expect(html).not.toMatch(/aev-mark ok"[^>]*>[^<]*\[tidak terbaca\]/);
	});

	it('skips green on short header-like lines', () => {
		const html = mk('Übung 3\nName: Anna\nIch gehe heute in die Schule.');
		expect(html).not.toMatch(/ok"[^>]*>Übung/);
		expect(html.match(/class="aev-mark ok" title/g)?.length).toBe(1);
	});

	it('shows no green for a stale draft', () => {
		const card: ResponseVerdictCard = {id: 'a', number: 1, prompt: 'P', answer: 'Ich gehe heute in die Schule.', verdict: 'manual'};
		const html = renderToStaticMarkup(createElement(ScheduledWrittenAnswer, {card, marks: {status: 'stale'}}));
		expect(html).not.toContain('aev-mark ok');
		expect(html).toContain('Teks terbaru ✗');
	});
});
