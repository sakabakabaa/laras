import type {QuizQuestionEditable} from './task-types';

export const QUIZ_SOURCE_LIMITS = {pages:4, fileBytes:20*1024*1024, imageBytes:3*1024*1024, pageChars:8000, totalChars:24000, questions:10};
export type QuizSourcePage = {page:number; text:string; method:'text'|'ocr'; truncated?:boolean};
export type QuizSourceQuestion = QuizQuestionEditable & {sourcePage:number; sourceQuote:string};
export type QuizSourceMode = 'generate'|'import';
export class QuizSourceError extends Error {
  constructor(message:string, public status=422){super(message);}
}
export function parseQuizPageRange(raw:string,total:number):number[]{
  const pages=new Set<number>();
  for(const part of raw.split(',')){
    const m=/^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(part);
    if(!m)throw new QuizSourceError('quizSource.badPages');
    const start=Number(m[1]),end=Number(m[2]||m[1]);
    if(start<1||end<start||end>total||end-start>=QUIZ_SOURCE_LIMITS.pages)throw new QuizSourceError('quizSource.badPages');
    for(let n=start;n<=end;n++)pages.add(n);
    if(pages.size>QUIZ_SOURCE_LIMITS.pages)throw new QuizSourceError('quizSource.pageLimit');
  }
  return [...pages].sort((a,b)=>a-b);
}
export function validateQuizSourcePages(raw:unknown):QuizSourcePage[]{
  if(!Array.isArray(raw)||!raw.length||raw.length>QUIZ_SOURCE_LIMITS.pages)throw new QuizSourceError('quizSource.pageLimit');
  const seen=new Set<number>();let chars=0;
  return raw.map(item=>{
    if(!item||!Number.isInteger(item.page)||item.page<1||item.page>10000||seen.has(item.page)||typeof item.text!=='string'||item.text.trim().length<20||item.text.length>QUIZ_SOURCE_LIMITS.pageChars)throw new QuizSourceError('quizSource.badText');
    seen.add(item.page);chars+=item.text.length;if(chars>QUIZ_SOURCE_LIMITS.totalChars)throw new QuizSourceError('quizSource.textLimit');
    return {page:item.page,text:item.text.trim(),method:item.method==='ocr'?'ocr':'text'};
  });
}
const normalized=(s:string)=>s.normalize('NFKC').replace(/\s+/g,' ').trim();
/** A draft must cite a supplied page and a real quotation; keys remain suggestions. */
export function validateSourceQuiz(raw:unknown,pages:QuizSourcePage[],count:number,mode:QuizSourceMode):Omit<QuizSourceQuestion,'id'>[]{
  const value=raw as {questions?:unknown[]};
  if(!Array.isArray(value?.questions)||!value.questions.length||value.questions.length>count)throw new QuizSourceError('quizSource.invalidDraft',502);
  return value.questions.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw new QuizSourceError('quizSource.invalidDraft',502);
    const q=item as Record<string,unknown>;
    const source=pages.find(p=>p.page===q.sourcePage);
    const quote=typeof q.sourceQuote==='string'?q.sourceQuote.trim():'';
    if(!source||quote.length<12||quote.length>800||!normalized(source.text).includes(normalized(quote)))throw new QuizSourceError('quizSource.invalidEvidence',502);
    if(typeof q.text!=='string'||!q.text.trim()||q.text.length>2000||!Array.isArray(q.options)||q.options.length<2||q.options.length>6||q.options.some(o=>typeof o!=='string'||!o.trim()||o.length>500)||new Set(q.options.map(o=>normalized(o as string))).size!==q.options.length)throw new QuizSourceError('quizSource.invalidDraft',502);
    const options=q.options as string[];let key=q.correctIndex;
    if(!Number.isInteger(key)||Number(key)<(mode==='import'?-1:0)||Number(key)>=options.length)throw new QuizSourceError('quizSource.invalidDraft',502);
    if(typeof q.explanation!=='string'||q.explanation.length>1200)throw new QuizSourceError('quizSource.invalidDraft',502);
    if(mode==='import'&&Number(key)>=0){
      const answerQuote=typeof q.answerQuote==='string'?q.answerQuote.trim():'';
      const marker=/(?:answer|key|kunci|jawaban|lösung|loesung|richtige antwort)\s*[:=]?\s*([A-F])\b/i.exec(answerQuote);
      if(!answerQuote||!normalized(source.text).includes(normalized(answerQuote))||!marker||marker[1].toUpperCase()!=='ABCDEF'[Number(key)])key=-1;
    }
    return {text:q.text.trim(),options:options.map(o=>o.trim()),correctIndex:Number(key),points:1,explanation:q.explanation.trim(),sourcePage:source.page,sourceQuote:quote};
  });
}
