/**
 * "Selesaikan kelas" — the one place to finish a scheduled class: approve
 * automatic scores (per activity or all), grade written answers, publish the
 * ready written grades, release quiz results, and mark the class reviewed.
 * Rendered on the "Jawaban & nilai" tab header and mirrored in "Ringkasan".
 */
import { useState } from 'react';
import { CheckCheck, CheckCircle2, Circle, Eye, LoaderCircle, Send } from 'lucide-react';
import type { ScheduledBatchResult, ScheduledClassState } from '@/lib/scheduled-classes';
import { finalizeChecklist, studentVisibilityHints } from '@/lib/scheduled-grading';

type Props = {
	state: ScheduledClassState;
	onAction: (action: string, body?: Record<string, unknown>) => Promise<unknown>;
	busy?: boolean;
	/** Opens the next written answer to grade (review tab). */
	onGrade?: () => void;
	/** Render as a collapsible summary (review tab header). */
	collapsible?: boolean;
};

type Confirm = { kind: 'approve'; activity?: string } | { kind: 'publish' } | { kind: 'release' } | { kind: 'review' } | null;

const batchOf = (value: unknown): ScheduledBatchResult | undefined =>
	value && typeof value === 'object' && 'batch' in value ? (value as { batch?: ScheduledBatchResult }).batch : undefined;

/** Indonesian outcome line + per-item failures with student names. */
export function describeBatch(state: ScheduledClassState, batch: ScheduledBatchResult | undefined, verb: string): { text: string; failures: string[] } {
	if (!batch) return { text: `Selesai ${verb}.`, failures: [] };
	const nameOf = (attemptId: string) => {
		const attempt = state.attempts.find((a) => a.id === attemptId);
		const row = state.report.find((r) => r.student && r.student === attempt?.student);
		const activity = state.activities.find((a) => a.id === attempt?.activity);
		return [row?.name || 'Mahasiswa', activity?.title].filter(Boolean).join(' · ');
	};
	return {
		text: `${batch.ok} ${verb}${batch.failed ? `, ${batch.failed} gagal` : ''}.`,
		failures: batch.results.filter((r) => !r.ok).map((r) => `${nameOf(r.attemptId)}: ${r.error || 'gagal'}`),
	};
}

