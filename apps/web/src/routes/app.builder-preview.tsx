import { useEffect, useState } from 'react';
import { Link, redirect, useParams } from 'react-router';
import { requireAuth } from '@/lib/require-auth';
import { builderRequest, type BuilderDocument, type BuilderRecord } from '@/lib/builder-document';
import { AppShell } from '@/components/app/app-shell';
import { BuilderJourneyPreview } from '@/components/app/builder/builder-journey-preview';
import '@/styles/builder-workspace.css';

export function meta() {
	return [{ title: 'Pratinjau mahasiswa | LARAS' }];
}
export function clientLoader() {
	const user = requireAuth();
	if (user.role !== 'faculty') throw redirect('/app/student');
	return { user };
}
clientLoader.hydrate = true as const;
export function HydrateFallback() {
	return <div className="route-loading">Membuka pratinjau…</div>;
}
export default function BuilderPreviewRoute() {
	const { documentId = '' } = useParams();
	return <AppShell title="Pratinjau mahasiswa" eyebrow="PRATINJAU" variant="saas" hideHeading hideSidebar>
		<PreviewPage key={documentId} id={documentId} />
	</AppShell>;
}
function PreviewPage({ id }: { id: string }) {
	const [document, setDocument] = useState<BuilderDocument | null>(null);
	const [error, setError] = useState('');
	const [mobile, setMobile] = useState(false);
	useEffect(() => {
		let live = true;
		builderRequest<BuilderRecord>('get', { id }).then(record => {
			if (live) setDocument(record.document);
		}).catch((e: Error) => { if (live) setError(e.message); });
		return () => { live = false; };
	}, [id]);
	return <div className="bd-preview-page">
		<header className="bd-preview-page-header">
			<div><h1>Pratinjau mahasiswa</h1><p>Draf tersimpan · jawaban percobaan tidak dikirim ke mahasiswa.</p></div>
			<div className="bd-inline-actions">
				<button className="bd-secondary" aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button>
				<button className="bd-secondary" aria-pressed={mobile} onClick={() => setMobile(true)}>Ponsel</button>
				<Link className="bd-secondary" to={`/app/builder/${id}`}>← Kembali ke builder</Link>
			</div>
		</header>
		{error ? <p role="alert">{error}</p> : !document ? <p role="status">Memuat draf…</p> :
			<div className={mobile ? 'bd-preview-frame is-mobile' : 'bd-preview-frame'}>
				<BuilderJourneyPreview document={document} />
			</div>}
	</div>;
}
