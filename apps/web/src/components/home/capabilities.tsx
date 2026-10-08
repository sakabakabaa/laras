import { MessageSquare, ClipboardList, PenLine, FolderOpen, TrendingUp, BarChart3 } from 'lucide-react';

const CAPS = [
	{ icon: MessageSquare, title: 'Asisten belajar AI', body: 'Menjawab dengan memahami halaman, mata kuliah, dan tugas yang sedang dikerjakan mahasiswa.' },
	{ icon: ClipboardList, title: 'Tugas cerdas', body: 'Buat, jadwalkan, dan bagikan lembar kerja, tugas menyimak, dan instruksi menulis.' },
	{ icon: PenLine, title: 'Evaluasi berbantuan AI', body: 'Menyusun draf umpan balik terstruktur untuk tiap pengumpulan. Dosen menyunting dan memutuskan nilai.' },
	{ icon: FolderOpen, title: 'Materi pembelajaran', body: 'Slide, audio, dan bacaan tersusun per bab dan dapat dicari dalam satu tempat.' },
	{ icon: TrendingUp, title: 'Progres mahasiswa', body: 'Lihat aktivitas dan hasil per keterampilan, dari menyimak hingga berbicara, sepanjang semester.' },
	{ icon: BarChart3, title: 'Analitik akademik', body: 'Kenali topik yang sulit bagi sebuah kelas dan siapa yang mungkin butuh dukungan, lebih awal.' },
];

export function Capabilities() {
	return (
		<section className="lp-section" aria-labelledby="caps-title">
			<div className="lp-wrap">
				<div className="lp-section-head" data-lp-reveal>
					<p className="lp-kicker">Kapabilitas</p>
					<h2 id="caps-title">Semua kebutuhan mata kuliah bahasa, terhubung.</h2>
				</div>
				<div className="lp-caps">
					{CAPS.map((c, i) => (
						<article
							className="lp-cap"
							key={c.title}
							data-lp-reveal
							style={{ '--d': `${i * 0.06}s` }}
						>
							<div className="lp-cap-icon">
								<c.icon size={22} />
							</div>
							<h3>{c.title}</h3>
							<p>{c.body}</p>
						</article>
					))}
				</div>
			</div>
		</section>
	);
}
