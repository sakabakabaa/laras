import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
	ArrowRight,
	BookOpen,
	CalendarClock,
	CheckCircle2,
	Eye,
	Info,
	LoaderCircle,
	Lock,
	Repeat,
	Save,
	Sparkles,
	X,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import { errorMessage, type Course, type FileLibraryRecord, type SubCpmk } from '@/lib/learning';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { useCourseResources } from '@/hooks/use-course-resources';
import { useCourseRecords } from '@/hooks/use-course-records';
import {
	ACTIVITY_TYPE_LABEL,
	MODE_LABEL,
	parseStages,
	practiceTitleFor,
	SHAPE_LABEL,
	type Assignment,
	type AssignmentMode,
	type AssignmentShape,
	type AssignmentStage,
	type AssignmentStatus,
} from '@/lib/assignments';
import {
	emptyEditableConfig,
	splitTaskConfigForSave,
	TASK_KIND_LABEL,
	taskKindForShape,
	validateEditableConfig,
	type EditableTaskConfig,
	type TaskKind,
} from '@/lib/task-types';
import { FormStepper } from '@/components/form-stepper';
import { QuizBuilder } from '@/components/app/task-builders/quiz-builder';
import { ListeningBuilder } from '@/components/app/task-builders/listening-builder';
import { WritingBuilder } from '@/components/app/task-builders/writing-builder';
import { SpeakingBuilder } from '@/components/app/task-builders/speaking-builder';
import { ReadingBuilder } from '@/components/app/task-builders/reading-builder';
import { PracticeContentAutofill } from '@/components/app/practice-content-autofill';
import { MappingSelect, StatusMarks, type StatusDetail } from '@/components/app/form-status';

const PRACTICE_STEPS = [
	{ id: 1, label: 'Konteks tugas formal' },
	{ id: 2, label: 'Pengaturan latihan' },
	{ id: 3, label: 'Soal & konten' },
	{ id: 4, label: 'Pratinjau & terbitkan' },
];

const weekLabel = (week: number | undefined) => String(week || '—').padStart(2, '0');

/**
 * Lightweight Latihan formatif creator built from a main Tugas formal. The
 * main task is the source of truth: its course, Pertemuan, Sub-CPMK, topic,
 * instructions, task type, stages, materials, and rubric are prefilled and
 * shown read-only with a link back to the main task. Only settings unique to a
 * formative practice are editable — practice mode, the practice's own
 * questions/config, Cek jawaban feedback timing, optional Panduan AI, and
 * status. A short review step precedes creation, and the saved practice is
 * linked to the main task (parentAssignment) while keeping an independent
 * inherited snapshot — it is never overwritten when the main task changes
 * unless the lecturer explicitly re-copies from the edit flow.
 *
 * The form is split into five clearly separated steps so each major section
 * has its own step: inherited context, formative settings, prompt & content
 * (with optional AI generation grounded only in the approved inherited
 * academic context), preview, and status/publish.
 */
