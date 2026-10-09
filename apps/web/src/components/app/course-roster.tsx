import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
	AlertTriangle,
	ClipboardCopy,
	Copy,
	Download,
	FileSpreadsheet,
	GraduationCap,
	History,
	KeyRound,
	Layers,
	Link2,
	LoaderCircle,
	MailCheck,
	Pencil,
	Plus,
	RefreshCw,
	ShieldAlert,
	Trash2,
	Upload,
	UserCheck,
	Users,
	X,
} from 'lucide-react';
import { OverflowMenu } from '@/components/app/overflow-menu';
import { AppModal } from '@/components/app/app-modal';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import type { CourseRosterEntry, CourseSection } from '@/lib/learning';
import { errorMessage } from '@/lib/learning';
import { DEFAULT_STUDENT_LANGUAGE, LANGUAGES, type Language, useT } from '@/lib/i18n';
import {
	ROSTER_NIM_MAX as NIM_MAX,
	ROSTER_NAME_MAX as NAME_MAX,
	buildRosterCsv,
	parseRosterText,
} from '@/lib/roster-csv';
import { useCourseRoster } from '@/hooks/use-course-roster';
import { useCourseSections } from '@/hooks/use-course-sections';
import { confirmDialog } from '@/components/confirm-dialog';

type ActivateOutcome =
	| { nim: string; name: string; outcome: 'created'; password: string; enrolled: boolean }
	| { nim: string; name: string; outcome: 'reused'; enrolled: boolean }
	| { nim: string; name: string; outcome: 'already_enrolled' }
	| { nim: string; name: string; outcome: 'error'; error: string };

type ActivateResult = {
	results: ActivateOutcome[];
	summary: {
		total: number;
		created: number;
		reused: number;
		alreadyEnrolled: number;
		errors: number;
		linkedPublicAnswers?: { total: number; linked: number; skipped: number; conflict: number; errors: number };
	};
};

type RosterStatusEntry = {
	rosterId: string;
	nim: string;
	name: string;
	accountExists: boolean;
	accountName: string;
	nameMismatch: boolean;
	enrolled: boolean;
	mustChangePassword: boolean;
	recoveryEmail: string;
	recoveryEmailVerified: boolean;
	linkedPublicCount: number;
	language: string;
};

type Props = {
	courseId: string;
	canEdit: boolean;
	/** Optional section (Kelas) filter — when set, only that section's students show. */
	sectionId?: string;
};

