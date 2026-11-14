/**
 * ScheduledGradingPanel — adapter that renders the shared Tugas
 * `GradingPanel` for one scheduled-class written answer (essay/reflection).
 *
 * The scheduled data model (grading settings in points, criterion points,
 * stored AI draft, assessment status) is mapped onto the panel's 0–100
 * props by the pure helpers in `@/lib/scheduled-grading`. This component
 * owns only the inline publish confirmation; the review workspace keeps the
 * draft state and performs every request.
 */
import { useState } from 'react';
import { ArrowRight, Lock, Send, Settings2, Sparkles } from 'lucide-react';
import type { ScheduledActivity, ScheduledAssessment, ScheduledAttempt } from '@/lib/scheduled-classes';
import type { GradeDraftState } from '@/lib/scheduled-review';
import type { SuggestedCriterion } from '@/lib/rubric-suggestions';
import {
	draftFromAi,
	draftPercent,
	draftPoints,
	gradeBlockers,
	panelAiDraft,
	panelCriteria,
	panelScores,
	setCriterionPercent,
	writtenStatus,
	WRITTEN_STATUS_LABELS,
	type EffectiveSettings,
	type ScheduledAiDraftRecord,
} from '@/lib/scheduled-grading';
import { GradingPanel, mergeAiFeedback, type GradingPanelProps } from './grading-panel';
import '@/styles/assessment-clarity.css';

export type ScheduledSuggestionState = { loading: boolean; criteria: SuggestedCriterion[]; reason: string };

export type ScheduledGradingPanelProps = {
	activity: ScheduledActivity;
	attempt?: ScheduledAttempt;
	assessment?: ScheduledAssessment;
	settings: EffectiveSettings;
	/** Settings can no longer change because assessments exist for the activity. */
	locked: boolean;
	draft: GradeDraftState;
	onDraftChange: (draft: GradeDraftState) => void;
	dirty: boolean;
	aiRecord?: ScheduledAiDraftRecord;
	aiRequesting: boolean;
	aiError: string;
	hasWritten: boolean;
	onRequestAi?: () => void;
	suggestion: ScheduledSuggestionState;
	canGrade: boolean;
	busy: boolean;
	onSave: (status: 'draft' | 'reviewed', next: boolean) => void;
	onPublish: () => void;
	onAcceptSuggestion: () => void;
	onPreset: (mode: 'points' | 'ungraded') => void;
	onOpenSettings: () => void;
	onRetrySuggestion?: () => void;
};

const MODE_LABELS = { ungraded: 'Umpan balik saja', points: 'Nilai', rubric: 'Rubrik' } as const;

