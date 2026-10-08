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
	};
	speaking?: {
		prompt?: string;
		language?: string;
		durationMin?: number | null;
		criteria?: { label?: string; weight?: number }[];
	};
	error?: string;
};

type ScalarKey = 'prompt' | 'formatGuidance' | 'language';
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
	  };

const LISTENING_TYPE_SHORT: Record<ListeningQuestionType, string> = {
	mc: 'Pilihan ganda',
	short: 'Jawaban singkat',
	matching: 'Mencocokkan',
	transcription: 'Transkripsi',
};

const KIND_SCOPE: Record<TaskKind, string> = {
	quiz: 'soal pilihan ganda, poin, dan pengaturan pengerjaan',
	listening: 'pertanyaan menyimak bertahap',
	writing: 'prompt, panduan format & bahasa, panjang, format pengumpulan, dan rubrik khusus latihan ini',
	speaking: 'prompt lisan dan rubrik',
	reading: 'teks bacaan dan soal',
};

/**
 * Practice-scoped AI generator for the Latihan formatif's own task content
 * (soal, prompt, rubrik, format). It reuses the shared `/api/task-config-draft`
 * endpoint — already faculty-gated, ownership-verified, and grounded only in
 * the lecturer-approved inherited academic context (RPS + approved document
 * excerpts). It NEVER touches the inherited title/instructions (those stay
 * read-only snapshots of the formal task) and never invents answer keys,
 * media, timestamps, or transcripts. The lecturer reviews, edits, and
 * selectively applies each piece; nothing is saved or replaces existing
 * content without an explicit apply.
 */
export function PracticeContentAutofill({
	courseId,
	sessionId,
	subCpmkId,
	shape,
	kind,
	taskCfg,
	onTaskCfg,
	onNotes,
}: {
	courseId: string;
	sessionId: string;
	subCpmkId: string;
	shape: AssignmentShape;
	kind: TaskKind;
	taskCfg: EditableTaskConfig | null;
	onTaskCfg: (next: EditableTaskConfig) => void;
	onNotes: (notes: string[]) => void;
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
				if (taskCfg.kind === 'writing') {
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
			}
		}

		onTaskCfg(taskCfg);
		setAppliedCount(count);
		setPhase('done');
		onNotes([
			...notes,
			`${count} bagian draf AI diterapkan pada latihan ${TASK_KIND_LABEL[kind]} — tinjau hasilnya, tetapkan kunci jawaban bila perlu, lalu simpan.`,
		]);
	};

	const checkedCount = items.filter((item) => item.checked).length;

	return (
		<div className="taf-panel" aria-label={`Susun dengan AI ${TASK_KIND_LABEL[kind]}`}>
			<div className="taf-head">
				<Wand2 size={15} />
				<div>
					<h4>Susun konten latihan dengan AI — {TASK_KIND_LABEL[kind]}</h4>
					<p>
						Menyusun draf untuk <strong>satu latihan {TASK_KIND_LABEL[kind]}</strong> —{' '}
						{KIND_SCOPE[kind]} — hanya dari data RPS tugas formal (pertemuan, Sub-CPMK, indikator,
						materi) dan materi yang Anda setujui. Kunci jawaban, materi menyimak, dan penanda
						waktu tidak diarang — ditetapkan manual oleh Anda. Judul dan instruksi latihan tetap
						diwariskan dari tugas formal dan tidak diubah di sini.
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
							placeholder="mis. Fokus pada indikator pertemuan ini, soal ringan untuk latihan mandiri."
						/>
					</label>
					<div className="asg-tool-actions">
						<button type="button" className="ld-btn-primary" onClick={() => void generate()}>
							<Sparkles size={15} /> Susun konten dengan AI
						</button>
					</div>
				</div>
			)}

			{phase === 'loading' && (
				<p className="taf-loading">
					<LoaderCircle size={14} className="spin" /> Menyusun draf latihan dari data RPS tugas formal…
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
						Tinjau dan sunting tiap bagian draf di bawah, lalu pilih yang akan diterapkan ke latihan.
						Bagian yang mengganti isian manual Anda tidak dicentang otomatis. Soal dan kriteria
						ditambahkan ke daftar — tidak menghapus yang sudah ada. Tidak ada yang disimpan sampai
						Anda menerapkan dan menyimpan latihan.
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
										<span>Usulan kriteria rubrik latihan</span>
									) : (
										<span>Format pengumpulan yang diizinkan</span>
									)}
								</label>

								{item.kind === 'scalar' &&
									(item.multiline ? (
										<textarea
											rows={3}
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
								text: `${appliedCount} bagian draf diterapkan dan dapat disunting langsung di builder. Simpan latihan untuk menyimpan hasil tinjauan Anda.`,
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