export function CourseRoster({ courseId, canEdit, sectionId }: Props) {
	const t = useT();
	const { entries, loading, error, reload } = useCourseRoster(courseId);
	const { sections } = useCourseSections(courseId);
	const hasSections = sections.length > 0;
	const [editing, setEditing] = useState<CourseRosterEntry | 'new' | null>(null);
	const [importing, setImporting] = useState(false);
	const [activating, setActivating] = useState(false);
	const [activateError, setActivateError] = useState('');
	const [activateResult, setActivateResult] = useState<ActivateResult | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [actionError, setActionError] = useState('');
	const [statusMap, setStatusMap] = useState<Map<string, RosterStatusEntry>>(
		new Map(),
	);
	const [statusLoading, setStatusLoading] = useState(false);
	const [statusError, setStatusError] = useState('');
	const [resetResult, setResetResult] = useState<{
		nim: string;
		name: string;
		password: string;
	} | null>(null);
	const [resetBusy, setResetBusy] = useState<string | null>(null);
	const [showAudit, setShowAudit] = useState(false);

	const existingNims = useMemo(
		() => new Set(entries.map((e) => e.nim.trim())),
		[entries],
	);

	// Scope the visible roster to the selected kelas. NIM uniqueness is still
	// checked across the whole course (the DB index is course + nim).
	const visibleEntries = useMemo(
		() => (sectionId ? entries.filter((e) => e.section === sectionId) : entries),
		[entries, sectionId],
	);
	const sectionName = (id?: string) => sections.find((s) => s.id === id)?.name || '';

	const activate = async () => {
		if (entries.length === 0) return;
		if (
			!(await confirmDialog({
				title: t('roster.activateDialogTitle'),
				message: t('roster.activateDialogMessage', { count: String(entries.length) }),
				variant: 'default',
				confirmLabel: t('roster.activate'),
			}))
		)
			return;
		setActivating(true);
		setActivateError('');
		try {
			const response = await fetch('/api/roster-enroll', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${pb.authStore.token}`,
				},
				body: JSON.stringify({ courseId }),
			});
			const data = (await response.json().catch(() => null)) as ActivateResult | { error?: string } | null;
			if (!response.ok) {
				throw new Error(
					(data && 'error' in data && data.error) ||
						t('roster.activateError'),
				);
			}
			setActivateResult(data as ActivateResult);
			invalidate('enrollments');
		} catch (err) {
			setActivateError(errorMessage(err));
		} finally {
			setActivating(false);
		}
	};

	const remove = async (entry: CourseRosterEntry) => {
		if (
			!(await confirmDialog({
				title: t('roster.removeDialogTitle'),
				message: t('roster.removeDialogMessage', { name: entry.name, nim: entry.nim }),
				variant: 'danger',
				confirmLabel: t('roster.remove'),
			}))
		)
			return;
		setBusyId(entry.id);
		setActionError('');
		try {
			await pb.collection('course_roster').delete(entry.id);
			invalidate('course_roster');
			reload();
		} catch (err) {
			setActionError(errorMessage(err));
		} finally {
			setBusyId(null);
		}
	};

	const loadStatus = useCallback(async () => {
		if (entries.length === 0) {
			setStatusMap(new Map());
			return;
		}
		setStatusLoading(true);
		setStatusError('');
		try {
			const response = await fetch('/api/roster-status', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${pb.authStore.token}`,
				},
				body: JSON.stringify({ courseId }),
			});
			const data = (await response.json().catch(() => null)) as {
				entries?: RosterStatusEntry[];
				error?: string;
			} | null;
			if (!response.ok) {
				throw new Error(data?.error || t('roster.statusLoadError'));
			}
			const map = new Map<string, RosterStatusEntry>();
			for (const e of data?.entries ?? []) map.set(e.nim, e);
			setStatusMap(map);
		} catch (err) {
			setStatusError(errorMessage(err));
		} finally {
			setStatusLoading(false);
		}
	}, [courseId, entries.length, t]);

	/** Update a single student's language in the local status map after a save. */
	const updateStatusLanguage = useCallback((nim: string, language: string) => {
		setStatusMap((prev) => {
			const entry = prev.get(nim);
			if (!entry) return prev;
			const next = new Map(prev);
			next.set(nim, { ...entry, language });
			return next;
		});
	}, []);

	useEffect(() => {
		void loadStatus();
	}, [loadStatus]);

	const exportRoster = () => {
		if (entries.length === 0) return;
		const csv = buildRosterCsv(entries);
		// Prepend a BOM so Excel opens UTF-8 (Indonesian names with diacritics) correctly.
		const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		const stamp = new Date().toISOString().slice(0, 10);
		link.download = `roster-${courseId}-${stamp}.csv`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	};

	const resetPassword = async (entry: CourseRosterEntry) => {
		if (
			!(await confirmDialog({
				title: t('roster.resetDialogTitle'),
				message: t('roster.resetDialogMessage', { name: entry.name, nim: entry.nim }),
				variant: 'default',
				confirmLabel: t('roster.reset'),
			}))
		)
			return;
		setResetBusy(entry.nim);
		setActionError('');
		try {
			const response = await fetch('/api/roster-reset-password', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${pb.authStore.token}`,
				},
				body: JSON.stringify({ courseId, nim: entry.nim }),
			});
			const data = (await response.json().catch(() => null)) as {
				password?: string;
				error?: string;
			} | null;
			if (!response.ok) {
				throw new Error(data?.error || t('roster.resetError'));
			}
			setResetResult({
				nim: entry.nim,
				name: entry.name,
				password: data?.password ?? '',
			});
			void loadStatus();
		} catch (err) {
			setActionError(errorMessage(err));
		} finally {
			setResetBusy(null);
		}
	};

	if (loading) {
		return (
			<div className="ld-loading">
				<LoaderCircle size={24} className="spin" /> {t('roster.loading')}
			</div>
		);
	}

	return (
		<div className="roster-area">
			<div className="roster-head">
				<div>
					<span className="ld-eyebrow">{t('roster.heading')}</span>
					<h2 className="roster-title">{t('roster.title')}</h2>
					<p className="roster-sub">
						{t('roster.description')}
					</p>
				</div>
				{canEdit && (
					<div className="roster-head-actions">
						<OverflowMenu label={t('roster.actionsLabel')}>
							<button
								type="button"
								role="menuitem"
								onClick={() => setShowAudit(true)}
								title={t('roster.auditTooltip')}
							>
								<History size={16} /> {t('roster.audit')}
							</button>
							<button
								type="button"
								role="menuitem"
								onClick={() => void loadStatus()}
								disabled={statusLoading || entries.length === 0}
								title={t('roster.refreshStatusTooltip')}
							>
								{statusLoading ? (
									<LoaderCircle size={16} className="spin" />
								) : (
									<RefreshCw size={16} />
								)}{' '}
								{t('roster.refreshStatus')}
							</button>
							<button type="button" role="menuitem" onClick={() => setImporting(true)}>
								<Upload size={16} /> {t('roster.import')}
							</button>
							<button
								type="button"
								role="menuitem"
								onClick={exportRoster}
								disabled={entries.length === 0}
								title={
									entries.length === 0
										? t('roster.exportEmptyTooltip')
										: t('roster.exportTooltip')
								}
							>
								<Download size={16} /> {t('roster.export')}
							</button>
							<button
								type="button"
								role="menuitem"
								onClick={() => void activate()}
								disabled={activating || entries.length === 0}
								title={t('roster.activateTooltip')}
							>
								{activating ? (
									<LoaderCircle size={16} className="spin" />
								) : (
									<UserCheck size={16} />
								)}{' '}
								{t('roster.activate')}
							</button>
						</OverflowMenu>
						<button
							type="button"
							className="ld-btn-primary"
							onClick={() => setEditing('new')}
						>
							<Plus size={17} /> {t('roster.addStudent')}
						</button>
					</div>
				)}
			</div>

			{error && (
				<div className="ld-alert" role="alert">
					{error}{' '}
					<button type="button" onClick={() => reload()}>
						{t('roster.retry')}
					</button>
				</div>
			)}
			{actionError && (
				<div className="ld-alert" role="alert">
					{actionError}{' '}
					<button type="button" onClick={() => setActionError('')}>
						{t('roster.close')}
					</button>
				</div>
			)}
			{activateError && (
				<div className="ld-alert" role="alert">
					{activateError}{' '}
					<button type="button" onClick={() => setActivateError('')}>
						{t('roster.close')}
					</button>
				</div>
			)}
			{statusError && (
				<div className="ld-alert" role="alert">
					{statusError}{' '}
					<button type="button" onClick={() => void loadStatus()}>
						{t('roster.retry')}
					</button>
				</div>
			)}

			{visibleEntries.length === 0 ? (
				<div className="ld-empty roster-empty">
					<div className="ld-empty-icon">
						<Users size={26} strokeWidth={1.4} />
					</div>
					<h3>{t('roster.emptyTitle')}</h3>
					<p>
						{canEdit ? t('roster.emptyEditable') : t('roster.emptyReadOnly')}
					</p>
					{canEdit && (
						<div className="ld-empty-actions">
							<button
								type="button"
								className="ld-btn-primary"
								onClick={() => setEditing('new')}
							>
								<Plus size={17} /> {t('roster.addStudent')}
							</button>
							<button
								type="button"
								className="ld-outline-action"
								onClick={() => setImporting(true)}
							>
								<Upload size={16} /> {t('roster.import')}
							</button>
						</div>
					)}
				</div>
			) : (
				<div className="roster-table-wrap">
					<table className="roster-table">
						<thead>
							<tr>
								<th className="roster-th-nim">{t('roster.nim')}</th>
								<th className="roster-th-name">{t('roster.name')}</th>
								{hasSections && <th className="roster-th-section">{t('roster.class')}</th>}
								<th className="roster-th-status">{t('roster.accountStatus')}</th>
								{canEdit && <th className="roster-th-language">{t('roster.language')}</th>}
							{canEdit && <th className="roster-th-actions" aria-label={t('roster.actions')} />}
							</tr>
						</thead>
						<tbody>
							{visibleEntries.map((entry) => {
								const status = statusMap.get(entry.nim.trim());
								return (
								<tr key={entry.id} className="roster-tr">
									<td className="roster-td-nim" data-label={t('roster.nim')}>{entry.nim}</td>
									<td className="roster-td-name" data-label={t('roster.name')}>
										{canEdit ? <Link className="roster-profile-link" to={`/app/courses/${courseId}/mahasiswa/${entry.id}`}>{entry.name}<span>Profil</span></Link> : entry.name}
									</td>
									{hasSections && <td className="roster-td-section" data-label={t('roster.class')}>{sectionName(entry.section) || '—'}</td>}
									<td className="roster-td-status" data-label={t('roster.status')}>
										<RosterStatusBadges status={status} loading={statusLoading} />
									</td>
									{canEdit && (
										<td className="roster-td-language" data-label={t('roster.language')}>
											<RosterLanguageCell
												courseId={courseId}
												entry={entry}
												status={status}
												onSaved={(lang) => updateStatusLanguage(entry.nim.trim(), lang)}
											/>
										</td>
									)}
									{canEdit && (
										<td className="roster-td-actions" data-label={t('roster.actions')}>
											<button
												type="button"
												className="ld-icon-action sm"
												aria-label={t('roster.resetStudentPassword', { name: entry.name })}
												title={t('roster.reset')}
												onClick={() => void resetPassword(entry)}
												disabled={
													!status?.accountExists ||
													resetBusy === entry.nim ||
													busyId === entry.id
												}
											>
												{resetBusy === entry.nim ? (
													<LoaderCircle size={15} className="spin" />
												) : (
													<KeyRound size={15} />
												)}
											</button>
											<button
												type="button"
												className="ld-icon-action sm"
												aria-label={t('roster.editStudent', { name: entry.name })}
												title={t('roster.edit')}
												onClick={() => setEditing(entry)}
												disabled={busyId === entry.id}
											>
												<Pencil size={15} />
											</button>
											<button
												type="button"
												className="ld-icon-action sm danger"
												aria-label={t('roster.removeStudent', { name: entry.name })}
												title={t('roster.remove')}
												onClick={() => void remove(entry)}
												disabled={busyId === entry.id}
											>
												{busyId === entry.id ? (
													<LoaderCircle size={15} className="spin" />
												) : (
													<Trash2 size={15} />
												)}
											</button>
										</td>
									)}
								</tr>
							);
							})}
						</tbody>
					</table>
					<div className="roster-foot">
						<GraduationCap size={15} /> {t('roster.enrolledCount', { count: String(visibleEntries.length) })}
					</div>
				</div>
			)}

			{editing && (
				<RosterEntryForm
					courseId={courseId}
					entry={editing === 'new' ? undefined : editing}
					existingNims={existingNims}
					sections={sections}
					defaultSection={sectionId}
					onClose={() => setEditing(null)}
					onSaved={() => {
						setEditing(null);
						reload();
					}}
				/>
			)}

			{importing && canEdit && (
				<RosterImport
					courseId={courseId}
					existingNims={existingNims}
					onClose={() => setImporting(false)}
					onSaved={() => {
						setImporting(false);
						reload();
					}}
				/>
			)}

			{activateResult && (
				<RosterActivate
					result={activateResult}
					onClose={() => setActivateResult(null)}
				/>
			)}

			{resetResult && (
				<RosterResetResult
					nim={resetResult.nim}
					name={resetResult.name}
					password={resetResult.password}
					onClose={() => setResetResult(null)}
				/>
			)}

			{showAudit && (
				<RosterAuditLog courseId={courseId} onClose={() => setShowAudit(false)} />
			)}
		</div>
	);
}

// ── Roster account status badges ──────────────────────────────

// ── Per-student dashboard language control ────────────────────

function RosterLanguageCell({
	courseId,
	entry,
	status,
	onSaved,
}: {
	courseId: string;
	entry: CourseRosterEntry;
	status: RosterStatusEntry | undefined;
	onSaved: (language: string) => void;
}) {
	const t = useT();
	const current: Language =
		status?.language === 'en' || status?.language === 'de' || status?.language === 'id'
			? (status.language as Language)
			: DEFAULT_STUDENT_LANGUAGE;
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	const save = async (language: Language) => {
		if (language === current || busy) return;
		setBusy(true);
		setError('');
		try {
			const response = await fetch('/api/roster-language', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${pb.authStore.token}`,
				},
				body: JSON.stringify({ courseId, nim: entry.nim, language }),
			});
			const data = (await response.json().catch(() => null)) as { error?: string } | null;
			if (!response.ok) {
				throw new Error(data?.error || t('roster.languageUpdateError'));
			}
			onSaved(language);
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	if (!status?.accountExists) {
		return <span className="roster-language-muted">—</span>;
	}

	return (
		<div className="roster-language">
			<select
				className="roster-language-select"
				value={current}
				disabled={busy}
				aria-label={t('roster.dashboardLanguage', { name: entry.name })}
				onChange={(e) => void save(e.target.value as Language)}
			>
				{LANGUAGES.map((l) => (
					<option key={l.code} value={l.code}>
						{l.native}
					</option>
				))}
			</select>
			{busy && <LoaderCircle size={13} className="spin roster-language-spin" />}
			{error && <span className="roster-language-err" title={error}>!</span>}
		</div>
	);
}

