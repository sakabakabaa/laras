/**
 * GradingPanel — presentational lecturer grading panel: rubric scoring,
 * student feedback, AI draft status/actions, final score, and the
 * save/publish area. It owns no data and makes no requests; the caller maps
 * its own data source onto these props (Tugas formal via
 * `AiEvaluationPanel`; scheduled-class written answers later).
 *
 * Props interface
 * ───────────────
 * Header / status
 *   title, statusLabel, live?            Panel heading and draft/published chip.
 *   status?                              { eyebrow, headline, description, saveState, unsaved? }
 *   steps?                               Progress steps ({ label, detail? }[]).
 *
 * Rubric
 *   criteria: GradingCriterion[]         { id, label, shortLabel?, weight, weightPercent, evidence? }
 *   scores: Record<id, number>           Current per-criterion scores (0–100); missing = not scored.
 *   onScoreChange(id, value: string)     '' clears a score.
 *   rubricTotal: number | null           Weighted total, null while not every weighted criterion is scored.
 *   rubricTip?, rubricHelp?              Tooltip / help copy under the rubric heading.
 *   rubricEmpty?: ReactNode              Rendered when there are no criteria (e.g. "Sarankan rubrik").
 *   rubricExtra?: ReactNode              Rendered under the rubric list (e.g. pending rubric suggestions).
 *   rubricGeneral?                       { major, minor } evidence not mapped to a criterion.
 *
 * Feedback
 *   feedback, onFeedbackChange           Student-facing feedback text (max feedbackMax, default 2000).
 *   feedbackFocusSignal?: number         Increment to open + focus the feedback field.
 *
 * AI draft
 *   aiDraft: GradingAiDraft | null       { status, score, criterionScores?, summary?, message? }
 *   onRequestAi?, aiBusy?                Request / re-run the AI draft ("Minta draf AI", retry).
 *   onApplyAi?                           "Gunakan saran AI" (the caller decides append vs replace;
 *                                        see `mergeAiFeedback`).
 *
 * Final score + actions
 *   finalScore?                          { value, onChange, placeholder, invalid?, badge?, badgeTone?,
 *                                          delta?, onClear?, inputId?, label?, ariaLabel?,
 *                                          unit? (default "/ 100"), readOnly? }
 *                                        Omitted for feedback-only grading (no score block).
 *   primaryAction, secondaryAction?      GradingAction { label, onClick, disabled?, busy?, icon? }
 *   disabledReasons?: string[]           Shown under the actions while the primary action is disabled.
 *   confirm?: ReactNode                  Replaces the action row (e.g. publish confirmation).
 *   publishHelp?: string                 Copy above the final-score block.
 *   children?                            Alerts between feedback and "Lainnya".
 *   more?: ReactNode                     Content of the collapsed "Lainnya" disclosure.
 *   footer?: ReactNode                   After the actions (discard, messages).
 *   defaultExpanded?: boolean            Rubric rows + feedback open initially (default: desktop viewport).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
	AlertTriangle,
	ChevronDown,
	Info,
	ListChecks,
	LoaderCircle,
	PenLine,
	RotateCcw,
	Sparkles,
} from 'lucide-react';
import { letterGrade } from '@/lib/assignments';

export type GradingCriterion = {
	id: string;
	label: string;
	/** Compact label for the score row (defaults to `label`). */
	shortLabel?: string;
	weight: number;
	/** Share of the total weight (0–100) shown next to the score. */
	weightPercent: number;
	/** Evidence/explanation line shown when the row is expanded. */
	evidence?: string;
};

export type GradingAiStatus = 'none' | 'requesting' | 'pending' | 'stalled' | 'ready' | 'empty' | 'failed';

export type GradingAiDraft = {
	status: GradingAiStatus;
	/** The AI's proposed overall score (null when none). */
	score: number | null;
	/** The AI's proposed per-criterion scores, keyed by criterion id. */
	criterionScores?: Record<string, number>;
	/** Proposed student feedback ("Gunakan saran AI"). */
	summary?: string;
	/** Lecturer-facing explanation of the current status. */
	message?: string;
};

