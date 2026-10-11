/**
 * Server-side review of a safe RPS fix. The model may only accept or reject
 * candidate Sub-CPMK links that already exist, and may only write an Indonesian
 * explanation. Field values always come from `buildFixProposal`.
 */
import logger from '@/lib/logger.server';
import { collectHostingerText } from '@/lib/hostinger-model.server';
import {
	buildFixProposal,
	candidateSubCpmks,
	type FixContext,
	type RpsFixProposal,
} from '@/lib/rps-fix';
import type { ValidationWarning } from '@/lib/rps-validation';

type AiDecision = {
	explanation?: string;
	accept?: Array<{ sessionId?: string; subCpmkId?: string }>;
};

function clip(value: string, max = 280) {
	const text = value.replace(/\s+/g, ' ').trim();
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function collectModel(prompt: string): Promise<string> {
	return (await collectHostingerText({
		prompt,
		systemPrompt:
			'Anda meninjau usulan perbaikan RPS. Balas HANYA JSON valid tanpa markdown. Jangan mengarang CPL, CPMK, Sub-CPMK, sesi, bobot, atau teks. Anda hanya boleh menerima pasangan sessionId dan subCpmkId yang ada di kandidat, atau menolaknya. explanation dalam Bahasa Indonesia, maksimal 3 kalimat, menjelaskan apa yang aman dan apa yang sengaja tidak diubah.',
		timeoutMs: 45_000,
	})).content;
}

function parseDecision(raw: string): AiDecision | null {
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start < 0 || end <= start) return null;
	try {
		return JSON.parse(raw.slice(start, end + 1)) as AiDecision;
	} catch {
		return null;
	}
}

/**
 * Rebuild the proposal from stored context, then let the model drop uncertain
 * overlap mappings. Code matches and copied fields are never expanded by the model.
 */
export async function assistFix(
	ctx: FixContext,
	warning: ValidationWarning,
): Promise<{ proposal: RpsFixProposal; source: 'ai' | 'deterministic'; aiNote: string }> {
	const base = buildFixProposal(ctx, warning);
	if (!base.canApply) {
		return { proposal: base, source: 'deterministic', aiNote: '' };
	}

	const candidates = ctx.sessions
		.filter((s) => !s.subCpmks?.length)
		.map((session) => ({
			sessionId: session.id,
			week: session.week,
			title: clip(session.title || session.topic || ''),
			hits: candidateSubCpmks(session, ctx.subCpmk),
		}))
		.filter((row) => row.hits.length > 0);

	const allowed = new Set(
		candidates.flatMap((row) => row.hits.map((hit) => `${row.sessionId}:${hit.id}`)),
	);
	const codeKept = new Set(
		candidates.flatMap((row) =>
			row.hits.filter((hit) => hit.reason === 'code').map((hit) => `${row.sessionId}:${hit.id}`),
		),
	);

	let decision: AiDecision | null = null;
	try {
		const prompt = JSON.stringify({
			catatan: warning.message,
			usulanLokal: {
				judul: base.title,
				penjelasan: base.explanation,
				perubahan: base.changes.map((c) => ({ label: c.label, dari: clip(c.before, 120), menjadi: clip(c.after, 180) })),
			},
			kandidatPemetaan: candidates.map((row) => ({
				sessionId: row.sessionId,
				minggu: row.week,
				judul: row.title,
				pilihan: row.hits.map((hit) => {
					const item = ctx.subCpmk.find((s) => s.id === hit.id);
					return {
						subCpmkId: hit.id,
						alasan: hit.reason,
						kode: item?.code || '',
						deskripsi: clip(item?.description || '', 160),
					};
				}),
			})),
			balasan: {
				explanation: 'kalimat Bahasa Indonesia',
				accept: [{ sessionId: 'id', subCpmkId: 'id' }],
			},
		});
		decision = parseDecision(await collectModel(prompt));
	} catch (error) {
		logger.error(`RPS assist model failed: ${error instanceof Error ? error.message : String(error)}`);
	}

	if (!decision) {
		return {
			proposal: base,
			source: 'deterministic',
			aiNote: 'Model tidak menjawab. Ditampilkan usulan aman dari data yang sudah ada, tanpa teks baru.',
		};
	}

	const accepted = new Set<string>();
	for (const pair of decision.accept || []) {
		if (!pair.sessionId || !pair.subCpmkId) continue;
		const key = `${pair.sessionId}:${pair.subCpmkId}`;
		if (allowed.has(key)) accepted.add(key);
	}
	for (const key of codeKept) accepted.add(key);

	const proposal = filterMappings(base, ctx, accepted, candidates.length > 0);
	if (proposal.canApply) {
		const explanation = sanitizeExplanation(decision.explanation, ctx);
		if (explanation) proposal.explanation = explanation;
	}
	return { proposal, source: 'ai', aiNote: '' };
}

