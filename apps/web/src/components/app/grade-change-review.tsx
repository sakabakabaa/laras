import { useState } from 'react';

export type ReviewProposal = {
 id: string; course: string; revision: number; payloadHash: string; status: string;
 items: { componentId: string; studentId: string; before: unknown; after: unknown; operation?: unknown; operations?: unknown[]; baseline?: { student?: { nim?: string }; component?: { name?: string; maxScore?: number } } }[];
 result?: unknown;
};

export async function gradeCommandRequest(token: string, body: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<ReviewProposal> {
 const response = await fetcher('/api/gradebook-commands', {
  method: 'POST', credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Laras-Grade-Action': 'review' },
  body: JSON.stringify(body),
 });
 const data = await response.json();
 if (!response.ok) throw new Error(response.status === 409 ? 'The reviewed grades changed. Prepare and review a new proposal. / Nilai berubah. Siapkan dan tinjau usulan baru.' : 'The grade command could not complete. Check the saved operation status before retrying. / Periksa status operasi sebelum mencoba lagi.');
 if (!data?.proposal?.id) throw new Error('Invalid grade operation response.');
 return data.proposal;
}

function stateText(value: unknown): string {
 if (value === null || value === undefined) return '—';
 if (typeof value !== 'object') return String(value);
 return JSON.stringify(value, null, 2);
}

/** Shared persisted preview for gradebook and assistant surfaces. Approval is never automatic. */
export function GradeChangeReview({ proposal, students, components, courseLabel, onApprove, onClose, onRefresh, onReject, sourceLabel = 'ui', language = 'en' }: {
 proposal: ReviewProposal;
 students: { id: string; nim: string; name: string }[];
 components: { id: string; name: string; maxScore?: number }[];
 courseLabel: string;
 onApprove: () => Promise<void>;
 onClose: () => void;
 onRefresh?: () => Promise<void>;
 onReject?: () => Promise<void>;
 language?: string;
 sourceLabel?: string;
}) {
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const id = language === 'id';
 const statusLabels: Record<string, [string, string]> = {
  awaiting_approval: ['Awaiting review', 'Menunggu tinjauan'], approved: ['Approved; ready to save', 'Disetujui; siap disimpan'],
  committed: ['Saved; verification pending', 'Tersimpan; menunggu verifikasi'], committed_unverified: ['Saved; verification required', 'Tersimpan; perlu verifikasi'],
  conflicted: ['Grades changed; new review required', 'Nilai berubah; perlu tinjauan baru'], expired: ['Review expired', 'Tinjauan kedaluwarsa'],
  rejected: ['Rejected', 'Ditolak'], cancelled: ['Cancelled', 'Dibatalkan'], failed: ['Operation failed', 'Operasi gagal'],
 };
 const statusLabel = statusLabels[proposal.status]?.[id ? 1 : 0] || (id ? 'Periksa status operasi' : 'Check operation status');
 const completed = proposal.status === 'verified';
 const canApprove = ['awaiting_approval', 'approved'].includes(proposal.status);
 const run = async (work: () => Promise<void>) => {
  if (busy) return;
  setBusy(true); setError('');
  try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to complete grade operation.'); }
  finally { setBusy(false); }
 };
 return <section aria-label={id ? 'Tinjau perubahan nilai' : 'Review grade changes'}>
  <h2>{id ? 'Tinjau perubahan nilai' : 'Review grade changes'}</h2>
  <p>{courseLabel}</p>
  <p>{id ? 'Sumber' : 'Source'}: {sourceLabel}. {id ? 'Ini hanya nilai kerja; publikasi memerlukan tindakan terpisah.' : 'Working grades only; publication requires a separate action.'}</p>
  <p role="status" aria-live="polite">{completed ? (id ? 'Nilai kerja tersimpan dan terverifikasi. Publikasi tetap terpisah.' : 'Working grades saved and verified. Publication remains separate.') : statusLabel}</p>
  <dl><dt>{id ? 'Operasi / revisi' : 'Operation / revision'}</dt><dd>{proposal.id} / {proposal.revision}</dd><dt>SHA / hash</dt><dd style={{ overflowWrap: 'anywhere' }}>{proposal.payloadHash}</dd></dl>
  <p>{proposal.items.length} {id ? 'sel berubah. Tinjau nilai dan catatan persis di bawah.' : 'changed cells. Review the exact scores and notes below.'}</p>
  <div style={{ overflowX: 'auto', maxHeight: '50vh' }} tabIndex={0} aria-label={id ? 'Rincian perubahan' : 'Change details'}>
   <table className="gb-table"><thead><tr><th>NIM / {id ? 'Nama' : 'Name'}</th><th>{id ? 'Komponen / maksimum' : 'Component / maximum'}</th><th>{id ? 'Sebelum' : 'Before'}</th><th>{id ? 'Sesudah' : 'After'}</th></tr></thead>
    <tbody>{proposal.items.map((item, index) => {
     const student = students.find(row => row.id === item.studentId);
     const component = components.find(row => row.id === item.componentId);
     return <tr key={`${item.componentId}-${item.studentId}-${index}`}><th scope="row">{item.baseline?.student?.nim || student?.nim || item.studentId}<br />{student?.name}</th><td>{item.baseline?.component?.name || component?.name || item.componentId} / {item.baseline?.component?.maxScore ?? component?.maxScore ?? '—'}</td><td><pre style={{ whiteSpace: 'pre-wrap' }}>{stateText(item.before)}</pre></td><td><pre style={{ whiteSpace: 'pre-wrap' }}>{stateText(item.after)}</pre></td></tr>;
    })}</tbody>
   </table>
  </div>
  {error && <p role="alert">{error}</p>}
  {['conflicted', 'failed', 'expired'].includes(proposal.status) && <p role="alert">{id ? 'Usulan tidak dapat diterapkan. Tutup dan siapkan tinjauan baru.' : 'This proposal cannot be applied. Close it and prepare a new review.'}</p>}
  {proposal.status === 'committed_unverified' && <p role="alert">{id ? 'Perubahan mungkin sudah tersimpan. Periksa status; jangan buat operasi ulang.' : 'Changes may already be saved. Check status; do not create a duplicate operation.'}</p>}
  <div className="ld-actions">
   <button className="ld-outline-action" disabled={busy} onClick={onClose}>{id ? 'Tutup' : 'Close'}</button>
   {onReject && canApprove && <button className="ld-outline-action" disabled={busy} onClick={() => void run(onReject)}>{id ? 'Tolak' : 'Reject'}</button>}
   {onRefresh && <button className="ld-outline-action" disabled={busy} onClick={() => void run(onRefresh)}>{id ? 'Periksa status' : 'Check status'}</button>}
   {canApprove && <button className="ld-primary-action" disabled={busy || !proposal.items.length} onClick={() => void run(onApprove)}>{busy ? (id ? 'Menyimpan…' : 'Saving…') : id ? `Setujui dan simpan ${proposal.items.length} perubahan` : `Approve and save ${proposal.items.length} changes`}</button>}
  </div>
 </section>;
}
