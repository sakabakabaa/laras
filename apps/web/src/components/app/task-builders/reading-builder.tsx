import { BookOpen, Plus, Trash2 } from 'lucide-react';
import { QUIZ_RELEASE_LABEL, type QuizQuestionEditable, type QuizReleaseMode, type ReadingConfig } from '@/lib/task-types';
import { NumberField, RowActions, newRowId } from '@/components/app/task-builders/builder-shared';
import { MappingSelect } from '@/components/app/form-status';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

type Value = Omit<ReadingConfig, 'questions'> & { questions: QuizQuestionEditable[] };

/** Membaca: lecturer-supplied passage plus keyed questions. Nothing is invented. */
export function ReadingBuilder({ value, onChange }: { value: Value; onChange: (next: Value) => void }) {
	const setQuestion = (i: number, patch: Partial<QuizQuestionEditable>) => {
		onChange({ ...value, questions: value.questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)) });
	};
	return (
		<div className="tkb-builder">
			<div className="tkb-head">
				<BookOpen size={16} />
				<div>
					<h3>Konfigurasi membaca</h3>
					<p>Tempel teks bacaan yang sudah ada, lalu susun soal. Kunci tidak diarang.</p>
				</div>
			</div>
			<label className="tkb-num tkb-wide">
				<span>Teks bacaan *</span>
				<textarea
					rows={6}
					maxLength={8000}
					value={value.passage}
					onChange={(e) => onChange({ ...value, passage: e.target.value })}
					placeholder="Tempel teks dari materi pertemuan atau sumber yang Anda miliki…"
				/>
			</label>
			<div className="tkb-num">
				<MappingSelect
					label="Pelepasan hasil"
					value={value.releaseResults}
					onChange={(releaseResults) =>
						onChange({ ...value, releaseResults: releaseResults as QuizReleaseMode })
					}
					placeholder="Pilih pelepasan hasil"
					options={Object.entries(QUIZ_RELEASE_LABEL).map(([value, label]) => ({ value, label }))}
				/>
			</div>
			<div className="tkb-list-head">
				<h4>Soal <span>({value.questions.length})</span></h4>
				<button
					type="button"
					className="ld-text-btn"
					onClick={() =>
						onChange({
							...value,
							questions: [
								...value.questions,
								{ id: newRowId('r'), text: '', options: ['', '', '', ''], correctIndex: -1, points: 1, explanation: '' },
							],
						})
					}
				>
					<Plus size={13} /> Tambah soal
				</button>
			</div>
			{value.questions.length === 0 && <p className="tkb-empty">Belum ada soal membaca.</p>}
			<ul className="tkb-questions">
				{value.questions.map((question, i) => (
					<li key={question.id} className="tkb-question">
						<div className="tkb-question-top">
							<strong>Soal {i + 1}</strong>
							<div className="tkb-question-tools">
								<NumberField label="Poin" value={question.points} min={0} max={100} onChange={(points) => setQuestion(i, { points })} />
								<RowActions
									index={i}
									count={value.questions.length}
									onMove={(dir) => {
										const next = [...value.questions];
										const j = i + dir;
										if (j < 0 || j >= next.length) return;
										[next[i], next[j]] = [next[j], next[i]];
										onChange({ ...value, questions: next });
									}}
									onRemove={() => onChange({ ...value, questions: value.questions.filter((_, idx) => idx !== i) })}
									labels={{ up: `Naikkan soal ${i + 1}`, down: `Turunkan soal ${i + 1}`, remove: `Hapus soal ${i + 1}` }}
								/>
							</div>
						</div>
						<textarea
							rows={2}
							maxLength={2000}
							value={question.text}
							onChange={(e) => setQuestion(i, { text: e.target.value })}
							placeholder="Pertanyaan tentang teks…"
							aria-label={`Teks soal ${i + 1}`}
						/>
						<div className="tkb-options">
							{question.options.map((option, oi) => (
								<label key={oi} className={`tkb-option${question.correctIndex === oi ? ' correct' : ''}`}>
									<input
										type="radio"
										name={`rcorrect-${question.id}`}
										checked={question.correctIndex === oi}
										onChange={() => setQuestion(i, { correctIndex: oi })}
									/>
									<span className="tkb-option-letter">{LETTERS[oi]}</span>
									<input
										maxLength={500}
										value={option}
										onChange={(e) =>
											setQuestion(i, { options: question.options.map((o, idx) => (idx === oi ? e.target.value : o)) })
										}
										placeholder={`Pilihan ${LETTERS[oi]}`}
									/>
									<button
										type="button"
										disabled={question.options.length <= 2}
										onClick={() => {
											const options = question.options.filter((_, idx) => idx !== oi);
											let correctIndex = question.correctIndex;
											if (correctIndex === oi) correctIndex = -1;
											else if (correctIndex > oi) correctIndex -= 1;
											setQuestion(i, { options, correctIndex });
										}}
										aria-label={`Hapus pilihan ${LETTERS[oi]}`}
									>
										<Trash2 size={12} />
									</button>
								</label>
							))}
						</div>
						{question.correctIndex < 0 && <p className="tkb-warn">Kunci belum ditetapkan.</p>}
					</li>
				))}
			</ul>
		</div>
	);
}
