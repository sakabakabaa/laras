/**
 * Findings list with approve / reject controls for a Kelas terjadwal written
 * answer (same wording and behaviour as the Tugas review). Controls are
 * presentational: the review workspace owns the decisions and persists them
 * with the assessment.
 */
import {useState} from 'react';
import {CheckCircle2} from 'lucide-react';
import {findingGroupLabel} from '@/lib/ai-evaluation';
import {reviewGroups, type ReviewedFinding} from '@/lib/scheduled-finding-review';
import type {FindingStatus} from '@/lib/scheduled-answer-marks';

export type ScheduledFindingControls = {
	findings: ReviewedFinding[];
	disabled?: boolean;
	onDecide: (id: string, status: FindingStatus, reason?: string) => void;
	onApproveAll?: () => void;
	onApproveGroup: (ids: string[]) => void;
	onRejectGroup: (ids: string[]) => void;
};

const STATUS_WORD: Record<FindingStatus, string> = {pending: 'Menunggu tinjauan', approved: 'Disetujui', rejected: 'Ditolak'};

function FindingRow({finding, controls}: {finding: ReviewedFinding; controls: ScheduledFindingControls}) {
	const [rejecting, setRejecting] = useState(false);
	const [reason, setReason] = useState(finding.rejectReason || '');
	const off = controls.disabled;
	return (
		<li className={`sr-finding is-${finding.status}`}>
			<div className="sr-finding-text">
				{finding.quote ? <q lang="de">{finding.quote}</q> : <em>Umum</em>}
				{finding.correction ? <> → <span lang="de">{finding.correction}</span></> : null}
				{finding.note || finding.errorDescription ? <> — {finding.note || finding.errorDescription}</> : null}{' '}
				{finding.certainty && <span className={`aev-cert ${finding.certainty}`}>{finding.certainty}</span>}{' '}
				<span className={`aevr-status ${finding.status}`}>{STATUS_WORD[finding.status]}</span>
				{finding.status === 'rejected' && finding.rejectReason ? <span className="sr-finding-reason"> Alasan: {finding.rejectReason}</span> : null}
			</div>
			<span className="aevr-item-actions">
				{finding.status !== 'approved' && (
					<button type="button" className="approve" disabled={off} onClick={() => { setRejecting(false); controls.onDecide(finding.id, 'approved'); }}>
						Setujui
					</button>
				)}
				{finding.status !== 'rejected' && !rejecting && (
					<button type="button" disabled={off} onClick={() => setRejecting(true)}>Tolak</button>
				)}
				{finding.status !== 'pending' && (
					<button type="button" disabled={off} onClick={() => { setRejecting(false); controls.onDecide(finding.id, 'pending'); }}>Batalkan</button>
				)}
			</span>
			{rejecting && (
				<span className="sr-finding-reject">
					<input
						value={reason}
						maxLength={600}
						aria-label="Alasan penolakan (opsional)"
						placeholder="Alasan penolakan (opsional)"
						onChange={(event) => setReason(event.target.value)}
					/>
					<button type="button" disabled={off} onClick={() => { setRejecting(false); controls.onDecide(finding.id, 'rejected', reason); }}>Tolak temuan</button>
					<button type="button" onClick={() => setRejecting(false)}>Batal</button>
				</span>
			)}
		</li>
	);
}

/** `findings` is the subset to list (e.g. one answer's); `controls.findings` is the whole draft (for "Setujui semua"). */
export function ScheduledFindingsReview({findings, controls, heading = 'Temuan AI'}: {findings: ReviewedFinding[]; controls: ScheduledFindingControls; heading?: string}) {
	if (!findings.length) return null;
	const pending = controls.findings.filter((f) => f.status === 'pending').length;
	const groups = reviewGroups(findings);
	return (
		<section className="sr-findings" aria-label={heading}>
			<div className="sr-findings-head">
				<strong>{heading} ({findings.length})</strong>
				{controls.onApproveAll && pending > 0 && (
					<button type="button" className="ld-outline-action sm" disabled={controls.disabled} onClick={controls.onApproveAll}>
						<CheckCircle2 size={12} /> Setujui semua temuan ({pending})
					</button>
				)}
			</div>
			<ul>
				{groups.map((group) => {
					if (!group.key) return <FindingRow key={group.items[0].id} finding={group.items[0]} controls={controls} />;
					const ids = group.items.map((f) => f.id);
					const pendingInGroup = group.items.filter((f) => f.status === 'pending').length;
					return (
						<li key={group.key} className="aev-group">
							<div className="aev-group-head">
								<strong>{group.label || findingGroupLabel(group.key)} ×{group.items.length}</strong>
								<span className="aevr-item-actions">
									<button type="button" className="approve" disabled={controls.disabled || pendingInGroup === 0} onClick={() => controls.onApproveGroup(ids)}>
										<CheckCircle2 size={12} /> Setujui grup
									</button>
									<button type="button" disabled={controls.disabled || group.items.every((f) => f.status === 'rejected')} onClick={() => controls.onRejectGroup(ids)}>Tolak grup</button>
								</span>
							</div>
							<ul className="aev-group-items">
								{group.items.map((f) => <FindingRow key={f.id} finding={f} controls={controls} />)}
							</ul>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
