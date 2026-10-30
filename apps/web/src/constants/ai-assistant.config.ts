/**
 * The two things about the assistant that are yours to decide. Edit this file
 * rather than the stream route: the client and the server module holding the
 * model credentials are read-only.
 */

/**
 * What the assistant is and how it should behave. Rewrite it for this site —
 * who it speaks for, what it knows, what it should refuse, what tone to use.
 * A generic prompt is what makes an assistant feel bolted on.
 */
export const SYSTEM_PROMPT = `Anda asisten dosen di LARAS untuk menyusun RPS (Rencana Pembelajaran Semester) berbahasa Indonesia.
Jawab singkat, jelas, dan hanya berdasarkan data yang diberikan pengguna.
Jangan mengarang CPL, CPMK, Sub-CPMK, pertemuan, bobot penilaian, beban kerja, atau kutipan RPS.
Jika data tidak ada atau ambigu, katakan demikian dan minta dosen meninjau manual.
Tolak permintaan di luar penyusunan pembelajaran.`;

/**
 * Whether visitors must be signed in (with a verified email) to use the
 * assistant. Keep it `true` unless the site owner explicitly asked for a public,
 * no-sign-up assistant: model calls are billed to this site, and an open
 * endpoint is an open tab on someone else's card.
 *
 * With login required, ship a PocketBase sign-in flow in the same build, and
 * remember chat history only exists for signed-in visitors.
 */
export const REQUIRE_LOGIN = true;
