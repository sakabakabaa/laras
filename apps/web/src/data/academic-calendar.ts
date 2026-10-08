/**
 * Kalender Akademik LARAS.
 *
 * Sumber resmi (lihat CALENDAR_SOURCES):
 *  - Hari libur nasional & cuti bersama 2026: SKB Tiga Menteri (Kemenko PMK /
 *    Kemenag / Kemnaker) No. 1497/2025, 2/2025, 5/2025 — diumumkan 19 Sep 2025.
 *  - Kalender Akademik UPI Tahun Akademik 2026/2027: Direktorat Pendidikan UPI
 *    dan laman resmi upi.edu/en/services/academic-calendar.
 *
 * Jangan menambahkan peristiwa atau tanggal tanpa rujukan resmi. Setiap entri
 * di sini diturunkan langsung dari salah satu sumber di atas.
 */

export type CalendarCategory = 'national' | 'collective' | 'upi' | 'courses';

export interface CalendarEvent {
	id: string;
	title: string;
	/** ISO YYYY-MM-DD (UTC). */
	start: string;
	/** Inclusive end date for multi-day events. */
	end?: string;
	category: CalendarCategory;
	note?: string;
	/** Internal link for course-sourced events (pertemuan). */
	href?: string;
}

export interface CalendarSource {
	id: string;
	name: string;
	url: string;
	description: string;
}

export const CATEGORY_META: Record<
	CalendarCategory,
	{ label: string; short: string; description: string }
> = {
	national: {
		label: 'Libur Nasional',
		short: 'Libur',
		description: 'Hari libur nasional resmi (SKB Tiga Menteri).',
	},
	collective: {
		label: 'Cuti Bersama',
		short: 'Cuti',
		description: 'Cuti bersama yang ditetapkan pemerintah.',
	},
	upi: {
		label: 'Akademik UPI',
		short: 'UPI',
		description: 'Tanggal akademik Universitas Pendidikan Indonesia.',
	},
	courses: {
		label: 'Pertemuan Mata Kuliah',
		short: 'Kelas',
		description: 'Jadwal pertemuan mata kuliah Anda yang memiliki tanggal.',
	},
};

/** Rentang kalender yang ditampilkan: Januari 2026 – Mei 2027 (TA 2026/2027). */
export const CALENDAR_RANGE = { startYear: 2026, startMonth: 0, endYear: 2027, endMonth: 4 };

