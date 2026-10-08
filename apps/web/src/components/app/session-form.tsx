import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import type { ClassSession } from '@/lib/learning';
import { errorMessage } from '@/lib/learning';
import { useCourseRecords } from '@/hooks/use-course-records';
import { useCourseSections } from '@/hooks/use-course-sections';
import { MultiSelect, type MultiSelectOption } from '@/components/app/multi-select';
import { AppModal } from '@/components/app/app-modal';

export function SessionForm({
	courseId,
	session,
	onClose,
	onSaved,
}: {
	courseId: string;
	session?: ClassSession;
	onClose: () => void;
	onSaved: () => void;
}) {
	const { cpl, cpmk, subCpmk, topics, assessments, loading } = useCourseRecords(courseId);
	const [title, setTitle] = useState(session?.title || '');
	const [week, setWeek] = useState(String(session?.week || ''));
	const [date, setDate] = useState(session?.date?.slice(0, 10) || '');
	const [topic, setTopic] = useState(session?.topic || '');
	const [notes, setNotes] = useState(session?.notes || '');
	const [specialWeekType, setSpecialWeekType] = useState<string>(
		session?.specialWeekType || 'normal',
	);
	const [learningIndicator, setLearningIndicator] = useState(session?.learningIndicator || '');
	const [learningMaterial, setLearningMaterial] = useState(session?.learningMaterial || '');
	const [assessmentMethod, setAssessmentMethod] = useState(session?.assessmentMethod || '');
	const [assessmentWeight, setAssessmentWeight] = useState<string>(
		session?.assessmentWeight == null ? '' : String(session.assessmentWeight),
	);
	const [synchronousMethod, setSynchronousMethod] = useState(session?.synchronousMethod || '');
	const [asynchronousMethod, setAsynchronousMethod] = useState(session?.asynchronousMethod || '');
	const [duration, setDuration] = useState(session?.duration || '');
	const [references, setReferences] = useState(session?.references || '');
	const [accessDateTime, setAccessDateTime] = useState(
		session?.accessDateTime ? String(session.accessDateTime).slice(0, 16) : '',
	);
	const [section, setSection] = useState(session?.section || '');
	const { sections } = useCourseSections(courseId);
	const [cpls, setCpls] = useState<string[]>(session?.cpls || []);
	const [cpmks, setCpmks] = useState<string[]>(session?.cpmks || []);
	const [subCpmkIds, setSubCpmkIds] = useState<string[]>(session?.subCpmks || []);
	const [topicIds, setTopicIds] = useState<string[]>(session?.topics || []);
	const [assessmentIds, setAssessmentIds] = useState<string[]>(session?.assessments || []);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	// Build a lookup so CPMK options can hint at their parent CPL label.
	const cplLabel = useMemo(() => {
		const map = new Map<string, string>();
		for (const item of cpl) map.set(item.id, item.code || item.description);
		return map;
	}, [cpl]);
	const cpmkLabel = useMemo(() => {
		const map = new Map<string, string>();
		for (const item of cpmk) map.set(item.id, item.code || item.description);
		return map;
	}, [cpmk]);

	const cplOptions: MultiSelectOption[] = useMemo(
		() =>
			cpl.map((item) => ({
				id: item.id,
				label: item.code ? `${item.code} — ${item.description}` : item.description,
			})),
		[cpl],
	);
	const cpmkOptions: MultiSelectOption[] = useMemo(
		() =>
			cpmk.map((item) => ({
				id: item.id,
				label: item.code ? `${item.code} — ${item.description}` : item.description,
				hint: item.cpl ? `menunjang ${cplLabel.get(item.cpl) || 'CPL'}` : undefined,
			})),
		[cpmk, cplLabel],
	);
	const subCpmkOptions: MultiSelectOption[] = useMemo(
		() =>
			subCpmk.map((item) => ({
				id: item.id,
				label: item.code ? `${item.code} — ${item.description}` : item.description,
				hint: item.cpmk ? `bagian dari ${cpmkLabel.get(item.cpmk) || 'CPMK'}` : undefined,
			})),
		[subCpmk, cpmkLabel],
	);
	const topicOptions: MultiSelectOption[] = useMemo(
		() =>
			topics.map((item) => ({
				id: item.id,
				label: item.code ? `${item.code} — ${item.description}` : item.description,
			})),
		[topics],
	);
	const assessmentOptions: MultiSelectOption[] = useMemo(
		() =>
			assessments.map((item) => ({
				id: item.id,
				label: item.code ? `${item.code} — ${item.description}` : item.description,
				hint:
					item.weight != null && !Number.isNaN(item.weight) ? `bobot ${item.weight}%` : undefined,
			})),
		[assessments],
	);

	// Keep selection tidy if records load after the form opens (e.g. editing an
	// existing session before the list resolves).
	useEffect(() => {
		if (loading) return;
		const clamp = (ids: string[], valid: string[]) =>
			ids.filter((id) => valid.includes(id));
		setCpls((ids) => clamp(ids, cpl.map((i) => i.id)));
		setCpmks((ids) => clamp(ids, cpmk.map((i) => i.id)));
		setSubCpmkIds((ids) => clamp(ids, subCpmk.map((i) => i.id)));
		setTopicIds((ids) => clamp(ids, topics.map((i) => i.id)));
		setAssessmentIds((ids) => clamp(ids, assessments.map((i) => i.id)));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loading]);

	const save = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setBusy(true);
		setError('');
		try {
			const data = {
				section: section || null,
				title: title.trim(),
				// `week` has min:1 — sending 0 (when the field is cleared) rejects the
				// whole update and silently blocks the date from saving. Fall back to
				// the stored week, or 1, so a cleared week never fails the save.
				week: week && Number(week) >= 1 ? Number(week) : session?.week ?? 1,
				date: date ? `${date} 00:00:00.000Z` : null,
				topic: topic.trim(),
				notes: notes.trim(),
				cpls,
				cpmks,
				subCpmks: subCpmkIds,
				topics: topicIds,
				assessments: assessmentIds,
				specialWeekType: specialWeekType || 'normal',
				learningIndicator: learningIndicator.trim(),
				learningMaterial: learningMaterial.trim(),
				assessmentMethod: assessmentMethod.trim(),
				assessmentWeight: assessmentWeight === '' ? null : Number(assessmentWeight),
				synchronousMethod: synchronousMethod.trim(),
				asynchronousMethod: asynchronousMethod.trim(),
				duration: duration.trim(),
				references: references.trim(),
				// `accessDateTime` comes from a datetime-local input as "YYYY-MM-DDTHH:MM".
			// Convert to PocketBase's native datetime format ("YYYY-MM-DD HH:MM:SS.000Z")
			// so the field validates — the bare "T"-separated form without a timezone
			// can be rejected and would block the whole update (including `date`).
			accessDateTime: accessDateTime
				? `${accessDateTime.replace('T', ' ')}:00.000Z`
				: null,
			};
			if (session) await pb.collection('class_sessions').update(session.id, data);
			else
				await pb.collection('class_sessions').create({
					...data,
					course: courseId,
					owner: pb.authStore.record?.id,
				});
			invalidate('class_sessions');
			onSaved();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	const hasRecords =
		cpl.length > 0 ||
		cpmk.length > 0 ||
		subCpmk.length > 0 ||
		topics.length > 0 ||
		assessments.length > 0;

	return (
		<AppModal open onClose={onClose} title={session ? 'Edit sesi' : 'Rencanakan sesi.'} className="form-modal-wide">
			<div className="modal-top">
					<span>SESI / {session ? 'EDIT' : 'BARU'}</span>
					<button type="button" aria-label="Tutup" onClick={onClose}>
						<X size={21} />
					</button>
				</div>
				<h2 id="session-form-title">{session ? 'Edit sesi' : 'Rencanakan sesi.'}</h2>
				<p>Petakan apa yang terjadi dalam pertemuan kelas ini.</p>
				<form onSubmit={save} className="editor-form">
					<label>
						JUDUL SESI <span>*</span>
						<input
							autoFocus
							required
							maxLength={200}
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="mis. Dasar-dasar pembelajaran"
						/>
					</label>
					<div className="form-two">
						<label>
							NOMOR MINGGU
							<input
								type="number"
								min="1"
								max="52"
								value={week}
								onChange={(e) => setWeek(e.target.value)}
								placeholder="mis. 4"
							/>
						</label>
						<label>
							TIPE MINGGU
							<select value={specialWeekType} onChange={(e) => setSpecialWeekType(e.target.value)}>
								<option value="normal">Pertemuan normal</option>
								<option value="uts">UTS (Ujian Tengah Semester)</option>
								<option value="uas">UAS (Ujian Akhir Semester)</option>
								<option value="khusus">Minggu khusus</option>
							</select>
						</label>
					</div>
					<label>
						TANGGAL PERTEMUAN
						<input
							type="date"
							value={date}
							onChange={(e) => setDate(e.target.value)}
						/>
						<small className="rps-field-hint">Tanggal ini tampil di kalender akademik dan detail sesi.</small>
					</label>
					{sections.length > 0 && (
						<label>
							KELAS
							<select value={section} onChange={(e) => setSection(e.target.value)}>
								<option value="">Semua kelas / tanpa kelas khusus</option>
								{sections.map((s) => (
									<option key={s.id} value={s.id}>{s.name}</option>
								))}
							</select>
						</label>
					)}
					<label>
						TANGGAL & WAKTU AKSES (opsional)
						<input
							type="datetime-local"
							value={accessDateTime}
							onChange={(e) => setAccessDateTime(e.target.value)}
						/>
					</label>
					<label>
						TOPIK
						<textarea
							rows={2}
							maxLength={2000}
							value={topic}
							onChange={(e) => setTopic(e.target.value)}
							placeholder="Apa yang akan dibahas?"
						/>
					</label>
					<label>
						INDIKATOR PEMBELAJARAN
						<textarea
							rows={2}
							maxLength={2000}
							value={learningIndicator}
							onChange={(e) => setLearningIndicator(e.target.value)}
							placeholder="Indikator capaian Sub-CPMK pada pertemuan ini"
						/>
					</label>
					<label>
						MATERI PEMBELAJARAN
						<textarea
							rows={2}
							maxLength={5000}
							value={learningMaterial}
							onChange={(e) => setLearningMaterial(e.target.value)}
							placeholder="Materi / pokok bahasan rinci"
						/>
					</label>
					<div className="form-two">
						<label>
							METODE SINKRONUS
							<input
								value={synchronousMethod}
								onChange={(e) => setSynchronousMethod(e.target.value)}
								placeholder="mis. Kuliah tatap muka"
							/>
						</label>
						<label>
							METODE ASINKRONUS
							<input
								value={asynchronousMethod}
								onChange={(e) => setAsynchronousMethod(e.target.value)}
								placeholder="mis. Diskusi LMS"
							/>
						</label>
					</div>
					<div className="form-two">
						<label>
							ASPEK / METODE PENILAIAN
							<textarea
								rows={2}
								maxLength={2000}
								value={assessmentMethod}
								onChange={(e) => setAssessmentMethod(e.target.value)}
								placeholder="Cara menilai capaian pertemuan ini"
							/>
						</label>
						<label>
							BOBOT PENILAIAN SESI (%)
							<input
								type="number"
								min="0"
								max="100"
								value={assessmentWeight}
								onChange={(e) => setAssessmentWeight(e.target.value)}
								placeholder="opsional, 0–100"
							/>
						</label>
					</div>
					<label>
						DURASI
						<input
							value={duration}
							onChange={(e) => setDuration(e.target.value)}
							placeholder="mis. 100 menit"
						/>
					</label>
					<label>
						REFERENSI
						<textarea
							rows={2}
							maxLength={5000}
							value={references}
							onChange={(e) => setReferences(e.target.value)}
							placeholder="Bahan bacaan / referensi pertemuan"
						/>
					</label>
					<label>
						CATATAN
						<textarea
							rows={3}
							maxLength={10000}
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Materi, aktivitas, pengingat..."
						/>
					</label>

					<div className="ms-section">
						<span className="ms-section-title">Tautan Capaian & Penilaian</span>
						{loading ? (
							<p className="ld-empty-sm">Memuat capaian mata kuliah…</p>
						) : hasRecords ? (
							<div className="ms-grid">
								<MultiSelect
									label="CPL"
									options={cplOptions}
									selected={cpls}
									onChange={setCpls}
									placeholder="Pilih capaian lulusan"
									emptyText="Belum ada CPL."
								/>
								<MultiSelect
									label="CPMK"
									options={cpmkOptions}
									selected={cpmks}
									onChange={setCpmks}
									placeholder="Pilih capaian mata kuliah"
									emptyText="Belum ada CPMK."
								/>
								<MultiSelect
									label="Sub-CPMK"
									options={subCpmkOptions}
									selected={subCpmkIds}
									onChange={setSubCpmkIds}
									placeholder="Pilih sub-CPMK"
									emptyText="Belum ada Sub-CPMK."
								/>
								<MultiSelect
									label="Topik"
									options={topicOptions}
									selected={topicIds}
									onChange={setTopicIds}
									placeholder="Pilih topik / materi"
									emptyText="Belum ada topik."
								/>
								<MultiSelect
									label="Komponen Penilaian"
									options={assessmentOptions}
									selected={assessmentIds}
									onChange={setAssessmentIds}
									placeholder="Pilih komponen penilaian"
									emptyText="Belum ada komponen penilaian."
								/>
							</div>
						) : (
							<p className="ld-empty-sm">
								Belum ada CPL/CPMK/topik/penilaian pada mata kuliah ini. Tambahkan dari tab
								RPS untuk menautkannya ke sesi.
							</p>
						)}
					</div>

					{error && (
						<p className="form-error" role="alert">
							{error}
						</p>
					)}
					<div className="modal-actions">
						<button type="button" className="ld-btn-quiet" onClick={onClose}>
							Batal
						</button>
						<button type="submit" className="ld-btn-primary" disabled={busy}>
							{busy ? (
								<LoaderCircle className="spin" size={18} />
							) : session ? (
								'Simpan perubahan'
							) : (
								'Tambah sesi'
							)}
						</button>
					</div>
				</form>
		</AppModal>
	);
}
