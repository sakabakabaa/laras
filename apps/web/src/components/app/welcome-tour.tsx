import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { BookOpen } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const VERSION = 'v1';
export const TOUR_REPLAY_EVENT = 'laras:replay-welcome-tour';
export function tourSessionKey(id: string, role: string) {
  return `laras:tour:shown:${VERSION}:${id}:${role}`;
}
function preferenceKey(id: string, role: string) {
  return `laras:tour:hidden:${VERSION}:${id}:${role}`;
}
// Storage can be unavailable in private or restricted browser contexts.
function read(storage: Storage, key: string) {
  try { return storage.getItem(key) === '1'; } catch { return false; }
}
function write(storage: Storage, key: string, value: boolean) {
  try { if (value) storage.setItem(key, '1'); else storage.removeItem(key); } catch { /* Keep the tour usable. */ }
}

export function WelcomeTour() {
  const { user, isLoading } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = user?.id;
  const role = user?.role;
  const eligible = !isLoading && Boolean(id) && (role === 'student' || role === 'faculty') &&
    (pathname === '/app' || pathname.startsWith('/app/') || pathname === '/analytics' || pathname === '/kalender') &&
    pathname !== '/app/onboarding' && !user?.mustChangePassword;

  useEffect(() => {
    if (!eligible || !id) { setOpen(false); return; }
    const hiddenKey = preferenceKey(id, role);
    setHidden(read(localStorage, hiddenKey));
    if (!read(localStorage, hiddenKey) && !read(sessionStorage, tourSessionKey(id, role))) {
      write(sessionStorage, tourSessionKey(id, role), true);
      setFailed(false);
      setOpen(true);
    }
    const replay = () => {
      setHidden(read(localStorage, hiddenKey));
      setFailed(false);
      setOpen(true);
    };
    window.addEventListener(TOUR_REPLAY_EVENT, replay);
    return () => window.removeEventListener(TOUR_REPLAY_EVENT, replay);
  }, [eligible, id, role]);

  if (!eligible || !id) return null;
  const student = role === 'student';
  const media = `/tours/${student ? 'mahasiswa' : 'dosen'}`;
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent className="w-[calc(100%-2rem)] max-w-4xl max-h-[90dvh] overflow-y-auto rounded-2xl p-4 sm:p-6">
      <div className="pr-7">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground"><BookOpen size={16} /> Panduan LARAS · {student ? 'Mahasiswa' : 'Dosen'}</p>
        <DialogTitle className="text-xl sm:text-2xl">Selamat datang di ruang {student ? 'belajar' : 'mengajar'} Anda</DialogTitle>
        <DialogDescription className="mt-2">{student ? 'Kenali materi, tugas, latihan AI, dan progres belajar Anda.' : 'Pelajari cara menyiapkan kelas, membuat tugas, dan menerbitkan penilaian.'} Video {student ? '2 menit 51 detik' : '3 menit 54 detik'} dengan narasi dan teks bahasa Indonesia.</DialogDescription>
      </div>
      {open && <video key={media} controls playsInline preload="none" poster={`${media}.jpg`} onError={() => setFailed(true)} className="max-h-[50dvh] w-full rounded-xl bg-black object-contain" aria-label={`Panduan penggunaan LARAS untuk ${student ? 'mahasiswa' : 'dosen'}`}>
        <source src={`${media}.mp4`} type="video/mp4" />
        Browser Anda tidak mendukung video. <a href={`${media}.mp4`}>Buka video panduan</a>.
      </video>}
      {failed && <p role="alert" className="text-sm text-muted-foreground">Video belum dapat diputar. <a href={`${media}.mp4`} className="underline">Buka video langsung</a> atau lanjutkan ke aplikasi.</p>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" checked={hidden} className="mt-1 h-4 w-4 accent-[#7f1d16]" onChange={(event) => {
            setHidden(event.target.checked);
            write(localStorage, preferenceKey(id, role), event.target.checked);
          }} />
          <span>Jangan tampilkan lagi<span className="block text-xs text-muted-foreground">Untuk akun ini di browser ini. Tonton kembali lewat menu profil.</span></span>
        </label>
        <Button onClick={() => setOpen(false)}>Mulai {student ? 'belajar' : 'mengajar'}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
