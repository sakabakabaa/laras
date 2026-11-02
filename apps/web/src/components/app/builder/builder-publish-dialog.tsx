import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import pb from '@/lib/pocketbase-client';
import { builderIssues, type BuilderEnvelope } from '@/lib/builder-document';
import { deliveryRequest, type BuilderRunItem } from '@/lib/builder-delivery';

export function builderPublishWarnings(envelope: BuilderEnvelope): string[] {
	const { document } = envelope, delivery = document.delivery, warnings: string[] = [];
	if (document.kind === 'kelas') {
		const slot = (Date.parse(delivery.endsAt) - Date.parse(delivery.startsAt)) / 60000;
		const planned = document.activities.reduce((sum, activity) => sum + activity.plannedMinutes, 0);
		if (Number.isFinite(slot) && planned > slot) warnings.push(`Rencana ${planned} menit melebihi waktu kelas ${slot} menit. Durasi tidak diubah otomatis.`);
	} else {
		if (delivery.allowLate && !delivery.hardCloseAt) warnings.push('Kiriman terlambat diterima tanpa tanggal penutupan.');
		if (!delivery.allowLate && delivery.hardCloseAt) warnings.push('Kiriman terlambat tidak diizinkan: pengumpulan berakhir pada batas pengumpulan, bukan tanggal tutup tambahan.');
	}
	return warnings;
}

export function BuilderPublishDialog({ id, revision, envelope, busy, blocked, onClose, onPublish }: {
	id: string; revision: number; envelope: BuilderEnvelope; busy: boolean; blocked: boolean;
	onClose: () => void; onPublish: () => Promise<void>;
}) {
	const [details, setDetails] = useState<{ course: string; meeting: string; sections: string[]; prior: BuilderRunItem[] } | null>(null);
	const [error, setError] = useState(''), [acknowledged, setAcknowledged] = useState(false), [attempt, setAttempt] = useState(0);
	const document = envelope.document, delivery = document.delivery;
	useEffect(() => {
		let active = true;
		setDetails(null); setError(''); setAcknowledged(false);
		void Promise.all([
			pb.collection('courses').getOne<{ title: string }>(document.context.courseId, { fields: 'title' }),
			document.context.meetingId ? pb.collection('class_sessions').getOne<{ title: string }>(document.context.meetingId, { fields: 'title' }) : Promise.resolve(null),
			pb.collection('course_sections').getFullList<{ id: string; name: string }>({ filter: pb.filter('course={:course}', { course: document.context.courseId }), fields: 'id,name' }),
			deliveryRequest<{ items: BuilderRunItem[] }>('list', { documentId: id }),
		]).then(([course, meeting, sections, runs]) => {
			if (!active) return;
			const selected = document.context.sectionIds.map((sectionId) => sections.find((section) => section.id === sectionId)?.name);
			if (selected.some((section) => !section)) throw new Error('Rombel terpilih tidak tersedia. Tinjau konteks draf.');
			setDetails({ course: course.title, meeting: meeting?.title || 'Tidak terkait pertemuan', sections: selected as string[], prior: runs.items.filter((run) => run.revision === revision) });
		}).catch((failure: Error) => { if (active) setError(failure.message); });
		return () => { active = false; };
	}, [id, revision, document.context.courseId, document.context.meetingId, document.context.sectionIds, attempt]);
	const format = (value: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'full', timeStyle: 'short' }) + ' WIB' : 'Tidak ditentukan';
	const warnings = builderPublishWarnings(envelope), issues = builderIssues(envelope);
	return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
		<DialogContent className="bd-new bd-publish-dialog">
			<DialogHeader><DialogTitle>Tinjau penerbitan baru</DialogTitle><DialogDescription>Penerbitan membuat kegiatan baru dengan versi tetap. Kelas, tugas, jawaban, dan nilai yang sudah ada tidak diubah.</DialogDescription></DialogHeader>
			{error && <p role="alert">{error} <button className="bd-secondary" onClick={() => setAttempt((value) => value + 1)}>Coba lagi</button></p>}
			{!details && !error && <p role="status">Memeriksa audiens dan penerbitan sebelumnya…</p>}
			{details && <>
				<h2>{document.title} · Revisi {revision}</h2>
				<dl><dt>Mata kuliah</dt><dd>{details.course}</dd><dt>Pertemuan</dt><dd>{details.meeting}</dd><dt>Audiens</dt><dd>{details.sections.length ? details.sections.join(', ') : 'Semua mahasiswa terdaftar di mata kuliah'}</dd></dl>
				<dl>{(document.kind === 'kelas' ? [['Mulai', delivery.startsAt], ['Selesai', delivery.endsAt], ['Check-in ditutup', delivery.checkInClosesAt]] : [['Tersedia', delivery.availableAt], ['Batas pengumpulan', delivery.dueAt], ['Tutup efektif', delivery.allowLate ? delivery.hardCloseAt : delivery.dueAt]]).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{format(value)}</dd></div>)}</dl>
				<p>{Object.keys(document.questionsById).length} pertanyaan · {Object.values(document.questionsById).reduce((sum, question) => sum + question.points, 0)} poin{document.kind === 'tugas' && delivery.timeLimitMinutes > 0 ? ` · ${delivery.timeLimitMinutes} menit sejak mulai, tidak melewati penutupan efektif` : ''}</p>
				{details.prior.length > 0 && <div role="status"><strong>Revisi ini sudah diterbitkan {details.prior.length} kali.</strong><ul>{details.prior.map((run) => <li key={run.id}><Link to={`/app/kegiatan/${run.id}`}>Buka kegiatan yang sudah ada</Link></li>)}</ul></div>}
			</>}
			{warnings.length > 0 && <ul aria-label="Peringatan penerbitan">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
			{issues.length > 0 && <p role="alert">Ada {issues.length} bagian belum siap. Tutup dialog dan tinjau draf.</p>}
			<label className="bd-check"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={busy || !details} />Saya sudah memeriksa audiens dan jadwal, dan ingin membuat kegiatan baru.</label>
			<DialogFooter><button className="bd-secondary" disabled={busy} onClick={onClose}>Kembali meninjau</button><button className="bd-primary" disabled={busy || blocked || !details || !acknowledged || issues.length > 0} onClick={() => void onPublish()}>{busy ? 'Menerbitkan…' : 'Buat kegiatan baru'}</button></DialogFooter>
		</DialogContent>
	</Dialog>;
}
