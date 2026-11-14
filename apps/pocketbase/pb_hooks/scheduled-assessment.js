function bad(message) { throw new Error(message); }
function assertGradable(kind) { if (!['assignment', 'exit_ticket'].includes(kind)) bad('Kegiatan ini tidak dapat dinilai secara manual.'); }
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function validateSettings(settings) {
  if (!settings || !['ungraded','points','rubric'].includes(settings.mode)) bad('Pengaturan penilaian tidak valid.');
  if (settings.mode === 'ungraded') {
    if (settings.maxPoints !== 0 || !Array.isArray(settings.criteria) || settings.criteria.length) bad('Pengaturan tanpa nilai tidak valid.');
    return {mode:'ungraded',maxPoints:0,criteria:[]};
  }
  if (!finite(settings.maxPoints) || settings.maxPoints <= 0 || settings.maxPoints > 100000) bad('Nilai maksimum tidak valid.');
  const criteria = settings.mode === 'rubric' ? settings.criteria : [];
  if (settings.mode === 'rubric' && (!Array.isArray(criteria) || criteria.length < 1 || criteria.length > 30)) bad('Kriteria rubrik tidak valid.');
  const seen = Object.create(null);
  for (const c of criteria) {
    if (!c || typeof c.id !== 'string' || c.id.length < 1 || c.id.length > 100 || !/^[A-Za-z0-9_-]+$/.test(c.id) || ['__proto__','constructor','prototype'].includes(c.id) || Object.prototype.hasOwnProperty.call(seen,c.id) || typeof c.label !== 'string' || !c.label.trim() || c.label.trim().length > 200 || !finite(c.maxPoints) || c.maxPoints <= 0) bad('Kriteria rubrik tidak valid.');
    seen[c.id] = true;
  }
  if (settings.mode === 'rubric' && Math.abs(criteria.reduce((n,c)=>n+c.maxPoints,0)-settings.maxPoints)>1e-8) bad('Jumlah kriteria tidak sesuai nilai maksimum.');
  return {mode:settings.mode,maxPoints:settings.maxPoints,criteria};
}
function validateGrade(settings, scores, points) {
  if (!settings || !['ungraded','points','rubric'].includes(settings.mode)) bad('Pengaturan penilaian tidak valid.');
  if (settings.mode === 'ungraded') return {points:null,criterionScores:{}};
  const cleanSettings = validateSettings(settings), max = cleanSettings.maxPoints;
  if (settings.mode === 'points') {
    if (!finite(points) || points < 0 || points > max) bad('Nilai berada di luar batas.');
    return {points,criterionScores:{}};
  }
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) bad('Skor rubrik tidak valid.');
  const clean = Object.create(null), ids = Object.create(null); let total=0;
  for (const criterion of cleanSettings.criteria) {
    ids[criterion.id]=true; const score=scores[criterion.id];
    if (!finite(score)||score<0||score>criterion.maxPoints) bad('Skor kriteria berada di luar batas.');
    clean[criterion.id]=score; total+=score;
  }
  if (Object.keys(scores).some(id=>!Object.prototype.hasOwnProperty.call(ids,id))) bad('Skor rubrik tidak valid.');
  return {points:total,criterionScores:clean};
}
// Lecturer decisions on AI findings: [{id:'ai-<n>',quote,status:'approved'|'rejected',rejectReason?}]. Pending findings are simply absent.
function validateReviewFindings(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 40) bad('Tinjauan temuan tidak valid.');
  const seen = Object.create(null), out = [];
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) bad('Tinjauan temuan tidak valid.');
    if (typeof row.id !== 'string' || !/^ai-\d{1,3}$/.test(row.id) || seen[row.id]) bad('Tinjauan temuan tidak valid.');
    if (row.status !== 'approved' && row.status !== 'rejected') bad('Status temuan tidak valid.');
    if (row.quote !== undefined && (typeof row.quote !== 'string' || row.quote.length > 300)) bad('Kutipan temuan tidak valid.');
    if (row.rejectReason !== undefined && (typeof row.rejectReason !== 'string' || row.rejectReason.length > 600)) bad('Alasan penolakan terlalu panjang.');
    seen[row.id] = true;
    const clean = {id:row.id,quote:row.quote||'',status:row.status};
    if (row.status === 'rejected' && row.rejectReason && row.rejectReason.trim()) clean.rejectReason = row.rejectReason.trim();
    out.push(clean);
  }
  if (JSON.stringify(out).length > 20000) bad('Tinjauan temuan terlalu besar.');
  return out;
}
function studentPublished(value) {
  return {attempt:value.attempt,activity:value.activity,points:value.points,maxPoints:value.maxPoints,feedback:value.feedback,publishedAt:value.publishedAt};
}
module.exports = {assertGradable, validateReviewFindings, validateSettings, validateGrade, studentPublished};
