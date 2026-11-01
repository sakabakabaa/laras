import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Link} from 'react-router';
import {ChevronDown,Eye} from 'lucide-react';
import {useT} from '@/lib/i18n';
import '@/styles/student-preview-dock.css';

export function StudentPreviewDock({toolsVisible,onToggleTools,exitTo}:{toolsVisible:boolean;onToggleTools:()=>void;exitTo:string}){
 const t=useT(),menu=useRef<HTMLDetailsElement>(null);
 const [host,setHost]=useState<HTMLElement|null>(null);
 useEffect(()=>{setHost(document.getElementById('student-preview-dock'));const dismiss=(event:globalThis.PointerEvent)=>{if(menu.current&&!menu.current.contains(event.target as Node))menu.current.open=false;};document.addEventListener('pointerdown',dismiss);return()=>document.removeEventListener('pointerdown',dismiss);},[]);
 const close=()=>{if(menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus();}};
 const dock=<details ref={menu} className="student-preview-dock" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();close();}}}>
  <summary aria-label={t('scheduledPreview.title')}><Eye size={16} aria-hidden="true"/><span>{t('scheduledPreview.shortTitle')}</span><ChevronDown size={14} aria-hidden="true"/></summary>
  <div className="student-preview-menu"><strong>{t('scheduledPreview.title')}</strong><button type="button" aria-expanded={toolsVisible} onClick={()=>{onToggleTools();close();}}>{t(toolsVisible?'scheduledPreview.hideTools':'scheduledPreview.showTools')}</button><Link to={exitTo}>{t('scheduledPreview.exit')}</Link></div>
 </details>;
 return host?createPortal(dock,host):dock;
}