function RosterStatusBadges({
	status,
	loading,
}: {
	status: RosterStatusEntry | undefined;
	loading: boolean;
}) {
	const t = useT();
	if (loading && !status) {
		return <span className="roster-status-muted">{t('roster.loadingStatus')}</span>;
	}
	if (!status) {
		return <span className="roster-status-muted">—</span>;
	}
	if (!status.accountExists) {
		return (
			<span className="roster-status-pill warn">
				<ShieldAlert size={12} /> {t('roster.noAccount')}
			</span>
		);
	}
	return (
		<div className="roster-status-stack">
			{status.enrolled ? (
				<span className="roster-status-pill ok">
					<UserCheck size={12} /> {t('roster.enrolled')}
				</span>
			) : (
				<span className="roster-status-pill warn">
					<ShieldAlert size={12} /> {t('roster.notEnrolled')}
				</span>
			)}
			{status.mustChangePassword && (
				<span className="roster-status-pill warn">
					<KeyRound size={12} /> {t('roster.passwordChangeRequired')}
				</span>
			)}
			{status.nameMismatch && (
				<span
					className="roster-status-pill warn"
					title={t('roster.accountNameTooltip', { name: status.accountName })}
				>
					<AlertTriangle size={12} /> {t('roster.nameMismatch')}
				</span>
			)}
			{status.recoveryEmailVerified ? (
				<span className="roster-status-pill ok">
					<MailCheck size={12} /> {t('roster.emailVerified')}
				</span>
			) : status.recoveryEmail ? (
				<span className="roster-status-pill muted">
					<MailCheck size={12} /> {t('roster.emailUnverified')}
				</span>
			) : (
				<span className="roster-status-pill muted">
					<MailCheck size={12} /> {t('roster.noEmail')}
				</span>
			)}
			{status.linkedPublicCount > 0 && (
				<span className="roster-status-pill info">
					<Link2 size={12} /> {t('roster.publicLinksCount', { count: String(status.linkedPublicCount) })}
				</span>
			)}
		</div>
	);
}

