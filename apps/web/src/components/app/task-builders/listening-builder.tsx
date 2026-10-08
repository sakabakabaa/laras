import { Headphones, Link2, Plus, Trash2 } from 'lucide-react';
import type { CourseResource } from '@/lib/learning';
import { resourceFileUrl } from '@/lib/resources';
import {
	LISTENING_TYPE_LABEL,
	mediaResources,
	type ListeningConfig,
	type ListeningQuestionEditable,
	type ListeningQuestionType,
} from '@/lib/task-types';
import { NumberField, RowActions, newRowId } from '@/components/app/task-builders/builder-shared';
import { MappingSelect } from '@/components/app/form-status';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const TYPES: ListeningQuestionType[] = ['mc', 'short', 'matching', 'transcription'];

export type ListeningBuilderValue = Omit<ListeningConfig, 'questions'> & {
	questions: ListeningQuestionEditable[];
};

/**
 * Menyimak builder: pick audio/video material (existing course resource or an
 * external link), then add questions — multiple choice, short answer, matching,
 * or transcription — optionally anchored to a timestamp.
 */
export function ListeningBuilder({
	value,
	onChange,
	resources,
}: {
	value: ListeningBuilderValue;
	onChange: (next: ListeningBuilderValue) => void;
	resources: CourseResource[];
}) {
	const media = mediaResources(resources);
	const setQuestion = (i: number, patch: Partial<ListeningQuestionEditable>) => {
		onChange({ ...value, questions: value.questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)) });
	};
	const moveQuestion = (i: number, dir: -1 | 1) => {
		onChange({
			...value,
			questions: (() => {
				const next = [...value.questions];
				const j = i + dir;
				if (j < 0 || j >= next.length) return next;
				[next[i], next[j]] = [next[j], next[i]];
				return next;
			})(),
		});
	};
	const addQuestion = (type: ListeningQuestionType) => {
		onChange({
			...value,
			questions: [
				...value.questions,
				{
					id: newRowId('l'),
					type,
					text: '',
					timestampSec: null,
					options: type === 'mc' ? ['', '', '', ''] : [],
					correctIndex: -1,
					pairs: type === 'matching' ? [
						{ left: '', right: '' },
						{ left: '', right: '' },
					] : [],
					expected: '',
					points: 1,
				},
			],
		});
	};

	const selectedResource = media.find((r) => r.id === value.media.resourceId);

	return (
		<div className="tkb-builder">
			<div className="tkb-head">
				<Headphones size={16} />
				<div>
					<h3>Konfigurasi menyimak</h3>
					<p>Materi audio/video dan pertanyaan bertahap dengan penanda waktu.</p>
				</div>
			</div>

			<div className="tkb-media">
				<div className="tkb-media-tabs" role="tablist">
					<button
						type="button"
						role="tab"
						aria-selected={value.media.kind === 'resource'}
						className={value.media.kind === 'resource' ? 'active' : ''}
						onClick={() => onChange({ ...value, media: { ...value.media, kind: 'resource' } })}
					>
						<Headphones size={14} /> Dari materi mata kuliah
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={value.media.kind === 'link'}
						className={value.media.kind === 'link' ? 'active' : ''}
						onClick={() => onChange({ ...value, media: { ...value.media, kind: 'link' } })}
					>
						<Link2 size={14} /> Tautan eksternal
					</button>
				</div>

				{value.media.kind === 'resource' ? (
					media.length === 0 ? (
						<p className="tkb-empty">
							Belum ada materi audio/video di mata kuliah ini. Unggah di tab <strong>Materi</strong>{' '}
							(lampirkan berkas audio/video), lalu pilih di sini.
						</p>
					) : (
						<div className="tkb-num">
							<MappingSelect
								label="Materi audio/video"
								value={value.media.resourceId}
								onChange={(resourceId) => {
									const hit = media.find((r) => r.id === resourceId);
									onChange({
										...value,
										media: {
											kind: 'resource',
											resourceId,
											url: hit ? resourceFileUrl(hit) : '',
											title: hit?.title || '',
										},
									});
								}}
								placeholder="Pilih materi…"
								options={media.map((r) => ({ value: r.id, label: r.title }))}
							/>
							{selectedResource && <small>Pratinjau tersedia bagi mahasiswa saat mengerjakan.</small>}
						</div>
					)
				) : (
					<label className="tkb-num">
						<span>Tautan audio/video</span>
						<input
							type="url"
							maxLength={500}
							value={value.media.kind === 'link' ? value.media.url : ''}
							onChange={(e) =>
								onChange({
									...value,
									media: { kind: 'link', resourceId: '', url: e.target.value, title: value.media.title },
								})
							}
							placeholder="https://… (mis. tautan podcast atau video)"
						/>
						<small>Mahasiswa memutar materi dari tautan ini saat mengerjakan.</small>
					</label>
				)}
			</div>

			<div className="tkb-list-head">
				<h4>
					Pertanyaan <span>({value.questions.length})</span>
				</h4>
				<div className="tkb-add-row">
					{TYPES.map((t) => (
						<button key={t} type="button" className="ld-text-btn" onClick={() => addQuestion(t)}>
							<Plus size={12} /> {LISTENING_TYPE_LABEL[t]}
						</button>
					))}
				</div>
			</div>

			{value.questions.length === 0 && (
				<p className="tkb-empty">
					Belum ada pertanyaan. Tambahkan pertanyaan pilihan ganda (ternilai otomatis), jawaban singkat,
					mencocokkan, atau transkripsi (dinilai manual oleh dosen).
				</p>
			)}

			<ul className="tkb-questions">
				{value.questions.map((question, i) => (
					<li key={question.id} className="tkb-question">
						<div className="tkb-question-top">
							<strong>
								Pertanyaan {i + 1} <em>{LISTENING_TYPE_LABEL[question.type]}</em>
							</strong>
							<div className="tkb-question-tools">
								<label className="tkb-num tkb-ts">
									<span>Menit:detik</span>
									<input
										inputMode="numeric"
										placeholder="mm:ss"
										value={question.timestampSec == null ? '' : `${Math.floor(question.timestampSec / 60)}:${String(question.timestampSec % 60).padStart(2, '0')}`}
										onChange={(e) => {
											const m = /^(\d*):?(\d{0,2})$/.exec(e.target.value.replace(/\s/g, ''));
											if (!m) return;
											const minutes = Number(m[1] || 0);
											const seconds = Number(m[2] || 0);
											setQuestion(i, {
												timestampSec: e.target.value.trim() === '' ? null : minutes * 60 + seconds,
											});
										}}
										aria-label={`Penanda waktu pertanyaan ${i + 1}`}
									/>
								</label>
								<NumberField
									label="Poin"
									value={question.points}
									min={0}
									max={100}
									onChange={(points) => setQuestion(i, { points })}
								/>
								<RowActions
									index={i}
									count={value.questions.length}
									onMove={(dir) => moveQuestion(i, dir)}
									onRemove={() =>
										onChange({ ...value, questions: value.questions.filter((_, idx) => idx !== i) })
									}
									labels={{
										up: `Naikkan pertanyaan ${i + 1}`,
										down: `Turunkan pertanyaan ${i + 1}`,
										remove: `Hapus pertanyaan ${i + 1}`,
									}}
								/>
							</div>
						</div>
						<textarea
							rows={2}
							maxLength={2000}
							value={question.text}
							onChange={(e) => setQuestion(i, { text: e.target.value })}
							placeholder="Tulis pertanyaan… (mis. “Apa yang dibicarakan pembicara pada menit ini?”)"
							aria-label={`Teks pertanyaan ${i + 1}`}
						/>

						{question.type === 'mc' && (
							<div className="tkb-options">
								{question.options.map((option, oi) => (
									<label key={oi} className={`tkb-option${question.correctIndex === oi ? ' correct' : ''}`}>
										<input
											type="radio"
											name={`lcorrect-${question.id}`}
											checked={question.correctIndex === oi}
											onChange={() => setQuestion(i, { correctIndex: oi })}
											aria-label={`Jadikan ${LETTERS[oi]} kunci pertanyaan ${i + 1}`}
										/>
										<span className="tkb-option-letter">{LETTERS[oi] || '?'}</span>
										<input
											maxLength={500}
											value={option}
											onChange={(e) =>
												setQuestion(i, {
													options: question.options.map((o, idx) => (idx === oi ? e.target.value : o)),
												})
											}
											placeholder={`Pilihan ${LETTERS[oi] || oi + 1}`}
											aria-label={`Pilihan ${LETTERS[oi]} pertanyaan ${i + 1}`}
										/>
										<button
											type="button"
											aria-label={`Hapus pilihan ${LETTERS[oi]}`}
											disabled={question.options.length <= 2}
											onClick={() => {
												const options = question.options.filter((_, idx) => idx !== oi);
												let correctIndex = question.correctIndex;
												if (correctIndex === oi) correctIndex = -1;
												else if (correctIndex > oi) correctIndex -= 1;
												setQuestion(i, { options, correctIndex });
											}}
										>
											<Trash2 size={12} />
										</button>
									</label>
								))}
								{question.options.length < LETTERS.length && (
									<button
										type="button"
										className="ld-text-btn"
										onClick={() => setQuestion(i, { options: [...question.options, ''] })}
									>
										<Plus size={12} /> Tambah pilihan
									</button>
								)}
								{question.correctIndex < 0 && (
									<p className="tkb-warn">Kunci pilihan ganda belum ditetapkan — dinilai manual bila kosong.</p>
								)}
							</div>
						)}

						{(question.type === 'short' || question.type === 'transcription') && (
							<label className="tkb-expected">
								<span>
									Jawaban yang diharapkan (rujukan penilaian dosen — tidak ditampilkan ke mahasiswa)
								</span>
								<textarea
									rows={2}
									maxLength={2000}
									value={question.expected}
									onChange={(e) => setQuestion(i, { expected: e.target.value })}
									placeholder="Tulis jawaban/rumusan yang diharapkan…"
									aria-label={`Jawaban yang diharapkan pertanyaan ${i + 1}`}
								/>
							</label>
						)}

						{question.type === 'matching' && (
							<div className="tkb-pairs">
								{question.pairs.map((pair, pi) => (
									<div key={pi} className="tkb-pair">
										<input
											maxLength={200}
											value={pair.left}
											onChange={(e) =>
												setQuestion(i, {
													pairs: question.pairs.map((p, idx) =>
														idx === pi ? { ...p, left: e.target.value } : p,
													),
												})
											}
											placeholder="Pernyataan/kata kiri…"
											aria-label={`Pasangan kiri ${pi + 1} pertanyaan ${i + 1}`}
										/>
										<input
											maxLength={200}
											value={pair.right}
											onChange={(e) =>
												setQuestion(i, {
													pairs: question.pairs.map((p, idx) =>
														idx === pi ? { ...p, right: e.target.value } : p,
													),
												})
											}
											placeholder="Pasangan kanan…"
											aria-label={`Pasangan kanan ${pi + 1} pertanyaan ${i + 1}`}
										/>
										<button
											type="button"
											aria-label={`Hapus pasangan ${pi + 1}`}
											disabled={question.pairs.length <= 2}
											onClick={() =>
												setQuestion(i, { pairs: question.pairs.filter((_, idx) => idx !== pi) })
											}
										>
											<Trash2 size={12} />
										</button>
									</div>
								))}
								<button
									type="button"
									className="ld-text-btn"
									onClick={() => setQuestion(i, { pairs: [...question.pairs, { left: '', right: '' }] })}
								>
									<Plus size={12} /> Tambah pasangan
								</button>
							</div>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
