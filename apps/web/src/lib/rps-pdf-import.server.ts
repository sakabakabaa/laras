/**
 * Unified RPS PDF import — the single capability both the "Impor PDF" button
 * and the Asisten Dosen call. Server-only.
 *
 * Pipeline:
 *   1. EXTRACT  — local PDF → plain text + table cells (pdf-parse).
 *   2. TABLE    — deterministic weekly-schedule reconstruction. Walks the
 *                 linear text, anchors each row on its week number, and lifts
 *                 Sub-CPMK / indikator / materi / asesmen / durasi / referensi
 *                 / waktu akses / sinkron / asinkron / special-week fields
 *                 without relying on the AI. This is the fix for complex
 *                 multi-page tables with wrapped text.
 *   3. AI       — the extracted text (with the clean schedule block appended)
 *                 → Integrated AI → structured JSON for the non-table fields.
 *   4. MERGE    — deterministic sessions take precedence (they are reliable);
 *                 AI fills identity, CPL/CPMK, deskripsi, strategi, referensi,
 *                 workload, and collaborative tasks. The AI's sessions are
 *                 only used when the deterministic parser found none.
 *   5. FALLBACK — heuristic parser if AI produced nothing usable.
 *
 * Never invents data, never writes records — the caller shows the result for
 * review. Sessions with unparseable dates keep their date empty rather than
 * guessing.
 */
import logger from '@/lib/logger.server';
import { parseRpsText, buildWarnings, type ParsedRps } from './rps-parser.server';
import { extractRpsWithAi, type AiStageDiagnostics } from './rps-ai-extract.server';
import { parseWeeklySchedule } from './rps-table-parser.server';

export type ExtractDiagnostics = {
	ok: boolean;
	method: string;
	pages: number;
	chars: number;
	tables: number;
	tableChars: number;
	error?: string;
};

export type TableDiagnostics = {
	ok: boolean;
	rows: number;
	/** True when the deterministic parser found a schedule section. */
	detected: boolean;
};

export type NormalizeDiagnostics = {
	ok: boolean;
	cpl: number;
	cpmk: number;
	subCpmk: number;
	topics: number;
	assessments: number;
	sessions: number;
	collab: number;
	warnings: number;
};

export type ImportStages = {
	extract: ExtractDiagnostics;
	table: TableDiagnostics;
	ai: AiStageDiagnostics;
	normalize: NormalizeDiagnostics;
};

export type ImportResult = {
	ok: boolean;
	error?: string;
	parsed?: ParsedRps;
	source: 'ai' | 'heuristic' | 'table';
	stages: ImportStages;
};

const EMPTY_TABLE: TableDiagnostics = { ok: false, rows: 0, detected: false };
const EMPTY_NORMALIZE: NormalizeDiagnostics = {
	ok: false, cpl: 0, cpmk: 0, subCpmk: 0, topics: 0, assessments: 0, sessions: 0, collab: 0, warnings: 0,
};
const EMPTY_AI: AiStageDiagnostics = {
	ok: false, attempts: 0, inputChars: 0, outputChars: 0, repaired: false,
};