function subLabel(ctx: FixContext, id: string) {
	const item = ctx.subCpmk.find((row) => row.id === id);
	if (!item) return '';
	return item.code ? `${item.code} — ${item.description}` : item.description;
}

function filterMappings(
	base: RpsFixProposal,
	ctx: FixContext,
	accepted: Set<string>,
	hadCandidates: boolean,
): RpsFixProposal {
	if (!hadCandidates) return base;
	const ops = base.ops.flatMap((op) => {
		if (op.collection !== 'class_sessions' || !Array.isArray(op.patch.subCpmks)) return [op];
		const ids = (op.patch.subCpmks as string[]).filter((id) => accepted.has(`${op.id}:${id}`));
		if (ids.length === 0) return [];
		return [{ ...op, patch: { ...op.patch, subCpmks: ids } }];
	});
	const changes = base.changes
		.filter((change) => {
			if (!change.label.includes('Sub-CPMK')) return true;
			const week = Number(change.label.match(/Minggu (\d+)/)?.[1]);
			const session = ctx.sessions.find((s) => s.week === week);
			return ops.some((op) => op.id === session?.id && op.patch.subCpmks);
		})
		.map((change) => {
			if (!change.label.includes('Sub-CPMK')) return change;
			const week = Number(change.label.match(/Minggu (\d+)/)?.[1]);
			const session = ctx.sessions.find((s) => s.week === week);
			const op = ops.find((item) => item.id === session?.id);
			const ids = (op?.patch.subCpmks as string[] | undefined) || [];
			const after = ids.map((id) => subLabel(ctx, id)).filter(Boolean).join('; ');
			return after ? { ...change, after } : change;
		});
	if (ops.length === 0) {
		return {
			canApply: false,
			title: 'Tidak ada padanan yang cukup jelas',
			explanation:
				'Tinjauan AI menolak pemetaan yang hanya mirip kata, dan tidak ada kode Sub-CPMK yang disebut langsung. Tidak ada tautan yang diterapkan. Petakan secara manual.',
			reviewNote: 'Field lain tidak diubah.',
			changes: [],
			ops: [],
		};
	}
	return { ...base, ops, changes };
}

function sanitizeExplanation(text: string | undefined, ctx: FixContext) {
	if (!text) return '';
	const clean = text.replace(/```/g, '').trim();
	if (clean.length < 12 || clean.length > 700) return '';
	const known = new Set(
		[...ctx.subCpmk.map((s) => s.code), ...ctx.assessments.map((a) => a.code)].filter(Boolean).map((c) => c.toLowerCase()),
	);
	const codes = clean.match(/\b(?:CPL|CPMK|SUB-CPMK|SUBCPMK)[- ]?\d+\b/gi) || [];
	for (const code of codes) {
		if (!known.has(code.toLowerCase().replace(/\s+/g, ''))) {
			const loose = [...known].some((k) => code.toLowerCase().replace(/[\s-]/g, '').includes(k.replace(/[\s-]/g, '')));
			if (!loose) return '';
		}
	}
	return clean;
}
