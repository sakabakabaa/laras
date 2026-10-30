import { Check, LoaderCircle, Sparkles, X } from 'lucide-react';
import type { SuggestedCriteria, SuggestedCriterion } from '@/lib/rubric-suggestions';

/**
 * Provisional rubric-criterion suggestions for a writing/speaking task whose
 * criteria array is empty. Suggestions are clearly labelled "Saran" and are
 * NOT the assignment's real criteria — they live in the separate
 * `suggestedCriteria` field and never affect grading until the lecturer
 * explicitly accepts one (which moves it into `taskConfig.criteria` as a
 * normal editable criterion). Dismissals are durable.
 *
 * The parent form owns the state and persistence; this component is purely
 * presentational with per-item accept/dismiss callbacks.
 */
export function RubricSuggestionsPanel({
	suggestions,
	busy,
	error,
	onGenerate,
	onAccept,
	onDismiss,
}: {
	suggestions: SuggestedCriteria | null;
	busy: boolean;
	error: string;
	onGenerate: () => void;
	onAccept: (id: string) => void;
	onDismiss: (id: string) => void;
}) {
	const pending = suggestions?.pending ?? [];
	const hasPending = pending.length > 0;
	const reason = suggestions?.reason ?? '';

	// Nothing to show when there are no pending suggestions, no reason, and no
	// generate affordance yet (the parent only renders this panel when the task
	// is eligible — writing/speaking, empty criteria, non-empty prompt).
	if (!hasPending && !reason && !busy && !error) {
		return (
			<div className="tkb-suggest">
				<button type="button" className="ld-text-btn" onClick={onGenerate}>
					<Sparkles size={13} /> Sarankan kriteria rubrik
				</button>
				<span className="tkb-suggest-hint">
					Saran diturunkan dari prompt tugas ini — bersifat sementara, tidak memengaruhi
					penilaian sampai Anda menerima.
				</span>
			</div>
		);
	}

	return (
		<div className="tkb-suggest">
			{busy && (
				<p className="tkb-suggest-status">
					<LoaderCircle size={13} className="spin" /> Menyusun saran kriteria...
				</p>
			)}
			{!busy && error && (
				<p className="tkb-suggest-error" role="alert">
					{error}{' '}
					<button type="button" className="ld-text-btn" onClick={onGenerate}>
						Coba lagi
					</button>
				</p>
			)}
			{!busy && !error && hasPending && (
				<>
					<div className="tkb-suggest-head">
						<Sparkles size={13} />
						<span>Saran kriteria rubrik</span>
						<em>Saran · tidak memengaruhi penilaian sampai diterima</em>
					</div>
					<ul className="tkb-suggest-list">
						{pending.map((s) => (
							<SuggestionRow key={s.id} suggestion={s} onAccept={onAccept} onDismiss={onDismiss} />
						))}
					</ul>
				</>
			)}
			{!busy && !error && !hasPending && reason && (
				<p className="tkb-suggest-reason">{reason}</p>
			)}
		</div>
	);
}

function SuggestionRow({
	suggestion,
	onAccept,
	onDismiss,
}: {
	suggestion: SuggestedCriterion;
	onAccept: (id: string) => void;
	onDismiss: (id: string) => void;
}) {
	return (
		<li className="tkb-suggest-row">
			<div className="tkb-suggest-label">
				<strong>{suggestion.label}</strong>
				{suggestion.rationale && <small>{suggestion.rationale}</small>}
				<span className="tkb-suggest-weight">Bobot saran: {suggestion.weight}</span>
			</div>
			<div className="tkb-suggest-actions">
				<button type="button" className="ld-text-btn" onClick={() => onAccept(suggestion.id)}>
					<Check size={13} /> Terima
				</button>
				<button
					type="button"
					className="ld-text-btn muted"
					aria-label={`Tutup saran ${suggestion.label}`}
					onClick={() => onDismiss(suggestion.id)}
				>
					<X size={13} /> Tutup
				</button>
			</div>
		</li>
	);
}