// ── Reissued password one-time display ────────────────────────

function RosterResetResult({
	nim,
	name,
	password,
	onClose,
}: {
	nim: string;
	name: string;
	password: string;
	onClose: () => void;
}) {
	const t = useT();
	const [copied, setCopied] = useState(false);
	const [acknowledged, setAcknowledged] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(password);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2500);
		} catch {
			/* user can still read & copy manually */
		}
	};

	return (
		<AppModal
			open
			onClose={() => {
				if (acknowledged) onClose();
			}}
			title={t('roster.resetCompleteCaps')}
			className="roster-activate-modal"
		>
				<div className="modal-top">
					<span>{t('roster.resetCompleteCaps')}</span>
					<button type="button" aria-label={t('roster.close')} onClick={onClose}>
						<X size={20} />
					</button>
				</div>
				<h2>{t('roster.newPasswordTitle')}</h2>
				<p>
					{t('roster.resetResultBodyStart')} <strong>{name}</strong>{' '}
					{t('roster.resetResultBodyMid', { nim })}{' '}
					<strong>{t('roster.resetResultBodyBold')}</strong>{' '}
					{t('roster.resetResultBodyEnd')}
				</p>
				<div className="roster-activate-actions">
					<button type="button" className="ld-outline-action" onClick={() => void copy()}>
						{copied ? <ClipboardCopy size={16} /> : <Copy size={16} />}{' '}
						{copied ? t('roster.copied') : t('roster.copyPassword')}
					</button>
				</div>
				<div className="roster-credential-list">
					<div className="roster-credential-row">
						<div className="roster-credential-id">
							<KeyRound size={15} />
							<div>
								<strong>{nim}</strong>
								<small>{name}</small>
							</div>
						</div>
						<code className="roster-credential-pw">{password}</code>
					</div>
				</div>
				<label className="roster-activate-ack">
					<input
						type="checkbox"
						checked={acknowledged}
						onChange={(e) => setAcknowledged(e.target.checked)}
					/>
					{t('roster.ackNewPassword')}
				</label>
				<div className="modal-actions">
					<button
						type="button"
						className="ld-btn-primary"
						onClick={onClose}
						disabled={!acknowledged}
						title={!acknowledged ? t('roster.ackToCloseTooltip') : ''}
					>
						{t('roster.done')}
					</button>
				</div>
		</AppModal>
	);
}

