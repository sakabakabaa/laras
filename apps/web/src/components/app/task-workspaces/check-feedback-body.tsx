/**
 * Presentation-only split of formative Cek jawaban text.
 * Does not rewrite, translate, score, or add guidance — it only
 * breaks the stored feedback into scannable blocks.
 */

type Block =
	| { kind: 'para'; text: string }
	| { kind: 'list'; intro?: string; items: string[]; close?: string };

const NUMBERED = /(?:^|\s)(\d{1,2})[.)]\s+/g;

function splitNumbered(text: string): Block {
	const marks: { index: number; end: number }[] = [];
	NUMBERED.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = NUMBERED.exec(text))) {
		const digitStart = match.index + match[0].indexOf(match[1]);
		marks.push({ index: digitStart, end: match.index + match[0].length });
	}
	if (marks.length < 2) return { kind: 'para', text };

	const intro = text.slice(0, marks[0].index).trim();
	const items = marks.map((mark, i) => {
		const next = marks[i + 1]?.index ?? text.length;
		return text.slice(mark.end, next).trim();
	});
	// A trailing sentence after the last question stays with that item unless
	// it clearly continues the whole list ("Jika ada bagian…").
	const last = items[items.length - 1] || '';
	const closeMatch = last.match(
		/\s((?:Jika|Coba|Setelah|Kemudian|Lalu|Selanjutnya)\b[\s\S]{40,})$/,
	);
	let close = '';
	if (closeMatch && closeMatch.index !== undefined) {
		close = closeMatch[1].trim();
		items[items.length - 1] = last.slice(0, closeMatch.index).trim();
	}
	return { kind: 'list', intro: intro || undefined, items: items.filter(Boolean), close: close || undefined };
}

/** Quoted German/Indonesian phrases the model already wrote — emphasize, don't alter. */
function emphasize(text: string) {
	const parts = text.split(/(“[^”]+”|"[^"]+"|«[^»]+»)/g);
	return parts.map((part, i) =>
		/^[“"«]/.test(part) ? (
			<mark key={i} className="ckf-quote">
				{part}
			</mark>
		) : (
			<span key={i}>{part}</span>
		),
	);
}

function paragraphs(text: string) {
	const chunks = text
		.split(/\n{2,}|(?<=[.?!])\s+(?=[A-ZÀ-Ö“"«])/)
		.map((c) => c.trim())
		.filter(Boolean);
	if (chunks.length <= 1) return [text];
	// Don't shatter a short paragraph into one-sentence crumbs.
	if (text.length < 280) return [text];
	return chunks;
}

export function CheckFeedbackBody({ text }: { text: string }) {
	const block = splitNumbered(text.trim());
	if (block.kind === 'para') {
		return (
			<div className="ckf-body">
				{paragraphs(block.text).map((p, i) => (
					<p key={i} className="ckf-para">
						{emphasize(p)}
					</p>
				))}
			</div>
		);
	}
	return (
		<div className="ckf-body">
			{block.intro &&
				paragraphs(block.intro).map((p, i) => (
					<p key={i} className="ckf-para">
						{emphasize(p)}
					</p>
				))}
			<ol className="ckf-prompts">
				{block.items.map((item, i) => (
					<li key={i}>
						<span className="ckf-prompt-text">{emphasize(item)}</span>
					</li>
				))}
			</ol>
			{block.close && <p className="ckf-para ckf-close">{emphasize(block.close)}</p>}
		</div>
	);
}

/** Compact evidence line; expands when the rujukan is long. */
export function CheckEvidence({ evidence }: { evidence: string }) {
	const text = evidence.trim();
	if (!text) return null;
	const label = text.replace(/^Rujukan pada jawaban:\s*/i, '');
	if (label.length < 140) {
		return (
			<p className="ckf-evidence">
				<span>Rujukan pada jawaban</span>
				{emphasize(label)}
			</p>
		);
	}
	return (
		<details className="ckf-evidence-fold">
			<summary>Rujukan pada jawaban</summary>
			<p>{emphasize(label)}</p>
		</details>
	);
}
