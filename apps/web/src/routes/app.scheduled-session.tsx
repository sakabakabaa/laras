import {redirect,useSearchParams} from 'react-router';
import type {Route} from './+types/app.scheduled-session';
import {requireAuth} from '@/lib/require-auth';
import {AppShell} from '@/components/app/app-shell';
import ScheduledClassPage from './course.scheduled-class';
import '@/styles/scheduled-session-workspace.css';

export function meta(){return [{title:'Ruang kelas terjadwal | LARAS'}];}
export function clientLoader({params}:Route.ClientLoaderArgs){const user=requireAuth();if(user.role!=='faculty')throw redirect(`/app/courses/${params.courseId}/pertemuan/${params.sessionId}/terjadwal`);return {user};}
clientLoader.hydrate=true as const;
export function HydrateFallback(){return <div className="route-loading">Membuka ruang kelas...</div>;}
export default function ScheduledSessionRoute(){const [params]=useSearchParams();return <AppShell title="Kelas terjadwal" eyebrow="KELAS TERJADWAL" variant="saas" hideHeading hideSidebar={params.get('preview')==='student'}><ScheduledClassPage/></AppShell>;}
