/// <reference path="../pb_data/types.d.ts" />

/**
 * Structured RPS records + relationships.
 *
 * New ordered, course-scoped collections:
 *   cpl         — Capaian Pembelajaran Lulusan
 *   cpmk        — Capaian Pembelajaran Mata Kuliah (parent: cpl, optional)
 *   sub_cpmk    — Sub-CPMK (parent: cpmk, optional)
 *   topics      — Topik / materi mata kuliah
 *   assessments — Komponen penilaian (with optional weight %)
 *
 * Each is owner-scoped on writes (faculty only) and readable by every signed-in
 * user (students browse the catalog), mirroring courses/class_sessions.
 *
 * class_sessions gains multi-select relations to cpl / cpmk / sub_cpmk /
 * topics / assessments so a pertemuan can declare which capaian, topik, and
 * penilaian it targets.
 *
 * Backfill: existing courses that already hold composed RPS / syllabus text are
 * scanned for recognizable numbered/bulleted items and those items become
 * structured records. Original text + PDF are preserved untouched; anything
 * ambiguous is left in the original text for the lecturer to review. A course
 * that already has cpl records is skipped, so re-runs never duplicate.
 */

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    const courses = app.findCollectionByNameOrId('courses');

    // Shared rule set: all authed users read, faculty owner writes.
    const readAll = "@request.auth.id != ''";
    const createFaculty =
      "@request.auth.id != '' && @request.body.owner = @request.auth.id && @request.auth.role = 'faculty'";

    const makeOwned = (collection) => {
      collection.listRule = readAll;
      collection.viewRule = readAll;
      collection.createRule = createFaculty;
      collection.updateRule =
        "@request.auth.id != '' && owner = @request.auth.id && @request.body.owner:changed = false && @request.body.course:changed = false";
      collection.deleteRule = "@request.auth.id != '' && owner = @request.auth.id";
      return collection;
    };

    // ── cpl ───────────────────────────────────────────────────
    let cpl;
    try {
      cpl = app.findCollectionByNameOrId('cpl');
    } catch (_) {
      cpl = makeOwned(
        new Collection({
          type: 'base',
          name: 'cpl',
          fields: [
            { name: 'owner', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
            { name: 'course', type: 'relation', required: true, maxSelect: 1, collectionId: courses.id, cascadeDelete: true },
            { name: 'code', type: 'text', max: 40 },
            { name: 'description', type: 'text', required: true, max: 2000 },
            { name: 'order', type: 'number', min: 0 },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: ['CREATE INDEX idx_cpl_course ON cpl (course)'],
        }),
      );
      app.save(cpl);
    }

    // ── cpmk (parent cpl, optional) ───────────────────────────
    let cpmk;
    try {
      cpmk = app.findCollectionByNameOrId('cpmk');
    } catch (_) {
      cpmk = makeOwned(
        new Collection({
          type: 'base',
          name: 'cpmk',
          fields: [
            { name: 'owner', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
            { name: 'course', type: 'relation', required: true, maxSelect: 1, collectionId: courses.id, cascadeDelete: true },
            { name: 'cpl', type: 'relation', required: false, maxSelect: 1, collectionId: cpl.id, cascadeDelete: false },
            { name: 'code', type: 'text', max: 40 },
            { name: 'description', type: 'text', required: true, max: 2000 },
            { name: 'order', type: 'number', min: 0 },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: ['CREATE INDEX idx_cpmk_course ON cpmk (course)'],
        }),
      );
      app.save(cpmk);
    }

    // ── sub_cpmk (parent cpmk, optional) ──────────────────────
    let subCpmk;
    try {
      subCpmk = app.findCollectionByNameOrId('sub_cpmk');
    } catch (_) {
      subCpmk = makeOwned(
        new Collection({
          type: 'base',
          name: 'sub_cpmk',
          fields: [
            { name: 'owner', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
            { name: 'course', type: 'relation', required: true, maxSelect: 1, collectionId: courses.id, cascadeDelete: true },
            { name: 'cpmk', type: 'relation', required: false, maxSelect: 1, collectionId: cpmk.id, cascadeDelete: false },
            { name: 'code', type: 'text', max: 40 },
            { name: 'description', type: 'text', required: true, max: 2000 },
            { name: 'order', type: 'number', min: 0 },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: ['CREATE INDEX idx_sub_cpmk_course ON sub_cpmk (course)'],
        }),
      );
      app.save(subCpmk);
    }

    // ── topics ────────────────────────────────────────────────
    let topics;
    try {
      topics = app.findCollectionByNameOrId('topics');
    } catch (_) {
      topics = makeOwned(
        new Collection({
          type: 'base',
          name: 'topics',
          fields: [
            { name: 'owner', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
            { name: 'course', type: 'relation', required: true, maxSelect: 1, collectionId: courses.id, cascadeDelete: true },
            { name: 'code', type: 'text', max: 40 },
            { name: 'description', type: 'text', required: true, max: 2000 },
            { name: 'order', type: 'number', min: 0 },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: ['CREATE INDEX idx_topics_course ON topics (course)'],
        }),
      );
      app.save(topics);
    }

    // ── assessments (with optional weight %) ──────────────────
    let assessments;
    try {
      assessments = app.findCollectionByNameOrId('assessments');
    } catch (_) {
      assessments = makeOwned(
        new Collection({
          type: 'base',
          name: 'assessments',
          fields: [
            { name: 'owner', type: 'relation', required: true, maxSelect: 1, collectionId: users.id, cascadeDelete: true },
            { name: 'course', type: 'relation', required: true, maxSelect: 1, collectionId: courses.id, cascadeDelete: true },
            { name: 'code', type: 'text', max: 40 },
            { name: 'description', type: 'text', required: true, max: 2000 },
            { name: 'weight', type: 'number', min: 0, max: 100 },
            { name: 'order', type: 'number', min: 0 },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
          indexes: ['CREATE INDEX idx_assessments_course ON assessments (course)'],
        }),
      );
      app.save(assessments);
    }

    // ── Link class_sessions to the structured records ─────────
    const sessions = app.findCollectionByNameOrId('class_sessions');
    const addRel = (name, target) => {
      if (!sessions.fields.getByName(name)) {
        sessions.fields.add(
          new RelationField({
            name,
            required: false,
            maxSelect: 30,
            collectionId: target.id,
            cascadeDelete: false,
          }),
        );
      }
    };
    addRel('cpls', cpl);
    addRel('cpmks', cpmk);
    addRel('subCpmks', subCpmk);
    addRel('topics', topics);
    addRel('assessments', assessments);
    app.save(sessions);

    // ── Backfill existing courses from composed RPS text ───────
    backfillCourses(app, cpl, cpmk, topics, assessments);
  },
  (app) => {
    // Drop session relation fields, then the new collections.
    const sessions = app.findCollectionByNameOrId('class_sessions');
    for (const name of ['cpls', 'cpmks', 'subCpmks', 'topics', 'assessments']) {
      const field = sessions.fields.getByName(name);
      if (field) sessions.fields.remove(field);
    }
    app.save(sessions);

    for (const name of ['sub_cpmk', 'cpmk', 'cpl', 'topics', 'assessments']) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (_) {}
    }
  },
);

// ── Backfill helpers ────────────────────────────────────────────

/** Slice a composed RPS block into a named section's body. */
function extractSection(text, headingPatterns) {
  if (!text) return '';
  var lines = text.split(/\r?\n/);
  var start = -1;
  var headingMatch = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    for (var p = 0; p < headingPatterns.length; p++) {
      if (headingPatterns[p].test(line)) {
        start = i;
        headingMatch = headingPatterns[p];
        break;
      }
    }
    if (start !== -1) break;
  }
  if (start === -1) return '';
  var end = lines.length;
  for (var j = start + 1; j < lines.length; j++) {
    // Next ALL-CAPS heading line marks the end.
    if (/^[A-ZÀ-ÿ][A-ZÀ-ÿ0-9 \-\/\(\)]{6,}$/.test(lines[j].trim())) {
      end = j;
      break;
    }
  }
  var headerRemainder = lines[start].replace(headingMatch, '').trim();
  return [headerRemainder].concat(lines.slice(start + 1, end)).join('\n').trim();
}

/**
 * Split a section body into ordered items. Recognizes numbered, lettered, and
 * bulleted markers; preserves a leading code (e.g. "CPL-1", "1") when present.
 * Non-itemized prose is ignored — only clearly itemized lines become records,
 * so ambiguous text stays in the original RPS for manual review.
 */
function splitItems(body) {
  if (!body) return [];
  var lines = body.split(/\r?\n/);
  var items = [];
  var current = null;
  // Markers: "CPL-1", "CPMK 1", "1.", "1)", "a.", "a)", "•", "-", "*"
  var itemRe =
    /^\s*(?:([A-Za-z]{1,8}[\-\.]?\s?\d+[A-Za-z0-9]*)|(\d{1,2}[\.\)])|([a-zA-Z][\.\)])|([•\u2022\-\*]))\s+(.*)$/;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line.trim()) continue;
    var m = line.match(itemRe);
    if (m) {
      if (current) items.push(current);
      var rawCode = (m[1] || m[2] || m[3] || '').replace(/[\.\)]\s*$/, '').trim();
      current = { code: rawCode, description: (m[4] || '').trim() };
    } else if (current) {
      current.description += ' ' + line.trim();
    }
  }
  if (current) items.push(current);
  // Keep only items with a real description.
  return items.filter(function (it) {
    return it.description && it.description.length > 0;
  });
}