/** Pure props mapping, exported for tests. */
export function scheduledGradingPanelProps(
	props: ScheduledGradingPanelProps,
	extra: { confirming: boolean; setConfirming: (value: boolean) => void },
): GradingPanelProps {
	const { settings, draft, attempt, assessment, aiRecord } = props;
	const status = writtenStatus(attempt, assessment, aiRecord);
	const published = status === 'published';
	const blockers = gradeBlockers(settings, draft, { canGrade: props.canGrade, submitted: Boolean(attempt) });
	const ai = panelAiDraft(aiRecord, settings, { requesting: props.aiRequesting, error: props.aiError, hasWritten: props.hasWritten });
	const total = draftPoints(settings, draft);
	const points = settings.mode === 'points' ? Number(draft.points) : NaN;
	const pointsInvalid = settings.mode === 'points' && draft.points.trim() !== '' && (!Number.isFinite(points) || points < 0 || points > settings.maxPoints);
	const disabled = !props.canGrade || props.busy;
	const locked = props.locked;

	const headline: Record<typeof status, string> = {
		missing: 'Belum ada jawaban',
		needs: 'Perlu dinilai',
		ai: 'Draf AI siap ditinjau',
		draft: 'Draf dosen tersimpan',
		ready: 'Siap diterbitkan',
		published: 'Sudah diterbitkan',
	};
	const description: Record<typeof status, string> = {
		missing: 'Mahasiswa belum mengirim jawaban untuk kegiatan ini.',
		needs: 'Nilai setiap kriteria dari bukti pada jawaban, tulis umpan balik, lalu Simpan & berikutnya.',
		ai: 'Periksa usulan AI, sesuaikan nilai dan umpan balik, lalu Simpan & berikutnya. Usulan AI bukan nilai resmi.',
		draft: 'Draf hanya terlihat oleh dosen. Simpan & berikutnya menandainya siap diterbitkan.',
		ready: 'Penilaian sudah ditinjau. Terbitkan agar nilai dan umpan balik terlihat oleh mahasiswa.',
		published: 'Mahasiswa dapat melihat nilai dan umpan balik ini. Perubahan baru terlihat setelah diterbitkan ulang.',
	};

	const settingsCard = (
		<div className={`sr-grading-setup${settings.provisional ? ' is-provisional' : ''}`} role="group" aria-label="Cara menilai">
			{settings.source === 'saved' ? (
				locked ? (
					<p>
						<Lock size={13} aria-hidden="true" /> <strong>Cara menilai terkunci · {MODE_LABELS[settings.mode]}</strong>
						<span>
							Sudah ada penilaian untuk kegiatan ini. Kriteria tidak dapat diubah karena perubahan akan membatalkan nilai yang sudah dibuat.
						</span>
					</p>
				) : (
					<p>
						<strong>Cara menilai · {MODE_LABELS[settings.mode]}{settings.mode !== 'ungraded' ? ` · maks. ${settings.maxPoints}` : ''}</strong>
						<span>Berlaku untuk seluruh mahasiswa pada kegiatan ini. Terkunci setelah penilaian pertama disimpan.</span>
					</p>
				)
			) : settings.source === 'suggested' ? (
				<p>
					<Sparkles size={13} aria-hidden="true" /> <strong>Saran rubrik dari contoh jawaban & panduan penilaian</strong>
					<span>Dipakai sebagai rubrik kegiatan saat Anda menyimpan penilaian pertama. Terima atau ubah dulu bila perlu.</span>
				</p>
			) : (
				<p>
					<strong>Nilai 0–100</strong>
					<span>
						{props.suggestion.loading
							? 'Menyusun saran rubrik dari contoh jawaban & panduan penilaian…'
							: props.suggestion.reason || 'Belum ada saran rubrik untuk kegiatan ini.'}{' '}
						Nilai 0–100 dipakai sampai Anda mengatur rubrik; tersimpan saat penilaian pertama disimpan.
					</span>
				</p>
			)}
			{settings.provisional && (
				<div className="sr-grading-setup-actions">
					{settings.source === 'suggested' && (
						<button type="button" className="ld-outline-action sm" disabled={disabled} onClick={props.onAcceptSuggestion}>
							Terima semua
						</button>
					)}
					<button type="button" className="ld-outline-action sm" disabled={disabled} onClick={props.onOpenSettings}>
						<Settings2 size={13} /> {settings.source === 'suggested' ? 'Ubah rubrik…' : 'Atur rubrik…'}
					</button>
					{settings.source === 'suggested' && (
						<button type="button" className="ld-outline-action sm" disabled={disabled} onClick={() => props.onPreset('points')}>
							Pakai nilai 0–100
						</button>
					)}
					<button type="button" className="ld-outline-action sm" disabled={disabled} onClick={() => props.onPreset('ungraded')}>
						Umpan balik saja
					</button>
					{settings.source === 'default' && !props.suggestion.loading && props.onRetrySuggestion && (
						<button type="button" className="ld-outline-action sm" disabled={disabled} onClick={props.onRetrySuggestion}>
							<Sparkles size={13} /> Sarankan rubrik
						</button>
					)}
				</div>
			)}
			{!settings.provisional && (
				<div className="sr-grading-setup-actions">
					<button type="button" className="ld-outline-action sm" disabled={props.busy} onClick={props.onOpenSettings} title={locked ? 'Lihat pengaturan (terkunci)' : 'Ubah pengaturan penilaian'}>
						{locked ? <Lock size={13} /> : <Settings2 size={13} />} {locked ? 'Lihat pengaturan' : 'Ubah pengaturan'}
					</button>
				</div>
			)}
		</div>
	);
	const findings = ai?.status === 'ready' ? (aiRecord?.draft.findings || []).slice(0, 6) : [];
	const canPublish = (status === 'ready' || status === 'published') && !props.dirty;

	return {
		ariaLabel: `Penilaian ${props.activity.title}`,
		title: 'Penilaian & umpan balik',
		statusLabel: WRITTEN_STATUS_LABELS[status],
		live: published,
		status: {
			eyebrow: 'PENILAIAN KELAS TERJADWAL',
			headline: headline[status],
			description: description[status],
			saveState: props.busy
				? 'Menyimpan…'
				: props.dirty
					? 'Perubahan belum disimpan'
					: assessment
						? 'Penilaian tersimpan'
						: aiRecord?.status === 'ready'
							? 'Usulan AI · belum disimpan sebagai penilaian'
							: 'Belum ada penilaian tersimpan',
			unsaved: props.dirty,
		},
		steps: [
			{ label: settings.mode === 'ungraded' ? 'Tulis umpan balik' : 'Nilai jawaban' },
			{ label: 'Simpan & berikutnya' },
			{ label: 'Terbitkan' },
		],
		criteria: panelCriteria(settings),
		scores: panelScores(settings, draft),
		onScoreChange: (id, value) => props.onDraftChange(setCriterionPercent(settings, draft, id, value)),
		rubricTotal: draftPercent(settings, draft),
		scoreCaption: settings.mode === 'ungraded' ? 'Umpan balik saja · tanpa nilai' : settings.mode === 'points' ? `Nilai pada draf ini (maks. ${settings.maxPoints})` : 'Skor rubrik pada draf ini',
		rubricHeading: settings.source === 'suggested' ? 'Saran rubrik (belum disimpan)' : 'Rubrik penilaian',
		rubricTip:
			settings.mode === 'rubric'
				? 'Pilih tingkat pencapaian 0–100 untuk setiap kriteria; nilai poin kriteria dihitung dari bobotnya. Total = jumlah poin kriteria.'
				: undefined,
		rubricEmpty:
			settings.mode === 'points' ? (
				<p className="evx-muted">Isi nilai 0–{settings.maxPoints} di bawah.</p>
			) : (
				<p className="evx-muted">Kegiatan ini dinilai dengan umpan balik saja, tanpa angka.</p>
			),
		rubricExtra: settingsCard,
		feedback: draft.feedback,
		onFeedbackChange: (value) => props.onDraftChange({ ...draft, feedback: value }),
		feedbackLabel: 'Umpan balik untuk mahasiswa',
		feedbackPlaceholder: 'Tulis umpan balik untuk mahasiswa...',
		feedbackMax: 10000,
		aiDraft: ai,
		onRequestAi: props.hasWritten && props.canGrade && attempt ? props.onRequestAi : undefined,
		aiBusy: props.aiRequesting || props.busy,
		onApplyAi:
			aiRecord?.status === 'ready'
				? () => {
						const proposal = draftFromAi(settings, aiRecord);
						props.onDraftChange({
							feedback: mergeAiFeedback(draft.feedback, proposal.feedback, 10000),
							points: draft.points.trim() ? draft.points : proposal.points,
							criterionScores: { ...proposal.criterionScores, ...Object.fromEntries(Object.entries(draft.criterionScores).filter(([, v]) => v !== '')) },
						});
					}
				: undefined,
		applyAiLabel: 'Gunakan saran AI',
		finalScore:
			settings.mode === 'ungraded'
				? undefined
				: settings.mode === 'points'
					? {
							value: draft.points,
							onChange: (value) => props.onDraftChange({ ...draft, points: value }),
							placeholder: 'Belum dinilai',
							invalid: pointsInvalid,
							unit: `/ ${settings.maxPoints}`,
							label: 'Nilai',
							ariaLabel: 'Nilai jawaban',
						}
					: {
							value: total == null ? '' : String(total),
							onChange: () => {},
							placeholder: 'Belum lengkap',
							readOnly: true,
							unit: `/ ${settings.maxPoints}`,
							label: 'Total nilai (jumlah kriteria)',
							ariaLabel: 'Total nilai rubrik',
						},
		publishHelp:
			'Simpan & berikutnya menandai penilaian siap diterbitkan, lalu membuka jawaban berikutnya yang belum dinilai. Mahasiswa baru melihatnya setelah diterbitkan.',
		secondaryAction: { label: 'Simpan draf', onClick: () => props.onSave('draft', false), disabled: disabled || !attempt, busy: props.busy },
		primaryAction: {
			label: 'Simpan & berikutnya',
			onClick: () => props.onSave('reviewed', true),
			disabled: disabled || blockers.length > 0,
			busy: props.busy,
			icon: <ArrowRight size={14} />,
		},
		disabledReasons: blockers,
		children: findings.length ? (
			<details className="evx-block sr-ai-findings">
				<summary>
					<Sparkles size={13} /> Temuan AI ({findings.length})
				</summary>
				<ul>
					{findings.map((finding, index) => (
						<li key={index}>
							{finding.quote ? <q lang="de">{finding.quote}</q> : <em>Umum</em>} — {finding.note}
							{finding.correction ? (
								<>
									{' '}→ <span lang="de">{finding.correction}</span>
								</>
							) : null}
						</li>
					))}
				</ul>
				{aiRecord?.draft.truncated ? <p className="evx-muted">Jawaban panjang dipotong; hanya bagian awal yang ditinjau.</p> : null}
				<p className="evx-muted">Usulan AI. Periksa sebelum dipakai; nilai resmi tetap keputusan dosen.</p>
			</details>
		) : undefined,
		footer:
			status === 'ready' || status === 'published' ? (
				<div className="sr-publish" aria-live="polite">
					{extra.confirming ? (
						<>
							<p>Terbitkan nilai dan umpan balik ini? Mahasiswa akan langsung dapat melihatnya.</p>
							<button type="button" className="ss-button ss-button-primary" disabled={disabled} onClick={() => { extra.setConfirming(false); props.onPublish(); }}>
								<Send size={15} /> Ya, terbitkan
							</button>
							<button type="button" className="ss-button" onClick={() => extra.setConfirming(false)}>
								Batal
							</button>
						</>
					) : (
						<>
							<p>{published ? 'Mahasiswa dapat melihat penilaian ini.' : props.dirty ? 'Simpan perubahan sebelum menerbitkan.' : 'Siap dibagikan kepada mahasiswa.'}</p>
							<button type="button" className="ss-button" disabled={disabled || !canPublish || published} onClick={() => extra.setConfirming(true)}>
								<Send size={15} />
								{published ? 'Sudah diterbitkan' : 'Terbitkan penilaian'}
							</button>
						</>
					)}
				</div>
			) : undefined,
	};
}

export function ScheduledGradingPanel(props: ScheduledGradingPanelProps) {
	const [confirming, setConfirming] = useState(false);
	return <GradingPanel {...scheduledGradingPanelProps(props, { confirming, setConfirming })} />;
}
