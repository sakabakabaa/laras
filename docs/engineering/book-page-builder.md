# Build a private activity draft from one book page

## Lecturer flow

On Buat kelas/tugas, choose **Dari halaman buku**, select the course (and meeting for scheduled classes), and upload one PNG/JPEG/WebP image up to 8 MB. A title and extra instructions are optional. The application creates a background import and opens `/app/builder/impor/:jobId`. The completed job links to the editable builder, student preview, original source, and a review report. Recent imports can also be reopened from the normal draft list. Nothing is published automatically.

The model reconstructs readable exercises in page order as native instructions, image galleries (up to four per block), multiple choice, short answer, matching, gap passages, writing rubrics, and reflection. Illustrations are cropped from the uploaded source, rather than replaced by invented remote assets. The source and crops remain lecturer-owned, course-scoped protected library files. Printed keys are stored privately; inferred keys are identified in the report and private grading guidance. Unknown keys are left incomplete. Audio referenced by a printed track number cannot be reconstructed from a photograph: the draft contains an empty audio element, missing dependent keys, and a review warning.

## Assistant tools

- `get_builder_context`: owned course and meetings, available builder workflow.
- `build_from_book_page`: one image attached to the current message, or an owned course library image, plus course/kind/meeting and optional goal/title. Returns a durable job link, never a false completion claim.
- `builder_import_status`: current job result, warnings, builder and preview links.
- `find_builder_media`: scoped library search; no signed URLs returned to the model.
- `validate_builder_draft`: current revision and builder completeness issues.

The in-app assistant uses the existing typed registry. No MCP daemon, new model provider, or browser-control dependency is necessary. An external MCP adapter can later expose the same application services.

## Implementation

`api.builder-import` authenticates the lecturer and uses their PocketBase client. A locked `builder_import_jobs` collection is accessible only through the authenticated custom command route. All commands recheck ownership and academic relationships. Claim/finish operations use an expiring lease in a transaction; finish creates the builder envelope and records the job result atomically with an idempotent creation key. Concurrent polling cannot produce duplicate drafts. No provider or user credentials are stored in import jobs. If the web process restarts, authenticated status/list requests resume queued/expired work.

The web worker resolves the lecturer's existing vision/JSON-capable evaluation model, sends the oriented/resized image and bounded instructions, validates a compact Zod plan, assigns native IDs and grading keys server-side, and saves through the existing builder service. There is at most one repair attempt and three job attempts. Uploads are byte/pixel bounded, decoded with Sharp, stripped of metadata and normalized to PNG. Crop rectangles are bounded to the source. Model output cannot choose arbitrary URLs, ownership, delivery settings, students or publication actions. Existing AI budgets/concurrency and an upload rate limit apply.

## Limits and review

One page per import; photos must be legible. Limits: 12 activities, 120 questions, 24 cropped illustrations. Vision can misread text, infer incorrect keys, or crop imperfectly. The lecturer reviews the editable draft and report before publication. Source recordings must be uploaded separately. Job status reports content completeness separately from schedule/publishing completeness. The model does not fabricate a missing recording or claim the source contains inferred keys.

## Operational checks

Type generation/TypeScript, targeted ESLint, and production build are used for deployment preparation. Automated tests are not added or manually run unless requested. Apply the additive PocketBase migration before serving the new web version (the normal deploy script does so).
