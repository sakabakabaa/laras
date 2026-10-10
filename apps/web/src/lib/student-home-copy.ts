import { useLanguage } from '@/lib/i18n';
const copy: Record<string, [string, string]> = {
 "Buka putaran yang siap": ["Open the ready round", "Bereite Runde öffnen"],
 "Bukti belum cukup untuk memilih kelemahan. Mulai dari materi kelas.": ["There is not enough evidence to choose a weak skill yet. Start with course material.", "Es gibt noch nicht genug Daten, um eine Schwäche zu bestimmen. Beginne mit dem Kursmaterial."],
 "Dipilih dari {count} jawaban latihan. Fokus sementara, bukan penilaian resmi.": ["Chosen from {count} practice answers. A temporary focus, not an official assessment.", "Aus {count} Übungsantworten gewählt. Ein vorläufiger Fokus, keine offizielle Bewertung."],
 "Menyiapkan putaran {round}/2 dari materi yang tersedia.": ["Preparing round {round}/2 from available material.", "Runde {round}/2 wird aus dem verfügbaren Material vorbereitet."],
 "Putaran {round}/2. Jawabanmu diperlukan untuk melanjutkan.": ["Round {round}/2. Answer the questions to continue.", "Runde {round}/2. Beantworte die Fragen, um fortzufahren."],
 "Batalkan": ["Cancel", "Abbrechen"],
 "Materi terbaru": ["Recent course material", "Aktuelles Kursmaterial"],
 "Pelatih belajarmu": ["Your learning coach", "Dein Lerncoach"],
 "Dua putaran pendek. Fokus menyesuaikan jawabanmu.": ["Two short rounds. The focus adjusts to your answers.", "Zwei kurze Runden. Der Fokus passt sich deinen Antworten an."],
 "Latihan bersama AI · ±10 menit": ["Practice with AI · about 10 minutes", "Mit KI üben · etwa 10 Minuten"],
 "Lanjutkan tugas": ["Resume task", "Aufgabe fortsetzen"],
 "Mulai putaran": ["Start round", "Runde starten"],
 "Hasil tersimpan dan diperiksa": ["Result saved and verified", "Ergebnis gespeichert und geprüft"],
 "Kamu boleh menutup halaman ini. Progres tetap tersimpan.": ["You can close this page. Your progress is saved.", "Du kannst diese Seite schließen. Dein Fortschritt wird gespeichert."],
 "Tugas sebelumnya": ["Previous tasks", "Bisherige Aufgaben"],
 "Progres tugas": ["Task progress", "Aufgabenfortschritt"],
 "Dalam antrean": ["Queued", "In der Warteschlange"],
 "Sedang dikerjakan": ["Working", "In Bearbeitung"],
 "Draf siap ditinjau": ["Draft ready for review", "Entwurf bereit zur Prüfung"],
 "Giliranmu berlatih": ["Your turn to practice", "Du bist dran"],
 "Masuk kembali untuk melanjutkan": ["Sign in again to continue", "Zum Fortfahren erneut anmelden"],
 "Perlu dicoba lagi": ["Needs another try", "Erneut versuchen"],
 "Dibatalkan": ["Cancelled", "Abgebrochen"],
 "Baca progresmu": ["Read your progress", "Deinen Fortschritt lesen"],
 "Pilih fokus latihan": ["Choose a practice focus", "Übungsschwerpunkt wählen"],
 "Siapkan putaran pertama": ["Prepare the first round", "Erste Runde vorbereiten"],
 "Latihan dan sesuaikan putaran berikutnya": ["Practice and adjust the next round", "Üben und nächste Runde anpassen"],
 "Catat hasil sesi": ["Save the session results", "Ergebnisse speichern"],
 "Perjalanan kelasmu": ["Your course journey", "Deine Kursreise"],
 "Rincian pertemuan": ["Session details", "Einzelheiten zum Termin"],
 "Komponen nilai mata kuliah": ["Course grade components", "Bestandteile der Kursnote"],
 "Bonus di luar bobot": ["Bonus outside the weighting", "Bonus außerhalb der Gewichtung"],
 "Bobot {weight}%": ["Weight {weight}%", "Gewichtung {weight}%"],
 "Nilai akhir": ["Final grade", "Endnote"],
 "Belum diterbitkan / belum lengkap": ["Not published or not complete", "Noch nicht veröffentlicht oder unvollständig"],
 "Rincian": ["Details", "Einzelheiten"],
  "Materi, tantangan, dan tugas dalam satu dunia kelas.": ["Materials, challenges, and tasks in one course world.", "Materialien, Übungen und Aufgaben in einer Kurswelt."],
  "Progres pertemuan kelas": ["Class session progress", "Fortschritt der Kurstermine"],
  "Coba tantangan dari materi kelas. Jawabanmu mendapat penjelasan.": ["Try a challenge from your course. Each answer comes with an explanation.", "Übe mit deinen Kursmaterialien. Zu jeder Antwort gibt es eine Erklärung."],
  "ARENA LATIHAN": ["PRACTICE ARENA", "ÜBUNGSARENA"],
  "Pilih petualanganmu.": ["Choose your adventure.", "Wähle dein Abenteuer."],
  "Pilih mata kuliah. Selesaikan tantangan dari materi kelas dan kumpulkan XP.": ["Choose a course. Try challenges from your materials and earn XP.", "Wähle einen Kurs. Übe mit deinen Materialien und sammle XP."],
  "XP latihan": ["Practice XP", "Übungs-XP"],
  "Tanpa nilai resmi": ["No course grades", "Ohne offizielle Note"],
  "Memuat mata kuliah…": ["Loading courses…", "Kurse werden geladen…"],
  "Belum ada mata kuliah": ["No courses yet", "Noch keine Kurse"],
  "Setelah Anda terdaftar di kelas, latihan dari materi kelas akan muncul di sini.": ["Your course challenges appear here once you join a class.", "Sobald du in einem Kurs angemeldet bist, erscheinen hier deine Übungen."],
  "Mulai petualangan": ["Start exploring", "Abenteuer starten"],
  "Pilih mata kuliah": ["Choose a course", "Kurs auswählen"],
  "MATA KULIAH": ["COURSE", "KURS"],

  "petualang": [
    "explorer",
    "Entdecker"
  ],
  "RUANG BELAJARMU": [
    "YOUR LEARNING SPACE",
    "DEIN LERNRAUM"
  ],
  "Halo,": [
    "Hello,",
    "Hallo,"
  ],
  "Petualangan kecil. Kemajuan setiap hari.": [
    "Small adventures. A little progress every day.",
    "Kleine Abenteuer. Jeden Tag ein Stück weiter."
  ],
  "Memuat progres…": [
    "Loading progress…",
    "Fortschritt wird geladen…"
  ],
  "Progres belajar": [
    "Learning progress",
    "Lernfortschritt"
  ],
  "SATU PUTARAN, SEKITAR 5 MENIT": [
    "ONE ROUND, ABOUT 5 MINUTES",
    "EINE RUNDE, ETWA 5 MINUTEN"
  ],
  "Petualanganmu belum selesai.": [
    "Your adventure is waiting.",
    "Dein Abenteuer wartet."
  ],
  "Satu langkah lagi?": [
    "Ready for another step?",
    "Bereit für den nächsten Schritt?"
  ],
  "Siap bermain sambil belajar?": [
    "Ready to play and learn?",
    "Bereit zum Spielen und Lernen?"
  ],
  "Pilih dunia kelasmu, coba tantangannya, dan temukan hal baru.": [
    "Choose a course world, try a challenge, and discover something new.",
    "Wähle deine Kurswelt, probiere eine Aufgabe und entdecke etwas Neues."
  ],
  "Lanjutkan latihan": [
    "Continue practice",
    "Weiter üben"
  ],
  "Mulai latihan": [
    "Start practice",
    "Übung starten"
  ],
  "Pilih petualangan": [
    "Choose an adventure",
    "Abenteuer wählen"
  ],
  "Boleh salah. Ada penjelasan untuk setiap jawaban.": [
    "Mistakes are welcome. Every answer comes with an explanation.",
    "Fehler sind willkommen. Zu jeder Antwort gibt es eine Erklärung."
  ],
  "Selesai satu putaran!": [
    "One round complete!",
    "Eine Runde geschafft!"
  ],
  "Ayo, kita coba!": [
    "Let’s give it a try!",
    "Probieren wir es!"
  ],
  "Target hari ini tercapai": [
    "Today’s goal is complete",
    "Tagesziel erreicht"
  ],
  "Target kecil hari ini": [
    "A small goal for today",
    "Ein kleines Ziel für heute"
  ],
  "Satu putaran selesai. Sampai jumpa di tantangan berikutnya.": [
    "One round complete. See you at the next challenge.",
    "Eine Runde geschafft. Bis zur nächsten Herausforderung."
  ],
  "Selesaikan satu putaran latihan. Mulai saat kamu siap.": [
    "Complete one practice round. Start when you’re ready.",
    "Schließe eine Übungsrunde ab. Starte, wenn du bereit bist."
  ],
  "Perjalananmu": [
    "Your journey",
    "Deine Reise"
  ],
  "Kemajuan dari latihan yang tersimpan": [
    "Progress from your saved practice",
    "Fortschritt aus deinen gespeicherten Übungen"
  ],
  "PILIH TEMPAT BERMAIN": [
    "CHOOSE YOUR NEXT ADVENTURE",
    "WÄHLE DEIN NÄCHSTES ABENTEUER"
  ],
  "Dunia kelasmu": [
    "Your course worlds",
    "Deine Kurswelten"
  ],
  "Semua latihan": [
    "All practice",
    "Alle Übungen"
  ],
  "Tantanganmu menunggu untuk dilanjutkan.": [
    "Your challenge is ready to continue.",
    "Deine Herausforderung wartet auf dich."
  ],
  "Latihan belum tersedia untuk kelas ini.": [
    "Practice is not available for this course yet.",
    "Für diesen Kurs gibt es noch keine Übungen."
  ],
  "Tantangan pendek dari materi kelas.": [
    "Short challenges from your course materials.",
    "Kurze Aufgaben aus deinen Kursmaterialien."
  ],
  "Lanjutkan": [
    "Continue",
    "Weiter"
  ],
  "Jelajahi": [
    "Explore",
    "Entdecken"
  ],
  "Materi & tugas kelas": [
    "Course materials & assignments",
    "Kursmaterialien & Aufgaben"
  ],
  "Duniamu sedang menunggu.": [
    "Your world is waiting.",
    "Deine Welt wartet."
  ],
  "Setelah terdaftar di kelas, petualanganmu akan muncul di sini.": [
    "Your adventures appear here once you join a course.",
    "Sobald du in einem Kurs angemeldet bist, erscheinen hier deine Abenteuer."
  ],
  "Lihat mata kuliah": [
    "Browse courses",
    "Kurse ansehen"
  ],
  "LANGKAH YANG SUDAH KAMU AMBIL": [
    "THE STEPS YOU HAVE TAKEN",
    "DEINE BISHERIGEN SCHRITTE"
  ],
  "Perjalananmu sejauh ini": [
    "Your journey so far",
    "Deine bisherige Reise"
  ],
  "Dari hasil latihanmu": [
    "From your practice results",
    "Aus deinen Übungsergebnissen"
  ],
  "Memuat perjalananmu…": [
    "Loading your journey…",
    "Deine Reise wird geladen…"
  ],
  "Yang sedang kamu pelajari": [
    "What you are learning",
    "Was du gerade lernst"
  ],
  "Langkah terbaru": [
    "Recent steps",
    "Letzte Schritte"
  ],
  "Putaran selesai": [
    "Round complete",
    "Runde abgeschlossen"
  ],
  "Belum ada putaran selesai. Setiap percobaan adalah langkah pertama.": [
    "No completed rounds yet. Every attempt is a first step.",
    "Noch keine abgeschlossene Runde. Jeder Versuch ist ein erster Schritt."
  ],
  "Mulai satu latihan. Kita akan melihat bagian yang lancar dan yang perlu dicoba lagi.": [
    "Try one practice round to find what feels easy and what needs another try.",
    "Probiere eine Übungsrunde. So erkennst du, was gut klappt und was du wiederholen kannst."
  ],
  "Coba lagi": [
    "Try again",
    "Noch einmal"
  ],
  "Mulai terbentuk": [
    "Taking shape",
    "Im Aufbau"
  ],
  "Semakin lancar": [
    "Getting comfortable",
    "Immer sicherer"
  ],
  "Makin baik": [
    "Improving",
    "Verbessert"
  ],
  "Langkah pertama": [
    "First step",
    "Erster Schritt"
  ],
  "Satu putaran selesai": [
    "One round complete",
    "Eine Runde abgeschlossen"
  ],
  "Terus mencoba": [
    "Keep exploring",
    "Weiter entdecken"
  ],
  "Lima putaran selesai": [
    "Five rounds complete",
    "Fünf Runden abgeschlossen"
  ],
  "Tugas kelas": [
    "Course assignment",
    "Kursaufgabe"
  ],
  "Kelas & tugas": [
    "Classes & assignments",
    "Kurse & Aufgaben"
  ],
  "Materi, tugas, dan jadwal kelasmu": [
    "Your materials, assignments, and class schedule",
    "Deine Materialien, Aufgaben und Kurstermine"
  ],
  "jawaban latihan": [
    "practice answers",
    "Übungsantworten"
  ],
  "DUNIA": [
    "WORLD",
    "WELT"
  ],
  "benar": [
    "correct",
    "richtig"
  ],
  "XP menuju level berikutnya": [
    "XP to the next level",
    "XP bis zum nächsten Level"
  ],
  "Sebagian progres belum bisa dimuat.": [
    "Some progress could not be loaded.",
    "Ein Teil des Fortschritts konnte nicht geladen werden."
  ],
  "Kembali ke dashboard": [
    "Back to dashboard",
    "Zurück zur Übersicht"
  ],
  "Pratinjau mahasiswa · Mata kuliah milik Anda. Progres pribadi muncul saat mahasiswa masuk.": [
    "Student preview · Your own courses. Personal progress appears when a student signs in.",
    "Studierendenansicht · Deine eigenen Kurse. Persönlicher Fortschritt erscheint nach der Anmeldung eines Studierenden."
  ],
  "Lanjutkan tantangan di {course}. Jawaban sebelumnya sudah tersimpan.": [
    "Continue your challenge in {course}. Your previous answers are saved.",
    "Setze deine Herausforderung in {course} fort. Deine bisherigen Antworten sind gespeichert."
  ],
  "Mari berlatih {skill}. Bagian ini masih perlu diulang berdasarkan jawaban latihanmu.": [
    "Let’s practice {skill}. Your previous practice answers suggest another try.",
    "Üben wir {skill}. Deine bisherigen Übungsantworten sprechen für eine Wiederholung."
  ],
  "Tata bahasa": [
    "Grammar",
    "Grammatik"
  ],
  "Pemahaman bacaan": [
    "Reading comprehension",
    "Leseverständnis"
  ],
  "Kosakata": [
    "Vocabulary",
    "Wortschatz"
  ],
  "Ejaan dan tanda baca": [
    "Spelling and punctuation",
    "Rechtschreibung und Zeichensetzung"
  ],
  "Menulis": [
    "Writing",
    "Schreiben"
  ],
  "Komunikasi sesuai konteks": [
    "Communication in context",
    "Situationsgerechte Kommunikation"
  ],
  "Keterampilan bahasa": [
    "Language skills",
    "Sprachkenntnisse"
  ]
};
export function useStudentHomeText() {
 const language = useLanguage();
 return (text: string, values: Record<string, string> = {}) => {
  const translated = language === 'id' ? text : copy[text]?.[language === 'en' ? 0 : 1] || text;
  return translated.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);
 };
}