export const CALENDAR_EVENTS: CalendarEvent[] = [
	// ── Libur nasional 2026 (SKB Tiga Menteri) ──────────────────────────
	{ id: 'n-2026-01-01', title: 'Tahun Baru Masehi', start: '2026-01-01', category: 'national' },
	{ id: 'n-2026-01-16', title: "Isra Mi'raj Nabi Muhammad SAW", start: '2026-01-16', category: 'national' },
	{ id: 'n-2026-02-17', title: 'Tahun Baru Imlek 2577 Kongzili', start: '2026-02-17', category: 'national' },
	{ id: 'n-2026-03-19', title: 'Hari Raya Nyepi (Tahun Baru Saka 1948)', start: '2026-03-19', category: 'national' },
	{ id: 'n-2026-03-21', title: 'Hari Raya Idul Fitri 1447 H (Hari ke-1)', start: '2026-03-21', category: 'national' },
	{ id: 'n-2026-03-22', title: 'Hari Raya Idul Fitri 1447 H (Hari ke-2)', start: '2026-03-22', category: 'national' },
	{ id: 'n-2026-04-03', title: 'Wafat Isa Almasih (Jumat Agung)', start: '2026-04-03', category: 'national' },
	{ id: 'n-2026-04-05', title: 'Hari Paskah', start: '2026-04-05', category: 'national' },
	{ id: 'n-2026-05-01', title: 'Hari Buruh Internasional', start: '2026-05-01', category: 'national' },
	{ id: 'n-2026-05-14', title: 'Kenaikan Isa Almasih', start: '2026-05-14', category: 'national' },
	{ id: 'n-2026-05-27', title: 'Hari Raya Idul Adha 1447 H', start: '2026-05-27', category: 'national' },
	{ id: 'n-2026-05-31', title: 'Hari Raya Waisak 2570 BE', start: '2026-05-31', category: 'national' },
	{ id: 'n-2026-06-01', title: 'Hari Lahir Pancasila', start: '2026-06-01', category: 'national' },
	{ id: 'n-2026-06-16', title: 'Tahun Baru Hijriah 1 Muharram 1448 H', start: '2026-06-16', category: 'national' },
	{ id: 'n-2026-08-17', title: 'Hari Kemerdekaan Republik Indonesia', start: '2026-08-17', category: 'national' },
	{ id: 'n-2026-08-25', title: 'Maulid Nabi Muhammad SAW', start: '2026-08-25', category: 'national' },
	{ id: 'n-2026-12-25', title: 'Hari Raya Natal', start: '2026-12-25', category: 'national' },

	// ── Cuti bersama 2026 (SKB Tiga Menteri) ────────────────────────────
	{ id: 'c-2026-02-16', title: 'Cuti bersama Tahun Baru Imlek', start: '2026-02-16', category: 'collective' },
	{ id: 'c-2026-03-18', title: 'Cuti bersama Hari Raya Nyepi', start: '2026-03-18', category: 'collective' },
	{ id: 'c-2026-03-20', title: 'Cuti bersama Hari Raya Idul Fitri', start: '2026-03-20', category: 'collective' },
	{ id: 'c-2026-03-23', title: 'Cuti bersama Hari Raya Idul Fitri', start: '2026-03-23', category: 'collective' },
	{ id: 'c-2026-03-24', title: 'Cuti bersama Hari Raya Idul Fitri', start: '2026-03-24', category: 'collective' },
	{ id: 'c-2026-05-15', title: 'Cuti bersama Kenaikan Isa Almasih', start: '2026-05-15', category: 'collective' },
	{ id: 'c-2026-05-28', title: 'Cuti bersama Hari Raya Idul Adha', start: '2026-05-28', category: 'collective' },
	{ id: 'c-2026-12-24', title: 'Cuti bersama Hari Raya Natal', start: '2026-12-24', category: 'collective' },

	// ── Kalender Akademik UPI TA 2026/2027 ─────────────────────────────
	// Wisuda 2026
	{ id: 'u-w1', title: 'Wisuda Gelombang I', start: '2026-02-10', end: '2026-02-11', category: 'upi' },
	{ id: 'u-w2', title: 'Wisuda Gelombang II', start: '2026-05-12', end: '2026-05-13', category: 'upi' },
	{ id: 'u-w3', title: 'Wisuda Gelombang III', start: '2026-07-14', end: '2026-07-15', category: 'upi' },
	// Semester Ganjil 2026/2027
	{ id: 'u-g-pra', title: 'Kuliah Umum & Pra-Perkuliahan (Ganjil)', start: '2026-08-19', end: '2026-08-21', category: 'upi' },
	{ id: 'u-g-awal', title: 'Awal Perkuliahan Semester Ganjil', start: '2026-08-24', category: 'upi' },
	{ id: 'u-g-irs', title: 'Perubahan Rencana Studi (Ganjil)', start: '2026-08-31', end: '2026-09-07', category: 'upi' },
	{ id: 'u-g-uts', title: 'Ujian Tengah Semester (UTS) — Ganjil', start: '2026-10-12', end: '2026-11-06', category: 'upi', note: 'Rentang mengikuti kalender resmi UPI; verifikasi pada PDF sumber.' },
	{ id: 'u-w4', title: 'Wisuda Gelombang IV', start: '2026-10-13', end: '2026-10-14', category: 'upi' },
	{ id: 'u-g-akhir', title: 'Akhir Perkuliahan Semester Ganjil', start: '2026-12-07', category: 'upi' },
	{ id: 'u-w5', title: 'Wisuda Gelombang V', start: '2026-12-08', end: '2026-12-09', category: 'upi' },
	{ id: 'u-g-uas', title: 'Ujian Akhir Semester (UAS) — Ganjil', start: '2026-12-10', end: '2026-12-24', category: 'upi' },
	{ id: 'u-g-nilai', title: 'Pemeriksaan & Pemasukan Nilai UAS (Ganjil)', start: '2026-12-15', end: '2026-12-26', category: 'upi' },
	// Semester Genap 2026/2027
	{ id: 'u-gn-pra', title: 'Kuliah Umum & Pra-Perkuliahan (Genap)', start: '2027-01-25', end: '2027-01-27', category: 'upi' },
	{ id: 'u-gn-awal', title: 'Awal Perkuliahan Semester Genap', start: '2027-01-25', category: 'upi' },
	{ id: 'u-gn-irs', title: 'Perubahan Rencana Studi (Genap)', start: '2027-02-08', end: '2027-02-13', category: 'upi' },
	{ id: 'u-gn-uts', title: 'Ujian Tengah Semester (UTS) — Genap', start: '2027-03-15', end: '2027-03-19', category: 'upi' },
	{ id: 'u-gn-akhir', title: 'Akhir Perkuliahan Semester Genap', start: '2027-05-10', category: 'upi' },
	{ id: 'u-gn-uas', title: 'Ujian Akhir Semester (UAS) — Genap', start: '2027-05-10', end: '2027-05-21', category: 'upi' },
	{ id: 'u-gn-nilai', title: 'Pemeriksaan & Pemasukan Nilai UAS (Genap)', start: '2027-05-13', end: '2027-05-25', category: 'upi' },
];

export const CALENDAR_SOURCES: CalendarSource[] = [
	{
		id: 'skb',
		name: 'SKB Tiga Menteri — Libur Nasional & Cuti Bersama 2026',
		url: 'https://www.kemenkopmk.go.id/sites/default/files/pengumuman/2025-09/SKB%20Libur%20Nasional%20dan%20Cuti%20Bersama%20Tahun%202026.pdf',
		description:
			'Keputusan Bersama Menteri Agama, Menteri PANRB, dan Menteri Ketenagakerjaan No. 1497/2025, 2/2025, 5/2025 (diumumkan 19 September 2025).',
	},
	{
		id: 'upi-en',
		name: 'Kalender Akademik UPI — upi.edu',
		url: 'https://www.upi.edu/en/services/academic-calendar',
		description: 'Laman resmi Kalender Akademik Universitas Pendidikan Indonesia TA 2026/2027.',
	},
	{
		id: 'upi-dit',
		name: 'Direktorat Pendidikan UPI — Kalender Akademik 2026/2027',
		url: 'https://dit-pendidikan.upi.edu/download/kalender-akademik-universitas-pendidikan-indonesia-tahun-2026-2027/',
		description: 'Halaman unduhan Kalender Akademik UPI TA 2026/2027 dari Direktorat Pendidikan.',
	},
];
