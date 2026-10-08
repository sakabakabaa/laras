import type { Assignment, AssignmentSubmission } from '@/lib/assignments';
import { activityTypeOf } from '@/lib/assignments';
import type { ClassSession, CourseRosterEntry, StructuredItem } from '@/lib/learning';

export type AnalyticsAttempt = {
	id: string;
	assignment: string;
	area: string;
	identityKey: string;
	owner: string;
	participantName: string;
	created: string;
	level?: number;
};

export type OwnerIdentity = { name: string; nim: string };

export type RosterAccount = {
	rosterId: string;
	nim: string;
	name: string;
	userId: string;
	enrolled: boolean;
};

const COLLECTED = new Set(['submitted', 'late', 'graded', 'revision']);

export function isCollected(status: string) {
	return COLLECTED.has(status);
}

function weekOf(session: ClassSession | undefined) {
	const week = Number(session?.week || 0);
	return week > 0 ? week : 0;
}

export type CourseAnalyticsInput = {
	assignments: Assignment[];
	submissions: Pick<AssignmentSubmission, 'id' | 'assignment' | 'owner' | 'status' | 'grade' | 'updated' | 'created'>[];
	sessions: ClassSession[];
	subCpmks: StructuredItem[];
	roster: CourseRosterEntry[];
	accounts: RosterAccount[];
	attempts: AnalyticsAttempt[];
	identities: Record<string, OwnerIdentity>;
	now: number;
	/** When set, only assignments/sessions in this week are counted. 0 = whole semester. */
	week: number;
};

export type WeekBar = {
	week: number;
	label: string;
	materi: number;
	tugas: number;
	penilaian: number;
	hasSession: boolean;
};

export type StudentAttention = {
	key: string;
	name: string;
	initials: string;
	completion: number;
	missing: number;
	ungraded: number;
	graded: number;
	lastLabel: string;
	tone: 'bad' | 'mid' | 'ok';
};

export type SubCpmkRow = {
	id: string;
	code: string;
	description: string;
	activities: number;
	percent: number | null;
	status: 'baik' | 'cukup' | 'perhatian' | 'empty';
};

export type DistRow = {
	id: string;
	title: string;
	onTime: number;
	late: number;
	missing: number;
	total: number;
	collected: number;
};

export type TopicRow = {
	label: string;
	people: number;
	checks: number;
	bars: number[];
};

export type AlertItem = {
	id: string;
	tone: 'danger' | 'warn' | 'info';
	title: string;
	detail: string;
	href?: string;
	action?: string;
};

export type AnalyticsModel = {
	studentTotal: number;
	active: number;
	inactive: number;
	collectionRate: number | null;
	collected: number;
	expected: number;
	gradedRate: number | null;
	graded: number;
	submittedCount: number;
	sessionTotal: number;
	sessionsDone: number;
	sessionsUpcoming: number;
	taskTotal: number;
	taskGraded: number;
	taskOpen: number;
	weeks: WeekBar[];
	subCpmk: SubCpmkRow[];
	distribution: DistRow[];
	attention: StudentAttention[];
	topics: TopicRow[];
	alerts: AlertItem[];
	hasAnySignal: boolean;
};

function pct(n: number, d: number) {
	if (!d) return 0;
	return Math.round((n / d) * 100);
}

