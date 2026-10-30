import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Compass, MousePointer2, Pause, Play, RotateCcw, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import { guideCopy, pageSteps, type WalkthroughStep } from './workspace-guide-steps';
import '@/styles/workspace-guide.css';

type Box = { x: number; y: number; width: number; height: number };
const DURATION = 6500;
const copy = {
 id: { help: 'Panduan', exit: 'Tutup panduan', back: 'Sebelumnya', next: 'Lanjut', done: 'Selesai', pause: 'Jeda animasi', play: 'Putar otomatis', step: 'LANGKAH', replay: 'Ulangi langkah', live: 'PANDUAN DI HALAMAN INI' },
 en: { help: 'Guide', exit: 'Close guide', back: 'Back', next: 'Next', done: 'Done', pause: 'Pause animation', play: 'Play automatically', step: 'STEP', replay: 'Replay step', live: 'GUIDE ON THIS PAGE' },
 de: { help: 'Hilfe', exit: 'Anleitung schließen', back: 'Zurück', next: 'Weiter', done: 'Fertig', pause: 'Animation pausieren', play: 'Automatisch abspielen', step: 'SCHRITT', replay: 'Schritt wiederholen', live: 'ANLEITUNG AUF DIESER SEITE' },
};
function visibleElement(selector: string): HTMLElement | undefined {
 return [...document.querySelectorAll<HTMLElement>(selector)].find(element => {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < window.innerWidth && getComputedStyle(element).visibility !== 'hidden';
 });
}

