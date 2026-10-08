import type { Route } from './+types/login';
import { seo } from '@/lib/seo';
import { AuthPanel } from '@/components/auth/auth-panel';

export function meta({ matches, location }: Route.MetaArgs) {
  return seo({ matches, location }, { title: 'Masuk atau daftar | LARAS', description: 'Akses ruang kerja LARAS untuk mengatur mata kuliah, RPS, silabus, dan sesi mengajar.' });
}
export default function LoginPage() { return <AuthPanel/>; }
