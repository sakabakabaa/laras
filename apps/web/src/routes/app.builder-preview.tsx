import { useEffect, useState } from 'react';
import { redirect, useParams } from 'react-router';
import { requireAuth } from '@/lib/require-auth';
import { builderRequest, type BuilderDocument, type BuilderRecord } from '@/lib/builder-document';
import { AppShell } from '@/components/app/app-shell';
import { BuilderJourneyPreview } from '@/components/app/builder/builder-journey-preview';
import '@/styles/scheduled-classes.css';
import '@/styles/scheduled-student-workspace.css';
import '@/styles/builder-workspace.css';
import '@/styles/builder-classroom-preview.css';

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
	return <div className="bd-preview-page sc-page sc-student-page">
		<header className="bd-preview-page-header sc-heading">
			<div><small>PRATINJAU MAHASISWA</small><h1>{document?.title||'Memuat draf…'}</h1></div>

		</header>
		{error ? <p role="alert">{error}</p> : !document ? <p role="status">Memuat draf…</p> :
			<div className={mobile ? 'bd-preview-frame is-classroom is-mobile' : 'bd-preview-frame is-classroom'}>
				<BuilderJourneyPreview document={document} exitTo={`/app/builder/${id}`} tools={<div className="bd-inline-actions">
				<button className="bd-secondary" aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button>
				<button className="bd-secondary" aria-pressed={mobile} onClick={() => setMobile(true)}>Ponsel</button>
			</div>} />
			</div>}
	</div>;
}
