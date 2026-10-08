/**
 * Presentation-only summary of an assignment. Every sentence and chip is
 * taken from text the lecturer already stored — nothing is invented.
 */

import {
	parseStructuredContentFromConfig,
	structuredChecklist,
	type StructuredAssignmentContent,
} from '@/lib/structured-assignment';
import { translate, type Language } from '@/lib/i18n';

export type WorksheetChip = { id: string; label: string; detail: string };
export type WorksheetSection = {
	title: string;
	body: string;
	examples: string[];
};

export type WorksheetBrief = {
	summary: string;
	chips: WorksheetChip[];
	sections: WorksheetSection[];
	fullText: string;
};

function sentences(text: string) {
	return text
		.replace(/\s+/g, ' ')
		.split(/(?<=[.!?])\s+/)
		.map((part) => part.trim())
		.filter((part) => part.length > 8);
}

function clip(text: string, max = 220) {
	const clean = text.replace(/\s+/g, ' ').trim();
	if (clean.length <= max) return clean;
	return `${clean.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

function quotedExamples(text: string) {
	const quotes = [...text.matchAll(/[„"“«']([^"”»']{3,80})[“"”»']/g)].map((m) => m[1].trim());
	const questions = text
		.split(/\n+/)
		.map((line) => line.replace(/^[-•*]\s*/, '').trim())
		.filter((line) => /^(wie|was|wo|wann|warum|wer|haben|ist|sind)\b/i.test(line) && line.length < 80);
	return [...new Set([...quotes, ...questions])].slice(0, 4);
}

function chipFromLine(line: string, index: number): WorksheetChip | null {
	const clean = line.replace(/^[-•*\d.)\s]+/, '').trim();
	if (clean.length < 3 || clean.length > 90) return null;
	const minimal = clean.match(/minimal\s+(\d+)\s+(.{2,40})/i);
	if (minimal) {
		const noun = minimal[2].replace(/[.,;:].*$/, '').trim();
		return { id: `min-${index}`, label: `${minimal[1]} ${noun}`, detail: clean };
	}
	const count = clean.match(/^(\d+)\s+([a-zA-ZäöüÄÖÜß].{1,28})$/);
	if (count) return { id: `n-${index}`, label: `${count[1]} ${count[2]}`, detail: clean };
	const short = clean.length <= 42 ? clean : clip(clean, 42);
	return { id: `c-${index}`, label: short.replace(/[.]$/, ''), detail: clean };
}

function uniqueChips(chips: WorksheetChip[]) {
	const seen = new Set<string>();
	const out: WorksheetChip[] = [];
	for (const chip of chips) {
		const key = chip.label.toLocaleLowerCase('id-ID');
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(chip);
		if (out.length >= 6) break;
	}
	return out;
}

const BUILTIN_RUBRIC_KEYS: Record<string, string> = {
	'task fulfilment': 'worksheet.rubric.taskFulfilment',
	'task fulfillment': 'worksheet.rubric.taskFulfilment',
	'comprehensibility and coherence': 'worksheet.rubric.comprehensibility',
	'lexical appropriateness': 'worksheet.rubric.lexical',
	'grammatical and orthographic validity': 'worksheet.rubric.grammarOrthography',
	'error identification': 'worksheet.rubric.errorIdentification',
	'accuracy of corrections': 'worksheet.rubric.correctionAccuracy',
};

/** Translate only known built-in criteria; custom lecturer wording stays intact. */
function localizeRubricLabel(value: string, language?: Language) {
	if (!language) return value;
	const match = value.trim().match(/^(?:rubrik|rubric|bewertungskriterium)\s*:\s*(.+)$/i);
	const source = (match?.[1] || value).trim();
	const key = BUILTIN_RUBRIC_KEYS[source.toLocaleLowerCase('en-US')];
	if (!key) return value;
	const label = translate(language, key);
	return match ? `${translate(language, 'worksheet.rubric.prefix')} ${label}` : label;
}

function sectionsFromHeadings(text: string): WorksheetSection[] {
	const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
	const heads = lines
		.map((line, index) => ({ line, index }))
		.filter(({ line }) => /^(#{1,3}\s+.+|.+:)$/.test(line) && line.length < 60);
	if (heads.length < 2) return [];
	return heads.map((head, i) => {
		const start = head.index + 1;
		const end = heads[i + 1]?.index ?? lines.length;
		const body = lines.slice(start, end).join(' ');
		const title = head.line.replace(/^#+\s*/, '').replace(/:$/, '').trim();
		return { title, body: clip(body, 280), examples: quotedExamples(body) };
	}).filter((section) => section.body);
}

export function buildWorksheetBrief(input: {
	instructions?: string;
	requirements?: string;
	prompt?: string;
	criteria?: string[];
	checklist?: string[];
	/** Signed-in user's interface language, used only for known built-in rubric labels. */
	language?: Language;
	/** Structured assignment content (AI-generated). When present, the summary
	 *  and "Yang harus ada" chips come deterministically from it. */
	structured?: StructuredAssignmentContent | null;
	/** Raw taskConfig value to read structured content from (fallback). */
	taskConfig?: unknown;
}): WorksheetBrief | null {
	const structured = input.structured ?? parseStructuredContentFromConfig(input.taskConfig);
	const instructions = (input.instructions || '').trim();
	const requirements = (input.requirements || '').trim();
	const prompt = (input.prompt || '').trim();
	const source = [prompt, instructions, requirements].filter(Boolean).join('\n\n');

	// Structured content path: deterministic summary + checklist, no AI
	// re-analysis. Full text still comes from the lecturer's stored fields so
	// progressive disclosure ("Lihat petunjuk lengkap") keeps the originals.
	if (structured) {
		const chips = structuredChecklist(structured).map((item) => ({
			id: item.id,
			label: localizeRubricLabel(item.label, input.language),
			detail: localizeRubricLabel(item.detail, input.language),
		}));
		const sections: WorksheetSection[] = structured.sections.map((section) => ({
			title: section.title,
			body: section.description,
			examples: section.examples,
		}));
		return {
			summary: structured.summary || clip(source, 220),
			chips,
			sections: sections.slice(0, 4),
			fullText: source || structured.summary,
		};
	}

	if (!source) return null;

	const leadSource = prompt || instructions;
	const lead = sentences(leadSource).slice(0, 2).join(' ');
	const summary = clip(lead || leadSource || requirements, 220);

	const fromCheck = (input.checklist || [])
		.map((line, index) => chipFromLine(line, 200 + index))
		.filter((chip): chip is WorksheetChip => Boolean(chip));
	const fromReq = requirements
		.split(/\n+|[;•]/)
		.map((line, index) => chipFromLine(line, index))
		.filter((chip): chip is WorksheetChip => Boolean(chip));
	const fromCriteria = (input.criteria || [])
		.map((label) => label.trim())
		.filter((label) => label.length > 1 && label.length < 48)
		.map((label, index) => ({ id: `rubric-${index}`, label, detail: label }));
	const fromPrompt = fromCheck.length || fromReq.length
		? []
		: [...(prompt || instructions).matchAll(/minimal\s+\d+\s+[^.,;\n]{2,40}/gi)].map((match, index) =>
			chipFromLine(match[0], 100 + index),
		).filter((chip): chip is WorksheetChip => Boolean(chip));
	const chips = uniqueChips(
		fromCheck.length ? fromCheck : fromReq.length ? fromReq : [...fromCriteria, ...fromPrompt],
	).map((chip) => ({
		...chip,
		label: localizeRubricLabel(chip.label, input.language),
		detail: localizeRubricLabel(chip.detail, input.language),
	}));

	const sections = sectionsFromHeadings(instructions || prompt);
	const resolved = sections.length >= 2 ? sections : [];

	return {
		summary,
		chips,
		sections: resolved.slice(0, 4),
		fullText: source,
	};
}