/** Pull a trailing "20%" weight out of an assessment description. */
function extractWeight(description) {
  var m = description.match(/(\d{1,3})\s*%/);
  if (!m) return null;
  var w = parseInt(m[1], 10);
  if (isNaN(w) || w < 0 || w > 100) return null;
  return w;
}

function backfillCourses(app, cplCol, cpmkCol, topicsCol, assessmentsCol) {
  var courses;
  try {
    courses = app.findRecordsByFilter('courses', "id != ''");
  } catch (_) {
    return;
  }

  courses.forEach(function (course) {
    var courseId = course.id;
    var owner = course.get('owner');
    if (!owner) return;

    // Skip if this course already has structured records (avoid duplicates).
    var existing;
    try {
      existing = app.findRecordsByFilter('cpl', 'course = "' + courseId + '"');
    } catch (_) {
      existing = [];
    }
    if (existing && existing.length > 0) return;

    var rpsText = course.get('rps') || '';
    var syllabusText = course.get('syllabus') || '';

    var cplBody = extractSection(rpsText, [/CAPAIAN PEMBELAJARAN LULUSAN/i, /\bCPL\b/]);
    var cpmkBody = extractSection(rpsText, [/CAPAIAN PEMBELAJARAN MATA KULIAH/i, /\bCPMK\b/]);
    var assessBody = extractSection(rpsText, [/KOMPONEN PENILAIAN/i, /\bPENILAIAN\b/i]);

    var cplItems = splitItems(cplBody);
    var cpmkItems = splitItems(cpmkBody);
    var assessItems = splitItems(assessBody);
    var topicItems = splitItems(syllabusText);

    // Nothing recognizable → leave the original text for manual review.
    if (
      cplItems.length === 0 &&
      cpmkItems.length === 0 &&
      assessItems.length === 0 &&
      topicItems.length === 0
    ) {
      return;
    }

    var order = 0;
    var saveItem = function (col, item, extra) {
      var rec = new Record(col);
      rec.set('owner', owner);
      rec.set('course', courseId);
      rec.set('code', item.code || '');
      rec.set('description', item.description.slice(0, 2000));
      rec.set('order', order);
      order += 1;
      if (extra) {
        var keys = Object.keys(extra);
        for (var k = 0; k < keys.length; k++) rec.set(keys[k], extra[keys[k]]);
      }
      app.save(rec);
      return rec;
    };

    cplItems.forEach(function (item) {
      saveItem(cplCol, item);
    });
    order = 0;
    cpmkItems.forEach(function (item) {
      saveItem(cpmkCol, item);
    });
    order = 0;
    assessItems.forEach(function (item) {
      var w = extractWeight(item.description);
      saveItem(assessmentsCol, item, w != null ? { weight: w } : null);
    });
    order = 0;
    topicItems.forEach(function (item) {
      saveItem(topicsCol, item);
    });
  });
}
