import { Link } from 'react-router';
import { CalendarDays, ClipboardList } from 'lucide-react';
import type { Course, ClassSession } from '@/lib/learning';
import { courseSectionPath } from '@/lib/course-sections';
import { useT } from '@/lib/i18n';

export function StudentCourseOverview({ course, routeId }: { course: Course; routeId: string; sessions: ClassSession[] }) {
 const t = useT();
 return <div className="sco-wrap"><section className="ld-panel sco-panel"><h1>{course.title}</h1><p>{[course.code, course.lecturerName].filter(Boolean).join(' · ')}</p></section><section className="ld-panel sco-panel"><div className="ld-card-head"><h2>{t('student.courseRail.navigation')}</h2></div><p><Link className="ld-text-btn" to={courseSectionPath(routeId,'mata-kuliah')}><CalendarDays size={16}/> {t('student.courseRail.mata-kuliah')}</Link></p><p><Link className="ld-text-btn" to={courseSectionPath(routeId,'absensi')}><ClipboardList size={16}/> {t('student.courseRail.absensi')}</Link></p></section></div>;
}
