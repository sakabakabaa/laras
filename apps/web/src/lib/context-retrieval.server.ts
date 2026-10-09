/**
 * Phase 5 — shared read-only context retrieval foundation.
 *
 * One retrieval layer, three feature-scoped contracts. The layer may only
 * retrieve context that a lecturer explicitly approved in Phase 4
 * (`context_sections.status = "suitable"`), inside an academic scope the
 * caller is authorized for, and it is strictly READ-ONLY: it never writes to
 * file_library, file_extractions, file_versions, file_contexts,
 * context_sections, or any academic record. The only write it performs is an
 * audit row in `context_retrievals` (owned by the lecturer whose scope the
 * retrieval ran against).
 *
 * Feature isolation: each feature (`check`, `insights`, `material`) has its
 * own frozen config — purpose, safety note, allowed source kinds, and hard
 * size limits. No mutable prompts, caches, or state are shared between
 * features; every retrieval is a pure per-call computation.
 *
 * Insufficient evidence is always explicit: when no approved, version-matched,
 * readable source exists the bundle returns `result: "insufficient"` with a
 * precise Indonesian reason — the layer never guesses or substitutes
 * unapproved material.
 */
import { randomUUID } from 'node:crypto';
import PocketBase from 'pocketbase';
import logger from '@/lib/logger.server';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import type {
	ContextSectionRecord,
	FileContextRecord,
	FileExtractionRecord,
	FileLibraryRecord,
} from '@/lib/learning';

export type ContextFeature = 'check' | 'insights' | 'material';
export type RequesterRole = 'faculty' | 'student' | 'public';
export type SourceKind = 'document' | 'image' | 'audio' | 'video' | 'other';

/** Academic scope a retrieval runs against (all ids are PocketBase record ids). */
export type RetrievalScope = {
	course: string;
	cpmk?: string;
	subCpmk?: string;
	session?: string;
	assignment?: string;
};

/** Who is asking. `id` is empty for public-link participants (no account). */
export type Requester = { id: string; role: RequesterRole; label: string };

/** Per-feature contract. Frozen — never shared or mutated across features. */
type FeatureConfig = {
	purpose: string;
	note: string;
	allowedKinds: readonly SourceKind[];
	/** Text-grounded features drop sources without parsed text. */
	requiresText: boolean;
	maxSources: number;
	maxSectionsPerFile: number;
	maxCharsPerFile: number;
	maxTotalChars: number;
};

const CHECK_CONFIG: FeatureConfig = {
	purpose: 'Landasan konteks pemeriksaan formatif (Cek jawaban)',
	note: 'Konteks ini hanya untuk pemeriksaan formatif — bukan kunci jawaban, bukan nilai, dan tidak memuat putusan benar/salah.',
	allowedKinds: ['document'],
	requiresText: true,
	maxSources: 3,
	maxSectionsPerFile: 6,
	maxCharsPerFile: 6000,
	maxTotalChars: 12000,
};

const INSIGHTS_CONFIG: FeatureConfig = {
	purpose: 'Landasan konteks wawasan kesulitan dosen (formatif)',
	note: 'Konteks ini hanya untuk wawasan kesulitan formatif — tidak memuat nama peserta, jawaban, lampiran, atau teks OCR.',
	allowedKinds: ['document'],
	requiresText: true,
	maxSources: 5,
	maxSectionsPerFile: 8,
	maxCharsPerFile: 8000,
	maxTotalChars: 24000,
};

const MATERIAL_CONFIG: FeatureConfig = {
	purpose: 'Landasan konteks bantuan materi pembelajaran',
	note: 'Konteks ini hanya untuk bantuan materi — tidak mengubah catatan akademik, tugas, nilai, atau status persetujuan konteks.',
	allowedKinds: ['document', 'image', 'audio', 'video'],
	requiresText: false,
	maxSources: 4,
	maxSectionsPerFile: 6,
	maxCharsPerFile: 8000,
	maxTotalChars: 20000,
};

const FEATURE_CONFIGS: Record<ContextFeature, FeatureConfig> = {
	check: Object.freeze(CHECK_CONFIG),
	insights: Object.freeze(INSIGHTS_CONFIG),
	material: Object.freeze(MATERIAL_CONFIG),
};

const KIND_BY_EXTENSION: Record<string, SourceKind> = {
	pdf: 'document',
	doc: 'document',
	docx: 'document',
	ppt: 'document',
	pptx: 'document',
	xls: 'document',
	xlsx: 'document',
	txt: 'document',
	csv: 'document',
	jpg: 'image',
	jpeg: 'image',
	png: 'image',
	webp: 'image',
	gif: 'image',
	svg: 'image',
	mp3: 'audio',
	wav: 'audio',
	ogg: 'audio',
	aac: 'audio',
	m4a: 'audio',
	mp4: 'video',
	webm: 'video',
	mov: 'video',
	quicktime: 'video',
};

