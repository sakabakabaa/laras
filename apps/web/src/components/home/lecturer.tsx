import { Sparkles, ClipboardList, BarChart3, Users } from 'lucide-react';

export function Lecturer() {
	return (
		<section className="lp-section lp-lect" id="dosen" aria-labelledby="lect-title">
			<div className="lp-wrap">
				<div className="lp-section-head" data-lp-reveal>
					<p className="lp-kicker">Untuk dosen</p>
					<h2 id="lect-title">Mengajar, menilai, dan membimbing dari satu tempat.</h2>
					<p>
						Dosen merancang tugas, meninjau pengumpulan dengan draf AI, dan mengikuti
						progres kelas — tanpa berpindah antar alat.
					</p>
				</div>
				<div className="lp-lect-grid">
					<div className="lp-dk lp-span-3" data-lp-reveal>
						<h3><ClipboardList size={16} /> Mata kuliah aktif</h3>
						<div className="lp-stat">4</div>
						<p className="lp-stat-label">Bahasa Jerman I (A, B, C), Fonetik</p>
					</div>
					<div className="lp-dk lp-span-3" data-lp-reveal style={{ '--d': '.06s' }}>
						<h3><Users size={16} /> Mahasiswa terdaftar</h3>
						<div className="lp-stat">117</div>
						<p className="lp-stat-label">Tersebar di empat kelas</p>
					</div>
					<div className="lp-dk lp-span-3" data-lp-reveal style={{ '--d': '.12s' }}>
						<h3><BarChart3 size={16} /> Pengumpulan menunggu</h3>
						<div className="lp-stat">18</div>
						<p className="lp-stat-label">12 sudah punya catatan draf AI</p>
					</div>
					<div className="lp-dk lp-span-3" data-lp-reveal style={{ '--d': '.18s' }}>
						<h3>Rata-rata kelas</h3>
						<div className="lp-stat">78</div>
						<p className="lp-stat-label">Naik dari 72 minggu lalu</p>
					</div>

					<div className="lp-dk lp-span-7" data-lp-reveal style={{ '--d': '.1s' }}>
						<h3>
							Pengumpulan mahasiswa <span className="lp-muted lp-small">Lembar kerja 11.3</span>
						</h3>
						<div className="lp-sub-row">
							<span className="lp-avatar" style={{ background: '#4B505C' }}>AP</span>
							<div className="who">
								Adi Pratama
								<small>NIM 2200123</small>
							</div>
							<span className="lp-status wait">Perlu ditinjau</span>
						</div>
						<div className="lp-sub-row">
							<span className="lp-avatar" style={{ background: 'var(--lp-red)' }}>RS</span>
							<div className="who">
								Rina Sari
								<small>NIM 2200145</small>
							</div>
							<span className="lp-status ok">Sudah ditinjau</span>
						</div>
						<div className="lp-sub-row">
							<span className="lp-avatar" style={{ background: '#7E838E' }}>DK</span>
							<div className="who">
								Dimas Kurniawan
								<small>NIM 2200167</small>
							</div>
							<span className="lp-status wait">Perlu ditinjau</span>
						</div>
					</div>

					<div className="lp-dk lp-span-5" data-lp-reveal style={{ '--d': '.16s' }}>
						<h3>Rekomendasi AI</h3>
						<div className="lp-rec">
							<span className="lp-ai-mark">
								<Sparkles size={15} />
							</span>
							<p>
								7 mahasiswa di Kelas B keliru <b>der / die / das</b> pada kata benda
								pakaian. Sebuah lembar kerja tinjauan 10 menit siap dikirim.
							</p>
						</div>
						<div className="acts">
							<button type="button" className="lp-btn lp-btn-dk">Tinjau draf</button>
							<button type="button" className="lp-btn lp-btn-dk-ghost">Tutup</button>
						</div>
					</div>
				</div>

				<div className="lp-lect-points">
					<div data-lp-reveal>
						<h3>Draf AI, keputusan dosen</h3>
						<p>
							AI menyusun draf umpan balik berbasis bukti; dosen menyunting, menerima,
							atau menolak sebelum dipublikasikan.
						</p>
					</div>
					<div data-lp-reveal style={{ '--d': '.08s' }}>
						<h3>Penilaian terkonsolidasi</h3>
						<p>
							Nilai tugas, komponen, dan bobot terkumpul di buku nilai — termasuk
							mahasiswa yang belum memiliki komponen.
						</p>
					</div>
					<div data-lp-reveal style={{ '--d': '.16s' }}>
						<h3>Wawasan kelas</h3>
						<p>
							Lihat topik yang sulit dan siapa yang butuh dukungan lebih awal, bukan
							setelah ujian.
						</p>
					</div>
				</div>
			</div>
		</section>
	);
}
