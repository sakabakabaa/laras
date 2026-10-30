import {useT} from '@/lib/i18n';
import {useEffect, useState} from 'react';
import { redirect } from 'react-router';
import type { Route } from './+types/app.latihan';
import { requireAuth } from '@/lib/require-auth';
import { dashboardForRole } from '@/lib/learning';
import { seo } from '@/lib/seo';
import { StudentPractice } from '@/components/app/student-practice';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, { title: 'Latihan | LARAS', description: 'Latihan interaktif dari materi mata kuliah yang Anda ikuti.' });
}

export function clientLoader() {
	const user = requireAuth() as { role?: string; mustChangePassword?: boolean };
	if (user.role !== 'student') throw redirect(dashboardForRole(user.role || 'faculty'));
	if (user.mustChangePassword) throw redirect('/app/onboarding');
	return { user };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
 const t = useT();
 const [mounted, setMounted] = useState(false);
 useEffect(() => setMounted(true), []);
 // The stored language is available only in the browser. Keep initial markup
 // identical to the server until hydration finishes.
 return <div className="route-loading" role="status">{mounted ? t('practiceUi.practiceLoading') : '…'}</div>;
}
export default function PracticeRoute() {
 const t=useT();
 useEffect(()=>{document.title=`${t('practice.title')} | LARAS`;},[t]);
 return <StudentPractice />;
}