export function ScheduledFinalizeChecklist({ state, onAction, busy = false, onGrade, collapsible = false }: Props) {
	const [confirm, setConfirm] = useState<Confirm>(null);
	const [running, setRunning] = useState(false);
	const [result, setResult] = useState<{ text: string; failures: string[]; error?: boolean } | null>(null);
	const phase = state.class?.phase;
	if (!state.class || (phase !== 'closed' && phase !== 'reviewed')) return null;
	const list = finalizeChecklist(state);
	const hints = studentVisibilityHints(state);
	const disabled = busy || running;
	const autoByActivity = state.activities
		.map((activity) => ({ activity, items: list.autoToApprove.filter((item) => item.activity === activity.id) }))
		.filter((entry) => entry.items.length > 0);

	const run = async (work: () => Promise<{ text: string; failures: string[] }>) => {
		setRunning(true);
		setResult(null);
		try {
			setResult(await work());
		} catch (error) {
			setResult({ text: (error as Error).message || 'Tindakan gagal. Coba lagi.', failures: [], error: true });
		} finally {
			setRunning(false);
			setConfirm(null);
		}
	};
	const approve = (activity?: string) =>
		run(async () => {
			const items = list.autoToApprove
				.filter((item) => !activity || item.activity === activity)
				.map(({ attemptId, attemptRevision, assessmentRevision }) => ({ attemptId, attemptRevision, assessmentRevision }));
			return describeBatch(state, batchOf(await onAction('approveAutoScores', { items })), 'nilai otomatis disetujui');
		});
	const publish = () =>
		run(async () => {
			const items = list.readyToPublish.map(({ attemptId, baseRevision, attemptRevision, settingsRevision }) => ({ attemptId, baseRevision, attemptRevision, settingsRevision }));
			return describeBatch(state, batchOf(await onAction('publishAssessments', { items })), 'penilaian diterbitkan');
		});
	const release = () => run(async () => { await onAction('release'); return { text: 'Hasil kuis diterbitkan kepada peserta.', failures: [] }; });
	const review = () => run(async () => { await onAction('review'); return { text: 'Kelas ditandai sudah ditinjau.', failures: [] }; });

	const confirmBox = (text: string, detail: string, label: string, action: () => void) => (
		<div className="sr-finalize-confirm" role="alert">
			<strong>{text}</strong>
			<span>{detail}</span>
			<div>
				<button type="button" className="ss-button ss-button-small ss-button-primary" disabled={disabled} onClick={action}>
					{running ? <LoaderCircle size={14} className="spin" /> : null}
					{label}
				</button>
				<button type="button" className="ss-button ss-button-small" disabled={running} onClick={() => setConfirm(null)}>
					Batal
				</button>
			</div>
		</div>
	);
	const mark = (done: boolean) => (done ? <CheckCircle2 size={16} className="is-done" aria-label="Selesai" /> : <Circle size={16} aria-label="Belum selesai" />);
	const pendingCount = list.pending.length;
	const approveTarget = confirm?.kind === 'approve' ? confirm.activity : undefined;
	const approveCount = confirm?.kind === 'approve' ? list.autoToApprove.filter((i) => !approveTarget || i.activity === approveTarget).length : 0;

	const body = (
		<>
			<ul className="sr-finalize-list">
				<li>
					{mark(list.autoToApprove.length === 0)}
					<div>
						<strong>{list.autoToApprove.length ? `${list.autoToApprove.length} nilai otomatis perlu disetujui` : 'Nilai otomatis sudah disetujui'}</strong>
						{list.hasAutoActivities && <small><Eye size={12} aria-hidden="true" /> {hints.approval}</small>}
						{autoByActivity.length > 1 && (
							<div className="sr-finalize-sub">
								{autoByActivity.map(({ activity, items }) => (
									<button key={activity.id} type="button" className="ss-button ss-button-small" disabled={disabled} onClick={() => setConfirm({ kind: 'approve', activity: activity.id })}>
										Setujui {activity.title} ({items.length})
									</button>
								))}
							</div>
						)}
					</div>
					{list.autoToApprove.length > 0 && (
						<button type="button" className="ss-button ss-button-small" disabled={disabled} onClick={() => setConfirm({ kind: 'approve' })}>
							<CheckCheck size={14} /> Setujui semua nilai otomatis ({list.autoToApprove.length})
						</button>
					)}
				</li>
				<li>
					{mark(list.writtenToGrade === 0)}
					<div>
						<strong>{list.writtenToGrade ? `${list.writtenToGrade} jawaban tertulis perlu dinilai` : 'Semua jawaban tertulis sudah dinilai'}</strong>
						{list.writtenDrafts > 0 && <small>{list.writtenDrafts} di antaranya masih draf dosen.</small>}
					</div>
					{list.writtenToGrade > 0 && onGrade && (
						<button type="button" className="ss-button ss-button-small" disabled={disabled} onClick={onGrade}>
							Nilai sekarang
						</button>
					)}
				</li>
				<li>
					{mark(list.readyToPublish.length === 0)}
					<div>
						<strong>{list.readyToPublish.length ? `${list.readyToPublish.length} penilaian siap diterbitkan` : 'Tidak ada penilaian yang menunggu diterbitkan'}</strong>
						<small>Nilai dan umpan balik tertulis baru terlihat oleh mahasiswa setelah diterbitkan.</small>
					</div>
					{list.readyToPublish.length > 0 && (
						<button type="button" className="ss-button ss-button-small" disabled={disabled} onClick={() => setConfirm({ kind: 'publish' })}>
							<Send size={14} /> Terbitkan yang siap ({list.readyToPublish.length})
						</button>
					)}
				</li>
				{list.hasAutoActivities && (
					<li>
						{mark(list.quizReleased)}
						<div>
							<strong>{list.quizReleased ? 'Hasil kuis sudah diterbitkan' : 'Hasil kuis belum diterbitkan'}</strong>
							<small><Eye size={12} aria-hidden="true" /> {hints.release}</small>
						</div>
						{!list.quizReleased && (
							<button type="button" className="ss-button ss-button-small" disabled={disabled} onClick={() => setConfirm({ kind: 'release' })}>
								Terbitkan hasil kuis
							</button>
						)}
					</li>
				)}
			</ul>
			{confirm?.kind === 'approve' &&
				confirmBox(
					`Setujui ${approveCount} nilai otomatis${approveTarget ? ` untuk ${state.activities.find((a) => a.id === approveTarget)?.title || 'kegiatan ini'}` : ' untuk seluruh kelas'}?`,
					'Nilai dari kunci jawaban (termasuk perubahan "Tandai benar/salah") disetujui apa adanya. Jawaban yang berubah sejak dimuat dilewati dan dilaporkan.',
					`Ya, setujui ${approveCount}`,
					() => void approve(approveTarget),
				)}
			{confirm?.kind === 'publish' &&
				confirmBox(
					`Terbitkan ${list.readyToPublish.length} penilaian sekarang?`,
					'Nilai dan umpan balik akan terlihat oleh mahasiswa. Hanya penilaian berstatus "Siap diterbitkan" yang ikut; draf dosen dan jawaban yang belum dinilai tidak ikut. Kegagalan dilaporkan per jawaban.',
					`Ya, terbitkan ${list.readyToPublish.length}`,
					() => void publish(),
				)}
			{confirm?.kind === 'release' &&
				confirmBox(
					'Terbitkan hasil kuis kepada semua peserta?',
					'Semua peserta akan melihat nilai otomatis, kunci jawaban, dan pembahasan kuis.',
					'Ya, terbitkan hasil kuis',
					() => void release(),
				)}
			{confirm?.kind === 'review' &&
				confirmBox(
					'Masih ada yang belum selesai. Tetap tandai kelas ditinjau?',
					`Tertunda: ${list.pending.join(' · ')}. Menandai ditinjau tidak menerbitkan atau menyetujui apa pun.`,
					'Ya, tandai ditinjau',
					() => void review(),
				)}
			<div className="sr-finalize-footer">
				{list.classReviewed ? (
					<span className="sr-finalize-done">
						<CheckCircle2 size={15} /> Kelas sudah ditandai ditinjau.
					</span>
				) : (
					<>
						<button
							type="button"
							className={`ss-button ss-button-small${pendingCount ? '' : ' ss-button-primary'}`}
							disabled={disabled}
							onClick={() => (pendingCount ? setConfirm({ kind: 'review' }) : void review())}
						>
							Tandai kelas ditinjau
						</button>
						{pendingCount > 0 && <small>Masih tertunda: {list.pending.join(' · ')}.</small>}
					</>
				)}
			</div>
			{result && (
				<div className={`sr-finalize-result${result.error || result.failures.length ? ' is-error' : ''}`} role={result.error ? 'alert' : 'status'}>
					<strong>{result.text}</strong>
					{result.failures.length > 0 && (
						<ul>
							{result.failures.map((failure) => (
								<li key={failure}>{failure}</li>
							))}
						</ul>
					)}
					<button type="button" className="ss-button ss-button-small" onClick={() => setResult(null)}>
						Tutup
					</button>
				</div>
			)}
		</>
	);

	const heading = (
		<>
			<span>Selesaikan kelas</span>
			<em>{pendingCount ? `${pendingCount} langkah tertunda` : list.classReviewed ? 'Selesai' : 'Siap ditandai ditinjau'}</em>
		</>
	);
	return collapsible ? (
		<details className="sr-finalize" open={pendingCount > 0 || undefined}>
			<summary>{heading}</summary>
			{body}
		</details>
	) : (
		<section className="sr-finalize ss-panel" aria-label="Selesaikan kelas">
			<h2>{heading}</h2>
			{body}
		</section>
	);
}