// ── Individual add / edit ──────────────────────────────────────

function RosterEntryForm({
	courseId,
	entry,
	existingNims,
	sections,
	defaultSection,
	onClose,
	onSaved,
}: {
	courseId: string;
	entry?: CourseRosterEntry;
	existingNims: Set<string>;
	sections: CourseSection[];
	defaultSection?: string;
	onClose: () => void;
	onSaved: () => void;
}) {
	const t = useT();
	const [nim, setNim] = useState(entry?.nim ?? '');
	const [name, setName] = useState(entry?.name ?? '');
	const [section, setSection] = useState(entry?.section || defaultSection || '');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	const trimmedNim = nim.trim();
	const trimmedName = name.trim();
	const nimTaken =
		!entry && trimmedNim.length > 0 && existingNims.has(trimmedNim);
	const nimTooLong = trimmedNim.length > NIM_MAX;
	const nameTooLong = trimmedName.length > NAME_MAX;
	const canSave =
		trimmedNim.length > 0 &&
		trimmedName.length > 0 &&
		!nimTaken &&
		!nimTooLong &&
		!nameTooLong;

	const save = async () => {
		if (!canSave) return;
		setSaving(true);
		setError('');
		try {
			if (entry) {
				await pb.collection('course_roster').update(entry.id, {
					nim: trimmedNim,
					name: trimmedName,
					section: section || null,
				});
			} else {
				await pb.collection('course_roster').create({
					course: courseId,
					owner: pb.authStore.record?.id,
					nim: trimmedNim,
					name: trimmedName,
					section: section || null,
				});
			}
			invalidate('course_roster');
			onSaved();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setSaving(false);
		}
	};

	return (
		<AppModal
			open
			onClose={onClose}
			title={entry ? t('roster.editStudentCaps') : t('roster.addStudentCaps')}
			className="roster-modal"
		>
				<div className="modal-top">
					<span>{entry ? t('roster.editStudentCaps') : t('roster.addStudentCaps')}</span>
					<button type="button" aria-label={t('roster.close')} onClick={onClose}>
						<X size={20} />
					</button>
				</div>
				<h2>{entry ? t('roster.editStudentTitle') : t('roster.addStudentTitle')}</h2>
				<p>{t('roster.entryFormHelp')}</p>
				<div className="editor-form">
					<label>
						<span>{t('roster.nim')}</span>
						<input
							type="text"
							value={nim}
							maxLength={NIM_MAX}
							autoFocus
							placeholder={t('roster.nimPlaceholder')}
							onChange={(e) => setNim(e.target.value)}
							aria-invalid={nimTaken || nimTooLong || undefined}
						/>
					</label>
					{nimTaken && (
						<p className="form-error">{t('roster.nimTakenError')}</p>
					)}
					{nimTooLong && (
						<p className="form-error">{t('roster.nimTooLongError', { max: String(NIM_MAX) })}</p>
					)}
					<label>
						<span>{t('roster.name')}</span>
						<input
							type="text"
							value={name}
							maxLength={NAME_MAX}
							placeholder={t('roster.namePlaceholder')}
							onChange={(e) => setName(e.target.value)}
							aria-invalid={nameTooLong || undefined}
						/>
					</label>
					{nameTooLong && (
						<p className="form-error">{t('roster.nameTooLongError', { max: String(NAME_MAX) })}</p>
					)}
					{sections.length > 0 && (
						<label>
							<span>{t('roster.class')}</span>
							<select value={section} onChange={(e) => setSection(e.target.value)}>
								<option value="">{t('roster.noSpecialClass')}</option>
								{sections.map((s) => (
									<option key={s.id} value={s.id}>{s.name}</option>
								))}
							</select>
						</label>
					)}
					{error && <p className="form-error">{error}</p>}
				</div>
				<div className="modal-actions">
					<button
						type="button"
						className="button-quiet"
						onClick={onClose}
						disabled={saving}
					>
						{t('roster.cancel')}
					</button>
					<button
						type="button"
						className="ld-btn-primary"
						onClick={() => void save()}
						disabled={!canSave || saving}
					>
						{saving ? (
							<LoaderCircle size={17} className="spin" />
						) : (
							<>
								<Plus size={17} /> {entry ? t('roster.save') : t('roster.add')}
							</>
						)}
					</button>
				</div>
		</AppModal>
	);
}

// ── Batch / CSV import ─────────────────────────────────────────

type ParsedRow = {
	line: number;
	nim: string;
	name: string;
	/** Validation error for this row (blocks saving). */
	error?: string;
	/** NIM already exists in the roster — will be skipped (reused), not an error. */
	exists?: boolean;
};

