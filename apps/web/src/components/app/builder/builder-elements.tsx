import { useState, type Dispatch, type SetStateAction } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ScheduledLessonView } from '../scheduled-lesson';
import { ScheduledCardMatching } from '../scheduled-card-matching';
import {
	appendQuestion,
	plain,
	questionIds,
	rich,
	uid,
	type BuilderBlock,
	type BuilderEnvelope,
	type BuilderQuestion,
} from '@/lib/builder-document';
import type {
	BilingualText,
	LessonScene,
	ScheduledLesson,
} from '@/lib/scheduled-lesson';

import { BuilderClassroomMatching, BuilderClassroomQuestions, matchingPictures } from './builder-classroom-blocks';
import { BuilderMediaEditor, BuilderMediaView } from './builder-media';

type Change = (edit: (draft: BuilderEnvelope) => void) => void;
const safeUrl = (url?: string) =>
	url && /^https:\/\/[^\s<>"']+$/i.test(url) ? url : '';
export function BlockEditor({
	block,
	envelope,
	onChange,
}: {
	block: BuilderBlock;
	envelope: BuilderEnvelope;
	onChange: Change;
}) {
	const [bulk, setBulk] = useState('');
	const [bulkKind, setBulkKind] = useState<'short_answer' | 'single_choice'>(
		'short_answer',
	);
	const update = (edit: (b: BuilderBlock) => void) =>
		onChange((d) => {
			for (const a of d.document.activities) {
				const b = a.blocks.find((x) => x.id === block.id);
				if (b) {
					edit(b);
					return;
				}
			}
		});
	const editQuestion = (id: string, edit: (q: BuilderQuestion) => void) =>
		onChange((d) => edit(d.document.questionsById[id]));
	const addQuestion = (kind: BuilderQuestion['kind']) =>
		onChange((d) => {
			const id = appendQuestion(d, kind);
			for (const a of d.document.activities) {
				const b = a.blocks.find((b) => b.id === block.id);
				if (b) {
					b.questionIds = [...(b.questionIds || []), id];
					return;
				}
			}
		});
	const removeQuestion = (id: string) =>
		onChange((d) => {
			for (const a of d.document.activities) {
				const b = a.blocks.find((b) => b.id === block.id);
				if (b) b.questionIds = b.questionIds?.filter((q) => q !== id);
			}
			delete d.document.questionsById[id];
			delete d.privateKeys.answersByQuestionId[id];
		});
	if (block.type === 'instructions' || block.type === 'acknowledgement')
		return (
			<label>
				{block.type === 'instructions' ? 'Isi instruksi' : 'Teks konfirmasi'}
				<textarea
					rows={block.type === 'instructions' ? 4 : 2}
					maxLength={20000}
					placeholder="Tulis langsung di sini…"
					value={plain(block.body)}
					onChange={(e) =>
						update((b) => {
							b.body = rich(e.target.value);
						})
					}
				/>
			</label>
		);
	if (['image', 'audio', 'video'].includes(block.type))
		return (
			<BuilderMediaEditor
				block={block}
				courseId={envelope.document.context.courseId}
				onUpdate={update}
			/>
		);
	if (block.type === 'reference')
		return (
			<div className="bd-fields">
				<label>
					Judul / keterangan
					<input
						maxLength={500}
						value={block.label || ''}
						onChange={(e) =>
							update((b) => {
								b.label = e.target.value;
							})
						}
					/>
				</label>
				<label>
					Tautan HTTPS
					<input
						type="url"
						placeholder="https://…"
						maxLength={2000}
						value={block.url || ''}
						onChange={(e) =>
							update((b) => {
								b.url = e.target.value;
							})
						}
					/>
				</label>

				<p className="bd-help">
					Gunakan tautan media yang diizinkan untuk mahasiswa. Pemilihan sumber
					privat tidak otomatis membagikan berkasnya.
				</p>
			</div>
		);
	if (block.type === 'lesson')
		return (
			<LessonEditor
				value={
					block.lesson || { goal: { de: '', id: '' }, steps: [], scenes: [] }
				}
				onChange={(value) =>
					update((b) => {
						b.lesson = value;
					})
				}
			/>
		);
	if (block.type === 'gap_passage')
		return (
			<div className="bd-fields">
				<p className="bd-help">
					Susun teks dan isian. Kunci setiap isian ada di panel penilaian.
				</p>
				{block.sections?.map((s) => (
					<div key={s.id} className="bd-gap-editor">
						{s.segments.map((seg, i) =>
							seg.type === 'text' ? (
								<label key={i}>
									Teks
									<textarea
										rows={2}
										maxLength={20000}
										value={seg.text}
										onChange={(e) =>
											update((b) => {
												const t = b.sections!.find((row) => row.id === s.id)!
													.segments[i];
												if (t.type === 'text') t.text = e.target.value;
											})
										}
									/>
								</label>
							) : (
								<div className="bd-gap-token" key={seg.questionId}>
									<span>Isian {i}</span>
									<input
										aria-label="Petunjuk isian"
										placeholder="Petunjuk isian"
										value={plain(
											envelope.document.questionsById[seg.questionId]?.prompt,
										)}
										onChange={(e) =>
											editQuestion(seg.questionId, (q) => {
												q.prompt = rich(e.target.value);
											})
										}
									/>
									<button
										type="button"
										className="bd-icon"
										aria-label="Hapus isian"
										onClick={() =>
											onChange((d) => {
												for (const a of d.document.activities) {
													const b = a.blocks.find((b) => b.id === block.id);
													const part = b?.sections?.find((p) => p.id === s.id);
													if (part) part.segments.splice(i, 1);
												}
												delete d.document.questionsById[seg.questionId];
												delete d.privateKeys.answersByQuestionId[
													seg.questionId
												];
											})
										}
									>
										<Trash2 size={14} />
									</button>
								</div>
							),
						)}
					</div>
				))}
				<button
					type="button"
					className="bd-secondary"
					onClick={() =>
						onChange((d) => {
							const id = appendQuestion(d, 'short_answer');
							d.document.questionsById[id].prompt = rich('Isian baru');
							for (const a of d.document.activities) {
								const b = a.blocks.find((b) => b.id === block.id);
								if (b)
									b.sections![0].segments.push(
										{ type: 'gap', questionId: id },
										{ type: 'text', text: ' ' },
									);
							}
						})
					}
				>
					<Plus size={14} />
					Tambah isian
				</button>
			</div>
		);
	return (
		<div className="bd-fields">
			{block.type === 'matching' && (
				<fieldset className="bd-destinations">
					<legend>Kelompok tujuan</legend>
					{block.destinations?.map((t) => (
						<div key={t.id}>
							<label>
								Label
								<input
									maxLength={100}
									value={t.label}
									onChange={(e) =>
										update((b) => {
											b.destinations!.find((x) => x.id === t.id)!.label =
												e.target.value;
										})
									}
								/>
							</label>
							<label>
								Nama kelompok
								<input
									maxLength={1000}
									value={t.title}
									onChange={(e) =>
										update((b) => {
											b.destinations!.find((x) => x.id === t.id)!.title =
												e.target.value;
										})
									}
								/>
							</label>
							<label>
								Gambar (HTTPS, opsional)
								<input
									type="url"
									value={t.url || ''}
									onChange={(e) =>
										update((b) => {
											b.destinations!.find((x) => x.id === t.id)!.url =
												e.target.value;
										})
									}
								/>
							</label>
							<button
								type="button"
								className="bd-icon"
								disabled={(block.destinations?.length || 0) <= 2}
								aria-label={`Hapus kelompok ${t.title}`}
								onClick={() =>
									onChange((d) => {
										for (const a of d.document.activities) {
											const b = a.blocks.find((b) => b.id === block.id);
											if (b)
												b.destinations = b.destinations?.filter(
													(x) => x.id !== t.id,
												);
										}
										for (const qid of block.questionIds || []) {
											const key = d.privateKeys.answersByQuestionId[qid];
											if (key.correctDestinationId === t.id)
												key.correctDestinationId = '';
										}
									})
								}
							>
								<Trash2 size={14} />
							</button>
						</div>
					))}
					<button
						type="button"
						className="bd-secondary"
						onClick={() =>
							update((b) => {
								b.destinations!.push({
									id: uid(),
									label: String.fromCharCode(65 + b.destinations!.length),
									title: 'Kelompok baru',
								});
							})
						}
					>
						<Plus size={14} />
						Tambah kelompok
					</button>
				</fieldset>
			)}
			{block.type === 'question_group' && (
				<details className="bd-bulk">
					<summary>Tempel beberapa pertanyaan</summary>
					<label>
						Jenis pertanyaan
						<select
							value={bulkKind}
							onChange={(e) => setBulkKind(e.target.value as typeof bulkKind)}
						>
							<option value="short_answer">Jawaban singkat</option>
							<option value="single_choice">Pilihan ganda</option>
						</select>
					</label>
					<label>
						Satu pertanyaan per baris
						<textarea
							rows={5}
							maxLength={20000}
							value={bulk}
							placeholder="1. Wie heißen Sie?
2. Wo wohnen Sie?"
							onChange={(e) => setBulk(e.target.value)}
						/>
					</label>
					<p className="bd-help">
						Pertanyaan baru ditambahkan setelah yang sudah ada. Lengkapi pilihan
						dan kunci setelah menambah.
					</p>
					<button
						className="bd-secondary"
						disabled={
							!bulk.trim() ||
							Object.keys(envelope.document.questionsById).length +
								bulk.split('\n').filter((line) => line.trim()).length >
								500
						}
						onClick={() => {
							const prompts = bulk
								.split('\n')
								.map((line) =>
									line.replace(/^\s*(?:\d+[.)]|[-•])\s*/, '').trim(),
								)
								.filter(Boolean);
							onChange((d) => {
								const b = d.document.activities
									.flatMap((a) => a.blocks)
									.find((b) => b.id === block.id)!;
								for (const prompt of prompts) {
									const id = appendQuestion(d, bulkKind);
									d.document.questionsById[id].prompt = rich(prompt);
									b.questionIds!.push(id);
								}
							});
							setBulk('');
						}}
					>
						Tambahkan {bulk.split('\n').filter((line) => line.trim()).length}{' '}
						pertanyaan
					</button>
				</details>
			)}
			{questionIds(block).map((id, index) => {
				const q = envelope.document.questionsById[id];
				if (!q) return null;
				return (
					<fieldset
						className="bd-question-editor"
						key={id}
						id={'builder-question-' + id}
					>
						<legend>
							{block.type === 'matching' ? 'Pernyataan' : 'Pertanyaan'}{' '}
							{index + 1}
						</legend>
						<p className="bd-question-scoring">
							{['rubric', 'feedback_only'].includes(
								envelope.privateKeys.answersByQuestionId[id]?.strategy,
							)
								? envelope.privateKeys.answersByQuestionId[id]?.strategy ===
									'feedback_only'
									? 'Tanpa nilai'
									: 'Dinilai dosen'
								: 'Otomatis'}{' '}
							· {q.points} poin
							{(() => {
								const k = envelope.privateKeys.answersByQuestionId[id];
								return (k?.strategy === 'single_choice' &&
									!k.correctOptionId) ||
									(k?.strategy === 'exact_text' &&
										!k.accepted?.some((v) => v.trim())) ||
									(k?.strategy === 'matching' && !k.correctDestinationId)
									? ' · Kunci belum lengkap'
									: '';
							})()}
						</p>
						<label>
							Pertanyaan
							<textarea
								rows={2}
								maxLength={20000}
								placeholder="Tulis pertanyaan…"
								value={plain(q.prompt)}
								onChange={(e) =>
									editQuestion(id, (x) => {
										x.prompt = rich(e.target.value);
									})
								}
							/>
						</label>
						{q.options?.map((o, i) => (
							<div className="bd-option-editor" key={o.id}>
								<span>{String.fromCharCode(65 + i)}</span>
								<input
									aria-label={`Pilihan ${i + 1}`}
									maxLength={2000}
									placeholder={`Pilihan ${i + 1}`}
									value={o.label}
									onChange={(e) =>
										editQuestion(id, (x) => {
											x.options!.find((v) => v.id === o.id)!.label =
												e.target.value;
										})
									}
								/>
								<button
									type="button"
									className="bd-icon"
									aria-label={`Hapus pilihan ${i + 1}`}
									disabled={q.options!.length <= 2}
									onClick={() =>
										onChange((d) => {
											d.document.questionsById[id].options = q.options!.filter(
												(v) => v.id !== o.id,
											);
											if (
												d.privateKeys.answersByQuestionId[id]
													.correctOptionId === o.id
											)
												d.privateKeys.answersByQuestionId[id].correctOptionId =
													'';
										})
									}
								>
									<Trash2 size={14} />
								</button>
							</div>
						))}
						{q.options && (
							<button
								type="button"
								className="bd-text-button"
								disabled={q.options.length >= 100}
								onClick={() =>
									editQuestion(id, (x) => {
										x.options!.push({ id: uid(), label: '' });
									})
								}
							>
								+ Tambah pilihan
							</button>
						)}
						{block.type !== 'writing' && (
							<button
								className="bd-text-button"
								type="button"
								onClick={() => removeQuestion(id)}
							>
								Hapus pertanyaan
							</button>
						)}
					</fieldset>
				);
			})}
			{block.type === 'question_group' ? (
				<div className="bd-inline-actions">
					<button
						type="button"
						className="bd-secondary"
						onClick={() => addQuestion('single_choice')}
					>
						+ Pilihan ganda
					</button>
					<button
						type="button"
						className="bd-secondary"
						onClick={() => addQuestion('short_answer')}
					>
						+ Jawaban singkat
					</button>
				</div>
			) : (
				['matching', 'reflection'].includes(block.type) && (
					<button
						type="button"
						className="bd-secondary"
						onClick={() =>
							addQuestion(block.type === 'matching' ? 'matching' : 'reflection')
						}
					>
						<Plus size={14} />
						Tambah {block.type === 'matching' ? 'pernyataan' : 'pertanyaan'}
					</button>
				)
			)}
		</div>
	);
}
export function KeyInspector({
	block,
	envelope,
	onChange,
}: {
	block: BuilderBlock;
	envelope: BuilderEnvelope;
	onChange: Change;
}) {
	return (
		<div className="bd-fields">
			<div className="bd-private-label">KUNCI & PENILAIAN · HANYA DOSEN</div>
			{!questionIds(block).length && (
				<p className="bd-help">
					Elemen ini tidak memiliki nilai. Pilih elemen pertanyaan untuk
					mengatur kunci dan poin.
				</p>
			)}
			{questionIds(block).map((id, index) => {
				const q = envelope.document.questionsById[id],
					key = envelope.privateKeys.answersByQuestionId[id];
				if (!q || !key) return null;
				const change = (edit: (draft: BuilderEnvelope) => void) =>
					onChange(edit);
				return (
					<fieldset className="bd-key" key={id} id={'builder-key-' + id}>
						<legend>Butir {index + 1}</legend>
						<p>{plain(q.prompt) || 'Pertanyaan belum diisi'}</p>
						<label className="bd-check">
							<input
								type="checkbox"
								checked={q.required}
								onChange={(e) =>
									change((d) => {
										d.document.questionsById[id].required = e.target.checked;
									})
								}
							/>
							Wajib dijawab
						</label>
						<>
							{q.kind === 'reflection' && (
								<label>
									Penilaian refleksi
									<select
										value={key.strategy}
										onChange={(e) =>
											change((d) => {
												d.privateKeys.answersByQuestionId[id] = {
													strategy: e.target.value as
														'rubric' | 'feedback_only',
													modelAnswer: rich(''),
													privateGuidance: rich(''),
												};
												d.document.questionsById[id].points =
													e.target.value === 'feedback_only' ? 0 : 1;
											})
										}
									>
										<option value="feedback_only">Tanpa nilai</option>
										<option value="rubric">Dinilai dosen</option>
									</select>
								</label>
							)}
							{key.strategy !== 'feedback_only' && (
								<label>
									Poin
									<input
										type="number"
										min={0}
										max={100000}
										step="any"
										disabled={Boolean(q.rubric?.criteria.length)}
										value={q.points}
										onChange={(e) =>
											change((d) => {
												d.document.questionsById[id].points = Number(
													e.target.value,
												);
											})
										}
									/>
								</label>
							)}
						</>
						{key.strategy === 'single_choice' && (
							<label>
								Jawaban benar
								<select
									value={key.correctOptionId || ''}
									onChange={(e) =>
										change((d) => {
											d.privateKeys.answersByQuestionId[id].correctOptionId =
												e.target.value;
										})
									}
								>
									<option value="">Pilih jawaban benar</option>
									{q.options?.map((o, i) => (
										<option key={o.id} value={o.id}>
											{String.fromCharCode(65 + i)} · {o.label || 'Belum diisi'}
										</option>
									))}
								</select>
							</label>
						)}
						{key.strategy === 'matching' && (
							<label>
								Pasangan benar
								<select
									value={key.correctDestinationId || ''}
									onChange={(e) =>
										change((d) => {
											d.privateKeys.answersByQuestionId[
												id
											].correctDestinationId = e.target.value;
										})
									}
								>
									<option value="">Pilih kelompok</option>
									{block.destinations?.map((t) => (
										<option key={t.id} value={t.id}>
											{t.label} · {t.title}
										</option>
									))}
								</select>
							</label>
						)}
						{key.strategy === 'exact_text' && (
							<>
								<label>
									Jawaban yang diterima
									<textarea
										rows={3}
										maxLength={20000}
										placeholder="Satu alternatif per baris"
										value={key.accepted?.join('\n') || ''}
										onChange={(e) =>
											change((d) => {
												d.privateKeys.answersByQuestionId[id].accepted =
													e.target.value.split('\n');
											})
										}
									/>
								</label>
								<label className="bd-check">
									<input
										type="checkbox"
										checked={key.comparison?.ignoreCase ?? true}
										onChange={(e) =>
											change((d) => {
												d.privateKeys.answersByQuestionId[id].comparison = {
													ignoreCase: e.target.checked,
													ignorePunctuation:
														key.comparison?.ignorePunctuation || false,
												};
											})
										}
									/>
									Abaikan huruf besar/kecil
								</label>
								<label className="bd-check">
									<input
										type="checkbox"
										checked={key.comparison?.ignorePunctuation || false}
										onChange={(e) =>
											change((d) => {
												d.privateKeys.answersByQuestionId[id].comparison = {
													ignoreCase: key.comparison?.ignoreCase ?? true,
													ignorePunctuation: e.target.checked,
												};
											})
										}
									/>
									Abaikan tanda baca
								</label>
								<p className="bd-help">
									Aksen tetap dibedakan. Spasi berlebih diabaikan.
								</p>
							</>
						)}
						{key.strategy === 'rubric' && (
							<>
								<div className="bd-rubric-editor">
									<strong>Rubrik penilaian</strong>
									{q.rubric?.criteria.map((criterion, index) => (
										<div className="bd-rubric-row" key={criterion.id}>
											<label>
												Kriteria {index + 1}
												<input
													maxLength={1000}
													value={criterion.label}
													onChange={(e) =>
														change((d) => {
															d.document.questionsById[id].rubric!.criteria[
																index
															].label = e.target.value;
														})
													}
												/>
											</label>
											<label>
												Poin maksimum
												<input
													type="number"
													min={0}
													max={100000}
													step="any"
													value={criterion.maxPoints}
													onChange={(e) =>
														change((d) => {
															const target = d.document.questionsById[id];
															target.rubric!.criteria[index].maxPoints = Number(
																e.target.value,
															);
															target.points = target.rubric!.criteria.reduce(
																(sum, c) => sum + c.maxPoints,
																0,
															);
														})
													}
												/>
											</label>
											<button
												className="bd-icon"
												aria-label={`Hapus kriteria ${index + 1}`}
												onClick={() =>
													change((d) => {
														const target = d.document.questionsById[id];
														target.rubric!.criteria.splice(index, 1);
														target.points = target.rubric!.criteria.reduce(
															(sum, c) => sum + c.maxPoints,
															0,
														);
													})
												}
											>
												<Trash2 size={14} />
											</button>
										</div>
									))}
									<button
										className="bd-secondary"
										disabled={(q.rubric?.criteria.length || 0) >= 30}
										onClick={() =>
											change((d) => {
												const target = d.document.questionsById[id];
												target.rubric ||= { criteria: [] };
												target.rubric.criteria.push({
													id: uid(),
													label: '',
													maxPoints: 1,
												});
												target.points = target.rubric.criteria.reduce(
													(sum, c) => sum + c.maxPoints,
													0,
												);
											})
										}
									>
										+ Tambah kriteria
									</button>
									<p className="bd-help">
										Poin pertanyaan mengikuti jumlah poin kriteria.
									</p>
								</div>

								<label>
									Contoh jawaban
									<textarea
										rows={4}
										value={plain(key.modelAnswer)}
										onChange={(e) =>
											change((d) => {
												d.privateKeys.answersByQuestionId[id].modelAnswer =
													rich(e.target.value);
											})
										}
									/>
								</label>
								<label>
									Panduan penilaian
									<textarea
										rows={4}
										value={plain(key.privateGuidance)}
										onChange={(e) =>
											change((d) => {
												d.privateKeys.answersByQuestionId[id].privateGuidance =
													rich(e.target.value);
											})
										}
									/>
								</label>
								<p className="bd-help">
									Jawaban terbuka dinilai dosen. Contoh jawaban menjadi
									referensi.
								</p>
							</>
						)}
						{['long_writing', 'reflection', 'short_answer'].includes(
							q.kind,
						) && (
							<label>
								Batas karakter
								<input
									type="number"
									min={1}
									max={100000}
									value={q.maxCharacters || 10000}
									onChange={(e) =>
										change((d) => {
											d.document.questionsById[id].maxCharacters = Number(
												e.target.value,
											);
										})
									}
								/>
							</label>
						)}
						{!['rubric', 'feedback_only'].includes(key.strategy) && (
							<label>
								Pembahasan (hanya dosen)
								<textarea
									rows={3}
									value={plain(key.explanation)}
									onChange={(e) =>
										change((d) => {
											d.privateKeys.answersByQuestionId[id].explanation = rich(
												e.target.value,
											);
										})
									}
								/>
							</label>
						)}
					</fieldset>
				);
			})}
		</div>
	);
}
function LessonEditor({
	value,
	onChange,
}: {
	value: ScheduledLesson;
	onChange: (v: ScheduledLesson) => void;
}) {
	const pair = (
		label: string,
		text: BilingualText,
		change: (v: BilingualText) => void,
	) => (
		<fieldset>
			<legend>{label}</legend>
			<label>
				Teks utama
				<textarea
					value={text.de}
					onChange={(e) => change({ ...text, de: e.target.value })}
				/>
			</label>
			<label>
				Terjemahan (opsional)
				<textarea
					value={text.id}
					onChange={(e) => change({ ...text, id: e.target.value })}
				/>
			</label>
		</fieldset>
	);
	const sceneChange = (i: number, edit: (s: LessonScene) => void) => {
		const next = structuredClone(value);
		edit(next.scenes[i]);
		onChange(next);
	};
	return (
		<div className="bd-fields">
			{pair('Tujuan', value.goal, (goal) => onChange({ ...value, goal }))}
			{value.scenes.map((s, i) => (
				<fieldset key={i}>
					<legend>Penjelasan {i + 1}</legend>
					{pair('Judul', s.title, (title) =>
						sceneChange(i, (x) => {
							x.title = title;
						}),
					)}
					{pair('Pengantar', s.intro, (intro) =>
						sceneChange(i, (x) => {
							x.intro = intro;
						}),
					)}
					{s.cards?.map((c, j) => (
						<div key={j}>
							<label>
								Label kartu
								<input
									value={c.label}
									onChange={(e) =>
										sceneChange(i, (x) => {
											x.cards![j].label = e.target.value;
										})
									}
								/>
							</label>
							{pair('Isi kartu', c.text, (text) =>
								sceneChange(i, (x) => {
									x.cards![j].text = text;
								}),
							)}
						</div>
					))}
					{s.cards && (
						<button
							type="button"
							className="bd-secondary"
							onClick={() =>
								sceneChange(i, (x) => {
									x.cards!.push({
										label: '',
										text: { de: '', id: '' },
										tone: 'neutral',
									});
								})
							}
						>
							+ Kartu penjelasan
						</button>
					)}
					{s.turns?.map((t, j) => (
						<div key={j}>
							<label>
								Peran
								<select
									value={t.role}
									onChange={(e) =>
										sceneChange(i, (x) => {
											x.turns![j].role = e.target.value as 'doctor' | 'patient';
										})
									}
								>
									<option value="doctor">Dokter / pembicara A</option>
									<option value="patient">Pasien / pembicara B</option>
								</select>
							</label>
							{pair('Dialog', t.text, (text) =>
								sceneChange(i, (x) => {
									x.turns![j].text = text;
								}),
							)}
						</div>
					))}
					{s.turns && (
						<button
							type="button"
							className="bd-secondary"
							onClick={() =>
								sceneChange(i, (x) => {
									x.turns!.push({ role: 'doctor', text: { de: '', id: '' } });
								})
							}
						>
							+ Giliran dialog
						</button>
					)}
					<button
						type="button"
						className="bd-text-button"
						onClick={() =>
							onChange({
								...value,
								scenes: value.scenes.filter((_, n) => n !== i),
							})
						}
					>
						Hapus penjelasan
					</button>
				</fieldset>
			))}
			<div className="bd-inline-actions">
				<button
					type="button"
					className="bd-secondary"
					onClick={() =>
						onChange({
							...value,
							scenes: [
								...value.scenes,
								{
									kind: 'comparison',
									title: { de: '', id: '' },
									intro: { de: '', id: '' },
									cards: [
										{ label: '', text: { de: '', id: '' }, tone: 'neutral' },
									],
								},
							],
						})
					}
				>
					+ Kartu penjelasan
				</button>
				<button
					type="button"
					className="bd-secondary"
					onClick={() =>
						onChange({
							...value,
							scenes: [
								...value.scenes,
								{
									kind: 'dialogue',
									title: { de: '', id: '' },
									intro: { de: '', id: '' },
									turns: [
										{ role: 'doctor', text: { de: '', id: '' } },
										{ role: 'patient', text: { de: '', id: '' } },
									],
								},
							],
						})
					}
				>
					+ Dialog
				</button>
			</div>
		</div>
	);
}
export function BuilderPreview({
	document: d,
	answers: suppliedAnswers,
	onAnswersChange,
	activityId,
	readOnly = false,
	live = false,
	classroom = false,
}: {
	document: BuilderEnvelope['document'];
	answers?: Record<string, string>;
	onAnswersChange?: Dispatch<SetStateAction<Record<string, string>>>;
	activityId?: string;
	readOnly?: boolean;
	live?: boolean;
	classroom?: boolean;
}) {
	const [localAnswers, setLocalAnswers] = useState<Record<string, string>>({});
	const answers = suppliedAnswers || localAnswers;
	const setAnswers: Dispatch<SetStateAction<Record<string, string>>> = (
		value,
	) => {
		if (readOnly) return;
		(onAnswersChange || setLocalAnswers)(value);
	};
	const question = (id: string) => {
		const q = d.questionsById[id];
		if (!q) return null;
		return (
			<fieldset className="bd-preview-question" key={id}>
				<legend>
					{plain(q.prompt) || 'Pertanyaan belum diisi'}
					{q.required && <span aria-label="wajib"> *</span>}
				</legend>
				{q.kind === 'single_choice' ? (
					q.options?.map((o) => (
						<label className="bd-check" key={o.id}>
							<input
								type="radio"
								name={'preview-' + id}
								checked={answers[id] === o.id}
								onChange={() => setAnswers((a) => ({ ...a, [id]: o.id }))}
							/>
							{o.label || 'Pilihan belum diisi'}
						</label>
					))
				) : (
					<textarea
						aria-label={plain(q.prompt) || 'Jawaban'}
						rows={q.kind === 'long_writing' ? 8 : 3}
						maxLength={q.maxCharacters || 10000}
						value={answers[id] || ''}
						onChange={(e) =>
							setAnswers((a) => ({ ...a, [id]: e.target.value }))
						}
					/>
				)}
			</fieldset>
		);
	};
	const render = (b: BuilderBlock) => {
		const url = safeUrl(b.url);
		switch (b.type) {
			case 'instructions':
                if (classroom && d.activities.find(a=>a.blocks.some(block=>block.id===b.id))?.blocks.find(block=>block.type==='instructions')?.id===b.id) return <section className="sc-activity-brief"><h3>Yang perlu Anda lakukan</h3><p className="sc-prose">{plain(b.body)||'Instruksi belum diisi'}</p></section>;
				return <p className="bd-prose">{plain(b.body) || 'Instruksi belum diisi'}</p>;
			case 'acknowledgement':
				return (
					<label className="bd-check">
						<input
							type="checkbox"
							checked={answers[b.id] === 'yes'}
							onChange={(e) =>
								setAnswers((a) => ({
									...a,
									[b.id]: e.target.checked ? 'yes' : '',
								}))
							}
						/>
						{plain(b.body)}
					</label>
				);
			case 'image':
			case 'audio':
			case 'video':
				return <BuilderMediaView block={b} />;
			case 'reference':
				return url ? (
					<a href={url} target="_blank" rel="noreferrer">
						{b.label || 'Buka referensi'} ↗
					</a>
				) : (
					<p>Referensi belum dipilih.</p>
				);
			case 'lesson':
				return b.lesson?.scenes.length ? (
					<ScheduledLessonView lesson={b.lesson} />
				) : (
					<p>Penjelasan belum diisi.</p>
				);
			case 'matching':
				if (classroom) {
                    const activity=d.activities.find(a=>a.blocks.some(block=>block.id===b.id));
                    const at=activity?.blocks.findIndex(block=>block.id===b.id)??-1;
                    const prior=activity?.blocks[at-1];
                    return <BuilderClassroomMatching key={b.id} block={b} document={d} images={matchingPictures(b,prior?.type==='image'?prior.images:undefined)} answers={answers} onChange={setAnswers}/>;
                }
				return b.destinations?.length && b.questionIds?.length ? (
					<ScheduledCardMatching
						sheet={{
							items: b.questionIds.map((id) => ({
								id,
								prompt:
									plain(d.questionsById[id]?.prompt) ||
									'Pernyataan belum diisi',
								type: 'select',
								options: b.destinations!.map((t) => t.id),
							})),
						}}
						targets={b.destinations.map((t) => ({
							value: t.id,
							title: `${t.label} · ${t.title}`,
							url: safeUrl(t.url),
						}))}
						responses={answers}
						onChange={setAnswers}
					/>
				) : (
					<p>Tambahkan kelompok dan pernyataan.</p>
				);
			case 'gap_passage':
				return (
					<div className="bd-prose">
						{b.sections?.map((s) => (
							<p key={s.id}>
								{s.segments.map((t, i) =>
									t.type === 'text' ? (
										<span key={i}>{t.text}</span>
									) : (
										<input
											className="bd-gap-input"
											key={t.questionId}
											aria-label={
												plain(d.questionsById[t.questionId]?.prompt) || 'Isian'
											}
											value={answers[t.questionId] || ''}
											onChange={(e) =>
												setAnswers((a) => ({
													...a,
													[t.questionId]: e.target.value,
												}))
											}
										/>
									),
								)}
							</p>
						))}
					</div>
				);
			default:
				return classroom ? <BuilderClassroomQuestions ids={questionIds(b)} document={d} answers={answers} onChange={setAnswers}/> : questionIds(b).map(question);
		}
	};
    if (classroom) return <div className="bd-student-preview bd-classroom-content">{d.activities.filter(a=>!activityId||a.id===activityId).map(a=><fieldset className="sc-fields" disabled={readOnly} key={a.id}>{a.blocks.map((b,i)=>{
        if(b.type==='image'&&a.blocks[i+1]?.type==='matching'&&matchingPictures(a.blocks[i+1],b.images))return null;
        return <div className={`bd-preview-block bd-classroom-block is-${b.type}`} key={b.id}>{render(b)}</div>;
    })}</fieldset>)}</div>;
	return (
		<div className="bd-student-preview">
			{!live && (
				<div className="bd-preview-banner">
					<span>Pratinjau — jawaban ini tidak dikirim ke kelas.</span>
					<button type="button" onClick={() => setAnswers({})}>
						Reset jawaban
					</button>
				</div>
			)}
			<h1>{d.title}</h1>
			<p className="bd-prose">{plain(d.instructions)}</p>
			{d.activities.map(
				(a, i) =>
					(!activityId || a.id === activityId) && (
						<fieldset
							disabled={readOnly}
							className="bd-preview-activity"
							key={a.id}
						>
							<header>
								<span>
									Kegiatan {i + 1}
									{d.kind === 'kelas' ? ` · ${a.plannedMinutes} menit` : ''}
								</span>
								<h2>{a.title}</h2>
							</header>
							{a.blocks.map((b) => (
								<div className="bd-preview-block" key={b.id}>
									{render(b)}
								</div>
							))}
						</fieldset>
					),
			)}
		</div>
	);
}
