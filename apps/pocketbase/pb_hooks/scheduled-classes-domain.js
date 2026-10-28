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
const BLOCK_TYPES = ['acknowledgement','instructions','image','audio','match','gap','passage','writing','reflection','lesson'];
function bilingual(value) {
  if (!value || typeof value !== 'object') return {};
  const de = text(value.de, 2000), id = text(value.id, 2000);
  return {...(de ? {de} : {}), ...(id ? {id} : {})};
}
function segmentList(value) {
  if (!Array.isArray(value) || !value.length || value.length > 80) fail('Segmen blok tidak valid.');
  return value.map(segment => {
    if (!segment || typeof segment !== 'object') fail('Segmen blok tidak valid.');
    if (segment.type === 'gap') {
      if (typeof segment.itemId !== 'string' || !segment.itemId) fail('Celah blok tidak valid.');
      return {type: 'gap', itemId: segment.itemId};
    }
    if (segment.type !== 'text') fail('Jenis segmen tidak valid.');
    const textValue = bilingual(segment.text);
    if (!textValue.de && !textValue.id) fail('Teks segmen kosong.');
    return {type: 'text', text: textValue};
  });
}
// Presentation blocks reference the canonical worksheet items and never own a
// response id. Every item must have exactly one answering location; audio
// narration may mention items without answering them.
function worksheetBlocks(value, itemsById) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || !value.length || value.length > 60) fail('Blok lembar kerja memerlukan 1–60 blok.');
  const seen = {}, locations = {}, blocks = [];
  const gapOrder = segments => (Array.isArray(segments) ? segments : []).filter(s => s && s.type === 'gap').map(s => s.itemId);
  const bump = (itemId, where) => {
    if (typeof itemId !== 'string' || !itemsById[itemId]) fail('Blok ' + where + ' merujuk butir yang tidak ada.');
    locations[itemId] = (locations[itemId] || 0) + 1;
  };
  for (const block of value) {
    if (!block || !/^[a-zA-Z0-9_-]{1,80}$/.test(block.id || '') || seen[block.id]) fail('ID blok tidak valid.');
    seen[block.id] = true;
    if (!BLOCK_TYPES.includes(block.type)) fail('Jenis blok tidak valid.');
    const out = {id: block.id, type: block.type};
    if (block.type === 'acknowledgement') {
      if (block.storage !== 'answers.acknowledged') fail('Blok konfirmasi harus menyimpan ke answers.acknowledged.');
      out.prompt = bilingual(block.prompt);
      out.storage = 'answers.acknowledged';
    } else if (block.type === 'lesson') {
      if (block.source !== 'activity.lesson' || block.editable !== false) fail('Blok pelajaran harus merujuk activity.lesson dan hanya-baca.');
      out.source = 'activity.lesson';
      out.editable = false;
    } else if (block.type === 'instructions' || block.type === 'image') {
      out.body = bilingual(block.body || block.alt);
      if (block.title) out.title = bilingual(block.title);
      if (block.caption) out.caption = bilingual(block.caption);
      if (block.asset) out.asset = text(block.asset, 80);
    } else if (block.type === 'audio') {
      out.asset = text(block.asset, 80);
      if (!out.asset) fail('Blok audio memerlukan berkas.');
      if (block.label) out.label = text(block.label, 80);
      const related = Array.isArray(block.relatedItemIds) ? block.relatedItemIds.filter(id => typeof id === 'string') : [];
      for (const id of related) if (!itemsById[id]) fail('Blok audio merujuk butir yang tidak ada.');
      if (related.length) out.relatedItemIds = [...new Set(related)];
    } else if (block.type === 'match') {
      if (block.layout !== 'destinations-above') fail('Tata letak blok pencocokan tidak valid.');
      const labels = new Set();
      const destinations = (Array.isArray(block.destinations) ? block.destinations : []).map(destination => {
        const label = text(destination && destination.label, 40);
        if (!label || labels.has(label)) fail('Tujuan blok pencocokan tidak valid.');
        labels.add(label);
        return {id: text(destination.id, 80) || label, label, title: bilingual(destination.title), ...(text(destination.image, 15) ? {image: text(destination.image, 15)} : {})};
      });
      if (destinations.length < 2 || destinations.length > 6) fail('Blok pencocokan memerlukan 2–6 tujuan.');
      const cards = Array.isArray(block.cardItemIds) ? block.cardItemIds.filter(id => typeof id === 'string') : [];
      if (!cards.length || cards.length > 30) fail('Blok pencocokan memerlukan 1–30 kartu.');
      for (const id of cards) bump(id, 'pencocokan');
      out.prompt = bilingual(block.prompt);
      out.layout = 'destinations-above';
      out.destinations = destinations;
      out.cardItemIds = [...new Set(cards)];
    } else if (block.type === 'gap') {
      out.segments = segmentList(block.segments);
      const main = gapOrder(out.segments);
      if (!main.length) fail('Blok celah memerlukan minimal satu celah.');
      for (const id of main) bump(id, 'celah');
      if (block.segmentsId) {
        out.segmentsId = segmentList(block.segmentsId);
        const translated = gapOrder(out.segmentsId);
        if (main.length !== translated.length || main.some((id, index) => id !== translated[index])) fail('Urutan celah terjemahan tidak sama.');
      }
    } else if (block.type === 'passage') {
      const sections = Array.isArray(block.sections) ? block.sections : [];
      if (!sections.length || sections.length > 12) fail('Blok bacaan memerlukan 1–12 bagian.');
      const sectionIds = new Set();
      out.sections = sections.map(section => {
        const id = text(section && section.id, 80);
        if (!id || sectionIds.has(id)) fail('ID bagian bacaan tidak valid.');
        sectionIds.add(id);
        const segments = segmentList(section.segments);
        for (const itemId of gapOrder(segments)) bump(itemId, 'bacaan');
        return {id, ...(section.heading ? {heading: bilingual(section.heading)} : {}), segments};
      });
      if (block.prompt) out.prompt = bilingual(block.prompt);
    } else if (block.type === 'writing') {
      if (typeof block.itemId !== 'string' || !itemsById[block.itemId]) fail('Blok menulis merujuk butir yang tidak ada.');
      if (!['short', 'extended'].includes(block.responseLength)) fail('Panjang jawaban blok menulis tidak valid.');
      bump(block.itemId, 'menulis');
      out.itemId = block.itemId;
      out.prompt = bilingual(block.prompt);
      out.responseLength = block.responseLength;
      if (block.rows !== undefined) {
        if (!Number.isInteger(block.rows) || block.rows < 1 || block.rows > 40) fail('Jumlah baris blok menulis tidak valid.');
        out.rows = block.rows;
      }
    } else if (block.type === 'reflection') {
      const list = Array.isArray(block.itemIds) ? block.itemIds.filter(id => typeof id === 'string') : [];
      if (!list.length || list.length > 20) fail('Blok refleksi memerlukan butir.');
      for (const id of list) bump(id, 'refleksi');
      out.itemIds = [...new Set(list)];
      out.prompt = bilingual(block.prompt);
    }
    blocks.push(out);
  }
  for (const itemId of Object.keys(itemsById)) {
    if (locations[itemId] === undefined) fail('Butir ' + itemId + ' tidak punya tempat menjawab.');
    if (locations[itemId] > 1) fail('Butir ' + itemId + ' punya lebih dari satu tempat menjawab.');
  }
  return blocks;
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
  const itemsById = {};
  for (const item of items) itemsById[item.id] = item;
  const blocks = worksheetBlocks(value.blocks, itemsById);
  let answerKey;
  if (value.answerKey !== undefined && value.answerKey !== null) {
    const raw = value.answerKey;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.items || typeof raw.items !== 'object' || Array.isArray(raw.items)) fail('Kunci jawaban lembar kerja tidak valid.');
    const keyed = {};
    for (const [itemId, entry] of Object.entries(raw.items)) {
      const item = itemsById[itemId];
      if (!item || !entry || typeof entry !== 'object' || Array.isArray(entry)) fail('Kunci jawaban merujuk butir yang tidak tersedia.');
      if (entry.mode === 'exact') {
        const accepted = Array.isArray(entry.accepted) ? entry.accepted.map(value => text(value, 2000)).filter(Boolean) : [];
        if (!accepted.length || (item.type === 'select' && accepted.some(value => !item.options.includes(value)))) fail('Jawaban yang diterima tidak valid.');
        const points = entry.points === undefined ? 1 : Number(entry.points);
        if (!Number.isFinite(points) || points <= 0 || points > 100) fail('Poin kunci jawaban harus lebih dari 0 hingga 100.');
        keyed[itemId] = {mode: 'exact', accepted: [...new Set(accepted)], points};
      } else if (entry.mode === 'reference' && item.type === 'text') {
        const modelAnswer = text(entry.modelAnswer, 4000), rubric = text(entry.rubric, 2000);
        if (!modelAnswer && !rubric) fail('Isi contoh jawaban atau panduan penilaian.');
        keyed[itemId] = {mode: 'reference', ...(modelAnswer ? {modelAnswer} : {}), ...(rubric ? {rubric} : {})};
      } else fail('Jenis kunci jawaban tidak sesuai dengan butir.');
    }
    answerKey = {version: 1, items: keyed};
  }
  return {items, ...(sourceMaterialId ? {sourceMaterialId, sourcePage: value.sourcePage, sourceLabel: text(value.sourceLabel, 160)} : {}), ...(blocks ? {blocks} : {}), ...(answerKey ? {answerKey} : {})};
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
  if (activity.snapshot.worksheet) {
    const sheet = activity.snapshot.worksheet, key = sheet.answerKey?.items || {};
    const graded = Object.entries(key).filter(([, entry]) => entry.mode === 'exact');
    const total = graded.reduce((sum, [, entry]) => sum + entry.points, 0);
    const earned = graded.reduce((sum, [itemId, entry]) => {
      const response = text(answers.responses && answers.responses[itemId], 2000);
      const normalized = normalizeAnswer(response);
      return sum + (entry.accepted.some(value => normalizeAnswer(value) === normalized) ? entry.points : 0);
    }, 0);
    return {
      ...(total ? {score: Math.round(earned / total * 10000) / 100} : {}),
      complete: sheet.items.every(item => Boolean(answers.responses && text(answers.responses[item.id], 2000)))
    };
  }
  if (activity.kind === 'quiz') {
    const qs = activity.snapshot.questions, total = qs.reduce((s, q) => s + q.points, 0);
    const earned = qs.reduce((s, q) => s + (answers[q.id] === q.correctIndex ? q.points : 0), 0);
    return {score: total ? Math.round(earned / total * 10000) / 100 : 0, complete: qs.every(q => Number.isInteger(answers[q.id]))};
  }
  return {score: 0, complete: activity.kind === 'material' ? answers.acknowledged === true : Boolean(text(answers.text, 20000))};
}
function normalizeAnswer(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/g, '').toLowerCase();
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
