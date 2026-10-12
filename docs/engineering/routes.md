# Registered routes

Generated from [routes.ts](../../apps/web/src/routes.ts). Course child patterns are relative to `/app/courses/:courseId`. The course index has that parent URL. Other routes are root-relative. Method exports indicate the handler entry points; read its validation and authentication for the full request contract.

| Pattern | Source | Handler exports |
|---|---|---|
| `/` | [apps/web/src/routes/home.tsx](../../apps/web/src/routes/home.tsx) | Component / route module |
| `hcgi/platform/api/*` | [apps/web/src/routes/hcgi.platform.$.ts](../../apps/web/src/routes/hcgi.platform.$.ts) | action, loader |
| `login` | [apps/web/src/routes/login.tsx](../../apps/web/src/routes/login.tsx) | Component / route module |
| `app` | [apps/web/src/routes/app.tsx](../../apps/web/src/routes/app.tsx) | HydrateFallback, clientLoader |
| `analytics` | [apps/web/src/routes/analytics.tsx](../../apps/web/src/routes/analytics.tsx) | HydrateFallback, clientLoader |
| `app/penilaian` | [apps/web/src/routes/app.penilaian.tsx](../../apps/web/src/routes/app.penilaian.tsx) | HydrateFallback, clientLoader |
| `kalender` | [apps/web/src/routes/kalender.tsx](../../apps/web/src/routes/kalender.tsx) | HydrateFallback, clientLoader |
| `app/courses` | [apps/web/src/routes/app.courses.tsx](../../apps/web/src/routes/app.courses.tsx) | HydrateFallback, clientLoader |
| `app/student` | [apps/web/src/routes/app.student.tsx](../../apps/web/src/routes/app.student.tsx) | HydrateFallback, clientLoader |
| `app/latihan` | [apps/web/src/routes/app.latihan.tsx](../../apps/web/src/routes/app.latihan.tsx) | HydrateFallback, clientLoader |
| `app/onboarding` | [apps/web/src/routes/app.onboarding.tsx](../../apps/web/src/routes/app.onboarding.tsx) | HydrateFallback, clientLoader |
| `app/pengaturan` | [apps/web/src/routes/app.pengaturan.tsx](../../apps/web/src/routes/app.pengaturan.tsx) | HydrateFallback, clientLoader |
| `app/coming/:slug` | [apps/web/src/routes/app.coming.$slug.tsx](../../apps/web/src/routes/app.coming.$slug.tsx) | HydrateFallback, clientLoader |
| `app/tugas` | [apps/web/src/routes/app.tugas.tsx](../../apps/web/src/routes/app.tugas.tsx) | HydrateFallback, clientLoader |
| `app/tugas/buat` | [apps/web/src/routes/app.tugas.buat.tsx](../../apps/web/src/routes/app.tugas.buat.tsx) | HydrateFallback, clientLoader |
| `app/tugas/insights` | [apps/web/src/routes/app.tugas.insights.tsx](../../apps/web/src/routes/app.tugas.insights.tsx) | HydrateFallback, clientLoader |
| `app/riset` | [apps/web/src/routes/app.riset.tsx](../../apps/web/src/routes/app.riset.tsx) | HydrateFallback, clientLoader |
| `app/asisten` | [apps/web/src/routes/app.asisten.tsx](../../apps/web/src/routes/app.asisten.tsx) | HydrateFallback, clientLoader |
| `app/berkas` | [apps/web/src/routes/app.berkas.tsx](../../apps/web/src/routes/app.berkas.tsx) | HydrateFallback, clientLoader |
| `app/berkas/:fileId` | [apps/web/src/routes/app.berkas.$fileId.tsx](../../apps/web/src/routes/app.berkas.$fileId.tsx) | HydrateFallback, clientLoader |
| `app/tugas/:assignmentId` | [apps/web/src/routes/app.tugas.$assignmentId.tsx](../../apps/web/src/routes/app.tugas.$assignmentId.tsx) | HydrateFallback, clientLoader |
| `app/tugas/:assignmentId/pratinjau` | [apps/web/src/routes/app.tugas.$assignmentId.pratinjau.tsx](../../apps/web/src/routes/app.tugas.$assignmentId.pratinjau.tsx) | HydrateFallback, clientLoader |
| `app/kerja/:assignmentId` | [apps/web/src/routes/app.kerja.$assignmentId.tsx](../../apps/web/src/routes/app.kerja.$assignmentId.tsx) | HydrateFallback, clientLoader |
| `app/courses/:courseId` | [apps/web/src/routes/course.tsx](../../apps/web/src/routes/course.tsx) | HydrateFallback, clientLoader |
| `app/courses/:courseId` | [apps/web/src/routes/course.index.tsx](../../apps/web/src/routes/course.index.tsx) | Component / route module |
| `app/courses/:courseId/pertemuan/:sessionId/rencana` | [apps/web/src/routes/course.lesson-plan.tsx](../../apps/web/src/routes/course.lesson-plan.tsx) | Component / route module |
| `app/courses/:courseId/mahasiswa/:rosterId` | [apps/web/src/routes/course.student-profile.tsx](../../apps/web/src/routes/course.student-profile.tsx) | Component / route module |
| `app/courses/:courseId/:section` | [apps/web/src/routes/course.section.tsx](../../apps/web/src/routes/course.section.tsx) | clientLoader |
| `app/rps/:courseId` | [apps/web/src/routes/app.rps.$courseId.tsx](../../apps/web/src/routes/app.rps.$courseId.tsx) | HydrateFallback, clientLoader |
| `sitemap.xml` | [apps/web/src/routes/sitemap.xml.ts](../../apps/web/src/routes/sitemap.xml.ts) | loader |
| `robots.txt` | [apps/web/src/routes/robots.txt.ts](../../apps/web/src/routes/robots.txt.ts) | loader |
| `api/health` | [apps/web/src/routes/api.health.ts](../../apps/web/src/routes/api.health.ts) | loader |
| `api/rps-import` | [apps/web/src/routes/api.rps-import.ts](../../apps/web/src/routes/api.rps-import.ts) | action |
| `api/rps-assist` | [apps/web/src/routes/api.rps-assist.ts](../../apps/web/src/routes/api.rps-assist.ts) | action |
| `api/assignment-draft` | [apps/web/src/routes/api.assignment-draft.ts](../../apps/web/src/routes/api.assignment-draft.ts) | action |
| `api/task-config-draft` | [apps/web/src/routes/api.task-config-draft.ts](../../apps/web/src/routes/api.task-config-draft.ts) | action |
| `api/rubric-suggestions` | [apps/web/src/routes/api.rubric-suggestions.ts](../../apps/web/src/routes/api.rubric-suggestions.ts) | action |
| `api/course-thumbnail` | [apps/web/src/routes/api.course-thumbnail.ts](../../apps/web/src/routes/api.course-thumbnail.ts) | action |
| `api/task-submit` | [apps/web/src/routes/api.task-submit.ts](../../apps/web/src/routes/api.task-submit.ts) | action |
| `api/task-assist` | [apps/web/src/routes/api.task-assist.ts](../../apps/web/src/routes/api.task-assist.ts) | action |
| `api/feedback` | [apps/web/src/routes/api.feedback.ts](../../apps/web/src/routes/api.feedback.ts) | action |
| `api/evaluation-draft` | [apps/web/src/routes/api.evaluation-draft.ts](../../apps/web/src/routes/api.evaluation-draft.ts) | action |
| `api/evaluation-participants` | [apps/web/src/routes/api.evaluation-participants.ts](../../apps/web/src/routes/api.evaluation-participants.ts) | action |
| `api/evaluation-review` | [apps/web/src/routes/api.evaluation-review.ts](../../apps/web/src/routes/api.evaluation-review.ts) | action |
| `api/evaluation-annotation` | [apps/web/src/routes/api.evaluation-annotation.ts](../../apps/web/src/routes/api.evaluation-annotation.ts) | action |
| `api/evaluation-missed-error` | [apps/web/src/routes/api.evaluation-missed-error.ts](../../apps/web/src/routes/api.evaluation-missed-error.ts) | action |
| `api/evaluation-publish` | [apps/web/src/routes/api.evaluation-publish.ts](../../apps/web/src/routes/api.evaluation-publish.ts) | action |
| `api/research-export` | [apps/web/src/routes/api.research-export.ts](../../apps/web/src/routes/api.research-export.ts) | action |
| `api/research-analytics` | [apps/web/src/routes/api.research-analytics.ts](../../apps/web/src/routes/api.research-analytics.ts) | action |
| `api/personalization-analytics` | [apps/web/src/routes/api.personalization-analytics.ts](../../apps/web/src/routes/api.personalization-analytics.ts) | action |
| `api/feedback-uptake` | [apps/web/src/routes/api.feedback-uptake.ts](../../apps/web/src/routes/api.feedback-uptake.ts) | action |
| `api/evaluation-result` | [apps/web/src/routes/api.evaluation-result.ts](../../apps/web/src/routes/api.evaluation-result.ts) | action |
| `api/bulk-paper-prepare` | [apps/web/src/routes/api.bulk-paper-prepare.ts](../../apps/web/src/routes/api.bulk-paper-prepare.ts) | action |
| `api/bulk-paper-extract` | [apps/web/src/routes/api.bulk-paper-extract.ts](../../apps/web/src/routes/api.bulk-paper-extract.ts) | action |
| `api/bulk-paper-submit` | [apps/web/src/routes/api.bulk-paper-submit.ts](../../apps/web/src/routes/api.bulk-paper-submit.ts) | action |
| `api/transcribe` | [apps/web/src/routes/api.transcribe.ts](../../apps/web/src/routes/api.transcribe.ts) | action |
| `api/check-answer` | [apps/web/src/routes/api.check-answer.ts](../../apps/web/src/routes/api.check-answer.ts) | action |
| `api/roster-enroll` | [apps/web/src/routes/api.roster-enroll.ts](../../apps/web/src/routes/api.roster-enroll.ts) | action |
| `api/roster-status` | [apps/web/src/routes/api.roster-status.ts](../../apps/web/src/routes/api.roster-status.ts) | action |
| `api/roster-reset-password` | [apps/web/src/routes/api.roster-reset-password.ts](../../apps/web/src/routes/api.roster-reset-password.ts) | action |
| `api/roster-language` | [apps/web/src/routes/api.roster-language.ts](../../apps/web/src/routes/api.roster-language.ts) | action |
| `api/student-password` | [apps/web/src/routes/api.student-password.ts](../../apps/web/src/routes/api.student-password.ts) | action |
| `api/recovery-email/request` | [apps/web/src/routes/api.recovery-email-request.ts](../../apps/web/src/routes/api.recovery-email-request.ts) | action |
| `api/recovery-email/verify` | [apps/web/src/routes/api.recovery-email-verify.ts](../../apps/web/src/routes/api.recovery-email-verify.ts) | action |
| `api/recovery-email/request-reset` | [apps/web/src/routes/api.recovery-email-request-reset.ts](../../apps/web/src/routes/api.recovery-email-request-reset.ts) | action |
| `api/recovery-email/reset-password` | [apps/web/src/routes/api.recovery-email-reset-password.ts](../../apps/web/src/routes/api.recovery-email-reset-password.ts) | action |
| `api/practice-assist` | [apps/web/src/routes/api.practice-assist.ts](../../apps/web/src/routes/api.practice-assist.ts) | action |
| `api/conversation-practice` | [apps/web/src/routes/api.conversation-practice.ts](../../apps/web/src/routes/api.conversation-practice.ts) | action |
| `api/personal-practice` | [apps/web/src/routes/api.personal-practice.ts](../../apps/web/src/routes/api.personal-practice.ts) | action |
| `api/course-grade-summary` | [apps/web/src/routes/api.course-grade-summary.ts](../../apps/web/src/routes/api.course-grade-summary.ts) | action |
| `api/student-profile` | [apps/web/src/routes/api.student-profile.ts](../../apps/web/src/routes/api.student-profile.ts) | action |
| `api/practice-speaking` | [apps/web/src/routes/api.practice-speaking.ts](../../apps/web/src/routes/api.practice-speaking.ts) | action |
| `api/berkas-parse` | [apps/web/src/routes/api.berkas-parse.ts](../../apps/web/src/routes/api.berkas-parse.ts) | action |
| `api/berkas-process` | [apps/web/src/routes/api.berkas-process.ts](../../apps/web/src/routes/api.berkas-process.ts) | action |
| `api/berkas-suggest` | [apps/web/src/routes/api.berkas-suggest.ts](../../apps/web/src/routes/api.berkas-suggest.ts) | action |
| `api/berkas-snapshot` | [apps/web/src/routes/api.berkas-snapshot.ts](../../apps/web/src/routes/api.berkas-snapshot.ts) | action |
| `api/berkas-restore` | [apps/web/src/routes/api.berkas-restore.ts](../../apps/web/src/routes/api.berkas-restore.ts) | action |
| `api/context/check` | [apps/web/src/routes/api.context-check.ts](../../apps/web/src/routes/api.context-check.ts) | action |
| `api/context/insights` | [apps/web/src/routes/api.context-insights.ts](../../apps/web/src/routes/api.context-insights.ts) | action |
| `api/context/material` | [apps/web/src/routes/api.context-material.ts](../../apps/web/src/routes/api.context-material.ts) | action |
| `api/recommendations/generate` | [apps/web/src/routes/api.recommendations-generate.ts](../../apps/web/src/routes/api.recommendations-generate.ts) | action |
| `api/recommendations/review` | [apps/web/src/routes/api.recommendations-review.ts](../../apps/web/src/routes/api.recommendations-review.ts) | action |
| `verifikasi-email` | [apps/web/src/routes/verifikasi-email.tsx](../../apps/web/src/routes/verifikasi-email.tsx) | Component / route module |
| `lupa-sandi` | [apps/web/src/routes/lupa-sandi.tsx](../../apps/web/src/routes/lupa-sandi.tsx) | Component / route module |
| `reset-password` | [apps/web/src/routes/reset-password.tsx](../../apps/web/src/routes/reset-password.tsx) | Component / route module |
| `tugas/:token` | [apps/web/src/routes/tugas.$token.tsx](../../apps/web/src/routes/tugas.$token.tsx) | HydrateFallback, clientLoader |
| `api/integrated-ai/stream` | [apps/web/src/routes/api.integrated-ai.stream.ts](../../apps/web/src/routes/api.integrated-ai.stream.ts) | action |
| `api/ai-usage` | [apps/web/src/routes/api.ai-usage.ts](../../apps/web/src/routes/api.ai-usage.ts) | action |
| `api/lesson-plans` | [apps/web/src/routes/api.lesson-plans.ts](../../apps/web/src/routes/api.lesson-plans.ts) | action |
| `api/agent-tasks` | [apps/web/src/routes/api.agent-tasks.ts](../../apps/web/src/routes/api.agent-tasks.ts) | action |
| `api/assistant` | [apps/web/src/routes/api.assistant.ts](../../apps/web/src/routes/api.assistant.ts) | action |
| `api/student-assistant` | [apps/web/src/routes/api.student-assistant.ts](../../apps/web/src/routes/api.student-assistant.ts) | action |
| `api/*` | [apps/web/src/routes/api.$.ts](../../apps/web/src/routes/api.$.ts) | action, loader |
