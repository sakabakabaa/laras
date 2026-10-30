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
function studentPublished(value) {
  return {attempt:value.attempt,activity:value.activity,points:value.points,maxPoints:value.maxPoints,feedback:value.feedback,publishedAt:value.publishedAt};
}
module.exports = {assertGradable, validateSettings, validateGrade, studentPublished};
