import { Link } from 'react-router';
import { ArrowUpRight, Home, BookOpen, ClipboardList, FolderOpen, CheckCircle2, BarChart3, Sparkles, Play } from 'lucide-react';

/**
 * Public hero. The right pane mirrors the real student workspace
 * (sidebar, current course, upcoming tasks) with floating AI-correction
 * and feedback cards, so the landing reads as the same product.
 */
export function Hero() {
	return (
		<section className="lp-hero" id="top" aria-labelledby="hero-title">
			<div className="lp-hero-bg" aria-hidden="true">
				<div className="lp-hero-grid" />
				<div className="lp-hero-arc" />
			</div>
			<div className="lp-wrap lp-hero-layout">
				<div className="lp-hero-copy">
					<p className="lp-eyebrow">
						<span className="dot" />
						Pembelajaran akademik berbantuan AI
					</p>
					<h1 id="hero-title">
						Belajar bahasa.
						<br />
						<em>Mengajar lebih cerdas.</em>
					</h1>
					<p className="lp-hero-sub">
						LARAS menyatukan pembelajaran bahasa, asisten AI, tugas, evaluasi,
						dan wawasan akademik dalam satu ruang kerja yang terhubung — untuk
						mahasiswa dan dosen.
					</p>
					<div className="lp-hero-ctas">
						<Link to="/login" className="lp-btn lp-btn-primary">
							Mulai dengan LARAS <ArrowUpRight size={17} />
						</Link>
						<Link to="/#cara-kerja" className="lp-btn lp-btn-ghost">
							<span className="lp-play" aria-hidden="true">
								<Play size={10} />
							</span>
							Lihat cara kerja
						</Link>
					</div>
					<dl className="lp-hero-meta">
						<div>
							<dt className="lp-sr-only">Dibuat untuk</dt>
							<dd style={{ margin: 0 }}>
								<b>Mahasiswa</b>berlatih, bertanya, mengumpulkan
							</dd>
						</div>
						<div>
							<dt className="lp-sr-only">dan</dt>
							<dd style={{ margin: 0 }}>
								<b>Dosen</b>mengajar, menilai, membimbing
							</dd>
						</div>
					</dl>
				</div>

				<div
					className="lp-stage"
					role="img"
					aria-label="Pratinjau ruang kerja mahasiswa LARAS: mata kuliah Bahasa Jerman pada 68%, tugas mendatang, koreksi AI, dan nilai 86."
				>
					<div className="lp-stage-tilt">
						<div className="lp-app" aria-hidden="true">
							<div className="lp-app-bar">
								<i />
								<i />
								<i />
								<span className="url">laras.ac.id/app</span>
							</div>
							<div className="lp-app-body">
								<aside className="lp-app-side">
									<div className="brand">
										<span />
										LARAS
									</div>
									<div className="lp-side-item on">
										<Home size={15} /> Hari ini
									</div>
									<div className="lp-side-item">
										<BookOpen size={15} /> Mata Kuliah
									</div>
									<div className="lp-side-item">
										<ClipboardList size={15} /> Tugas<span className="count">2</span>
									</div>
									<div className="lp-side-item">
										<FolderOpen size={15} /> Materi
									</div>
									<div className="lp-side-item">
										<CheckCircle2 size={15} /> Umpan balik
									</div>
									<div className="lp-side-item">
										<BarChart3 size={15} /> Progres
									</div>
								</aside>
								<div className="lp-app-main">
									<div className="lp-app-greet">
										<div>
											<small>Selasa, 6 Oktober</small>
											<h3>Selamat pagi, Rina</h3>
										</div>
										<span className="lp-chip lp-chip-red hide-sm">Minggu 7 / 16</span>
									</div>
									<div className="lp-panel">
										<h4>
											Mata kuliah aktif <span className="lp-chip lp-chip-ink">Bahasa Jerman I</span>
										</h4>
										<div className="lp-course-title">Kapitel 11: Die Jacke gefällt mir!</div>
										<div className="lp-course-sub">Pakaian, warna, dialog berbelanja</div>
										<div className="lp-progress-row">
											<div className="lp-bar">
												<i style={{ '--w': '68%' }} />
											</div>
											<b>68%</b>
										</div>
									</div>
									<div className="lp-panel hide-sm">
										<h4>Minggu ini</h4>
										<div className="lp-mini-chart">
											<i style={{ '--h': '40%' }} />
											<i style={{ '--h': '62%' }} />
											<i style={{ '--h': '35%' }} />
											<i className="hi" style={{ '--h': '88%' }} />
											<i style={{ '--h': '54%' }} />
										</div>
										<div className="lp-course-sub" style={{ marginTop: 8 }}>
											3 jam 40 menit berlatih
										</div>
									</div>
									<div className="lp-panel" style={{ gridColumn: '1/-1' }}>
										<h4>Akan datang</h4>
										<div className="lp-task">
											<span className="ic">
												<ClipboardList size={14} />
											</span>
											<p>
												Lembar kerja 11.3: Im Kaufhaus
												<small>Sprechen · jatuh tempo Kamis</small>
											</p>
											<span className="lp-chip lp-chip-wait">Sedang dikerjakan</span>
										</div>
										<div className="lp-task">
											<span className="ic">
												<BookOpen size={14} />
											</span>
											<p>
												Menyimak 11.2: Kleidung kaufen
												<small>Hören · jatuh tempo Jumat</small>
											</p>
											<span className="lp-chip lp-chip-ink">Belum dimulai</span>
										</div>
										<div className="lp-task hide-sm">
											<span className="ic">
												<CheckCircle2 size={14} />
											</span>
											<p>
												Menulis 10.4: Mein Tag
												<small>Dinilai oleh Bu Dewi</small>
											</p>
											<span className="lp-chip lp-chip-ok">Umpan balik siap</span>
										</div>
									</div>
								</div>
							</div>
						</div>
						<div className="lp-float lp-float-grade lp-bob-2" aria-hidden="true">
							<span className="lp-ring" style={{ '--p': 86 }} data-v="86" />
							<div>
								<b>Menulis 10.4 dinilai</b>
								<small>Struktur jelas, periksa posisi kata kerja</small>
							</div>
						</div>
						<div className="lp-float lp-float-ai lp-bob" aria-hidden="true">
							<div className="who">
								<span className="lp-ai-mark">
									<Sparkles size={12} />
								</span>
								Asisten LARAS
							</div>
							<p>
								Kamu menulis <span className="lp-strike">Der Jacke</span> gefällt mir. <i>Jacke</i> feminin, jadi{' '}
								<span className="lp-fix">Die Jacke</span> gefällt mir.
							</p>
							<div className="ctx">
								<span className="lp-chip lp-chip-ink">Lembar kerja 11.3</span>
								<span className="lp-chip lp-chip-ink">Kosakata Kapitel 11</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
