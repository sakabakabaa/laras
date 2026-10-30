import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parseFeedbackPoints, shortenAdvice } from '@/components/app/task-workspaces/point-feedback';

type MarkColor = 'yellow' | 'red';

type TextMark = {
	start: number;
	end: number;
	color: MarkColor;
	note: string;
};

type Segment = { text: string; color?: MarkColor; note?: string };

const LINE_RE = /baris\s+(?:ke-)?(\d+)(?:\s*[-–—]\s*(\d+))?/gi;

function extractLineRefs(text: string): number[] {
	if (!text) return [];
	const out = new Set<number>();
	const re = /baris\s+(?:ke-)?([0-9\s,.\-–—dan&serta]+)/gi;
	let match: RegExpExecArray | null;
	while ((match = re.exec(text))) {
		const seg = match[1];
		const rangeRe = /(\d+)\s*[-–—]\s*(\d+)/g;
		let range: RegExpExecArray | null;
		while ((range = rangeRe.exec(seg))) {
			const lo = Math.min(parseInt(range[1], 10), parseInt(range[2], 10));
			const hi = Math.max(parseInt(range[1], 10), parseInt(range[2], 10));
			for (let n = lo; n <= hi && n <= 500; n++) out.add(n);
		}
		const numRe = /\d+/g;
		let num: RegExpExecArray | null;
		while ((num = numRe.exec(seg))) {
			const n = parseInt(num[0], 10);
			if (n >= 1 && n <= 500) out.add(n);
		}
	}
	return [...out].sort((a, b) => a - b);
}

function quotedPhrases(text: string): string[] {
	return [...text.matchAll(/["“«']([^"”»']{4,90})["”»']/g)].map((m) => m[1].replace(/\s+/g, ' ').trim());
}

