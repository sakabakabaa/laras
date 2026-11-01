# Student preview and session navigation

Class activities now share the overall session opening and closing time. Planned activity minutes remain pacing guidance; they do not gate content, saving, submission, or draft expiration. This applies to existing scheduled-class snapshots and builder runs, including published versions whose stored progression is scheduled or guided. No data migration or reopening of previously finalized attempts is performed. Submitted answers remain immutable.

Scheduled student preview uses the actual classroom answer component and an in-memory transport for saves, validation, check-in and submission. Scratch drafts use a unique preview storage prefix, cleaned on exit/reset. No preview action calls the production write transport. Teacher controls are hidden behind a small banner; student activity navigation remains available inside the same classroom in preview and live modes. Preview hides private answer keys and real student attempts, attendance and reports.

Builder preview hides its simulation controls behind the same banner pattern and uses a session-wide countdown. Published builder runs use the overall session deadline regardless of activity pacing minutes. Assignment-specific time limits remain unchanged.

The mobile login page shows only its login card at widths up to 640px, with 16px input text and larger touch targets.