const sourceKindOf = (filename: string): SourceKind =>
	KIND_BY_EXTENSION[(filename.split('.').pop() || '').toLowerCase()] ?? 'other';

const SAFE_ID = /^[A-Za-z0-9]{5,40}$/;

const idOrThrow = (label: string, value: string) => {
	if (!SAFE_ID.test(value)) throw new Error(`invalid ${label} id for context retrieval`);
	return value;
};

const pocketbaseUrl = () => process.env.POCKETBASE_URL || 'http://localhost:8090';

export type AuthedUser = { id: string; role?: string; name?: string; email?: string };
export type AuthFailure = { error: { status: number; message: string } };

/**
 * Verifies the request's Bearer token belongs to a signed-in user (any role).
 * Returns the authenticated PocketBase client (for rule-enforced reads) and
 * the user, or a ready-to-return API error payload.
 */
export async function authenticateUser(
	request: Request,
): Promise<{ pb: PocketBase; user: AuthedUser } | AuthFailure> {
	const header = request.headers.get('Authorization') || '';
	const token = header.replace(/^Bearer\s+/i, '').trim();
	if (!token) return { error: { status: 401, message: 'Masuk untuk menggunakan fitur ini.' } };

	const pb = new PocketBase(pocketbaseUrl());
	pb.autoCancellation(false);
	pb.authStore.save(token, null);
	try {
		await pb.collection('users').authRefresh();
	} catch {
		return { error: { status: 401, message: 'Sesi tidak valid. Masuk kembali.' } };
	}
	const user = pb.authStore.record as AuthedUser | null;
	if (!user?.id) return { error: { status: 401, message: 'Sesi tidak valid. Masuk kembali.' } };
	return { pb, user: { id: user.id, role: user.role, name: user.name, email: user.email } };
}

/** The CPMK a Sub-CPMK belongs to ('' when unknown), for scope prioritization. */
export async function cpmkOfSubCpmk(subCpmkId: string): Promise<string> {
	if (!subCpmkId || !SAFE_ID.test(subCpmkId)) return '';
	try {
		const row = await pocketbaseAdmin.getRecord<{ cpmk?: string }>('sub_cpmk', subCpmkId);
		return row.cpmk || '';
	} catch {
		return '';
	}
}

/**
 * Server-side file-access filter mirroring the `file_library` read rules for
 * the requester's role — a requester never receives context from a file they
 * could not read directly.
 */
const fileAccessFilter = (requester: Requester): string => {
	if (requester.role === 'faculty') {
		return `(owner = "${idOrThrow('requester', requester.id)}" || access != 'faculty')`;
	}
	if (requester.role === 'student') {
		return `access = 'student'`;
	}
	return `access = '__none__'`;
};

/**
 * Relevance score for one approved section against the retrieval scope:
 * exact session > exact Sub-CPMK > exact CPMK > course-level general
 * material. Sections linked to other entities rank last, never first.
 */
const scoreSection = (section: ContextSectionRecord, scope: RetrievalScope): number => {
	let score = 0;
	if (scope.session && section.session === scope.session) score += 50;
	if (scope.subCpmk && section.subCpmk === scope.subCpmk) score += 40;
	if (scope.cpmk && section.cpmk === scope.cpmk) score += 30;
	if (!section.session && !section.subCpmk && !section.cpmk) score += 10;
	return score;
};

function chunk<T>(items: T[], size: number): T[][] {
	const groups: T[][] = [];
	for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
	return groups;
}

export type ContextSectionRef = {
	sectionId: string;
	label: string;
	pageRef: string;
	note: string;
	links: { cpmk: string; subCpmk: string; session: string };
	score: number;
};

export type ContextSource = {
	fileId: string;
	/** Stored filename of the active version (exact source reference). */
	filename: string;
	title: string;
	kind: SourceKind;
	version: number;
	restoredFrom: number | null;
	access: string;
	language: string;
	pages: number | null;
	extraction: {
		status: string;
		extractedAt: string;
		parserVersion: string;
		chars: number;
	} | null;
	contextStatus: 'confirmed' | 'draft' | 'none';
	sections: ContextSectionRef[];
	/** Capped text excerpt from the stored extraction ('' for citation-only media). */
	text: string;
};

export type ContextCitation = {
	bundleId: string;
	fileId: string;
	file: string;
	title: string;
	version: number;
	sectionId: string;
	section: string;
	pageRef: string;
	extractedAt: string;
};

