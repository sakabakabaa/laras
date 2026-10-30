/**
 * Ready-to-use LLM prompts for the per-section "Salin prompt" action in the
 * full-page RPS editor. Each prompt is tailored to one RPS section and asks the
 * model to emit CSV that can be pasted straight back into that section's
 * "Impor teks → CSV" box (parsed by `rps-csv.ts`).
 *
 * The prompts are explicit about the schema, headers, relationship/code rules,
 * and the rule to never invent data that is not in the source document. A
 * placeholder marks where the lecturer pastes their RPS text or describes the
 * attached PDF.
 */

/** Copy text to the clipboard with a sensible fallback when the async Clipboard
 *  API is unavailable (insecure context, older browser, or permission denied).
 *  Returns true on success. No-op on the server (SSR). */
export async function copyToClipboard(text: string): Promise<boolean> {
	if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// fall through to the legacy fallback
		}
	}
	if (typeof document !== 'undefined') {
		try {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.setAttribute('readonly', '');
			ta.style.position = 'fixed';
			ta.style.top = '0';
			ta.style.left = '0';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.focus();
			ta.select();
			const ok = document.execCommand('copy');
			document.body.removeChild(ta);
			return ok;
		} catch {
			return false;
		}
	}
	return false;
}

const SOURCE_PLACEHOLDER =
	'[TEMPELKAN TEKS RPS DI SINI — atau jelaskan isi PDF RPS Anda secara rinci]';

const COMMON_RULES = `Aturan WAJIB:
- Hanya isi data yang benar-benar ada di dokumen sumber. JANGAN mengarang, menebak, atau melengkapi data yang tidak ada.
- Jika sebuah nilai tidak disebutkan, kosongkan (tetap tulis barisnya dengan nilai kosong) atau lewati baris tersebut.
- Output HANYA CSV valid yang siap dipakai, tanpa pembungkus kode, tanpa penjelasan, tanpa teks tambahan di luar CSV.
- Gunakan tanda kutip ganda untuk field yang mengandung koma, tanda kutip, atau baris baru.`;

