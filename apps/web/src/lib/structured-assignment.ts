/**
 * Structured assignment content for Writing and Speaking tasks.
 *
 * The AI assignment generator produces semantic educational content — a
 * concise summary, typed sections, deterministic requirements, examples, and
 * tips — stored inside the existing `taskConfig` JSON column. It NEVER
 * generates UI code, HTML, React, or CSS. The Student Worksheet and lecturer
 * preview control presentation from the same stored structure, so AI
 * generation → lecturer preview → student worksheet → student AI context all
 * read one representation.
 *
 * Legacy assignments (no `structured` field) keep using the existing
 * free-form text renderer; nothing historical is modified.
 */

/** The two task kinds that carry structured content. */
export type StructuredKind = 'writing' | 'speaking';

// ── Types ────────────────────────────────────────────────────

export type StructuredRequirement = {
	id: string;
	text: string;
	required: boolean;
	/** Numeric quantity where applicable (e.g. "3 waktu" → 3). */
	quantity?: number | null;
	/** Free category/type label (e.g. "waktu", "kegiatan", "kosakata"). */
	category?: string;
};

export type StructuredSection = {
	id: string;
	title: string;
	description: string;
	requirements: StructuredRequirement[];
	examples: string[];
	tips?: string[];
};

export type ResponseFormat = 'writing' | 'speaking';

export type StructuredAssignmentContent = {
	/** Concise student-friendly summary ("Tugas kamu"). */
	summary: string;
	/** Semantic task type, e.g. "essay", "dialogue", "monologue", "paired_conversation". */
	taskType: string;
	/** Which response workspace the student uses. */
	responseFormat: ResponseFormat;
	language?: string;
	level?: string;
	/** Minutes; 0/null = no suggested duration. */
	duration?: number | null;
	submissionMethod?: string;
	sections: StructuredSection[];
	/** Top-level / flattened "Yang harus ada" checklist. */
	requirements: StructuredRequirement[];
	examples?: string[];
	tips?: string[];
};

export const EMPTY_STRUCTURED: StructuredAssignmentContent = {
	summary: '',
	taskType: '',
	responseFormat: 'writing',
	sections: [],
	requirements: [],
};

// ── Tolerant parsing (PocketBase json columns) ──────────────

function str(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback = false): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function strList(value: unknown, max: number, itemMax: number): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => str(item).trim())
		.filter((item) => item.length > 0)
		.map((item) => (item.length > itemMax ? `${item.slice(0, itemMax - 1)}…` : item))
		.slice(0, max);
}

function parseRequirement(value: unknown, index: number): StructuredRequirement | null {
	if (!value || typeof value !== 'object') return null;
	const row = value as Record<string, unknown>;
	const text = str(row.text).trim();
	if (!text) return null;
	const quantity = num(row.quantity, NaN);
	return {
		id: str(row.id, `r${index + 1}`).trim() || `r${index + 1}`,
		text: text.slice(0, 300),
		required: bool(row.required, true),
		quantity: Number.isFinite(quantity) && quantity > 0 ? Math.round(quantity) : null,
		category: str(row.category).trim().slice(0, 60) || undefined,
	};
}

function parseSection(value: unknown, index: number): StructuredSection | null {
	if (!value || typeof value !== 'object') return null;
	const row = value as Record<string, unknown>;
	const title = str(row.title).trim();
	const description = str(row.description).trim();
	const requirements = Array.isArray(row.requirements)
		? (row.requirements as unknown[])
				.map((item, i) => parseRequirement(item, i))
				.filter((item): item is StructuredRequirement => Boolean(item))
		: [];
	// A section with no title, no description, and no requirements is malformed
	// and dropped — never silently kept as an empty card.
	if (!title && !description && requirements.length === 0) return null;
	return {
		id: str(row.id, `s${index + 1}`).trim() || `s${index + 1}`,
		title: title.slice(0, 200),
		description: description.slice(0, 2000),
		requirements,
		examples: strList(row.examples, 8, 500),
		tips: strList(row.tips, 6, 400).length ? strList(row.tips, 6, 400) : undefined,
	};
}

/**
 * Parse a stored `structured` value into a well-formed
 * `StructuredAssignmentContent`, or `null` when none is present / unreadable.
 * Tolerant of stale or partial data — never throws.
 */
