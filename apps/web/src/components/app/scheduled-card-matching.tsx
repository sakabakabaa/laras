import {useEffect,useId,useRef,useState,type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {AppModal} from './app-modal';
import {createCardPointerDrag,type CardPointer} from '@/lib/card-pointer-drag';
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion';
import {GripVertical,MousePointer2,MoveUpRight} from 'lucide-react';
import {useT} from '@/lib/i18n';
import {expandKaufhausTargets,isKaufhausTargets,KAUFHAUS_FLOORS,kaufhausTargetFloor,moveMatchingCard,type MatchingTarget} from '@/lib/card-matching';
import type {ScheduledWorksheet} from '@/lib/scheduled-classes';
import '@/styles/scheduled-card-matching.css';

function cleanCardLabel(value:string){return value.replace(/^\s*\d+[.)]\s*/,'');}

function KaufhausFloorIcon({value}:{value:string}){
  switch(value){
    case '5. Stock':
      return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 11h10v4a5 5 0 0 1-10 0v-4Z"/><path d="M15 12h2a2 2 0 0 1 0 4h-2"/><path d="M4 20h12"/><path d="M8 7c0-1 .8-1.5.8-2.5"/><path d="M12 7c0-1 .8-1.5.8-2.5"/></svg>;
    case '4. Stock':
      return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/><path d="M12 16v4"/></svg>;
    case '3. Stock':
      return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="12" width="7" height="7" rx="1.5"/><rect x="13" y="12" width="7" height="7" rx="1.5"/><rect x="8.5" y="4" width="7" height="7" rx="1.5"/></svg>;
    case '2. Stock':
      return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 4 5 3 5-3 3 4-3 2v10H7V10L4 8l3-4Z"/><path d="M10 6.5 12 9l2-2.5"/></svg>;
    case '1. Stock':
      return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9h12l1 11H5L6 9Z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/></svg>;
    case 'EG':
      return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="9" width="8" height="11" rx="2"/><path d="M7 9V6h4v3"/><path d="M16 12h4v8h-4z"/><path d="M17 12V8l2-1.5V12"/></svg>;
    default:
      return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10h16l-1.5 9h-13L4 10Z"/><path d="M8 10 11 4"/><path d="M16 10 13 4"/><path d="M9.5 14v2"/><path d="M14.5 14v2"/></svg>;
  }
}