function initials(name: string) {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (!parts.length) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function relLabel(iso: string, now: number) {
	if (!iso || !now) return '';
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return '';
	const days = Math.floor((now - t) / 86_400_000);
	if (days <= 0) return 'Hari ini';
	if (days === 1) return '1 hari lalu';
	return `${days} hari lalu`;
}

export function buildCourseAnalytics(input: CourseAnalyticsInput): AnalyticsModel {
	const sessionById = new Map(input.sessions.map((s) => [s.id, s]));
	const inWeek = (sessionId: string) => {
		if (!input.week) return true;
		return weekOf(sessionById.get(sessionId)) === input.week;
	};

	const formal = input.assignments.filter(
		(a) => activityTypeOf(a) === 'formal' && a.status !== 'draft' && a.status !== 'archived' && inWeek(a.session),
	);
	const formalIds = new Set(formal.map((a) => a.id));
	const subs = input.submissions.filter((s) => formalIds.has(s.assignment));

	const userByNim = new Map(input.accounts.filter((a) => a.userId).map((a) => [a.nim, a]));
	const nameByUser = new Map<string, { name: string; nim: string }>();
	for (const [subId, ident] of Object.entries(input.identities)) {
		const sub = input.submissions.find((s) => s.id === subId);
		if (sub?.owner && ident.name) nameByUser.set(sub.owner, ident);
	}

	const rosterPeople = input.roster.map((row) => {
		const account = userByNim.get(row.nim.trim());
		return {
			key: account?.userId || `roster:${row.id}`,
			userId: account?.userId || '',
			name: row.name,
			nim: row.nim,
			enrolled: Boolean(account?.enrolled),
			hasAccount: Boolean(account?.userId),
		};
	});

	const participantIds = new Set<string>();
	for (const person of rosterPeople) {
		if (person.userId) participantIds.add(person.userId);
	}
	if (participantIds.size === 0) {
		for (const sub of subs) if (sub.owner) participantIds.add(sub.owner);
	}
	const classSize = participantIds.size || rosterPeople.length;

	const active = rosterPeople.filter((p) => p.enrolled || p.hasAccount).length;
	const inactive = Math.max(0, rosterPeople.length - active);

	let collected = 0;
	let graded = 0;
	let submittedCount = 0;
	const byAssignment = new Map<string, typeof subs>();
	for (const sub of subs) {
		const list = byAssignment.get(sub.assignment) || [];
		list.push(sub);
		byAssignment.set(sub.assignment, list);
		if (isCollected(sub.status)) {
			collected += 1;
			submittedCount += 1;
		}
		if (sub.status === 'graded' || (sub.grade != null && !Number.isNaN(sub.grade))) graded += 1;
	}
	const expected = classSize * formal.length;
	const collectionRate = expected ? pct(collected, expected) : null;
	const gradedRate = submittedCount ? pct(graded, submittedCount) : null;

	const sessions = input.week
		? input.sessions.filter((s) => weekOf(s) === input.week)
		: input.sessions;
	const sessionsDone = sessions.filter((s) => s.completed).length;

	const weeks = [...new Set(input.sessions.map((s) => weekOf(s)).filter((w) => w > 0))]
		.sort((a, b) => a - b)
		.map((week) => {
			const weekSessions = input.sessions.filter((s) => weekOf(s) === week);
			const withMaterial = weekSessions.filter((s) => (s.learningMaterial || s.topic || '').trim()).length;
			const weekAssignments = input.assignments.filter(
				(a) => activityTypeOf(a) === 'formal' && a.status !== 'draft' && weekOf(sessionById.get(a.session)) === week,
			);
			const weekSubs = input.submissions.filter((s) => weekAssignments.some((a) => a.id === s.assignment));
			const weekExpected = (participantIds.size || rosterPeople.length) * weekAssignments.length;
			const weekCollected = weekSubs.filter((s) => isCollected(s.status)).length;
			const weekGraded = weekSubs.filter((s) => s.status === 'graded').length;
			return {
				week,
				label: `Week ${week}`,
				materi: weekSessions.length ? pct(withMaterial, weekSessions.length) : 0,
				tugas: weekExpected ? pct(weekCollected, weekExpected) : 0,
				penilaian: weekCollected ? pct(weekGraded, weekCollected) : 0,
				hasSession: weekSessions.length > 0,
			};
		});

	const subCpmk = input.subCpmks.map((item) => {
		const linked = formal.filter((a) => a.subCpmk === item.id);
		const linkedSubs = subs.filter((s) => linked.some((a) => a.id === s.assignment) && s.grade != null);
		const percent = linkedSubs.length
			? Math.round(linkedSubs.reduce((sum, s) => sum + Number(s.grade), 0) / linkedSubs.length)
			: null;
		const status: SubCpmkRow['status'] =
			percent == null ? 'empty' : percent >= 75 ? 'baik' : percent >= 60 ? 'cukup' : 'perhatian';
		return {
			id: item.id,
			code: item.code || '—',
			description: item.description,
			activities: linked.length,
			percent,
			status,
		};
	});

	const distribution: DistRow[] = formal.map((assignment) => {
		const rows = byAssignment.get(assignment.id) || [];
		const seen = new Set<string>();
		let onTime = 0;
		let late = 0;
		for (const row of rows) {
			if (!row.owner || seen.has(row.owner) || !isCollected(row.status)) continue;
			seen.add(row.owner);
			const submittedAt = new Date(row.updated || row.created).getTime();
			const deadline = assignment.deadline ? new Date(assignment.deadline).getTime() : 0;
			const overdue = row.status === 'late' || (deadline > 0 && submittedAt > deadline);
			if (overdue) late += 1;
			else onTime += 1;
		}
		const total = classSize || seen.size;
		const collectedN = onTime + late;
		return {
			id: assignment.id,
			title: assignment.title,
			onTime,
			late,
			missing: Math.max(0, total - collectedN),
			total,
			collected: collectedN,
		};
	});

	const attention: StudentAttention[] = [];
	const people =
		rosterPeople.length > 0
			? rosterPeople.map((p) => ({ key: p.userId || p.key, name: p.name, userId: p.userId }))
			: [...nameByUser.entries()].map(([userId, ident]) => ({
					key: userId,
					name: ident.name,
					userId,
				}));

	for (const person of people) {
		if (!person.userId && rosterPeople.length) {
			attention.push({
				key: person.key,
				name: person.name,
				initials: initials(person.name),
				completion: 0,
				missing: formal.length,
				ungraded: 0,
				graded: 0,
				lastLabel: 'Belum aktif',
				tone: 'bad',
			});
			continue;
		}
		const mine = subs.filter((s) => s.owner === person.userId);
		const done = new Set(mine.filter((s) => isCollected(s.status)).map((s) => s.assignment));
		const gradedN = mine.filter((s) => s.status === 'graded').length;
		const missing = Math.max(0, formal.length - done.size);
		const completion = formal.length ? pct(done.size, formal.length) : 0;
		const last = mine.map((s) => s.updated || s.created).sort().at(-1) || '';
		attention.push({
			key: person.key,
			name: person.name,
			initials: initials(person.name),
			completion,
			missing,
			ungraded: Math.max(0, done.size - gradedN),
			graded: gradedN,
			lastLabel: relLabel(last, input.now) || (done.size ? 'Ada aktivitas' : 'Belum mengumpulkan'),
			tone: completion < 50 ? 'bad' : completion < 80 ? 'mid' : 'ok',
		});
	}
	attention.sort((a, b) => a.completion - b.completion || b.missing - a.missing);

	const topicMap = new Map<string, { label: string; people: Set<string>; checks: number; weeks: Map<number, number> }>();
	const weekIds = new Set(formal.map((a) => a.id));
	for (const attempt of input.attempts) {
		if (input.week && !weekIds.has(attempt.assignment) && formalIds.size) {
			if (!formalIds.has(attempt.assignment)) continue;
		}
		if (formalIds.size && !input.assignments.some((a) => a.id === attempt.assignment && inWeek(a.session))) continue;
		const label = attempt.area.trim().replace(/\s+/g, ' ');
		if (!label) continue;
		const key = label.toLowerCase();
		let row = topicMap.get(key);
		if (!row) {
			row = { label, people: new Set(), checks: 0, weeks: new Map() };
			topicMap.set(key, row);
		}
		row.checks += 1;
		row.people.add(attempt.identityKey || attempt.owner || attempt.id);
		const created = new Date(attempt.created);
		const bucket = Number.isNaN(created.getTime()) ? 0 : created.getUTCMonth() * 5 + Math.ceil(created.getUTCDate() / 7);
		row.weeks.set(bucket, (row.weeks.get(bucket) || 0) + 1);
	}
	const topics: TopicRow[] = [...topicMap.values()]
		.sort((a, b) => b.people.size - a.people.size || b.checks - a.checks)
		.slice(0, 6)
		.map((row) => {
			const values = [...row.weeks.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
			const bars = values.length ? values.slice(-6) : [row.checks];
			return { label: row.label, people: row.people.size, checks: row.checks, bars };
		});

	const alerts: AlertItem[] = [];
	const worst = distribution.filter((d) => d.missing > 0).sort((a, b) => b.missing - a.missing)[0];
	if (worst) {
		const deadline = formal.find((a) => a.id === worst.id)?.deadline;
		alerts.push({
			id: `miss-${worst.id}`,
			tone: 'danger',
			title: `${worst.missing} mahasiswa belum mengumpulkan ${worst.title}`,
			detail: deadline ? `Batas pengumpulan: ${new Date(deadline).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC` : 'Belum ada batas waktu.',
			action: 'Lihat mahasiswa',
		});
	}
	const ungraded = subs.filter((s) => isCollected(s.status) && s.status !== 'graded').length;
	if (ungraded > 0) {
		alerts.push({
			id: 'ungraded',
			tone: 'warn',
			title: `${ungraded} submission masih perlu dinilai`,
			detail: formal
				.filter((a) => (byAssignment.get(a.id) || []).some((s) => isCollected(s.status) && s.status !== 'graded'))
				.slice(0, 3)
				.map((a) => a.title)
				.join(', ') || 'Tugas formal',
			action: 'Lihat penilaian',
		});
	}
	const bare = input.sessions.find((s) => !(s.learningMaterial || s.topic || '').trim() && !s.completed);
	if (bare) {
		alerts.push({
			id: `materi-${bare.id}`,
			tone: 'info',
			title: `Materi ${bare.week ? `Minggu ${bare.week}` : bare.title} belum diisi`,
			detail: 'Pastikan materi dan aktivitas sudah tersedia untuk mahasiswa.',
			action: 'Buka pertemuan',
		});
	}

	const taskGraded = formal.filter((a) => {
		const rows = byAssignment.get(a.id) || [];
		return rows.some((s) => s.status === 'graded');
	}).length;

	return {
		studentTotal: classSize,
		active: input.accounts.length ? active : classSize,
		inactive: input.accounts.length ? inactive : 0,
		collectionRate,
		collected,
		expected,
		gradedRate,
		graded,
		submittedCount,
		sessionTotal: sessions.length,
		sessionsDone,
		sessionsUpcoming: Math.max(0, sessions.length - sessionsDone),
		taskTotal: formal.length,
		taskGraded,
		taskOpen: Math.max(0, formal.length - taskGraded),
		weeks,
		subCpmk,
		distribution,
		attention: attention.filter((s) => s.tone !== 'ok' || s.missing > 0).slice(0, 6),
		topics,
		alerts,
		hasAnySignal: Boolean(formal.length || sessions.length || input.roster.length || input.subCpmks.length),
	};
}