export function parseStructuredContent(value: unknown): StructuredAssignmentContent | null {
	if (!value) return null;
	let raw: unknown = value;
	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw);
		} catch {
			return null;
		}
	}
	if (!raw || typeof raw !== 'object') return null;
	const row = raw as Record<string, unknown>;
	const responseFormat = str(row.responseFormat);
	const sections = Array.isArray(row.sections)
		? (row.sections as unknown[])
				.map((item, i) => parseSection(item, i))
				.filter((item): item is StructuredSection => Boolean(item))
		: [];
	const requirements = Array.isArray(row.requirements)
		? (row.requirements as unknown[])
				.map((item, i) => parseRequirement(item, i))
				.filter((item): item is StructuredRequirement => Boolean(item))
		: [];
	const summary = str(row.summary).trim();
	// A structured payload with no summary, no sections, and no requirements is
	// treated as absent so legacy assignments fall back to the text renderer.
	if (!summary && sections.length === 0 && requirements.length === 0) return null;
	const duration = num(row.duration, NaN);
	return {
		summary: summary.slice(0, 1000),
		taskType: str(row.taskType).trim().slice(0, 80),
		responseFormat: responseFormat === 'speaking' ? 'speaking' : 'writing',
		language: str(row.language).trim().slice(0, 80) || undefined,
		level: str(row.level).trim().slice(0, 40) || undefined,
		duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
		submissionMethod: str(row.submissionMethod).trim().slice(0, 120) || undefined,
		sections,
		requirements,
		examples: strList(row.examples, 8, 500).length ? strList(row.examples, 8, 500) : undefined,
		tips: strList(row.tips, 6, 400).length ? strList(row.tips, 6, 400) : undefined,
	};
}

// ── Validation ──────────────────────────────────────────────

export type StructuredValidation = {
	ok: boolean;
	errors: string[];
};

/**
 * Validate AI-generated structured content BEFORE it is saved. Invalid
 * content is rejected — never silently repaired in a way that could change
 * the lecturer's intended task. Safe, deterministic normalizations (clipping,
 * dropping empty rows) already happen in `parseStructuredContent`; this
 * checks semantic validity.
 */
export function validateStructuredContent(
	content: StructuredAssignmentContent | null,
	kind: StructuredKind,
): StructuredValidation {
	const errors: string[] = [];
	if (!content) {
		return { ok: false, errors: ['Konten terstruktur kosong.'] };
	}
	if (!content.summary.trim()) {
		errors.push('Ringkasan tugas ("Tugas kamu") wajib diisi.');
	}
	if (kind === 'speaking' && content.responseFormat !== 'speaking') {
		errors.push('Format respons harus "speaking" untuk tugas berbicara.');
	}
	if (kind === 'writing' && content.responseFormat !== 'writing') {
		errors.push('Format respons harus "writing" untuk tugas menulis.');
	}
	// Duplicate requirement ids within the flattened checklist.
	const ids = new Set<string>();
	for (const req of content.requirements) {
		if (ids.has(req.id)) {
			errors.push(`Id persyaratan duplikat: ${req.id}.`);
		} else {
			ids.add(req.id);
		}
		if (!req.text.trim()) {
			errors.push('Ada persyaratan tanpa teks.');
		}
	}
	// Sections: no empty sections, no duplicate ids.
	const sectionIds = new Set<string>();
	for (const section of content.sections) {
		if (sectionIds.has(section.id)) {
			errors.push(`Id bagian duplikat: ${section.id}.`);
		} else {
			sectionIds.add(section.id);
		}
		if (!section.title.trim() && !section.description.trim() && section.requirements.length === 0) {
			errors.push('Ada bagian kosong tanpa judul, deskripsi, atau persyaratan.');
		}
	}
	return { ok: errors.length === 0, errors };
}

// ── Sanitization (model output → safe stored shape) ─────────

