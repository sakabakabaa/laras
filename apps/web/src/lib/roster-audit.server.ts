/**
 * Phase 6 — course-scoped audit logging for privileged roster operations.
 *
 * Every account creation, enrollment batch, password reissue, and public-answer
 * link/conflict is recorded as a `roster_audit` row through the superuser
 * client. Logging is strictly non-fatal: a failure here must never break the
 * privileged operation it records, so all errors are swallowed. Passwords are
 * never stored — only the action, target NIM/name, outcome, and a short detail.
 *
 * Reads are owner-scoped by collection rules (only the mata kuliah owner can
 * list/view audit rows for their course), so the lecturer can review the full
 * history from the Mahasiswa roster UI.
 */
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';

export type RosterAuditAction =
	| 'roster_activated'
	| 'account_created'
	| 'password_reissued'
	| 'public_linked'
	| 'public_conflict';

export type RosterAuditOutcome = 'success' | 'skipped' | 'conflict' | 'error';

export type RosterAuditEntry = {
	course: string;
	owner: string;
	action: RosterAuditAction;
	nim?: string;
	studentName?: string;
	outcome?: RosterAuditOutcome;
	detail?: string;
	assignment?: string;
};

/**
 * Write a single audit row. Swallows all errors so the calling operation is
 * never affected. The optional `assignment` relation is only sent when set, so
 * summary rows (no assignment) and per-conflict rows (with assignment) both
 * validate cleanly.
 */
export async function logRosterAudit(entry: RosterAuditEntry): Promise<void> {
	try {
		const data: Record<string, unknown> = {
			course: entry.course,
			owner: entry.owner,
			action: entry.action,
			nim: entry.nim ?? '',
			studentName: entry.studentName ?? '',
			outcome: entry.outcome ?? 'success',
			detail: entry.detail ?? '',
		};
		if (entry.assignment) data.assignment = entry.assignment;
		await pocketbaseAdmin.createRecord('roster_audit', data);
	} catch {
		// Audit logging must never break the privileged operation it records.
	}
}

/**
 * Write many audit rows. Each row is written independently (not in one
 * transaction) so a single malformed entry cannot abort the rest. Writes run in
 * small concurrent chunks to stay within PocketBase's practical request limits
 * for a large roster activation.
 */
export async function logRosterAuditBatch(
	entries: RosterAuditEntry[],
): Promise<void> {
	const CHUNK = 25;
	for (let i = 0; i < entries.length; i += CHUNK) {
		const chunk = entries.slice(i, i + CHUNK);
		await Promise.all(chunk.map((entry) => logRosterAudit(entry)));
	}
}
