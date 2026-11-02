export type BuilderPreviewScenario =
	| 'automatic'
	| 'before-opening'
	| 'on-time'
	| 'late-check-in'
	| 'late-submission'
	| 'check-in-closed'
	| 'expired'
	| 'submitted'
	| 'offline';

export type BuilderPreviewPolicyInput = {
	kind: 'kelas' | 'tugas';
	now: number;
	startsAt?: string;
	endsAt?: string;
	checkInClosesAt?: string;
	lateAfterMinutes?: number;
	availableAt?: string;
	dueAt?: string;
	hardCloseAt?: string;
	allowLate?: boolean;
	scenario?: BuilderPreviewScenario;
	submitted?: boolean;
	checkedIn?: boolean;
	timeLimitExpired?: boolean;
};

export type BuilderPreviewPolicy = {
	state: Exclude<BuilderPreviewScenario, 'automatic'>;
	canCheckIn: boolean;
	canWork: boolean;
	canSubmit: boolean;
	readOnly: boolean;
	late: boolean;
	offline: boolean;
};

const timestamp = (value?: string) => {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
};

export function getBuilderPreviewPolicy(input: BuilderPreviewPolicyInput): BuilderPreviewPolicy {
	const start = timestamp(input.kind === 'kelas' ? input.startsAt : input.availableAt);
	const end = timestamp(input.kind === 'kelas' ? input.endsAt : input.allowLate ? input.hardCloseAt : input.dueAt);
	const due = timestamp(input.dueAt);
	const checkInClose = timestamp(input.checkInClosesAt);
	const explicit = input.scenario && input.scenario !== 'automatic' ? input.scenario : null;
	let state: BuilderPreviewPolicy['state'];
	if (input.submitted) state = 'submitted';
	else if (input.timeLimitExpired) state = 'expired';
	else if (explicit) state = explicit;
	else if (end !== null && input.now >= end) state = 'expired';
	else if (input.kind === 'kelas' && !input.checkedIn && checkInClose !== null && input.now > checkInClose) state = 'check-in-closed';
	else if (input.kind === 'kelas' && start !== null && input.now < start) state = 'before-opening';
	else if (input.kind === 'tugas' && start !== null && input.now < start) state = 'before-opening';
	else if (input.kind === 'kelas' && !input.checkedIn && start !== null && input.now > start + (input.lateAfterMinutes ?? 10) * 60000) state = 'late-check-in';
	else if (input.kind === 'tugas' && due !== null && input.now > due) state = 'late-submission';
	else state = 'on-time';
	const expired = state === 'expired' || Boolean(input.timeLimitExpired);
	const submitted = state === 'submitted';
	const beforeOpening = state === 'before-opening';
	const checkInClosedState = state === 'check-in-closed';
	const late = state === 'late-check-in' || state === 'late-submission';
	const canWork = !expired && !submitted && !beforeOpening && (!checkInClosedState || Boolean(input.checkedIn));
	return {
		state,
		canCheckIn: input.kind === 'kelas' && !input.checkedIn && !checkInClosedState && !expired && !submitted && !beforeOpening && state !== 'offline',
		canWork,
		canSubmit: canWork && state !== 'offline' && (input.kind === 'kelas' || !late || Boolean(input.allowLate)),
		readOnly: !canWork,
		late,
		offline: state === 'offline',
	};
}