function RosterImport({
	courseId,
	existingNims,
	onClose,
	onSaved,
}: {
	courseId: string;
	existingNims: Set<string>;
	onClose: () => void;
	onSaved: () => void;
}) {
	const t = useT();
	const [text, setText] = useState('');
	const [rows, setRows] = useState<ParsedRow[] | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [copied, setCopied] = useState(false);

	const validRows = useMemo(
		() => (rows ?? []).filter((r) => !r.error && !r.exists),
		[rows],
	);
	const errorRows = useMemo(
		() => (rows ?? []).filter((r) => r.error),
		[rows],
	);
	const existsRows = useMemo(
		() => (rows ?? []).filter((r) => r.exists),
		[rows],
	);

	const preview = () => {
		setError('');
		setRows(parseRosterText(text, existingNims));
	};

	const copyPrompt = async () => {
		try {
			await navigator.clipboard.writeText(
				t('roster.csvPrompt', { nimMax: String(NIM_MAX), nameMax: String(NAME_MAX) }),
			);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2000);
		} catch {
			setError(t('roster.copyError'));
		}
	};

	const onFile = (file: File) => {
		setError('');
		const reader = new FileReader();
		reader.onload = () => {
			const content = String(reader.result ?? '');
			setText(content);
			setRows(parseRosterText(content, existingNims));
		};
		reader.onerror = () => setError(t('roster.fileReadError'));
		reader.readAsText(file);
	};

	const save = async () => {
		if (validRows.length === 0) return;
		setSaving(true);
		setError('');
		let created = 0;
		let failed = 0;
		try {
			// Create each roster entry with a distinct request key so the SDK
			// does not auto-cancel parallel writes to the same collection.
			await Promise.all(
				validRows.map((row, i) =>
					pb
						.collection('course_roster')
						.create(
							{
								course: courseId,
								owner: pb.authStore.record?.id,
								nim: row.nim,
								name: row.name,
							},
							{ requestKey: `roster-create-${i}` },
						)
						.then(() => {
							created += 1;
						})
						.catch((err) => {
							// A unique-constraint failure means the NIM was added by
							// someone else mid-import — treat as already enrolled.
							const msg = String(err?.message ?? err);
							if (msg.includes('unique') || err?.status === 400) {
								failed += 1;
							} else {
								failed += 1;
							}
						}),
				),
			);
			invalidate('course_roster');
			if (created > 0) {
				onSaved();
			} else {
				setError(t('roster.noNewStudents'));
				setSaving(false);
			}
		} catch (err) {
			setError(errorMessage(err));
			setSaving(false);
		}
	};

	return (
		<AppModal
			open
			onClose={onClose}
			title={t('roster.importCaps')}
			className="roster-import-modal"
		>
				<div className="modal-top">
					<span>{t('roster.importCaps')}</span>
					<button type="button" aria-label={t('roster.close')} onClick={onClose}>
						<X size={20} />
					</button>
				</div>
				<h2>{t('roster.importTitle')}</h2>
				<p>
					{t('roster.importHelpStart')} <code>nim,nama</code>
					{t('roster.importHelpEnd')}
				</p>

				<div className="roster-import-actions">
					<label className="ld-outline-action roster-file-label">
						<FileSpreadsheet size={16} /> {t('roster.chooseCsv')}
						<input
							type="file"
							accept=".csv,text/csv,text/plain"
							onChange={(e) => {
								const file = e.target.files?.[0];
								if (file) void onFile(file);
								e.target.value = '';
							}}
						/>
					</label>
					<button
						type="button"
						className="ld-outline-action"
						onClick={() => void copyPrompt()}
					>
						<ClipboardCopy size={16} /> {copied ? t('roster.copied') : t('roster.copyPrompt')}
					</button>
				</div>

				<label className="roster-textarea-label">
					<span>{t('roster.rosterList')}</span>
					<textarea
						className="roster-textarea"
						rows={8}
						value={text}
						placeholder={t('roster.textareaPlaceholder')}
						onChange={(e) => {
							setText(e.target.value);
							setRows(null);
						}}
					/>
				</label>

				<div className="roster-import-foot">
					<button
						type="button"
						className="ld-outline-action"
						onClick={preview}
						disabled={!text.trim() || saving}
					>
						<Download size={16} /> {t('roster.validateList')}
					</button>
				</div>

				{error && <p className="form-error">{error}</p>}

				{rows && (
					<div className="roster-preview">
						<div className="roster-preview-head">
							<span>
								{t('roster.previewReady', { count: String(validRows.length) })}
								{existsRows.length > 0 && t('roster.previewAlreadyEnrolled', { count: String(existsRows.length) })}
								{errorRows.length > 0 && (
									<em className="roster-preview-err">
										{' '}{t('roster.previewProblemRows', { count: String(errorRows.length) })}
									</em>
								)}
							</span>
						</div>
						<div className="roster-preview-table-wrap">
							<table className="roster-table roster-preview-table">
								<thead>
									<tr>
										<th className="roster-th-line">{t('roster.row')}</th>
										<th className="roster-th-nim">{t('roster.nim')}</th>
										<th className="roster-th-name">{t('roster.name')}</th>
										<th className="roster-th-status">{t('roster.status')}</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((row) => (
										<tr
											key={row.line}
											className={`roster-tr${row.error ? ' has-error' : ''}${row.exists ? ' is-exists' : ''}`}
										>
											<td className="roster-td-line">{row.line}</td>
											<td className="roster-td-nim">{row.nim || '—'}</td>
											<td className="roster-td-name">{row.name || '—'}</td>
											<td className="roster-td-status">
												{row.error ? (
													<span className="roster-status err">
														<AlertTriangle size={13} /> {row.error}
													</span>
												) : row.exists ? (
													<span className="roster-status exists">{t('roster.alreadyEnrolled')}</span>
												) : (
													<span className="roster-status ok">{t('roster.willBeAdded')}</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}

				<div className="modal-actions">
					<button
						type="button"
						className="button-quiet"
						onClick={onClose}
						disabled={saving}
					>
						{t('roster.cancel')}
					</button>
					<button
						type="button"
						className="ld-btn-primary"
						onClick={() => void save()}
						disabled={validRows.length === 0 || saving}
					>
						{saving ? (
							<LoaderCircle size={17} className="spin" />
						) : (
							<>
								<Plus size={17} /> {t('roster.addCount', { count: String(validRows.length) })}
							</>
						)}
					</button>
				</div>
		</AppModal>
	);
}

// ── Account activation & one-time credential display ───────────

function RosterActivate({
	result,
	onClose,
}: {
	result: ActivateResult;
	onClose: () => void;
}) {
	const t = useT();
	const { results, summary } = result;
	const created = results.filter((r): r is Extract<ActivateOutcome, { outcome: 'created' }> =>
		r.outcome === 'created',
	);
	const [copied, setCopied] = useState(false);
	const [acknowledged, setAcknowledged] = useState(false);

	const copyAll = async () => {
		const lines = created.map(
			(r) => `${t('roster.nim')}: ${r.nim}\n${t('roster.name')}: ${r.name}\n${t('roster.password')}: ${r.password}`,
		);
		try {
			await navigator.clipboard.writeText(lines.join('\n\n'));
			setCopied(true);
			window.setTimeout(() => setCopied(false), 2500);
		} catch {
			// ignore — user can still read & copy manually
		}
	};

	return (
		<AppModal
			open
			onClose={() => {
				if (acknowledged) onClose();
			}}
			title={t('roster.activationCaps')}
			className="roster-activate-modal"
		>
				<div className="modal-top">
					<span>{t('roster.activationCaps')}</span>
					<button type="button" aria-label={t('roster.close')} onClick={onClose}>
						<X size={20} />
					</button>
				</div>
				<h2>{t('roster.activatedTitle')}</h2>
				<p>
					{t('roster.activatedBodyStart')}{' '}
					<strong>{t('roster.activatedBodyBold')}</strong>{' '}
					{t('roster.activatedBodyEnd')}
				</p>

				<div className="roster-activate-summary">
					<span>
						<strong>{summary.created}</strong> {t('roster.newAccounts')}
					</span>
					<span>
						<strong>{summary.reused}</strong> {t('roster.oldAccountsEnrolled')}
					</span>
					<span>
						<strong>{summary.alreadyEnrolled}</strong> {t('roster.alreadyEnrolled')}
					</span>
					{summary.errors > 0 && (
						<span className="roster-activate-err">
							<strong>{summary.errors}</strong> {t('roster.failed')}
						</span>
					)}
				</div>

				{summary.linkedPublicAnswers && summary.linkedPublicAnswers.total > 0 && (
					<div className="roster-activate-linked">
						<Link2 size={15} />
						<div>
							<strong>{t('roster.linkedPublicCount', { count: String(summary.linkedPublicAnswers.linked) })}</strong>
							<span>
								{t('roster.linkedPublicBody')}
								{summary.linkedPublicAnswers.skipped > 0 &&
									t('roster.linkedSkipped', { count: String(summary.linkedPublicAnswers.skipped) })}
								{summary.linkedPublicAnswers.conflict > 0 &&
									t('roster.linkedConflict', { count: String(summary.linkedPublicAnswers.conflict) })}
								{summary.linkedPublicAnswers.errors > 0 &&
									t('roster.linkedErrors', { count: String(summary.linkedPublicAnswers.errors) })}
								{t('roster.linkedPublicTail')}
							</span>
						</div>
					</div>
				)}

				{created.length > 0 && (
					<>
						<div className="roster-activate-actions">
							<button
								type="button"
								className="ld-outline-action"
								onClick={() => void copyAll()}
							>
								{copied ? <ClipboardCopy size={16} /> : <Copy size={16} />}{' '}
								{copied ? t('roster.copied') : t('roster.copyCredentials')}
							</button>
						</div>
						<div className="roster-credential-list">
							{created.map((row) => (
								<div className="roster-credential-row" key={row.nim}>
									<div className="roster-credential-id">
										<KeyRound size={15} />
										<div>
											<strong>{row.nim}</strong>
											<small>{row.name}</small>
										</div>
									</div>
									<code className="roster-credential-pw">{row.password}</code>
									<button
										type="button"
										className="ld-icon-action sm"
										aria-label={t('roster.copyPasswordNim', { nim: row.nim })}
										title={t('roster.copyPassword')}
										onClick={() =>
											void navigator.clipboard
												.writeText(row.password)
												.catch(() => {})
										}
									>
										<Copy size={14} />
									</button>
								</div>
							))}
						</div>
					</>
				)}

				{results.some((r) => r.outcome !== 'created' && r.outcome !== 'error') && (
					<details className="roster-activate-other">
						<summary>{t('roster.existingAccountsSummary', { count: String(summary.reused + summary.alreadyEnrolled) })}</summary>
						<ul>
							{results
								.filter(
									(r) => r.outcome === 'reused' || r.outcome === 'already_enrolled',
								)
								.map((r) => (
									<li key={r.nim}>
										<span>{r.nim}</span> — {r.name}{' '}
										<em>
											{r.outcome === 'reused'
												? t('roster.enrolledToCourse')
												: t('roster.alreadyEnrolled')}
										</em>
									</li>
								))}
						</ul>
					</details>
				)}

				{summary.errors > 0 && (
					<details className="roster-activate-other">
						<summary>{t('roster.failedSummary', { count: String(summary.errors) })}</summary>
						<ul>
							{results
								.filter((r): r is Extract<ActivateOutcome, { outcome: 'error' }> =>
									r.outcome === 'error',
								)
								.map((r) => (
									<li key={r.nim}>
										<span>{r.nim}</span> — {r.name}: {r.error}
									</li>
								))}
						</ul>
					</details>
				)}

				<label className="roster-activate-ack">
					<input
						type="checkbox"
						checked={acknowledged}
						onChange={(e) => setAcknowledged(e.target.checked)}
					/>
					{t('roster.ackCredentials')}
				</label>

				<div className="modal-actions">
					<button
						type="button"
						className="ld-btn-primary"
						onClick={onClose}
						disabled={!acknowledged && created.length > 0}
						title={
							!acknowledged && created.length > 0
								? t('roster.ackToCloseTooltip')
								: ''
						}
					>
						{t('roster.done')}
					</button>
				</div>
		</AppModal>
	);
}

// ── Roster audit history (Phase 6) ────────────────────────────

type RosterAuditRecord = {
	id: string;
	action: string;
	nim: string;
	studentName: string;
	outcome: string;
	detail: string;
	assignment: string;
	created: string;
};

function RosterAuditLog({ courseId, onClose }: { courseId: string; onClose: () => void }) {
	const t = useT();
	const [rows, setRows] = useState<RosterAuditRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	const auditActionLabel = useCallback(
		(action: string) => {
			const map: Record<string, string> = {
				roster_activated: t('roster.auditAction.roster_activated'),
				account_created: t('roster.auditAction.account_created'),
				password_reissued: t('roster.auditAction.password_reissued'),
				public_linked: t('roster.auditAction.public_linked'),
				public_conflict: t('roster.auditAction.public_conflict'),
			};
			return map[action] || action;
		},
		[t],
	);

	const auditOutcomeLabel = useCallback(
		(outcome: string) => {
			const map: Record<string, string> = {
				success: t('roster.auditOutcome.success'),
				skipped: t('roster.auditOutcome.skipped'),
				conflict: t('roster.auditOutcome.conflict'),
				error: t('roster.auditOutcome.error'),
			};
			return map[outcome] || outcome;
		},
		[t],
	);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			setLoading(true);
			setError('');
			try {
				const filter = pb.filter('course = {:id}', { id: courseId });
				const res = await pb
					.collection('roster_audit')
					.getList<RosterAuditRecord>(1, 100, { filter, sort: '-created' });
				if (!cancelled) setRows(res.items);
			} catch (err) {
				if (!cancelled) setError(errorMessage(err));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [courseId]);

	return (
		<AppModal
			open
			onClose={onClose}
			title={t('roster.auditCaps')}
			className="roster-audit-modal"
		>
				<div className="modal-top">
					<span>{t('roster.auditCaps')}</span>
					<button type="button" aria-label={t('roster.close')} onClick={onClose}>
						<X size={20} />
					</button>
				</div>
				<h2>{t('roster.audit')}</h2>
				<p>
					{t('roster.auditHelp')}
				</p>

				{loading && (
					<div className="ld-loading">
						<LoaderCircle size={20} className="spin" /> {t('roster.loadingAudit')}
					</div>
				)}
				{error && (
					<div className="ld-alert" role="alert">
						{error}{' '}
						<button type="button" onClick={() => setError('')}>
							{t('roster.close')}
						</button>
					</div>
				)}

				{!loading && !error && rows.length === 0 && (
					<div className="ld-empty-sm">{t('roster.emptyAudit')}</div>
				)}

				{!loading && rows.length > 0 && (
					<ul className="roster-audit-list">
						{rows.map((row) => {
							const outcome = row.outcome || 'success';
							return (
								<li key={row.id} className={`roster-audit-item ${outcome}`}>
									<div className="roster-audit-head">
										<span className="roster-audit-action">
											{auditActionLabel(row.action)}
										</span>
										<span className={`roster-audit-outcome ${outcome}`}>
											{auditOutcomeLabel(outcome)}
										</span>
									</div>
									{(row.studentName || row.nim) && (
										<div className="roster-audit-who">
											{row.studentName && <strong>{row.studentName}</strong>}
											{row.nim && <span>{t('roster.nim')} {row.nim}</span>}
										</div>
									)}
									{row.detail && <p className="roster-audit-detail">{row.detail}</p>}
									<div className="roster-audit-foot">
										<small>
											{new Date(row.created).toLocaleString('id-ID', {
												dateStyle: 'medium',
												timeStyle: 'short',
											})}
										</small>
										{row.assignment && (
											<Link
												to={`/app/tugas/${row.assignment}`}
												className="roster-audit-link"
											>
												{t('roster.reviewTask')}
											</Link>
										)}
									</div>
								</li>
							);
						})}
					</ul>
				)}

				<div className="modal-actions">
					<button type="button" className="ld-btn-primary" onClick={onClose}>
						{t('roster.close')}
					</button>
				</div>
		</AppModal>
	);
}
