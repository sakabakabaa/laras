import { ListChecks, Plus, Trash2 } from 'lucide-react';
import {
	QUIZ_RELEASE_LABEL,
	type QuizConfig,
	type QuizQuestionEditable,
	type QuizReleaseMode,
} from '@/lib/task-types';
import { NumberField, RowActions, ToggleField, newRowId } from '@/components/app/task-builders/builder-shared';
import { MappingSelect } from '@/components/app/form-status';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export type QuizBuilderValue = Omit<QuizConfig, 'questions'> & {
	questions: QuizQuestionEditable[];
};

/**
 * Kuis builder: questions, options, correct answer (stored in the owner-only
 * answer key on save), points, explanations, ordering/randomization, attempts,
 * time limit, and result-release behavior.
 */
export function QuizBuilder({
	value,
	onChange,
}: {
	value: QuizBuilderValue;
	onChange: (next: QuizBuilderValue) => void;
}) {
	const setQuestion = (i: number, patch: Partial<QuizQuestionEditable>) => {
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
	const addQuestion = () => {
		onChange({
			...value,
			questions: [
				...value.questions,
				{ id: newRowId('q'), text: '', options: ['', '', '', ''], correctIndex: -1, points: 1, explanation: '' },
			],
		});
	};

	return (
		<div className="tkb-builder">
			<div className="tkb-head">
				<ListChecks size={16} />
				<div>
					<h3>Konfigurasi kuis</h3>
					<p>Soal, kunci jawaban, poin, pengaturan pengerjaan, dan pelepasan hasil.</p>
				</div>
			</div>

			<div className="tkb-grid">
				<NumberField
					label="Kesempatan pengerjaan"
					value={value.attempts}
					min={0}
					max={10}
					suffix="kali"
					hint="0 = tanpa batas"
					onChange={(attempts) => onChange({ ...value, attempts })}
				/>
				<NumberField
					label="Batas waktu"
					value={value.timeLimitMin}
					min={0}
					max={180}
					suffix="menit"
					hint="0 = tanpa batas waktu"
					onChange={(timeLimitMin) => onChange({ ...value, timeLimitMin })}
				/>
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
					<small>Kapan mahasiswa boleh melihat nilai dan pembahasan.</small>
				</div>
				<div className="tkb-toggles">
					<ToggleField
						label="Acak urutan soal"
						checked={value.shuffleQuestions}
						onChange={(shuffleQuestions) => onChange({ ...value, shuffleQuestions })}
					/>
					<ToggleField
						label="Acak urutan pilihan"
						checked={value.shuffleOptions}
						onChange={(shuffleOptions) => onChange({ ...value, shuffleOptions })}
					/>
				</div>
			</div>

			<div className="tkb-list-head">
				<h4>
					Soal <span>({value.questions.length})</span>
				</h4>
				<button type="button" className="ld-text-btn" onClick={addQuestion}>
					<Plus size={13} /> Tambah soal
				</button>
			</div>

			{value.questions.length === 0 && (
				<p className="tkb-empty">
					Belum ada soal. Tambahkan soal secara manual, atau gunakan <strong>Impor tugas</strong> di
					atas dengan format “Soal 1: …” berikut pilihan A–E dan baris “Jawaban: B”.
				</p>
			)}

			<ul className="tkb-questions">
				{value.questions.map((question, i) => {
					const validOptions = question.options.filter((o) => o.trim());
					return (
						<li key={question.id} className="tkb-question">
							<div className="tkb-question-top">
								<strong>Soal {i + 1}</strong>
								<div className="tkb-question-tools">
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
											up: `Naikkan soal ${i + 1}`,
											down: `Turunkan soal ${i + 1}`,
											remove: `Hapus soal ${i + 1}`,
										}}
									/>
								</div>
							</div>
							<textarea
								rows={2}
								maxLength={2000}
								value={question.text}
								onChange={(e) => setQuestion(i, { text: e.target.value })}
								placeholder="Tulis pertanyaan…"
								aria-label={`Teks soal ${i + 1}`}
							/>
							<div className="tkb-options">
								{question.options.map((option, oi) => (
									<label key={oi} className={`tkb-option${question.correctIndex === oi ? ' correct' : ''}`}>
										<input
											type="radio"
											name={`correct-${question.id}`}
											checked={question.correctIndex === oi}
											onChange={() => setQuestion(i, { correctIndex: oi })}
											aria-label={`Jadikan ${LETTERS[oi]} kunci soal ${i + 1}`}
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
											aria-label={`Pilihan ${LETTERS[oi]} soal ${i + 1}`}
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
							</div>
							{question.correctIndex < 0 || question.correctIndex >= validOptions.length ? (
								<p className="tkb-warn">Kunci jawaban belum ditetapkan — kunci tidak diarang, pilih manual.</p>
							) : null}
							<textarea
								rows={2}
								maxLength={2000}
								className="tkb-explain"
								value={question.explanation}
								onChange={(e) => setQuestion(i, { explanation: e.target.value })}
								placeholder="Pembahasan (opsional — hanya tampil saat hasil dilepas)"
								aria-label={`Pembahasan soal ${i + 1}`}
							/>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
