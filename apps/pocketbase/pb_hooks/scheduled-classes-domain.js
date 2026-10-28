// Pure rules shared by the PocketBase transaction service and Vitest.
function fail(message) { throw new Error(message); }
function text(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function ids(value,max) {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>max||value.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9]{15}$/.test(id)))fail('Pemetaan materi atau capaian tidak valid.');
  return [...new Set(value)];
}
function safeUrl(value) {
  const url = text(value, 2000);
  if (url && (!/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(url) || /[<>"\\]/.test(url))) fail('Tautan materi harus menggunakan HTTPS.');
  return url;
}
function worksheet(value, materials, kind) {
  if (value === undefined || value === null) return undefined;
  if (kind !== 'assignment' && kind !== 'exit_ticket') fail('Lembar kerja hanya untuk tugas atau refleksi.');
  if (!value || !Array.isArray(value.items) || !value.items.length || value.items.length > 30) fail('Lembar kerja memerlukan 1–30 butir.');
  const seen = {};
  const items = value.items.map(item => {
    if (!item || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || seen[item.id]) fail('ID butir lembar kerja tidak valid.');
    seen[item.id] = true;
    const prompt = text(item.prompt, 1000);
    if (!prompt || !['select', 'text'].includes(item.type)) fail('Lengkapi pertanyaan lembar kerja.');
    const options = item.type === 'select' && Array.isArray(item.options) ? item.options.map(o => text(o, 200)) : [];
    if (item.type === 'select' && (options.length < 2 || options.length > 6 || options.some(o => !o) || new Set(options).size !== options.length)) fail('Pilihan lembar kerja tidak valid.');
    return {id: item.id, prompt, ...(item.translation ? {translation: text(item.translation,1000)} : {}), type: item.type, ...(item.type === 'select' ? {options} : {})};
  });
  const sourceMaterialId = text(value.sourceMaterialId, 15);
  if (sourceMaterialId && (!materials.includes(sourceMaterialId) || !Number.isInteger(value.sourcePage) || value.sourcePage < 1 || value.sourcePage > 10000)) fail('Pilih materi terlampir dan nomor halaman PDF yang valid.');
  return {items, ...(sourceMaterialId ? {sourceMaterialId, sourcePage: value.sourcePage, sourceLabel: text(value.sourceLabel, 160)} : {})};
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
        const evidence=q.sourceId&&ids(a.materialIds,8).includes(q.sourceId)?{sourceId:q.sourceId,sourceQuote:text(q.sourceQuote,2000)}:{};
        return {id: 'q' + index, text: text(q.text, 2000), options, correctIndex: q.correctIndex, points, explanation: text(q.explanation, 2000),...evidence};
      });
    } else if (publish && !content && !url && !(a.kind==='material'&&(a.materialIds||[]).length)) fail('Isi materi atau instruksi kegiatan.');
    const materialIds = ids(a.materialIds,8), sheet = worksheet(a.worksheet, materialIds, a.kind);
    return {position, kind: a.kind, title: name, minutes, required: a.required !== false, materialIds,cpmkIds:ids(a.cpmkIds,20),subCpmkIds:ids(a.subCpmkIds,20), snapshot: {content, url, questions, ...(sheet ? {worksheet: sheet} : {})}};
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
  if (activity.snapshot.worksheet) {
    const raw = input.responses;
    if (raw !== undefined && (!raw || typeof raw !== 'object' || Array.isArray(raw))) fail('Jawaban lembar kerja tidak valid.');
    const responses = {}, lines = [];
    for (const item of activity.snapshot.worksheet.items) {
      const value = raw && raw[item.id];
      if (value === undefined || value === '') continue;
      if (typeof value !== 'string' || value.length > 2000 || (item.type === 'select' && !item.options.includes(value))) fail('Jawaban butir lembar kerja tidak valid.');
      responses[item.id] = value.trim(); lines.push(item.prompt + '\n' + value.trim());
    }
    return {responses, text: lines.join('\n\n')};
  }
  return {text: text(input.text, 20000), acknowledged: input.acknowledged === true};
}
function result(activity, answers) {
  if (activity.snapshot.worksheet) return {score: 0, complete: activity.snapshot.worksheet.items.every(item => Boolean(answers.responses && text(answers.responses[item.id], 2000)))};
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
