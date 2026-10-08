import {SessionRoster} from './session-roster';
import {useMemo} from 'react';
import {ClipboardList,LoaderCircle} from 'lucide-react';
import {useMyAttendance,type AttendanceStatus} from '@/hooks/use-attendance';
import {dateLabel} from '@/lib/learning';
import {useLanguage,useT} from '@/lib/i18n';

type Props = {
	courseId: string;
	canEdit: boolean;
	isStudent: boolean;
	/** Selected kelas filter (empty = all sections). */
	sectionId?: string;
};

const STATUS_ORDER: AttendanceStatus[] = ['present', 'late', 'excused', 'sick', 'absent'];

export function AttendanceManager({ courseId, canEdit, isStudent, sectionId }: Props) {
	if (isStudent) {
		return <StudentAttendance courseId={courseId} />;
	}
	return (
		<SessionRoster courseId={courseId} canEdit={canEdit} sectionId={sectionId} />
	);
}

// ── Student self-view ─────────────────────────────────────────

function StudentAttendance({ courseId }: { courseId: string }) {
	const t = useT();
	const language = useLanguage();
	const { rows, loading, error } = useMyAttendance(courseId);
	const statusLabel = (status: AttendanceStatus) => status === 'sick' ? (language === 'en' ? 'Sick' : language === 'de' ? 'Krank' : 'Sakit') : t(`student.attendance.${status}`);
	const localizedDate = (value: string) => {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? dateLabel(value) : new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : language === 'en' ? 'en-GB' : 'id-ID', { dateStyle: 'medium' }).format(date);
	};

	const summary = useMemo(() => {
		const counts: Record<AttendanceStatus, number> = { present: 0, late: 0, absent: 0, excused: 0, sick: 0 };
		for (const r of rows) counts[r.status] += 1;
		return counts;
	}, [rows]);

	return (
		<div className="ld-attendance">
			<div className="ld-attendance-head">
				<div>
					<span className="ld-eyebrow">{t('student.attendance.eyebrow')}</span>
					<h2 className="ld-attendance-title">{t('student.attendance.title')}</h2>
					<p className="ld-attendance-sub">
						{t('student.attendance.description')}
					</p>
				</div>
			</div>

			{error && (
				<div className="ld-alert" role="alert">
					{error}
				</div>
			)}

			{loading ? (
				<div className="ld-loading">
					<LoaderCircle size={24} className="spin" /> {t('student.attendance.loading')}
				</div>
			) : rows.length === 0 ? (
				<div className="ld-empty">
					<div className="ld-empty-icon">
						<ClipboardList size={26} strokeWidth={1.4} />
					</div>
					<h3>{t('student.attendance.emptyTitle')}</h3>
					<p>{t('student.attendance.emptyDescription')}</p>
				</div>
			) : (
				<>
					<div className="ld-attendance-summary">
						{STATUS_ORDER.map((s) => (
							<span key={s} className={`ld-att-sum-chip ${s}`}>
								<strong>{summary[s]}</strong> {statusLabel(s)}
							</span>
						))}
					</div>
					<div className="ld-attendance-table-wrap">
						<table className="ld-attendance-table">
							<thead>
								<tr>
									<th className="ld-att-th-week">{t('student.attendance.session')}</th>
									<th className="ld-att-th-date">{t('student.attendance.date')}</th>
									<th className="ld-att-th-status">{t('student.attendance.attendance')}</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((r) => {
									const session = r.expand?.session;
									return (
										<tr key={r.id} className="ld-att-tr">
							<td className="ld-att-td-week" data-label={t('student.attendance.session')}>
												{session ? (
													<>
										<small>{t('worksheet.week', { week: String(session.week || '—').padStart(2, '0') })}</small>
														<strong>{session.title}</strong>
													</>
												) : (
								<strong>{t('student.attendance.sessionUnavailable')}</strong>
												)}
											</td>
							<td className="ld-att-td-date" data-label={t('student.attendance.date')}>
								{session?.date ? localizedDate(session.date) : '—'}
											</td>
							<td className="ld-att-td-status" data-label={t('student.attendance.attendance')}>
								<span className={`ld-att-pill ${r.status}`}>{statusLabel(r.status)}</span>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</>
			)}
		</div>
	);
}
