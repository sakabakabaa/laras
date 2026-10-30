import { useState } from 'react';
import { BookOpen, LoaderCircle, Send } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { errorMessage } from '@/lib/learning';
import { isPastDeadline, type Assignment, type AssignmentSubmission } from '@/lib/assignments';
import { parseReadingConfig, type GradedQuestion } from '@/lib/task-types';
import { CheckAnswerPanel } from '@/components/app/task-workspaces/check-answer-panel';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Student reading workspace: passage + MC, graded server-side so the key stays hidden. */
export function ReadingWorkspace({
	assignment,
	submission,
	onSaved,
}: {
	assignment: Assignment;
	submission: AssignmentSubmission | null;
	onSaved: () => void;
}) {
	const config = parseReadingConfig(assignment.taskConfig);
	const locked = assignment.status !== 'published' || Boolean(submission && submission.status !== 'draft' && submission.status !== 'revision');
	const [answers, setAnswers] = useState<Record<string, number>>({});
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [result, setResult] = useState<GradedQuestion[] | null>(null);
	const [score, setScore] = useState<number | null>(submission?.autoScore ?? null);

	const submit = async () => {
		setError('');
		const missing = config.questions.filter((q) => answers[q.id] == null);
		if (missing.length) {
			setError(`Masih ada ${missing.length} soal belum dijawab.`);
			return;
		}
		setBusy(true);
		try {
			const response = await fetch('/api/task-submit', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({ assignmentId: assignment.id, kind: 'reading', answers }),
			});
			const body = (await response.json()) as {
				error?: string;
				message?: string;
				autoScore?: number;
				perQuestion?: GradedQuestion[];
				release?: string;
			};
			if (!response.ok) {
				setError(body.error || 'Gagal mengumpulkan.');
				return;
			}
			setScore(body.autoScore ?? null);
			setResult(body.release === 'released' ? body.perQuestion || [] : null);
			onSaved();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="tws-workspace">
			<div className="tws-meta">
				<span className="tws-chip"><BookOpen size={12} /> Membaca</span>
				{score != null && <span className="tws-chip">Nilai otomatis {score}</span>}
			</div>
			{config.passage ? (
				<p className="tws-prompt">{config.passage}</p>
			) : (
				<p className="tws-notice">Dosen belum menempelkan teks bacaan.</p>
			)}
			<ul className="tws-questions">
				{config.questions.map((q, i) => (
					<li key={q.id} className="tws-question">
						<p className="tws-question-text">{i + 1}. {q.text}</p>
						<div className="tws-options">
							{q.options.map((option, oi) => (
								<label key={oi} className={`tws-option${answers[q.id] === oi ? ' picked' : ''}`}>
									<input
										type="radio"
										name={q.id}
										disabled={locked}
										checked={answers[q.id] === oi}
										onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: oi }))}
									/>
									<span className="tws-option-letter">{LETTERS[oi]}</span>
									<span>{option}</span>
								</label>
							))}
						</div>
					</li>
				))}
			</ul>
			{result && (
				<ul className="tws-details">
					{result.map((row, i) => (
						<li key={row.id} className={row.correct ? 'ok' : 'bad'}>
							<span />
							<div>
								<strong>Soal {i + 1}</strong>
								<small>{row.correct ? 'Benar' : 'Perlu ditinjau'} · {row.earned}/{row.points}</small>
							</div>
						</li>
					))}
				</ul>
			)}
			{error && <p className="form-error" role="alert">{error}</p>}
			{!locked && !isPastDeadline(assignment.deadline) && (
				<div className="tws-actions">
					<button type="button" className="ld-btn-primary" disabled={busy} onClick={() => void submit()}>
						{busy ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />} Kumpulkan
					</button>
				</div>
			)}
			{!locked && !isPastDeadline(assignment.deadline) && (
				<CheckAnswerPanel
					assignment={assignment}
					channel="enrolled"
					buildResponse={() => ({ kind: 'reading', answers })}
				/>
			)}
			{isPastDeadline(assignment.deadline) && !submission && (
				<p className="tws-notice over">Batas waktu sudah lewat.</p>
			)}
		</div>
	);
}