export function ScheduledCardMatching({sheet,targets,responses,onChange,itemImages}:{sheet:ScheduledWorksheet;targets:MatchingTarget[];responses:Record<string,string>;onChange:(value:Record<string,string>)=>void;itemImages?:Record<string,string>}){
  const t=useT(),help=useId(),reducedMotion=useReducedMotion(),[selected,setSelected]=useState(''),[over,setOver]=useState<string|null>(null),[notice,setNotice]=useState('');
  const [touchDrag,setTouchDrag]=useState<{id:string;x:number;y:number;width:number;height:number}|null>(null);
  const root=useRef<HTMLElement>(null),origin=useRef<DOMRect|null>(null),suppressClick=useRef(false);
  const destinationFocus=useRef<Record<string,HTMLElement|null>>({}),landings=useRef<Record<string,HTMLHeadingElement|null>>({});
  const [expandedImage,setExpandedImage]=useState<MatchingTarget|null>(null);
  const kaufhausMode=isKaufhausTargets(targets);
  const effectiveTargets=kaufhausMode?expandKaufhausTargets(targets):targets;
  const ids=sheet.items.map(i=>i.id);
  const unassigned=sheet.items.filter(i=>!effectiveTargets.some(target=>target.value===responses[i.id]));
  const active=unassigned[0],remaining=unassigned.length;
  const move=(id:string,target:string)=>{onChange(moveMatchingCard(responses,ids,effectiveTargets,id,target));setSelected('');setOver(null);setTouchDrag(null);setNotice(t(target?'matching.placed':'matching.returned',{target:effectiveTargets.find(t=>t.value===target)?.title||target}));requestAnimationFrame(()=>landings.current[target]?.focus({preventScroll:true}));};
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
  const card=(item:ScheduledWorksheet['items'][number],deck=false,chip=false)=>{
    const imageUrl=itemImages?.[item.id];
    const cleanDe=cleanCardLabel(item.prompt);
    const cleanId=item.translation?cleanCardLabel(item.translation):'';
    return <button type="button" key={item.id} data-card-id={item.id} title={deck?undefined:[item.prompt,item.translation].filter(Boolean).join('\n')} className={`sc-match-card ${deck?'sc-match-deck-card ':''}${chip?'sc-kaufhaus-chip ':''}${selected===item.id?'is-picked':''}${touchDrag?.id===item.id?' is-touch-dragging':''}`} draggable={false} aria-pressed={selected===item.id} aria-describedby={help} onClick={e=>{if(suppressClick.current)return;const next=selected===item.id?'':item.id;setSelected(next);setNotice(next?t('matching.selected'):t('matching.cancelled'));if(next&&e.detail===0)requestAnimationFrame(()=>destinationFocus.current[effectiveTargets[0].value]?.focus());}} onKeyDown={e=>{if(e.key==='Escape'){cancelDrag();setSelected('');setNotice(t('matching.cancelled'));}}} onPointerDown={e=>{if(e.isPrimary===false||e.button!==0||e.currentTarget.closest('fieldset:disabled'))return;suppressClick.current=false;origin.current=e.currentTarget.getBoundingClientRect();pointer.start(item.id,e,e.currentTarget);}} onPointerMove={pointerMove} onPointerUp={e=>pointer.finish(e)} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag} onDragStart={e=>e.preventDefault()} onDragEnd={()=>{setOver(null);setTimeout(()=>{suppressClick.current=false;},0);}}>{deck?<><span className="sc-match-deck-meta"><span className="sc-match-deck-number">{ids.indexOf(item.id)+1} / {ids.length}{kaufhausMode?` · ${t('matching.readyToDrag')}`:''}</span><GripVertical size={22} aria-hidden="true"/></span><span className={imageUrl?'sc-match-deck-body has-media':'sc-match-deck-body'}>{imageUrl&&<span className="sc-match-deck-media"><img src={imageUrl} alt="" loading="lazy" draggable={false}/></span>}<span className="sc-match-deck-copy"><span lang="de">{cleanDe}</span>{cleanId&&<span className="sl-translation" lang="id">{cleanId}</span>}</span></span></>:chip?<><span className="sc-match-placed-number" aria-hidden="true">{ids.indexOf(item.id)+1}</span>{imageUrl&&<img className="sc-kaufhaus-chip-img" src={imageUrl} alt="" loading="lazy" draggable={false}/>}<span className="sc-kaufhaus-chip-label" lang="de">{cleanDe}</span>{cleanId&&<span className="sc-sr-only" lang="id">{cleanId}</span>}</>:<><span className="sc-match-placed-number" aria-hidden="true">{ids.indexOf(item.id)+1}</span><span className="sc-sr-only"><span lang="de">{item.prompt}</span>{item.translation&&<span lang="id">{item.translation}</span>}</span></>}</button>;
  };
  const hasTargetImages=effectiveTargets.some(target=>Boolean(target.url));
  const activeDragItem=sheet.items.find(i=>i.id===(touchDrag?.id||selected))||active;
  const activeDragLabel=activeDragItem?cleanCardLabel(activeDragItem.prompt):'';
  const bankSection=<section className={`sc-match-bank ${over===''?'is-over':''}`} data-match-bank=""><header className="sc-match-bank-actions"><h3 className="sc-sr-only" tabIndex={-1} ref={node=>{landings.current['']=node;}}>{t('matching.bank')}<span className="sc-match-count">{remaining}</span></h3><button ref={node=>{destinationFocus.current['']=node;}} type="button" hidden={!selected||unassigned.some(item=>item.id===selected)} disabled={!selected} onClick={()=>move(selected,'')}>{t('matching.return')}</button></header><div className={`sc-match-stack sc-match-deck ${!remaining?'is-empty':''}`}><AnimatePresence initial={false}>{unassigned.filter(item=>item.id===active?.id).map(item=><motion.div key={item.id} className="sc-match-deck-front" initial={reducedMotion?false:{opacity:0,y:14,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,pointerEvents:'none'}} transition={{duration:reducedMotion?0:.18,ease:'easeOut'}}>{card(item,true)}</motion.div>)}</AnimatePresence></div>{!remaining&&<p className="sc-match-empty">{t('matching.allPlaced')}</p>}</section>;
  const targetsSection=kaufhausMode?<section className="sc-kaufhaus-building" aria-label="Kaufhaus · Orientierungstafel Kursbuch S. 131">
    <header className="sc-kaufhaus-roof">
      <div className="sc-kaufhaus-roof-title"><span className="sc-kaufhaus-sign">KAUFHAUS</span><span>Orientierungstafel · Kursbuch S. 131</span></div>
      <span className="sc-kaufhaus-roof-pill">{t('matching.kaufhausPill')}</span>
    </header>
    <div className="sc-kaufhaus-floors">{KAUFHAUS_FLOORS.map(floor=>{
      const target=effectiveTargets.find(entry=>kaufhausTargetFloor(entry)===floor.value.toLowerCase());
      const placed=target?sheet.items.filter(i=>responses[i.id]===target.value):[];
      const isOver=Boolean(target&&over===target.value);
      const isInteractive=Boolean(target);
      const dropPrompt=isOver&&activeDragLabel?t('matching.dropCard',{card:activeDragLabel}):selected&&isInteractive&&activeDragLabel?t('matching.tapCard',{card:activeDragLabel}):t('matching.drop');
      return <div key={floor.value}>
        {floor.dividerBefore==='awning'&&<div className="sc-kaufhaus-awning" aria-hidden="true"/>}
        {floor.dividerBefore==='street'&&<div className="sc-kaufhaus-street" aria-hidden="true"><span>Straßenniveau · Permukaan jalan (Erdgeschoss)</span><small>↓ Untergeschoss</small></div>}
        <section className={`sc-kaufhaus-floor ${isInteractive?'is-interactive':'is-directory'} ${isOver?'is-over':''} ${placed.length?'is-populated':''}`} data-match-target={target?.value} onClick={target?e=>{if(suppressClick.current||!selected||(e.target as Element).closest('button')||e.currentTarget.closest('fieldset:disabled'))return;e.preventDefault();move(selected,target.value);}:undefined}>
          <div className="sc-kaufhaus-shaft" aria-hidden="true"><span className="sc-kaufhaus-shaft-badge">{floor.badge}</span><span className="sc-kaufhaus-shaft-doors"><i/><i/></span></div>
          <span className="sc-kaufhaus-dept-icon" aria-hidden="true"><KaufhausFloorIcon value={floor.value}/></span>
          <div className="sc-kaufhaus-info">
            <div className="sc-kaufhaus-floor-head">
              {target?<h3 role="button" aria-label={t('matching.place',{target:target.title})} aria-disabled={!selected} tabIndex={0} ref={node=>{landings.current[target.value]=node;destinationFocus.current[target.value]=node;}} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&selected){e.preventDefault();e.stopPropagation();if(!e.currentTarget.closest('fieldset:disabled'))move(selected,target.value);}}}>{floor.name}</h3>:<h3>{floor.name}</h3>}
              {floor.tag&&<span className="sc-kaufhaus-tag">{floor.tag}</span>}
            </div>
            <p className="sc-kaufhaus-depts" lang="de">{floor.departments}</p>
          </div>
          {target?<div className="sc-kaufhaus-bay">
            <p className="sc-kaufhaus-bay-head"><span>{dropPrompt}</span><span className="sc-match-count">{placed.length}</span></p>
            {placed.length>0&&<div className="sc-kaufhaus-placed">{placed.map(item=>card(item,false,true))}</div>}
          </div>:<div className="sc-kaufhaus-bay is-readonly" aria-hidden="true"><span>{t('matching.directoryOnly')}</span></div>}
        </section>
      </div>;
    })}</div>
  </section>:<div className="sc-match-targets">{effectiveTargets.map(target=><section className={`sc-match-target ${over===target.value?'is-over':''}`} key={target.value} data-match-target={target.value} onClick={e=>{if(suppressClick.current||!selected||(e.target as Element).closest('button')||e.currentTarget.closest('fieldset:disabled'))return;e.preventDefault();move(selected,target.value);}}><header>{target.url&&<button type="button" className="sc-match-image-open" onClick={()=>setExpandedImage(target)} aria-label={`Perbesar gambar: ${target.title}`}><img src={target.url} alt={target.title} loading="lazy" draggable={false}/><span>Perbesar gambar</span></button>}<div><h3 role="button" aria-label={t('matching.place',{target:target.title})} aria-disabled={!selected} tabIndex={0} ref={node=>{landings.current[target.value]=node;destinationFocus.current[target.value]=node;}} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&selected){e.preventDefault();e.stopPropagation();if(!e.currentTarget.closest('fieldset:disabled'))move(selected,target.value);}}}>{target.title.match(/\bBild /i)?target.value:target.title}</h3>{target.readingText&&<p className="sc-match-reading" lang="de">{target.readingText}</p>}</div></header><div className="sc-match-drop-area"><p className="sc-match-drop-label">{t('matching.drop')}<span className="sc-match-count">{sheet.items.filter(i=>responses[i.id]===target.value).length}</span></p><div className="sc-match-placed">{sheet.items.filter(i=>responses[i.id]===target.value).map(item=>card(item))}</div></div></section>)}</div>;
  return <section ref={root} className={`sc-card-matching ${effectiveTargets.length===2?'sc-match-two-targets':''} ${kaufhausMode?'sc-match-kaufhaus':''}`} aria-label={t('matching.title')} onKeyDown={e=>{if(e.key==='Escape'){cancelDrag();setSelected('');setNotice(t('matching.cancelled'));}}}><div id={help} className="sc-match-help"><span className="sc-match-help-icon"><MousePointer2 size={22} aria-hidden="true"/></span><p>{t(kaufhausMode?'matching.helpKaufhaus':hasTargetImages?'matching.help':'matching.helpText')}</p><MoveUpRight size={22} aria-hidden="true"/></div><p className="sc-sr-only" role="status" aria-live="polite">{notice}</p>{kaufhausMode?<div className="sc-kaufhaus-workspace sc-kaufhaus-sticky">{bankSection}{targetsSection}</div>:<>{targetsSection}{bankSection}</>}<AppModal open={Boolean(expandedImage)} onClose={()=>setExpandedImage(null)} title={expandedImage?.title||'Gambar rujukan'} className="sc-match-image-modal"><button type="button" onClick={()=>setExpandedImage(null)}>Tutup gambar</button>{expandedImage?.url&&<img src={expandedImage.url} alt={expandedImage.title}/>}</AppModal>{touchDrag&&typeof document!=='undefined'&&createPortal(<div className={`sc-match-drag-preview${touchDrag.width<100?' is-compact':''}`} aria-hidden="true" style={{left:touchDrag.x,top:touchDrag.y,width:touchDrag.width,minHeight:touchDrag.height}}>{touchDrag.width<100?ids.indexOf(touchDrag.id)+1:cleanCardLabel(sheet.items.find(item=>item.id===touchDrag.id)?.prompt||'')}</div>,document.body)}</section>;
}

