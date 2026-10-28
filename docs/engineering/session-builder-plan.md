# Lecturer session builder

Proposed scope, 28 October 2026. Extend the existing scheduled-class editor, worksheet editor, material picker, lesson editor, AI draft endpoint and PDF/image quiz-source importer. This document is a plan, not an implemented feature.

## Lecturer workflow

1. Choose the course, meeting and class section, then create a blank session, duplicate an existing one, or select a saved template.
2. Set the start and finish in WIB. Add or reorder activities; show calculated start/end times and remaining unallocated minutes. Do not silently change durations to fit.
3. Edit each activity in a visual worksheet canvas. A left panel holds the activity list, the centre shows the worksheet, and a contextual panel edits the selected block. Include keyboard-accessible move buttons alongside drag handles.
4. Preview the unsaved draft using the actual student renderer at desktop/mobile widths. Try every activity without creating attendance or submissions. Show scheduling locks separately from preview navigation.
5. Review the section, roster count, duration, required activities, student-visible assets and answer keys. Save a draft or schedule the class. Provide a clear final confirmation listing these values.

## First release: enough to rebuild Beim Arzt without developer help

| Block | Lecturer controls | Student output |
| --- | --- | --- |
| Instructions | Main instruction, optional note, optional translation | Concise directions with expandable supporting text |
| Picture matching | Upload/paste images, labels A/B/C or A/P, statements | Labelled gallery with radio choices |
| Multiple choice | Prompt, choices, optional private key | Radio options |
| Gap sentence / passage | Select words and replace with numbered blanks; optional private accepted answers | Compact inline fields; passage appears once |
| Short writing | Prompt, translation toggle, expected response length | Sentence-sized writing area |
| Email / extended writing | Prompt, cue words, optional rubric | Large writing area |
| Audio | Upload/library selection, track label, associated questions | Player beside the relevant exercise |
| Reflection | Editable questions and response lengths | Simple response fields |

Include duplicate activity, duplicate session, save as template, template library, and apply to another section/date. Copy content and permitted asset references only; never copy attendance, attempts, results or publication state. Begin with this existing class as the acceptance fixture and first reusable template.

## Data and rendering

- Introduce a validated, versioned block schema with stable activity, block, question and gap IDs. Store passages with explicit gap references rather than embedding layout conventions inside prompts. Store response length explicitly rather than inferring it from wording.
- Use one renderer in the editor preview and actual student session. Keep existing worksheets readable through a legacy adapter; the current presentation recognises older numbered-gap prompts, but new authoring must create explicit blocks.
- Preserve the existing response map, autosave, server clock, revision checks and submission semantics. Define a compatibility adapter before changing response storage or grading. Keep private answer keys outside student payloads.
- Save draft edits with optimistic revision checks and visible saved/conflict states. Editing or duplicating must retain stable IDs where content is retained. Published sessions with participation need existing restrictions and an explicit amendment/version policy; do not silently invalidate submissions.
- Templates contain reusable content, not an old fixed schedule. Revalidate ownership/access of every copied asset and require the destination section and dates to be selected.

## Second release: import assistance

Reuse PDF/image parsing and generation capabilities within the worksheet canvas: select a library PDF/page range or upload/paste an image, inspect parsed content, choose the exercise/block type, and review each proposed question before adding it. Support manual entry independently of generation. Generated blocks remain editable and are never published automatically.

Add a crop/selection tool and a separate student-visibility decision. An uploaded source stays in the lecturer library; selecting a source for extraction must not publish the entire PDF or full-page image. Only explicitly approved, permitted excerpts/assets appear in the session. Show the final student-visible assets in publication review. Existing faculty/restricted-download protections remain enforced.

Language settings are per activity/block: source language, optional translation, or German only. Do not add bilingual boilerplate to German-only exercises. Academic/RPS links remain lecturer metadata rather than student-facing learning-outcome panels.

## Third release: reusable lessons

Provide editable grammar-card, sentence-building, conjugation and doctor/patient dialogue templates using the existing lesson scene renderer. Offer optional generated drafts, then require lecturer review. Advanced interactive games can follow; they are not required for the first worksheet-builder release.

## Acceptance and delivery

Deliver first release as an end-to-end vertical slice: explicit block schema and validation, editor, unsaved student preview, template duplication and scheduling. Verify the lecturer can recreate all 11 activities and 57 response fields of Beim Arzt for B only, at 13:00–16:30 WIB, without developer scripts. Verify no source PDF leaks, private keys remain private, previews create no attendance, and duplicating does not copy student data. Test inline-gap answer identity, reorder/save/reload, conflict handling, schedule totals, asset access, and mobile keyboard navigation.

Import assistance follows after manual authoring and reuse are reliable. No new voice/video or student screen-monitoring scope is included.
