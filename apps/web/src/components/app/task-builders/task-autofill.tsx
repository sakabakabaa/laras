import { useState } from 'react';
import { CheckCircle2, LoaderCircle, Sparkles, Wand2 } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { errorMessage } from '@/lib/learning';
import type { AssignmentShape } from '@/lib/assignments';
import {
	TASK_KIND_LABEL,
	type EditableTaskConfig,
	type ListeningQuestionType,
	type TaskKind,
} from '@/lib/task-types';
import type { StructuredAssignmentContent } from '@/lib/structured-assignment';
import { newRowId } from '@/components/app/task-builders/builder-shared';
import { StatusMarks } from '@/components/app/form-status';

type DraftResponse = {
	kind?: TaskKind;
	title?: string;
	instructions?: string;
	notes?: string[];
	quiz?: {
		questions?: { text?: string; options?: string[]; points?: number; explanation?: string }[];
		attempts?: number | null;
		timeLimitMin?: number | null;
	};
	listening?: {
		questions?: {
			type?: string;
			text?: string;
			options?: string[];
			pairs?: { left?: string; right?: string }[];
			points?: number;
		}[];
	};
	writing?: {
		prompt?: string;
		formatGuidance?: string;
		language?: string;
		minWords?: number | null;
		maxWords?: number | null;
		formats?: { allowText?: boolean; allowDocument?: boolean; allowPhotos?: boolean };
		criteria?: { label?: string; weight?: number }[];
		structured?: StructuredAssignmentContent | null;
	};
	speaking?: {
		prompt?: string;
		language?: string;
		durationMin?: number | null;
		criteria?: { label?: string; weight?: number }[];
		structured?: StructuredAssignmentContent | null;
	};
	error?: string;
};

type ScalarKey = 'title' | 'instructions' | 'prompt' | 'formatGuidance' | 'language';
type NumberKey = 'attempts' | 'timeLimitMin' | 'minWords' | 'maxWords' | 'durationMin';

type Item =
	| {
			kind: 'scalar';
			key: ScalarKey;
			label: string;
			value: string;
			checked: boolean;
			multiline: boolean;
			replaces: boolean;
	  }
	| {
			kind: 'number';
			key: NumberKey;
			label: string;
			value: number;
			checked: boolean;
			replaces: boolean;
	  }
	| {
			kind: 'question';
			key: string;
			checked: boolean;
			type: ListeningQuestionType;
			text: string;
			options: string[];
			pairs: { left: string; right: string }[];
			points: number;
			explanation: string;
	  }
	| { kind: 'criterion'; key: string; label: string; weight: number; checked: boolean }
	| {
			kind: 'formats';
			key: 'formats';
			checked: boolean;
			allowText: boolean;
			allowDocument: boolean;
			allowPhotos: boolean;
	  }
	| {
			kind: 'structured';
			key: 'structured';
			checked: boolean;
			summary: string;
			content: StructuredAssignmentContent;
	  };

const LISTENING_TYPE_SHORT: Record<ListeningQuestionType, string> = {
	mc: 'Pilihan ganda',
	short: 'Jawaban singkat',
	matching: 'Mencocokkan',
	transcription: 'Transkripsi',
};

const KIND_SCOPE: Record<TaskKind, string> = {
	quiz: 'judul, instruksi, soal pilihan ganda, poin, dan pengaturan pengerjaan',
	listening: 'judul, instruksi, dan pertanyaan menyimak bertahap',
	writing:
		'judul, instruksi, prompt, panduan format & bahasa, panjang, format pengumpulan, dan rubrik khusus tugas ini',
	speaking: 'judul, instruksi, prompt lisan, dan rubrik',
	reading: 'judul, instruksi, teks bacaan, dan soal',
};

/**
 * The ONE AI generator for a specialized task builder (Kuis / Menyimak /
 * Menulis): "Susun dengan AI". Gated on a complete academic mapping; produces
 * a single editable task draft (never a whole-course assessment plan) shown
 * in one reviewable panel with per-item accept/reject/edit before anything
 * touches the builder. Manually entered values are never overwritten unless
 * the lecturer explicitly checks the item.
 */
