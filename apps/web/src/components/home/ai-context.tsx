import { Sparkles, FileText, FolderOpen, User, ShieldCheck, Eye, Scale } from 'lucide-react';

export function AiContext() {
	return (
		<section className="lp-section" id="ai" aria-labelledby="ai-title">
			<div className="lp-wrap">
				<div className="lp-section-head" data-lp-reveal>
					<p className="lp-kicker">AI yang bertanggung jawab</p>
					<h2 id="ai-title">AI yang tahu konteksnya — dan tahu batasnya.</h2>
					<p>
						Asisten bekerja dengan memahami halaman, materi, dan progres mahasiswa.
						Setiap jawaban menunjukkan sumbernya, dan dosen tetap memutuskan.
					</p>
				</div>

				<div className="lp-ctx-stage">
					<div className="lp-ctx-col" data-lp-reveal>
						<p className="lp-ctx-label">Halaman mahasiswa</p>
						<div className="lp-mini-page">
							<div className="crumb">Bahasa Jerman I · Lembar kerja 11.3</div>
							<h4>Soal 4 — Im Kaufhaus</h4>
							<div className="q focus">Wo finde ich ___ Jacken?</div>
						</div>
					</div>

					<div className="lp-ctx-col" data-lp-reveal style={{ '--d': '.1s' }}>
						<p className="lp-ctx-label">Asisten LARAS</p>
						<div className="lp-assistant">
							<div className="lp-assistant-head">
								<span className="lp-ai-mark">
									<Sparkles size={12} />
								</span>
								Asisten Belajar
								<span className="live-dot">Berbasis konteks</span>
							</div>
							<div className="lp-assistant-body">
								<div className="lp-bubble ai">
									<em>Jacke</em> feminin, jadi artikel jamaknya <b>die</b>.
									<div style={{ marginTop: 8 }}>
										<span className="lp-cite">Kosakata Kap. 11</span>
										<span className="lp-cite">Denah toko</span>
									</div>
								</div>
							</div>
						</div>
					</div>

					<div className="lp-ctx-col lp-ctx-sources" data-lp-reveal style={{ '--d': '.2s' }}>
						<p className="lp-ctx-label">Sumber yang dirujuk</p>
						<ul className="lp-sources">
							<li className="lp-src">
								<FileText size={18} />
								<div>
									<b>Lembar kerja 11.3</b>
									<small>Soal 4 — konteks saat ini</small>
								</div>
							</li>
							<li className="lp-src">
								<FolderOpen size={18} />
								<div>
									<b>Denah toko</b>
									<small>Materi mata kuliah</small>
								</div>
							</li>
							<li className="lp-src">
								<User size={18} />
								<div>
									<b>Progres Sprechen</b>
									<small>61 — area untuk berlatih</small>
								</div>
							</li>
						</ul>
					</div>
				</div>

				<div className="lp-ai-notes">
					<div data-lp-reveal>
						<h3><ShieldCheck size={18} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Berbasis bukti</h3>
						<p>
							Jawaban AI berakar pada materi dan konteks mata kuliah, dengan rujukan
							yang dapat ditelusuri — bukan klaim tanpa sumber.
						</p>
					</div>
					<div data-lp-reveal style={{ '--d': '.08s' }}>
						<h3><Eye size={18} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Transparan</h3>
						<p>
							Mahasiswa melihat dari mana jawaban berasal; dosen melihat apa yang
							dibantu AI dan apa yang menjadi keputusan manusia.
						</p>
					</div>
					<div data-lp-reveal style={{ '--d': '.16s' }}>
						<h3><Scale size={18} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Dosen memutuskan</h3>
						<p>
							AI membantu menyusun draf umpan balik dan rekomendasi, tetapi nilai dan
							publikasi tetap di tangan dosen.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
