# Worksheet and assessment clarity

The student worksheet keeps requirements readable rather than truncating them
into small tiles. Decorative task illustrations are suppressed in the focused
worksheet, and an explicit save/submit bar distinguishes an editable draft from
final collection. The writing editor reports saving, unsaved changes and the last
successful save time. Text, group changes, attachment changes and multi-question
answers participate in the unsaved state. Saving remains explicit; this change
does not introduce autosave. Browser exits and client-side route changes warn
before discarding work. Hidden worksheet sections now respect the HTML hidden
attribute even when older component CSS declares a display value.

The lecturer panel separates the published grade from the working rubric score,
shows review progress and criterion weights, and explains which action makes
feedback visible to students. It retains explicit publication confirmation.
The new `reviewDraft` field stores `{ version: 1, finalScore: number | null,
note: string }` alongside reviewed findings and criterion scores. It does not
change published grade fields or original model output when a draft is saved.
Draft hydration and reset include the note and score override; edits made during
a draft save remain unsaved rather than being overwritten by the response.
Switching students via the list, arrows or keyboard also checks unsaved changes.

Apply migration `1791700400_assessment_review_draft.js` before deploying the web
change. Old clients may omit `reviewDraft` without erasing an existing draft.
Ordinary generation resets this field with the other review fields; explicit
force regeneration retains it. Publication stores the confirmed working note and
override as the new draft baseline. This is independent of the exact-passage
retrieval change and can be merged separately.

Validation uses synthetic local coursework; no live student records or provider
calls are required. Check the following before release: edit and save a worksheet;
cancel navigation with unsaved work; save and reopen a lecturer note and override;
confirm the published grade remains unchanged after a draft save; check narrow
layouts and both themes. API regression tests cover draft validation, ownership,
legacy clients and separation from the published record. Existing failures in the
untouched repository test suite are documented in the pull request.
