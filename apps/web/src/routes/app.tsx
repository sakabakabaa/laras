import { redirect } from 'react-router';
import type { Route } from './+types/app';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { CourseDashboard } from '@/components/app/course-dashboard';
import { dashboardForRole } from '@/lib/learning';

export function meta({ matches, location }: Route.MetaArgs) {
  return seo({ matches, location }, { title: 'Ruang kerja | LARAS', description: 'Kelola mata kuliah dan sesi mengajar di ruang kerja LARAS Anda.' });
}
export function clientLoader() {
  const user = requireAuth();
  // Faculty belong here; students are sent to their own dashboard.
  if ((user as { role?: string }).role === 'student') {
    throw redirect(dashboardForRole('student'));
  }
  return { user };
}
clientLoader.hydrate = true as const;
export function HydrateFallback() { return <div className="route-loading">Membuka ruang kerja...</div>; }
export default function AppPage() { return <CourseDashboard/>; }
