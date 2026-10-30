import { useEffect, useState } from 'react';
import { BookOpen, Users, BarChart3, Check, FileText, Sparkles, Pause, Play } from 'lucide-react';
import type { Role } from '@/lib/learning';

const FEATURES = [
	{ title: 'Perkuliahan', icon: BookOpen },
	{ title: 'Kolaborasi', icon: Users },
	{ title: 'Progres', icon: BarChart3 },
];

export function LoginFeaturePreview({ role }: { role: Role }) {
	const [scene, setScene] = useState(0);
	const [paused, setPaused] = useState(false);
	const [reducedMotion, setReducedMotion] = useState(false);
	const [visible, setVisible] = useState(true);
	const faculty = role === 'faculty';
	useEffect(() => {
		const media = window.matchMedia('(prefers-reduced-motion: reduce)');
		const syncMotion = () => setReducedMotion(media.matches);
		const syncVisibility = () => setVisible(!document.hidden);
		syncMotion();
		syncVisibility();
		media.addEventListener('change', syncMotion);
		document.addEventListener('visibilitychange', syncVisibility);
		return () => {
			media.removeEventListener('change', syncMotion);
			document.removeEventListener('visibilitychange', syncVisibility);
		};
	}, []);
	useEffect(() => {
		if (paused || reducedMotion || !visible) return;
		const timer = window.setInterval(() => setScene(current => (current + 1) % FEATURES.length), 4800);
		return () => window.clearInterval(timer);
	}, [paused, reducedMotion, visible, scene]);

	const descriptions = faculty ? [
		'Susun materi dan penugasan dalam satu ruang kelas.',
		'Dampingi mahasiswa dengan diskusi dan umpan balik.',
		'Pantau aktivitas dan capaian pembelajaran kelas.',
	] : [
		'Temukan materi dan tugas untuk perjalanan belajarmu.',
		'Latih kemampuanmu dengan bantuan asisten AI.',
		'Ikuti perkembangan dan capaian belajarmu.',
	];

	return (
		<section className="login-feature-preview" aria-label="Fitur LARAS" data-paused={paused || reducedMotion || !visible}>
			<div className="login-feature-preview-top"><span>RUANG {faculty ? 'MENGAJAR' : 'BELAJAR'} ANDA</span>
				<button type="button" onClick={() => setPaused(value => !value)} disabled={reducedMotion} aria-label={paused ? 'Putar animasi fitur' : 'Jeda animasi fitur'}>{paused || reducedMotion ? <Play size={14} /> : <Pause size={14} />}</button>
			</div>
			<div className="login-feature-preview-stage" key={scene} aria-hidden="true">
				{scene === 0 && <div className="login-feature-preview-scene">
					<div className="login-feature-preview-course"><span className="login-feature-preview-icon"><BookOpen size={23} /></span><div><small>MATA KULIAH</small><strong>Bahasa Jerman A1</strong><span>Materi · Tugas · Diskusi</span></div></div>
					<div className="login-feature-preview-row login-feature-preview-step"><FileText size={17} /><span>{faculty ? 'Materi pertemuan siap dibagikan' : 'Materi pertemuan tersedia'}</span><Check size={16} /></div>
					<div className="login-feature-preview-row login-feature-preview-step-later"><Check size={17} /><span>{faculty ? 'Penugasan tersusun rapi' : 'Lanjutkan latihan mandiri'}</span><span className="login-feature-preview-pill">{faculty ? 'Siap' : 'Mulai'}</span></div>
				</div>}
				{scene === 1 && <div className="login-feature-preview-scene">
					<div className="login-feature-preview-chat"><span className="login-feature-preview-avatar">M</span><div><small>MAHASISWA</small><p>Ich lerne heute Deutsch.</p></div></div>
					<div className="login-feature-preview-feedback login-feature-preview-step"><Sparkles size={18} /><div><strong>{faculty ? 'Umpan balik pembelajaran' : 'Asisten Laras'}</strong><p>Bagus! Kalimatmu sudah tepat. Coba tambahkan keterangan tempat.</p></div></div>
					<div className="login-feature-preview-confirm login-feature-preview-step-later"><Check size={14} />{faculty ? 'Dampingi setiap langkah belajar' : 'Belajar dengan arahan yang jelas'}</div>
				</div>}
				{scene === 2 && <div className="login-feature-preview-scene">
					<div className="login-feature-preview-progress-head"><div><small>{faculty ? 'PROGRES KELAS' : 'PROGRES BELAJAR'}</small><strong>Langkah kecil, kemajuan nyata.</strong></div><span>75%</span></div>
					<div className="login-feature-preview-track"><span /></div>
					<div className="login-feature-preview-chart">{[28, 44, 38, 65, 78, 92].map((height, index) => <span key={index} style={{ height: `${height}%`, animationDelay: `${index * 100 + 200}ms` }} />)}<small>Aktivitas pembelajaran</small></div>
				</div>}
			</div>
			<p className="login-feature-preview-caption">{descriptions[scene]}</p>
			<div className="login-feature-preview-nav" aria-label="Pilih fitur">{FEATURES.map(({ title, icon: Icon }, index) => <button key={title} type="button" aria-pressed={scene === index} onClick={() => { setScene(index); setPaused(true); }}><Icon size={16} />{title}</button>)}</div>
		</section>
	);
}
