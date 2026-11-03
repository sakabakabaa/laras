import type {ScheduledActivity} from '@/lib/scheduled-classes';
import type {ResponseVerdictCard} from '@/lib/session-review-verdict';

export function isExactResponse(activity:ScheduledActivity,card:ResponseVerdictCard){
  return activity.kind==='quiz'||activity.worksheet?.answerKey?.items[card.id]?.mode==='exact';
}

type Entry={activity:ScheduledActivity;index:number;cards:ResponseVerdictCard[];score?:number;submitted:boolean};

export function ScheduledExactAnswerOverview({entries,selectedActivity,onSelect}:{entries:Entry[];selectedActivity:string;onSelect:(activity:string)=>void}){
  const exactEntries=entries.map(entry=>({...entry,cards:entry.cards.filter(card=>isExactResponse(entry.activity,card))})).filter(entry=>entry.cards.length>0);
  if(!exactEntries.length)return null;
  return <section className="sr-exact-overview" aria-label="Ringkasan jawaban dengan kunci">
    <div className="sr-exact-heading"><div><h3>Jawaban otomatis</h3><p>Hasil mahasiswa terpilih · pilih kegiatan untuk meninjau jawaban.</p></div><div className="sr-donut-legend"><span className="is-correct">Benar</span><span className="is-wrong">Salah</span><span className="is-missing">Belum dijawab</span></div></div>
    <div className="sr-donut-grid">{exactEntries.map(({activity,index,cards,score,submitted})=>{
      const correct=submitted?cards.filter(card=>card.answer.trim()&&card.verdict==='correct').length:0;
      const wrong=submitted?cards.filter(card=>card.answer.trim()&&card.verdict==='wrong').length:0;
      const missing=cards.length-correct-wrong;
      const correctPercent=correct/cards.length*100,wrongPercent=wrong/cards.length*100;
      return <button type="button" key={activity.id} className="sr-donut-card" aria-pressed={selectedActivity===activity.id} aria-label={`Tinjau ${activity.title}: ${correct} benar, ${wrong} salah, ${missing} belum dijawab`} onClick={()=>onSelect(activity.id)}>
        <span className="sr-donut"><svg viewBox="0 0 100 100" aria-hidden="true"><circle className="sr-donut-track" cx="50" cy="50" r="40"/>{correct>0&&<circle className="sr-donut-correct" cx="50" cy="50" r="40" pathLength="100" strokeDasharray={`${correctPercent} ${100-correctPercent}`}/>} {wrong>0&&<circle className="sr-donut-wrong" cx="50" cy="50" r="40" pathLength="100" strokeDasharray={`${wrongPercent} ${100-wrongPercent}`} strokeDashoffset={-correctPercent}/>}</svg><span className="sr-donut-value"><strong>{correct}<small>/{cards.length}</small></strong><span>benar</span></span></span>
        <strong className="sr-donut-title">{index+1}. {activity.title}</strong><span className="sr-donut-result">{!submitted?'Belum mengirim':typeof score==='number'?`Nilai otomatis ${score} / 100`:`${correct} benar · ${wrong} salah · ${missing} kosong`}</span>
      </button>;
    })}</div>
  </section>;
}
