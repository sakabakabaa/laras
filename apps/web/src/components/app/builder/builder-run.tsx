import {sessionClock} from '@/lib/session-clock';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import pb from '@/lib/pocketbase-client';
import { BuilderPreview } from './builder-elements';
import { BuilderMediaResolver } from './builder-media';
import {
	deliveryRequest,
	type BuilderRunState,
	type BuilderRunItem,
	type BuilderAssessment,
	type BuilderResponse,
} from '@/lib/builder-delivery';
import {
	plain,
	questionIds,
	type BuilderAsset,
	type BuilderDocument,
	type BuilderKey,
} from '@/lib/builder-document';
const answerKey = (value: Record<string, string>) =>
	JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
const date = (value: string) =>
	value
		? new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
		: '—';
export function BuilderRunList({
	kind,
	documentId,
	courseId,
}: {
	kind?: 'kelas' | 'tugas';
	documentId?: string;
	courseId?: string;
}) {
	const [items, setItems] = useState<BuilderRunItem[]>([]),
		[error, setError] = useState('');
	useEffect(() => {
		let live = true;
		deliveryRequest<{ items: BuilderRunItem[] }>('list', {
			kind,
			documentId,
			courseId,
		})
			.then((r) => {
				if (live) setItems(r.items);
			})
			.catch((e) => {
				if (live) setError(e.message);
			});
		return () => {
			live = false;
		};
	}, [kind, documentId, courseId]);
	return (
		<section className="bd-draft-list bd-published-list">
			<h2>Kegiatan diterbitkan</h2>
			{error && <p role="alert">{error}</p>}
			{!items.length && !error ? (
				<p>Belum ada kegiatan builder yang diterbitkan.</p>
			) : (
				<div className="bd-draft-cards">
					{items.map((item) => (
						<Link key={item.id} to={'/app/kegiatan/' + item.id}>
							<strong>{item.title}</strong>
							<small>
								{item.courseTitle} · {item.kind === 'kelas' ? 'Kelas' : 'Tugas'}{' '}
								· Revisi {item.revision}
							</small>
							<span>
								{item.closed ? 'Ditutup' : date(item.startsAt)} · batas{' '}
								{date(item.dueAt)}
							</span>
						</Link>
					))}
				</div>
			)}
		</section>
	);
}
export function BuilderRun({ id }: { id: string }) {
	const [state, setState] = useState<BuilderRunState | null>(null),
		[answers, setAnswers] = useState<Record<string, string>>({}),
		[active, setActive] = useState(''),
		[error, setError] = useState(''),
		[busy, setBusy] = useState(false),
		[submitting, setSubmitting] = useState(false),
		[now, setNow] = useState(Date.now()),
		[message, setMessage] = useState(''),
		[preserved, setPreserved] = useState<Record<string, string>>({});
	const current = useRef(answers),
		saved = useRef('[]'),
		revision = useRef(0),
		inFlight = useRef(false),
		clock = useRef(0),
		requestKey = useRef(0);
	current.current = answers;
	const apply = useCallback((next: BuilderRunState, replace = false) => {
		clock.current = Date.parse(next.serverNow) - Date.now();
		revision.current = next.response?.revision || 0;
		setState(next);
		if (replace) {
			const value = next.response?.answers || {};
			saved.current = answerKey(value);
			current.current = value;
			setAnswers(value);
		}
		setActive(
			(prior) =>
				prior ||
				next.openActivityIds[0] ||
				next.document?.activities[0]?.id ||
				'',
		);
	}, []);
	useEffect(() => {
		let live = true;
		deliveryRequest<BuilderRunState>('state', { runId: id })
			.then((r) => {
				if (live) apply(r, true);
			})
			.catch((e) => {
				if (live) setError(e.message);
			});
		const timer = window.setInterval(
			() => setNow(Date.now() + clock.current),
			1000,
		);
		return () => {
			live = false;
			window.clearInterval(timer);
		};
	}, [id, apply]);
	// Poll only when no local edits/save is pending. Never replace unsaved answers.
	useEffect(() => {
		const timer = window.setInterval(() => {
			if (inFlight.current || answerKey(current.current) !== saved.current)
				return;
			const generation = ++requestKey.current;
			void deliveryRequest<BuilderRunState>('state', { runId: id })
				.then((r) => {
					if (
						generation === requestKey.current &&
						!inFlight.current &&
						answerKey(current.current) === saved.current
					)
						apply(r, true);
				})
				.catch((e) => setError(e.message));
		}, 15000);
		return () => window.clearInterval(timer);
	}, [id, apply]);
	const send = useCallback(
		async (action: 'save' | 'submit', activityId?: string) => {
			if (inFlight.current) return false;
			const snapshot = { ...current.current };
			inFlight.current = true;
			requestKey.current++;
			setBusy(true);
			setSubmitting(action === 'submit');
			setError('');
			try {
				const next = await deliveryRequest<BuilderRunState>(action, {
					runId: id,
					baseRevision: revision.current,
					answers: snapshot,
					activityId,
				});
				saved.current = answerKey(next.response?.answers || {});
				apply(next, false);
				if (action === 'submit' || next.response?.submittedAt) {
					const unsent = Object.fromEntries(
						Object.entries(current.current).filter(
							([id, value]) =>
								value && value !== (next.response?.answers[id] || ''),
						),
					);
					if (Object.keys(unsent).length)
						setPreserved((prior) => ({ ...prior, ...unsent }));
					current.current = next.response?.answers || {};
					setAnswers(current.current);
				}
				setMessage(
					action === 'submit'
						? 'Jawaban berhasil dikumpulkan.'
						: 'Jawaban tersimpan.',
				);
				return true;
			} catch (e) {
				const message = (e as Error).message;
				setError(message);
				if (message.includes('Kegiatan sudah terkunci')) {
					try {
						const next = await deliveryRequest<BuilderRunState>('state', {
							runId: id,
						});
						const accepted = next.response?.answers || {},
							merged = { ...accepted },
							rejected: Record<string, string> = {};
						const writable = new Set(
							(next.document?.activities || [])
								.filter(
									(a) =>
										!next.response?.submittedAt &&
										next.openActivityIds.includes(a.id) &&
										!next.response?.submittedActivities.includes(a.id),
								)
								.flatMap((a) =>
									a.blocks.flatMap((b) => [
										...questionIds(b),
										...(b.type === 'acknowledgement' ? [b.id] : []),
									]),
								),
						);
						for (const [qid, value] of Object.entries(current.current)) {
							if (writable.has(qid)) merged[qid] = value;
							else if (value && value !== (accepted[qid] || ''))
								rejected[qid] = value;
						}
						if (Object.keys(rejected).length)
							setPreserved((prior) => ({ ...prior, ...rejected }));
						saved.current = answerKey(accepted);
						apply(next, false);
						current.current = merged;
						setAnswers(merged);
					} catch {
						/* Preserve the original visible answers when refresh also fails. */
					}
				}
				return false;
			} finally {
				inFlight.current = false;
				setBusy(false);
				setSubmitting(false);
			}
		},
		[id, apply],
	);
	useEffect(() => {
		if (
			!state?.response ||
			state.response.submittedAt ||
			state.owner ||
			answerKey(answers) === saved.current
		)
			return;
		const timer = window.setTimeout(() => {
			void send('save');
		}, 1000);
		return () => window.clearTimeout(timer);
	}, [answers, state, send]);
	useEffect(() => {
		const prevent = (e: BeforeUnloadEvent) => {
			if (answerKey(current.current) !== saved.current) {
				e.preventDefault();
				e.returnValue = '';
			}
		};
		window.addEventListener('beforeunload', prevent);
		return () => window.removeEventListener('beforeunload', prevent);
	}, []);
	const resolveMedia = useCallback(
		async (asset: BuilderAsset) => {
			const response = await fetch('/api/builder-media', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer ' + pb.authStore.token,
				},
				body: JSON.stringify({ runId: id, ...asset }),
			});
			const data = await response.json();
			if (!response.ok)
				throw new Error(data.message || 'Media tidak tersedia.');
			return data.url as string;
		},
		[id],
	);
	if (!state)
		return (
			<div className="bd-workspace">
				<p role={error ? 'alert' : 'status'}>{error || 'Memuat kegiatan…'}</p>
			</div>
		);
	const document = state.document,
		response = state.response,
		activity =
			document?.activities.find((a) => a.id === active) ||
			document?.activities[0],
		deadline = response ? Date.parse(response.deadline) : 0,
		remaining = Math.max(0, Math.ceil((deadline - now) / 1000)),
		readOnly =
			state.owner ||
			!response ||
			Boolean(response.submittedAt) ||
			state.closed ||
			remaining === 0 ||
			!activity ||
			!state.openActivityIds.includes(activity.id) ||
			response.submittedActivities.includes(activity.id);
	const start = async () => {
		setBusy(true);
		setError('');
		try {
			apply(
				await deliveryRequest<BuilderRunState>('begin', { runId: id }),
				true,
			);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};
	return (
		<div className="bd-workspace bd-run">
			<Link
				to={
					state.owner
						? state.kind === 'kelas'
							? '/app/kelas-terjadwal'
							: '/app/tugas'
						: '/app/student'
				}
			>
				← Kembali
			</Link>
			<header className="bd-run-header">
				<div>
					<span className="bd-kicker">
						{state.kind === 'kelas' ? 'KELAS' : 'TUGAS'} · VERSI REVISI{' '}
						{state.revision}
					</span>
					<h1>{state.title}</h1>
					<p>
						{date(state.delivery.startsAt || state.delivery.availableAt)} —{' '}
						{date(state.delivery.endsAt || state.delivery.dueAt)} WIB
					</p>
				</div>
				<span>
					{state.closed
						? 'Ditutup'
						: response?.submittedAt
							? 'Terkumpul'
							: response
								? `Sisa ${sessionClock(remaining)}`
								: state.available
									? 'Tersedia'
									: 'Belum dibuka'}
				</span>
			</header>
			{error && (
				<div className="bd-error" role="alert">
					{error}
					<p>
						Jawaban di layar tetap tersedia. Jika terjadi konflik, salin jawaban
						sebelum memuat ulang.
					</p>
				</div>
			)}
			{message && <p role="status">{message}</p>}
			{Object.keys(preserved).length > 0 && (
				<details className="bd-review-notice" open>
					<summary>Salinan jawaban yang tidak diterima server</summary>
					<p>
						Jawaban ini berubah setelah kegiatan dikunci atau waktunya habis.
						Salinan ini bukan bagian dari kiriman; Anda dapat menyalinnya untuk
						disampaikan kepada dosen.
					</p>
					<textarea
						readOnly
						aria-label="Salinan jawaban yang tidak diterima"
						rows={6}
						value={Object.entries(preserved)
							.map(
								([id, value]) =>
									(plain(state.document?.questionsById[id]?.prompt) || id) +
									'\n' +
									value,
							)
							.join('\n\n')}
					/>
				</details>
			)}

			{state.owner && (
				<>
					<div className="bd-inline-actions">

						<button
							className="bd-secondary"
							disabled={busy || state.closed}
							onClick={async () => {
								if (
									!window.confirm(
										'Tutup kegiatan ini? Jawaban tersimpan akan difinalisasi dan mahasiswa tidak dapat mengubahnya.',
									)
								)
									return;
								setBusy(true);
								try {
									apply(
										await deliveryRequest<BuilderRunState>('close', {
											runId: id,
										}),
									);
								} catch (e) {
									setError((e as Error).message);
								} finally {
									setBusy(false);
								}
							}}
						>
							Tutup pengumpulan
						</button>
					</div>
					<BuilderRunReview id={id} />
				</>
			)}
			{!state.owner && !response && state.available && !state.closed && (
				<button
					className="bd-primary"
					disabled={busy}
					onClick={() => void start()}
				>
					{state.kind === 'kelas' ? 'Check-in & mulai' : 'Mulai tugas'}
				</button>
			)}
			{response?.submittedAt && (
				<p className="bd-review-notice">
					Dikumpulkan {date(response.submittedAt)}.{' '}
					{response.released
						? `Nilai ${response.released.score}/100 (${response.released.earned}/${response.released.total} poin)`
						: 'Hasil belum diterbitkan dosen.'}
				</p>
			)}
			{document && (
				<>
					<nav className="bd-run-navigation" aria-label="Kegiatan">
						{document.activities.map((a, index) => (
							<button
								className="bd-secondary"
								key={a.id}
								aria-current={a.id === activity?.id ? 'step' : undefined}
								onClick={() => setActive(a.id)}
							>
								{index + 1}. {a.title}{' '}
								{response?.submittedActivities.includes(a.id)
									? '✓'
									: !state.owner && !state.openActivityIds.includes(a.id)
										? '· terkunci'
										: ''}
							</button>
						))}
					</nav>
					<BuilderMediaResolver.Provider value={resolveMedia}>
						<BuilderPreview
							document={document}
							answers={answers}
							onAnswersChange={setAnswers}
							activityId={activity?.id}
							readOnly={readOnly || submitting}
							live
						/>
					</BuilderMediaResolver.Provider>
					{!state.owner && response && !response.submittedAt && (
						<div className="bd-run-submit">
							<button
								className="bd-secondary"
								disabled={busy || readOnly}
								onClick={() => void send('save')}
							>
								{busy ? 'Menyimpan…' : 'Simpan jawaban'}
							</button>
							<button
								className="bd-primary"
								disabled={busy || readOnly}
								onClick={async () => {
									if (
										!window.confirm(
											state.kind === 'tugas'
												? 'Kumpulkan seluruh tugas? Jawaban tidak dapat diubah setelah dikirim.'
												: 'Kumpulkan kegiatan ini? Jawaban kegiatan ini akan dikunci.',
										)
									)
										return;
									await send('submit', activity?.id);
								}}
							>
								Kumpulkan {state.kind === 'tugas' ? 'tugas' : 'kegiatan'}
							</button>
						</div>
					)}
					{response?.released &&
						activity?.blocks.flatMap(questionIds).map((id) => {
							const result = response.released!.items[id];
							return result ? (
								<div key={id} className="bd-feedback">
									<strong>
										{plain(document.questionsById[id].prompt)} · {result.score}/
										{result.max}
									</strong>
									{result.feedback && <p>{result.feedback}</p>}
								</div>
							) : null;
						})}
				</>
			)}
		</div>
	);
}
type Participant = BuilderResponse & {
	studentId: string;
	name: string;
	assessment: BuilderAssessment;
};
function BuilderRunReview({ id }: { id: string }) {
	const [data, setData] = useState<{
			document: BuilderDocument;
			privateKeys: Record<string, BuilderKey>;
			participants: Participant[];
		} | null>(null),
		[selected, setSelected] = useState(''),
		[error, setError] = useState(''),
		[busy, setBusy] = useState(false);
	const load = () =>
		deliveryRequest<NonNullable<typeof data>>('review', { runId: id }).then(
			setData,
		);
	useEffect(() => {
		void load().catch((e) => setError(e.message));
	}, [id]);
	const student =
		data?.participants.find((p) => p.studentId === selected) ||
		data?.participants[0];
	const grade = async (
		questionId: string,
		score: number,
		feedback: string,
		reset = false,
		criteria?: Record<string, number>,
	) => {
		if (!student) return;
		setBusy(true);
		setError('');
		try {
			await deliveryRequest('grade', {
				runId: id,
				studentId: student.studentId,
				baseRevision: student.revision,
				questionId,
				score,
				feedback,
				reset,
				criteria,
			});
			await load();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};
	return (
		<section className="bd-run-review">
			<h2>Jawaban & penilaian</h2>
			<button
				className="bd-secondary"
				disabled={busy}
				onClick={() => void load().catch((e) => setError(e.message))}
			>
				Muat ulang jawaban
			</button>
			{error && <p role="alert">{error}</p>}
			{!data?.participants.length ? (
				<p>Belum ada mahasiswa yang mulai.</p>
			) : (
				<>
					<label>
						Mahasiswa
						<select
							value={student?.studentId || ''}
							onChange={(e) => setSelected(e.target.value)}
						>
							{data.participants.map((p) => (
								<option key={p.studentId} value={p.studentId}>
									{p.name} ·{' '}
									{p.submittedAt ? 'Terkumpul' : 'Sedang mengerjakan'} ·{' '}
									{p.assessment.pending} perlu dinilai
								</option>
							))}
						</select>
					</label>
					{student && (
						<>
							<p>
								{student.assessment.earned}/{student.assessment.total} poin ·{' '}
								{student.assessment.pending} butir menunggu penilaian
							</p>
							{data.document.activities.map((a) => (
								<details key={a.id}>
									<summary>{a.title}</summary>
									{a.blocks.flatMap(questionIds).map((qid) => (
										<GradeRow
											key={qid + ':' + student.revision}
											question={data.document.questionsById[qid]}
											answer={student.answers[qid] || ''}
											result={student.assessment.items[qid]}
											guidance={data.privateKeys[qid]}
											busy={
												busy ||
												(!student.submittedAt &&
													!student.submittedActivities.includes(a.id))
											}
											onGrade={(score, feedback, reset, criteria) =>
												void grade(qid, score, feedback, reset, criteria)
											}
										/>
									))}
								</details>
							))}
							<button
								className="bd-primary"
								disabled={
									busy || !student.submittedAt || student.assessment.pending > 0
								}
								onClick={async () => {
									if (
										!window.confirm(
											'Terbitkan nilai dan umpan balik kepada mahasiswa ini?',
										)
									)
										return;
									setBusy(true);
									try {
										await deliveryRequest('release', {
											runId: id,
											studentId: student.studentId,
											baseRevision: student.revision,
										});
										await load();
									} catch (e) {
										setError((e as Error).message);
									} finally {
										setBusy(false);
									}
								}}
							>
								Terbitkan hasil {student.name}
							</button>
							{student.released && (
								<p>
									Hasil terakhir diterbitkan {date(student.released.at || '')}.
									Perubahan nilai berikutnya memerlukan penerbitan ulang.
								</p>
							)}
						</>
					)}
				</>
			)}
		</section>
	);
}
function GradeRow({
	question,
	answer,
	result,
	guidance,
	busy,
	onGrade,
}: {
	question: BuilderDocument['questionsById'][string];
	answer: string;
	result: BuilderAssessment['items'][string];
	guidance: BuilderKey;
	busy: boolean;
	onGrade: (
		score: number,
		feedback: string,
		reset?: boolean,
		criteria?: Record<string, number>,
	) => void;
}) {
	const [score, setScore] = useState(result.score),
		[feedback, setFeedback] = useState(result.feedback),
		[criteria, setCriteria] = useState<Record<string, number>>(
			result.criteria || {},
		);
	return (
		<div className="bd-grade-row">
			<strong>{plain(question.prompt)}</strong>
			<p className="bd-prose">
				Jawaban:{' '}
				{question.options?.find((o) => o.id === answer)?.label || answer || '—'}
			</p>
			<p>
				{result.pending
					? 'Perlu dinilai'
					: result.overridden
						? 'Diubah dosen'
						: 'Otomatis'}{' '}
				· {result.score}/{result.max}
			</p>
			{guidance.modelAnswer && <p>Contoh: {plain(guidance.modelAnswer)}</p>}
			{guidance.privateGuidance && (
				<p>Panduan: {plain(guidance.privateGuidance)}</p>
			)}
			{question.rubric?.criteria.map((c) => (
				<label key={c.id}>
					{c.label} / {c.maxPoints}
					<input
						type="number"
						min={0}
						max={c.maxPoints}
						step="any"
						value={criteria[c.id] ?? ''}
						onChange={(e) => {
							const next = { ...criteria, [c.id]: Number(e.target.value) };
							setCriteria(next);
							setScore(Object.values(next).reduce((s, v) => s + v, 0));
						}}
					/>
				</label>
			))}
			<div className="bd-inline-actions">
				<button
					className="bd-secondary"
					disabled={busy}
					onClick={() =>
						onGrade(
							question.points,
							feedback,
							false,
							question.rubric?.criteria.length
								? Object.fromEntries(
										question.rubric.criteria.map((c) => [c.id, c.maxPoints]),
									)
								: undefined,
						)
					}
				>
					Benar · {question.points}
				</button>
				<button
					className="bd-secondary"
					disabled={busy}
					onClick={() =>
						onGrade(
							0,
							feedback,
							false,
							question.rubric?.criteria.length
								? Object.fromEntries(
										question.rubric.criteria.map((c) => [c.id, 0]),
									)
								: undefined,
						)
					}
				>
					Salah · 0
				</button>
				<label>
					Nilai / {question.points}
					<input
						type="number"
						min={0}
						max={question.points}
						step="any"
						value={score}
						onChange={(e) => setScore(Number(e.target.value))}
					/>
				</label>
			</div>
			<label>
				Umpan balik
				<textarea
					maxLength={10000}
					value={feedback}
					onChange={(e) => setFeedback(e.target.value)}
				/>
			</label>
			<div className="bd-inline-actions">
				<button
					className="bd-primary"
					disabled={
						busy ||
						!Number.isFinite(score) ||
						score < 0 ||
						score > question.points
					}
					onClick={() =>
						onGrade(
							score,
							feedback,
							false,
							Object.keys(criteria).length ? criteria : undefined,
						)
					}
				>
					Simpan penilaian
				</button>
				{result.overridden && (
					<button
						className="bd-secondary"
						disabled={busy}
						onClick={() => onGrade(0, '', true)}
					>
						Kembalikan penilaian awal
					</button>
				)}
			</div>
		</div>
	);
}