function evidenceQuotes(evidence: string): { lo: number; hi: number; quote: string }[] {
	const rows: { lo: number; hi: number; quote: string }[] = [];
	for (const raw of evidence.split(/\n+/)) {
		const line = raw.replace(/\s+/g, ' ').trim();
		if (!line) continue;
		LINE_RE.lastIndex = 0;
		const hit = LINE_RE.exec(line);
		if (!hit) continue;
		const a = parseInt(hit[1], 10);
		const b = hit[2] ? parseInt(hit[2], 10) : a;
		const quote = line
			.slice(hit.index + hit[0].length)
			.replace(/^[\s:–—-]+/, '')
			.replace(/^["“«']|["”»']$/g, '')
			.trim();
		if (quote.length < 4) continue;
		rows.push({ lo: Math.min(a, b), hi: Math.max(a, b), quote });
	}
	return rows;
}

function findPhrase(content: string, phrase: string): { start: number; end: number } | null {
	const needle = phrase.replace(/\s+/g, ' ').trim();
	if (needle.length < 4) return null;
	const direct = content.toLocaleLowerCase('de-DE').indexOf(needle.toLocaleLowerCase('de-DE'));
	if (direct >= 0) return { start: direct, end: direct + needle.length };
	const flat = content.replace(/\s+/g, ' ');
	const at = flat.toLocaleLowerCase('de-DE').indexOf(needle.toLocaleLowerCase('de-DE'));
	if (at < 0) return null;
	// Map the flattened index back onto the original string.
	let flatIndex = 0;
	let start = -1;
	let end = -1;
	for (let i = 0; i < content.length; i++) {
		if (/\s/.test(content[i]) && i > 0 && /\s/.test(content[i - 1])) continue;
		if (flatIndex === at) start = i;
		flatIndex += 1;
		if (start >= 0 && flatIndex === at + needle.length) {
			end = i + 1;
			break;
		}
	}
	if (start < 0 || end <= start) return null;
	return { start, end };
}

/**
 * Place yellow/red marks on the submitted text from the latest formative
 * check. Quotes in the feedback and evidence are matched against the answer
 * so highlights stay on the words the check named, independent of column width.
 */
export function marksFromCheck(content: string, feedback: string, evidence: string): TextMark[] {
	if (!content.trim() || (!feedback.trim() && !evidence.trim())) return [];
	const points = parseFeedbackPoints([feedback, evidence].filter(Boolean).join('\n'));
	const advice = points.filter((point) => point.status === 'fix' || point.status === 'improve');
	const cited = evidenceQuotes(evidence);
	const marks: TextMark[] = [];
	const taken: { start: number; end: number }[] = [];
	const overlaps = (start: number, end: number) =>
		taken.some((span) => start < span.end && end > span.start);

	const add = (phrase: string, color: MarkColor, note: string) => {
		const found = findPhrase(content, phrase);
		if (!found || overlaps(found.start, found.end)) return;
		taken.push(found);
		marks.push({ ...found, color, note: note || phrase });
	};

	for (const point of advice) {
		const blob = `${point.title} ${point.detail}`.trim();
		const note = shortenAdvice(blob) || blob;
		const color: MarkColor = point.status === 'fix' ? 'red' : 'yellow';
		const refs = extractLineRefs(blob);
		const phrases = [
			...quotedPhrases(blob),
			...cited
				.filter((row) => refs.length === 0 || refs.some((n) => n >= row.lo && n <= row.hi))
				.map((row) => row.quote),
		];
		for (const phrase of phrases) add(phrase, color, note);
	}
	for (const row of cited) {
		add(row.quote, 'yellow', `Periksa bentuk pada “${row.quote.slice(0, 42)}”.`);
	}
	return marks.sort((a, b) => a.start - b.start || b.end - a.end);
}

function segmentsFor(text: string, marks: TextMark[], from: number, to: number): Segment[] {
	const local = marks
		.map((mark) => ({
			start: Math.max(mark.start, from) - from,
			end: Math.min(mark.end, to) - from,
			color: mark.color,
			note: mark.note,
		}))
		.filter((mark) => mark.end > mark.start)
		.sort((a, b) => a.start - b.start);
	const parts: Segment[] = [];
	let cursor = 0;
	for (const mark of local) {
		if (mark.start > cursor) parts.push({ text: text.slice(cursor, mark.start) });
		parts.push({ text: text.slice(mark.start, mark.end), color: mark.color, note: mark.note });
		cursor = mark.end;
	}
	if (cursor < text.length) parts.push({ text: text.slice(cursor) });
	if (parts.length === 0) parts.push({ text });
	return parts;
}

/**
 * Lecturer view of a formative answer: the full text, every wrapped visual
 * line numbered, and rounded borderless yellow/red marks from the latest
 * Cek jawaban. The gutter stays the same with or without marks.
 */
export function FormativeAnswerScript({
	content,
	feedback,
	evidence,
}: {
	content: string;
	feedback: string;
	evidence: string;
}) {
	const textRef = useRef<HTMLDivElement>(null);
	const lines = content.split('\n');
	const [rowCounts, setRowCounts] = useState<number[]>(() => lines.map(() => 1));
	const [openNote, setOpenNote] = useState<string | null>(null);
	const marks = useMemo(() => marksFromCheck(content, feedback, evidence), [content, feedback, evidence]);

	useLayoutEffect(() => {
		const el = textRef.current;
		if (!el) return;
		const rows = Array.from(el.querySelectorAll<HTMLElement>(':scope > .evx-line'));
		if (rows.length === 0) return;
		const textLh = parseFloat(getComputedStyle(rows[0]).lineHeight) || 20.15;
		const measure = () => {
			const counts = rows.map((row) => {
				const textEl = row.querySelector<HTMLElement>(':scope > .evx-line-text');
				if (!textEl) return 1;
				return Math.max(1, Math.round(textEl.getBoundingClientRect().height / textLh));
			});
			setRowCounts((prev) =>
				prev.length === counts.length && prev.every((n, i) => n === counts[i]) ? prev : counts,
			);
		};
		measure();
		if (typeof ResizeObserver === 'undefined') return;
		const obs = new ResizeObserver(measure);
		rows.forEach((row) => obs.observe(row));
		let cancelled = false;
		if (typeof document !== 'undefined' && document.fonts && 'ready' in document.fonts) {
			document.fonts.ready.then(() => {
				if (!cancelled) measure();
			});
		}
		return () => {
			cancelled = true;
			obs.disconnect();
		};
	}, [content, marks]);

	let offset = 0;
	let lineNum = 0;
	const words = content.trim() ? content.trim().split(/\s+/).length : 0;
	const yellow = marks.filter((mark) => mark.color === 'yellow').length;
	const red = marks.filter((mark) => mark.color === 'red').length;

	return (
		<div className="fas-script">
			<div className="evx-script fas-lines" ref={textRef}>
				{lines.map((line, index) => {
					const start = offset;
					offset += line.length + 1;
					const parts = segmentsFor(line, marks, start, start + line.length);
					const count = rowCounts[index] || 1;
					const nums = Array.from({ length: count }, (_, k) => lineNum + 1 + k);
					lineNum += count;
					return (
						<div className="evx-line" key={index}>
							<span className="evx-ln" aria-hidden="true">
								{nums.map((n, k) => (
									<span key={k} className="evx-ln-num">
										{n}
									</span>
								))}
							</span>
							<span className="evx-line-text">
								{parts.map((part, partIndex) =>
									part.color ? (
										<mark
											key={partIndex}
											className={`fas-mark ${part.color}${openNote === part.note ? ' open' : ''}`}
											tabIndex={0}
											onClick={() => setOpenNote(openNote === part.note ? null : part.note || null)}
											onKeyDown={(event) => {
												if (event.key === 'Enter' || event.key === ' ') {
													event.preventDefault();
													setOpenNote(openNote === part.note ? null : part.note || null);
												}
											}}
										>
											{part.text}
											{part.note && (
												<span className="fas-pop" role="tooltip">
													{part.note}
												</span>
											)}
										</mark>
									) : (
										<span key={partIndex}>{part.text}</span>
									),
								)}
								{line.length === 0 ? '\u00a0' : null}
							</span>
						</div>
					);
				})}
			</div>
			<footer className="evx-script-foot">
				<span>{words} kata</span>
				<span className="evx-ann">
					{marks.length} anotasi
					<i className="minor">{yellow}</i>
					<i className="major">{red}</i>
				</span>
			</footer>
			{openNote && <p className={`fas-note ${marks.find((mark) => mark.note === openNote)?.color || 'yellow'}`}>{openNote}</p>}
			<p className="fas-legend">
				<mark className="fas-mark yellow">kuning</mark> saran perbaikan
				<mark className="fas-mark red">merah</mark> perlu diperbaiki, termasuk tata bahasa dan tanda baca
			</p>
		</div>
	);
}
