import { TrendingUp, Lightbulb, AlertCircle } from 'lucide-react';

const WEEK = [
	{ d: 'Sen', h: '38%' },
	{ d: 'Sel', h: '55%' },
	{ d: 'Rab', h: '30%' },
	{ d: 'Kam', h: '82%', peak: true },
	{ d: 'Jum', h: '64%' },
	{ d: 'Sab', h: '22%' },
	{ d: 'Min', h: '18%' },
];

const SKILLS = [
	{ label: 'Hören', w: '74%', v: '74' },
	{ label: 'Sprechen', w: '61%', v: '61' },
	{ label: 'Schreiben', w: '69%', v: '69' },
	{ label: 'Lesen', w: '78%', v: '78' },
];

export function Analytics() {
	return (
		<section className="lp-section" id="analitik" aria-labelledby="an-title">
			<div className="lp-wrap">
				<div className="lp-section-head" data-lp-reveal>
					<p className="lp-kicker">Analitik akademik</p>
					<h2 id="an-title">Lihat kelas dan setiap mahasiswa, lebih jelas.</h2>
					<p>
						Aktivitas mingguan, distribusi keterampilan, dan wawasan yang dapat ditindaklanjuti
						— tanpa angka yang dibuat-buat.
					</p>
				</div>
				<div className="lp-an-grid">
					<div className="lp-an-card lp-span-4" data-lp-reveal>
						<h3>Aktivitas minggu ini</h3>
						<div className="lp-week">
							{WEEK.map((w) => (
								<div className={`col${w.peak ? ' peak' : ''}`} key={w.d}>
									<i style={{ '--h': w.h }} />
									<span>{w.d}</span>
								</div>
							))}
						</div>
						<p className="lp-delta">Puncak aktivitas pada <b>Kamis</b>.</p>
					</div>

					<div className="lp-an-card lp-span-4" data-lp-reveal style={{ '--d': '.08s' }}>
						<h3>Distribusi keterampilan</h3>
						<div className="lp-skills" style={{ marginTop: 6 }}>
							{SKILLS.map((s, i) => (
								<div className="lp-cls-row" key={s.label} style={{ '--d': `${i * 0.1}s` }}>
									<span>{s.label}</span>
									<div className="lp-bar"><i style={{ '--w': s.w }} /></div>
									<b>{s.v}</b>
								</div>
							))}
						</div>
					</div>

					<div className="lp-an-card lp-span-4" data-lp-reveal style={{ '--d': '.16s' }}>
						<h3>Penyelesaian tugas</h3>
						<div className="lp-donut" style={{ marginTop: 6 }}>
							<svg viewBox="0 0 120 120">
								<circle className="bg" cx="60" cy="60" r="50" />
								<circle className="fg" cx="60" cy="60" r="50" strokeDasharray="314" strokeDashoffset="91" />
							</svg>
							<ul className="lp-legend-list">
								<li><i style={{ background: 'var(--lp-red)' }} />Sudah dikumpulkan</li>
								<li><i style={{ background: '#EDEDE8' }} />Belum dimulai</li>
							</ul>
						</div>
					</div>

					<div className="lp-an-card lp-span-12" data-lp-reveal style={{ '--d': '.1s' }}>
						<h3>Wawasan yang dapat ditindaklanjuti</h3>
						<div className="lp-insight">
							<span className="ic"><TrendingUp size={16} /></span>
							<div>
								<b>Kelas B</b> mengalami kesulitan pada artikel Akkusativ. Pertimbangkan
								lembar kerja tinjauan singkat sebelum pertemuan berikutnya.
							</div>
						</div>
						<div className="lp-insight">
							<span className="ic"><Lightbulb size={16} /></span>
							<div>
								<b>3 mahasiswa</b> belum memulai Menyimak 11.2. Pengingat otomatis dapat
								dikirim sebelum tenggat Jumat.
							</div>
						</div>
						<div className="lp-insight">
							<span className="ic"><AlertCircle size={16} /></span>
							<div>
								Rata-rata kelas <b>naik</b> minggu ini. Topik yang sebelumnya sulit
								menunjukkan peningkatan.
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
