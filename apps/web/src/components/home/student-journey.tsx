import { Bell, CheckCircle2 } from 'lucide-react';

const STEPS = [
	{ title: 'Tugas baru tiba', body: 'Lembar kerja 11.3 muncul di Hari ini beserta tenggat dan materi yang dipakai.', shot: 'notif' },
	{ title: 'Buka lembar kerja', body: 'Tugas terbuka di dalam LARAS, di samping audio dan denah yang dimaksud.', shot: null },
	{ title: 'Kerjakan tugas', body: 'Jawaban tersimpan otomatis, sehingga bisa berlatih dalam sesi singkat.', shot: 'wsq' },
	{ title: 'Minta bantuan saat buntu', body: 'Asisten menjelaskan tata bahasa di balik kesalahan, bukan sekadar memberi jawaban.', shot: 'bubble' },
	{ title: 'Kumpulkan', body: 'Satu klik menyerahkan pekerjaan ke dosen, dengan cap waktu dan salinan untuk mahasiswa.', shot: null },
	{ title: 'Terima umpan balik', body: 'Catatan terstruktur tiba dengan nilai dan saran langkah berikutnya.', shot: 'score' },
];

export function StudentJourney() {
	return (
		<section className="lp-section" id="mahasiswa" aria-labelledby="students-title" style={{ paddingTop: 0 }}>
			<div className="lp-wrap">
				<div className="lp-section-head" data-lp-reveal>
					<p className="lp-kicker">Untuk mahasiswa</p>
					<h2 id="students-title">Dibangun di sekitar langkah berikutnya mahasiswa.</h2>
					<p>
						Dari tugas tiba hingga progres diperbarui, setiap langkah mengalir ke
						langkah berikutnya.
					</p>
				</div>
				<div className="lp-journey">
					<div className="lp-journey-track">
						<span className="lp-journey-rail" aria-hidden="true">
							<i />
						</span>
						<ol className="lp-journey-steps">
							{STEPS.map((s, i) => (
								<li className="lp-jstep" key={s.title} data-step={i}>
									<span className="lp-jnum">{i + 1}</span>
									<h3>{s.title}</h3>
									<p>{s.body}</p>
									{s.shot === 'notif' && (
										<div className="mobile-shot lp-notif">
											<span className="lp-avatar">ND</span>
											<div>
												<b>Tugas baru</b>
												<div className="lp-muted lp-small">Lembar kerja 11.3: Im Kaufhaus, jatuh tempo Kam</div>
											</div>
										</div>
									)}
									{s.shot === 'wsq' && (
										<div className="mobile-shot lp-ws-q">
											<small>Soal 4</small>
											Wo finde ich <span className="lp-ws-blank">die</span> Jacken?
										</div>
									)}
									{s.shot === 'bubble' && (
										<div className="mobile-shot lp-bubble ai">
											Jacke feminin, jadi artikel jamaknya <b>die</b>.
										</div>
									)}
									{s.shot === 'score' && (
										<div className="mobile-shot lp-submit-card">
											<span className="lp-check-anim">
												<CheckCircle2 size={18} />
											</span>
											Tugas terkumpul — umpan balik 86
										</div>
									)}
								</li>
							))}
						</ol>
					</div>
					<div className="lp-journey-visual" aria-hidden="true">
						<div className="lp-device">
							<div className="lp-device-top">
								<span>Perjalanan mahasiswa</span>
								<span className="steps-dots">
									{STEPS.map((_, i) => (
										<i key={i} className={i === 0 ? 'on' : ''} />
									))}
								</span>
							</div>
							<div className="lp-screen on">
								<h4>Tugas baru tiba</h4>
								<div className="lp-notif">
									<span className="lp-avatar">ND</span>
									<div>
										<b>Lembar kerja 11.3</b>
										<div className="lp-muted lp-small">Im Kaufhaus · jatuh tempo Kamis</div>
									</div>
									<Bell size={16} />
								</div>
							</div>
							<div className="lp-screen">
								<h4>Buka lembar kerja</h4>
								<div className="lp-ws-q">
									<small>Soal 4</small>
									Wo finde ich <span className="lp-ws-blank">die</span> Jacken?
								</div>
								<div className="lp-muted lp-small">Audio &amp; denah tersedia di samping.</div>
							</div>
							<div className="lp-screen">
								<h4>Kerjakan tugas</h4>
								<div className="lp-ws-q">
									<small>Soal 4</small>
									Wo finde ich <span className="lp-ws-blank">die</span> Jacken?
								</div>
								<div className="lp-muted lp-small">Tersimpan otomatis · 2 menit lalu</div>
							</div>
							<div className="lp-screen">
								<h4>Minta bantuan</h4>
								<div className="lp-bubble me">Kenapa pakai “die”?</div>
								<div className="lp-bubble ai">
									<em>Jacke</em> feminin, jadi artikel jamaknya <b>die</b>.
								</div>
							</div>
							<div className="lp-screen">
								<h4>Kumpulkan</h4>
								<div className="lp-submit-card">
									<span className="lp-check-anim">
										<CheckCircle2 size={18} />
									</span>
									Tugas terkumpul
								</div>
								<div className="lp-muted lp-small">Cap waktu &amp; salinan tersimpan.</div>
							</div>
							<div className="lp-screen">
								<h4>Terima umpan balik</h4>
								<div className="lp-score-big">
									<span className="lp-ring" style={{ '--p': 86 }} data-v="86" />
									<div>
										<b>Menulis 10.4</b>
										<div className="lp-muted lp-small">Struktur jelas, periksa posisi kata kerja</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