/** Section-specific prompts keyed by RPS step id (1–6). */
export const SECTION_PROMPTS: Record<number, string> = {
	1: `Kamu adalah asisten yang membantu dosen menyusun Rencana Pembelajaran Semester (RPS) mata kuliah. Tugas kamu: baca dokumen RPS di bawah, lalu ekstrak BAGIAN IDENTITAS MATA KULIAH dan keluarkan sebagai CSV.

Format output WAJIB — CSV dengan header persis:
field,value

Label yang dikenali pada kolom "field" (gunakan persis label ini):
- Nama Mata Kuliah
- Kode
- SKS (angka, mis. 3)
- Semester (Ganjil / Genap / angka romawi)
- Tahun Akademik (format 2025/2026)
- Kelompok MK
- Dosen Pengampu
- Prasyarat
- Tanggal Penetapan (format YYYY-MM-DD)

${COMMON_RULES}

Dokumen RPS saya:
${SOURCE_PLACEHOLDER}`,

	2: `Kamu adalah asisten yang membantu dosen menyusun Rencana Pembelajaran Semester (RPS) mata kuliah. Tugas kamu: baca dokumen RPS di bawah, lalu ekstrak BAGIAN CAPAIAN PEMBELAJARAN (CPL, CPMK, Sub-CPMK, dan Topik) dan keluarkan sebagai CSV.

Format output WAJIB — CSV dengan header persis:
tipe,kode,kode_induk,deskripsi

Kolom "tipe" bernilai salah satu dari: CPL, CPMK, SUB-CPMK, TOPIK.
- Untuk CPL dan TOPIK: kolom "kode_induk" dikosongkan.
- Untuk CPMK: "kode_induk" diisi kode CPL induknya.
- Untuk SUB-CPMK: "kode_induk" diisi kode CPMK induknya.
- URUTAN PENTING: tulis CPMK sebelum Sub-CPMK miliknya agar relasi induk-anak terbentuk saat diimpor.

${COMMON_RULES}

Dokumen RPS saya:
${SOURCE_PLACEHOLDER}`,

	3: `Kamu adalah asisten yang membantu dosen menyusun Rencana Pembelajaran Semester (RPS) mata kuliah. Tugas kamu: baca dokumen RPS di bawah, lalu ekstrak BAGIAN RENCANA PEMBELAJARAN / JADWAL PERTEMUAN MINGGUAN (minggu 1–16) dan keluarkan sebagai CSV.

Format output WAJIB — CSV dengan header persis:
minggu,judul,tipe_minggu,topik,indikator,materi,metode_sinkron,metode_asinkron,penilaian_metode,bobot_penilaian,durasi,referensi,akses,kode_cpl,kode_cpmk,kode_sub,kode_topik,kode_penilaian

- "minggu" angka 1–16.
- "tipe_minggu" bernilai salah satu dari: normal, uts, uas, khusus. Tandai minggu 8 sebagai "uts" dan minggu 16 sebagai "uas" bila dokumen menyebutnya; minggu mengajar biasa bernilai "normal". Bila tidak disebut, isi "normal".
- "judul" dan "topik" wajib diisi bila ada; field lain boleh dikosongkan bila tidak disebut.
- "indikator" = indikator pembelajaran, "materi" = materi pembelajaran rinci, "metode_sinkron"/"metode_asinkron" = metode sinkronus/asinkronus, "penilaian_metode" = aspek/metode penilaian, "bobot_penilaian" = bobot sesi (angka 0–100), "durasi" = durasi (mis. "100 menit"), "referensi" = bahan bacaan, "akses" = tanggal/waktu akses format YYYY-MM-DDTHH:MM.
- Kolom kode (kode_cpl, kode_cpmk, kode_sub, kode_topik, kode_penilaian) diisi kode capaian/penilaian yang relevan dengan pertemuan itu; pisahkan beberapa kode dengan koma. Kosongkan bila tidak disebut di dokumen.
- Untuk minggu UTS/UAS/khusus, field indikator/materi/metode boleh dikosongkan.

${COMMON_RULES}

Dokumen RPS saya:
${SOURCE_PLACEHOLDER}`,

	4: `Kamu adalah asisten yang membantu dosen menyusun Rencana Pembelajaran Semester (RPS) mata kuliah. Tugas kamu: baca dokumen RPS di bawah, lalu ekstrak BAGIAN BEBAN KERJA MAHASISWA dan keluarkan sebagai CSV.

Format output WAJIB — CSV dengan header persis:
komponen,jam,catatan

Komponen yang dikenali (gunakan persis label ini pada kolom "komponen"):
- Kuliah
- Tutorial
- Praktik (juga untuk Praktikum / Responsi)
- Belajar mandiri
- Total

- "jam" angka (boleh desimal dengan titik).
- "catatan" diisi bila ada uraian beban kerja; kosongkan bila tidak ada.

${COMMON_RULES}

Dokumen RPS saya:
${SOURCE_PLACEHOLDER}`,

	5: `Kamu adalah asisten yang membantu dosen menyusun Rencana Pembelajaran Semester (RPS) mata kuliah. Tugas kamu: baca dokumen RPS di bawah, lalu ekstrak BAGIAN KRITERIA / KOMPONEN PENILAIAN dan keluarkan sebagai CSV.

Format output WAJIB — CSV dengan header persis:
kode,deskripsi,bobot

- "kode" diisi kode komponen (mis. UTS, UAS, Tugas) bila disebut; boleh dikosongkan.
- "deskripsi" wajib diisi (nama/keterangan komponen penilaian).
- "bobot" angka 0–100 (persentase) bila disebut; kosongkan bila tidak ada.

${COMMON_RULES}

Dokumen RPS saya:
${SOURCE_PLACEHOLDER}`,

	6: `Kamu adalah asisten yang membantu dosen menyusun Rencana Pembelajaran Semester (RPS) mata kuliah. Tugas kamu: baca dokumen RPS di bawah, lalu ekstrak BAGIAN TUGAS KOLABORATIF / TUGAS KELOMPOK dan keluarkan sebagai CSV.

Format output WAJIB — CSV dengan header persis:
judul,deskripsi,tujuan,jadwal,info_kelompok,kode_cpl,kode_cpmk,kode_sub,kode_penilaian

- "judul" wajib diisi bila ada; "deskripsi" diisi bila ada.
- Field lain (tujuan, jadwal, info_kelompok) boleh dikosongkan bila tidak disebut.
- Kolom kode (kode_cpl, kode_cpmk, kode_sub, kode_penilaian) diisi kode capaian/penilaian yang relevan; pisahkan beberapa kode dengan koma. Kosongkan bila tidak disebut.

${COMMON_RULES}

Dokumen RPS saya:
${SOURCE_PLACEHOLDER}`,
};

/** Short Indonesian label for the copy-prompt action per section. */
export const SECTION_PROMPT_LABELS: Record<number, string> = {
	1: 'Salin prompt identitas',
	2: 'Salin prompt capaian',
	3: 'Salin prompt pertemuan',
	4: 'Salin prompt beban kerja',
	5: 'Salin prompt penilaian',
	6: 'Salin prompt tugas kolaboratif',
};

/** Get the prompt for a section, or null if unsupported. */
export function getSectionPrompt(step: number): string | null {
	return SECTION_PROMPTS[step] ?? null;
}