/** Stage 1: local PDF → text. Combines linear text with table cell text. */
export async function extractPdfText(buffer: Buffer): Promise<{
	text: string;
	diagnostics: ExtractDiagnostics;
}> {
	const { PDFParse } = await import('pdf-parse');
	const parser = new PDFParse({ data: new Uint8Array(buffer) });

	const diagnostics: ExtractDiagnostics = {
		ok: false, method: 'pdf-parse', pages: 0, chars: 0, tables: 0, tableChars: 0,
	};

	try {
		let bodyText = '';
		let pages = 0;
		let tables = 0;
		let tableChars = 0;

		try {
			const result = await parser.getText();
			bodyText = (result && (result as { text?: string }).text) || '';
			pages = (result && (result as { total?: number }).total) || 0;
		} catch (error) {
			logger.error(`PDF getText() failed: ${error instanceof Error ? error.message : String(error)}`);
		}

		// Pull tables separately so the model can recover structure the linear
		// stream flattens. Non-fatal — linear text alone is still usable.
		try {
			const tableResult = await parser.getTable();
			const tablePages = (tableResult && (tableResult as { pages?: unknown }).pages) || [];
			if (Array.isArray(tablePages)) {
				const blocks: string[] = [];
				for (let p = 0; p < tablePages.length; p += 1) {
					const pageTables = (tablePages[p] as { tables?: unknown[] }).tables || [];
					if (!Array.isArray(pageTables) || pageTables.length === 0) continue;
					for (let t = 0; t < pageTables.length; t += 1) {
						const rows = pageTables[t];
						if (!Array.isArray(rows) || rows.length === 0) continue;
						tables += 1;
						const lines: string[] = [];
						for (const row of rows) {
							if (!Array.isArray(row)) continue;
							const cells = row
								.map((cell) =>
									typeof cell === 'string'
										? cell
										: cell && typeof cell === 'object' && 'text' in (cell as Record<string, unknown>)
											? String((cell as Record<string, unknown>).text ?? '')
											: '',
								)
								.map((c) => c.trim())
								.filter(Boolean);
							if (cells.length) lines.push(cells.join(' | '));
						}
						if (lines.length) {
							const block = `[TABEL HALAMAN ${p + 1} #${t + 1}]\n${lines.join('\n')}`;
							blocks.push(block);
							tableChars += block.length;
						}
					}
				}
				if (blocks.length) {
					bodyText = `${bodyText}\n\n${blocks.join('\n\n')}`.trim();
				}
			}
		} catch (error) {
			logger.error(
				`PDF getTable() failed (non-fatal): ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		diagnostics.chars = bodyText.length;
		diagnostics.pages = pages;
		diagnostics.tables = tables;
		diagnostics.tableChars = tableChars;

		if (!bodyText.trim()) {
			diagnostics.ok = false;
			diagnostics.error =
				'Tidak ada teks yang bisa diekstrak. PDF mungkin hasil pindaian (gambar) — gunakan PDF berbasis teks atau isi manual.';
			return { text: '', diagnostics };
		}

		diagnostics.ok = true;
		return { text: bodyText, diagnostics };
	} finally {
		await parser.destroy().catch(() => {});
	}
}

/** Stage 3: summarize a normalized ParsedRps into count diagnostics. */
function summarize(parsed: ParsedRps): NormalizeDiagnostics {
	return {
		ok: true,
		cpl: parsed.cplItems.length,
		cpmk: parsed.cpmkItems.length,
		subCpmk: parsed.cpmkItems.reduce((n, c) => n + c.subCpmk.length, 0),
		topics: parsed.topicItems.length,
		assessments: parsed.assessmentItems.length,
		sessions: parsed.sessions.length,
		collab: parsed.collaborativeTasks.length,
		warnings: parsed.warnings.length,
	};
}

/**
 * Merges deterministic table sessions into an AI-parsed result. Deterministic
 * sessions win when they recovered more rows than the AI — they are reliable
 * because they are anchored on week numbers, not on the model reconstructing a
 * flattened table. When the AI found more sessions, the AI set is kept.
 *
 * Rich per-session fields (learningIndicator, learningMaterial, assessmentMethod,
 * accessDateTime, etc.) from the deterministic parser are merged into any AI
 * sessions that share the same week, so the AI's title/topic and the table's
 * structured fields are combined.
 */
function mergeSessions(aiParsed: ParsedRps, tableSessions: ParsedRps['sessions']): ParsedRps['sessions'] {
	if (tableSessions.length === 0) return aiParsed.sessions;
	if (aiParsed.sessions.length === 0) return tableSessions;

	// When the deterministic parser found as many or more rows, prefer it but
	// enrich with any AI title/topic the AI recovered better.
	if (tableSessions.length >= aiParsed.sessions.length) {
		const aiByWeek = new Map(aiParsed.sessions.map((s) => [s.week, s]));
		return tableSessions.map((ts) => {
			const ai = aiByWeek.get(ts.week);
			if (!ai) return ts;
			return {
				...ts,
				title: ts.title || ai.title,
				topic: ts.topic || ai.topic,
				objectives: ts.objectives || ai.objectives,
				activities: ts.activities || ai.activities,
				cplCodes: ai.cplCodes,
				cpmkCodes: ai.cpmkCodes,
				subCpmkCodes: ts.subCpmkCodes?.length ? ts.subCpmkCodes : ai.subCpmkCodes,
				topicCodes: ai.topicCodes,
				assessmentCodes: ai.assessmentCodes,
			};
		});
	}

	// AI found more rows — keep AI sessions but enrich with table fields.
	const tableByWeek = new Map(tableSessions.map((s) => [s.week, s]));
	return aiParsed.sessions.map((ai) => {
		const ts = tableByWeek.get(ai.week);
		if (!ts) return ai;
		return {
			...ai,
			learningIndicator: ts.learningIndicator || ai.learningIndicator,
			learningMaterial: ts.learningMaterial || ai.learningMaterial,
			assessmentMethod: ts.assessmentMethod || ai.assessmentMethod,
			assessmentWeight: ts.assessmentWeight ?? ai.assessmentWeight,
			synchronousMethod: ts.synchronousMethod || ai.synchronousMethod,
			asynchronousMethod: ts.asynchronousMethod || ai.asynchronousMethod,
			accessDateTime: ts.accessDateTime || ai.accessDateTime,
			specialWeekType: ts.specialWeekType || ai.specialWeekType,
			duration: ts.duration || ai.duration,
			references: ts.references || ai.references,
			subCpmkCodes: ts.subCpmkCodes?.length ? ts.subCpmkCodes : ai.subCpmkCodes,
		};
	});
}

/**
 * Deterministic recovery of CPL / CPMK / Sub-CPMK / topik / penilaian from the
 * raw extracted text. Used as a safety net when the AI returned no structured
 * items — it runs the heuristic section splitter (which now handles bare
 * "1 Menguasai…" numbering and flat "N CPMK - M Sub-CPMK X.Y:" lists) so those
 * fields are never blank just because the model stalled or truncated. Only
 * fields the caller passes in empty are filled.
 */
function recoverStructuredItems(
	rawText: string,
	existing: ParsedRps,
): Pick<ParsedRps, 'cplItems' | 'cpmkItems' | 'topicItems' | 'assessmentItems' | 'cpl' | 'cpmk' | 'syllabus' | 'assessments'> {
	const heuristic = parseRpsText(rawText);
	return {
		cplItems: existing.cplItems.length ? existing.cplItems : heuristic.cplItems,
		cpmkItems: existing.cpmkItems.length ? existing.cpmkItems : heuristic.cpmkItems,
		topicItems: existing.topicItems.length ? existing.topicItems : heuristic.topicItems,
		assessmentItems: existing.assessmentItems.length ? existing.assessmentItems : heuristic.assessmentItems,
		cpl: heuristic.cpl,
		cpmk: heuristic.cpmk,
		syllabus: heuristic.syllabus,
		assessments: heuristic.assessments,
	};
}

/**
 * The single unified import entry point. Accepts a PDF buffer and returns a
 * reviewable `ParsedRps` plus per-stage diagnostics. Never throws — failures
 * are reported through `stages` and the heuristic fallback so the caller can
 * always show something for review.
 */
export async function importRpsPdf(buffer: Buffer): Promise<ImportResult> {
	// ── Stage 1: local PDF → text ───────────────────────────────
	const { text: rawText, diagnostics: extractDiag } = await extractPdfText(buffer);
	if (!rawText.trim()) {
		return {
			ok: false,
			error: extractDiag.error,
			source: 'heuristic',
			stages: { extract: extractDiag, table: EMPTY_TABLE, ai: EMPTY_AI, normalize: EMPTY_NORMALIZE },
		};
	}

	// ── Stage 2: deterministic weekly-schedule reconstruction ──
	const tableResult = parseWeeklySchedule(rawText);
	const tableDiag: TableDiagnostics = {
		ok: tableResult.rowCount > 0,
		rows: tableResult.rowCount,
		detected: tableResult.rowCount > 0,
	};

	// Build the text the AI sees: the raw extraction PLUS a clean, structured
	// schedule block appended at the end. The structured block makes the AI's
	// session-mapping trivial, while the raw text still carries identity, CPL,
	// CPMK, deskripsi, strategi, referensi, and collaborative-task sections.
	const aiInput = tableResult.formatted
		? `${rawText}\n\n${tableResult.formatted}`
		: rawText;

	// ── Stage 3: AI text → structured JSON ──────────────────────
	const { parsed: aiParsed, diagnostics: aiDiag } = await extractRpsWithAi(aiInput);

	// ── Stage 4: merge deterministic sessions + AI fields ──────
	if (aiParsed) {
		const merged: ParsedRps = {
			...aiParsed,
			sessions: mergeSessions(aiParsed, tableResult.sessions),
		};
		// Safety net: when the model returned no structured items (or only empty
		// text fields it could not split), recover CPL / CPMK / Sub-CPMK / topik /
		// penilaian deterministically from the raw extracted text. This runs the
		// same heuristic the fallback path uses, but only fills fields the AI left
		// empty — it never overwrites model output the lecturer should review.
		if (
			merged.cplItems.length === 0 ||
			merged.cpmkItems.length === 0 ||
			merged.topicItems.length === 0 ||
			merged.assessmentItems.length === 0
		) {
			const recovered = recoverStructuredItems(rawText, merged);
			if (!merged.cplItems.length) merged.cplItems = recovered.cplItems;
			if (!merged.cpmkItems.length) merged.cpmkItems = recovered.cpmkItems;
			if (!merged.topicItems.length) merged.topicItems = recovered.topicItems;
			if (!merged.assessmentItems.length) merged.assessmentItems = recovered.assessmentItems;
			if (recovered.cpl && !merged.cpl) merged.cpl = recovered.cpl;
			if (recovered.cpmk && !merged.cpmk) merged.cpmk = recovered.cpmk;
			if (recovered.syllabus && !merged.syllabus) merged.syllabus = recovered.syllabus;
			if (recovered.assessments && !merged.assessments) merged.assessments = recovered.assessments;
		}
		merged.warnings = buildWarnings(merged);
		if (tableDiag.detected) {
			merged.warnings = [
				`Jadwal pertemuan (${tableResult.rowCount} sesi) dipetakan secara deterministik dari tabel RPS — periksa tanggal dan materi setiap sesi sebelum menyimpan.`,
				...merged.warnings,
			];
		}
		const stages: ImportStages = {
			extract: extractDiag,
			table: tableDiag,
			ai: aiDiag,
			normalize: summarize(merged),
		};
		return { ok: true, parsed: merged, source: tableDiag.detected ? 'table' : 'ai', stages };
	}

	// ── Stage 5: heuristic fallback ────────────────────────────
	const heuristic = parseRpsText(rawText);
	// Merge deterministic sessions into the heuristic result too.
	if (tableResult.sessions.length > 0) {
		heuristic.sessions = tableResult.sessions.length >= heuristic.sessions.length
			? tableResult.sessions
			: mergeSessions({ ...heuristic } as ParsedRps, tableResult.sessions);
	}
	heuristic.warnings = [
		`Pemetaan AI gagal (${aiDiag.error || 'alasan tidak diketahui'}). Menggunakan parser heuristik + pemetaan tabel deterministik — periksa hasil dengan teliti.`,
		...heuristic.warnings,
	];
	const stages: ImportStages = {
		extract: extractDiag,
		table: tableDiag,
		ai: aiDiag,
		normalize: summarize(heuristic),
	};
	return { ok: true, parsed: heuristic, source: tableDiag.detected ? 'table' : 'heuristic', stages };
}