export type GradingAction = {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	busy?: boolean;
	icon?: ReactNode;
};

export type GradingFinalScore = {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	invalid?: boolean;
	badge?: string;
	badgeTone?: 'ai' | 'lecturer';
	delta?: ReactNode;
	onClear?: () => void;
	inputId?: string;
	label?: string;
	ariaLabel?: string;
	/** Unit shown after the input (default "/ 100"). */
	unit?: string;
	/** Computed elsewhere (e.g. rubric points total); shown but not editable. */
	readOnly?: boolean;
};

export type GradingPanelProps = {
	ariaLabel?: string;
	title: string;
	statusLabel: string;
	live?: boolean;
	status?: { eyebrow: string; headline: string; description: string; saveState: string; unsaved?: boolean };
	steps?: { label: string; detail?: string }[];
	criteria: GradingCriterion[];
	scores: Record<string, number>;
	onScoreChange: (criterionId: string, value: string) => void;
	rubricTotal: number | null;
	scoreCaption?: string;
	rubricHeading?: string;
	rubricTip?: string;
	rubricHelp?: ReactNode;
	rubricEmpty?: ReactNode;
	rubricExtra?: ReactNode;
	rubricGeneral?: { major: number; minor: number } | null;
	feedback: string;
	onFeedbackChange: (value: string) => void;
	feedbackLabel?: string;
	feedbackPlaceholder?: string;
	feedbackMax?: number;
	feedbackFocusSignal?: number;
	aiDraft: GradingAiDraft | null;
	onRequestAi?: () => void;
	aiBusy?: boolean;
	onApplyAi?: () => void;
	applyAiLabel?: string;
	finalScore?: GradingFinalScore;
	publishHelp?: string;
	primaryAction: GradingAction;
	secondaryAction?: GradingAction;
	disabledReasons?: string[];
	confirm?: ReactNode;
	children?: ReactNode;
	more?: ReactNode;
	footer?: ReactNode;
	defaultExpanded?: boolean;
};

export const ACHIEVEMENT_LEVELS = [
	{ value: 100, label: 'Sangat baik' },
	{ value: 85, label: 'Baik' },
	{ value: 70, label: 'Cukup' },
	{ value: 50, label: 'Perlu pengembangan' },
	{ value: 25, label: 'Bukti terbatas' },
	{ value: 0, label: 'Belum menunjukkan pencapaian' },
] as const;

/**
 * "Gunakan saran AI" never discards the lecturer's own words: an empty field
 * takes the AI text, otherwise the AI text is appended (once) below it.
 */
export function mergeAiFeedback(current: string, ai: string, max = 2000): string {
	const suggestion = ai.trim();
	if (!suggestion) return current;
	const own = current.trim();
	if (!own) return suggestion.slice(0, max);
	if (own.includes(suggestion)) return current;
	return `${current.trimEnd()}\n\n${suggestion}`.slice(0, max);
}

/** True on a desktop-width viewport (and during server render / tests). */
export function isDesktopViewport(): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
	return window.matchMedia('(min-width: 1024px)').matches;
}

