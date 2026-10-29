import {redirect} from 'react-router';
import {requireAuth} from '@/lib/require-auth';
import {AppShell} from '@/components/app/app-shell';
import {ScheduledSessionsIndex} from '@/components/app/scheduled-sessions-index';
import '@/styles/scheduled-session-workspace.css';

export function meta() {return [{title:'Kelas terjadwal | LARAS'}];}
export function clientLoader() {const user=requireAuth();if(user.role!=='faculty')throw redirect('/app/student');return {user};}
clientLoader.hydrate=true as const;
export function HydrateFallback(){return <div className="route-loading">Membuka kelas terjadwal...</div>;}
export default function ScheduledClassesRoute(){return <AppShell title="Kelas terjadwal" eyebrow="KELAS TERJADWAL" variant="saas" hideHeading><ScheduledSessionsIndex/></AppShell>;}
