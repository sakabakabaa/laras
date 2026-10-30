import type { Route } from './+types/tugas.$token';
import { redirect } from 'react-router';
import { seo } from '@/lib/seo';
import pb from '@/lib/pocketbase-client';
import { LockKeyhole, LoaderCircle } from 'lucide-react';

export function meta({ matches, location }: Route.MetaArgs) {
	return seo({ matches, location }, {
		title: 'Tugas',
		description: 'Buka tugas mata kuliah Anda di LARAS. Login diperlukan untuk mengakses lembar kerja.',
	});
}

/**
 * Login-gated gateway for a shareable task link (`/tugas/:token`).
 *
 * Public/anonymous submission was removed — every task workspace now requires
 * an authenticated session. A signed-out visitor is sent to login with a
 * `next` return path so they land back on this link after signing in; a
 * signed-in visitor is resolved to the assignment behind the token and
 * redirected to the normal enrolled workspace (`/app/kerja/:assignmentId`),
 * where role/permission rules apply as usual.
 */
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
	const token = (params.token || '').trim();

	if (!pb.authStore.isValid || !pb.authStore.record) {
		throw redirect(`/login?next=${encodeURIComponent(`/tugas/${token}`)}`);
	}

	try {
		const assignment = await pb
			.collection('assignments')
			.getFirstListItem<{ id: string }>(pb.filter('publicToken = {:token}', { token }));
		throw redirect(`/app/kerja/${assignment.id}`);
	} catch (err) {
		// A thrown redirect rethrows; anything else means the token no longer
		// resolves to a published task — fall through to the sign-in / not-found
		// view rather than exposing assignment data.
		if (err instanceof Response) throw err;
		return { notFound: true };
	}
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
	return (
		<main className="ld-loading">
			<LoaderCircle size={22} className="spin" /> Memuat tugas...
		</main>
	);
}

export default function PublicTaskRoute({ loaderData }: Route.ComponentProps) {
	if (!loaderData?.notFound) {
		return (
			<main className="ld-loading">
				<LoaderCircle size={22} className="spin" /> Memuat tugas...
			</main>
		);
	}
	return (
		<main className="ld-content">
			<div className="ld-empty">
				<div className="ld-empty-icon">
					<LockKeyhole size={26} strokeWidth={1.4} />
				</div>
				<h3>Tugas tidak ditemukan</h3>
				<p>
					Tautan ini tidak lagi berlaku, atau tugas belum diterbitkan. Login diperlukan untuk
					mengakses lembar kerja tugas.
				</p>
				<a href="/login" className="ld-btn-primary">
					Masuk ke LARAS
				</a>
			</div>
		</main>
	);
}
