/**
 * Lecturer gradebook types and pure calculation helpers.
 *
 * The final grade is a weighted average of component scores. Each component
 * score is normalized to 0–100 by its `maxScore` before weighting, so a
 * component graded out of 30 contributes proportionally. Components with no
 * weight (0) are informational only and never affect the final grade. A
 * student with no graded components has no final grade (null) — never 0.
 *
 * An empty grade is NOT zero: a missing entry is "belum dinilai", an
 * explicit 0 is a real grade. The two are kept distinct everywhere.
 */
import type { Assignment, AssignmentSubmission } from '@/lib/assignments';

export type GradeComponentKind = 'manual' | 'assignment';

export type GradeComponent = {
	id: string;
	owner: string;
	course: string;
	name: string;
	description: string;
	maxScore: number;
	weight: number;
	kind: GradeComponentKind;
	assignment: string;
	order: number;
	status: 'active' | 'archived';
	created: string;
	updated: string;
	expand?: { assignment?: Assignment };
};

export type GradeEntry = {
	id: string;
	owner: string;
	component: string;
	student: string;
	value: number | null;
	source: 'manual' | 'assignment' | '';
	note: string;
	created: string;
	updated: string;
};

export type GradeOverride = {
	id: string;
	owner: string;
	course: string;
	student: string;
	value: number;
	note: string;
	created: string;
	updated: string;
};

export type GradePublication = {
	id: string;
	owner: string;
	course: string;
	publishedAt: string;
	note: string;
	created: string;
	updated: string;
};

export type GradebookStudent = {
	id: string;
	name: string;
	email: string;
	nim: string;
	section: string;
};

/** Letter grade scale (Indonesian higher-ed standard). null when no score. */
export function letterGrade(score: number | null | undefined): string | null {
	if (score == null || Number.isNaN(score)) return null;
	const s = Math.round(score);
	if (s >= 85) return 'A';
	if (s >= 80) return 'A-';
	if (s >= 75) return 'B+';
	if (s >= 70) return 'B';
	if (s >= 65) return 'B-';
	if (s >= 60) return 'C+';
	if (s >= 55) return 'C';
	if (s >= 50) return 'D';
	return 'E';
}

export const LETTER_GRADES = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'E'];

/** True when the component is active and carries weight in the final grade. */
export function componentCounts(component: GradeComponent): boolean {
	return component.status === 'active' && (component.weight ?? 0) > 0;
}

/**
 * Resolves a student's score for one component (0–100 normalized), or null
 * when not graded. Assignment-linked components read the published submission
 * grade live; manual components read the grade entry.
 */
export function componentScore(
	component: GradeComponent,
	studentId: string,
	entriesByComponent: Map<string, Map<string, GradeEntry>>,
	submissionsByAssignment: Map<string, Map<string, AssignmentSubmission>>,
): { score: number | null; source: 'manual' | 'assignment'; aiEvaluated: boolean } {
	if (component.kind === 'assignment' && component.assignment) {
		const sub = submissionsByAssignment.get(component.assignment)?.get(studentId);
		const grade = sub?.grade;
		const max = component.maxScore || 100;
		const normalized = grade == null ? null : Math.round((grade / max) * 1000) / 10;
		return {
			score: normalized,
			source: 'assignment',
			// A submission with an AI-published evaluation carries a non-empty
			// feedback that originated from the evaluation publish flow.
			aiEvaluated: Boolean(sub && sub.feedback && sub.status === 'graded'),
		};
	}
	const entryMap = entriesByComponent.get(component.id);
	const entry = entryMap?.get(studentId);
	if (!entry || entry.value == null) return { score: null, source: 'manual', aiEvaluated: false };
	const max = component.maxScore || 100;
	return {
		score: Math.round((entry.value / max) * 1000) / 10,
		source: 'manual',
		aiEvaluated: false,
	};
}

export type FinalGradeResult = {
	/** Weighted 0–100 final, or null when no graded components. */
	value: number | null;
	/** True when an override replaced the calculated value. */
	overridden: boolean;
	/** Number of counting components that have a grade. */
	gradedCount: number;
	/** Number of counting components (active + weighted). */
	countingCount: number;
	letter: string | null;
};

/**
 * Calculates the weighted final grade for one student across all counting
 * components. Returns null when no counting component has a grade yet.
 */
export function calculateFinalGrade(
	components: GradeComponent[],
	studentId: string,
	entriesByComponent: Map<string, Map<string, GradeEntry>>,
	submissionsByAssignment: Map<string, Map<string, AssignmentSubmission>>,
	override: GradeOverride | undefined,
): FinalGradeResult {
	const counting = components.filter(componentCounts);
	let weightedSum = 0;
	let weightSum = 0;
	let gradedCount = 0;
	for (const comp of counting) {
		const { score } = componentScore(comp, studentId, entriesByComponent, submissionsByAssignment);
		if (score == null) continue;
		weightedSum += score * (comp.weight ?? 0);
		weightSum += comp.weight ?? 0;
		gradedCount += 1;
	}
	const calculated = weightSum > 0 ? Math.round((weightedSum / weightSum) * 10) / 10 : null;
	const overridden = Boolean(override);
	const value = overridden ? override!.value : calculated;
	return {
		value,
		overridden,
		gradedCount,
		countingCount: counting.length,
		letter: letterGrade(value),
	};
}

/** Sum of all active component weights — used to warn when ≠ 100. */
export function totalWeight(components: GradeComponent[]): number {
	return components
		.filter((c) => c.status === 'active')
		.reduce((sum, c) => sum + (c.weight ?? 0), 0);
}

export type StudentStatus =
	| 'ungraded'
	| 'incomplete'
	| 'review'
	| 'complete'
	| 'ready'
	| 'published';

/**
 * Classifies a student's gradebook status. "published" is only set when the
 * lecturer has explicitly published results for the course (tracked separately
 * by the gradebook component); otherwise the status reflects grade completion.
 */
export function studentStatus(
	final: FinalGradeResult,
	published: boolean,
): StudentStatus {
	if (published) return 'published';
	if (final.countingCount === 0) return 'ungraded';
	if (final.gradedCount === 0) return 'ungraded';
	if (final.gradedCount < final.countingCount) return 'incomplete';
	return 'complete';
}

export const STATUS_LABEL: Record<StudentStatus, string> = {
	ungraded: 'Belum dinilai',
	incomplete: 'Belum lengkap',
	review: 'Perlu ditinjau',
	complete: 'Lengkap',
	ready: 'Siap diterbitkan',
	published: 'Sudah diterbitkan',
};

/** Parses a raw grade-cell input string into a validated number or null. */
export function parseGradeInput(
	raw: string,
	maxScore: number,
): { value: number | null; error: string } {
	const trimmed = raw.trim();
	if (trimmed === '') return { value: null, error: '' };
	const num = Number(trimmed);
	if (Number.isNaN(num)) return { value: null, error: 'Harus angka.' };
	if (num < 0) return { value: null, error: 'Nilai tidak boleh negatif.' };
	if (num > maxScore) return { value: null, error: `Maksimum ${maxScore}.` };
	return { value: num, error: '' };
}
