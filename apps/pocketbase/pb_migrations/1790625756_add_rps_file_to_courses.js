/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const courses = app.findCollectionByNameOrId("courses");
    courses.fields.add(
      new FileField({
        name: "rpsFile",
        required: false,
        maxSelect: 1,
        maxSize: 10 * 1024 * 1024, // 10MB
        mimeTypes: ["application/pdf"],
      })
    );
    app.save(courses);
  },
  (app) => {
    const courses = app.findCollectionByNameOrId("courses");
    const field = courses.fields.getByName("rpsFile");
    if (field) courses.fields.remove(field);
    app.save(courses);
  }
);
