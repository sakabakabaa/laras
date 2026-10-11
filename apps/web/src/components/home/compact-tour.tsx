import { useEffect, useRef, useState } from 'react';
import { BookOpen, Sparkles, CheckCircle2, Pause, Play, ShieldCheck } from 'lucide-react';

const STEPS = [
  { title: 'Siapkan kelas', role: 'Dosen', body: 'Susun materi, instruksi, dan rubrik dalam satu mata kuliah.', icon: BookOpen, heading: 'Tugas siap dibagikan', detail: 'Mein Tagesablauf · Bahasa Jerman A1', lines: ['Materi dan rujukan kelas', 'Instruksi dan tenggat', 'Rubrik penilaian'] },
  { title: 'Belajar & berlatih', role: 'Mahasiswa + AI', body: 'Kerjakan tugas dan gunakan latihan AI dari materi kelas.', icon: Sparkles, heading: 'Bantuan saat dibutuhkan', detail: 'Ich lerne heute Deutsch.', lines: ['Jawaban tersimpan sebagai draf', 'AI menjelaskan dengan konteks', 'Kumpulkan saat sudah siap'] },
  { title: 'Tinjau & lanjutkan', role: 'Dosen + Mahasiswa', body: 'Dosen meninjau umpan balik. Mahasiswa melihat hasil dan langkah berikutnya.', icon: CheckCircle2, heading: 'Umpan balik diterbitkan', detail: 'Ditinjau dosen · Nilai contoh 85 / 100', lines: ['AI membantu menyusun draf', 'Dosen menetapkan nilai akhir', 'Mahasiswa membaca arahan berikutnya'] },
];
export function CompactWorkflow() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(true);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(motion.matches);
    sync(); motion.addEventListener('change', sync);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: .25 });
    if (ref.current) observer.observe(ref.current);
    return () => { observer.disconnect(); motion.removeEventListener('change', sync); };
  }, []);
  useEffect(() => {
    if (paused || reduced || !visible) return;
    const timer = window.setInterval(() => { if (!document.hidden) setStep(s => (s + 1) % STEPS.length); }, 5500);
    return () => window.clearInterval(timer);
  }, [paused, reduced, visible]);
  const current = STEPS[step];
  return <section ref={ref} className="lp-section lp-compact-flow" id="cara-kerja" aria-labelledby="flow-title">
    <div className="lp-wrap">
      <div className="lp-section-head" data-lp-reveal><p className="lp-kicker">Cara kerja</p><h2 id="flow-title">Dari materi ke kemajuan.<br />Dalam tiga langkah.</h2></div>
      <div className="lp-compact-flow-grid">
        <div className="lp-compact-steps" role="tablist" onFocus={() => setPaused(true)} aria-label="Langkah belajar" aria-orientation="vertical">
          {STEPS.map((item, i) => <button key={item.title} id={`flow-tab-${i}`} role="tab" aria-selected={step === i} aria-controls="flow-demo" tabIndex={step === i ? 0 : -1} onKeyDown={event => {
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (i + (event.key === 'ArrowDown' ? 1 : 2)) % 3;
              setPaused(true); setStep(next); document.getElementById(`flow-tab-${next}`)?.focus();
            }
          }} onClick={() => { setStep(i); setPaused(true); }}><span className="lp-compact-number">0{i + 1}</span><span><small>{item.role}</small><strong>{item.title}</strong><span>{item.body}</span></span></button>)}
        </div>
        <div className="lp-compact-demo" id="flow-demo" role="tabpanel" aria-labelledby={`flow-tab-${step}`}>
          <div className="lp-compact-demo-top"><span>CONTOH ALUR LARAS</span><button type="button" disabled={reduced} onClick={() => setPaused(!paused)} aria-label={paused ? 'Putar animasi alur' : 'Jeda animasi alur'}>{paused ? <Play size={16} /> : <Pause size={16} />}</button></div>
          <div key={step} className="lp-compact-scene"><current.icon size={32} /><h3>{current.heading}</h3><p>{current.detail}</p><ul>{current.lines.map((line, i) => <li key={line} style={{ animationDelay: `${i * 140}ms` }}><CheckCircle2 size={17} />{line}</li>)}</ul></div>
          <div className="lp-compact-dots" aria-hidden="true">{STEPS.map((s, i) => <i key={s.title} className={i === step ? 'on' : ''} />)}</div>
        </div>
      </div>
    </div>
  </section>;
}
export function ProgressAndTrust() {
  return <section className="lp-section lp-compact-trust" id="ai" aria-labelledby="trust-title"><div className="lp-wrap lp-compact-trust-grid">
    <div data-lp-reveal><p className="lp-kicker">Progres & kepercayaan</p><h2 id="trust-title">AI membantu.<br />Dosen tetap memutuskan.</h2><p className="lp-compact-lead">Materi kelas menjadi konteks latihan. Umpan balik AI ditinjau sebelum menjadi nilai resmi.</p><p className="lp-compact-assurance"><ShieldCheck size={20} />Arahan belajar dan penilaian tetap terhubung.</p></div>
    <div className="lp-compact-progress" id="analitik" data-lp-reveal><div className="lp-compact-demo-top"><strong>Perkembangan belajar</strong><span>ILUSTRASI</span></div><p>Kenali bagian yang sudah kuat dan yang perlu dilatih.</p>{[{label:'Tata bahasa',value:74},{label:'Kosakata',value:61},{label:'Menulis',value:85}].map((s,i)=><div className="lp-compact-skill" key={s.label}><span>{s.label}</span><div><i style={{width:`${s.value}%`,animationDelay:`${i*120}ms`}} /></div><b>{s.value}%</b></div>)}<small>Contoh tampilan, bukan data mahasiswa.</small></div>
  </div></section>;
}
