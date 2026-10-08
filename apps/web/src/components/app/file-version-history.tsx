import { useEffect, useState } from 'react';
import { Download, Eye, History, LoaderCircle, RotateCcw, X } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { dateLabel, errorMessage } from '@/lib/learning';
import type { FileLibraryRecord, FileVersionRecord } from '@/lib/learning';
import {
	EXTRACTION_STATUS_LABELS,
	formatBytes,
	restoreFileVersion,
	type ProcessingState,
} from '@/lib/file-library';
import { LANGUAGE_LABELS, type DetectedLanguage } from '@/lib/file-metadata';
import { confirmDialog } from '@/components/confirm-dialog';
import { AppModal } from '@/components/app/app-modal';

/**
 * Phase 3 — lecturer-only version history for one managed library file.
 * Lists every immutable prior-version snapshot (original binary + extraction
 * metadata tied to that exact version), lets the owner preview/download a
 * prior original, and offers an explicit "restore" action. Restoring never
 * deletes anything: the current active version is preserved to history
 * first. Reads go through the `file_versions` owner-only rules, so students
 * and public participants can never reach this data; the snapshot binaries
 * are protected files served only with a short-lived token.
 */
export function FileVersionHistory({
	record,
	onClose,
	onRestored,
}: {
	record: FileLibraryRecord;
	onClose: () => void;
	onRestored: () => void;
}) {
	const [versions, setVersions] = useState<FileVersionRecord[] | null>(null);
	const [token, setToken] = useState('');
	const [error, setError] = useState('');
	const [busyId, setBusyId] = useState('');

	useEffect(() => {
		let alive = true;
		pb.collection('file_versions')
			.getFullList<FileVersionRecord>({
				filter: `file = "${record.id}"`,
				sort: '-version',
			})
			.then((rows) => {
				if (alive) setVersions(rows);
			})
			.catch((err) => {
				if (alive) setError(errorMessage(err));
			});
		// Protected snapshot binaries are only served with a short-lived file
		// token, issued to the signed-in owner.
		pb.files
			.getToken()
			.then((value) => {
				if (alive) setToken(value);
			})
			.catch(() => {
				// Preview/download links simply stay hidden without a token.
			});
		return () => {
			alive = false;
		};
	}, [record.id]);

	const restore = async (row: FileVersionRecord) => {
		if (
			!(await confirmDialog({
				title: 'Pulihkan versi',
				message: `Pulihkan versi ${row.version}? Versi saat ini disimpan ke riwayat — tidak ada data yang dihapus.`,
				variant: 'default',
				confirmLabel: 'Pulihkan',
			}))
		)
			return;
		setBusyId(row.id);
		setError('');
		try {
			await restoreFileVersion(record.id, row.id);
			// The parent reloads the library and closes this dialog; the list
			// then shows the new active version and its traceability chips.
			onRestored();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusyId('');
		}
	};

	const activeVersion = record.version || 1;

	return (
		<AppModal open onClose={onClose} title="Riwayat versi">
			<div className="modal-top">
					<span>MANAJEMEN BERKAS / RIWAYAT VERSI</span>
					<button type="button" aria-label="Tutup" onClick={onClose}>
						<X size={16} />
					</button>
				</div>
				<h2 id="fvh-dialog-title">Riwayat versi</h2>
				<p className="fvh-active">
					<History size={15} strokeWidth={1.75} aria-hidden />
					<strong>{record.title}</strong>
					<span className="flb-chip">Versi aktif: {activeVersion}</span>
					{record.restoredFrom ? (
						<span className="flb-chip">Dipulihkan dari versi {record.restoredFrom}</span>
					) : null}
				</p>

				{error ? (
					<div className="form-error" role="alert">
						{error}
					</div>
				) : null}

				{versions === null ? (
					<div className="ld-loading">
						<LoaderCircle size={24} className="spin" /> Memuat riwayat versi...
					</div>
				) : versions.length === 0 ? (
					<p className="fvh-empty">
						Belum ada versi sebelumnya. Versi lama muncul di sini secara otomatis setelah Anda
						mengganti berkas — versi lama beserta metadata penguraiannya tersimpan utuh dan
						tidak berubah.
					</p>
				) : (
					<ul className="fvh-list">
						{versions.map((row) => {
							const url =
								row.fileData && token
									? pb.files.getURL(row, row.fileData, { token })
									: '';
							return (
								<li key={row.id} className="fvh-row">
									<div className="fvh-head">
										<span className="fvh-version">Versi {row.version}</span>
										<span className={`flb-badge proc-${row.status}`}>
											{EXTRACTION_STATUS_LABELS[row.status as ProcessingState]}
										</span>
										<span className="flb-chip">Tersimpan {dateLabel(row.created)}</span>
									</div>
									<small className="fvh-filename">{row.filename || row.fileData}</small>
									<div className="fvh-meta">
										<span className="flb-chip">{formatBytes(row.size)}</span>
										{row.language ? (
											<span className="flb-chip">
												Bahasa {LANGUAGE_LABELS[row.language as DetectedLanguage] ?? row.language}
											</span>
										) : null}
										{row.pages ? <span className="flb-chip">{row.pages} halaman</span> : null}
										{row.chars ? (
											<span className="flb-chip">
												{row.chars.toLocaleString('id-ID')} karakter teks
											</span>
										) : null}
										{row.extractedAt ? (
											<span className="flb-chip">Diurai {dateLabel(row.extractedAt)}</span>
										) : null}
										{row.parserVersion ? (
											<span className="flb-chip">Parser {row.parserVersion}</span>
										) : null}
									</div>
									{row.failureReason ? (
										<p
											className={`flb-extract-note${row.status === 'failed' ? ' failed' : ''}`}
										>
											{row.failureReason}
										</p>
									) : null}
									<div className="fvh-actions">
										{url ? (
											<>
												<a
													className="ld-icon-action"
													href={url}
													target="_blank"
													rel="noreferrer"
													aria-label={`Pratinjau versi ${row.version}`}
													title="Pratinjau berkas versi ini"
												>
													<Eye size={16} strokeWidth={1.75} />
												</a>
												<a
													className="ld-icon-action"
													href={url}
													download
													aria-label={`Unduh versi ${row.version}`}
													title="Unduh berkas versi ini"
												>
													<Download size={16} strokeWidth={1.75} />
												</a>
											</>
										) : null}
										<button
											type="button"
											className="ld-text-btn"
											onClick={() => void restore(row)}
											disabled={busyId === row.id}
										>
											{busyId === row.id ? (
												<LoaderCircle size={15} className="spin" />
											) : (
												<RotateCcw size={15} strokeWidth={1.75} />
											)}
											Pulihkan versi ini
										</button>
									</div>
								</li>
							);
						})}
					</ul>
				)}

				<div className="modal-actions">
					<button type="button" className="ld-text-btn" onClick={onClose}>
						Tutup
					</button>
				</div>
		</AppModal>
	);
}