const clip = (text: string, max: number) => {
	const clean = text.replace(/\s+/g, ' ').trim();
	return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

/**
 * Coerce a raw model reply into a safe `StructuredAssignmentContent`. Every
 * string is clipped, every number clamped, empty rows dropped, and duplicate
 * ids de-duplicated. This is the only normalization applied to AI output —
 * it never invents requirements, changes quantities the lecturer set, or
 * fills missing summaries.
 */
export function sanitizeStructuredContent(
	raw: unknown,
	kind: StructuredKind,
): StructuredAssignmentContent | null {
	if (!raw || typeof raw !== 'object') return null;
	const row = raw as Record<string, unknown>;

	const parseReq = (value: unknown, index: number, prefix: string): StructuredRequirement | null => {
		if (!value || typeof value !== 'object') return null;
		const r = value as Record<string, unknown>;
		const text = clip(str(r.text), 300);
		if (!text) return null;
		const q = num(r.quantity, NaN);
		const id = clip(str(r.id, `${prefix}${index + 1}`), 40) || `${prefix}${index + 1}`;
		return {
			id,
			text,
			required: bool(r.required, true),
			quantity: Number.isFinite(q) && q > 0 ? Math.min(999, Math.round(q)) : null,
			category: clip(str(r.category), 60) || undefined,
		};
	};

	const sections: StructuredSection[] = [];
	const sectionRows = Array.isArray(row.sections) ? (row.sections as unknown[]) : [];
	const usedSectionIds = new Set<string>();
	const usedReqIds = new Set<string>();
	sectionRows.forEach((value, i) => {
		if (!value || typeof value !== 'object') return;
		const s = value as Record<string, unknown>;
		const title = clip(str(s.title), 200);
		const description = clip(str(s.description), 2000);
		const reqs = Array.isArray(s.requirements)
			? (s.requirements as unknown[])
					.map((rv, ri) => parseReq(rv, ri, `s${i + 1}r`))
					.filter((item): item is StructuredRequirement => Boolean(item))
			: [];
		if (!title && !description && reqs.length === 0) return;
		let id = clip(str(s.id, `s${i + 1}`), 40) || `s${i + 1}`;
		while (usedSectionIds.has(id)) id = `${id}-${i}`;
		usedSectionIds.add(id);
		// De-duplicate requirement ids across sections + top-level.
		const dedupedReqs = reqs.map((req) => {
			let rid = req.id;
			while (usedReqIds.has(rid)) rid = `${rid}-${i}`;
			usedReqIds.add(rid);
			return { ...req, id: rid };
		});
		sections.push({
			id,
			title,
			description,
			requirements: dedupedReqs,
			examples: strList(s.examples, 8, 500),
			tips: strList(s.tips, 6, 400).length ? strList(s.tips, 6, 400) : undefined,
		});
	});

	const requirements: StructuredRequirement[] = [];
	const reqRows = Array.isArray(row.requirements) ? (row.requirements as unknown[]) : [];
	reqRows.forEach((value, i) => {
		const req = parseReq(value, i, 'r');
		if (!req) return;
		let id = req.id;
		while (usedReqIds.has(id)) id = `${id}-${i}`;
		usedReqIds.add(id);
		requirements.push({ ...req, id });
	});

	const summary = clip(str(row.summary), 1000);
	const duration = num(row.duration, NaN);
	const content: StructuredAssignmentContent = {
		summary,
		taskType: clip(str(row.taskType), 80),
		responseFormat: kind === 'speaking' ? 'speaking' : 'writing',
		language: clip(str(row.language), 80) || undefined,
		level: clip(str(row.level), 40) || undefined,
		duration: Number.isFinite(duration) && duration > 0 ? Math.min(600, Math.round(duration)) : null,
		submissionMethod: clip(str(row.submissionMethod), 120) || undefined,
		sections,
		requirements,
		examples: strList(row.examples, 8, 500).length ? strList(row.examples, 8, 500) : undefined,
		tips: strList(row.tips, 6, 400).length ? strList(row.tips, 6, 400) : undefined,
	};
	// Treat an effectively-empty payload as absent.
	if (!summary && sections.length === 0 && requirements.length === 0) return null;
	return content;
}

// ── Checklist (deterministic "Yang harus ada") ──────────────

export type ChecklistItem = {
	id: string;
	label: string;
	detail: string;
	quantity?: number | null;
};

/**
 * Build the deterministic "Yang harus ada" checklist from the stored
 * structured content. Top-level requirements first, then per-section
 * requirements. Never re-analyzes the assignment with an AI model.
 */
export function structuredChecklist(content: StructuredAssignmentContent | null): ChecklistItem[] {
	if (!content) return [];
	const items: ChecklistItem[] = [];
	const seen = new Set<string>();
	const push = (req: StructuredRequirement) => {
		const label = req.text.trim();
		if (!label) return;
		const key = label.toLocaleLowerCase('id-ID');
		if (seen.has(key)) return;
		seen.add(key);
		items.push({
			id: req.id,
			label,
			detail: label,
			quantity: req.quantity ?? null,
		});
	};
	for (const req of content.requirements) push(req);
	for (const section of content.sections) {
		for (const req of section.requirements) push(req);
	}
	return items.slice(0, 12);
}

/** True when an assignment's taskConfig carries structured content. */
export function hasStructuredContent(
	configValue: unknown,
	kind: StructuredKind | null,
): configValue is { structured?: unknown } {
	if (!kind) return false;
	return parseStructuredContentFromConfig(configValue) !== null;
}

/** Read structured content from a stored taskConfig value (any shape). */
export function parseStructuredContentFromConfig(configValue: unknown): StructuredAssignmentContent | null {
	if (!configValue) return null;
	let raw: unknown = configValue;
	if (typeof raw === 'string') {
		try {
			raw = JSON.parse(raw);
		} catch {
			return null;
		}
	}
	if (!raw || typeof raw !== 'object') return null;
	const obj = raw as Record<string, unknown>;
	if (!('structured' in obj)) return null;
	return parseStructuredContent(obj.structured);
}
