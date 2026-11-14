/**
 * Read-only inline AI marks on a student's text, the same colouring Tugas
 * uses: green = checked with no finding, yellow = minor, red = major. Hover
 * or keyboard focus on a yellow/red passage shows the finding. The text is
 * never altered; findings are laid over it via `buildMarkedSegments`.
 */
import {useId} from 'react';
import {buildMarkedSegments, SEVERITY_LABEL, sliceSegments, type EvalFinding, type MarkedSegment} from '@/lib/ai-evaluation';

const OK_LABEL = 'Tidak ada temuan pada bagian ini';

type Part = MarkedSegment & {ok?: boolean};

/** Splits unmarked segments at the checked range so only checked text turns green. */
function withChecked(segments: MarkedSegment[], checked: {start: number; end: number} | null): Part[] {
	if (!checked) return segments;
	const out: Part[] = [];
	let pos = 0;
	for (const segment of segments) {
		const start = pos;
		const end = pos + segment.text.length;
		pos = end;
		if (segment.severity) {
			out.push(segment);
			continue;
		}
		const cuts = [start, Math.min(Math.max(checked.start, start), end), Math.min(Math.max(checked.end, start), end), end];
		for (let i = 0; i < 3; i += 1) {
			if (cuts[i + 1] <= cuts[i]) continue;
			out.push({text: segment.text.slice(cuts[i] - start, cuts[i + 1] - start), ok: i === 1});
		}
	}
	return out;
}

/** Lines of the text with their start offsets (handles \n and \r\n). */
function linesOf(text: string): {start: number; text: string}[] {
	const lines: {start: number; text: string}[] = [];
	const breaks = /\r?\n/g;
	let start = 0;
	for (let match = breaks.exec(text); match; match = breaks.exec(text)) {
		lines.push({start, text: text.slice(start, match.index)});
		start = match.index + match[0].length;
	}
	lines.push({start, text: text.slice(start)});
	return lines;
}

function FindingMark({finding, text}: {finding: EvalFinding; text: string}) {
	const id = useId();
	return (
		<mark className={`aev-mark ${finding.severity}`} tabIndex={0} aria-describedby={id}>
			{text}
			<span className="sr-only"> ({SEVERITY_LABEL[finding.severity]})</span>
			<span className="aev-mark-pop sr-mark-pop" role="tooltip" id={id} lang="id">
				<span className="aev-mark-pop-head">
					<span className={`aev-chip ${finding.severity}`}>{SEVERITY_LABEL[finding.severity]}</span>
				</span>
				{finding.note && <span className="aev-mark-pop-note">{finding.note}</span>}
				{finding.correction && (
					<span className="aev-mark-pop-note">
						Koreksi: <span lang="de">{finding.correction}</span>
					</span>
				)}
				{finding.explanation && finding.explanation !== finding.note && <span className="aev-mark-pop-note">{finding.explanation}</span>}
			</span>
		</mark>
	);
}

/**
 * The student's text with line numbers. Without findings or a checked range
 * it renders plain text, exactly like an unmarked answer.
 */
export function MarkedText({
	text,
	findings = [],
	checked = null,
	label,
	lang,
	className = '',
}: {
	text: string;
	findings?: EvalFinding[];
	/** Text range the AI read in full; unmarked text inside it is shown green. */
	checked?: {start: number; end: number} | null;
	label?: string;
	lang?: string;
	className?: string;
}) {
	const segments = findings.length || checked ? withChecked(buildMarkedSegments(text, findings), checked) : null;
	return (
		<div className={`evx-script${className ? ` ${className}` : ''}`} aria-label={label} lang={lang}>
			{linesOf(text).map((line, index) => {
				const parts: Part[] = segments ? sliceSegments(segments, line.start, line.start + line.text.length) : [{text: line.text}];
				return (
					<div className="evx-line" key={index}>
						<span className="evx-ln" aria-hidden="true">{index + 1}</span>
						<span className="evx-line-text">
							{line.text
								? parts.map((part, partIndex) => {
										if (part.severity && part.findingIndex != null && findings[part.findingIndex]) {
											return <FindingMark key={partIndex} finding={findings[part.findingIndex]} text={part.text} />;
										}
										if (part.ok && part.text.trim()) {
											return (
												<mark key={partIndex} className="aev-mark ok" title={OK_LABEL}>
													{part.text}
													<span className="sr-only">{OK_LABEL}</span>
												</mark>
											);
										}
										return <span key={partIndex}>{part.text}</span>;
									})
								: ' '}
						</span>
					</div>
				);
			})}
		</div>
	);
}

/** Colour key, same wording as the Tugas review. */
export function MarkLegend({ok = true}: {ok?: boolean}) {
	return (
		<p className="fas-legend sr-mark-legend">
			{ok && (
				<>
					<mark className="aev-mark ok">hijau</mark> tidak ada temuan
				</>
			)}
			<mark className="aev-mark minor">kuning</mark> saran kecil
			<mark className="aev-mark major">merah</mark> kesalahan berarti
		</p>
	);
}
