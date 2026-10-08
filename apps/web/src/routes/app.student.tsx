import { redirect } from 'react-router';
import type { Route } from './+types/app.student';
import { seo } from '@/lib/seo';
import { requireAuth } from '@/lib/require-auth';
import { StudentDashboard } from '@/components/app/student-dashboard';
import { dashboardForRole } from '@/lib/learning';

export function meta({ matches, location }: Route.MetaArgs) {
  return seo({ matches, location }, { title: 'Ruang mahasiswa | LARAS', description: 'Lihat mata kuliah yang Anda ikuti, akses materi, dan pantau sesi kelas.' });
}
export function clientLoader() {
  const user = requireAuth();
  // Students belong here; faculty are sent to their own dashboard.
  if ((user as { role?: string }).role !== 'student') {
    throw redirect(dashboardForRole('faculty'));
  }
  // Phase 3 gate: a student who still has the default password from the
  // lecturer roster must complete first-login onboarding before accessing
  // course content.
  if ((user as { mustChangePassword?: boolean }).mustChangePassword) {
    throw redirect('/app/onboarding');
  }
  return { user };
}
clientLoader.hydrate = true as const;
export function HydrateFallback() { return <div className="route-loading">Membuka ruang mahasiswa...</div>; }
export default function StudentPage() { return <StudentDashboard/>; }