export function WorkspaceGuide({ pathname, title, isStudent }: { pathname: string; title: string; isStudent: boolean }) {
 const language = useLanguage();
 const text = copy[language];
 const reducedMotion = useReducedMotion();
 const [open, setOpen] = useState(false);
 const [steps, setSteps] = useState<WalkthroughStep[]>([]);
 const [index, setIndex] = useState(0);
 const [playing, setPlaying] = useState(false);
 const [replay, setReplay] = useState(0);
 const [box, setBox] = useState<Box | null>(null);
 const [viewport, setViewport] = useState({ width: 1024, height: 768 });
 const frame = useRef(0);
 const playback = useRef({ key: '', elapsed: 0 });
 const triggerRef = useRef<HTMLButtonElement>(null);
 const closeRef = useRef<HTMLButtonElement>(null);
 const current = steps[index];
 const start = () => {
  const available = pageSteps(pathname, isStudent).filter(step => visibleElement(step.selector));
  if (!available.length) return;
  playback.current = { key: '', elapsed: 0 }; setSteps(available); setIndex(0); setBox(null); setPlaying(!reducedMotion); setOpen(true);
 };
 useEffect(() => { setOpen(false); }, [pathname]);
 const measure = useCallback(() => {
  if (!current) return;
  const target = visibleElement(current.selector);
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const x = Math.max(6, rect.left - 7), y = Math.max(6, rect.top - 7);
  setBox({ x, y, width: Math.min(window.innerWidth - x - 6, rect.width + 14), height: Math.min(window.innerHeight - y - 6, rect.height + 14) });
  setViewport({ width: window.innerWidth, height: window.innerHeight });
 }, [current]);
 useEffect(() => {
  if (!open || !current) return;
  const target = visibleElement(current.selector);
  if (!target) { setPlaying(false); return; }
  target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion ? 'instant' : 'smooth' });
  measure();
  const update = () => { cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(measure); };
  const observer = new ResizeObserver(update); observer.observe(target);
  window.addEventListener('scroll', update, true); window.addEventListener('resize', update);
  return () => { observer.disconnect(); cancelAnimationFrame(frame.current); window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
 }, [open, current, measure, reducedMotion]);
 useEffect(() => {
  const key = `${index}-${replay}`;
  if (playback.current.key !== key) playback.current = { key, elapsed: 0 };
  if (!open || !playing) return;
  const started = performance.now();
  const timer = window.setTimeout(() => {
   if (index < steps.length - 1) setIndex(i => i + 1);
   else setPlaying(false);
  }, Math.max(0, DURATION - playback.current.elapsed));
  return () => { window.clearTimeout(timer); if (playback.current.key === key) playback.current.elapsed += performance.now() - started; };
 }, [open, playing, index, replay, steps.length]);
 const next = () => index < steps.length - 1 ? setIndex(i => i + 1) : setOpen(false);
 const panelWidth = Math.min(348, viewport.width - 28);
 const panelHeight = 244;
 let panelX = box ? Math.min(viewport.width - panelWidth - 14, Math.max(14, box.x + box.width / 2 - panelWidth / 2)) : 14;
 let panelY = box ? box.y + box.height + 18 : 90;
 if (box && panelY + panelHeight > viewport.height - 14) {
  if (box.y > panelHeight + 28) panelY = box.y - panelHeight - 18;
  else { panelY = Math.max(14, Math.min(viewport.height - panelHeight - 14, box.y)); panelX = box.x + box.width + panelWidth + 30 < viewport.width ? box.x + box.width + 18 : Math.max(14, box.x - panelWidth - 18); }
 }
 panelY = Math.max(14, Math.min(viewport.height - panelHeight - 14, panelY));
 const cursorX = box ? box.x + Math.min(box.width - 14, Math.max(22, box.width * .72)) : 0;
 const cursorY = box ? box.y + Math.min(box.height - 14, Math.max(18, box.height * .55)) : 0;
 const transition = reducedMotion ? { duration: 0 } : { duration: .75, ease: [.22, 1, .36, 1] as const };
 return <Dialog.Root open={open} onOpenChange={setOpen}>
  <button ref={triggerRef} type="button" className="workspace-guide-trigger" onClick={start} aria-expanded={open} aria-haspopup="dialog" aria-label={`${text.help}: ${title}`}><Compass size={16} aria-hidden /><span>{text.help}</span></button>
  {open && current && <Dialog.Portal>
   <Dialog.Overlay className="wg-overlay" />
   {box && <>
    <motion.div className="wg-spotlight" data-playing={playing} aria-hidden initial={false} animate={{ left: box.x, top: box.y, width: box.width, height: box.height }} transition={transition}><div className={`wg-target-motion gesture-${current.gesture}`} key={`${index}-${replay}`} /></motion.div>
    <motion.div className="wg-pointer" data-playing={playing} aria-hidden initial={{ opacity: 0 }} animate={{ x: cursorX, y: cursorY, opacity: 1 }} transition={transition}><div className="wg-pointer-tap" key={`${index}-${replay}`}><span /><MousePointer2 size={29} fill="white" strokeWidth={1.7} /></div></motion.div>
   </>}
   <Dialog.Content asChild onOpenAutoFocus={event => { event.preventDefault(); closeRef.current?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); triggerRef.current?.focus(); }}>
    <motion.section className="wg-coach" initial={{ opacity: 0 }} animate={{ left: panelX, top: panelY, opacity: 1 }} transition={transition} style={{ width: panelWidth }}>
     <div className="wg-coach-top"><span><Compass size={13} />{text.live}</span><Dialog.Close ref={closeRef} className="wg-icon-button" aria-label={text.exit}><X size={16} /></Dialog.Close></div>
     <div className="wg-step-count">{text.step} {index + 1} / {steps.length} <span>{title}</span></div>
     <div className="wg-copy" key={`${index}-${replay}`}><Dialog.Title>{guideCopy(current.title, language)}</Dialog.Title><Dialog.Description>{guideCopy(current.body, language)}</Dialog.Description></div>
     <div className="wg-timeline" aria-hidden>{steps.map((_, i) => <span key={i} className={i < index ? 'complete' : i === index ? 'current' : ''}>{i === index && <i key={`${index}-${replay}`} style={{ animationDuration: `${DURATION}ms`, animationPlayState: playing ? 'running' : 'paused' }} className="running" />}</span>)}</div>
     <div className="wg-controls"><div><button type="button" className="wg-icon-button" aria-label={playing ? text.pause : text.play} onClick={() => { if (!playing && playback.current.elapsed >= DURATION) setReplay(r => r + 1); setPlaying(p => !p); }}>{playing ? <Pause size={15} /> : <Play size={15} />}</button><button type="button" className="wg-icon-button" aria-label={text.replay} onClick={() => { setReplay(r => r + 1); setPlaying(!reducedMotion); }}><RotateCcw size={15} /></button></div><div><button type="button" className="wg-back" disabled={index === 0} aria-label={text.back} onClick={() => setIndex(i => i - 1)}><ArrowLeft size={15} /></button><button type="button" className="wg-next" onClick={next}>{index === steps.length - 1 ? text.done : text.next}<ArrowRight size={14} /></button></div></div>
    </motion.section>
   </Dialog.Content>
  </Dialog.Portal>}
 </Dialog.Root>;
}
