const STEPS = [
	{ role: 'L', tag: 'Dosen', title: 'Membuat tugas', body: 'Dosen menyusun lembar kerja, jadwal, dan rubrik — dengan bantuan draf AI bila perlu.' },
	{ role: 'S', tag: 'Mahasiswa', title: 'Mengerjakan & bertanya', body: 'Mahasiswa mengerjakan di dalam LARAS dan meminta bantuan asisten saat buntu.' },
	{ role: 'A', tag: 'AI', title: 'Menyusun draf umpan balik', body: 'AI menyiapkan catatan terstruktur berbasis rubrik dan jawaban mahasiswa.' },
	{ role: 'L', tag: 'Dosen', title: 'Meninjau & menilai', body: 'Dosen menyunting draf, menetapkan nilai, dan mempublikasikan umpan balik.' },
	{ role: 'S', tag: 'Mahasiswa', title: 'Memperbaiki & lanjut', body: 'Mahasiswa membaca umpan balik dan melanjutkan ke langkah berikutnya.' },
];

export function Workflow() {
	return (
		<section className="lp-section lp-flow" id="cara-kerja" aria-labelledby="flow-title">
			<div className="lp-wrap">
				<div className="lp-section-head" data-lp-reveal style={{ marginLeft: 'auto', marginRight: 'auto', textAlign: 'center' }}>
					<p className="lp-kicker">Cara kerja</p>
					<h2 id="flow-title">Satu lingkaran belajar, dari tugas ke perbaikan.</h2>
				</div>
				<div className="lp-flow-track">
					<div className="lp-flow-legend" data-lp-reveal>
						<span><i className="lp-role-tag L" style={{ display: 'inline-block' }}>Dosen</i></span>
						<span><i className="lp-role-tag S" style={{ display: 'inline-block' }}>Mahasiswa</i></span>
						<span><i className="lp-role-tag A" style={{ display: 'inline-block' }}>AI</i></span>
					</div>
					<ol className="lp-flow-list">
						<span className="lp-flow-spine" aria-hidden="true"><i /></span>
						{STEPS.map((s, i) => (
							<li className="lp-fstep" key={s.title}>
								<span className="node" />
								<div className="lp-fcard">
									<div className="role">
										<span className={`lp-role-tag ${s.role}`}>{s.tag}</span>
										Langkah {i + 1}
									</div>
									<h3>{s.title}</h3>
									<p>{s.body}</p>
								</div>
							</li>
						))}
					</ol>
				</div>
			</div>
		</section>
	);
}
