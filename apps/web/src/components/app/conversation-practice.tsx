import { useEffect, useRef, useState } from 'react';
import { Mic, Pause, Send, MessageCircle, Volume2 } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { Button } from '@/components/ui/button';
import { ConversationVad } from '@/lib/conversation-vad';

type Message = {role:'user'|'assistant';text:string;feedback?:string;hint?:string};
type Reply = {scenario:string;reply:string;feedback:string;hint:string;language:string;level:string;finished?:boolean;saved?:boolean;reflectionId?:string;sources:{title:string;locator:string}[]};
type Summary = {strengths:string[];improvements:string[];nextStep:string};
type Phase = 'complete'|'paused'|'listening'|'hearing'|'transcribing'|'thinking'|'voice'|'speaking';
const labels:Record<Phase,string>={complete:'Percakapan selesai',paused:'Mikrofon nonaktif',listening:'Mendengarkan…',hearing:'Kamu sedang berbicara…',transcribing:'Menulis ucapanmu…',thinking:'Partner sedang berpikir…',voice:'Menyiapkan suara…',speaking:'Partner sedang berbicara…'};

export function ConversationPractice({courseId}:{courseId:string}) {
  const [messages,setMessages]=useState<Message[]>([]);
  const [info,setInfo]=useState<Reply|null>(null);
  const [draft,setDraft]=useState('');
  const [phase,setPhase]=useState<Phase>('paused');
  const [live,setLive]=useState(false);
  const [error,setError]=useState('');
  const [audio,setAudio]=useState('');
  const [summary,setSummary]=useState<Summary|null>(null);
  const [busy,setBusy]=useState(false);
  const messagesRef=useRef<Message[]>([]);
  const sessionId=useRef('');
  const [saved,setSaved]=useState(false);
  const [saveError,setSaveError]=useState('');
  const stream=useRef<MediaStream|null>(null);
  const context=useRef<AudioContext|null>(null);
  const analyser=useRef<AnalyserNode|null>(null);
  const recorder=useRef<MediaRecorder|null>(null);
  const frame=useRef(0);
  const deadline=useRef<ReturnType<typeof setTimeout>|null>(null);
  const active=useRef(false);
  const epoch=useRef(0);
  const mounted=useRef(false);
  const player=useRef<HTMLAudioElement|null>(null);
  const thread=useRef<HTMLDivElement|null>(null);
  const url=useRef('');
  const controllers=useRef<Set<AbortController>>(new Set());
  const listenRef=useRef<()=>void>(()=>{});
  const consumeRef=useRef<(blob:Blob,id:number)=>Promise<void>>(async()=>{});
  const turns=messages.filter(m=>m.role==='user').length;
  const lastReply=messages.filter(m=>m.role==='assistant').at(-1);

  function discardCapture() {
    cancelAnimationFrame(frame.current);
    if(deadline.current)clearTimeout(deadline.current);
    const rec=recorder.current;recorder.current=null;
    if(rec){rec.onstop=null;rec.ondataavailable=null;if(rec.state!=='inactive')rec.stop();}
  }
  function stopLive() {
    active.current=false;epoch.current++;discardCapture();
    stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
    void context.current?.close();context.current=null;analyser.current=null;
    player.current?.pause();
    if(mounted.current){setLive(false);setPhase('paused');}
  }
  useEffect(()=>{
    mounted.current=true;
    const hidden=()=>{if(document.hidden)stopLive();};
    document.addEventListener('visibilitychange',hidden);
    return()=>{mounted.current=false;stopLive();controllers.current.forEach(c=>c.abort());if(url.current)URL.revokeObjectURL(url.current);document.removeEventListener('visibilitychange',hidden);};
  },[]);
  useEffect(()=>{if(thread.current)thread.current.scrollTop=thread.current.scrollHeight;},[messages,phase]);
  useEffect(()=>{
    if(!audio||!player.current)return;
    player.current.play().catch(()=>{if(mounted.current){setPhase('paused');setError('Tekan Dengarkan untuk memutar suara. Mikrofon menunggu sampai suara selesai.');}});
  },[audio]);
  function update(next:Message[]){messagesRef.current=next;setMessages(next);}
  async function request(body:Record<string,unknown>|FormData) {
    const controller=new AbortController();controllers.current.add(controller);
    try {
      const response=await fetch('/api/conversation-practice',{method:'POST',headers:{Authorization:`Bearer ${pb.authStore.token}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:JSON.stringify({courseId,...body}),signal:controller.signal});
      if(!response.ok){const value=await response.json().catch(()=>({}));throw new Error(typeof value.error==='string'?value.error:'Layanan belum tersedia. Coba lagi.');}
      // Consume inside the abort lifetime so leaving the page also cancels the body.
      return body instanceof FormData||(body as Record<string,unknown>).action!=='speech'?await response.json():await response.blob();
    } finally {controllers.current.delete(controller);}
  }
  async function speak(text:string,id:number) {
    setPhase('voice');setAudio('');
    const blob=await request({action:'speech',text}) as Blob;
    if(!mounted.current||epoch.current!==id)return;
    if(url.current)URL.revokeObjectURL(url.current);
    url.current=URL.createObjectURL(blob);setAudio(url.current);
  }
  async function send(text:string,start=false,id=epoch.current) {
    discardCapture();player.current?.pause();setBusy(true);setPhase('thinking');setError('');
    if(start){sessionId.current=crypto.randomUUID();setSaved(false);setSaveError('');}
    const history=start?[]:messagesRef.current;
    if(!start)update([...history,{role:'user',text}]);
    try {
      const result=await request({action:start?'start':'reply',sessionId:sessionId.current,history:history.map(({role,text,feedback,hint})=>({role,text,feedback,hint})),text:start?'':text}) as Reply;
      if(!mounted.current||epoch.current!==id)return;
      setInfo(result);setSummary(null);setDraft('');
      const completed=[...history,...(start?[]:[{role:'user' as const,text}]),{role:'assistant' as const,text:result.reply,feedback:result.feedback,hint:result.hint}];
      update(completed);
      if(result.finished){if(result.saved){setSaved(true);setSaveError('');}else setSaveError('Percakapan selesai tetapi belum tersimpan. Coba simpan lagi.');}
      await speak(result.reply,id);
    }catch(err){if(mounted.current&&epoch.current===id){stopLive();setError(err instanceof Error?err.message:'Balasan gagal. Lanjutkan dengan mikrofon atau ketik lagi.');setDraft(text);if(!start)update(history);}}
    finally{if(mounted.current)setBusy(false);}
  }
  consumeRef.current=async(blob,id)=>{
    if(!active.current||epoch.current!==id)return;
    setBusy(true);setPhase('transcribing');
    try {
      const form=new FormData();form.set('courseId',courseId);form.set('audio',blob,/mp4/.test(blob.type)?'reply.mp4':/ogg/.test(blob.type)?'reply.ogg':'reply.webm');
      const result=await request(form) as {text:string};
      if(!mounted.current||!active.current||epoch.current!==id)return;
      if(!result.text.trim()){setBusy(false);listenRef.current();return;}
      await send(result.text,false,id);
    }catch(err){if(mounted.current&&epoch.current===id){stopLive();setError(err instanceof Error?err.message:'Transkripsi gagal. Coba mikrofon lagi atau ketik jawaban.');}}
    finally{if(mounted.current)setBusy(false);}
  };
  listenRef.current=()=>{
    if(!active.current||!stream.current||!analyser.current)return;
    if(messagesRef.current.filter(m=>m.role==='user').length>=6){stopLive();setPhase('complete');return;}
    discardCapture();setPhase('listening');
    const id=epoch.current;
    const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
    const rec=new MediaRecorder(stream.current,mime?{mimeType:mime}:undefined);recorder.current=rec;
    const chunks:Blob[]=[];const vad=new ConversationVad();let voiced=false;
    rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    rec.onerror=()=>{stopLive();setError('Mikrofon terhenti. Coba aktifkan lagi.');};
    rec.onstop=()=>{
      cancelAnimationFrame(frame.current);if(deadline.current)clearTimeout(deadline.current);
      if(!active.current||id!==epoch.current)return;
      if(vad.hasSpeech)void consumeRef.current(new Blob(chunks,{type:rec.mimeType||'audio/webm'}),id);
      else listenRef.current();
    };
    rec.start();
    const values=new Float32Array(analyser.current.fftSize);
    const tick=(now:number)=>{
      if(!active.current||rec.state!=='recording'||!analyser.current)return;
      analyser.current.getFloatTimeDomainData(values);
      const rms=Math.sqrt(values.reduce((n,v)=>n+v*v,0)/values.length);
      const ended=vad.sample(rms,now);
      if(vad.hasSpeech&&!voiced){voiced=true;setPhase('hearing');}
      if(ended)rec.stop();else frame.current=requestAnimationFrame(tick);
    };
    frame.current=requestAnimationFrame(tick);
    deadline.current=setTimeout(()=>{if(rec.state==='recording')rec.stop();},30000);
  };
  async function startLive() {
    setError('');
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setError('Browser belum mendukung mikrofon. Gunakan jawaban ketik.');return;}
    const id=++epoch.current;setBusy(true);
    try {
      const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(!mounted.current||id!==epoch.current){media.getTracks().forEach(t=>t.stop());return;}
      stream.current=media;context.current=new AudioContext();await context.current.resume();
      if(id!==epoch.current)return;
      analyser.current=context.current.createAnalyser();analyser.current.fftSize=2048;
      context.current.createMediaStreamSource(media).connect(analyser.current);
      active.current=true;setLive(true);
      if(!info||summary)await send('',true,id);else {setBusy(false);listenRef.current();}
    }catch {if(mounted.current&&id===epoch.current){stopLive();setError('Mikrofon belum diizinkan atau tidak tersedia. Kamu tetap dapat mengetik.');}}
    finally{if(mounted.current)setBusy(false);}
  }
  async function finish() {
    stopLive();setBusy(true);setError('');
    const id=epoch.current;
    try{const result=await request({action:'summary',sessionId:sessionId.current,history:messagesRef.current.map(({role,text,feedback,hint})=>({role,text,feedback,hint}))}) as Summary;if(mounted.current&&id===epoch.current)setSummary(result);}
    catch(err){if(mounted.current)setError(err instanceof Error?err.message:'Rangkuman belum tersedia.');}
    finally{if(mounted.current)setBusy(false);}
  }
  return <section className="cp-practice cp-live-practice">
    <header><span className="pp-eyebrow">PERCAKAPAN PERSONAL · TANPA NILAI RESMI</span><h1>Percakapan langsung</h1><p>Aktifkan mikrofon sekali, lalu berbicara seperti biasa. Partner menjawab setelah kamu berhenti sejenak.</p></header>
    {error&&<p role="alert" className="ld-alert">{error}</p>}
    <div className="cp-live-grid">
      <div className="cp-partner-panel">
        <div className="cp-session-heading"><strong>{info?.scenario||'Partner belajarmu'}</strong><span>{info?`${info.language} ${info.level} · ${turns}/6 jawaban`:'Sesuai materi kelas'}</span></div>
        <div className={`cp-orb ${phase}`} aria-hidden="true"><MessageCircle size={42}/><span/><span/><span/></div>
        <p className="cp-live-status" role="status">{labels[phase]}</p>
        <p className="cp-partner-line">{lastReply?.text||'Latih percakapan dalam bahasa yang sedang kamu pelajari.'}</p>
        {!summary&&turns<6&&<div className="cp-live-controls">{live?<Button variant="outline" onClick={stopLive}><Pause size={16}/> Jeda mikrofon</Button>:<Button disabled={busy} onClick={()=>void startLive()}><Mic size={16}/> {info?'Lanjutkan dengan mikrofon':'Mulai percakapan'}</Button>}</div>}
        {audio&&<div className="cp-playback"><Button variant="outline" disabled={busy} onClick={()=>{discardCapture();setError('');void player.current?.play().catch(()=>setError('Suara belum dapat diputar. Coba lagi.'));}}><Volume2 size={16}/> Dengarkan</Button><audio ref={player} src={audio} onPlay={()=>setPhase('speaking')} onEnded={()=>{if(messagesRef.current.filter(m=>m.role==='user').length>=6){stopLive();setPhase('complete');}else {setPhase('paused');if(active.current)listenRef.current();}}} onError={()=>{stopLive();setError('Suara gagal diputar. Aktifkan mikrofon untuk melanjutkan.');}}/></div>}
        <p className="cp-hint">{lastReply?.hint?`Petunjuk: ${lastReply.hint}`:'Satu sesi berisi enam giliran. Tidak ada nilai resmi.'}</p>
        <p className="cp-notice">Mikrofon menunggu saat partner berbicara. Ucapan dikirim ke Hostinger saat jeda terdeteksi (maks. 30 detik per giliran). Jeda atau tinggalkan halaman untuk mematikan mikrofon. Sesi belum disimpan ke progres.</p>
        {turns>=6&&<p className={saved?'cp-save-ok':'cp-save-status'} role={saveError?'alert':'status'}>{saveError|| (saved?'Tersimpan di profil belajar untuk refleksi.':'Menyimpan percakapan…')}</p>}
        {saveError&&turns>=6&&<Button variant="outline" disabled={busy} onClick={()=>{setBusy(true);void request({action:'save',sessionId:sessionId.current,scenario:info?.scenario||'',history:messagesRef.current}).then(()=>{setSaved(true);setSaveError('');}).catch(()=>setSaveError('Gagal menyimpan. Periksa koneksi lalu coba lagi.')).finally(()=>setBusy(false));}}>Coba simpan lagi</Button>}
        {!summary&&info&&<Button variant="outline" disabled={busy||turns===0} onClick={()=>void finish()}>Selesai & lihat rangkuman</Button>}
        {!summary&&turns<6&&!live&&<details className="cp-type-fallback"><summary>Gunakan jawaban ketik</summary><div className="cp-reply"><label htmlFor="conversation-reply">Jawabanmu</label><textarea id="conversation-reply" rows={2} value={draft} maxLength={1500} disabled={busy} onChange={e=>setDraft(e.target.value)}/><Button disabled={busy||(!!info&&!draft.trim())} onClick={()=>void send(draft,!info)}><Send size={16}/> {info?'Kirim jawaban':'Mulai tanpa mikrofon'}</Button></div></details>}
        {turns>=6&&!summary&&<p>Enam giliran selesai. Lihat rangkuman percakapanmu.</p>}
      </div>
      <aside className="cp-transcript-panel"><div className="cp-transcript-heading"><h2>Transkrip percakapan</h2><span>{turns>=6?'Sesi selesai':live?'Sesi aktif':'Sesi dijeda'}</span></div><div ref={thread} className="cp-messages" role="log" aria-label="Transkrip percakapan" aria-live="polite">{messages.length?messages.map((m,i)=><article key={i} className={`cp-message ${m.role}`}><small>{m.role==='assistant'?'Partner AI':'Kamu'}</small><p>{m.text}</p>{m.feedback&&<details><summary>Catatan bahasa</summary><p>{m.feedback}</p></details>}</article>):<div className="cp-transcript-empty"><MessageCircle size={24}/><p>Percakapanmu akan muncul di sini.</p><small>Transkrip ditambahkan setelah setiap ucapan selesai.</small></div>}{phase==='transcribing'&&<p className="cp-transcribing">Menulis ucapanmu…</p>}</div></aside>
    </div>
    {summary&&<section className="cp-summary"><h2>Rangkuman percakapan</h2><h3>Yang sudah baik</h3><ul>{summary.strengths.map(s=><li key={s}>{s}</li>)}</ul><h3>Untuk dilatih berikutnya</h3><ul>{summary.improvements.map(s=><li key={s}>{s}</li>)}</ul><p>{summary.nextStep}</p><small>Umpan balik berdasarkan teks, bukan pengukuran pelafalan.</small><Button disabled={busy} onClick={()=>{stopLive();setSummary(null);setInfo(null);update([]);setAudio('');setSaved(false);setSaveError('');sessionId.current='';}}>Percakapan baru</Button></section>}
    {info&&<details className="cp-sources"><summary>Rujukan materi kelas</summary>{info.sources.map(s=><p key={s.title+s.locator}>{s.title} · {s.locator}</p>)}</details>}
  </section>;
}
