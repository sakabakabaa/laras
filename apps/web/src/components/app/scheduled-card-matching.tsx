import {useId,useRef,useState,type DragEvent,type PointerEvent} from 'react';
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion';
import {GripVertical} from 'lucide-react';
import {useT} from '@/lib/i18n';
import {moveMatchingCard,type MatchingTarget} from '@/lib/card-matching';
import type {ScheduledWorksheet} from '@/lib/scheduled-classes';
import '@/styles/scheduled-card-matching.css';

export function ScheduledCardMatching({sheet,targets,responses,onChange}:{sheet:ScheduledWorksheet;targets:MatchingTarget[];responses:Record<string,string>;onChange:(value:Record<string,string>)=>void}){
  const t=useT(),help=useId(),reducedMotion=useReducedMotion(),[selected,setSelected]=useState(''),[dragged,setDragged]=useState(''),[over,setOver]=useState<string|null>(null),[notice,setNotice]=useState('');
  const [touchDrag,setTouchDrag]=useState<{id:string;x:number;y:number}|null>(null);
  const touch=useRef<{id:string;x:number;y:number;moved:boolean}|null>(null),suppressClick=useRef(false);
  const destinationFocus=useRef<Record<string,HTMLElement|null>>({}),landings=useRef<Record<string,HTMLHeadingElement|null>>({});
  const ids=sheet.items.map(i=>i.id);
  const unassigned=sheet.items.filter(i=>!targets.some(target=>target.value===responses[i.id]));
  const active=unassigned[0],remaining=unassigned.length;
  const move=(id:string,target:string)=>{onChange(moveMatchingCard(responses,ids,targets,id,target));setSelected('');setDragged('');setOver(null);setTouchDrag(null);setNotice(t(target?'matching.placed':'matching.returned',{target}));requestAnimationFrame(()=>landings.current[target]?.focus());};
  const drop=(e:DragEvent,target:string)=>{e.preventDefault();e.stopPropagation();if(e.currentTarget.closest('fieldset:disabled'))return;if(dragged&&e.dataTransfer.getData('application/x-laras-card')===dragged)move(dragged,target);setOver(null);};
  const handlers=(target:string)=>({onDragOver:(e:DragEvent)=>{if(dragged){e.preventDefault();e.dataTransfer.dropEffect='move';setOver(target);}},onDragLeave:(e:DragEvent)=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setOver(null);},onDrop:(e:DragEvent)=>drop(e,target)});
  const touchTarget=(x:number,y:number)=>document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-match-target],[data-match-bank]');
  const pointerMove=(e:PointerEvent<HTMLButtonElement>)=>{
    const start=touch.current;if(!start)return;
    const x=e.clientX-start.x,y=e.clientY-start.y;
    if(!start.moved&&Math.hypot(x,y)<8)return;
    start.moved=true;setSelected(start.id);setTouchDrag({id:start.id,x,y});
    const target=touchTarget(e.clientX,e.clientY);setOver(target?target.dataset.matchTarget??'':null);
    // Touch dragging can reach targets above the deck on a small screen.
    const direction=e.clientY<80?-16:e.clientY>window.innerHeight-80?16:0;
    if(direction){let parent=e.currentTarget.parentElement;while(parent&&!(parent.scrollHeight>parent.clientHeight&&/auto|scroll/.test(getComputedStyle(parent).overflowY)))parent=parent.parentElement;if(parent)parent.scrollBy(0,direction);else window.scrollBy(0,direction);}
  };
  const pointerEnd=(e:PointerEvent<HTMLButtonElement>,cancelled=false)=>{
    const start=touch.current;touch.current=null;setTouchDrag(null);setOver(null);
    if(!start?.moved)return;
    suppressClick.current=true;
    const target=cancelled?null:touchTarget(e.clientX,e.clientY);
    if(target&&!e.currentTarget.closest('fieldset:disabled'))move(start.id,target.dataset.matchTarget??'');
    // A dragged touch also generates a synthetic click in some browsers.
    setTimeout(()=>{suppressClick.current=false;},0);
  };
  const card=(item:ScheduledWorksheet['items'][number],deck=false)=><button type="button" key={item.id} data-card-id={item.id} className={`sc-match-card ${deck?'sc-match-deck-card ':''}${selected===item.id?'is-picked':''}${touchDrag?.id===item.id?' is-touch-dragging':''}`} style={touchDrag?.id===item.id?{transform:`translate(${touchDrag.x}px, ${touchDrag.y}px)`,pointerEvents:'none'}:undefined} draggable aria-pressed={selected===item.id} aria-describedby={help} onClick={e=>{if(suppressClick.current)return;const next=selected===item.id?'':item.id;setSelected(next);setNotice(next?t('matching.selected'):t('matching.cancelled'));if(next&&e.detail===0)requestAnimationFrame(()=>destinationFocus.current[targets[0].value]?.focus());}} onKeyDown={e=>{if(e.key==='Escape'){setSelected('');setNotice(t('matching.cancelled'));}}} onPointerDown={e=>{if(e.pointerType!=='touch'||e.currentTarget.closest('fieldset:disabled'))return;suppressClick.current=false;touch.current={id:item.id,x:e.clientX,y:e.clientY,moved:false};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={pointerMove} onPointerUp={e=>pointerEnd(e)} onPointerCancel={e=>pointerEnd(e,true)} onDragStart={e=>{if(e.currentTarget.closest('fieldset:disabled')){e.preventDefault();return;}e.dataTransfer.setData('application/x-laras-card',item.id);e.dataTransfer.effectAllowed='move';setDragged(item.id);setSelected(item.id);}} onDragEnd={()=>{setDragged('');setOver(null);}}>{deck?<><span className="sc-match-deck-meta"><span className="sc-match-deck-number">{ids.indexOf(item.id)+1} / {ids.length}</span><GripVertical size={22} aria-hidden="true"/></span><span className="sc-match-deck-copy"><span lang="de">{item.prompt}</span>{item.translation&&<span className="sl-translation" lang="id">{item.translation}</span>}</span></>:<><GripVertical size={16} aria-hidden="true"/><span><span lang="de">{item.prompt}</span>{item.translation&&<span className="sl-translation" lang="id">{item.translation}</span>}</span></>}</button>;
  return <section className="sc-card-matching" aria-label={t('matching.title')} onKeyDown={e=>{if(e.key==='Escape'){setSelected('');setNotice(t('matching.cancelled'));}}}><p id={help} className="sc-match-help">{t('matching.help')}</p><p className="sc-sr-only" role="status" aria-live="polite">{notice}</p><div className="sc-match-targets">{targets.map(target=><section className={`sc-match-target ${over===target.value?'is-over':''}`} key={target.value} data-match-target={target.value} {...handlers(target.value)} onClick={e=>{if(!selected||(e.target as Element).closest('button')||e.currentTarget.closest('fieldset:disabled'))return;e.preventDefault();move(selected,target.value);}}><header><a href={target.url} target="_blank" rel="noreferrer" aria-label={target.title}><img src={target.url} alt={target.title} loading="lazy" draggable={false}/></a><div><h3 role="button" aria-label={t('matching.place',{target:target.value})} aria-disabled={!selected} tabIndex={0} ref={node=>{landings.current[target.value]=node;destinationFocus.current[target.value]=node;}} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&selected){e.preventDefault();e.stopPropagation();if(!e.currentTarget.closest('fieldset:disabled'))move(selected,target.value);}}}>{target.title.match(/\bBild /i)?target.value:target.title}<span className="sc-match-count">{sheet.items.filter(i=>responses[i.id]===target.value).length}</span></h3></div></header><div className="sc-match-placed">{sheet.items.filter(i=>responses[i.id]===target.value).map(item=>card(item))}</div>{!sheet.items.some(i=>responses[i.id]===target.value)&&<p className="sc-match-empty">{t('matching.drop')}</p>}</section>)}</div><section className={`sc-match-bank ${over===''?'is-over':''}`} data-match-bank="" {...handlers('')}><header><h3 tabIndex={-1} ref={node=>{landings.current['']=node;}}>{t('matching.bank')}<span className="sc-match-count">{remaining}</span></h3><button ref={node=>{destinationFocus.current['']=node;}} type="button" disabled={!selected} onClick={()=>move(selected,'')}>{t('matching.return')}</button></header><div className="sc-match-stack sc-match-deck"><AnimatePresence initial={false} mode="wait">{active&&<motion.div key={active.id} className="sc-match-deck-front" initial={reducedMotion?false:{opacity:0,y:14,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={reducedMotion?{opacity:0}:{opacity:0,y:-28,rotate:-2,scale:.97}} transition={{duration:reducedMotion?0:.18,ease:'easeOut'}}>{card(active,true)}</motion.div>}</AnimatePresence></div>{!remaining&&<p className="sc-match-empty">{t('matching.allPlaced')}</p>}</section></section>;
}
