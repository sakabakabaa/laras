import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
	AlertTriangle,
	ArrowLeft,
	CheckCircle2,
	ChevronDown,
	FileImage,
	FileText,
	LoaderCircle,
	Plus,
	Search,
	Trash2,
	Upload,
	X,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import type { Assignment } from '@/lib/assignments';
import {
	matchStudent,
	newRowId,
	parseTextEntries,
	type PaperEntry,
	type RosterStudent,
} from '@/lib/bulk-paper';
import { convertHeicToJpeg, isHeic } from '@/lib/heic';
import { AppModal } from '@/components/app/app-modal';

type Step = 'input' | 'review' | 'confirm' | 'done';

type SubmitOutcome = {
	id: string;
	ok: boolean;
	reason?: string;
	studentName?: string;
};

const authHeaders = (): Record<string, string> =>
	pb.authStore.token ? { Authorization: `Bearer ${pb.authStore.token}` } : {};

/**
 * Searchable roster lookup attached to a single text field (NIM or Nama).
 * Typing filters the enrolled roster by NIM, name, or email; selecting a
 * suggestion fills both NIM and Nama on the entry via `onSelect`. Manual
 * typing still flows through `onChange` so the lecturer can edit freely.
 */
function RosterLookup({
	label,
	value,
	placeholder,
	roster,
	onChange,
	onSelect,
}: {
	label: string;
	value: string;
	placeholder: string;
	roster: RosterStudent[];
	onChange: (v: string) => void;
	onSelect: (student: RosterStudent) => void;
}) {
	const [open, setOpen] = useState(false);
	const [highlight, setHighlight] = useState(0);
	const wrapRef = useRef<HTMLDivElement>(null);
	const popRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const [box, setBox] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);

	const place = () => {
		const el = inputRef.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		const spaceBelow = window.innerHeight - r.bottom - 16;
		const maxH = Math.max(140, Math.min(280, spaceBelow));
		setBox({ top: r.bottom + 6, left: r.left, width: Math.max(r.width, 260), maxH });
	};

	useEffect(() => {
		if (!open) return;
		place();
		const onMove = () => place();
		window.addEventListener('resize', onMove);
		window.addEventListener('scroll', onMove, true);
		return () => {
			window.removeEventListener('resize', onMove);
			window.removeEventListener('scroll', onMove, true);
		};
	}, [open, value]);

	useEffect(() => {
		const onDown = (e: MouseEvent) => {
			const target = e.target as Node;
			if (wrapRef.current?.contains(target) || popRef.current?.contains(target)) return;
			setOpen(false);
		};
		document.addEventListener('mousedown', onDown);
		return () => document.removeEventListener('mousedown', onDown);
	}, []);

	const query = value.trim().toLowerCase();
	const filtered = useMemo(() => {
		if (!query) return roster;
		return roster.filter(
			(r) =>
				r.nim.toLowerCase().includes(query) ||
				r.name.toLowerCase().includes(query) ||
				r.email.toLowerCase().includes(query),
		);
	}, [query, roster]);
	const noMatch = Boolean(query) && filtered.length === 0;
	const suggestions = (noMatch ? roster : filtered).slice(0, 8);

	useEffect(() => {
		setHighlight(0);
	}, [open, query, noMatch]);

	const choose = (student: RosterStudent) => {
		onSelect(student);
		setOpen(false);
	};

	const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'ArrowDown' && !open) {
			e.preventDefault();
			setOpen(true);
			return;
		}
		if (!open || suggestions.length === 0) {
			if (e.key === 'Escape') setOpen(false);
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setHighlight((h) => (h + 1) % suggestions.length);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
		} else if (e.key === 'Enter' && open) {
			e.preventDefault();
			choose(suggestions[highlight]);
		} else if (e.key === 'Escape') {
			setOpen(false);
		}
	};

	const listId = `bpi-lookup-list-${label.replace(/\s+/g, '-')}`;

	return (
		<label className="bpi-lookup">
			<span className="bpi-lookup-label">
				{label}
				<em>cari mahasiswa</em>
			</span>
			<div className="bpi-lookup-wrap" ref={wrapRef}>
				<Search size={14} className="bpi-lookup-icon" aria-hidden />
				<input
					ref={inputRef}
					value={value}
					onChange={(e) => {
						onChange(e.target.value);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					onClick={() => setOpen(true)}
					onKeyDown={onKeyDown}
					placeholder={placeholder}
					aria-label={label}
					aria-expanded={open}
					aria-autocomplete="list"
					aria-controls={listId}
				/>
				<button
					type="button"
					className="bpi-lookup-toggle"
					aria-label={`Buka daftar ${label}`}
					aria-expanded={open}
					onMouseDown={(e) => {
						e.preventDefault();
						setOpen((v) => !v);
						inputRef.current?.focus();
					}}
				>
					<ChevronDown size={15} />
				</button>
				{open &&
					box &&
					typeof document !== 'undefined' &&
					createPortal(
						<div
							ref={popRef}
							id={listId}
							className="bpi-lookup-pop"
							role="listbox"
							style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxH }}
						>
							<p className="bpi-lookup-hint">
								{noMatch
									? `Tidak ada yang cocok dengan “${value.trim()}”. Pilih dari daftar:`
									: roster.length === 0
										? 'Belum ada mahasiswa terdaftar.'
										: 'Pilih mahasiswa — NIM dan nama terisi bersamaan.'}
							</p>
							{suggestions.length > 0 && (
								<ul>
									{suggestions.map((s, i) => (
										<li key={s.id} role="option" aria-selected={i === highlight}>
											<button
												type="button"
												className={i === highlight ? 'active' : ''}
												onMouseDown={(e) => {
													e.preventDefault();
													choose(s);
												}}
												onMouseEnter={() => setHighlight(i)}
											>
												<span className="bpi-lookup-nim">{s.nim || '—'}</span>
												<span className="bpi-lookup-name">{s.name || s.email || 'Tanpa nama'}</span>
											</button>
										</li>
									))}
								</ul>
							)}
						</div>,
						document.body,
					)}
			</div>
		</label>
	);
}

