import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useCachedQuery } from '@/hooks/use-cached-query';
import pb from '@/lib/pocketbase-client';
import { blankBuilder, builderRequest, copyBuilder, copyScheduledToBuilder, uid, type BuilderRecord } from '@/lib/builder-document';
import { scheduledRequest } from '@/lib/scheduled-classes';

type CourseOption = { id: string; title: string; code: string };
type MeetingOption = { id: string; title: string; week: number; section: string };

export function BuilderClassStart() {
	const [params] = useSearchParams(), navigate = useNavigate();
	const [course, setCourse] = useState(params.get('course') || '');
	const [meeting, setMeeting] = useState(params.get('meeting') || '');
	const [busy, setBusy] = useState(false), [error, setError] = useState('');
	const command = useRef({ context: '', id: uid() }), saving = useRef(false);
	const source = params.get('source') || '', sourceSession = params.get('sourceSession') || '';
	const courses = useCachedQuery<CourseOption[]>('builder-course-options', () => pb.collection('courses').getFullList<CourseOption>({
		filter: pb.filter('owner={:u}', { u: pb.authStore.record?.id }), fields: 'id,title,code', sort: 'title',
	}));
	const meetings = useCachedQuery<MeetingOption[]>(course ? `builder-meetings:${course}` : null, () => pb.collection('class_sessions').getFullList<MeetingOption>({
		filter: pb.filter('course={:c}', { c: course }), fields: 'id,title,week,section', sort: 'week',
	}));
	const selectedMeeting = meetings.data?.find(item => item.id === meeting);
	const selectedCourse = courses.data?.find(item => item.id === course);
	const ready = Boolean(selectedCourse && selectedMeeting && !courses.loading && !meetings.loading && !courses.error && !meetings.error);
	const create = async () => {
		if (!ready || saving.current || !selectedMeeting) return;
		saving.current = true; setBusy(true); setError('');
		try {
			const context = { courseId: course, meetingId: meeting, sectionIds: selectedMeeting.section ? [selectedMeeting.section] : [] };
			const key = JSON.stringify({ context, source, sourceSession });
			if (command.current.context !== key) command.current = { context: key, id: uid() };
			let envelope = blankBuilder('kelas', course, meeting, context.sectionIds);
			envelope.document.title = selectedMeeting.title.slice(0, 200);
			if (sourceSession) {
				const state = await scheduledRequest(sourceSession, 'state');
				if (!state.owner) throw new Error('Sesi ini tidak tersedia untuk disalin.');
				envelope = copyScheduledToBuilder(state, context, window.location.origin);
			} else if (source) {
				envelope = copyBuilder(await builderRequest<BuilderRecord>('get', { id: source }), 'kelas', context);
			}
			const record = await builderRequest<BuilderRecord>('create', { ...envelope, commandId: command.current.id });
			navigate(`/app/builder/${record.id}${params.get('from') === 'book' ? '?tool=book' : ''}`);
		} catch (failure) { setError((failure as Error).message); }
		finally { saving.current = false; setBusy(false); }
	};
	return <div className="bd-new bd-class-start">
		<Link className="bd-back" to="/app/kelas-terjadwal"><ArrowLeft size={16} />Kembali ke kelas terjadwal</Link>
		<div className="bd-new-heading"><span className="bd-kicker">BUAT KELAS</span><h1>Pilih pertemuan</h1><p>Setelah ini, langsung susun kelas. AI, unggah buku, dan elemen tersedia di panel builder.</p></div>
		<form onSubmit={event => { event.preventDefault(); void create(); }}>
			<fieldset disabled={busy}>
				<label>1. Mata kuliah<select autoFocus required value={course} onChange={event => { setCourse(event.target.value); setMeeting(''); setError(''); }}>
					<option value="">{courses.loading ? 'Memuat mata kuliah…' : 'Pilih mata kuliah'}</option>
					{courses.data?.map(item => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}
				</select></label>
				<label>2. Pertemuan<select required disabled={!selectedCourse || meetings.loading} value={meeting} onChange={event => setMeeting(event.target.value)}>
					<option value="">{meetings.loading ? 'Memuat pertemuan…' : 'Pilih pertemuan'}</option>
					{meetings.data?.map(item => <option key={item.id} value={item.id}>Pertemuan {item.week} · {item.title}</option>)}
				</select></label>
				{selectedCourse && !meetings.loading && !meetings.error && !meetings.data?.length && <p>Belum ada pertemuan. <Link to={`/app/courses/${course}/mata-kuliah`}>Tambahkan pertemuan di mata kuliah.</Link></p>}
				{(source || sourceSession) && <p>Isi sumber akan disalin ke draf baru. Kelas asal, mahasiswa, jawaban, dan nilai tidak diubah.</p>}
				{(error || courses.error || meetings.error) && <p className="bd-error" role="alert">{error || courses.error || meetings.error}</p>}
				<footer><span>Draf pribadi · belum diterbitkan</span><button type="submit" className="bd-primary" disabled={!ready || busy}>{busy ? 'Membuka builder…' : 'Buka builder'}<ArrowRight size={16} /></button></footer>
			</fieldset>
		</form>
	</div>;
}
