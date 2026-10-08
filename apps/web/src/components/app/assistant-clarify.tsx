import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

export type ClarifyQuestion = {
	prompt: string;
	placeholder: string;
};

/**
 * One-question-at-a-time card for assistant clarifications.
 * A single question stays simple — no "1 of 1" stepper.
 */
export function AssistantClarify({
	questions,
	disabled,
	onSubmit,
}: {
	questions: ClarifyQuestion[];
	disabled?: boolean;
	onSubmit: (answers: string[]) => void;
}) {
	const inputId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const [index, setIndex] = useState(0);
	const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''));
	const [menuOpen, setMenuOpen] = useState(false);
	const total = questions.length;
	const safeIndex = Math.min(index, Math.max(0, total - 1));
	const current = questions[safeIndex];
	const multiple = total > 1;
	const value = answers[safeIndex] ?? '';
	const isLast = safeIndex === total - 1;
	const canAdvance = value.trim().length > 0 && !disabled;

	useEffect(() => {
		inputRef.current?.focus();
	}, [safeIndex, questions]);

	if (!current) return null;

	const go = (next: number) => {
		setMenuOpen(false);
		setIndex(Math.max(0, Math.min(total - 1, next)));
	};

	const advance = () => {
		if (!canAdvance) return;
		if (!isLast) {
			go(safeIndex + 1);
			return;
		}
		onSubmit(answers.map((answer) => answer.trim()));
	};

	return (
		<section className="asst-clarify" aria-label="Pertanyaan klarifikasi">
			<div className="asst-clarify-qrow">
				<p id={inputId} className="asst-clarify-q">
					{current.prompt}
				</p>
				{multiple && (
					<button
						type="button"
						className="asst-clarify-menu"
						aria-label="Pilih pertanyaan"
						aria-expanded={menuOpen}
						aria-haspopup="listbox"
						onClick={() => setMenuOpen((open) => !open)}
					>
						<ChevronDown size={18} />
					</button>
				)}
			</div>
			{menuOpen && multiple && (
				<ul className="asst-clarify-list" role="listbox" aria-label="Daftar pertanyaan">
					{questions.map((question, i) => (
						<li key={question.prompt}>
							<button
								type="button"
								role="option"
								aria-selected={i === safeIndex}
								onClick={() => go(i)}
							>
								{question.prompt}
							</button>
						</li>
					))}
				</ul>
			)}
			<input
				ref={inputRef}
				className="asst-clarify-input"
				value={value}
				placeholder={current.placeholder || 'Ketik jawaban Anda...'}
				aria-labelledby={inputId}
				disabled={disabled}
				onChange={(event) => {
					const next = event.target.value;
					setAnswers((prev) => prev.map((item, i) => (i === safeIndex ? next : item)));
				}}
				onKeyDown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						advance();
					}
				}}
			/>
			<div className="asst-clarify-nav">
				{multiple ? (
					<div className="asst-clarify-step" aria-live="polite">
						<button type="button" aria-label="Pertanyaan sebelumnya" disabled={safeIndex === 0 || disabled} onClick={() => go(safeIndex - 1)}>
							<ChevronLeft size={18} />
						</button>
						<span>Pertanyaan {safeIndex + 1} dari {total}</span>
						<button type="button" aria-label="Pertanyaan berikutnya" disabled={isLast || disabled} onClick={() => go(safeIndex + 1)}>
							<ChevronRight size={18} />
						</button>
					</div>
				) : (
					<span className="sr-only">Satu pertanyaan</span>
				)}
				<button type="button" className="asst-clarify-next" disabled={!canAdvance} onClick={advance}>
					{isLast ? 'Lanjut' : 'Berikutnya'}
				</button>
			</div>
		</section>
	);
}
