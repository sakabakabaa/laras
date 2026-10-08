/**
 * Shared client-side helpers for the Phase 7 academic-context suggestion
 * flow. Used by both the full "Atur konteks akademik" page and the step-by
 * step Berkas upload wizard, so the generate / approve / reject logic is not
 * duplicated. All writes go to the same `context_suggestions`,
 * `file_contexts`, `context_sections`, and `file_library` collections — the
 * stores downstream AI grounding already reads. Only lecturer-approved
 * suggestions take effect; a rejected suggestion is simply marked.
 */
import pb from '@/lib/pocketbase-client';
import type {
	ContextSuggestionRecord,
	ContextSuggestionReview,
	FileContextRecord,
} from '@/lib/learning';

export type SuggestionGenerateResult = {
	ok: boolean;
	suggestions: ContextSuggestionRecord[];
	reason: string;
};

/** Calls the faculty-only /api/berkas-suggest endpoint for one library file. */
export async function generateContextSuggestions(
	fileId: string,
): Promise<SuggestionGenerateResult> {
	const response = await fetch('/api/berkas-suggest', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${pb.authStore.token}`,
		},
		body: JSON.stringify({ fileId }),
	});
	const data = (await response.json().catch(() => null)) as
		| { ok?: boolean; reason?: string; suggestions?: ContextSuggestionRecord[] }
		| null;
	if (!response.ok || !data?.ok) {
		return {
			ok: false,
			suggestions: [],
			reason: data?.reason || 'Pembuatan saran gagal. Coba lagi.',
		};
	}
	return { ok: true, suggestions: data.suggestions ?? [], reason: '' };
}

/** Lists the stored suggestions for one file (newest first). */
export async function fetchContextSuggestions(
	fileId: string,
): Promise<ContextSuggestionRecord[]> {
	try {
		return await pb.collection('context_suggestions').getFullList<ContextSuggestionRecord>({
			filter: `file = "${fileId}"`,
			sort: 'created',
			expand: 'cpmk,subCpmk,session,course',
		});
	} catch {
		return [];
	}
}

/** Marks a suggestion approved/rejected and stamps the review time. */
export async function reviewContextSuggestion(
	rowId: string,
	review: ContextSuggestionReview,
): Promise<void> {
	await pb.collection('context_suggestions').update(rowId, {
		review,
		reviewedAt: new Date().toISOString(),
	});
}

export type ApplyContext = {
	fileId: string;
	ownerId: string;
	version: number;
	context: FileContextRecord | null;
	sectionsCount: number;
};

export type ApplyResult = {
	/** Updated context record state after a language/topics apply. */
	context: FileContextRecord | null;
	/** New language value, or null when unchanged (non-language kinds). */
	language: string | null;
	/** New topics value, or null when unchanged (non-topics kinds). */
	topics: string | null;
	changedContext: boolean;
	changedSections: boolean;
	changedFile: boolean;
};

/**
 * Applies one approved suggestion to the confirmed context stores that
 * downstream AI grounding reads, then marks the suggestion approved. Only
 * approved suggestions take effect — call reviewContextSuggestion for a
 * rejection instead. Returns what changed so the caller can refresh its UI.
 */
export async function applyContextSuggestion(
	row: ContextSuggestionRecord,
	ctx: ApplyContext,
): Promise<ApplyResult> {
	const { fileId, ownerId, version, context, sectionsCount } = ctx;
	const result: ApplyResult = {
		context,
		language: null,
		topics: null,
		changedContext: false,
		changedSections: false,
		changedFile: false,
	};

	if (row.kind === 'language') {
		const lang = row.label;
		if (context) {
			await pb.collection('file_contexts').update(context.id, { language: lang });
			result.context = { ...context, language: lang };
		} else {
			const created = await pb.collection('file_contexts').create<FileContextRecord>({
				file: fileId,
				owner: ownerId,
				version,
				language: lang,
				topics: '',
				status: 'draft',
			});
			result.context = created;
		}
		result.language = lang;
		result.changedContext = true;
	} else if (row.kind === 'topics') {
		const existing = (context?.topics || '')
			.split('\n')
			.map((t) => t.trim())
			.filter(Boolean);
		const incoming = row.label
			.split('\n')
			.map((t) => t.trim())
			.filter(Boolean);
		const merged = [...new Set([...existing, ...incoming])].join('\n');
		if (context) {
			await pb.collection('file_contexts').update(context.id, { topics: merged });
			result.context = { ...context, topics: merged };
		} else {
			const created = await pb.collection('file_contexts').create<FileContextRecord>({
				file: fileId,
				owner: ownerId,
				version,
				language: '',
				topics: merged,
				status: 'draft',
			});
			result.context = created;
		}
		result.topics = merged;
		result.changedContext = true;
	} else if (row.kind === 'section') {
		await pb.collection('context_sections').create({
			file: fileId,
			owner: ownerId,
			version,
			label: row.label,
			pageRef: row.pageRef || '',
			status: 'suitable',
			note: row.note || '',
			cpmk: row.cpmk || '',
			subCpmk: row.subCpmk || '',
			session: row.session || '',
			order: sectionsCount,
		});
		result.changedSections = true;
	} else if (row.kind === 'course' && row.course) {
		await pb.collection('file_library').update(fileId, { course: row.course });
		result.changedFile = true;
	} else if (row.kind === 'session' && row.session) {
		await pb.collection('file_library').update(fileId, { session: row.session });
		result.changedFile = true;
	}

	await pb.collection('context_suggestions').update(row.id, {
		review: 'approved',
		reviewedAt: new Date().toISOString(),
	});
	return result;
}
