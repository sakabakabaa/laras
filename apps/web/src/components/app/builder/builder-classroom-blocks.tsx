import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { ScheduledCardMatching } from '../scheduled-card-matching';
import { WorksheetAnswers } from '../scheduled-worksheet';
import { useBuilderAssetUrl } from './builder-media';
import { matchingPictures, plain, type BuilderBlock, type BuilderDocument, type BuilderImage } from '@/lib/builder-document';
export { matchingPictures };
function MatchingPicture({image,onReady,index}:{image:BuilderImage;onReady:(index:number,url:string)=>void;index:number}){
 const {url,error}=useBuilderAssetUrl(image.asset,image.url);useEffect(()=>{onReady(index,url);},[url,index,onReady]);return error?<p role="alert" className="sc-alert">Gambar {image.caption||image.alt} belum dapat dimuat.</p>:null;
}
function MatchingCardPicture({id,asset,url:fallbackUrl,onReady}:{id:string;asset?:BuilderImage['asset'];url?:string;onReady:(id:string,url:string)=>void}){
 const {url}=useBuilderAssetUrl(asset,fallbackUrl);useEffect(()=>{if(url)onReady(id,url);},[url,id,onReady]);return null;
}
export function BuilderClassroomMatching({block,document,images,answers,onChange}:{block:BuilderBlock;document:BuilderDocument;images?:BuilderImage[];answers:Record<string,string>;onChange:Dispatch<SetStateAction<Record<string,string>>>}){
 const [urls,setUrls]=useState<Record<number,string>>({});
 const [cardUrls,setCardUrls]=useState<Record<string,string>>({});
 // Stable state setter avoids reloading signed images whenever an answer changes.
 const [ready]=useState(()=>(index:number,url:string)=>setUrls(prior=>prior[index]===url?prior:{...prior,[index]:url}));
 const [cardReady]=useState(()=>(id:string,url:string)=>setCardUrls(prior=>prior[id]===url?prior:{...prior,[id]:url}));
 const cardMedia=(block.questionIds||[]).flatMap(id=>{const q=document.questionsById[id];return q&&(q.image||q.url)?[{id,asset:q.image,url:q.url}]:[];});
 return <>{images?.map((image,index)=><MatchingPicture key={image.id} image={image} index={index} onReady={ready}/>)}{cardMedia.map(item=><MatchingCardPicture key={item.id} id={item.id} asset={item.asset} url={item.url} onReady={cardReady}/>)}<ScheduledCardMatching sheet={{items:(block.questionIds||[]).map(id=>({id,prompt:plain(document.questionsById[id]?.prompt),type:'select',options:block.destinations?.map(d=>d.id)}))}} targets={(block.destinations||[]).map((d,i)=>({value:d.id,title:`${d.label} · ${d.title}`,url:(images?urls[i]:d.url)||''}))} itemImages={cardUrls} responses={answers} onChange={onChange}/></>;
}
export function BuilderClassroomQuestions({ids,document,answers,onChange}:{ids:string[];document:BuilderDocument;answers:Record<string,string>;onChange:Dispatch<SetStateAction<Record<string,string>>>}){
 const labels=(id:string)=>document.questionsById[id]?.options?.map((o,i)=>({id:o.id,label:`${String.fromCharCode(65+i)} · ${o.label}`}))||[];
 const responses={...answers};for(const id of ids)if(document.questionsById[id]?.kind==='single_choice')responses[id]=labels(id).find(o=>o.id===answers[id])?.label||'';
 return <WorksheetAnswers sheet={{items:ids.map(id=>({id,prompt:plain(document.questionsById[id]?.prompt),type:document.questionsById[id]?.kind==='single_choice'?'select':'text',options:labels(id).map(o=>o.label)}))}} responses={responses} maxLengths={Object.fromEntries(ids.map(id=>[id,document.questionsById[id]?.maxCharacters||10000]))} rowsById={Object.fromEntries(ids.map(id=>[id,document.questionsById[id]?.kind==='long_writing'?10:3]))} onChange={values=>onChange(prior=>{const next={...prior};for(const id of ids)next[id]=document.questionsById[id]?.kind==='single_choice'?labels(id).find(o=>o.label===values[id])?.id||'':values[id]||'';return next;})}/>;
}
