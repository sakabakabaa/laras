/**
 * Phase 6 — lecturer/researcher-only Research Export UI.
 *
 * Lets the assignment owner (or an authorized researcher) pick one of their
 * formal assignments and export the lecturer-only `ai_feedback_items`
 * research records as CSV or JSON. A confirmation dialog states that the
 * export contains research data before the download begins. Students never
 * reach this page (the route's clientLoader redirects them), and the server
 * re-authorizes the caller on export.
 */
import { useEffect, useState } from 'react';
import {
	AlertTriangle,
	Download,
	FileJson,
	FileSpreadsheet,
	FlaskConical,
	LoaderCircle,
	ShieldCheck,
	X,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { useAuth } from '@/hooks/use-auth';
import { activityTypeOf, type Assignment } from '@/lib/assignments';
import { errorMessage } from '@/lib/learning';
import { AppModal } from '@/components/app/app-modal';

type Format = 'csv' | 'json';

function parseFilename(disposition: string | null, fallback: string): string {
	if (!disposition) return fallback;
	const match = /filename="?([^";]+)"?/i.exec(disposition);
	return match ? match[1] : fallback;
}

export function ResearchExport() {
	const { user } = useAuth();
	const [assignments, setAssignments] = useState<Assignment[]>([]);
	const [loading, setLoading] = useState(true);
	const [assignmentId, setAssignmentId] = useState('');
	const [format, setFormat] = useState<Format>('csv');
	const [confirming, setConfirming] = useState(false);
	const [exporting, setExporting] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');

	useEffect(() => {
		let alive = true;
		void (async () => {
			try {
				const rows = await pb.collection('assignments').getFullList<Assignment>({
					filter: `owner="${user?.id ?? ''}"`,
					sort: '-updated',
				});
				if (!alive) return;
				// Formal tasks only — formative practice has no research annotations.
				setAssignments(rows.filter((a) => activityTypeOf(a) !== 'formative'));
			} catch (err) {
				if (alive) setError(errorMessage(err));
			} finally {
				if (alive) setLoading(false);
			}
		})();
		return () => {
			alive = false;
		};
	}, [user?.id]);

	const selected = assignments.find((a) => a.id === assignmentId);

	const runExport = async () => {
		if (!assignmentId) {
			setError('Pilih tugas formal terlebih dahulu.');
			return;
		}
		setExporting(true);
		setError('');
		setNotice('');
		try {
			const res = await fetch('/api/research-export', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {}),
				},
				body: JSON.stringify({ assignmentId, format }),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
				throw new Error(body.error || body.message || 'Gagal mengekspor data riset.');
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = parseFilename(res.headers.get('Content-Disposition'), `laras-research.${format}`);
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			const items = res.headers.get('X-Research-Item-Count');
			const participants = res.headers.get('X-Research-Participant-Count');
			setNotice(
				`Ekspor ${format.toUpperCase()} berhasil.${items ? ` ${items} item` : ''}${
					participants ? ` · ${participants} peserta anonim` : ''
				}.`,
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Gagal mengekspor data riset.');
		} finally {
			setExporting(false);
			setConfirming(false);
		}
	};

	return (
		<div className="research-export">
			<div className="research-export-head">
				<span className="research-export-badge">
					<FlaskConical size={14} /> Riset
				</span>
				<h1>Ekspor data riset</h1>
				<p>
					Ekspor anotasi riset umpan balik AI (koleksi <code>ai_feedback_items</code>) untuk satu
					tugas formal, sebagai CSV (satu baris per item, untuk analisis statistik) atau JSON
					(rekaman lengkap dengan keluaran model mentah, provenans, dan metadata tugas).
				</p>
				<p className="research-export-private">
					<ShieldCheck size={14} /> Khusus dosen pemilik tugas atau peneliti yang diotorisasi.
					Peserta diidentifikasi hanya dengan ID pseudonim (P001, P002, …) — nama, email, NIM,
					dan pemetaan identitas tidak diekspor. Ekspor tidak mengubah nilai atau data akademik.
				</p>
			</div>

			{loading ? (
				<div className="ld-loading">
					<LoaderCircle size={18} className="spin" /> Memuat tugas…
				</div>
			) : assignments.length === 0 ? (
				<div className="research-export-empty">
					<FlaskConical size={28} />
					<h3>Belum ada tugas formal</h3>
					<p>Ekspor riset tersedia setelah Anda memiliki tugas formal dengan anotasi riset.</p>
				</div>
			) : (
				<div className="research-export-form">
					<label className="research-export-field">
						<span>Tugas formal</span>
						<select value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
							<option value="">— pilih tugas —</option>
							{assignments.map((a) => (
								<option key={a.id} value={a.id}>
									{a.title || '(tanpa judul)'}
								</option>
							))}
						</select>
					</label>

					<fieldset className="research-export-format">
						<legend>Format</legend>
						<label className={format === 'csv' ? 'active' : ''}>
							<input
								type="radio"
								name="format"
								value="csv"
								checked={format === 'csv'}
								onChange={() => setFormat('csv')}
							/>
							<FileSpreadsheet size={16} />
							<span>
								<strong>CSV</strong>
								<small>Satu baris per item — analisis statistik</small>
							</span>
						</label>
						<label className={format === 'json' ? 'active' : ''}>
							<input
								type="radio"
								name="format"
								value="json"
								checked={format === 'json'}
								onChange={() => setFormat('json')}
							/>
							<FileJson size={16} />
							<span>
								<strong>JSON</strong>
								<small>Rekaman lengkap + keluaran model mentah + provenans</small>
							</span>
						</label>
					</fieldset>

					{selected && (
						<div className="research-export-meta">
							<span>Format kerja: {selected.mode || '—'}</span>
							<span>Bentuk: {selected.shape || '—'}</span>
						</div>
					)}

					<div className="research-export-actions">
						<button
							type="button"
							className="ld-pill primary"
							disabled={!assignmentId || exporting}
							onClick={() => {
								setError('');
								setNotice('');
								setConfirming(true);
							}}
						>
							<Download size={16} /> Ekspor {format.toUpperCase()}
						</button>
					</div>
				</div>
			)}

			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
			{notice && (
				<p className="eval-saved" role="status">
					<ShieldCheck size={14} /> {notice}
				</p>
			)}

			{confirming && (
				<AppModal open onClose={() => !exporting && setConfirming(false)} title="Konfirmasi ekspor riset" className="research-confirm">
						<div className="modal-top">
							<span>
								<AlertTriangle size={13} /> Konfirmasi ekspor riset
							</span>
							<button
								type="button"
								onClick={() => !exporting && setConfirming(false)}
								aria-label="Tutup"
								disabled={exporting}
							>
								<X size={16} />
							</button>
						</div>
						<h2 id="research-confirm-title">Ekspor berisi data riset</h2>
						<p>
							Anda akan mengekspor data anotasi riset untuk tugas{' '}
							<strong>{selected?.title || 'ini'}</strong> dalam format{' '}
							<strong>{format.toUpperCase()}</strong>. File ini berisi data riset yang
							memuat ID peserta pseudonim (P001, P002, …), temuan AI, anotasi ahli, dan
							provenans generasi AI. Data ini tidak memuat nama, email, atau NIM
							mahasiswa. Tanggung jawabkan penyimpanan dan penggunaan sesuai etika riset
							dan perlindungan data peserta.
						</p>
						<p className="research-confirm-note">
							Ekspor bersifat hanya-baca dan tidak mengubah nilai, umpan balik, atau
							status tugas apa pun.
						</p>
						<div className="modal-actions">
							<button
								type="button"
								className="button-quiet"
								disabled={exporting}
								onClick={() => setConfirming(false)}
							>
								Batal
							</button>
							<button
								type="button"
								className="ld-pill primary"
								disabled={exporting}
								onClick={() => void runExport()}
							>
								{exporting ? (
									<>
										<LoaderCircle size={16} className="spin" /> Mengekspor…
									</>
								) : (
									<>
										<Download size={16} /> Unduh {format.toUpperCase()}
									</>
								)}
							</button>
						</div>
				</AppModal>
			)}
		</div>
	);
}
