import {useEffect,useId,useRef,useState,type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {createCardPointerDrag,type CardPointer} from '@/lib/card-pointer-drag';
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion';
import {GripVertical,MousePointer2,MoveUpRight} from 'lucide-react';
import {useT} from '@/lib/i18n';
import {moveMatchingCard,type MatchingTarget} from '@/lib/card-matching';
import type {ScheduledWorksheet} from '@/lib/scheduled-classes';
import '@/styles/scheduled-card-matching.css';

export function ScheduledCardMatching({sheet,targets,responses,onChange}:{sheet:ScheduledWorksheet;targets:MatchingTarget[];responses:Record<string,string>;onChange:(value:Record<string,string>)=>void}){
  const t=useT(),help=useId(),reducedMotion=useReducedMotion(),[selected,setSelected]=useState(''),[over,setOver]=useState<string|null>(null),[notice,setNotice]=useState('');
  const [touchDrag,setTouchDrag]=useState<{id:string;x:number;y:number;width:number;height:number}|null>(null);
  const root=useRef<HTMLElement>(null),origin=useRef<DOMRect|null>(null),suppressClick=useRef(false);
  const destinationFocus=useRef<Record<string,HTMLElement|null>>({}),landings=useRef<Record<string,HTMLHeadingElement|null>>({});
  const ids=sheet.items.map(i=>i.id);
  const unassigned=sheet.items.filter(i=>!targets.some(target=>target.value===responses[i.id]));
  const active=unassigned[0],remaining=unassigned.length;
  const move=(id:string,target:string)=>{onChange(moveMatchingCard(responses,ids,targets,id,target));setSelected('');setOver(null);setTouchDrag(null);setNotice(t(target?'matching.placed':'matching.returned',{target:targets.find(t=>t.value===target)?.title||target}));requestAnimationFrame(()=>landings.current[target]?.focus({preventScroll:true}));};
  const touchTarget=(x:number,y:number)=>{
    const target=document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-match-target],[data-match-bank]');
    return target&&root.current?.contains(target)?target:null;
  };
  const callbacks=useRef<{move:(id:string,dx:number,dy:number,event:CardPointer)=>void;drop:(id:string,event:CardPointer)=>void;clear:()=>void}>({move:()=>{},drop:()=>{},clear:()=>{}});
  callbacks.current={
    move:(id,dx,dy,event)=>{
      const rect=origin.current;if(!rect)return;
      setSelected(id);setTouchDrag({id,x:rect.left+dx,y:rect.top+dy,width:rect.width,height:rect.height});
      const target=touchTarget(event.clientX,event.clientY);setOver(target?target.dataset.matchTarget??'':null);
      const direction=event.clientY<80?-16:event.clientY>window.innerHeight-80?16:0;
      if(direction){let parent=root.current?.parentElement;while(parent&&!(parent.scrollHeight>parent.clientHeight&&/auto|scroll/.test(getComputedStyle(parent).overflowY)))parent=parent.parentElement;if(parent)parent.scrollBy(0,direction);else window.scrollBy(0,direction);}
    },
    drop:(id,event)=>{suppressClick.current=true;const target=touchTarget(event.clientX,event.clientY);if(target&&!root.current?.closest('fieldset:disabled'))move(id,target.dataset.matchTarget??'');else setSelected('');setTimeout(()=>{suppressClick.current=false;},0);},
    clear:()=>{setTouchDrag(null);setOver(null);},
  };
  const [pointer]=useState(()=>createCardPointerDrag({move:(...args)=>callbacks.current.move(...args),drop:(...args)=>callbacks.current.drop(...args),clear:()=>callbacks.current.clear()}));
  useEffect(()=>{
    const end=(event:globalThis.PointerEvent)=>pointer.finish(event);
    const cancel=()=>{if(pointer.cancel()){suppressClick.current=true;setSelected('');setTimeout(()=>{suppressClick.current=false;},0);}};
    window.addEventListener('pointerup',end);window.addEventListener('pointercancel',cancel);window.addEventListener('blur',cancel);
    return()=>{window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',cancel);window.removeEventListener('blur',cancel);pointer.cancel();};
  },[pointer]);
  const pointerMove=(event:PointerEvent<HTMLButtonElement>)=>{if(event.pointerType==='mouse'&&event.buttons===0){pointer.cancel();return;}pointer.move(event);};
  const cancelDrag=()=>{if(pointer.cancel()){suppressClick.current=true;setSelected('');setTimeout(()=>{suppressClick.current=false;},0);}};
  const card=(item:ScheduledWorksheet['items'][number],deck=false)=><button type="button" key={item.id} data-card-id={item.id} title={deck?undefined:[item.prompt,item.translation].filter(Boolean).join('\n')} className={`sc-match-card ${deck?'sc-match-deck-card ':''}${selected===item.id?'is-picked':''}${touchDrag?.id===item.id?' is-touch-dragging':''}`} draggable={false} aria-pressed={selected===item.id} aria-describedby={help} onClick={e=>{if(suppressClick.current)return;const next=selected===item.id?'':item.id;setSelected(next);setNotice(next?t('matching.selected'):t('matching.cancelled'));if(next&&e.detail===0)requestAnimationFrame(()=>destinationFocus.current[targets[0].value]?.focus());}} onKeyDown={e=>{if(e.key==='Escape'){cancelDrag();setSelected('');setNotice(t('matching.cancelled'));}}} onPointerDown={e=>{if(e.isPrimary===false||e.button!==0||e.currentTarget.closest('fieldset:disabled'))return;suppressClick.current=false;origin.current=e.currentTarget.getBoundingClientRect();pointer.start(item.id,e,e.currentTarget);}} onPointerMove={pointerMove} onPointerUp={e=>pointer.finish(e)} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag} onDragStart={e=>e.preventDefault()} onDragEnd={()=>{setOver(null);setTimeout(()=>{suppressClick.current=false;},0);}}>{deck?<><span className="sc-match-deck-meta"><span className="sc-match-deck-number">{ids.indexOf(item.id)+1} / {ids.length}</span><GripVertical size={22} aria-hidden="true"/></span><span className="sc-match-deck-copy"><span lang="de">{item.prompt.replace(/^\s*\d+[.)]\s*/,'')}</span>{item.translation&&<span className="sl-translation" lang="id">{item.translation.replace(/^\s*\d+[.)]\s*/,'')}</span>}</span></>:<><span className="sc-match-placed-number" aria-hidden="true">{ids.indexOf(item.id)+1}</span><span className="sc-sr-only"><span lang="de">{item.prompt}</span>{item.translation&&<span lang="id">{item.translation}</span>}</span></>}</button>;
  return <section ref={root} className={`sc-card-matching ${targets.length===2?'sc-match-two-targets':''}`} aria-label={t('matching.title')} onKeyDown={e=>{if(e.key==='Escape'){cancelDrag();setSelected('');setNotice(t('matching.cancelled'));}}}><div id={help} className="sc-match-help"><span className="sc-match-help-icon"><MousePointer2 size={22} aria-hidden="true"/></span><p>{t('matching.help')}</p><MoveUpRight size={22} aria-hidden="true"/></div><p className="sc-sr-only" role="status" aria-live="polite">{notice}</p><div className="sc-match-targets">{targets.map(target=><section className={`sc-match-target ${over===target.value?'is-over':''}`} key={target.value} data-match-target={target.value} onClick={e=>{if(suppressClick.current||!selected||(e.target as Element).closest('button')||e.currentTarget.closest('fieldset:disabled'))return;e.preventDefault();move(selected,target.value);}}><header>{target.url&&<a href={target.url} target="_blank" rel="noreferrer" aria-label={target.title}><img src={target.url} alt={target.title} loading="lazy" draggable={false}/></a>}<div><h3 role="button" aria-label={t('matching.place',{target:target.title})} aria-disabled={!selected} tabIndex={0} ref={node=>{landings.current[target.value]=node;destinationFocus.current[target.value]=node;}} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&selected){e.preventDefault();e.stopPropagation();if(!e.currentTarget.closest('fieldset:disabled'))move(selected,target.value);}}}>{target.title.match(/\bBild /i)?target.value:target.title}</h3></div></header><div className="sc-match-drop-area"><p className="sc-match-drop-label">{t('matching.drop')}<span className="sc-match-count">{sheet.items.filter(i=>responses[i.id]===target.value).length}</span></p><div className="sc-match-placed">{sheet.items.filter(i=>responses[i.id]===target.value).map(item=>card(item))}</div></div></section>)}</div><section className={`sc-match-bank ${over===''?'is-over':''}`} data-match-bank=""><header className="sc-match-bank-actions"><h3 className="sc-sr-only" tabIndex={-1} ref={node=>{landings.current['']=node;}}>{t('matching.bank')}<span className="sc-match-count">{remaining}</span></h3><button ref={node=>{destinationFocus.current['']=node;}} type="button" hidden={!selected||unassigned.some(item=>item.id===selected)} disabled={!selected} onClick={()=>move(selected,'')}>{t('matching.return')}</button></header><div className="sc-match-stack sc-match-deck"><AnimatePresence initial={false}>{unassigned.filter(item=>item.id===active?.id).map(item=><motion.div key={item.id} className="sc-match-deck-front" initial={reducedMotion?false:{opacity:0,y:14,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,pointerEvents:'none'}} transition={{duration:reducedMotion?0:.18,ease:'easeOut'}}>{card(item,true)}</motion.div>)}</AnimatePresence></div>{!remaining&&<p className="sc-match-empty">{t('matching.allPlaced')}</p>}</section>{touchDrag&&typeof document!=='undefined'&&createPortal(<div className={`sc-match-drag-preview${touchDrag.width<100?' is-compact':''}`} aria-hidden="true" style={{left:touchDrag.x,top:touchDrag.y,width:touchDrag.width,minHeight:touchDrag.height}}>{touchDrag.width<100?ids.indexOf(touchDrag.id)+1:sheet.items.find(item=>item.id===touchDrag.id)?.prompt}</div>,document.body)}</section>;
}

