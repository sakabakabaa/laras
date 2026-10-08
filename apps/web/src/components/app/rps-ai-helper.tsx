import { useState } from 'react';
import { ArrowRight, CheckCircle2, LoaderCircle, RotateCcw, Sparkles, X } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidateCollections } from '@/lib/local-cache';
import { errorMessage } from '@/lib/learning';
import {
	buildFixProposal,
	type FixContext,
	type FixOp,
	type RpsFixProposal,
} from '@/lib/rps-fix';
import {
	VALIDATION_CATEGORY_LABELS,
	type ValidationCategory,
	type ValidationWarning,
} from '@/lib/rps-validation';
import { AppModal } from '@/components/app/app-modal';

type Props = {
	courseId: string;
	context: FixContext;
	warnings: ValidationWarning[];
	onManualFix: (category: ValidationCategory) => void;
};

type ModalState = {
	warning: ValidationWarning;
	local: RpsFixProposal;
	remote: RpsFixProposal | null;
	source: 'ai' | 'deterministic' | '';
	aiNote: string;
	loading: boolean;
	error: string;
};

type BatchPlan = {
	warning: ValidationWarning;
	proposal: RpsFixProposal;
};

function mergeOps(ops: FixOp[]) {
	const map = new Map<string, FixOp>();
	for (const op of ops) {
		const key = `${op.collection}:${op.id}`;
		const existing = map.get(key);
		if (!existing) {
			map.set(key, { ...op, patch: { ...op.patch }, before: { ...op.before } });
			continue;
		}
		for (const [field, value] of Object.entries(op.before)) {
			if (!(field in existing.before)) existing.before[field] = value;
		}
		for (const [field, value] of Object.entries(op.patch)) {
			const prev = existing.patch[field];
			existing.patch[field] =
				Array.isArray(prev) && Array.isArray(value)
					? [...new Set([...prev, ...value])]
					: value;
		}
	}
	return [...map.values()];
}

async function applyOps(ops: FixOp[], keyPrefix: string) {
	for (let i = 0; i < ops.length; i += 1) {
		const op = ops[i];
		await pb.collection(op.collection).update(op.id, op.patch, {
			requestKey: `${keyPrefix}-${i}-${op.id}`,
		});
	}
	invalidateCollections('class_sessions', 'courses', 'assessments', 'sub_cpmk', 'topics', 'cpmk', 'cpl');
}

