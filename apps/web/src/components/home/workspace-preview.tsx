import { useEffect, useRef, useState } from 'react';
import { FileText, FolderOpen, User } from 'lucide-react';

type Role = 's' | 'l' | 'a';

const TABS: { id: Role; label: string }[] = [
	{ id: 's', label: 'Mahasiswa' },
	{ id: 'l', label: 'Dosen' },
	{ id: 'a', label: 'AI' },
];

/**
 * Product preview with role tabs (Mahasiswa / Dosen / AI). The sliding pill
 * is positioned from measured tab widths so it stays accurate across labels.
 */
export function WorkspacePreview() {
	const [role, setRole] = useState<Role>('s');
	const tabsRef = useRef<HTMLDivElement>(null);
	const [pill, setPill] = useState({ left: 4, width: 0 });

	function select(id: Role) {
		setRole(id);
		positionPill(id);
	}

	function positionPill(id: Role) {
		const el = tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${id}"]`);
		if (el && tabsRef.current) {
			const parentRect = tabsRef.current.getBoundingClientRect();
			const rect = el.getBoundingClientRect();
			setPill({ left: rect.left - parentRect.left, width: rect.width });
		}
	}

	useEffect(() => {
		positionPill(role);
		const onResize = () => positionPill(role);
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<section className="lp-section lp-preview" id="platform" aria-labelledby="preview-title">
			<div className="lp-wrap">
				<div className="lp-preview-head">
					<div className="lp-section-head" data-lp-reveal>
						<p className="lp-kicker">Ruang kerja</p>
						<h2 id="preview-title">Satu ruang kerja untuk seluruh perjalanan belajar.</h2>
						<p>
							Mahasiswa, dosen, dan asisten AI bekerja dari mata kuliah, materi, dan
							tugas yang sama — tidak ada yang perlu disalin antar alat.
						</p>
					</div>
				</div>
				<div
					className="lp-role-tabs"
					role="tablist"
					aria-label="Pilih tampilan"
					data-lp-reveal
					ref={tabsRef}
					style={{ '--d': '.1s' }}
				>
					<span
						className="pill"
						aria-hidden="true"
						style={{ transform: `translateX(${pill.left}px)`, width: pill.width }}
					/>
					{TABS.map((t) => (
						<button
							key={t.id}
							data-tab={t.id}
							className="lp-role-tab"
							role="tab"
							aria-selected={role === t.id}
							tabIndex={role === t.id ? 0 : -1}
							onClick={() => select(t.id)}
						>
							{t.label}
						</button>
					))}
				</div>

				<div className="lp-workspace" data-lp-reveal="scale" style={{ '--d': '.15s' }}>
					{role === 's' && (
						<div className="lp-ws-view active" role="tabpanel">
							<div className="lp-ws-panel lp-span-7">
								<h3>
									Belajar hari ini <span className="lp-chip lp-chip-red">2 tugas</span>
								</h3>
								<div className="lp-list-row">
									<span className="lp-avatar" style={{ background: 'var(--lp-red)' }}>11</span>
									<div>
										Lembar kerja 11.3: Im Kaufhaus
										<div className="lp-muted lp-small">Menanyakan lokasi di toko serba ada</div>
									</div>
									<span className="lp-chip lp-chip-wait">Jatuh tempo Kam</span>
								</div>
								<div className="lp-list-row">
									<span className="lp-avatar" style={{ background: 'var(--lp-slate)' }}>11</span>
									<div>
										Menyimak 11.2: Kleidung kaufen
										<div className="lp-muted lp-small">Audio, 6 soal</div>
									</div>
									<span className="lp-chip lp-chip-ink">Jatuh tempo Jum</span>
								</div>
								<div className="lp-list-row">
									<span className="lp-avatar" style={{ background: '#7E838E' }}>10</span>
									<div>
										Tinjauan: artikel Akkusativ
										<div className="lp-muted lp-small">Disarankan dari umpan balik terakhir</div>
									</div>
									<span className="lp-chip lp-chip-ink">10 menit</span>
								</div>
							</div>
							<div className="lp-ws-panel lp-span-5">
								<h3>
									Progres <span className="lp-muted lp-small">Bahasa Jerman I</span>
								</h3>
								<div className="lp-big-num">68%</div>
								<p className="lp-muted lp-small" style={{ margin: '6px 0 16px' }}>
									Kapitel 9–12 selesai
								</p>
								<div className="lp-cls-row" style={{ gridTemplateColumns: '90px 1fr 36px', padding: '5px 0' }}>
									<span className="lp-small">Hören</span>
									<div className="lp-bar"><i style={{ '--w': '74%' }} /></div>
									<b className="lp-small">74</b>
								</div>
								<div className="lp-cls-row" style={{ gridTemplateColumns: '90px 1fr 36px', padding: '5px 0' }}>
									<span className="lp-small">Sprechen</span>
									<div className="lp-bar"><i style={{ '--w': '61%' }} /></div>
									<b className="lp-small">61</b>
								</div>
								<div className="lp-cls-row" style={{ gridTemplateColumns: '90px 1fr 36px', padding: '5px 0' }}>
									<span className="lp-small">Schreiben</span>
									<div className="lp-bar"><i style={{ '--w': '69%' }} /></div>
									<b className="lp-small">69</b>
								</div>
							</div>
							<div className="lp-ws-panel lp-span-12">
								<h3>
									Umpan balik terbaru <span className="lp-chip lp-chip-ok">Menulis 10.4: 86 / 100</span>
								</h3>
								<p className="lp-feedback-quote">
									Struktur dan kosakata baik. Dalam bahasa Jerman kata kerja menempati
									posisi kedua: tulis <b>Am Montag gehe ich</b>, bukan{' '}
									<b>Am Montag ich gehe</b>.{' '}
									<span className="lp-muted">Bu Dewi, dengan catatan draf AI</span>
								</p>
							</div>
						</div>
					)}

					{role === 'l' && (
						<div className="lp-ws-view active" role="tabpanel">
							<div className="lp-ws-panel lp-span-4">
								<h3>Mata kuliah aktif</h3>
								<div className="lp-big-num">4</div>
								<p className="lp-muted lp-small" style={{ marginTop: 6 }}>
									Bahasa Jerman I (A, B, C), Fonetik
								</p>
							</div>
							<div className="lp-ws-panel lp-span-4">
								<h3>Pengumpulan untuk dinilai</h3>
								<div className="lp-big-num">18</div>
								<p className="lp-muted lp-small" style={{ marginTop: 6 }}>
									12 sudah memiliki catatan draf AI
								</p>
							</div>
							<div className="lp-ws-panel lp-span-4">
								<h3>Tugas minggu ini</h3>
								<div className="lp-big-num">3</div>
								<p className="lp-muted lp-small" style={{ marginTop: 6 }}>
									1 dijadwalkan untuk Jumat
								</p>
							</div>
							<div className="lp-ws-panel lp-span-7">
								<h3>
									Pengumpulan mahasiswa <span className="lp-muted lp-small">Lembar kerja 11.3</span>
								</h3>
								<div className="lp-list-row">
									<span className="lp-avatar" style={{ background: '#4B505C' }}>AP</span>
									Adi Pratama
									<span className="lp-status wait">Perlu ditinjau</span>
								</div>
								<div className="lp-list-row">
									<span className="lp-avatar" style={{ background: 'var(--lp-red)' }}>RS</span>
									Rina Sari
									<span className="lp-status ok">Sudah ditinjau</span>
								</div>
								<div className="lp-list-row">
									<span className="lp-avatar" style={{ background: '#7E838E' }}>DK</span>
									Dimas Kurniawan
									<span className="lp-status wait">Perlu ditinjau</span>
								</div>
							</div>
							<div className="lp-ws-panel lp-span-5">
								<h3>Rekomendasi</h3>
								<p style={{ fontSize: 15, lineHeight: 1.55 }}>
									7 mahasiswa di Kelas B keliru <b>der / die / das</b> pada kata benda
									pakaian. Lembar kerja tinjauan 10 menit siap dikirim.
								</p>
							</div>
						</div>
					)}

					{role === 'a' && (
						<div className="lp-ws-view active" role="tabpanel">
							<div className="lp-ws-panel lp-span-6">
								<h3>Asisten</h3>
								<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
									<div className="lp-bubble me" style={{ alignSelf: 'flex-end' }}>
						Bagaimana saya bertanya di mana sepatunya?
									</div>
									<div className="lp-bubble ai">
						Coba <b>Entschuldigung, wo finde ich Schuhe?</b> Denah lantai pada lembar
						kerja menunjukkan sepatu di lantai 2, jadi jawabannya{' '}
										<i>im zweiten Stock</i>.
									</div>
								</div>
							</div>
							<div className="lp-ws-panel lp-span-6">
								<h3>Konteks yang dipakai</h3>
								<div className="lp-list-row">
									<FileText size={18} /> Halaman saat ini
									<span className="lp-chip lp-chip-ink">Lembar kerja 11.3, S4</span>
								</div>
								<div className="lp-list-row">
									<FolderOpen size={18} /> Materi
									<span className="lp-chip lp-chip-ink">Denah toko</span>
								</div>
								<div className="lp-list-row">
									<User size={18} /> Progres Anda
									<span className="lp-chip lp-chip-ink">Sprechen 61</span>
								</div>
							</div>
							<div className="lp-ws-panel lp-span-12">
								<h3>Rekomendasi</h3>
								<p style={{ fontSize: 15, lineHeight: 1.55 }}>
									Sebelum Kamis, berlatih bilangan tingkat untuk lantai (<i>erste, zweite,
									dritte</i>). Anda melewatkan dua di antaranya pada Menyimak 10.2.
								</p>
							</div>
						</div>
					)}
				</div>
			</div>
		</section>
	);
}
