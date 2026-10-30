/**
 * Phase 6 — evidence-based actionable lecturer recommendations.
 *
 * Builds DRAFT recommendations for lecturer review only, grounded strictly in
 * (a) a Phase 5 "insights" context bundle — only lecturer-approved document
 * sections marked suitable against the active file version — and (b) the
 * lecturer's own aggregate formative Cek-jawaban signals (no names, answers,
 * attachments, feedback text, or OCR text).
 *
 * Every recommendation separates observed evidence, interpretation, and
 * suggested action, and carries its exact citations. When the model produces
 * nothing usable, or no draft survives citation validation, the result is an
 * explicit insufficient-evidence state — never a guess. Nothing here edits,
 * publishes, assigns, grades, or notifies anything.
 */
import logger from '@/lib/logger.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { collectModel } from '@/lib/task-assist.server';
import type { ContextBundle, ContextCitation } from '@/lib/context-retrieval.server';

export type InsightArea = { label: string; checks: number; people: number };

/** Aggregate formative signals for one lecturer scope — aggregate only. */
export type InsightSignals = {
	total: number;
	participants: number;
	areas: InsightArea[];
	levels: { 1: number; 2: number; 3: number };
	fullQuota: number;
	perAssignment: { id: string; title: string; checks: number }[];
};

type AttemptRow = {
	assignment: string;
	attempt: number;
	level?: number;
	area: string;
	identityKey: string;
};

function chunk<T>(items: T[], size: number): T[][] {
	const groups: T[][] = [];
	for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
	return groups;
}

/**
 * Loads the aggregate formative signals for the given (already
 * ownership-verified) assignments: total checks, participants, top difficulty
 * areas, hint-level usage, and quota exhaustion. Server-side superuser read
 * of `check_attempts` — aggregate only, no participant-identifying data is
 * kept beyond counts.
 */
export async function loadInsightSignals(
	assignments: { id: string; title: string; checkMax?: number | null }[],
): Promise<InsightSignals> {
	const empty: InsightSignals = {
		total: 0,
		participants: 0,
		areas: [],
		levels: { 1: 0, 2: 0, 3: 0 },
		fullQuota: 0,
		perAssignment: [],
	};
	if (!assignments.length) return empty;

	const rows: AttemptRow[] = [];
	for (const group of chunk(assignments, 20)) {
		const filter = `(${group.map((a) => `assignment = "${a.id}"`).join(' || ')})`;
		let page = 1;
		for (;;) {
			const result = await pocketbaseAdmin.listRecords<AttemptRow>('check_attempts', {
				filter,
				fields: 'assignment,attempt,level,area,identityKey',
				page,
				perPage: 500,
			});
			rows.push(...result.items);
			if (result.items.length < 500 || page >= 20) break;
			page += 1;
		}
	}

	const byIdentity = new Set<string>();
	type AreaAcc = { label: string; checks: number; people: Set<string> };
	const areaMap = new Map<string, AreaAcc>();
	const levels = { 1: 0, 2: 0, 3: 0 };
	const perAssignmentMap = new Map<string, number>();
	const checksPerIdentityAssignment = new Map<string, number>();
	const maxByAssignment = new Map(assignments.map((a) => [a.id, a.checkMax || 5]));

	for (const row of rows) {
		byIdentity.add(row.identityKey);
		const level = row.level === 1 || row.level === 2 || row.level === 3 ? row.level : null;
		if (level) levels[level] += 1;

		const label = row.area.trim().replace(/\s+/g, ' ');
		if (label) {
			const key = label.toLowerCase();
			let area: AreaAcc | undefined = areaMap.get(key);
			if (!area) {
				area = { label, checks: 0, people: new Set<string>() };
				areaMap.set(key, area);
			}
			area.checks += 1;
			area.people.add(row.identityKey);
		}

		perAssignmentMap.set(row.assignment, (perAssignmentMap.get(row.assignment) || 0) + 1);
		const key = `${row.identityKey}|${row.assignment}`;
		checksPerIdentityAssignment.set(key, (checksPerIdentityAssignment.get(key) || 0) + 1);
	}

	// A participant who exhausted their check quota on an assignment signals
	// persistent difficulty — counted once per participant.
	const quotaIdentities = new Set<string>();
	for (const [key, count] of checksPerIdentityAssignment) {
		const assignmentId = key.slice(key.indexOf('|') + 1);
		if (count >= (maxByAssignment.get(assignmentId) || 5)) {
			quotaIdentities.add(key.slice(0, key.indexOf('|')));
		}
	}

	const titleById = new Map(assignments.map((a) => [a.id, a.title]));

	return {
		total: rows.length,
		participants: byIdentity.size,
		areas: [...areaMap.values()]
			.map((area) => ({ label: area.label, checks: area.checks, people: area.people.size }))
			.sort((a, b) => b.checks - a.checks || b.people - a.people),
		levels,
		fullQuota: quotaIdentities.size,
		perAssignment: [...perAssignmentMap.entries()]
			.map(([id, checks]) => ({ id, title: titleById.get(id) || 'Tugas', checks }))
			.sort((a, b) => b.checks - a.checks),
	};
}

