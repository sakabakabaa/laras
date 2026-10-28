import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Clipboard,FileUp,LoaderCircle,Search,Sparkles,X} from 'lucide-react';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import pb from '@/lib/pocketbase-client';
import {useT} from '@/lib/i18n';
import type {FileLibraryRecord} from '@/lib/learning';
import type {QuizQuestionEditable} from '@/lib/task-types';
import {QUIZ_SOURCE_LIMITS as LIMITS,parseQuizPageRange,type QuizSourcePage,type QuizSourceQuestion,type QuizSourceMode} from '@/lib/quiz-source';
import '@/styles/quiz-source.css';

type ImagePage={page:number;file:File;preview:string};
const supported=/\.(pdf|png|jpe?g|webp)$/i;
export function PDFPreview({document,page}:{document:PDFDocumentProxy;page:number}){
  const canvas=useRef<HTMLCanvasElement>(null),[error,setError]=useState(false);
  useEffect(()=>{
    let cancelled=false,task:ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']>|undefined;
    setError(false);
    void document.getPage(page).then(async p=>{if(cancelled||!canvas.current)return;const initial=p.getViewport({scale:1}),viewport=p.getViewport({scale:Math.min(1.6,860/initial.width)});canvas.current.width=viewport.width;canvas.current.height=viewport.height;task=p.render({canvas:canvas.current,viewport});await task.promise;}).catch(()=>{if(!cancelled)setError(true);});
    return()=>{cancelled=true;task?.cancel();};
  },[document,page]);
  const t=useT();
  return <div className="quiz-source-pdf-preview">{error?<p role="alert">{t('quizSource.previewFailed')}</p>:<canvas ref={canvas} role="img" aria-label={t('quizSource.page',{page:String(page)})}/>}</div>;
}
async function jpegFile(canvas:HTMLCanvasElement,name:string):Promise<File>{
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('quizSource.badFile')),'image/jpeg',.88));
  if(blob.size>LIMITS.imageBytes)throw Error('quizSource.imageLimit');
  return new File([blob],name,{type:'image/jpeg'});
}
async function prepareImage(file:File,page:number):Promise<ImagePage>{
  const bitmap=await createImageBitmap(file);
  try{const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const context=canvas.getContext('2d');if(!context)throw Error('quizSource.badFile');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);return{page,file:await jpegFile(canvas,'image-'+page+'.jpg'),preview:canvas.toDataURL('image/jpeg',.8)};}finally{bitmap.close();}
}
export function QuizSourceBuilder({courseId,existingCount,onApply}:{courseId:string;existingCount:number;onApply:(questions:QuizQuestionEditable[],mode:'append'|'replace')=>void}){
  const t=useT(),input=useRef<HTMLInputElement>(null),docRef=useRef<PDFDocumentProxy|null>(null),loadingRef=useRef<{destroy:()=>Promise<void>}|null>(null),controller=useRef<AbortController|null>(null),epoch=useRef(0);
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState(''),[status,setStatus]=useState('');
  const [library,setLibrary]=useState<FileLibraryRecord[]>([]),[librarySearch,setLibrarySearch]=useState(''),[libraryId,setLibraryId]=useState('');
  const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[images,setImages]=useState<ImagePage[]>([]),[sourceName,setSourceName]=useState('');
  const [current,setCurrent]=useState(1),[selection,setSelection]=useState<number[]>([]),[range,setRange]=useState('1'),[forceOcr,setForceOcr]=useState(false);
  const [parsed,setParsed]=useState<QuizSourcePage[]>([]),[reviewed,setReviewed]=useState(false);
  const [mode,setMode]=useState<QuizSourceMode>('generate'),[count,setCount]=useState(5),[language,setLanguage]=useState('source'),[instruction,setInstruction]=useState('');
  const [questions,setQuestions]=useState<QuizSourceQuestion[]>([]),[chosen,setChosen]=useState<string[]>([]),[keysReviewed,setKeysReviewed]=useState(false),[applied,setApplied]=useState(false),[applyMode,setApplyMode]=useState<'append'|'replace'>('append');
  const readable=parsed.filter(p=>p.text.trim().length>=20);
  useEffect(()=>()=>{epoch.current++;controller.current?.abort();void loadingRef.current?.destroy();void docRef.current?.destroy();},[]);
  useEffect(()=>{
    if(!open||!courseId)return;
    let active=true;
    void pb.collection('file_library').getFullList<FileLibraryRecord>({filter:pb.filter('course~{:c} && owner={:u}',{c:courseId,u:pb.authStore.record?.id}),fields:'id,collectionId,collectionName,title,file,version,access,course',sort:'title',requestKey:null}).then(files=>{if(active)setLibrary(files.filter(f=>supported.test(f.file)));}).catch(()=>{if(active)setError('quizSource.libraryFailed');});
    return()=>{active=false;};
  },[open,courseId]);
  function clearDraft(){setParsed([]);setQuestions([]);setReviewed(false);setKeysReviewed(false);setApplied(false);setStatus('');}
  function cancel(){epoch.current++;controller.current?.abort();setBusy('');setStatus('quizSource.cancelled');}
  async function loadFiles(files:File[],append=false,label?:string){
    if(!files.length)return;
    let id=epoch.current;
    try{
      if(files.some(f=>f.size>LIMITS.fileBytes)||files.some(f=>!supported.test(f.name)))throw Error('quizSource.badFile');
      const isPdf=files.length===1&&/\.pdf$/i.test(files[0].name);
      if(!isPdf&&(files.some(f=>/\.pdf$/i.test(f.name))||files.length+(append&&!pdf?images.length:0)>LIMITS.pages))throw Error('quizSource.pageLimit');
      epoch.current++;id=epoch.current;controller.current?.abort();void loadingRef.current?.destroy();void docRef.current?.destroy();docRef.current=null;setPdf(null);setError('');setBusy('quizSource.loading');clearDraft();
      if(isPdf){
        setImages([]);const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc=workerUrl;
        const task=pdfjs.getDocument({data:new Uint8Array(await files[0].arrayBuffer()),isEvalSupported:false});loadingRef.current=task;
        const document=await task.promise;if(epoch.current!==id){await document.destroy();return;}docRef.current=document;loadingRef.current=null;setPdf(document);setCurrent(1);setSelection([1]);setRange('1');setSourceName(label||files[0].name);
      }else{
        const previous=append&&!pdf?images:[],next=[...previous];
        for(const file of files)next.push(await prepareImage(file,(next.at(-1)?.page||0)+1));
        if(epoch.current!==id)return;setImages(next);setSelection([]);setSourceName(label||(next.length===1?files[0].name:t('quizSource.imageBatch',{count:String(next.length)})));
      }
      if(epoch.current===id)setBusy('');
    }catch(e){if(epoch.current===id){setError(e instanceof Error&&e.message.startsWith('quizSource.')?e.message:'quizSource.badFile');setBusy('');}}
  }
  async function pasteImage(){
    try{if(!navigator.clipboard?.read)throw Error('quizSource.pasteHint');const items=await navigator.clipboard.read(),files:File[]=[];for(const item of items){const type=item.types.find(t=>['image/png','image/jpeg','image/webp'].includes(t));if(type){const blob=await item.getType(type);files.push(new File([blob],'pasted-image.'+(type==='image/jpeg'?'jpg':type.split('/')[1]),{type}));}}if(!files.length)throw Error('quizSource.pasteHint');await loadFiles(files,true);}catch{setError('quizSource.pasteHint');}
  }
  async function openLibrary(){
    const file=library.find(f=>f.id===libraryId);if(!file)return;
    setBusy('quizSource.loading');setError('');const abort=new AbortController();controller.current=abort;
    try{const response=await fetch(pb.files.getURL(file,file.file),{headers:{Authorization:pb.authStore.token},signal:abort.signal});if(!response.ok||Number(response.headers.get('content-length')||0)>LIMITS.fileBytes)throw Error('quizSource.badFile');const blob=await response.blob();await loadFiles([new File([blob],file.file,{type:blob.type})],false,file.title||file.file);}catch(e){if(!abort.signal.aborted)setError(e instanceof Error&&e.message.startsWith('quizSource.')?e.message:'quizSource.badFile');setBusy('');}
  }
  async function request(body:FormData|Record<string,unknown>){
    const abort=new AbortController();controller.current=abort;const timer=setTimeout(()=>abort.abort(),150000);
    try{const response=await fetch('/api/quiz-source',{method:'POST',headers:{Authorization:'Bearer '+pb.authStore.token,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:JSON.stringify(body),signal:abort.signal});const data=await response.json();if(!response.ok)throw Error(typeof data.error==='string'?data.error:'quizSource.requestFailed');return data;}finally{clearTimeout(timer);}
  }
  async function parse(){
    const id=epoch.current;setBusy('quizSource.parsing');setError('');clearDraft();
    try{
      const form=new FormData();form.set('courseId',courseId);const pages:{page:number;text?:string;ocr?:boolean}[]=[];
      if(pdf){for(const number of selection){const p=await pdf.getPage(number);const content=await p.getTextContent();const text=content.items.map(item=>'str'in item?item.str+('hasEOL'in item&&item.hasEOL?'\n':' '):'').join('').trim().slice(0,LIMITS.pageChars*2);pages.push({page:number,text,ocr:forceOcr});if(text.length<40||forceOcr){const initial=p.getViewport({scale:1}),viewport=p.getViewport({scale:Math.min(2.5,1800/Math.max(initial.width,initial.height))}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await p.render({canvas,viewport}).promise;form.set('page-'+number,await jpegFile(canvas,'page-'+number+'.jpg'));}}}
      else{for(const image of images){pages.push({page:image.page,ocr:true});form.set('page-'+image.page,image.file);}}
      if(epoch.current!==id)return;form.set('pages',JSON.stringify(pages));const data=await request(form);if(epoch.current===id)setParsed(data.pages);
    }catch(e){if(epoch.current===id)setError(e instanceof Error&&e.message.startsWith('quizSource.')?e.message:'quizSource.requestFailed');}finally{if(epoch.current===id)setBusy('');}
  }
  async function generate(){
    const id=epoch.current;setBusy('quizSource.generating');setError('');setQuestions([]);setKeysReviewed(false);setApplied(false);
    try{const data=await request({action:'generate',courseId,pages:readable,reviewed,count,mode,language,instruction});if(epoch.current===id){setQuestions(data.questions);setChosen(data.questions.map((q:QuizSourceQuestion)=>q.id));}}catch(e){if(epoch.current===id)setError(e instanceof Error&&e.message.startsWith('quizSource.')?e.message:'quizSource.requestFailed');}finally{if(epoch.current===id)setBusy('');}
  }
  function apply(){
    const selected=questions.filter(q=>chosen.includes(q.id));
    onApply(selected.map(({sourcePage,sourceQuote:_,...q})=>({...q,explanation:[q.explanation,t('quizSource.reference',{file:sourceName.slice(0,150),page:String(sourcePage)})].filter(Boolean).join('\n\n').slice(0,2000)})),applyMode);
    setApplied(true);setStatus('quizSource.applied');
  }
  const sourcePresent=Boolean(pdf||images.length);
  return <details className="quiz-source" open={open} onToggle={e=>setOpen(e.currentTarget.open)} onPaste={e=>{const files=Array.from(e.clipboardData.files).filter(f=>f.type.startsWith('image/'));if(files.length&&!busy){e.preventDefault();void loadFiles(files,true);}}}>
    <summary><Sparkles size={17} aria-hidden="true"/>{t('quizSource.title')}</summary>
    {open&&<div className="quiz-source-body">
      <p>{t('quizSource.description')}</p>
      {!courseId?<p role="status">{t('quizSource.chooseCourse')}</p>:<>
        {error&&<p className="quiz-source-alert" role="alert">{t(error)}</p>}{status&&<p role="status">{t(status)}</p>}
        <fieldset disabled={Boolean(busy)} className="quiz-source-controls">
          <div className="quiz-source-upload" tabIndex={0} role="group" aria-label={t('quizSource.uploadArea')} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)void loadFiles(Array.from(e.dataTransfer.files));}}>
            <FileUp size={24} aria-hidden="true"/><strong>{t('quizSource.uploadArea')}</strong><span>{t('quizSource.fileHint')}</span>
            <input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" multiple hidden onChange={e=>{void loadFiles(Array.from(e.target.files||[]));e.target.value='';}}/>
            <div className="quiz-source-actions"><button type="button" onClick={()=>input.current?.click()}>{t('quizSource.upload')}</button><button type="button" onClick={()=>void pasteImage()}><Clipboard size={15} aria-hidden="true"/>{t('quizSource.paste')}</button></div>
          </div>
          <details className="quiz-source-library"><summary>{t('quizSource.library')}</summary><label><span><Search size={14} aria-hidden="true"/>{t('quizSource.librarySearch')}</span><input type="search" value={librarySearch} onChange={e=>setLibrarySearch(e.target.value)}/></label><label>{t('quizSource.libraryFile')}<select value={libraryId} onChange={e=>setLibraryId(e.target.value)}><option value="">{t('quizSource.selectFile')}</option>{library.filter(f=>f.title.toLocaleLowerCase().includes(librarySearch.toLocaleLowerCase())).map(f=><option key={f.id} value={f.id}>{f.title||f.file}</option>)}</select></label><button type="button" disabled={!libraryId} onClick={()=>void openLibrary()}>{t('quizSource.openFile')}</button></details>
          {sourcePresent&&<section className="quiz-source-selection"><h4>{sourceName}</h4>
            {pdf?<>
              <div className="quiz-source-page-nav"><button type="button" disabled={current<=1} aria-label={t('quizSource.previous')} onClick={()=>setCurrent(p=>p-1)}><ChevronLeft size={17}/></button><label>{t('quizSource.pageNumber')}<input type="number" min={1} max={pdf.numPages} value={current} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=1&&n<=pdf.numPages)setCurrent(n);}}/></label><span>/ {pdf.numPages}</span><button type="button" disabled={current>=pdf.numPages} aria-label={t('quizSource.next')} onClick={()=>setCurrent(p=>p+1)}><ChevronRight size={17}/></button><button type="button" disabled={!selection.includes(current)&&selection.length>=LIMITS.pages} aria-pressed={selection.includes(current)} onClick={()=>{setSelection(s=>s.includes(current)?s.filter(n=>n!==current):[...s,current].sort((a,b)=>a-b));clearDraft();}}>{t(selection.includes(current)?'quizSource.deselectPage':'quizSource.selectPage')}</button></div>
              <PDFPreview document={pdf} page={current}/>
              <div className="quiz-source-range"><label>{t('quizSource.pageRange')}<input value={range} placeholder="2, 4-5" onChange={e=>setRange(e.target.value)}/></label><button type="button" onClick={()=>{try{setSelection(parseQuizPageRange(range,pdf.numPages));setError('');clearDraft();}catch(e){setError(e instanceof Error?e.message:'quizSource.badPages');}}}>{t('quizSource.usePages')}</button></div>
              <p>{t('quizSource.selectedPages',{pages:selection.join(', ')||'—'})}</p><label className="quiz-source-check"><input type="checkbox" checked={forceOcr} onChange={e=>{setForceOcr(e.target.checked);clearDraft();}}/>{t('quizSource.forceOcr')}</label>
            </>:<div className="quiz-source-images">{images.map(image=><figure key={image.page}><img src={image.preview} alt={t('quizSource.page',{page:String(image.page)})}/><figcaption>{t('quizSource.page',{page:String(image.page)})}<button type="button" aria-label={t('quizSource.removePage',{page:String(image.page)})} onClick={()=>{setImages(v=>v.filter(p=>p.page!==image.page));clearDraft();}}><X size={15}/></button></figcaption></figure>)}</div>}
            <button className="quiz-source-primary" type="button" disabled={Boolean(pdf&&!selection.length)} onClick={()=>void parse()}>{t('quizSource.parse')}</button>
          </section>}
          {parsed.length>0&&<section className="quiz-source-review"><h4>{t('quizSource.reviewText')}</h4><p>{t('quizSource.reviewHint')}</p>{parsed.map(page=><label key={page.page}>{t('quizSource.page',{page:String(page.page)})} · {page.method==='ocr'?'OCR':t('quizSource.nativeText')}{page.truncated&&<small>{t('quizSource.truncated')}</small>}<textarea rows={5} maxLength={LIMITS.pageChars} value={page.text} onChange={e=>{setParsed(v=>v.map(p=>p.page===page.page?{...p,text:e.target.value}:p));setReviewed(false);setQuestions([]);setApplied(false);}}/>{page.text.trim().length<20&&<small>{t('quizSource.noText')}</small>}</label>)}
            <label className="quiz-source-check"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>{t('quizSource.reviewedText')}</label>
            <div className="quiz-source-options"><label>{t('quizSource.mode')}<select value={mode} onChange={e=>{setMode(e.target.value as QuizSourceMode);setQuestions([]);}}><option value="generate">{t('quizSource.createMode')}</option><option value="import">{t('quizSource.importMode')}</option></select></label><label>{t('quizSource.count')}<input type="number" min={1} max={LIMITS.questions} value={count} onChange={e=>setCount(Number(e.target.value))}/></label><label>{t('quizSource.language')}<select value={language} onChange={e=>setLanguage(e.target.value)}><option value="source">{t('quizSource.originalLanguage')}</option><option value="id">Bahasa Indonesia</option><option value="en">English</option><option value="de">Deutsch</option></select></label></div>
            <label>{t('quizSource.instruction')}<textarea rows={2} maxLength={800} value={instruction} onChange={e=>setInstruction(e.target.value)}/></label>
            <button className="quiz-source-primary" type="button" disabled={!reviewed||!readable.length||count<1||count>LIMITS.questions} onClick={()=>void generate()}><Sparkles size={16}/>{t('quizSource.generate')}</button>
          </section>}
          {questions.length>0&&<section className="quiz-source-proposal"><h4>{t('quizSource.reviewQuestions')}</h4><p>{t('quizSource.keysHint')}</p>{questions.map((q,i)=><article key={q.id}><label className="quiz-source-check"><input type="checkbox" checked={chosen.includes(q.id)} onChange={e=>setChosen(v=>e.target.checked?[...v,q.id]:v.filter(id=>id!==q.id))}/><strong>{i+1}. {q.text}</strong></label><ol type="A">{q.options.map((option,n)=><li key={n}>{option}{q.correctIndex===n&&<span className="quiz-source-key">{t('quizSource.suggestedKey')}</span>}</li>)}</ol>{q.correctIndex<0&&<p>{t('quizSource.missingKey')}</p>}<p>{q.explanation}</p><details><summary>{t('quizSource.evidence',{page:String(q.sourcePage)})}</summary><blockquote>{q.sourceQuote}</blockquote></details></article>)}
            <label className="quiz-source-check"><input type="checkbox" checked={keysReviewed} onChange={e=>setKeysReviewed(e.target.checked)}/>{t('quizSource.reviewedKeys')}</label>
            {existingCount>0&&<label>{t('quizSource.applyMode')}<select value={applyMode} onChange={e=>setApplyMode(e.target.value as 'append'|'replace')}><option value="append">{t('quizSource.append')}</option><option value="replace">{t('quizSource.replace')}</option></select></label>}
            <button className="quiz-source-primary" type="button" disabled={!keysReviewed||!chosen.length||applied} onClick={apply}>{t(applied?'quizSource.applied':'quizSource.apply',{count:String(chosen.length)})}</button>
          </section>}
        </fieldset>
        {busy&&<div className="quiz-source-progress" role="status"><LoaderCircle size={17} className="spin"/>{t(busy)}<button type="button" onClick={cancel}>{t('quizSource.cancel')}</button></div>}
      </>}
    </div>}
  </details>;
}
