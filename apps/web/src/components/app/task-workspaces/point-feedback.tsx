export type PointStatus = 'ok' | 'improve' | 'fix' | 'tip';

export type FeedbackPoint = {
	status: PointStatus;
	title: string;
	detail: string;
};

const TAG: Record<string, PointStatus> = {
	sesuai: 'ok',
	baik: 'ok',
	ok: 'ok',
	cukup: 'ok',
	perbaiki: 'improve',
	bisa: 'improve',
	saran: 'improve',
	perlu: 'fix',
	kurang: 'fix',
	penting: 'fix',
	tips: 'tip',
	tip: 'tip',
};

function statusFromText(text: string): PointStatus {
	if (/\b(sudah sesuai|sudah (cukup )?baik|sudah tepat|sudah lengkap|terpenuhi)\b/i.test(text)) return 'ok';
	if (/\b(perlu diperbaiki|belum (cukup |jelas|ada|sesuai)|kurang jelas|tidak cukup|salah)\b/i.test(text))
		return 'fix';
	if (/^(coba|tips|saran)\b/i.test(text)) return 'tip';
	if (/\b(perbaiki|tambahkan|sebaiknya|lebih jelas|disarankan|coba)\b/i.test(text)) return 'improve';
	return 'improve';
}

/** Restore sentence case only when the stored note was written in all caps. */
export function readableCase(text: string): string {
	const letters = text.replace(/[^\p{L}]/gu, '');
	if (letters.length < 24) return text;
	const upper = (letters.match(/\p{Lu}/gu) || []).length;
	if (upper / letters.length < 0.8) return text;
	const lower = text.toLocaleLowerCase('de-DE');
	return lower.replace(
		/(^|[.!?\n]\s*)(\p{L})/gu,
		(_m, pre: string, ch: string) => pre + ch.toLocaleUpperCase('de-DE'),
	);
}

const ADVICE_START =
	/\b(periksa|rapikan|perbaiki|perhatikan|pastikan|tambahkan|sesuaikan|gunakan|lengkapi|jelaskan|ubah|hindari|fokuskan|baca)\b/i;

/** One short sentence, like an Instruksi tugas line. Keeps the suggestion, drops quote dumps. */
export function shortenAdvice(text: string): string {
	let s = readableCase(text).replace(/\s+/g, ' ').trim();
	s = s.replace(
		/^\[(?:sesuai|baik|ok|cukup|perbaiki|bisa|saran|perlu|kurang|penting|tips|tip)\]\s*/i,
		'',
	);
	s = s
		.replace(
			/^(?:baris\s+[\d\s,.\-–—dan&serta]+[:.]\s*(?:["“«'][^"”»']{0,90}["”»']\s*[,.]?\s*)*)+/i,
			'',
		)
		.trim();
	if (!s || (/^baris\s+\d/i.test(s) && !ADVICE_START.test(s))) return '';
	const words = s.split(/\s+/).filter(Boolean);
	if (words.length > 26) {
		const acc: string[] = [];
		for (const word of words) {
			acc.push(word);
			if (acc.length >= 12 && /[.!?]$/.test(word)) break;
			if (acc.length >= 26) break;
		}
		s = acc.join(' ');
		if (!/[.!?…]$/.test(s)) s = `${s.replace(/[,:;]$/, '')}…`;
	}
	return s.charAt(0).toLocaleUpperCase('id-ID') + s.slice(1);
}

export function conciseFeedbackLine(point: FeedbackPoint): string {
	return shortenAdvice(`${point.title}${point.detail ? ` ${point.detail}` : ''}`);
}

function splitTitle(text: string): { title: string; detail: string } {
	const clean = text.trim();
	if (!clean) return { title: '', detail: '' };

	// Only split on an explicit, unambiguous delimiter: a pipe, or a literal
	// labelled prefix such as "Saran:", "Perbaikan:", or "Ditemukan:". A bare
	// spaced dash is not a delimiter: it cuts ordinary sentences in half.
	const pipe = clean.split(/\s*\|\s*/);
	if (pipe.length > 1) {
		return { title: pipe[0].trim(), detail: pipe.slice(1).join(' | ').trim() };
	}

	const labelMatch = clean.match(/^(.+?)\s*(?:Saran|Perbaikan|Ditemukan)\s*:\s*(.+)$/is);
	if (labelMatch) {
		const title = labelMatch[1].trim();
		const detail = labelMatch[2].trim();
		if (title && detail) return { title, detail };
	}

	// A sentence boundary is a period, exclamation, or question mark followed
	// by a capital letter (or end of string), so abbreviations and decimals are
	// not treated as the end of a sentence.
	const sentence = clean.match(/^(.+?[.!?])\s+(?=[A-Z])(.+)$/s);
	if (sentence) {
		return { title: sentence[1].trim(), detail: sentence[2].trim() };
	}

	// No clean split found: keep the whole text as the title. Never truncate.
	return { title: clean, detail: '' };
}

const INLINE_TAG = /(?=\[(?:sesuai|baik|ok|cukup|perbaiki|bisa|saran|perlu|kurang|penting|tips|tip)\])/i;

/** Turn stored formative feedback into short points. Does not rewrite meaning. */
export function parseFeedbackPoints(text: string): FeedbackPoint[] {
	const clean = readableCase(text).replace(/\r/g, '').trim();
	if (!clean) return [];
	// Tags may be inline — older checks collapsed newlines into one paragraph.
	const segments = clean
		.split(INLINE_TAG)
		.map((part) => part.trim())
		.filter(Boolean);
	const points: FeedbackPoint[] = [];
	for (const segment of segments) {
		const match = segment.match(/^\[([a-zA-Z]+)\]\s*/);
		if (match) {
			const status = TAG[match[1].toLowerCase()];
			const body = segment.slice(match[0].length).trim();
			if (!status || body.length < 8) continue;
			points.push({ status, ...splitTitle(body) });
			continue;
		}
		const start = segment.search(ADVICE_START);
		if (start < 0) continue;
		const body = segment.slice(start).trim();
		if (body.length < 12) continue;
		points.push({ status: statusFromText(body), ...splitTitle(body) });
	}
	if (points.length >= 1) {
		const ranked = [
			...points.filter((point) => point.status === 'fix'),
			...points.filter((point) => point.status === 'improve'),
			...points.filter((point) => point.status === 'tip'),
			...points.filter((point) => point.status === 'ok'),
		];
		return ranked.slice(0, 8);
	}

	const lines = clean
		.split(/\n+|(?:^|\s)(?=\d{1,2}[.)]\s)|(?=\s[-•*]\s)/)
		.map((line) => line.replace(/^\s*(?:\d{1,2}[.)]|[-•*])\s*/, '').trim())
		.filter((line) => line.length > 8);

	const chunks = (lines.length >= 2 ? lines : clean.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ö“"«])/))
		.map((line) => line.trim())
		.filter((line) => line.length > 12);
	return chunks.slice(0, 8).map((line) => {
		const split = splitTitle(line);
		return { status: statusFromText(line), ...split };
	});
}

/**
 * Plain formative guidance. The stored text is shown as written — no cards,
 * counts, or rewritten sentences. Parsing helpers stay available for
 * annotation anchors; they do not restyle this output.
 */
export function PointFeedback({ text }: { text: string }) {
	const clean = text.replace(/\r/g, '').trim();
	if (!clean) return null;
	return <p className="pfb-plain">{clean}</p>;
}
