import {useEffect,useId,useState} from 'react';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import pb from '@/lib/pocketbase-client';
import {useT} from '@/lib/i18n';
import type {ScheduledActivity,ScheduledWorksheet} from '@/lib/scheduled-classes';
import {singleGap,worksheetBlocks,writingRows} from '@/lib/worksheet-layout';
import {cardMatchingTargets} from '@/lib/card-matching';
import {ScheduledCardMatching} from './scheduled-card-matching';
import {PDFPreview} from './task-builders/quiz-source-builder';

export function WorksheetAnswers({sheet,responses,onChange,activity}:{sheet:ScheduledWorksheet;activity?:ScheduledActivity;responses:Record<string,string>;onChange:(value:Record<string,string>)=>void}){
  const t=useT(),group=useId(),targets=activity?cardMatchingTargets(activity):[];
  const answered=sheet.items.filter(item=>{const value=responses[item.id]||'';return item.type==='select'?item.options?.includes(value):Boolean(value.trim());}).length;
  const progress=<header className="sc-answer-sheet-heading"><h3>{t('worksheet.answerSheet')}</h3><span role="status">{t('worksheet.responseProgress',{answered:String(answered),total:String(sheet.items.length)})}</span></header>;
  const paired=sheet.items.length>1&&sheet.items.every((item,i)=>item.type==='text'&&item.prompt.match(/^([0-9]+)([ab])\./)?.[0]===`${Math.floor(i/2)+1}${i%2?'b':'a'}.`);
  if(targets.length)return <>{progress}<p className="sl-translation">{activity?.lesson?.source?.sourceLabel||sheet.sourceLabel}</p><ScheduledCardMatching key={activity!.id} sheet={sheet} targets={targets} responses={responses} onChange={onChange}/></>;
  const prompt=(item:ScheduledWorksheet['items'][number])=><><span lang="de">{item.prompt}</span>{item.translation&&<span className="sl-translation" lang="id">{item.translation}</span>}</>;
  const gapInput=(item:ScheduledWorksheet['items'][number],number?:string)=><input className="sc-gap-input" type="text" aria-label={number?`Lücke ${number}: ${item.prompt}`:item.prompt} autoComplete="off" maxLength={2000} value={responses[item.id]||''} onChange={e=>onChange({...responses,[item.id]:e.target.value})}/>;
  return <div className={`sc-worksheet ${paired?'sc-worksheet-paired':''}`}>{progress}<ol>{worksheetBlocks(sheet.items).map(block=>{
    const item=block.items[0];
    if(block.context&&block.gaps)return <li key={item.id} className="sc-gap-paragraph"><strong className="sc-gap-section">{block.section}</strong><p lang="de">{block.context.split(/(\(\d+\)\s*_{3,})/g).map((part,i)=>{
      const number=part.match(/^\((\d+)\)\s*_{3,}$/)?.[1],gap=block.gaps!.find(g=>g.number===number);
      return gap?<span key={i} className="sc-inline-gap"><span>({number}) </span>{gapInput(gap.item,number)}</span>:part;
    })}</p></li>;
    return <li key={item.id} className={writingRows(item)>3?'sc-writing-long':undefined}>{item.type==='select'?<fieldset className="sc-worksheet-choice"><legend>{prompt(item)}</legend><div className="sc-worksheet-options">{item.options?.map(option=><label key={option} className="sc-option"><input type="radio" name={`${group}-${item.id}`} value={option} checked={responses[item.id]===option} onChange={()=>onChange({...responses,[item.id]:option})}/><span>{option}</span></label>)}</div></fieldset>:singleGap(item)?<p className="sc-gap-sentence" lang="de">{item.prompt.split(/_{3,}/).map((part,i)=><span key={i}>{i>0&&gapInput(item)}{part}</span>)}</p>:<label><span className="sc-question-number">{sheet.items.indexOf(item)+1}</span>{prompt(item)}<textarea rows={writingRows(item)} maxLength={2000} value={responses[item.id]||''} onChange={e=>onChange({...responses,[item.id]:e.target.value})}/><span className="sc-character-count">{t('worksheet.characters',{count:String((responses[item.id]||'').length)})}</span></label>}</li>;
  })}</ol></div>;
}