export function RpsAiHelper({ courseId, context, warnings, onManualFix }: Props) {
	const [modal, setModal] = useState<ModalState | null>(null);
	const [batchOpen, setBatchOpen] = useState(false);
	const [applying, setApplying] = useState(false);
	const [undo, setUndo] = useState<FixOp[] | null>(null);
	const [undoing, setUndoing] = useState(false);
	const [notice, setNotice] = useState('');

	const plans: BatchPlan[] = warnings.map((warning) => ({
		warning,
		proposal: buildFixProposal(context, warning),
	}));
	const applicable = plans.filter((plan) => plan.proposal.canApply && plan.proposal.ops.length > 0);
	const skipped = plans.filter((plan) => !plan.proposal.canApply || plan.proposal.ops.length === 0);
	const batchOps = mergeOps(applicable.flatMap((plan) => plan.proposal.ops));
	const batchChanges = applicable.flatMap((plan) => plan.proposal.changes);

	const open = async (warning: ValidationWarning) => {
		const local = buildFixProposal(context, warning);
		setNotice('');
		setModal({ warning, local, remote: null, source: '', aiNote: '', loading: local.canApply, error: '' });
		if (!local.canApply) return;
		try {
			const response = await fetch('/api/rps-assist', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({
					courseId,
					category: warning.category,
					message: warning.message,
				}),
			});
			const payload = (await response.json()) as {
				error?: string;
				message?: string;
				source?: 'ai' | 'deterministic';
				aiNote?: string;
				proposal?: RpsFixProposal;
			};
			if (!response.ok || !payload.proposal) {
				throw new Error(payload.error || payload.message || 'Asisten AI tidak dapat meninjau catatan ini.');
			}
			setModal((current) =>
				current && current.warning.message === warning.message
					? {
							...current,
							remote: payload.proposal!,
							source: payload.source || 'deterministic',
							aiNote: payload.aiNote || '',
							loading: false,
						}
					: current,
			);
		} catch (error) {
			setModal((current) =>
				current && current.warning.message === warning.message
					? {
							...current,
							loading: false,
							error: '',
							remote: local,
							source: 'deterministic',
							aiNote: `${errorMessage(error)} Usulan aman dari data yang ada tetap bisa ditinjau dan diterapkan.`,
						}
					: current,
			);
		}
	};

	const proposal = modal?.remote || modal?.local || null;

	const apply = async () => {
		if (!proposal?.canApply || proposal.ops.length === 0) return;
		setApplying(true);
		try {
			await applyOps(proposal.ops, 'rps-ai');
			setUndo(proposal.ops);
			setNotice('Perbaikan diterapkan. PDF RPS asli tidak diubah. Anda dapat membatalkan perubahan terakhir.');
			setModal(null);
		} catch (error) {
			setModal((current) => (current ? { ...current, error: errorMessage(error) } : current));
		} finally {
			setApplying(false);
		}
	};

	const applyAll = async () => {
		if (batchOps.length === 0) return;
		setApplying(true);
		setNotice('');
		try {
			await applyOps(batchOps, 'rps-ai-all');
			setUndo(batchOps);
			const skipNote =
				skipped.length > 0
					? ` ${skipped.length} catatan dilewati karena tidak bisa diturunkan dari data yang ada.`
					: '';
			setNotice(
				`${applicable.length} perbaikan aman diterapkan.${skipNote} PDF RPS asli tidak diubah. Anda dapat membatalkan perubahan terakhir.`,
			);
			setBatchOpen(false);
		} catch (error) {
			setNotice(errorMessage(error));
		} finally {
			setApplying(false);
		}
	};

	const revert = async () => {
		if (!undo) return;
		setUndoing(true);
		setNotice('');
		try {
			for (let i = 0; i < undo.length; i += 1) {
				const op = undo[i];
				await pb.collection(op.collection).update(op.id, op.before, {
					requestKey: `rps-ai-undo-${i}-${op.id}`,
				});
			}
			invalidateCollections('class_sessions', 'courses', 'assessments', 'sub_cpmk', 'topics', 'cpmk', 'cpl');
			setUndo(null);
			setNotice('Perubahan terakhir dibatalkan. Data kembali seperti sebelum perbaikan AI.');
		} catch (error) {
			setNotice(errorMessage(error));
		} finally {
			setUndoing(false);
		}
	};

	return (
		<>
			<div className="cw-ai-toolbar">
				<p className="cw-ai-lead">
					Asisten hanya memakai data RPS yang sudah tersimpan. Ia tidak membuat CPL, CPMK, sesi, bobot, atau teks baru.
				</p>
				<button type="button" className="ld-btn-primary cw-apply-all" onClick={() => setBatchOpen(true)}>
					<Sparkles size={15} /> Terapkan semua
					{applicable.length > 0 ? ` (${applicable.length})` : ''}
				</button>
			</div>
			{notice && (
				<p className="cw-ai-notice">
					<CheckCircle2 size={14} /> {notice}
				</p>
			)}
			{undo && (
				<button type="button" className="ld-outline-action cw-ai-undo" onClick={revert} disabled={undoing}>
					{undoing ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}
					Batalkan perbaikan terakhir
				</button>
			)}
			<ul className="cw-validation-list">
				{warnings.map((warning) => {
					const local = buildFixProposal(context, warning);
					return (
						<li key={`${warning.category}:${warning.message}`}>
							<small>{VALIDATION_CATEGORY_LABELS[warning.category]}</small>
							<span>{warning.message}</span>
							<p className="cw-ai-rec">
								<strong>Rekomendasi.</strong> {local.explanation}
							</p>
							<div className="cw-ai-actions">
								<button type="button" className="ld-text-btn cw-fix" onClick={() => onManualFix(warning.category)}>
									Perbaiki manual <ArrowRight size={12} />
								</button>
								<button type="button" className="cw-ai-btn" onClick={() => open(warning)}>
									<Sparkles size={13} />
									{local.canApply ? 'Terapkan dengan AI' : 'Lihat batas AI'}
								</button>
							</div>
						</li>
					);
				})}
			</ul>

			{batchOpen && (
				<AppModal open onClose={() => !applying && setBatchOpen(false)} title="Terapkan perbaikan yang aman" className="cw-ai-modal">
						<div className="modal-top">
							<span>Tinjauan massal</span>
							<button type="button" onClick={() => setBatchOpen(false)} aria-label="Tutup" disabled={applying}>
								<X size={16} />
							</button>
						</div>
						<h2 id="rps-ai-all-title">Terapkan perbaikan yang aman</h2>
						<p>
							{applicable.length > 0
								? `${applicable.length} catatan bisa diperbaiki dari data yang sudah tersimpan. Tidak ada CPL, CPMK, sesi, bobot, atau teks baru.`
								: 'Tidak ada perbaikan yang aman untuk diterapkan sekaligus. Semua catatan di bawah perlu dilengkapi manual.'}
						</p>
						{batchChanges.length > 0 && (
							<ul className="cw-ai-changes">
								{batchChanges.map((change) => (
									<li key={`${change.label}:${change.after}`}>
										<strong>{change.label}</strong>
										<span>
											<em>{change.before}</em>
											<ArrowRight size={12} />
											{change.after}
										</span>
									</li>
								))}
							</ul>
						)}
						{skipped.length > 0 && (
							<div className="cw-ai-skipped">
								<strong>Dilewati ({skipped.length})</strong>
								<ul>
									{skipped.map((plan) => (
										<li key={`${plan.warning.category}:${plan.warning.message}`}>
											<small>{VALIDATION_CATEGORY_LABELS[plan.warning.category]}</small>
											<span>{plan.proposal.explanation}</span>
										</li>
									))}
								</ul>
							</div>
						)}
						<div className="modal-actions">
							<button type="button" className="ld-outline-action" onClick={() => setBatchOpen(false)} disabled={applying}>
								Batal
							</button>
							{batchOps.length > 0 && (
								<button type="button" className="ld-btn-primary" onClick={() => void applyAll()} disabled={applying}>
									{applying ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}
									Terapkan {applicable.length} perbaikan
								</button>
							)}
						</div>
				</AppModal>
			)}

			{modal && proposal && (
				<AppModal open onClose={() => !applying && setModal(null)} title={proposal.title} className="cw-ai-modal">
						<div className="modal-top">
							<span>Asisten RPS</span>
							<button type="button" onClick={() => setModal(null)} aria-label="Tutup" disabled={applying}>
								<X size={16} />
							</button>
						</div>
						<h2 id="rps-ai-title">{proposal.title}</h2>
						<p>{proposal.explanation}</p>
						{modal.loading && (
							<p className="cw-ai-loading">
								<LoaderCircle size={16} className="spin" /> AI meninjau usulan terhadap data mata kuliah ini…
							</p>
						)}
						{modal.aiNote && <p className="cw-ai-note">{modal.aiNote}</p>}
						{modal.source === 'ai' && proposal.canApply && (
							<p className="cw-ai-note">Ditinjau AI. Hanya tautan dan salinan dari data yang sudah ada yang lolos.</p>
						)}
						{proposal.changes.length > 0 && (
							<ul className="cw-ai-changes">
								{proposal.changes.map((change) => (
									<li key={`${change.label}:${change.after}`}>
										<strong>{change.label}</strong>
										<span>
											<em>{change.before}</em>
											<ArrowRight size={12} />
											{change.after}
										</span>
									</li>
								))}
							</ul>
						)}
						<p className="cw-ai-review">{proposal.reviewNote}</p>
						{modal.error && <p className="form-error">{modal.error}</p>}
						<div className="modal-actions">
							<button type="button" className="ld-outline-action" onClick={() => setModal(null)} disabled={applying}>
								Tutup
							</button>
							{proposal.canApply && (
								<button type="button" className="ld-btn-primary" onClick={apply} disabled={applying || modal.loading}>
									{applying ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}
									Terapkan usulan
								</button>
							)}
						</div>
				</AppModal>
			)}
		</>
	);
}
