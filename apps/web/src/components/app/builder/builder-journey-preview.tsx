import { useEffect, useState } from 'react';
import { BuilderPreview } from './builder-elements';
import { questionIds, type BuilderDocument } from '@/lib/builder-document';
export function BuilderJourneyPreview({
	document,
}: {
	document: BuilderDocument;
}) {
	const [answers, setAnswers] = useState<Record<string, string>>({}),
		[index, setIndex] = useState(0),
		[submitted, setSubmitted] = useState<string[]>([]),
		[started, setStarted] = useState(0),
		[now, setNow] = useState(Date.now()),
		[notice, setNotice] = useState('');
	const activity = document.activities[index];
	useEffect(() => {
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, []);
	if (!activity) return <p>Tambahkan kegiatan untuk mencoba alurnya.</p>;
	const limitMinutes =
		document.kind === 'kelas'
			? activity.plannedMinutes
			: document.delivery.timeLimitMinutes;
	const seconds = Math.max(
		0,
		Math.ceil(((started || now) + limitMinutes * 60000 - now) / 1000),
	);
	const taskSubmitted =
		document.kind === 'tugas' &&
		submitted.length === document.activities.length;
	return (
		<div>
			<p className="bd-review-notice">
				Simulasi mahasiswa · jawaban dan pengiriman tidak disimpan. Jadwal
				dibuat terbuka selama pratinjau; waktu produksi tetap mengikuti server.
			</p>
			<div className="bd-inline-actions">
				<button
					className="bd-secondary"
					onClick={() => {
						setStarted(Date.now());
						setNotice('Simulasi waktu dimulai.');
					}}
				>
					Mulai simulasi waktu
				</button>
				<span>
					{limitMinutes > 0 && started
						? `Sisa kegiatan: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
						: document.kind === 'tugas' && document.delivery.timeLimitMinutes
							? `Batas waktu tugas: ${document.delivery.timeLimitMinutes} menit`
							: 'Tanpa simulasi waktu aktif'}
				</span>
				<button
					className="bd-secondary"
					onClick={() => {
						setAnswers({});
						setSubmitted([]);
						setStarted(0);
						setNotice('Simulasi direset.');
					}}
				>
					Reset simulasi
				</button>
			</div>
			<nav className="bd-run-navigation" aria-label="Navigasi pratinjau">
				{document.activities.map((a, i) => (
					<button
						className="bd-secondary"
						aria-current={i === index ? 'step' : undefined}
						key={a.id}
						onClick={() => {
							setIndex(i);
							if (document.kind === 'kelas') setStarted(0);
						}}
					>
						{i + 1}. {a.title}
						{submitted.includes(a.id) ? ' ✓' : ''}
					</button>
				))}
			</nav>
			<BuilderPreview
				document={document}
				activityId={activity.id}
				answers={answers}
				onAnswersChange={setAnswers}
				readOnly={
					submitted.includes(activity.id) ||
					Boolean(limitMinutes > 0 && started && seconds === 0)
				}
				live
			/>
			<button
				className="bd-primary"
				disabled={
					taskSubmitted ||
					(document.kind === 'kelas' && submitted.includes(activity.id))
				}
				onClick={() => {
					const targets =
						document.kind === 'tugas' ? document.activities : [activity];
					if (limitMinutes > 0 && started && seconds === 0) {
						setSubmitted([
							...new Set([...submitted, ...targets.map((a) => a.id)]),
						]);
						setNotice(
							'Waktu percobaan habis. Jawaban tersimpan difinalisasi dalam produksi.',
						);
						return;
					}
					const missing = targets
						.flatMap((a) => a.blocks.flatMap(questionIds))
						.some(
							(id) =>
								document.questionsById[id].required && !answers[id]?.trim(),
						);
					if (
						missing ||
						targets.some(
							(a) =>
								a.required &&
								a.blocks.some(
									(b) =>
										b.type === 'acknowledgement' && answers[b.id] !== 'yes',
								),
						)
					) {
						setNotice('Lengkapi semua jawaban wajib terlebih dahulu.');
						return;
					}
					setSubmitted([
						...new Set([...submitted, ...targets.map((a) => a.id)]),
					]);
					setNotice(
						'Pengiriman percobaan berhasil. Tidak ada jawaban mahasiswa yang dibuat.',
					);
				}}
			>
				Kumpulkan {document.kind === 'tugas' ? 'seluruh tugas' : 'kegiatan'}{' '}
				(percobaan)
			</button>
			{notice && <p role="status">{notice}</p>}
		</div>
	);
}
