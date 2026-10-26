/** Only fixed service messages are translated; course content and learner text stay untouched. */
const messageKeys: Record<string,string> = {
"Pemahaman bacaan":"practiceUi.skillReading",
"Kosakata":"practiceUi.skillVocabulary",
"Tata bahasa":"practiceUi.skillGrammar",
"Ejaan dan tanda baca":"practiceUi.skillSpelling",
"Menulis":"practiceUi.skillWriting",
"Komunikasi sesuai konteks":"practiceUi.skillPragmatics",
"Keterampilan bahasa":"practiceUi.skillGeneral",
  "Belum ada pertemuan yang memenuhi syarat.": "practiceUi.noSessions",
  "Belum ada teks materi yang siap dibaca untuk pertemuan terbaru Anda. Latihan akan tersedia setelah materinya dapat diproses.": "practiceUi.noSources",
  "Tiga pertemuan terakhir yang sudah lewat; absensi belum tersedia.": "practiceUi.scopeRecent",
  "Berdasarkan pertemuan dengan catatan hadir atau terlambat.": "practiceUi.scopeAttended",
  "Fokus dari pola umpan balik tervalidasi dan latihan Anda.": "practiceUi.focusValidated",
  "Menggunakan saran dosen yang dipublikasikan; pola kemampuan masih dipelajari.": "practiceUi.focusTeacher",
  "Fokus disesuaikan dari jawaban latihan; belum ada pola tugas tervalidasi.": "practiceUi.focusPractice",
  "Latihan awal dari materi terbaru; fokus personal berkembang setelah Anda berlatih.": "practiceUi.focusInitial",
  "Tunggu sebentar sebelum mencoba lagi.": "practiceUi.wait",
  "Terlalu banyak permintaan. Tunggu sebentar.": "practiceUi.rateLimit",
  "Materi kelas belum siap untuk percakapan.": "practiceUi.conversationNotReady",
  "Gunakan rekaman audio maksimal 5 MB.": "practiceUi.audioSize",
  "Layanan suara belum dikonfigurasi. Gunakan jawaban ketik.": "practiceUi.voiceConfig",
  "Transkripsi gagal. Coba rekam lagi atau ketik jawaban.": "practiceUi.transcribeRetry",
  "Suara belum terbaca. Coba lagi atau ketik jawaban.": "practiceUi.audioUnreadable",
  "Suara belum tersedia. Kamu tetap dapat membaca balasan.": "practiceUi.voiceRead",
  "Hanya percakapan lengkap yang dapat disimpan.": "practiceUi.fullConversation",
  "Percakapan belum tersimpan. Coba lagi sebentar.": "practiceUi.saveLater",
  "Selesaikan percakapan ini atau mulai sesi baru.": "practiceUi.finishFirst",
  "Berikan setidaknya satu jawaban sebelum melihat rangkuman.": "practiceUi.answerFirst",
  "Balasan AI belum valid. Coba lagi; jawabanmu tetap ada.": "practiceUi.aiRetry"
};
type Translate = (key:string,vars?:Record<string,string>)=>string;
export function practiceSystemMessage(t:Translate,value:string,fallback?:string):string {
 return Object.hasOwn(messageKeys,value) ? t(messageKeys[value]) : fallback ? t(fallback) : value;
}