export type DraftRecommendation = {
	observed: string;
	interpretation: string;
	action: string;
	signal: string;
	citations: ContextCitation[];
};

const MAX_DRAFTS = 4;

const SYSTEM_PROMPT = [
	'Anda asisten rekomendasi tindakan dosen dalam Bahasa Indonesia.',
	'Bekerja HANYA dari materi konteks yang disetujui dosen dan sinyal kesulitan formatif agregat yang dikirim.',
	'Bedakan tiga bagian dengan jelas: bukti teramati (observed), interpretasi (interpretation), dan tindakan yang disarankan (action).',
	'Jangan mengarang CPL, CPMK, Sub-CPMK, rubrik, kunci jawaban, nilai, kriteria, sumber, atau materi yang tidak dikirim.',
	'Rekomendasi berupa draf untuk ditinjau dosen — bukan perubahan otomatis, bukan penilaian.',
	'Balas HANYA satu array JSON valid, tanpa teks lain di luar array.',
].join(' ');

/**
 * Asks the model for grounded draft recommendations and validates every one
 * against the bundle: each draft must cite at least one approved section id
 * that actually exists in the bundle. Drafts without valid citations are
 * dropped; if none survive, the result is an explicit insufficient state.
 */
export async function draftRecommendations(input: {
	bundle: ContextBundle;
	signals: InsightSignals;
	scopeLabel: string;
}): Promise<{ ok: true; drafts: DraftRecommendation[] } | { ok: false; reason: string }> {
	const materialLines = input.bundle.sources
		.map((source) => {
			const sections = source.sections
				.map(
					(section) =>
						`  - Bagian "${section.label}"${section.pageRef ? ` (hal. ${section.pageRef})` : ''} [id=${section.sectionId}]`,
				)
				.join('\n');
			const excerpt = source.text.slice(0, 1600);
			return [
				`Sumber: "${source.title}" (versi ${source.version}, berkas ${source.filename})`,
				sections || '  (tanpa penanda bagian)',
				`  Kutipan teks:\n"""\n${excerpt}\n"""`,
			].join('\n');
		})
		.join('\n\n');

	const signalLines = [
		`Total pemeriksaan formatif: ${input.signals.total} dari ${input.signals.participants} peserta`,
		...input.signals.areas
			.slice(0, 6)
			.map((area) => `Area "${area.label}": ${area.checks} pemeriksaan, ${area.people} peserta`),
		`Tingkat panduan terpakai — tingkat 1: ${input.signals.levels[1]}, tingkat 2: ${input.signals.levels[2]}, tingkat 3: ${input.signals.levels[3]}`,
		`Peserta yang memakai seluruh kuota pemeriksaan: ${input.signals.fullQuota}`,
		`Lingkup: ${input.scopeLabel}`,
	];

	const prompt = [
		'Susun draf rekomendasi tindakan dosen, HANYA berdasarkan materi konteks dan sinyal kesulitan di bawah ini.',
		`Lingkup: ${input.scopeLabel}.`,
		'',
		'MATERI KONTEKS (bagian dokumen yang disetujui dosen):',
		materialLines,
		'',
		'SINYAL KESULITAN FORMATIF (agregat, tanpa nama peserta):',
		signalLines.join('\n'),
		'',
		'Ketentuan:',
		`- Maksimal ${MAX_DRAFTS} rekomendasi; setiap rekomendasi wajib berbasis minimal satu id bagian materi ([id=...]) dan, bila relevan, satu area sinyal.`,
		'- "observed" hanya menyebut apa yang benar-benar ada pada materi/sinyal (sebut bagian dan area secara eksplisit).',
		'- "interpretation" menjelaskan makna pedagogisnya; "action" adalah tindakan konkret yang bisa dosen lakukan sendiri.',
		'- "signal" diisi label area kesulitan terkait, atau string kosong jika tidak ada.',
		'- Jika bukti tidak cukup untuk rekomendasi yang bertanggung jawab, balas array kosong [].',
		'Balas HANYA array JSON dengan bentuk:',
		'[{"observed":"...","interpretation":"...","action":"...","signal":"...","citations":["<id bagian>"]}]',
	].join('\n');

	let raw = '';
	try {
		raw = await collectModel(prompt, [], SYSTEM_PROMPT);
	} catch (error) {
		logger.error('recommendation model failed', error);
		return {
			ok: false,
			reason:
				'Asisten AI tidak tersedia saat ini. Tidak ada rekomendasi yang dibuat — tidak ada yang dikarang. Coba lagi nanti.',
		};
	}
	if (!raw) {
		return {
			ok: false,
			reason: 'Asisten AI tidak menghasilkan draf. Tidak ada rekomendasi yang dibuat.',
		};
	}

	const cleaned = raw.replace(/```json|```/g, '').trim();
	const start = cleaned.indexOf('[');
	const end = cleaned.lastIndexOf(']');
	if (start === -1 || end === -1 || end <= start) {
		return {
			ok: false,
			reason: 'Asisten AI tidak menghasilkan draf yang dapat dibaca. Tidak ada rekomendasi yang dibuat.',
		};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(cleaned.slice(start, end + 1));
	} catch {
		return {
			ok: false,
			reason: 'Asisten AI tidak menghasilkan draf yang dapat dibaca. Tidak ada rekomendasi yang dibuat.',
		};
	}
	if (!Array.isArray(parsed) || parsed.length === 0) {
		return {
			ok: false,
			reason:
				'Bukti pada materi dan sinyal kesulitan belum cukup untuk rekomendasi yang bertanggung jawab. Tidak ada rekomendasi yang dibuat.',
		};
	}

	const citationBySection = new Map(input.bundle.citations.map((c) => [c.sectionId, c]));
	const drafts: DraftRecommendation[] = [];
	for (const item of parsed.slice(0, MAX_DRAFTS)) {
		if (!item || typeof item !== 'object') continue;
		const row = item as Record<string, unknown>;
		const observed = typeof row.observed === 'string' ? row.observed.trim() : '';
		const interpretation = typeof row.interpretation === 'string' ? row.interpretation.trim() : '';
		const action = typeof row.action === 'string' ? row.action.trim() : '';
		const signal = typeof row.signal === 'string' ? row.signal.trim() : '';
		const ids = Array.isArray(row.citations)
			? row.citations.filter((c): c is string => typeof c === 'string')
			: [];
		const citations = [...new Set(ids)]
			.map((id) => citationBySection.get(id))
			.filter((c): c is ContextCitation => !!c);
		// A recommendation without grounding in an approved section is a
		// guess — it is dropped, never kept.
		if (!observed || !interpretation || !action || citations.length === 0) continue;
		drafts.push({
			observed: observed.slice(0, 2000),
			interpretation: interpretation.slice(0, 2000),
			action: action.slice(0, 2000),
			signal: signal.slice(0, 300),
			citations,
		});
	}
	if (drafts.length === 0) {
		return {
			ok: false,
			reason:
				'Bukti pada materi dan sinyal kesulitan belum cukup untuk rekomendasi yang bertanggung jawab. Tidak ada rekomendasi yang dibuat.',
		};
	}
	return { ok: true, drafts };
}
