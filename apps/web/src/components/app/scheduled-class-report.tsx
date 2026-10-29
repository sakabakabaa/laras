import {useState} from 'react';
import {CheckCheck,Search,Users} from 'lucide-react';
import {wibLabel,type ScheduledClassState} from '@/lib/scheduled-classes';

export function ScheduledClassReport({state}:{state:ScheduledClassState}){
  const [search,setSearch]=useState(''),[filter,setFilter]=useState('all');
  const present=state.report.filter(r=>Boolean(r.checkedInAt)).length;
  const closed=['closed','reviewed'].includes(state.class?.phase||'');
  const rows=state.report.filter(r=>`${r.name} ${r.nim}`.toLowerCase().includes(search.toLowerCase())).filter(r=>filter==='all'||(filter==='present'?Boolean(r.checkedInAt):!r.checkedInAt));
  return <section className="ss-panel ss-attendance"><div className="ss-panel-heading"><div><h2>Kehadiran</h2><p><CheckCheck size={15}/>Tercatat otomatis saat mahasiswa check-in.</p></div><span className="ss-attendance-total"><Users size={17}/><strong>{present}/{state.report.length}</strong> hadir</span></div>
    <div className="ss-attendance-toolbar"><label className="ss-search"><Search size={17}/><input aria-label="Cari mahasiswa di kehadiran" placeholder="Cari nama atau NIM..." value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="ss-filters" role="group" aria-label="Filter kehadiran">{[['all','Semua'],['present','Hadir'],['absent',closed?'Tidak hadir':'Belum check-in']].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div></div>
    <div className="ss-table-scroll"><table><thead><tr><th>Mahasiswa</th><th>Check-in</th><th>Terakhir aktif</th><th>Status</th></tr></thead><tbody>{rows.map(row=><tr key={row.roster||row.student}><td><div className="ss-person"><span className="ss-avatar">{row.name.split(/\s+/).slice(0,2).map(n=>n[0]).join('')}</span><div><strong>{row.name}</strong><small>{row.nim||'NIM belum tersedia'}</small></div></div></td><td>{row.checkedInAt?wibLabel(row.checkedInAt):'—'}</td><td>{row.lastSeenAt?wibLabel(row.lastSeenAt):'—'}</td><td><span className={`ss-status ${row.checkedInAt?'ss-status-open':closed?'ss-status-absent':'ss-status-draft'}`}>{row.checkedInAt?'Hadir':closed?'Tidak hadir':'Belum check-in'}</span></td></tr>)}</tbody></table></div>
    {!rows.length&&<div className="ss-empty"><Users size={28}/><h3>Tidak ada mahasiswa yang sesuai</h3><p>Coba nama atau status lain.</p></div>}
    <p className="ss-table-note">{rows.length} dari {state.report.length} mahasiswa · Diperbarui setiap 30 detik</p>
  </section>;
}
