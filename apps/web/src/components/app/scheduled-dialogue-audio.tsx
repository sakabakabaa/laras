import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Pause,Play,Square,Stethoscope,UserRound,Volume2} from 'lucide-react';
import type {BilingualText,LessonScene} from '@/lib/scheduled-lesson';
import audioSources from '@/lib/arzt-dialogue-audio.json';

export function ScheduledDialogueAudio({turns,renderText}:{turns:NonNullable<LessonScene['turns']>;renderText:(text:BilingualText)=>ReactNode}){
 const player=useRef<HTMLAudioElement>(null),bubbles=useRef<(HTMLElement|null)[]>([]),sequence=useRef(false),current=useRef(-1),request=useRef(0);
 const [active,setActive]=useState(-1),[playing,setPlaying]=useState(false),[error,setError]=useState('');
 const sources=audioSources as Record<string,string>;
 const source=(i:number)=>sources[turns[i].role+':'+turns[i].text.de];
 const stop=()=>{request.current++;sequence.current=false;current.current=-1;player.current?.pause();setActive(-1);setPlaying(false);};
 useEffect(()=>{const audio=player.current;return()=>{request.current++;audio?.pause();};},[]);
 const resume=()=>{const id=++request.current;setError('');player.current?.play().catch(()=>{if(id===request.current){setPlaying(false);sequence.current=false;setError('Audio belum dapat diputar. Coba lagi.');}});};
 const start=(i:number,all:boolean)=>{
  const audio=player.current;if(!audio||!source(i))return;
  audio.pause();sequence.current=all;current.current=i;setActive(i);audio.src=source(i);resume();
  if(all)bubbles.current[i]?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 };
 const toggle=(i:number)=>{if(current.current===i){sequence.current=false;if(playing)player.current?.pause();else resume();}else start(i,false);};
 const playConversation=()=>{if(playing){player.current?.pause();return;}if(active>=0&&sequence.current)resume();else start(0,true);};
 return <div className="sl-voiced-dialogue">
  <div className="sl-dialogue-toolbar"><div className="sl-dialogue-audio-actions"><button type="button" onClick={playConversation}>{playing?<Pause size={18}/>:<Play size={18}/>} {playing?'Jeda':active>=0&&sequence.current?'Lanjutkan percakapan':'Putar percakapan'}</button>{active>=0&&<button type="button" onClick={stop}><Square size={16}/>Hentikan</button>}</div><small>Suara sintetis · Bahasa Jerman</small></div>
  <audio ref={player} preload="none" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>{if(sequence.current&&current.current+1<turns.length)start(current.current+1,true);else stop();}} onError={()=>{sequence.current=false;setPlaying(false);setError('Audio belum dapat diputar. Coba lagi.');}}/>
  {error&&<p role="alert" className="sc-alert">{error}</p>}
  <div className="sl-dialogue">{turns.map((turn,i)=><article ref={node=>{bubbles.current[i]=node;}} className={`sl-turn sl-${turn.role} is-revealed ${active===i&&playing?'is-speaking':''}`} key={i} aria-current={active===i&&playing?'true':undefined}><header>{turn.role==='doctor'?<Stethoscope size={18}/>:<UserRound size={18}/>}<strong>{turn.role==='doctor'?'Arzt / Ärztin · Dokter':'Patient / Patientin · Pasien'}</strong>{source(i)&&<button type="button" className="sl-bubble-audio" aria-label={`${active===i&&playing?'Jeda':'Dengarkan'} ${turn.role==='doctor'?'dokter':'pasien'}, ${i+1}`} aria-pressed={active===i&&playing} onClick={()=>toggle(i)}>{active===i&&playing?<Pause size={17}/>:<Volume2 size={17}/>}<span>{active===i&&playing?'Jeda':'Dengarkan'}</span></button>}</header>{renderText(turn.text)}</article>)}</div>
 </div>;
}
