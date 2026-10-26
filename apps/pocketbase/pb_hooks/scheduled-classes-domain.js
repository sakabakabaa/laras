// Pure rules shared by the PocketBase transaction service and Vitest.
function fail(message) { throw new Error(message); }
function text(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function safeUrl(value) {
  const url = text(value, 2000);
  if (url && (!/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(url) || /[<>"\\]/.test(url))) fail('Tautan materi harus menggunakan HTTPS.');
  return url;
}
function validatePlan(body, now, publish) {
  const title = text(body.title, 200), instructions = text(body.instructions, 10000);
  if (!title) fail('Isi judul kelas.');
  const startsAt = Date.parse(body.startsAt), joinUntil = Date.parse(body.joinUntil);
  if (!Number.isFinite(startsAt) || !Number.isFinite(joinUntil)) fail('Isi waktu mulai dan batas masuk yang valid.');
  if (publish && startsAt <= now) fail('Jadwalkan kelas untuk waktu yang akan datang.');
  if (!Array.isArray(body.activities) || (publish && !body.activities.length) || body.activities.length > 30) fail('Tambahkan 1–30 kegiatan.');
  const activities = body.activities.map((a, position) => {
    if (!a || !['material', 'quiz', 'assignment', 'exit_ticket'].includes(a.kind)) fail('Jenis kegiatan tidak valid.');
    const name = text(a.title, 200), minutes = Number(a.minutes);
    if (!name || !Number.isInteger(minutes) || minutes < 1 || minutes > 600) fail('Isi judul dan durasi kegiatan (1–600 menit).');
    const content = text(a.content, 20000), url = safeUrl(a.url);
    let questions = [];
    if (a.kind === 'quiz') {
      if (!Array.isArray(a.questions) || (publish && !a.questions.length) || a.questions.length > 100) fail('Kuis memerlukan 1–100 soal.');
      questions = a.questions.map((q, index) => {
        if (!q || typeof q !== 'object') fail('Soal tidak valid.');
        const options = Array.isArray(q.options) ? q.options.map(o => text(o, 500)) : [];
        if (options.length < 2 || options.length > 6 || !Number.isInteger(q.correctIndex) || q.correctIndex < -1 || q.correctIndex >= options.length || (publish && (!text(q.text, 2000) || options.some(o => !o) || q.correctIndex < 0))) fail('Lengkapi soal, pilihan, dan kunci jawaban kuis.');
        const points = Number(q.points);
        if (!Number.isFinite(points) || points < 0 || (publish && points === 0) || points > 100) fail('Poin soal harus lebih dari 0 hingga 100.');
        return {id: 'q' + index, text: text(q.text, 2000), options, correctIndex: q.correctIndex, points, explanation: text(q.explanation, 2000)};
      });
    } else if (publish && !content && !url) fail('Isi materi atau instruksi kegiatan.');
    return {position, kind: a.kind, title: name, minutes, required: a.required !== false, snapshot: {content, url, questions}};
  });
  const endsAt = startsAt + activities.reduce((sum, a) => sum + a.minutes * 60000, 0);
  if (endsAt - startsAt > 24 * 3600000 || (publish && (joinUntil < startsAt || joinUntil >= endsAt))) fail('Batas masuk harus berada dalam jadwal kelas (maksimal 24 jam).');
  const lateAfterMin = Number(body.lateAfterMin);
  if (!Number.isInteger(lateAfterMin) || lateAfterMin < 0 || lateAfterMin > 1440) fail('Ambang keterlambatan tidak valid.');
  return {title, instructions, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), joinUntil: new Date(joinUntil).toISOString(), lateAfterMin, activities};
}
function phase(c, now) {
  if (['draft', 'cancelled', 'reviewed', 'closed'].includes(c.status)) return c.status;
  return now < Date.parse(c.startsAt) ? 'scheduled' : now < Date.parse(c.endsAt) ? 'open' : 'closed';
}
function windows(c, activities) {
  let cursor = Date.parse(c.startsAt);
  return activities.map(a => { const startsAt = cursor; cursor += a.minutes * 60000; return {...a, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(cursor).toISOString()}; });
}
function cleanAnswers(activity, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Jawaban tidak valid.');
  if (activity.kind === 'quiz') {
    const result = {};
    for (const q of activity.snapshot.questions) {
      const value = input[q.id];
      if (value === undefined || value === null) continue;
      if (!Number.isInteger(value) || value < 0 || value >= q.options.length) fail('Pilihan jawaban tidak valid.');
      result[q.id] = value;
    }
    return result;
  }
  return {text: text(input.text, 20000), acknowledged: input.acknowledged === true};
}
function result(activity, answers) {
  if (activity.kind === 'quiz') {
    const qs = activity.snapshot.questions, total = qs.reduce((s, q) => s + q.points, 0);
    const earned = qs.reduce((s, q) => s + (answers[q.id] === q.correctIndex ? q.points : 0), 0);
    return {score: total ? Math.round(earned / total * 10000) / 100 : 0, complete: qs.every(q => Number.isInteger(answers[q.id]))};
  }
  return {score: 0, complete: activity.kind === 'material' ? answers.acknowledged === true : Boolean(text(answers.text, 20000))};
}
function attendance(c, participant, activities, attempts) {
  const required = activities.filter(a => a.required);
  const completed = required.filter(a => attempts.some(t => t.activity === a.id && t.status !== 'draft' && t.complete)).length;
  if (!participant || !participant.checkedInAt) return {suggestion: 'absent', completed, total: required.length, reason: 'Belum check-in'};
  if (completed < required.length) return {suggestion: 'absent', completed, total: required.length, reason: 'Kegiatan wajib belum lengkap; tinjau bukti'};
  const late = Date.parse(participant.checkedInAt) > Date.parse(c.startsAt) + c.lateAfterMin * 60000;
  return {suggestion: late ? 'late' : 'present', completed, total: required.length, reason: late ? 'Check-in terlambat; kegiatan lengkap' : 'Check-in dan kegiatan wajib lengkap'};
}
module.exports = {validatePlan, phase, windows, cleanAnswers, result, attendance};
