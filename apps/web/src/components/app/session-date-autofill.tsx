import { useEffect, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, CalendarClock, Check, LoaderCircle, Wand2, X } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import type { ClassSession, Course } from '@/lib/learning';
import { dateLabel, errorMessage } from '@/lib/learning';
import { AppModal } from '@/components/app/app-modal';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
	generateSchedule,
	inferFirstSessionDate,
	parseDateOnly,
	toDateOnly,
	toPocketBaseDate,
	type ScheduledSession,
} from '@/lib/session-dates';

/**
 * Penjadwal tanggal pertemuan otomatis. Mengisi tanggal sesi mingguan
 * berdasarkan tanggal pertemuan pertama, melompati bentrok kalender akademik,
 * dan menampilkan pratinjau sebelum diterapkan.
 */
export function SessionDateAutofill({
	course,
	sessions,
	onClose,
	onApplied,
}: {
	course: Course;
	sessions: ClassSession[];
	onClose: () => void;
	onApplied: () => void;
}) {
	const sorted = useMemo(
		() =>
			[...sessions].sort(
				(a, b) => (a.week || 0) - (b.week || 0) || a.id.localeCompare(b.id),
			),
		[sessions],
	);

	const defaultFirst = useMemo(() => {
		const firstWithDate = sorted.find((s) => toDateOnly(s.date));
		if (firstWithDate) return toDateOnly(firstWithDate.date);
		return inferFirstSessionDate(course);
	}, [sorted, course]);

	const [firstDate, setFirstDate] = useState(defaultFirst);
	const [preserveManual, setPreserveManual] = useState(
		sorted.some((s) => toDateOnly(s.date)),
	);
	const [busy, setBusy] = useState(false);
	const [datePickerOpen, setDatePickerOpen] = useState(false);
	const [error, setError] = useState('');
	const [done, setDone] = useState('');

	const result = useMemo(
		() =>
			generateSchedule(
				sorted.map((s) => ({
					id: s.id,
					week: s.week,
					title: s.title,
					date: s.date,
				})),
				firstDate,
				preserveManual,
			),
		[sorted, firstDate, preserveManual],
	);

	// Reset pesan status saat pengaturan berubah.
	useEffect(() => {
		setDone('');
		setError('');
	}, [firstDate, preserveManual]);

	const hasFirst = Boolean(parseDateOnly(firstDate));
	const changes = result.sessions.filter(
		(s: ScheduledSession) => s.newDate && s.newDate !== s.currentDate,
	);
	const canApply = hasFirst && changes.length > 0 && !busy;
	const selectedDate = (() => {
		if (!hasFirst) return undefined;
		const [year, month, day] = firstDate.split('-').map(Number);
		const date = new Date(year, month - 1, day);
		return Number.isNaN(date.getTime()) ? undefined : date;
	})();
	const dateDisplay = selectedDate?.toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});

	const apply = async () => {
		if (!hasFirst) {
			setError('Tentukan tanggal pertemuan pertama terlebih dahulu.');
			return;
		}
		setBusy(true);
		setError('');
		setDone('');
		try {
			await Promise.all(
				changes.map((s, i) =>
					pb.collection('class_sessions').update(
						s.id,
						{ date: toPocketBaseDate(s.newDate) },
						{ requestKey: `sess-date-${i}` },
					),
				),
			);
			invalidate('class_sessions');
			setDone(
				`${changes.length} tanggal pertemuan diperbarui. Kalender akademik akan menyinkronkan otomatis.`,
			);
			onApplied();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<AppModal open onClose={onClose} title="Atur tanggal pertemuan." className="form-modal-wide">
			<div className="modal-top">
					<span>
						<CalendarClock size={14} /> JADWAL OTOMATIS
					</span>
					<button type="button" aria-label="Tutup" onClick={onClose}>
						<X size={21} />
					</button>
				</div>
				<h2 id="autofill-title">Atur tanggal pertemuan.</h2>
				<p>
					Isi tanggal pertemuan pertama, dan LARAS akan menjadwalkan sesi
					berikutnya setiap minggu — melompati libur nasional, cuti bersama, dan
					peristiwa akademik UPI. Tinjau hasilnya sebelum menyimpan.
				</p>

				<div className="autofill-controls">
					<label className="autofill-first">
						TANGGAL PERTEMUAN PERTAMA <span>*</span>
						<Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
							<PopoverTrigger asChild>
								<button
									type="button"
									className="dtp-trigger autofill-date-trigger"
									aria-label="Pilih tanggal pertemuan pertama"
									aria-expanded={datePickerOpen}
								>
									<span className={dateDisplay ? '' : 'dtp-placeholder'}>
										{dateDisplay || 'Pilih tanggal'}
									</span>
									<CalendarIcon size={16} />
								</button>
							</PopoverTrigger>
							<PopoverContent align="start" className="dtp-popover autofill-date-popover">
								<Calendar
									mode="single"
									selected={selectedDate}
									onSelect={(next) => {
										if (!next) return;
										const year = next.getFullYear();
										const month = String(next.getMonth() + 1).padStart(2, '0');
										const day = String(next.getDate()).padStart(2, '0');
										const value = `${year}-${month}-${day}`;
										setFirstDate(value);
										// A changed anchor date should recalculate the schedule; users
										// can turn preservation back on if they need to keep manual dates.
										if (value !== firstDate && preserveManual) setPreserveManual(false);
										setDatePickerOpen(false);
									}}
									initialFocus
								/>
							</PopoverContent>
						</Popover>
						{preserveManual && sorted.some((session) => toDateOnly(session.date)) && (
							<small className="autofill-hint">
								Tanggal yang sudah diisi manual tidak berubah. Mengubah tanggal awal akan menjadwalkan ulang sesi-sesi tersebut.
							</small>
						)}
						{!hasFirst && (
							<em className="autofill-hint">
								Tanggal awal belum dipilih. Pilih tanggal untuk membuat jadwal.
							</em>
						)}
						{hasFirst && (
							<small className="autofill-hint">
								{sorted.length} sesi akan dijadwalkan, dimulai{' '}
								{dateLabel(firstDate)}.
							</small>
						)}
					</label>
					<label className="autofill-preserve">
						<input
							type="checkbox"
							checked={preserveManual}
							onChange={(e) => setPreserveManual(e.target.checked)}
						/>
						<span>Pertahankan tanggal yang sudah diisi manual</span>
					</label>
				</div>

				{result.skipped > 0 && (
					<p className="autofill-note">
						<Wand2 size={14} /> {result.skipped} sesi digeser menghindari
						kalender akademik. Alasan tercantum pada baris bersangkutan.
					</p>
				)}
				{result.unscheduled > 0 && (
					<p className="form-error" role="alert">
						{result.unscheduled} sesi tidak dapat dijadwalkan karena tanggal
						awal belum ditentukan.
					</p>
				)}

				<div className="autofill-table-wrap">
					<table className="autofill-table">
						<thead>
							<tr>
								<th>Mgg</th>
								<th>Sesi</th>
								<th>Tanggal saat ini</th>
								<th>Tanggal baru</th>
								<th>Catatan</th>
							</tr>
						</thead>
						<tbody>
							{result.sessions.map((s) => {
								const changed = s.newDate && s.newDate !== s.currentDate;
								return (
									<tr key={s.id} className={changed ? 'autofill-changed' : ''}>
										<td>{s.week || '—'}</td>
										<td className="autofill-title-cell">{s.title || 'Tanpa judul'}</td>
										<td>
											{s.currentDate ? dateLabel(s.currentDate) : '—'}
										</td>
										<td>
											{s.newDate ? (
												<>
													{dateLabel(s.newDate)}
													{changed && <Check size={13} className="autofill-check" />}
												</>
											) : (
												<em>belum</em>
											)}
										</td>
										<td className="autofill-note-cell">
											{s.note || ''}
											{s.conflict ? ` (${s.conflict.title})` : ''}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>

				{error && (
					<p className="form-error" role="alert">
						{error}
					</p>
				)}
				{done && (
					<p className="autofill-done" role="status">
						<Check size={15} /> {done}
					</p>
				)}

				<div className="modal-actions">
					<button
						type="button"
						className="ld-btn-quiet"
						onClick={onClose}
						disabled={busy}
					>
						Tutup
					</button>
					<button
						type="button"
						className="ld-btn-primary"
						onClick={() => void apply()}
						disabled={!canApply}
					>
						{busy ? (
							<LoaderCircle className="spin" size={18} />
						) : (
							<>
								<Check size={16} /> Terapkan {changes.length} tanggal
							</>
						)}
					</button>
				</div>
		</AppModal>
	);
}
