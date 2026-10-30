/// <reference path="../pb_data/types.d.ts" />

/**
 * Extend the RPS model to faithfully represent the Universitas Pendidikan
 * Indonesia (UPI) standard RPS template — the university-wide format every
 * lecturer will import. Adds fields that the previous model dropped:
 *
 * courses:
 *   - reviewerName      "Diperiksa Oleh TPK Program Studi"
 *   - approverName      "Disetujui Oleh Ketua Program Studi"
 *   - demonstrableOutcomes  "Hasil belajar yang dapat diperagakan/ditunjukkan"
 *   - learningSteps     "Langkah Pembelajaran" (prose, distinct from strategi)
 *   - workloadBreakdown full WAKTU BELAJAR MAHASISWA table (JSON)
 *   - workloadIdealHours  "Jumlah Jam Ideal"
 *   - workloadSksMatch  "Kesesuaian dengan jumlah SKS"
 *
 * cpmk:
 *   - taxonomy           "TAKSONOMI" (Bloom level)
 *   - weight             "Bobot" (%)
 *   - criteria           "Kriteria Pencapaian CPMK"
 *
 * collaborative_tasks:
 *   - method             "Metode Pembelajaran"
 *   - weight             "Bobot Penilaian"
 *   - subCpmkNote        "Sub-CPMK" descriptive text
 *   - steps              "Langkah Pengerjaan Tugas"
 *   - outputs            "Rincian Luaran yang Dihasilkan"
 *   - indicators         "Indikator, Kriteria, dan Bobot Penilai"
 *   - notes              "Lain-lain"
 *
 * All additions are optional (required: false) and backward-compatible —
 * existing courses/RPS data keep working; the new fields simply stay empty
 * until an import or manual edit fills them.
 */
migrate(
  (app) => {
    const addField = (collectionName, field) => {
      const collection = app.findCollectionByNameOrId(collectionName);
      if (collection.fields.getByName(field.name)) return;
      collection.fields.add(field);
      app.save(collection);
    };

    // ── courses ──────────────────────────────────────────────
    addField("courses", new TextField({ name: "reviewerName", max: 200 }));
    addField("courses", new TextField({ name: "approverName", max: 200 }));
    addField("courses", new TextField({ name: "demonstrableOutcomes", max: 5000 }));
    addField("courses", new TextField({ name: "learningSteps", max: 10000 }));
    addField("courses", new JSONField({ name: "workloadBreakdown", maxSize: 50000 }));
    addField("courses", new NumberField({ name: "workloadIdealHours", min: 0 }));
    addField("courses", new TextField({ name: "workloadSksMatch", max: 40 }));

    // ── cpmk ─────────────────────────────────────────────────
    addField("cpmk", new NumberField({ name: "taxonomy", min: 0, max: 10 }));
    addField("cpmk", new NumberField({ name: "weight", min: 0, max: 100 }));
    addField("cpmk", new TextField({ name: "criteria", max: 2000 }));

    // ── collaborative_tasks ──────────────────────────────────
    addField("collaborative_tasks", new TextField({ name: "method", max: 200 }));
    addField("collaborative_tasks", new NumberField({ name: "weight", min: 0, max: 100 }));
    addField("collaborative_tasks", new TextField({ name: "subCpmkNote", max: 2000 }));
    addField("collaborative_tasks", new TextField({ name: "steps", max: 10000 }));
    addField("collaborative_tasks", new TextField({ name: "outputs", max: 5000 }));
    addField("collaborative_tasks", new TextField({ name: "indicators", max: 5000 }));
    addField("collaborative_tasks", new TextField({ name: "notes", max: 5000 }));
  },
  (app) => {
    const removeField = (collectionName, fieldName) => {
      try {
        const collection = app.findCollectionByNameOrId(collectionName);
        collection.fields.removeByName(fieldName);
        app.save(collection);
      } catch (e) {
        if (!String(e.message || e).includes("no rows")) throw e;
      }
    };

    ["reviewerName", "approverName", "demonstrableOutcomes", "learningSteps",
     "workloadBreakdown", "workloadIdealHours", "workloadSksMatch"].forEach((f) =>
      removeField("courses", f),
    );
    ["taxonomy", "weight", "criteria"].forEach((f) => removeField("cpmk", f));
    ["method", "weight", "subCpmkNote", "steps", "outputs", "indicators", "notes"].forEach((f) =>
      removeField("collaborative_tasks", f),
    );
  },
);