export function WorksheetSource({activity,showPictures=true}:{activity:ScheduledActivity;showPictures?:boolean}){
  const reference=activity.lesson?.source||(activity.worksheet?.sourceMaterialId?activity.worksheet:undefined);
  const sources=(activity.sources||[]).map(source=>({...source,url:source.url||(source.filename&&source.id?`/hcgi/platform/api/files/file_library/${source.id}/${encodeURIComponent(source.filename)}`:undefined)}));
  const t=useT(),source=sources.find(s=>s.id===reference?.sourceMaterialId&&s.available&&s.url),page=reference?.sourcePage;
  const [document,setDocument]=useState<PDFDocumentProxy|null>(null),[error,setError]=useState(false);
  useEffect(()=>{
    if(!source?.url||!page||!source.url.toLowerCase().endsWith('.pdf'))return;
    let cancelled=false,task:ReturnType<typeof import('pdfjs-dist')['getDocument']>|undefined;
    setError(false);setDocument(null);
    void import('pdfjs-dist').then(pdf=>{if(cancelled)return;pdf.GlobalWorkerOptions.workerSrc=workerUrl;task=pdf.getDocument({url:source.url!,httpHeaders:{Authorization:pb.authStore.token}});return task.promise;}).then(doc=>{if(!cancelled&&doc){if(page>doc.numPages){setError(true);return;}setDocument(doc);}}).catch(()=>{if(!cancelled)setError(true);});
    return()=>{cancelled=true;void task?.destroy();};
  },[source?.url,page]);
  if(cardMatchingTargets(activity).length)return null;
  // Reference material only exists to answer something: with no answer sheet on the
  // activity there is nothing to reference, so neither the picture gallery nor the
  // PDF page belongs on the page (e.g. the check-in/orientation activity).
  if(!activity.worksheet)return null;
  const images=sources.filter(s=>s.available&&s.url&&/\.(jpe?g|png|webp)$/i.test(s.url));
  if(showPictures&&reference?.sourceMaterialId&&images.some(image=>image.id===reference.sourceMaterialId)){
    return <section className="sc-picture-reference" aria-label="Bilder · Gambar"><h3>Bilder · Gambar</h3>{reference.sourceLabel&&<p className="sl-translation">{reference.sourceLabel}</p>}<div className="sc-patient-figures" style={images.length===2?{gridTemplateColumns:'repeat(2,minmax(0,1fr))'}:undefined}>{images.map((image,i)=><figure key={image.id||i}><a href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={image.title} loading="lazy"/></a><figcaption>{image.title.match(/Bild ([ABC])/i)?.[1]||image.title}</figcaption></figure>)}</div></section>;
  }
  if(!source?.url||!page)return null;
  return <details className="sc-worksheet-source" open={Boolean(activity.worksheet?.sourceMaterialId)}><summary>{t('worksheet.page',{page:String(page)})}{reference?.sourceLabel&&` · ${reference.sourceLabel}`}</summary>{document?<PDFPreview document={document} page={page}/>:<p role={error?'alert':'status'}>{t(error?'quizSource.previewFailed':'worksheet.loading')}</p>}<a href={`${source.url}#page=${page}`} target="_blank" rel="noreferrer">{source.title} · {t('studentClass.openMaterial')}</a></details>;
}

export function WorksheetEditor({value,onChange,materials}:{value?:ScheduledWorksheet;onChange:(sheet:ScheduledWorksheet|undefined)=>void;materials:{id:string;title:string}[]}){
  const t=useT(),sheet=value;
  return <section className="sc-worksheet-editor"><label className="sc-check"><input type="checkbox" checked={Boolean(sheet)} onChange={e=>onChange(e.target.checked?{items:[{id:crypto.randomUUID(),prompt:'',type:'text'}]}:undefined)}/>{t('worksheet.enable')}</label>{sheet&&<>
    <p>{t('worksheet.reviewHint')}</p><div className="sc-grid"><label>{t('worksheet.source')}<select value={sheet.sourceMaterialId||''} onChange={e=>onChange({...sheet,sourceMaterialId:e.target.value||undefined,sourcePage:e.target.value?(sheet.sourcePage||1):undefined})}><option value="">—</option>{materials.map(m=><option key={m.id} value={m.id}>{m.title}</option>)}</select></label>{sheet.sourceMaterialId&&<><label>{t('worksheet.pageNumber')}<input type="number" min={1} max={10000} value={sheet.sourcePage||1} onChange={e=>onChange({...sheet,sourcePage:Number(e.target.value)})}/></label><label>{t('worksheet.sourceLabel')}<input maxLength={160} value={sheet.sourceLabel||''} onChange={e=>onChange({...sheet,sourceLabel:e.target.value})}/></label></>}</div>
    {sheet.items.map((item,i)=><fieldset key={item.id}><legend>{t('worksheet.item',{number:String(i+1)})}</legend><label>{t('worksheet.prompt')}<textarea rows={2} maxLength={1000} value={item.prompt} onChange={e=>onChange({...sheet,items:sheet.items.map((s,n)=>n===i?{...s,prompt:e.target.value}:s)})}/></label><label>{t('worksheet.type')}<select value={item.type} onChange={e=>onChange({...sheet,items:sheet.items.map((s,n)=>n===i?{...s,type:e.target.value as 'select'|'text',options:e.target.value==='select'?['A','B','C']:undefined}:s)})}><option value="text">{t('worksheet.text')}</option><option value="select">{t('worksheet.select')}</option></select></label>{item.type==='select'&&<label>{t('worksheet.options')}<textarea rows={3} value={item.options?.join('\n')||''} onChange={e=>onChange({...sheet,items:sheet.items.map((s,n)=>n===i?{...s,options:e.target.value.split('\n')}:s)})}/></label>}<button type="button" disabled={sheet.items.length===1} onClick={()=>onChange({...sheet,items:sheet.items.filter((_,n)=>n!==i)})}>{t('worksheet.remove')}</button></fieldset>)}
    <button type="button" disabled={sheet.items.length>=30} onClick={()=>onChange({...sheet,items:[...sheet.items,{id:crypto.randomUUID(),prompt:'',type:'text'}]})}>{t('worksheet.add')}</button>
  </>}</section>;
}