export type ContextBundle = {
	ok: true;
	feature: ContextFeature;
	purpose: string;
	note: string;
	bundleId: string;
	retrievedAt: string;
	result: 'sufficient' | 'insufficient';
	reason: string;
	scope: RetrievalScope;
	requester: { role: RequesterRole; label: string };
	limits: {
		maxSources: number;
		maxSectionsPerFile: number;
		maxCharsPerFile: number;
		maxTotalChars: number;
	};
	sources: ContextSource[];
	citations: ContextCitation[];
	sectionCount: number;
	charCount: number;
	audit: { recorded: boolean; feature: ContextFeature; at: string };
};

/**
 * Retrieve one feature-scoped, read-only context bundle. Only sections a
 * lecturer explicitly marked suitable in Phase 4 — and only sections marked
 * against the file's CURRENT active version — are ever included. Every
 * retrieval is audited in `context_retrievals` under the owning lecturer.
 */
export async function retrieveContextBundle(input: {
	feature: ContextFeature;
	scope: RetrievalScope;
	requester: Requester;
	/** Lecturer whose academic scope the retrieval runs against (audit owner). */
	ownerLecturerId: string;
}): Promise<ContextBundle> {
	const config = FEATURE_CONFIGS[input.feature];
	const scope = input.scope;
	const retrievedAt = new Date().toISOString();
	const bundleId = `ctx-${input.feature}-${randomUUID().replace(/-/g, '').slice(0, 12)}`;

	const exit = async (
		result: 'sufficient' | 'insufficient',
		reason: string,
		sources: ContextSource[],
	): Promise<ContextBundle> => {
		const citations: ContextCitation[] = sources.flatMap((source) =>
			source.sections.map((section) => ({
				bundleId,
				fileId: source.fileId,
				file: source.filename,
				title: source.title,
				version: source.version,
				sectionId: section.sectionId,
				section: section.label,
				pageRef: section.pageRef,
				extractedAt: source.extraction?.extractedAt || '',
			})),
		);
		const sectionCount = sources.reduce((total, source) => total + source.sections.length, 0);
		const charCount = sources.reduce((total, source) => total + source.text.length, 0);

		let recorded = true;
		try {
			await pocketbaseAdmin.createRecord('context_retrievals', {
				feature: input.feature,
				bundleId,
				owner: input.ownerLecturerId,
				requester: input.requester.label.slice(0, 120),
				scope: {
					course: scope.course,
					cpmk: scope.cpmk || '',
					subCpmk: scope.subCpmk || '',
					session: scope.session || '',
					assignment: scope.assignment || '',
				},
				sources: citations,
				result,
				reason: reason.slice(0, 1000),
				sectionCount,
				charCount,
			});
		} catch (error) {
			recorded = false;
			logger.error(
				`context audit write failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		return {
			ok: true,
			feature: input.feature,
			purpose: config.purpose,
			note: config.note,
			bundleId,
			retrievedAt,
			result,
			reason,
			scope,
			requester: { role: input.requester.role, label: input.requester.label },
			limits: {
				maxSources: config.maxSources,
				maxSectionsPerFile: config.maxSectionsPerFile,
				maxCharsPerFile: config.maxCharsPerFile,
				maxTotalChars: config.maxTotalChars,
			},
			sources,
			citations,
			sectionCount,
			charCount,
			audit: { recorded, feature: input.feature, at: retrievedAt },
		};
	};

	// ── Candidates: files in the authorized course the requester may read ──
	const filesResult = await pocketbaseAdmin.listRecords<FileLibraryRecord>('file_library', {
		filter: `course = "${idOrThrow('course', scope.course)}" && ${fileAccessFilter(input.requester)}`,
		perPage: 200,
		sort: '-updated',
	});
	if (filesResult.items.length === 0) {
		return exit('insufficient', 'Belum ada berkas yang ditautkan ke mata kuliah ini.', []);
	}
	const candidates = filesResult.items.filter(
		(file) => file.file && config.allowedKinds.includes(sourceKindOf(file.file)),
	);
	if (candidates.length === 0) {
		return exit(
			'insufficient',
			'Berkas pada mata kuliah ini tidak termasuk jenis sumber yang didukung fitur ini.',
			[],
		);
	}

	// ── Approved context: Phase 4 sections marked suitable, per file ──
	const contextsByFile = new Map<string, FileContextRecord>();
	const sectionsByFile = new Map<string, ContextSectionRecord[]>();
	const extractionsByFile = new Map<string, FileExtractionRecord>();
	for (const group of chunk(candidates, 10)) {
		const orIds = group.map((file) => `file = "${file.id}"`).join(' || ');
		const [contextRows, sectionRows, extractionRows] = await Promise.all([
			pocketbaseAdmin.listRecords<FileContextRecord>('file_contexts', {
				filter: `(${orIds})`,
				perPage: 500,
			}),
			pocketbaseAdmin.listRecords<ContextSectionRecord>('context_sections', {
				filter: `(${orIds}) && status = "suitable"`,
				perPage: 500,
			}),
			pocketbaseAdmin.listRecords<FileExtractionRecord>('file_extractions', {
				filter: `(${orIds})`,
				perPage: 500,
			}),
		]);
		for (const row of contextRows.items) contextsByFile.set(row.file, row);
		for (const row of extractionRows.items) extractionsByFile.set(row.file, row);
		for (const row of sectionRows.items) {
			const list = sectionsByFile.get(row.file) || [];
			list.push(row);
			sectionsByFile.set(row.file, list);
		}
	}

	// ── Version-matched, relevance-ranked sections per file ──
	let totalSuitable = 0;
	type RankedFile = {
		file: FileLibraryRecord;
		sections: { section: ContextSectionRecord; score: number }[];
		best: number;
	};
	const ranked: RankedFile[] = [];
	for (const file of candidates) {
		const all = sectionsByFile.get(file.id) || [];
		totalSuitable += all.length;
		const activeVersion = file.version || 1;
		// Stale markings (made against a prior version) are never trusted.
		const matched = all
			.filter((section) => (section.version ?? 1) === activeVersion)
			.map((section) => ({ section, score: scoreSection(section, scope) }))
			.sort(
				(a, b) =>
					b.score - a.score ||
					(a.section.order ?? 0) - (b.section.order ?? 0) ||
					a.section.created.localeCompare(b.section.created),
			);
		if (matched.length > 0) ranked.push({ file, sections: matched, best: matched[0].score });
	}
	if (totalSuitable === 0) {
		return exit(
			'insufficient',
			'Belum ada bagian dokumen yang ditandai cocok untuk konteks AI pada mata kuliah ini.',
			[],
		);
	}
	if (ranked.length === 0) {
		return exit(
			'insufficient',
			'Penanda konteks belum diperbarui untuk versi berkas yang aktif saat ini.',
			[],
		);
	}
	ranked.sort((a, b) => b.best - a.best || b.file.updated.localeCompare(a.file.updated));

	// ── Build sources within the feature's hard size limits ──
	const sources: ContextSource[] = [];
	let remainingChars = config.maxTotalChars;
	for (const entry of ranked) {
		if (sources.length >= config.maxSources) break;
		const extraction = extractionsByFile.get(entry.file.id) || null;
		const fullText =
			extraction && (extraction.status === 'ready' || extraction.status === 'review')
				? (extraction.extractedText || '').trim()
				: '';
		const kind = sourceKindOf(entry.file.file);
		const budget = Math.max(0, Math.min(config.maxCharsPerFile, remainingChars));
		const text = fullText ? fullText.slice(0, budget) : '';
		// Text-grounded features never include a source without parsed text;
		// material may cite media (image/audio/video) without text, but a
		// textless document gives no grounding and is dropped.
		if (!text && (config.requiresText || kind === 'document')) continue;
		remainingChars -= text.length;
		sources.push({
			fileId: entry.file.id,
			filename: entry.file.file,
			title: entry.file.title,
			kind,
			version: entry.file.version ?? 1,
			restoredFrom: entry.file.restoredFrom ?? null,
			access: entry.file.access,
			language: extraction?.language || '',
			pages: extraction?.pages ?? null,
			extraction: extraction
				? {
						status: extraction.status,
						extractedAt: extraction.extractedAt || '',
						parserVersion: extraction.parserVersion || '',
						chars: extraction.chars ?? 0,
					}
				: null,
			contextStatus: contextsByFile.get(entry.file.id)?.status || 'none',
			sections: entry.sections.slice(0, config.maxSectionsPerFile).map(({ section, score }) => ({
				sectionId: section.id,
				label: section.label,
				pageRef: section.pageRef || '',
				note: section.note || '',
				links: { cpmk: section.cpmk || '', subCpmk: section.subCpmk || '', session: section.session || '' },
				score,
			})),
			text,
		});
	}
	if (sources.length === 0) {
		return exit(
			'insufficient',
			'Konteks tersedia, tetapi teks dokumen belum berhasil diproses untuk berkas yang relevan.',
			[],
		);
	}
	return exit('sufficient', '', sources);
}
