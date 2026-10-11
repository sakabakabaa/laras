import type { Language } from '@/lib/i18n';
import { dedicatedPageSteps } from './workspace-guide-pages';

type Copy = [string, string, string];
export type WalkthroughStep = { selector: string; title: Copy; body: Copy; gesture?: 'search' | 'scan' | 'tap' };
const step = (selector: string, title: Copy, body: Copy, gesture: WalkthroughStep['gesture'] = 'tap'): WalkthroughStep => ({ selector, title, body, gesture });
export const guideCopy = (value: Copy, language: Language) => value[language === 'en' ? 1 : language === 'de' ? 2 : 0];

export function pageSteps(path: string, student: boolean): WalkthroughStep[] {
 const navigation = step('[data-guide="navigation"] .ld-nav-link.active', ['Pindah ruang kerja', 'Move between workspaces', 'Arbeitsbereich wechseln'], ['Menu di kiri membawa Anda ke setiap bagian LARAS. Ikon yang disorot menunjukkan halaman aktif.', 'The menu on the left takes you to each area of LARAS. The highlighted icon marks your current page.', 'Das Menü links führt zu den Bereichen von LARAS. Das markierte Symbol zeigt die aktuelle Seite.'], 'scan');
 const search = step('[data-guide="global-search"]', ['Cari dari mana saja', 'Search from anywhere', 'Überall suchen'], ['Cari kelas, tugas, atau halaman lewat kolom ini. Pintasan Ctrl K juga membuka pencarian.', 'Find classes, tasks, or pages here. Ctrl K also opens search.', 'Hier finden Sie Kurse, Aufgaben und Seiten. Strg K öffnet ebenfalls die Suche.'], 'search');
 const profile = step('[data-guide="profile"]', ['Profil dan pengaturan', 'Profile and settings', 'Profil und Einstellungen'], ['Buka menu ini untuk pengaturan akun, tampilan, dan video panduan lengkap.', 'Open this menu for account settings, appearance, and the full guide video.', 'Hier finden Sie Kontoeinstellungen, Darstellung und das vollständige Anleitungsvideo.']);
 let specific: WalkthroughStep[] = [];
 const dedicated = dedicatedPageSteps(path, student);
 if (dedicated) specific = dedicated;
 else if (path.split('#')[0].replace(/\/$/, '') === '/app/courses') {
  if (!student) specific = [
   step('.mk-search', ['Temukan mata kuliah', 'Find a course', 'Kurs finden'], ['Ketik nama, kode, atau deskripsi di pencarian ini untuk mempersempit daftar kelas.', 'Type a name, code, or description here to narrow down your course list.', 'Geben Sie Namen, Kürzel oder Beschreibung ein, um die Kursliste einzugrenzen.'], 'search'),
   step('.mk-toolbar .mk-select:has(select[aria-label="Filter status"])', ['Saring status kelas', 'Filter class status', 'Kursstatus filtern'], ['Pilih Aktif atau Draf untuk menampilkan kelas sesuai statusnya.', 'Choose Active or Draft to show courses with that status.', 'Wählen Sie Aktiv oder Entwurf, um passende Kurse anzuzeigen.']),
   step('.mk-toolbar .mk-select:has(select[aria-label="Filter semester"])', ['Pilih semester', 'Choose a semester', 'Semester wählen'], ['Filter semester bekerja bersama pencarian dan status. Kembali ke Semua semester untuk melihat seluruh daftar.', 'The semester filter works together with search and status. Choose All semesters to see the full list.', 'Der Semesterfilter ergänzt Suche und Status. Alle Semester zeigt die gesamte Liste.']),
   step('.mk-create', ['Siapkan kelas baru', 'Set up a new class', 'Neuen Kurs vorbereiten'], ['Buat Mata Kuliah membuka alur penyusunan kelas dan RPS. Anda dapat kembali ke daftar ini setelah selesai.', 'Create Course opens the course and syllabus setup flow. Return to this list when you finish.', 'Kurs erstellen öffnet die Einrichtung von Kurs und Lehrplan. Danach können Sie hierher zurückkehren.']),
   step('.mk-card-body, .mk-list-row', ['Baca ringkasan kelas', 'Read the class overview', 'Kursübersicht lesen'], ['Kartu ini menampilkan mahasiswa, sesi, materi, dan tugas untuk kelas yang sama.', 'This card shows the students, sessions, materials, and tasks for this class.', 'Diese Karte zeigt Studierende, Sitzungen, Materialien und Aufgaben dieses Kurses.'], 'scan'),
   step('.mk-open, .mk-list-row .ld-card-cta', ['Masuk ke mata kuliah', 'Open the course', 'Kurs öffnen'], ['Buka Mata Kuliah membawa Anda ke ruang kelas untuk mengelola materi, sesi, tugas, dan mahasiswa.', 'Open Course takes you into the class workspace to manage materials, sessions, tasks, and students.', 'Kurs öffnen führt in den Kursbereich für Materialien, Sitzungen, Aufgaben und Studierende.']),
  ];
  else specific = [
   step('.student-worlds-page .ld-search-bar', ['Cari kelas Anda', 'Find your class', 'Eigenen Kurs finden'], ['Gunakan pencarian ini untuk menemukan mata kuliah yang Anda ikuti.', 'Use this search to find a course you are enrolled in.', 'Mit dieser Suche finden Sie einen Kurs, in dem Sie eingeschrieben sind.'], 'search'),
   step('.student-world-card .sd-course-head', ['Kenali kelas', 'Identify the class', 'Kurs erkennen'], ['Nama dan kode di kartu ini membantu Anda memilih kelas yang tepat.', 'The name and code on this card help you select the right class.', 'Name und Kürzel auf der Karte helfen Ihnen, den richtigen Kurs zu wählen.'], 'scan'),
   step('.student-world-card .sd-course-foot', ['Lihat progres pertemuan', 'Check session progress', 'Sitzungsfortschritt ansehen'], ['Indikator ini merangkum pertemuan kelas yang sudah selesai.', 'This indicator summarizes completed class sessions.', 'Diese Anzeige fasst abgeschlossene Kurssitzungen zusammen.'], 'scan'),
   step('.student-world-actions a[href*="latihan"]', ['Berlatih dari materi kelas', 'Practise course materials', 'Kursmaterial üben'], ['Mulai latihan membuka latihan personal untuk mata kuliah ini.', 'Start Practice opens personal practice for this course.', 'Übung starten öffnet persönliche Übungen für diesen Kurs.']),
   step('.student-world-actions a:not([href*="latihan"])', ['Buka ruang kelas', 'Open the class workspace', 'Kursbereich öffnen'], ['Buka kelas untuk membaca materi dan mengikuti aktivitas yang diberikan dosen.', 'Open the class to read materials and follow activities from your instructor.', 'Öffnen Sie den Kurs, um Materialien und Aktivitäten Ihrer Lehrkraft zu sehen.']),
  ];
 } else if (path.includes('/latihan')) {
  specific = [
   step('.pp-practice-course', ['Mulai dari mata kuliah', 'Start with a course', 'Mit einem Kurs beginnen'], ['Pilih kartu mata kuliah. Materinya menjadi konteks latihan Anda.', 'Choose a course card. Its materials provide context for your practice.', 'Wählen Sie eine Kurskarte. Die Materialien bilden den Kontext Ihrer Übung.']),
   step('.cp-mode-picker', ['Pilih jenis latihan', 'Choose your practice mode', 'Übungsart wählen'], ['Gunakan Latihan soal untuk mengerjakan pertanyaan, atau Percakapan untuk praktik berbicara.', 'Choose Exercises for questions, or Conversation for speaking practice.', 'Wählen Sie Aufgaben für Fragen oder Gespräch zum Sprechenüben.']),
   step('.cp-start-form, .pp-setup', ['Sesuaikan sesi', 'Customize your session', 'Sitzung anpassen'], ['Atur pilihan yang tersedia di sini sebelum memulai latihan.', 'Set the available options here before starting practice.', 'Passen Sie die verfügbaren Optionen an, bevor Sie beginnen.'], 'scan'),
   step('.cp-live-controls, .pp-input-row', ['Ikuti alur latihan', 'Follow the practice flow', 'Übungsablauf folgen'], ['Gunakan kontrol sesi ini untuk mengerjakan latihan atau mengelola percakapan.', 'Use these session controls to complete practice or manage your conversation.', 'Mit diesen Steuerelementen bearbeiten Sie die Übung oder verwalten das Gespräch.']),
  ];
 } else {
  // Describe only controls that are actually present on the current page.
  specific = [
   step('.ld-content h1', ['Anda berada di sini', 'You are here', 'Sie sind hier'], ['Judul ini menandai ruang kerja yang sedang Anda buka. Gunakan menu kiri untuk berpindah bagian.', 'This title identifies the workspace you have open. Use the left menu to switch areas.', 'Dieser Titel kennzeichnet den aktuellen Arbeitsbereich. Wechseln Sie über das Menü links.'], 'scan'),
   step('.ld-content .ld-search-bar', ['Cari di halaman ini', 'Search this page', 'Auf dieser Seite suchen'], ['Pencarian ini mempersempit daftar pada halaman yang sedang Anda buka.', 'This search narrows the list on your current page.', 'Diese Suche grenzt die Liste auf der aktuellen Seite ein.'], 'search'),
   step('.ld-content [role="tablist"], .cw-tabs, .course-rail', ['Pindah bagian kelas', 'Switch sections', 'Bereich wechseln'], ['Pilih bagian yang ingin dibuka dari navigasi ini.', 'Choose the section you want to open from this navigation.', 'Wählen Sie über diese Navigation den gewünschten Bereich.']),
   step('.ld-content .ld-btn-primary', ['Aksi utama halaman', 'The main page action', 'Hauptaktion der Seite'], ['Tombol ini membuka langkah utama pada halaman. Panduan hanya menunjukkannya; Anda dapat menggunakannya setelah menutup panduan.', 'This button opens the main action on this page. The guide points it out; you can use it after closing the guide.', 'Diese Schaltfläche öffnet die Hauptaktion der Seite. Nach dem Schließen der Anleitung können Sie sie verwenden.']),
   step('.cp-profile-reflections', ['Tinjau percakapan', 'Review conversations', 'Gespräche ansehen'], ['Sesi percakapan yang selesai tersimpan di sini. Buka satu sesi untuk membaca transkrip dan refleksinya.', 'Completed conversations are saved here. Open a session to read its transcript and reflection.', 'Abgeschlossene Gespräche werden hier gespeichert. Öffnen Sie eine Sitzung für Transkript und Reflexion.'], 'scan'),
  ];
 }
 return [navigation, ...specific, search, profile];
}