/**
 * Lecturer bulk paper-answer input. Lecturers paste transcribed answers or
 * upload scans of paper answer sheets; the system extracts NIM/name/answer,
 * matches each entry to an enrolled student, and — only after explicit
 * confirmation — submits them as final student answers through the normal
 * `assignment_submissions` path. Nothing is submitted during extraction or
 * review.
 */
export function BulkPaperInput({
	assignment,
	onClose,
	onSubmitted,
}: {
	assignment: Assignment;
	onClose: () => void;
	onSubmitted: () => void;
}) {
	const [step, setStep] = useState<Step>('input');
	const [method, setMethod] = useState<'text' | 'image'>('text');
	const [roster, setRoster] = useState<RosterStudent[]>([]);
	const [rosterLoading, setRosterLoading] = useState(true);
	const [rosterError, setRosterError] = useState('');
	const [paste, setPaste] = useState('');
	const [entries, setEntries] = useState<PaperEntry[]>([]);
	const [images, setImages] = useState<File[]>([]);
	const [extracting, setExtracting] = useState(false);
	const [converting, setConverting] = useState(false);
	const [extractProgress, setExtractProgress] = useState({ done: 0, total: 0 });
	const [error, setError] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [results, setResults] = useState<SubmitOutcome[]>([]);
	const fileRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		let alive = true;
		setRosterLoading(true);
		fetch('/api/bulk-paper-prepare', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeaders() },
			body: JSON.stringify({ assignmentId: assignment.id }),
		})
			.then(async (res) => {
				const body = (await res.json()) as { roster?: RosterStudent[]; error?: string };
				if (!alive) return;
				if (!res.ok || !body.roster) {
					setRosterError(body.error || 'Gagal memuat daftar mahasiswa terdaftar.');
					return;
				}
				setRoster(body.roster);
			})
			.catch(() => {
				if (alive) setRosterError('Gagal memuat daftar mahasiswa terdaftar.');
			})
			.finally(() => {
				if (alive) setRosterLoading(false);
			});
		return () => {
			alive = false;
		};
	}, [assignment.id]);

	const parseText = () => {
		setError('');
		const parsed = parseTextEntries(paste);
		if (parsed.length === 0) {
			setError(
				'Tidak ada entri terdeteksi. Pisahkan tiap mahasiswa dengan baris "---" dan gunakan label NIM:, Nama:, Jawaban:.',
			);
			return;
		}
		setEntries(parsed);
		setStep('review');
	};

	const onPickImages = async (files: FileList | null) => {
		if (!files) return;
		const all = Array.from(files);
		const standard = all.filter(
			(f) =>
				!isHeic(f) &&
				(f.type === 'image/jpeg' || f.type === 'image/png' || f.type === 'image/webp'),
		);
		const heic = all.filter(isHeic);
		if (heic.length === 0) {
			setImages((prev) => [...prev, ...standard]);
			return;
		}
		setConverting(true);
		const converted: File[] = [];
		for (const f of heic) {
			try {
				converted.push(await convertHeicToJpeg(f));
			} catch {
				// Skip files that fail to convert — they cannot be read by the model.
			}
		}
		setImages((prev) => [...prev, ...standard, ...converted]);
		setConverting(false);
	};

	const extractImages = async () => {
		if (images.length === 0) return;
		setExtracting(true);
		setError('');
		setExtractProgress({ done: 0, total: images.length });
		const collected: PaperEntry[] = [];
		for (let i = 0; i < images.length; i += 1) {
			const file = images[i];
			try {
				const fd = new FormData();
				fd.append('assignmentId', assignment.id);
				fd.append('image', file);
				const res = await fetch('/api/bulk-paper-extract', {
					method: 'POST',
					headers: authHeaders(),
					body: fd,
				});
				const body = (await res.json()) as { entries?: PaperEntry[]; error?: string };
				if (!res.ok) {
					setError(body.error || `Gagal mengekstrak gambar ${i + 1}.`);
					break;
				}
				collected.push(...(body.entries || []));
			} catch {
				setError(`Gagal mengekstrak gambar ${i + 1}.`);
				break;
			}
			setExtractProgress({ done: i + 1, total: images.length });
		}
		setExtracting(false);
		if (collected.length === 0) {
			setError((prev) => prev || 'Tidak ada entri yang berhasil diekstrak dari gambar.');
			return;
		}
		setEntries(collected);
		setStep('review');
	};

	const updateEntry = (id: string, patch: Partial<PaperEntry>) => {
		setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
	};
	const removeEntry = (id: string) => {
		setEntries((prev) => prev.filter((e) => e.id !== id));
	};
	const addEntry = () => {
		setEntries((prev) => [
			...prev,
			{ id: newRowId('pe'), nim: '', name: '', answer: '' },
		]);
	};

	const matches = useMemo(
		() => entries.map((e) => matchStudent(e, roster)),
		[entries, roster],
	);
	const matchedCount = matches.filter((m) => m.status === 'matched').length;
	const unmatchedCount = matches.filter((m) => m.status === 'unmatched').length;
	const ambiguousCount = matches.filter((m) => m.status === 'ambiguous').length;

	const submit = async () => {
		setSubmitting(true);
		setError('');
		try {
			const res = await fetch('/api/bulk-paper-submit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...authHeaders() },
				body: JSON.stringify({ assignmentId: assignment.id, entries }),
			});
			const body = (await res.json()) as { results?: SubmitOutcome[]; error?: string };
			if (!res.ok) {
				setError(body.error || 'Gagal mengumpulkan jawaban.');
				setSubmitting(false);
				return;
			}
			setResults(body.results || []);
			setStep('done');
		} catch {
			setError('Gagal mengumpulkan jawaban.');
		} finally {
			setSubmitting(false);
		}
	};

	const close = () => {
		if (step === 'done') onSubmitted();
		onClose();
	};

	const submittedCount = results.filter((r) => r.ok).length;
	const skippedCount = results.filter((r) => !r.ok).length;

	return (
		<AppModal open onClose={() => { if (!submitting && step !== 'done') onClose(); }} title="Input jawaban kertas" className="bpi-modal">
			<header className="modal-top bpi-top">
					<span>INPUT KERTAS · {assignment.title}</span>
					<button
						type="button"
						className="asg-dialog-close"
						aria-label="Tutup"
						onClick={close}
						disabled={submitting}
					>
						<X size={20} />
					</button>
				</header>
				<h2 id="bpi-title" className="bpi-title">
					Input jawaban kertas
				</h2>
				<p className="bpi-lead">
					Masukkan jawaban mahasiswa dari kertas — tempel teks atau unggah foto lembar jawaban.
					Sistem memetakan NIM/nama ke mahasiswa terdaftar; Anda meninjau dan mengonfirmasi
					sebelum dikumpulkan sebagai jawaban final.
				</p>

				{rosterError && (
					<p className="form-error" role="alert">
						{rosterError}
					</p>
				)}
				{rosterLoading && (
					<p className="bpi-muted">
						<LoaderCircle size={13} className="spin" /> Memuat daftar mahasiswa terdaftar...
					</p>
				)}
				{!rosterLoading && !rosterError && (
					<p className="bpi-muted">
						{roster.length} mahasiswa terdaftar pada mata kuliah ini siap dipetakan.
					</p>
				)}

				{step === 'input' && (
					<div className="bpi-input">
						<div className="bpi-tabs" role="tablist">
							<button
								type="button"
								role="tab"
								aria-selected={method === 'text'}
								className={method === 'text' ? 'active' : ''}
								onClick={() => {
									setMethod('text');
									setError('');
								}}
							>
								<FileText size={15} /> Tempel teks
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={method === 'image'}
								className={method === 'image' ? 'active' : ''}
								onClick={() => {
									setMethod('image');
									setError('');
								}}
							>
								<FileImage size={15} /> Unggah gambar
							</button>
						</div>

						{method === 'text' ? (
							<div className="bpi-tab-body">
								<p className="bpi-help">
									Pisahkan tiap mahasiswa dengan baris <code>---</code>. Gunakan label{' '}
									<code>NIM:</code>, <code>Nama:</code>, dan <code>Jawaban:</code>. Contoh:
								</p>
								<pre className="bpi-sample">{`NIM: 1234567890
Nama: Budi Santoso
Jawaban: Jawaban saya adalah...
---
NIM: 0987654321
Nama: Siti Aminah
Jawaban: Menurut saya...`}</pre>
								<textarea
									rows={8}
									value={paste}
									onChange={(e) => setPaste(e.target.value)}
									placeholder="Tempel teks jawaban di sini..."
									aria-label="Teks jawaban kertas"
								/>
								<div className="bpi-actions">
									<button
										type="button"
										className="ld-btn-primary"
										onClick={parseText}
										disabled={!paste.trim()}
									>
						Petakan entri
									</button>
								</div>
							</div>
						) : (
							<div className="bpi-tab-body">
								<p className="bpi-help">
									Unggah foto lembar jawaban (JPEG/PNG/WebP/HEIC, maks 20MB). Sistem mengekstrak
									NIM, nama, dan jawaban dari tiap gambar. Satu gambar biasanya satu mahasiswa. File HEIC dikonversi otomatis ke JPEG.
								</p>
								<input
									ref={fileRef}
									type="file"
									accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
									multiple
									className="pdf-file-input"
									onChange={(e) => {
										onPickImages(e.target.files);
										e.target.value = '';
									}}
								/>
								<button
									type="button"
									className="ld-outline-action sm"
									onClick={() => fileRef.current?.click()}
								>
									<Upload size={14} /> Pilih gambar
								</button>
								{images.length > 0 && (
									<ul className="bpi-image-list">
										{images.map((f, i) => (
											<li key={`${f.name}-${i}`}>
												<FileImage size={13} />
												<span>{f.name}</span>
												<button
													type="button"
													className="ld-text-btn"
													onClick={() =>
														setImages((prev) => prev.filter((_, idx) => idx !== i))
													}
													aria-label={`Hapus ${f.name}`}
												>
													<X size={13} />
												</button>
											</li>
										))}
									</ul>
								)}
								{converting && (
									<p className="bpi-muted">
										<LoaderCircle size={13} className="spin" /> Mengonversi foto HEIC ke JPEG...
									</p>
								)}
								{extracting && (
									<p className="bpi-muted">
										<LoaderCircle size={13} className="spin" /> Mengekstrak{' '}
										{extractProgress.done}/{extractProgress.total}...
									</p>
								)}
								<div className="bpi-actions">
									<button
										type="button"
										className="ld-btn-primary"
										onClick={() => void extractImages()}
										disabled={converting || extracting || images.length === 0}
									>
										{extracting ? (
											<LoaderCircle size={15} className="spin" />
										) : (
											<FileImage size={15} />
										)}
										Ekstrak entri
									</button>
								</div>
							</div>
						)}

						{error && (
							<p className="form-error" role="alert">
								{error}
							</p>
						)}
					</div>
				)}

				{step === 'review' && (
					<div className="bpi-review">
						<div className="bpi-review-head">
							<div className="bpi-counts">
								<span className="bpi-count ok">
									<CheckCircle2 size={13} /> {matchedCount} cocok
								</span>
								{ambiguousCount > 0 && (
									<span className="bpi-count warn">
										<AlertTriangle size={13} /> {ambiguousCount} ambigu
									</span>
								)}
								{unmatchedCount > 0 && (
									<span className="bpi-count bad">{unmatchedCount} tidak cocok</span>
								)}
								<span className="bpi-count">{entries.length} entri</span>
							</div>
							<button type="button" className="ld-text-btn" onClick={addEntry}>
								<Plus size={14} /> Tambah entri
							</button>
						</div>

						<ul className="bpi-entries">
							{entries.map((entry, i) => {
								const match = matches[i];
								return (
									<li key={entry.id} className="bpi-entry">
										<div className="bpi-entry-head">
											<span className="bpi-entry-num">#{i + 1}</span>
											{match.status === 'matched' && match.student ? (
												<span className="bpi-match ok">
													<CheckCircle2 size={13} /> {match.student.name || match.student.email || match.student.nim}
												</span>
											) : match.status === 'ambiguous' ? (
												<span className="bpi-match warn">
													<AlertTriangle size={13} /> Cocok lebih dari satu mahasiswa — perjelas NIM/nama
												</span>
											) : (
												<span className="bpi-match bad">Tidak cocok dengan mahasiswa terdaftar</span>
											)}
											<button
												type="button"
												className="ld-text-btn"
												onClick={() => removeEntry(entry.id)}
												aria-label={`Hapus entri ${i + 1}`}
											>
												<Trash2 size={14} />
											</button>
										</div>
										<div className="bpi-pair">
											<RosterLookup
												label="NIM"
												value={entry.nim}
												placeholder="Cari / ketik NIM"
												roster={roster}
												onChange={(v) => updateEntry(entry.id, { nim: v })}
												onSelect={(s) =>
													updateEntry(entry.id, { nim: s.nim, name: s.name })
												}
											/>
											<RosterLookup
												label="Nama"
												value={entry.name}
												placeholder="Cari / ketik nama"
												roster={roster}
												onChange={(v) => updateEntry(entry.id, { name: v })}
												onSelect={(s) =>
													updateEntry(entry.id, { nim: s.nim, name: s.name })
												}
											/>
										</div>
										<label className="bpi-answer">
											Jawaban
											<textarea
												rows={3}
												value={entry.answer}
												onChange={(e) => updateEntry(entry.id, { answer: e.target.value })}
												placeholder="Jawaban mahasiswa..."
											/>
										</label>
										{entry.imageId && (
											<span className="bpi-source">Sumber: foto lembar jawaban</span>
										)}
									</li>
								);
							})}
						</ul>


						{error && (
							<p className="form-error" role="alert">
								{error}
							</p>
						)}

						<div className="modal-actions bpi-foot">
							<button type="button" className="button-quiet" onClick={() => setStep('input')}>
								<ArrowLeft size={14} /> Kembali
							</button>
							<button
								type="button"
								className="ld-btn-primary"
								onClick={() => setStep('confirm')}
								disabled={entries.length === 0}
							>
								Lanjutkan ke konfirmasi
							</button>
						</div>
					</div>
				)}

				{step === 'confirm' && (
					<div className="bpi-confirm">
						<div className="bpi-confirm-card">
							<AlertTriangle size={18} />
							<div>
								<strong>Kumpulkan sebagai jawaban final?</strong>
								<p>
									{matchedCount} dari {entries.length} entri akan dikumpulkan sebagai jawaban
									final atas nama mahasiswa yang cocok. {unmatchedCount + ambiguousCount > 0
										? `${unmatchedCount + ambiguousCount} entri tidak cocok dan akan dilewati — perbaiki di langkah tinjau jika ingin menyertakannya.`
										: 'Semua entri cocok dengan mahasiswa terdaftar.'}
									{' '}Kiriman yang sudah ada akan diperbarui; nilai tetap diisi dosen melalui alur penilaian biasa.
								</p>
							</div>
						</div>
						{error && (
							<p className="form-error" role="alert">
								{error}
							</p>
						)}
						<div className="modal-actions bpi-foot">
							<button
								type="button"
								className="button-quiet"
								onClick={() => setStep('review')}
								disabled={submitting}
							>
								<ArrowLeft size={14} /> Kembali
							</button>
							<button
								type="button"
								className="ld-btn-primary"
								onClick={() => void submit()}
								disabled={submitting || matchedCount === 0}
							>
								{submitting ? (
									<LoaderCircle size={15} className="spin" />
								) : (
									<CheckCircle2 size={15} />
								)}
								Kirim {matchedCount} jawaban final
							</button>
						</div>
					</div>
				)}

				{step === 'done' && (
					<div className="bpi-done">
						<div className="bpi-done-summary">
							<span className="bpi-count ok">
								<CheckCircle2 size={14} /> {submittedCount} terkumpul
							</span>
							{skippedCount > 0 && (
								<span className="bpi-count bad">{skippedCount} dilewati</span>
							)}
						</div>
						{skippedCount > 0 && (
							<ul className="bpi-results">
								{results
									.filter((r) => !r.ok)
									.map((r) => {
										const entry = entries.find((e) => e.id === r.id);
										return (
											<li key={r.id}>
												<strong>{entry?.name || entry?.nim || 'Entri'}</strong>
												<span>{r.reason}</span>
											</li>
										);
									})}
							</ul>
						)}
						<p className="bpi-muted">
							Kiriman muncul di daftar peserta penilaian seperti jawaban mahasiswa lainnya.
						</p>
						<div className="modal-actions bpi-foot">
							<button type="button" className="ld-btn-primary" onClick={close}>
								Selesai
							</button>
						</div>
					</div>
				)}
		</AppModal>
	);
}
