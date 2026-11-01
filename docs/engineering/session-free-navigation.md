# Student preview and session navigation

Class activities now share the overall session opening and closing time. Planned activity minutes remain pacing guidance; they do not gate content, saving, submission, or draft expiration. This applies to existing scheduled-class snapshots and builder runs, including published versions whose stored progression is scheduled or guided. No data migration or reopening of previously finalized attempts is performed. Submitted answers remain immutable.

Scheduled student preview uses the actual classroom answer component and an in-memory transport for saves, validation, check-in and submission. Scratch drafts use a unique preview storage prefix, cleaned on exit/reset. No preview action calls the production write transport. Teacher controls are hidden behind a compact header dropdown; student activity navigation remains available inside the same classroom in preview and live modes. Preview hides private answer keys and real student attempts, attendance and reports.

Builder preview hides its simulation controls behind the same header dropdown and uses a session-wide countdown. Published builder runs use the overall session deadline regardless of activity pacing minutes. Assignment-specific time limits remain unchanged.

The mobile login page shows only its login card at widths up to 640px, with 16px input text and larger touch targets.


Review activities use a controlled accordion, opening the selected activity and retaining unsaved form state when collapsed. The matching widget keeps its captured source card mounted in a stable position, renders a pointer-transparent drag overlay, scopes hit testing to its own worksheet, and clears drag state on release, cancellation, lost capture and window blur. Live and preview timers use a shared HH:MM:SS formatter.

Exit tickets include an optional learning-feedback textarea in both student and preview views. Feedback is stored as `answers.feedback` (trimmed, maximum 4,000 characters), separately from reflection text/worksheet responses. The lecturer sees it inside the exit-ticket review accordion. It does not contribute to completion, grading, attendance, or automatic assessment. Other activity kinds discard this field.

The student dashboard lists only live and upcoming scheduled classes the student may access. `/api/laras/student-scheduled-classes` requires a student account, finds enrolled courses, and reuses classroom roster/section authorization before returning minimal session metadata and the student's own check-in state. Builder-delivery list metadata supplies the same dashboard with class times, the current student's submission state and assignment close time. These feeds are refreshed while the dashboard is visible; a server clock offset drives the session countdown. The dashboard combines formal assignments and published builder assignments by deadline, and removes game widgets from the home page without removing practice.