export function GradingPanel(props: GradingPanelProps) {
	const {
		criteria,
		scores,
		aiDraft,
		finalScore,
		primaryAction,
		secondaryAction,
		feedbackMax = 2000,
	} = props;
	const [expanded] = useState(() => props.defaultExpanded ?? isDesktopViewport());
	// Rows differ from the default once toggled, so every criterion can be open at once.
	const [toggled, setToggled] = useState<Set<string>>(() => new Set());
	const [feedbackOpen, setFeedbackOpen] = useState(expanded);
	const noteRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		if (!props.feedbackFocusSignal) return;
		setFeedbackOpen(true);
		window.setTimeout(() => noteRef.current?.focus(), 0);
	}, [props.feedbackFocusSignal]);

	const weighted = criteria.filter((c) => c.weight > 0);
	const scoredWeighted = weighted.filter((c) => scores[c.id] != null);
	const rowOpen = (id: string) => expanded !== toggled.has(id);
	const toggleRow = (id: string) =>
		setToggled((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	return (
		<section className="evx-panel evx-compact assessment-clarity" aria-label={props.ariaLabel ?? 'Penilaian'}>
			<header className="evx-panel-head">
				<h3>
					<ListChecks size={14} /> {props.title}
				</h3>
				<span className={`evx-draft${props.live ? ' live' : ''}`}>{props.statusLabel}</span>
			</header>

			{props.status && (
				<div className="assessment-status" aria-live="polite">
					<span className="assessment-eyebrow">{props.status.eyebrow}</span>
					<strong>{props.status.headline}</strong>
					<p>{props.status.description}</p>
					<span className={`assessment-save-state ${props.status.unsaved ? 'unsaved' : ''}`}>{props.status.saveState}</span>
				</div>
			)}
			{props.steps && props.steps.length > 0 && (
				<div className="assessment-progress" aria-label="Progres penilaian">
					{props.steps.map((step, index) => (
						<span key={step.label}>
							<b>{index + 1}</b> {step.label}
							{step.detail ? <em>{step.detail}</em> : null}
						</span>
					))}
				</div>
			)}
			<div className="evx-ai-card score-only">
				<div className="evx-ai-score">
					<strong>
						{props.rubricTotal == null ? (
							'Belum dinilai'
						) : (
							<>
								{props.rubricTotal}
								<small>
									{' '}
									/ 100{letterGrade(props.rubricTotal) ? ` · ${letterGrade(props.rubricTotal)}` : ''}
								</small>
							</>
						)}
					</strong>
					<span>{props.scoreCaption ?? 'Skor rubrik pada draf ini'}</span>
				</div>
				{props.onRequestAi && (
					<button
						type="button"
						className="evx-refresh"
						aria-label="Buat ulang draf AI"
						title="Buat ulang analisis AI menggunakan kriteria dan materi terbaru"
						onClick={props.onRequestAi}
						disabled={props.aiBusy}
					>
						{props.aiBusy ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}
						<span>Buat ulang AI</span>
					</button>
				)}
			</div>
			<AiDraftStatus draft={aiDraft} onRequestAi={props.onRequestAi} busy={props.aiBusy} />

			<section className="evx-block">
				<header>
					<h4>
						<ListChecks size={14} /> {props.rubricHeading ?? 'Rubrik penilaian'}
						{props.rubricTip && (
							<span className="evx-rubric-info" tabIndex={0} aria-label="Cara skor dihitung">
								<Info size={13} />
								<span className="evx-rubric-tip" role="tooltip">
									{props.rubricTip}
								</span>
							</span>
						)}
					</h4>
					{scoredWeighted.length < weighted.length && (
						<span>
							{scoredWeighted.length}/{weighted.length} kriteria terisi
						</span>
					)}
				</header>
				{props.rubricHelp ? <p className="assessment-rubric-help">{props.rubricHelp}</p> : null}
				{criteria.length === 0 && props.rubricEmpty}
				{(criteria.length > 0 || props.rubricGeneral) && (
					<ul className="evx-rubric">
						{criteria.map((criterion) => {
							const open = rowOpen(criterion.id);
							const score = scores[criterion.id];
							const aiScore = aiDraft?.criterionScores?.[criterion.id];
							return (
								<li key={criterion.id}>
									<button type="button" aria-expanded={open} onClick={() => toggleRow(criterion.id)}>
										<span>{criterion.shortLabel ?? criterion.label}</span>
										<span className="evx-bar">
											<i style={{ width: `${score ?? 0}%` }} />
										</span>
										<strong>{score == null ? '—' : score}</strong>
										<span className="assessment-weight">{criterion.weightPercent}%</span>
										<ChevronDown size={12} aria-hidden="true" />
									</button>
									{open && (
										<div className="evx-criterion-achievement">
											<label>
												Pencapaian · bobot {criterion.weight}
												<select
													aria-label={'Pencapaian ' + criterion.label}
													value={score ?? ''}
													onChange={(e) => props.onScoreChange(criterion.id, e.target.value)}
												>
													<option value="">Pilih tingkat pencapaian</option>
													{ACHIEVEMENT_LEVELS.map((level) => (
														<option key={level.value} value={level.value}>
															{level.label} · {level.value}
														</option>
													))}
													{score != null && !ACHIEVEMENT_LEVELS.some((level) => level.value === score) && (
														<option value={score}>Skor khusus · {score}</option>
													)}
												</select>
											</label>
											<label>
												Skor 0–100
												<input
													aria-label={'Skor ' + criterion.label}
													type="number"
													min={0}
													max={100}
													step={1}
													value={score ?? ''}
													onChange={(e) => props.onScoreChange(criterion.id, e.target.value)}
												/>
											</label>
										</div>
									)}
									{open && (criterion.evidence || (aiScore != null && aiScore !== score)) && (
										<p>
											{criterion.evidence}
											{aiScore != null && aiScore !== score ? ` Saran AI: ${aiScore}.` : ''}
										</p>
									)}
								</li>
							);
						})}
						{props.rubricGeneral && (
							<li className="evx-rubric-general-row">
								<strong>Catatan umum (tidak terpetakan ke kriteria)</strong>
								<span>
									{props.rubricGeneral.major} merah · {props.rubricGeneral.minor} kuning
								</span>
								<span>Bukti tambahan untuk ditinjau; tanpa penalti otomatis</span>
							</li>
						)}
					</ul>
				)}
				{props.rubricGeneral && (
					<p className="evx-rubric-total-note">
						Catatan umum menjadi bukti untuk ditinjau; tidak ada pengurangan skor otomatis.
					</p>
				)}
				{props.rubricExtra}
			</section>

			<details
				className="evx-block evx-feedback"
				open={feedbackOpen}
				onToggle={(event) => setFeedbackOpen(event.currentTarget.open)}
			>
				<summary>
					<div>
						<h4>
							<PenLine size={14} /> {props.feedbackLabel ?? 'Feedback untuk mahasiswa'}
						</h4>
						{!feedbackOpen && (
							<p className="evx-feedback-preview">
								{props.feedback.trim() ? props.feedback.trim().slice(0, 90) : 'Tambah feedback untuk mahasiswa'}
							</p>
						)}
					</div>
					<ChevronDown size={14} />
				</summary>
				<textarea
					ref={noteRef}
					className="aev-publish-note"
					aria-label="Catatan untuk mahasiswa"
					rows={4}
					maxLength={feedbackMax}
					value={props.feedback}
					onChange={(e) => props.onFeedbackChange(e.target.value)}
					placeholder={props.feedbackPlaceholder ?? 'Tulis feedback untuk mahasiswa...'}
				/>
				<div className="evx-note-meta">
					{props.onApplyAi && (
						<button
							type="button"
							className="evx-ai-suggest"
							disabled={!aiDraft?.summary}
							title={props.feedback.trim() ? 'Saran AI ditambahkan di bawah feedback Anda' : undefined}
							onClick={props.onApplyAi}
						>
							<Sparkles size={13} /> {props.applyAiLabel ?? 'Gunakan saran AI'}
						</button>
					)}
					<span>
						{props.feedback.length} / {feedbackMax}
					</span>
				</div>
			</details>

			{props.children}

			{props.more ? (
				<details className="evx-block evx-more">
					<summary>
						Lainnya <ChevronDown size={14} />
					</summary>
					{props.more}
				</details>
			) : null}

			<div className="evx-sticky-actions">
				{props.publishHelp ? <p className="assessment-publish-help">{props.publishHelp}</p> : null}
				{finalScore ? <section className="evx-block evx-final-block">
					<label>
						{finalScore.label ?? 'Nilai yang akan diterbitkan'}
						<span className="evx-score-field">
							<input
								id={finalScore.inputId}
								inputMode="decimal"
								value={finalScore.value}
								onChange={(e) => finalScore.onChange(e.target.value)}
								placeholder={finalScore.placeholder}
								aria-label={finalScore.ariaLabel ?? 'Nilai akhir'}
								readOnly={finalScore.readOnly}
							/>
							<em>{finalScore.unit ?? '/ 100'}</em>
						</span>
					</label>
					{finalScore.badge && (
						<span className={`aev-adjust-badge${finalScore.badgeTone === 'ai' ? ' ai' : ''}`}>{finalScore.badge}</span>
					)}
					{finalScore.invalid && <span className="aev-override-warn">Nilai harus angka 0–100.</span>}
					{finalScore.delta}
					{finalScore.onClear && (
						<button type="button" className="ld-outline-action sm" onClick={finalScore.onClear}>
							Hapus penyesuaian
						</button>
					)}
				</section> : null}
				{props.confirm ? (
					props.confirm
				) : (
					<>
						<div className="evx-actions">
							{secondaryAction && (
								<button
									type="button"
									className="evx-draft-btn"
									disabled={secondaryAction.disabled}
									onClick={secondaryAction.onClick}
								>
									{secondaryAction.busy ? <LoaderCircle size={14} className="spin" /> : secondaryAction.icon ?? null}{' '}
									{secondaryAction.label}
								</button>
							)}
							<button
								type="button"
								className="evx-next-btn"
								disabled={primaryAction.disabled}
								aria-describedby={primaryAction.disabled && props.disabledReasons?.length ? 'grading-disabled-reasons' : undefined}
								onClick={primaryAction.onClick}
							>
								{primaryAction.busy ? <LoaderCircle size={14} className="spin" /> : primaryAction.icon ?? null}{' '}
								{primaryAction.label}
							</button>
						</div>
						{primaryAction.disabled && props.disabledReasons && props.disabledReasons.length > 0 && (
							<ul className="evx-disabled-reasons" id="grading-disabled-reasons" aria-label="Belum dapat diterbitkan">
								{props.disabledReasons.map((reason) => (
									<li key={reason}>{reason}</li>
								))}
							</ul>
						)}
					</>
				)}
			</div>
			{props.footer}
		</section>
	);
}

/** AI draft run status shown next to the score card, with a request / retry action. */
function AiDraftStatus({
	draft,
	onRequestAi,
	busy,
}: {
	draft: GradingAiDraft | null;
	onRequestAi?: () => void;
	busy?: boolean;
}) {
	if (!draft || draft.status === 'ready') return null;
	const action = (label: string, icon: ReactNode) =>
		onRequestAi ? (
			<button type="button" className="ld-outline-action sm" onClick={onRequestAi} disabled={busy}>
				{busy ? <LoaderCircle size={13} className="spin" /> : icon} {label}
			</button>
		) : null;
	if (draft.status === 'pending' || draft.status === 'requesting') {
		return (
			<p className="aev-note pending" aria-live="polite">
				<LoaderCircle className="spin" size={13} /> {draft.message || 'Menyiapkan draf evaluasi AI.'}
			</p>
		);
	}
	if (draft.status === 'stalled') {
		return (
			<div className="aev-draft-status">
				<p className="aev-note warn" role="alert">
					<AlertTriangle size={13} /> Draf AI belum siap. Coba lagi.{draft.message ? ` ${draft.message}` : ''}
				</p>
				{action('Coba lagi', <RotateCcw size={13} />)}
			</div>
		);
	}
	if (draft.status === 'failed') {
		return (
			<div className="aev-draft-status">
				<p className="aev-note failed" role="alert">
					<AlertTriangle size={13} /> {draft.message || 'Draf AI gagal.'}
				</p>
				{action('Minta draf AI', <RotateCcw size={13} />)}
			</div>
		);
	}
	if (draft.status === 'empty') {
		return (
			<div className="aev-draft-status">
				<p className="aev-note warn" role="status">
					<Info size={13} /> {draft.message || 'Draf AI selesai tanpa temuan.'}
				</p>
				{action('Minta draf AI ulang', <RotateCcw size={13} />)}
			</div>
		);
	}
	return (
		<div className="aev-draft-status">
			<p className="aev-note failed" role="status">
				<Info size={13} /> {draft.message || 'Evaluasi AI belum dijalankan untuk kiriman ini.'}
			</p>
			{action('Minta draf AI', <Sparkles size={13} />)}
		</div>
	);
}
