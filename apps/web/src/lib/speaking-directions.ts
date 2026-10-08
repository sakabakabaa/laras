import type { SpeakingConfig } from '@/lib/task-types';

export type SpeakingDirection = { label: string; text: string };

/** First student-facing line for the hero — never the lecturer RPS dump. */
export function speakingLead(prompt: string, title: string) {
	const text = prompt.replace(/\s+/g, ' ').trim();
	if (!text) {
		return `Rekam jawaban lisan untuk “${title}”. Ikuti arahan di langkah Persiapan, lalu kirim rekaman — bukan teks.`;
	}
	return text.length > 280 ? `${text.slice(0, 277).trim()}…` : text;
}

/**
 * What the student needs in order to record: what to say, language, time,
 * evidence, and how the answer is sent. Lecturer methods, indicators, and
 * CPMK notes are intentionally left out.
 */
export function speakingDirections(
	config: SpeakingConfig,
	opts: { formative: boolean },
): SpeakingDirection[] {
	const evidence = ['rekaman audio dari tombol Rekam'];
	if (config.allowVideo) evidence.push('atau unggahan video');
	if (config.allowLink) evidence.push('atau tautan rekaman');
	return [
		{
			label: 'Yang perlu dikatakan',
			text:
				config.prompt.trim() ||
				'Ucapkan jawaban lisan sesuai judul tugas. Bicara dengan jelas, dalam bahasa yang diminta.',
		},
		{
			label: 'Bahasa',
			text: config.language.trim() || 'Ikuti bahasa yang tertulis pada judul dan skenario tugas.',
		},
		{
			label: 'Durasi',
			text:
				config.durationMin > 0
					? `Usahakan sekitar ${config.durationMin} menit. Berhenti merekam saat selesai.`
					: 'Tidak ada batas durasi. Berhenti merekam saat jawaban selesai.',
		},
		{
			label: 'Bukti yang dikumpulkan',
			text: `Kirim ${evidence.join(', ')}. Kotak teks bukan jawaban tugas ini.`,
		},
		{
			label: 'Cara mengirim',
			text: opts.formative
				? 'Simpan draf agar rekaman tidak hilang. Latihan ini tidak dikumpulkan sebagai nilai. Gunakan Periksa jawaban untuk umpan balik formatif, lalu rekam ulang jika perlu.'
				: 'Simpan draf, periksa rekaman, lalu kirim sebagai pengumpulan resmi. Nilai hanya ditetapkan dosen — hasil AI bukan nilai.',
		},
	];
}

/** Short checklist under the player. Rubric labels only — no lecturer weights. */
export function speakingChecklist(config: SpeakingConfig) {
	const fromRubric = config.criteria.map((item) => item.label.trim()).filter(Boolean);
	if (fromRubric.length > 0) return fromRubric.slice(0, 6);
	const fromPrompt = config.prompt
		.split(/(?<=[.!?])\s+|\n+/)
		.map((line) => line.trim())
		.filter((line) => line.length > 12 && line.length < 180)
		.slice(0, 4);
	if (fromPrompt.length > 0) return fromPrompt;
	return [
		'Merekam jawaban lisan, bukan mengetik teks',
		'Suara cukup jelas untuk didengarkan ulang',
		'Menyimpan draf sebelum menutup halaman',
	];
}