export function PracticeAutofillForm({
	parent,
	onClose,
	onSaved,
}: {
	parent: Assignment;
	onClose: () => void;
	onSaved: () => void;
}) {
	const me = pb.authStore.record?.id || '';
	const courseId = parent.course;

	// ── Editable formative-only settings (sensible defaults) ──
	const [mode, setMode] = useState<AssignmentMode>(parent.mode || 'individual');
	const [checkOn, setCheckOn] = useState(parent.checkEnabled !== false);
	const [checkMaxInput, setCheckMaxInput] = useState(String(parent.checkMax || 5));
	const [aiAssistOn, setAiAssistOn] = useState(Boolean(parent.aiAssistEnabled));
	const [status] = useState<AssignmentStatus>('draft');
	const [step, setStep] = useState(1);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [aiNotes, setAiNotes] = useState<string[]>([]);

	// The practice's own question/config — never copied from the main task.
	const builderKind = taskKindForShape(parent.shape);
	const [taskCfg, setTaskCfg] = useState<EditableTaskConfig | null>(() => {
		const kind = taskKindForShape(parent.shape);
		return kind ? emptyEditableConfig(kind) : null;
	});
	// Defensive: keep config in sync with the inherited shape kind.
	useEffect(() => {
		const kind = taskKindForShape(parent.shape);
		if (!kind || (taskCfg && taskCfg.kind === kind)) return;
		setTaskCfg(emptyEditableConfig(kind));
	}, [parent.shape, taskCfg]);

	// ── Read-only inherited context (loaded for display only) ──
	const courseQuery = useCachedQuery<Course>(
		courseId ? `courses:one=${courseId}` : null,
		() => pb.collection('courses').getOne<Course>(courseId),
	);
	const courseLabel = courseQuery.data
		? `${courseQuery.data.code ? `${courseQuery.data.code} · ` : ''}${courseQuery.data.title}`
		: '';
	const { sessions, resources } = useCourseResources(courseId || undefined);
	const records = useCourseRecords(courseId || undefined);
	const libraryQuery = useCachedQuery<FileLibraryRecord[]>(
		courseId ? `file_library:course=${courseId}` : null,
		() =>
			pb.collection('file_library').getFullList<FileLibraryRecord>({
				filter: pb.filter('course = {:id}', { id: courseId }),
				sort: '-updated',
			}),
	);
	const libraryFiles = libraryQuery.data ?? [];

	const selectedSession = useMemo(
		() => sessions.find((s) => s.id === parent.session) || parent.expand?.session,
		[sessions, parent.session, parent.expand?.session],
	);
	const selectedSub = useMemo(
		() =>
			records.subCpmk.find((s) => s.id === parent.subCpmk) ||
			(parent.expand?.subCpmk as SubCpmk | undefined),
		[records.subCpmk, parent.subCpmk, parent.expand?.subCpmk],
	);
	const parentCpmk = selectedSub?.cpmk
		? records.cpmk.find((c) => c.id === selectedSub.cpmk)
		: undefined;
	const parentCpl = parentCpmk?.cpl
		? records.cpl.find((c) => c.id === parentCpmk.cpl)
		: undefined;

	const inheritedStages: AssignmentStage[] = parseStages(parent.stages);
	const inheritedAttachments = parent.attachments || [];
	const previewMaterials = libraryFiles.filter((f) => inheritedAttachments.includes(f.id));
	const inheritedTitle = practiceTitleFor(parent);
	const checkMaxValue = Math.min(Math.max(parseInt(checkMaxInput, 10) || 5, 1), 10);

	const builderReady = Boolean(builderKind && taskCfg?.kind === builderKind);
	const builderWarnings = taskCfg ? validateEditableConfig(taskCfg) : [];

	const aiSupported = Boolean(
		builderKind && builderKind !== 'reading' && parent.session && parent.subCpmk,
	);

	const canAdvance =
		step === 1
			? true
			: step === 2
				? true
				: step === 3
					? Boolean(parent.shape) && (!builderKind || builderReady)
					: true;

	const previewMissing: string[] = [];
	if (!parent.shape) previewMissing.push('Tugas formal belum memiliki jenis tugas.');
	if (builderKind && (!taskCfg || taskCfg.kind !== builderKind))
		previewMissing.push(`Konfigurasi ${builderKind ? TASK_KIND_LABEL[builderKind] : ''} belum lengkap.`);

	const step1Warn: StatusDetail[] = [];
	if (courseQuery.error) step1Warn.push({ id: 'course-err', text: courseQuery.error });
	if (records.error) step1Warn.push({ id: 'records-err', text: records.error });

	const save = async (
		event: React.FormEvent<HTMLFormElement> | null,
		nextStatus?: AssignmentStatus,
	) => {
		event?.preventDefault();
		const saveStatus = nextStatus ?? status;
		setError('');
		if (!parent.shape) {
			setError('Tugas formal belum memiliki jenis tugas — tidak dapat membuat latihan.');
			return;
		}
		const kind = taskKindForShape(parent.shape);
		let split: { taskConfig: Record<string, unknown>; answerKey: unknown } | null = null;
		if (kind) {
			if (!taskCfg || taskCfg.kind !== kind) {
				setError(`Lengkapi konfigurasi ${TASK_KIND_LABEL[kind]} pada langkah Soal & konten.`);
				setStep(3);
				return;
			}
			const warnings = validateEditableConfig(taskCfg);
			if (warnings.length > 0 && saveStatus !== 'draft') {
				setError(
					`Perbaiki konfigurasi ${TASK_KIND_LABEL[kind]} sebelum menerbitkan — ${warnings[0].message} Simpan sebagai draf untuk meninjau lebih dulu.`,
				);
				setStep(3);
				return;
			}
			split = splitTaskConfigForSave(taskCfg);
		}
		setBusy(true);
		try {
			const data: Record<string, unknown> = {
				title: inheritedTitle.trim(),
				mode,
				activityType: 'formative',
				shape: parent.shape,
				status: saveStatus,
				instructions: (parent.instructions || '').trim(),
				requirements: (parent.requirements || '').trim(),
				groupInfo: (parent.groupInfo || '').trim(),
				session: parent.session || '',
				subCpmk: parent.subCpmk || '',
				// Formative practice: no final submission deadline.
				deadline: '',
				stages: inheritedStages.filter((s) => s.label.trim()),
				attachments: inheritedAttachments,
				course: courseId,
				owner: me,
				parentAssignment: parent.id,
				checkEnabled: checkOn,
				checkMax: checkMaxValue,
				aiAssistEnabled: aiAssistOn,
				...(split ? { taskConfig: split.taskConfig } : {}),
			};
			const created = await pb.collection('assignments').create<Assignment>(data);
			// Upsert the owner-only answer key for auto-gradable types.
			if (split && created.id) {
				const existing = await pb
					.collection('task_answer_keys')
					.getFirstListItem(`assignment = "${created.id}"`)
					.catch(() => null);
				if (existing) {
					await pb.collection('task_answer_keys').update(existing.id, { key: split.answerKey });
				} else {
					await pb.collection('task_answer_keys').create({
						assignment: created.id,
						key: split.answerKey,
					});
				}
			}
			invalidate('assignments');
			invalidate('task_answer_keys');
			onSaved();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	const footHint = (() => {
		switch (step) {
			case 1:
				return 'Konteks tugas formal hanya-tampil dan diwariskan dari tugas formal. Lanjut untuk mengatur pengaturan khas latihan formatif.';
			case 2:
				return 'Atur hanya pengaturan khas latihan formatif. Semua pengaturan memiliki nilai bawaan yang wajar.';
			case 3:
				return 'Soal latihan adalah milik latihan ini — tidak disalin dari tugas formal. Anda dapat menyusunnya dengan AI atau mengisinya manual.';
			case 4:
				return 'Periksa pratinjau latihan, lalu simpan sebagai draf atau terbitkan.';
			default:
				return 'Simpan sebagai draf atau terbitkan. Latihan ditautkan ke tugas formal tetapi tetap mandiri.';
		}
	})();

	return (
		<div className="asg-editor">
			<form onSubmit={save} className="asg-editor-form">
				<header className="asg-editor-head">
					<div>
						<span className="ld-eyebrow">TUGAS / LATIHAN PERSIAPAN</span>
						<h1>Buat latihan persiapan</h1>
					</div>
					<div className="asg-editor-actions">
						<button type="button" className="ld-outline-action" onClick={onClose}>
							<X size={16} /> Tutup
						</button>
					</div>
				</header>

				<div className="asg-editor-body">
					<FormStepper
						ariaLabel="Langkah pembuatan latihan persiapan"
						current={step}
						steps={PRACTICE_STEPS}
						canSelect={(id) => id < step}
						onSelect={setStep}
					/>

					<div className="asg-copy-note" role="status">
						<Info size={15} />
						<div>
							<strong>
								Latihan persiapan untuk tugas formal “{parent.title}”.
							</strong>
							<span>
								Konteks tugas formal (mata kuliah, pertemuan, Sub-CPMK, topik, instruksi, jenis
								tugas, tahapan, materi, dan rubrik) diisi otomatis dan hanya-tampil. Anda hanya
								mengatur pengaturan khas latihan formatif. Latihan ini berulang, tanpa pengumpulan
								final, dan tidak berdampak pada nilai resmi.{' '}
								<Link to={`/app/tugas/${parent.id}`} className="ld-text-btn">
									Buka tugas formal
								</Link>
							</span>
						</div>
					</div>

					<div className="asg-wsummary">
						<span className="asg-tag">
							<Lock size={11} /> {courseLabel || 'Memuat mata kuliah...'}
						</span>
						{selectedSession && (
							<span className="asg-tag">
								<Lock size={11} /> Minggu {weekLabel(selectedSession.week)} · {selectedSession.title}
							</span>
						)}
						{selectedSub && (
							<span className="asg-tag">
								<Lock size={11} /> Sub-CPMK {selectedSub.code || selectedSub.description}
							</span>
						)}
						{parent.shape && (
							<span className="asg-tag mode">{SHAPE_LABEL[parent.shape]}</span>
						)}
					</div>

					{/* ── Step 1: Konteks tugas formal (read-only inherited) ── */}
					{step === 1 && (
						<section className="asg-section" aria-label="Konteks warisan dari tugas formal">
							<h3>
								<Lock size={14} /> Konteks dari tugas formal
							</h3>
							<p className="rps-help">
								Bidang berikut diambil dari tugas formal “{parent.title}” dan tidak dapat
								diubah di sini — edit tugas formal bila perlu. Latihan menyimpan salinan
								mandiri; perubahan tugas formal setelah ini tidak menimpa latihan kecuali Anda
								memilihnya secara eksplisit saat mengedit.
							</p>
							<div className="asg-map-summary">
								<div className="asg-map-row">
									<small>Mata kuliah</small>
									<span>{courseLabel || 'Memuat mata kuliah...'}</span>
								</div>
								<div className="asg-map-row">
									<small>Pertemuan</small>
									<span>
										{selectedSession
											? `Minggu ${weekLabel(selectedSession.week)} — ${selectedSession.title}`
											: 'Tidak terhubung'}
									</span>
								</div>
								<div className="asg-map-row">
									<small>Sub-CPMK</small>
									<span>
										{selectedSub
											? `${selectedSub.code ? `${selectedSub.code} — ` : ''}${selectedSub.description}`
											: 'Tidak terhubung'}
									</span>
								</div>
								<div className={`asg-map-row${parentCpmk ? '' : ' missing'}`}>
									<small>CPMK</small>
									<span>
										{parentCpmk
											? `${parentCpmk.code ? `${parentCpmk.code} — ` : ''}${parentCpmk.description}`
											: 'Belum terhubung ke CPMK'}
									</span>
								</div>
								<div className={`asg-map-row${parentCpl ? '' : ' missing'}`}>
									<small>CPL</small>
									<span>
										{parentCpl
											? `${parentCpl.code ? `${parentCpl.code} — ` : ''}${parentCpl.description}`
											: 'Belum dapat diturunkan'}
									</span>
								</div>
								<div className="asg-map-row">
									<small>Topik</small>
									<span>{inheritedTitle}</span>
								</div>
								<div className="asg-map-row">
									<small>Jenis tugas</small>
									<span>{parent.shape ? SHAPE_LABEL[parent.shape] : '—'}</span>
								</div>
							</div>
							{parent.instructions?.trim() && (
								<div className="asg-preview-block">
									<small>Instruksi</small>
									<p>{parent.instructions}</p>
								</div>
							)}
							{parent.requirements?.trim() && (
								<div className="asg-preview-block">
									<small>Ketentuan &amp; rubrik</small>
									<p>{parent.requirements}</p>
								</div>
							)}
							{inheritedStages.filter((s) => s.label.trim()).length > 0 && (
								<div className="asg-preview-block">
									<small>Tahapan</small>
									<div className="asg-stages">
										{inheritedStages
											.filter((s) => s.label.trim())
											.map((s, i) => (
												<span key={i} className="asg-stage">
													<small>{i + 1}</small>
													{s.label}
												</span>
											))}
									</div>
								</div>
							)}
							{previewMaterials.length > 0 && (
								<div className="asg-preview-block">
									<small>Materi</small>
									<ul className="asg-preview-materials">
										{previewMaterials.map((r) => (
											<li key={r.id}>
												<BookOpen size={13} /> {r.title}
											</li>
										))}
									</ul>
								</div>
							)}
							{step1Warn.length > 0 && <StatusMarks warn={step1Warn} />}
						</section>
					)}

					{/* ── Step 2: Pengaturan latihan formatif ── */}
					{step === 2 && (
						<section className="asg-section" aria-label="Pengaturan latihan formatif">
							<h3>Pengaturan latihan</h3>
							<p className="rps-help">
								Atur hanya yang khas untuk latihan formatif. Semua pengaturan memiliki nilai
								bawaan yang wajar — Anda dapat langsung menyimpan tanpa mengubah apa pun.
							</p>

							<MappingSelect
								label="Mode latihan"
								value={mode}
								onChange={(value) => setMode(value as AssignmentMode)}
								placeholder="Pilih mode latihan"
								options={[
									{ value: 'individual', label: 'Individu — tiap mahasiswa berlatih sendiri' },
									{ value: 'collaborative', label: 'Kelompok — latihan bersama' },
								]}
							/>

							<label className="asg-toggle">
								<input
									type="checkbox"
									checked={checkOn}
									onChange={(e) => setCheckOn(e.target.checked)}
								/>
								<span>
									<strong>Aktifkan Cek jawaban</strong>
									<small>
										Pemeriksaan formatif dengan panduan bertahap — tanpa memberikan
										jawaban. Latihan dapat dikerjakan berulang.
									</small>
								</span>
							</label>
							{checkOn && (
								<label>
									BATAS PEMERIKSAAN PER PESERTA
									<input
										type="number"
										min={1}
										max={10}
										value={checkMaxInput}
										onChange={(e) => setCheckMaxInput(e.target.value)}
									/>
								</label>
							)}

							<label className="asg-toggle">
								<input
									type="checkbox"
									checked={aiAssistOn}
									onChange={(e) => setAiAssistOn(e.target.checked)}
								/>
								<span>
									<strong>Aktifkan Panduan AI latihan</strong>
									<small>
										Bantuan AI tambahan (petunjuk, saran, draf umpan balik formatif)
										berlandaskan instruksi dan materi mata kuliah — selalu berlabel
										panduan, bukan penilaian resmi.
									</small>
								</span>
							</label>
							{!aiAssistOn && (
								<p className="asg-shape-note">
									<Info size={13} /> Nonaktif secara bawaan — aktifkan hanya bila Anda ingin
									mahasiswa mendapat panduan AI pada latihan ini.
								</p>
							)}

							<p className="asg-map-ok">
								<CheckCircle2 size={14} /> Latihan formatif tanpa pengumpulan final — tidak
								berdampak pada nilai resmi.
							</p>
						</section>
					)}

					{/* ── Step 3: Soal & konten (builder + AI generation) ── */}
					{step === 3 && (
						<>
							<section className="asg-section" aria-label="Soal dan konten latihan">
								<div className="asg-section-head">
									<h3>Soal &amp; konten latihan</h3>
								</div>
								<p className="rps-help">
									Soal latihan adalah milik latihan ini — tidak disalin dari tugas formal.
									Tambahkan minimal satu soal sebelum menerbitkan, atau simpan sebagai draf.
									Anda dapat menyusun draf dengan AI dari konteks tugas formal, lalu
									menyuntingnya sebelum menyimpan.
								</p>

								{!parent.shape && (
									<StatusMarks
										bad={[
											{
												id: 'no-shape',
												text: 'Tugas formal belum memiliki jenis tugas — tidak ada builder yang tersedia.',
											},
										]}
									/>
								)}

								{!builderKind && parent.shape && (
									<p className="asg-shape-note">
										<Info size={13} /> Jenis tugas ini tidak memiliki builder khusus — soal
										diatur melalui instruksi dan ketentuan tugas formal yang diwariskan.
									</p>
								)}

								{aiSupported && builderKind && taskCfg?.kind === builderKind && (
									<PracticeContentAutofill
										courseId={courseId}
										sessionId={parent.session}
										subCpmkId={parent.subCpmk}
										shape={parent.shape as AssignmentShape}
										kind={builderKind}
										taskCfg={taskCfg}
										onTaskCfg={setTaskCfg}
										onNotes={setAiNotes}
									/>
								)}

								{!aiSupported && builderKind && builderKind !== 'reading' && (
									<p className="asg-shape-note">
										<Info size={13} /> Susun dengan AI tidak tersedia — pemetaan akademik
										(pertemuan/Sub-CPMK) tugas formal belum lengkap. Isi soal manual di bawah.
									</p>
								)}
							</section>

							{builderKind && taskCfg?.kind === builderKind && (
								<section
									className="asg-section tkb-section"
									aria-label={`Konfigurasi ${TASK_KIND_LABEL[builderKind]}`}
								>
									<div className="asg-section-head">
										<h3>Konfigurasi {TASK_KIND_LABEL[builderKind]}</h3>
										{aiSupported && (
											<span className="asg-shape-note">
												<Sparkles size={13} /> Dapat disusun dengan AI di atas
											</span>
										)}
									</div>
									{taskCfg.kind === 'quiz' && (
										<QuizBuilder
											value={taskCfg.quiz}
											onChange={(quiz) => setTaskCfg({ kind: 'quiz', quiz })}
										/>
									)}
									{taskCfg.kind === 'listening' && (
										<ListeningBuilder
											value={taskCfg.listening}
											onChange={(listening) => setTaskCfg({ kind: 'listening', listening })}
											resources={resources}
										/>
									)}
									{taskCfg.kind === 'writing' && (
										<WritingBuilder
											value={taskCfg.writing}
											onChange={(writing) => setTaskCfg({ kind: 'writing', writing })}
										/>
									)}
									{taskCfg.kind === 'speaking' && (
										<SpeakingBuilder
											value={taskCfg.speaking}
											heading="Konfigurasi berbicara"
											lead="Prompt lisan, durasi, cara pengumpulan, dan rubrik."
											onChange={(speaking) => setTaskCfg({ kind: 'speaking', speaking })}
										/>
									)}
									{taskCfg.kind === 'reading' && (
										<ReadingBuilder
											value={taskCfg.reading}
											onChange={(reading) => setTaskCfg({ kind: 'reading', reading })}
										/>
									)}
									{builderWarnings.length > 0 && (
										<StatusMarks
											warn={builderWarnings.slice(0, 6).map((w, i) => ({ id: `cfg-${i}`, text: w.message }))}
										/>
									)}
								</section>
							)}
						</>
					)}

					{/* ── Step 4: Pratinjau ── */}
					{step === 4 && (
						<section className="asg-section" aria-label="Pratinjau latihan">
							<div className="asg-section-head">
								<h3>Pratinjau latihan</h3>
								<span className="asg-shape-note">
									<Eye size={13} /> Tampilan ringkas seperti yang dilihat mahasiswa
								</span>
							</div>
							<div className="asg-preview">
								<div className="asg-preview-head">
									<span className="asg-type-chip formative">
										<Repeat size={12} /> {ACTIVITY_TYPE_LABEL.formative}
									</span>
									<strong>{inheritedTitle}</strong>
									<small>
										{courseLabel || 'Mata kuliah'}
										{selectedSession
											? ` · Minggu ${weekLabel(selectedSession.week)} — ${selectedSession.title}`
											: ''}
										{parent.shape ? ` · ${SHAPE_LABEL[parent.shape]}` : ''}
									</small>
									<div className="asg-preview-meta">
										<span className="asg-tag">{MODE_LABEL[mode]}</span>
										<span className="asg-tag formative">Berulang · tanpa nilai</span>
									</div>
								</div>
								{parent.instructions?.trim() && (
									<div className="asg-preview-block">
										<small>Instruksi</small>
										<p>{parent.instructions}</p>
									</div>
								)}
								{parent.requirements?.trim() && (
									<div className="asg-preview-block">
										<small>Kriteria latihan</small>
										<p>{parent.requirements}</p>
									</div>
								)}
								{inheritedStages.filter((s) => s.label.trim()).length > 0 && (
									<div className="asg-preview-block">
										<small>Tahapan</small>
										<div className="asg-stages">
											{inheritedStages
												.filter((s) => s.label.trim())
												.map((s, i) => (
													<span key={i} className="asg-stage">
														<small>{i + 1}</small>
														{s.label}
													</span>
												))}
										</div>
									</div>
								)}
								{previewMaterials.length > 0 && (
									<div className="asg-preview-block">
										<small>Materi</small>
										<ul className="asg-preview-materials">
											{previewMaterials.map((r) => (
												<li key={r.id}>
													<BookOpen size={13} /> {r.title}
												</li>
											))}
										</ul>
									</div>
								)}
								<p className="asg-shape-note">
									<Repeat size={13} /> Latihan berulang
									{checkOn
										? ` dengan Cek jawaban (maks ${checkMaxValue} per peserta)`
										: ' tanpa Cek jawaban'}
									{aiAssistOn ? ' dan Panduan AI latihan' : ''} — tanpa pengumpulan final,
									tanpa nilai resmi.
								</p>
							</div>
							{aiNotes.length > 0 && (
								<StatusMarks warn={aiNotes.map((note, i) => ({ id: `ain-${i}`, text: note }))} />
							)}
							{(previewMissing.length > 0 || (builderWarnings.length > 0 && status !== 'draft')) && (
								<StatusMarks
									bad={previewMissing.map((item, i) => ({ id: `miss-${i}`, text: item }))}
									warn={
										status !== 'draft'
											? builderWarnings.slice(0, 6).map((w, i) => ({ id: `bw-${i}`, text: w.message }))
											: []
									}
								/>
							)}
						</section>
					)}

					{/* Tautan tugas formal — ditampilkan bersama pratinjau */}
					{step === 4 && (
						<section className="asg-section" aria-label="Tautan tugas formal">
							<div className="asg-map-summary">
								<div className="asg-map-row">
									<small>Tugas formal terkait</small>
									<span>
										{parent.title}{' '}
										<Link to={`/app/tugas/${parent.id}`} className="ld-text-btn">
											Buka
										</Link>
									</span>
								</div>
								<div className="asg-map-row">
									<small>Status tautan</small>
									<span>
										Latihan ini tetap mandiri — perubahan tugas formal tidak menimpa isi
										latihan, dan latihan tidak memengaruhi nilai tugas formal.
									</span>
								</div>
							</div>
						</section>
					)}

					{error && (
						<p className="form-error" role="alert">
							{error}
						</p>
					)}
				</div>

				<footer className="asg-editor-foot">
					<div className="asg-dialog-foot-left">
						<p>
							<CalendarClock size={13} /> {footHint}
						</p>
					</div>
					<div className="asg-dialog-actions">
						{step > 1 && (
							<button
								type="button"
								className="ld-btn-quiet"
								onClick={() => setStep(step - 1)}
								disabled={busy}
							>
								Kembali
							</button>
						)}
						{step < 4 && (
							<button
								type="button"
								className="ld-btn-primary"
								onClick={() => setStep(step + 1)}
								disabled={!canAdvance}
							>
								Lanjut <ArrowRight size={15} />
							</button>
						)}
						{step < 4 && (
							<button type="submit" className="ld-outline-action sm" disabled={busy}>
								{busy ? <LoaderCircle className="spin" size={16} /> : <Save size={15} />} Simpan draf
							</button>
						)}
						{step === 4 && (
							<>
								<button type="button" className="ld-outline-action" disabled={busy} onClick={() => void save(null, 'draft')}>
									{busy ? <LoaderCircle className="spin" size={16} /> : <Save size={15} />} Simpan draf
								</button>
								<button type="button" className="ld-btn-primary" disabled={busy || previewMissing.length > 0} onClick={() => void save(null, 'published')}>
									{busy ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={15} />} Terbitkan
								</button>
							</>
						)}
					</div>
				</footer>
			</form>
		</div>
	);
}