export function TaskAutofill({
	courseId,
	sessionId,
	subCpmkId,
	shape,
	kind,
	title,
	instructions,
	taskCfg,
	onTitle,
	onInstructions,
	onTaskCfg,
	onApplied,
}: {
	courseId: string;
	sessionId: string;
	subCpmkId: string;
	shape: AssignmentShape;
	kind: TaskKind;
	title: string;
	instructions: string;
	taskCfg: EditableTaskConfig | null;
	onTitle: (value: string) => void;
	onInstructions: (value: string) => void;
	onTaskCfg: (next: EditableTaskConfig) => void;
	onApplied: (notes: string[]) => void;
}) {
	const [phase, setPhase] = useState<'idle' | 'loading' | 'review' | 'done'>('idle');
	const [error, setError] = useState('');
	const [notes, setNotes] = useState<string[]>([]);
	const [items, setItems] = useState<Item[]>([]);
	const [appliedCount, setAppliedCount] = useState(0);
	const [hint, setHint] = useState('');

	const patch = (key: string, next: Item) => {
		setItems((prev) => prev.map((item) => (item.key === key ? next : item)));
	};

	const generate = async () => {
		setPhase('loading');
		setError('');
		try {
			const response = await fetch('/api/task-config-draft', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({
					courseId,
					sessionId,
					subCpmkId,
					shape,
					instruction: hint,
				}),
			});
			const body = (await response.json()) as DraftResponse;
			if (!response.ok) {
				setError(body.error || 'Draf AI gagal disusun.');
				setPhase('idle');
				return;
			}
			const draftNotes = (body.notes || []).filter((n) => typeof n === 'string' && n.trim());
			const next: Item[] = [];

			next.push({
				kind: 'scalar',
				key: 'title',
				label: 'Judul tugas',
				value: body.title || '',
				checked: Boolean(body.title) && !title.trim(),
				multiline: false,
				replaces: Boolean(title.trim()),
			});
			next.push({
				kind: 'scalar',
				key: 'instructions',
				label: 'Instruksi tugas',
				value: body.instructions || '',
				checked: Boolean(body.instructions) && !instructions.trim(),
				multiline: true,
				replaces: Boolean(instructions.trim()),
			});

			if (kind === 'quiz' && taskCfg?.kind === 'quiz') {
				const q = body.quiz;
				if (q?.attempts != null) {
					next.push({
						kind: 'number',
						key: 'attempts',
						label: 'Kesempatan pengerjaan',
						value: q.attempts,
						checked: taskCfg.quiz.attempts === 1 && q.attempts !== 1,
						replaces: taskCfg.quiz.attempts !== 1,
					});
				}
				if (q?.timeLimitMin != null) {
					next.push({
						kind: 'number',
						key: 'timeLimitMin',
						label: 'Batas waktu (menit)',
						value: q.timeLimitMin,
						checked: taskCfg.quiz.timeLimitMin === 0 && q.timeLimitMin > 0,
						replaces: taskCfg.quiz.timeLimitMin !== 0,
					});
				}
				(q?.questions || []).forEach((row, i) => {
					const text = (row.text || '').trim();
					const options = (row.options || []).map((o) => String(o || '').trim()).filter(Boolean);
					if (!text || options.length < 2) return;
					next.push({
						kind: 'question',
						key: `q-${i}`,
						checked: true,
						type: 'mc',
						text,
						options,
						pairs: [],
						points: Math.max(0, Math.min(100, Math.round(row.points || 1))) || 1,
						explanation: (row.explanation || '').trim(),
					});
				});
			}

			if (kind === 'listening' && taskCfg?.kind === 'listening') {
				(body.listening?.questions || []).forEach((row, i) => {
					const text = (row.text || '').trim();
					const typeRaw = row.type;
					const type: ListeningQuestionType =
						typeRaw === 'short' || typeRaw === 'matching' || typeRaw === 'transcription'
							? typeRaw
							: 'mc';
					const options =
						type === 'mc' ? (row.options || []).map((o) => String(o || '').trim()).filter(Boolean) : [];
					const pairs = (row.pairs || [])
						.map((p) => ({ left: (p.left || '').trim(), right: (p.right || '').trim() }))
						.filter((p) => p.left && p.right);
					if (!text) return;
					if (type === 'mc' && options.length < 2) return;
					if (type === 'matching' && pairs.length < 2) return;
					next.push({
						kind: 'question',
						key: `l-${i}`,
						checked: true,
						type,
						text,
						options,
						pairs,
						points: Math.max(0, Math.min(100, Math.round(row.points || 1))) || 1,
						explanation: '',
					});
				});
			}

			if (kind === 'writing' && taskCfg?.kind === 'writing') {
				const w = body.writing;
				if (w?.prompt?.trim()) {
					next.push({
						kind: 'scalar',
						key: 'prompt',
						label: 'Prompt menulis',
						value: w.prompt.trim(),
						checked: !taskCfg.writing.prompt.trim(),
						multiline: true,
						replaces: Boolean(taskCfg.writing.prompt.trim()),
					});
				}
				if (w?.formatGuidance?.trim()) {
					next.push({
						kind: 'scalar',
						key: 'formatGuidance',
						label: 'Panduan format & gaya',
						value: w.formatGuidance.trim(),
						checked: !taskCfg.writing.formatGuidance.trim(),
						multiline: true,
						replaces: Boolean(taskCfg.writing.formatGuidance.trim()),
					});
				}
				if (w?.language?.trim()) {
					next.push({
						kind: 'scalar',
						key: 'language',
						label: 'Bahasa',
						value: w.language.trim(),
						checked: !taskCfg.writing.language.trim(),
						multiline: false,
						replaces: Boolean(taskCfg.writing.language.trim()),
					});
				}
				if (w?.minWords != null && w.minWords > 0) {
					next.push({
						kind: 'number',
						key: 'minWords',
						label: 'Panjang minimal (kata)',
						value: w.minWords,
						checked: taskCfg.writing.minWords === 0,
						replaces: taskCfg.writing.minWords !== 0,
					});
				}
				if (w?.maxWords != null && w.maxWords > 0) {
					next.push({
						kind: 'number',
						key: 'maxWords',
						label: 'Panjang maksimal (kata)',
						value: w.maxWords,
						checked: taskCfg.writing.maxWords === 0,
						replaces: taskCfg.writing.maxWords !== 0,
					});
				}
				const f = w?.formats;
				if (f) {
					const allowText = f.allowText !== false;
					const allowDocument = f.allowDocument !== false;
					const allowPhotos = f.allowPhotos !== false;
					if (allowText || allowDocument || allowPhotos) {
						const defaultsUntouched =
							taskCfg.writing.allowText && taskCfg.writing.allowDocument && taskCfg.writing.allowPhotos;
						next.push({
							kind: 'formats',
							key: 'formats',
							checked: defaultsUntouched,
							allowText,
							allowDocument,
							allowPhotos,
						});
					}
				}
				(w?.criteria || []).forEach((c, i) => {
					const label = (c.label || '').trim();
					if (!label) return;
					next.push({
						kind: 'criterion',
						key: `c-${i}`,
						label,
						weight: Math.max(0, Math.min(100, Math.round(c.weight || 1))) || 1,
						checked: true,
					});
				});
				if (w?.structured) {
					next.push({
						kind: 'structured',
						key: 'structured',
						checked: !taskCfg.writing.structured,
						summary: w.structured.summary || '',
						content: w.structured,
					});
				}
			}

			if (kind === 'speaking' && taskCfg?.kind === 'speaking') {
				const sp = body.speaking;
				if (sp?.prompt?.trim()) {
					next.push({
						kind: 'scalar',
						key: 'prompt',
						label: 'Prompt / skenario',
						value: sp.prompt.trim(),
						checked: !taskCfg.speaking.prompt.trim(),
						multiline: true,
						replaces: Boolean(taskCfg.speaking.prompt.trim()),
					});
				}
				if (sp?.language?.trim()) {
					next.push({
						kind: 'scalar',
						key: 'language',
						label: 'Bahasa',
						value: sp.language.trim(),
						checked: !taskCfg.speaking.language.trim(),
						multiline: false,
						replaces: Boolean(taskCfg.speaking.language.trim()),
					});
				}
				if (sp?.durationMin != null && sp.durationMin > 0) {
					next.push({
						kind: 'number',
						key: 'durationMin',
						label: 'Durasi saran (menit)',
						value: sp.durationMin,
						checked: taskCfg.speaking.durationMin === 0,
						replaces: taskCfg.speaking.durationMin !== 0,
					});
				}
				(sp?.criteria || []).forEach((c, i) => {
					const label = (c.label || '').trim();
					if (!label) return;
					next.push({
						kind: 'criterion',
						key: `c-${i}`,
						label,
						weight: Math.max(0, Math.min(100, Math.round(c.weight || 1))) || 1,
						checked: true,
					});
				});
				if (sp?.structured) {
					next.push({
						kind: 'structured',
						key: 'structured',
						checked: !taskCfg.speaking.structured,
						summary: sp.structured.summary || '',
						content: sp.structured,
					});
				}
			}

			const usable = next.filter((item) =>
				item.kind === 'scalar' ? item.value.trim() !== '' : true,
			);
			if (usable.length === 0) {
				setNotes(draftNotes);
				setError(
					'Tidak ada draf yang bisa disusun dari data tersimpan. Lengkapi indikator/materi pertemuan atau isi manual.',
				);
				setPhase('idle');
				return;
			}
			setNotes(draftNotes);
			setItems(usable);
			setPhase('review');
		} catch (err) {
			setError(errorMessage(err));
			setPhase('idle');
		}
	};

	const apply = () => {
		if (!taskCfg || taskCfg.kind !== kind) {
			setError(`Konfigurasi ${TASK_KIND_LABEL[kind]} belum siap — tidak ada yang diterapkan.`);
			return;
		}
		let count = 0;
		const chosen = items.filter((item) => item.checked);

		for (const item of chosen) {
			if (item.kind === 'scalar') {
				if (item.key === 'title') onTitle(item.value.trim());
				else if (item.key === 'instructions') onInstructions(item.value.trim());
				else if (taskCfg.kind === 'writing') {
					if (item.key === 'prompt') taskCfg = { ...taskCfg, writing: { ...taskCfg.writing, prompt: item.value.trim() } };
					if (item.key === 'formatGuidance')
						taskCfg = { ...taskCfg, writing: { ...taskCfg.writing, formatGuidance: item.value.trim() } };
					if (item.key === 'language') taskCfg = { ...taskCfg, writing: { ...taskCfg.writing, language: item.value.trim() } };
				} else if (taskCfg.kind === 'speaking') {
					if (item.key === 'prompt') taskCfg = { ...taskCfg, speaking: { ...taskCfg.speaking, prompt: item.value.trim() } };
					if (item.key === 'language') taskCfg = { ...taskCfg, speaking: { ...taskCfg.speaking, language: item.value.trim() } };
				}
				count += 1;
			} else if (item.kind === 'number') {
				if (taskCfg.kind === 'quiz') {
					if (item.key === 'attempts') taskCfg = { ...taskCfg, quiz: { ...taskCfg.quiz, attempts: item.value } };
					if (item.key === 'timeLimitMin')
						taskCfg = { ...taskCfg, quiz: { ...taskCfg.quiz, timeLimitMin: item.value } };
				} else if (taskCfg.kind === 'writing') {
					if (item.key === 'minWords') taskCfg = { ...taskCfg, writing: { ...taskCfg.writing, minWords: item.value } };
					if (item.key === 'maxWords') taskCfg = { ...taskCfg, writing: { ...taskCfg.writing, maxWords: item.value } };
				} else if (taskCfg.kind === 'speaking') {
					if (item.key === 'durationMin') taskCfg = { ...taskCfg, speaking: { ...taskCfg.speaking, durationMin: item.value } };
				}
				count += 1;
			} else if (item.kind === 'question') {
				if (taskCfg.kind === 'quiz') {
					taskCfg = {
						...taskCfg,
						quiz: {
							...taskCfg.quiz,
							questions: [
								...taskCfg.quiz.questions,
								{
									id: newRowId('q'),
									text: item.text.trim(),
									options: item.options.map((o) => o.trim()).filter(Boolean),
									correctIndex: -1,
									points: item.points,
									explanation: item.explanation.trim(),
								},
							],
						},
					};
				} else if (taskCfg.kind === 'listening') {
					taskCfg = {
						...taskCfg,
						listening: {
							...taskCfg.listening,
							questions: [
								...taskCfg.listening.questions,
								{
									id: newRowId('l'),
									type: item.type,
									text: item.text.trim(),
									timestampSec: null,
									options: item.options.map((o) => o.trim()).filter(Boolean),
									correctIndex: -1,
									pairs: item.pairs.map((p) => ({ left: p.left.trim(), right: p.right.trim() })),
									expected: '',
									points: item.points,
								},
							],
						},
					};
				}
				count += 1;
			} else if (item.kind === 'criterion' && taskCfg.kind === 'writing') {
				taskCfg = {
					...taskCfg,
					writing: {
						...taskCfg.writing,
						criteria: [
							...taskCfg.writing.criteria,
							{ id: newRowId('c'), label: item.label.trim(), weight: item.weight },
						],
					},
				};
				count += 1;
			} else if (item.kind === 'criterion' && taskCfg.kind === 'speaking') {
				taskCfg = {
					...taskCfg,
					speaking: {
						...taskCfg.speaking,
						criteria: [
							...taskCfg.speaking.criteria,
							{ id: newRowId('c'), label: item.label.trim(), weight: item.weight },
						],
					},
				};
				count += 1;
			} else if (item.kind === 'formats' && taskCfg.kind === 'writing') {
				taskCfg = {
					...taskCfg,
					writing: {
						...taskCfg.writing,
						allowText: item.allowText,
						allowDocument: item.allowDocument,
						allowPhotos: item.allowPhotos,
					},
				};
				count += 1;
			} else if (item.kind === 'structured') {
				const nextStructured = { ...item.content, summary: item.summary.trim() };
				if (taskCfg.kind === 'writing') {
					taskCfg = { ...taskCfg, writing: { ...taskCfg.writing, structured: nextStructured } };
				} else if (taskCfg.kind === 'speaking') {
					taskCfg = { ...taskCfg, speaking: { ...taskCfg.speaking, structured: nextStructured } };
				}
				count += 1;
			}
		}

		onTaskCfg(taskCfg);
		setAppliedCount(count);
		setPhase('done');
		onApplied([
			...notes,
			`${count} bagian draf AI diterapkan pada tugas ${TASK_KIND_LABEL[kind]} — tinjau hasilnya, tetapkan kunci jawaban bila perlu, lalu simpan sebagai draf.`,
		]);
	};

	const checkedCount = items.filter((item) => item.checked).length;

	return (
		<div className="taf-panel" aria-label={`Susun dengan AI ${TASK_KIND_LABEL[kind]}`}>
			<div className="taf-head">
				<Wand2 size={15} />
				<div>
					<h4>Susun dengan AI — {TASK_KIND_LABEL[kind]}</h4>
					<p>
						Menyusun draf untuk <strong>satu tugas {TASK_KIND_LABEL[kind]}</strong> —{' '}
						{KIND_SCOPE[kind]} — hanya dari data RPS terpilih (pertemuan, Sub-CPMK, indikator,
						materi). Ini bukan rencana penilaian mata kuliah: komponen seperti UTS/UAS hanya
						jadi konteks, tidak disalin sebagai rubrik. Kunci jawaban, materi menyimak, dan
						penanda waktu tidak diarang — ditetapkan manual oleh Anda.
					</p>
				</div>
			</div>

			{phase === 'idle' && (
				<div className="taf-idle">
					<label className="taf-hint-field">
						Arahan singkat (opsional)
						<textarea
							rows={2}
							maxLength={800}
							value={hint}
							onChange={(e) => setHint(e.target.value)}
							placeholder="mis. Fokus pada indikator pertemuan ini, esai pendek untuk mahasiswa tahun pertama."
						/>
					</label>
					<div className="asg-tool-actions">
						<button type="button" className="ld-btn-primary" onClick={() => void generate()}>
							<Sparkles size={15} /> Susun dengan AI
						</button>
					</div>
				</div>
			)}

			{phase === 'loading' && (
				<p className="taf-loading">
					<LoaderCircle size={14} className="spin" /> Menyusun draf tugas dari data RPS tersimpan…
				</p>
			)}

			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}

			{phase === 'review' && (
				<div className="taf-review">
					{notes.length > 0 && (
						<StatusMarks warn={notes.map((note, i) => ({ id: `ai-${i}`, text: note }))} />
					)}
					<p className="taf-hint">
						Tinjau dan sunting tiap bagian draf di bawah, lalu pilih yang akan diterapkan.
						Bagian yang mengganti isian manual Anda tidak dicentang otomatis. Soal dan kriteria
						ditambahkan ke daftar — tidak menghapus yang sudah ada.
					</p>
					<ul className="taf-items">
						{items.map((item) => (
							<li key={item.key} className={`taf-item${item.checked ? ' checked' : ''}`}>
								<label className="taf-check">
									<input
										type="checkbox"
										checked={item.checked}
										onChange={(e) => patch(item.key, { ...item, checked: e.target.checked } as Item)}
										aria-label={`Terapkan bagian draf ${
											item.kind === 'scalar' || item.kind === 'number'
												? item.label
												: item.kind === 'formats'
													? 'format pengumpulan'
													: item.key
										}`}
									/>
									{item.kind === 'scalar' || item.kind === 'number' ? (
										<span>
											{item.label}
											{item.replaces && <em>mengganti isian manual Anda</em>}
										</span>
									) : item.kind === 'question' ? (
										<span>
											Usulan soal/pertanyaan
											{kind === 'listening' && <em>{LISTENING_TYPE_SHORT[item.type]}</em>}
										</span>
									) : item.kind === 'criterion' ? (
										<span>Usulan kriteria rubrik tugas</span>
									) : item.kind === 'structured' ? (
										<span>Ringkasan &amp; struktur tugas (Tugas kamu + Yang harus ada)</span>
									) : (
										<span>Format pengumpulan yang diizinkan</span>
									)}
								</label>

								{item.kind === 'scalar' &&
									(item.multiline ? (
										<textarea
											rows={item.key === 'instructions' ? 4 : 3}
											maxLength={10000}
											value={item.value}
											onChange={(e) => patch(item.key, { ...item, value: e.target.value })}
											aria-label={`Sunting draf ${item.label}`}
										/>
									) : (
										<input
											maxLength={200}
											value={item.value}
											onChange={(e) => patch(item.key, { ...item, value: e.target.value })}
											aria-label={`Sunting draf ${item.label}`}
										/>
									))}

								{item.kind === 'number' && (
									<input
										type="number"
										min={0}
										max={item.key === 'attempts' ? 10 : item.key === 'timeLimitMin' ? 180 : 20000}
										value={item.value}
										onChange={(e) => {
											const n = Number(e.target.value);
											patch(item.key, {
												...item,
												value: Number.isFinite(n) && n >= 0 ? Math.round(n) : 0,
											} as Item);
										}}
										aria-label={`Sunting draf ${item.label}`}
									/>
								)}

								{item.kind === 'question' && (
									<div className="taf-question">
										<textarea
											rows={2}
											maxLength={2000}
											value={item.text}
											onChange={(e) => patch(item.key, { ...item, text: e.target.value })}
											aria-label="Sunting teks usulan soal"
										/>
										{item.options.length > 0 && (
											<div className="taf-options">
												{item.options.map((option, oi) => (
													<input
														key={oi}
														maxLength={500}
														value={option}
														onChange={(e) =>
															patch(item.key, {
																...item,
																options: item.options.map((o, idx) => (idx === oi ? e.target.value : o)),
															})
														}
														placeholder={`Pilihan ${oi + 1}`}
														aria-label={`Sunting pilihan ${oi + 1}`}
													/>
												))}
											</div>
										)}
										{item.pairs.length > 0 && (
											<div className="taf-options">
												{item.pairs.map((pair, pi) => (
													<div key={pi} className="taf-pair">
														<input
															maxLength={200}
															value={pair.left}
															onChange={(e) =>
																patch(item.key, {
																	...item,
																	pairs: item.pairs.map((p, idx) => (idx === pi ? { ...p, left: e.target.value } : p)),
																})
															}
															placeholder="Pasangan kiri"
															aria-label={`Sunting pasangan kiri ${pi + 1}`}
														/>
														<input
															maxLength={200}
															value={pair.right}
															onChange={(e) =>
																patch(item.key, {
																	...item,
																	pairs: item.pairs.map((p, idx) => (idx === pi ? { ...p, right: e.target.value } : p)),
																})
															}
															placeholder="Pasangan kanan"
															aria-label={`Sunting pasangan kanan ${pi + 1}`}
														/>
													</div>
												))}
											</div>
										)}
										{kind === 'quiz' && (
											<textarea
												rows={2}
												maxLength={2000}
												className="tkb-explain"
												value={item.explanation}
												onChange={(e) => patch(item.key, { ...item, explanation: e.target.value })}
												placeholder="Pembahasan (opsional)"
												aria-label="Sunting pembahasan usulan soal"
											/>
										)}
										<label className="taf-points">
											Poin
											<input
												type="number"
												min={0}
												max={100}
												value={item.points}
												onChange={(e) => {
													const n = Number(e.target.value);
													patch(item.key, {
														...item,
														points: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0,
													} as Item);
												}}
												aria-label="Sunting poin usulan soal"
											/>
										</label>
									</div>
								)}

								{item.kind === 'criterion' && (
									<div className="taf-criterion">
										<input
											maxLength={200}
											value={item.label}
											onChange={(e) => patch(item.key, { ...item, label: e.target.value })}
											aria-label="Sunting label usulan kriteria"
										/>
										<label className="taf-points">
											Bobot
											<input
												type="number"
												min={0}
												max={100}
												value={item.weight}
												onChange={(e) => {
													const n = Number(e.target.value);
													patch(item.key, {
														...item,
														weight: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0,
													} as Item);
												}}
												aria-label="Sunting bobot usulan kriteria"
											/>
										</label>
									</div>
								)}

								{item.kind === 'formats' && (
									<div className="tkb-toggles taf-formats">
										<label className="tkb-toggle">
											<input
												type="checkbox"
												checked={item.allowText}
												onChange={(e) => patch(item.key, { ...item, allowText: e.target.checked } as Item)}
											/>
											<span>Teks langsung</span>
										</label>
										<label className="tkb-toggle">
											<input
												type="checkbox"
												checked={item.allowDocument}
												onChange={(e) => patch(item.key, { ...item, allowDocument: e.target.checked } as Item)}
											/>
											<span>Dokumen</span>
										</label>
										<label className="tkb-toggle">
											<input
												type="checkbox"
												checked={item.allowPhotos}
												onChange={(e) => patch(item.key, { ...item, allowPhotos: e.target.checked } as Item)}
											/>
											<span>Foto tulisan tangan</span>
										</label>
									</div>
								)}

								{item.kind === 'structured' && (
									<div className="taf-structured">
										<textarea
											rows={3}
											maxLength={1000}
											value={item.summary}
											onChange={(e) => patch(item.key, { ...item, summary: e.target.value })}
											aria-label="Sunting ringkasan tugas terstruktur"
										/>
										{item.content.requirements.length > 0 && (
											<ul className="taf-structured-reqs">
												{item.content.requirements.map((req) => (
													<li key={req.id}>
														{req.quantity ? <strong>{req.quantity} </strong> : null}
														{req.text}
													</li>
												))}
											</ul>
										)}
										{item.content.sections.length > 0 && (
											<p className="taf-structured-meta">
												{item.content.sections.length} bagian · {item.content.requirements.length} persyaratan
											</p>
										)}
									</div>
								)}
							</li>
						))}
					</ul>
					<div className="asg-tool-actions">
						<button type="button" className="ld-btn-primary" onClick={apply} disabled={checkedCount === 0}>
							<CheckCircle2 size={15} /> Terapkan {checkedCount > 0 ? `${checkedCount} bagian` : 'yang dipilih'}
						</button>
						<button
							type="button"
							className="ld-btn-quiet"
							onClick={() => {
								setPhase('idle');
								setItems([]);
								setNotes([]);
							}}
						>
							Abaikan draf
						</button>
					</div>
				</div>
			)}

			{phase === 'done' && (
				<div className="taf-done">
					<StatusMarks
						ok={[
							{
								id: 'applied',
								text: `${appliedCount} bagian draf diterapkan dan dapat disunting langsung di builder. Simpan sebagai draf untuk menyimpan hasil tinjauan Anda.`,
							},
						]}
					/>
					<button type="button" className="ld-text-btn" onClick={() => setPhase('idle')}>
						Susun ulang
					</button>
				</div>
			)}
		</div>
	);
}
