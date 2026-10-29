import { ACTIVITY_LABELS, wibLabel, type ScheduledClassState } from '@/lib/scheduled-classes';

const LABELS: Record<string, string> = {present: 'Hadir', late: 'Terlambat', absent: 'Absen', excused: 'Izin', sick: 'Sakit'};
export function ScheduledClassReport({state, busy, onAction}: {state: ScheduledClassState; busy: boolean; onAction: (action: string, body?: Record<string, unknown>) => Promise<void>}) {
  const canReview = ['closed', 'reviewed'].includes(state.class!.phase);
  return <section className="sc-card">
    <h2>Pemantauan dan laporan</h2><p>{state.report.filter(r => r.checkedInAt).length} check-in · {state.report.length} peserta / entri roster. Diperbarui setiap 30 detik saat halaman terbuka.</p><p>Kehadiran dicatat otomatis dari check-in. Mahasiswa yang check-in tercatat hadir; yang belum check-in baru ditandai tidak hadir setelah kelas selesai.</p>
    <div className="sc-table-wrap"><table><thead><tr><th>Mahasiswa</th><th>Kegiatan wajib</th><th>Check-in / terakhir terlihat</th><th>Saran</th><th>Kehadiran (check-in)</th></tr></thead><tbody>{state.report.map(row => <tr key={row.roster || row.student}>
      <td><strong>{row.name}</strong><small>{row.nim || 'NIM belum tersedia'}</small><details><summary>Lihat pekerjaan</summary>{state.activities.map(a => {const attempt = row.attempts.find(t => t.activity === a.id); return <article key={a.id}><strong>{a.title} · {ACTIVITY_LABELS[a.kind]}</strong><p>{!attempt ? 'Belum ada jawaban tersimpan' : attempt.status === 'draft' ? 'Draf tersimpan' : attempt.status === 'expired' ? 'Difinalisasi saat waktu habis' : 'Dikumpulkan'}{attempt?.complete ? ' · Lengkap' : ''}</p>{a.kind === 'quiz' && attempt && <p>Skor: {attempt.score ?? 'Menunggu finalisasi'} / 100</p>}{attempt && <pre>{a.kind === 'quiz' ? (a.questions || []).map(q => `${q.text}\n${q.options[Number(attempt.answers[q.id])] ?? 'Belum dijawab'}`).join('\n\n') : String(attempt.answers.text || (attempt.answers.acknowledged ? 'Sudah membaca' : ''))}</pre>}</article>;})}</details></td>
      <td>{row.completed}/{row.total}</td><td>{wibLabel(row.checkedInAt)}<small>{wibLabel(row.lastSeenAt)}</small></td>
      <td>{canReview ? LABELS[row.suggestion] : 'Sementara'}<small>{row.reason}</small></td>
      <td>{row.attendance === 'present' ? 'Hadir' : row.attendance === 'absent' ? 'Tidak hadir' : 'Belum ada check-in'}</td>
    </tr>)}</tbody></table>{!state.report.length && <p>Belum ada mahasiswa pada roster atau peserta check-in.</p>}</div>
    <details className="sc-audit"><summary>Riwayat tindakan</summary><ul>{state.events.map(e => <li key={e.id}>{wibLabel(e.created)} · {e.action}{e.action === 'attendance' ? ` · ${LABELS[String(e.detail.previous)] || 'Belum dicatat'} → ${LABELS[String(e.detail.status)] || ''}` : ''}</li>)}</ul></details>
  </section>;
}
