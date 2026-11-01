import type { ReactNode, Ref } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useT } from '@/lib/i18n';
export function StudentActivityHeading({title,headingRef,clockLabel,clockValue,urgent=false}:{title:ReactNode;headingRef?:Ref<HTMLHeadingElement>;clockLabel:string;clockValue:string;urgent?:boolean}){
 return <div className="sc-activity-heading"><h2 ref={headingRef} tabIndex={-1}>{title}</h2><div className={`sc-student-clock ${urgent?'is-urgent':''}`}><span>{clockLabel}</span><strong>{clockValue}</strong></div></div>;
}
export function StudentPreviewNavigation({index,total,onChange}:{index:number;total:number;onChange:(index:number)=>void}){
 const t=useT();return <nav className="sc-preview-navigation" aria-label={t('scheduledPreview.navigation')}><button type="button" disabled={index===0} onClick={()=>onChange(index-1)}><ChevronLeft size={18} aria-hidden="true"/>{t('scheduledPreview.previous')}</button><span>{t('studentClass.step',{index:String(index+1),total:String(total)})}</span><button type="button" disabled={index>=total-1} onClick={()=>onChange(index+1)}>{t('scheduledPreview.next')}<ChevronRight size={18} aria-hidden="true"/></button></nav>;
}
export function StudentPreviewAnswerFooter({onSave,onNext,canNext,disabled=false,actionLabel}:{onSave:()=>void;onNext:()=>void;canNext:boolean;disabled?:boolean;actionLabel?:string}){
 const t=useT();return <div className="sc-answer-footer"><div className="sc-actions"><button type="button" onClick={onSave} disabled={disabled}>{t('studentClass.saveShort')}</button><button type="button" onClick={onNext} className="sc-primary" disabled={disabled}>{actionLabel||t(canNext?'studentClass.nextShort':'studentClass.finishShort')}<ArrowRight size={16} aria-hidden="true"/></button></div></div>;
}
