# Source atlas

Generated with `python3 docs/engineering/generate_indexes.py`. Includes web source modules and styles. Imports are static source references; dynamic calls and computed collection names may not appear. For behavior read the linked implementation, not just this index.

## api/integrated-ai-api.ts

Source: [apps/web/src/api/integrated-ai-api.ts](../../apps/web/src/api/integrated-ai-api.ts)

Exports: `AssistantError`, `AssistantStreamEvent`, `ChatMessage`, `clearChatHistory`, `loadChatHistory`, `sendMessage`, `signImageUrl`.

Local dependencies: [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

## components/app/academic-calendar.tsx

Source: [apps/web/src/components/app/academic-calendar.tsx](../../apps/web/src/components/app/academic-calendar.tsx)

Exports: `AcademicCalendar`.

Local dependencies: [apps/web/src/data/academic-calendar.ts](../../apps/web/src/data/academic-calendar.ts), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/course-route.ts](../../apps/web/src/lib/course-route.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/styles/academic-calendar.css](../../apps/web/src/styles/academic-calendar.css).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `class_sessions`, `course_sections`, `courses`, `enrollments`.

Imported by: [apps/web/src/routes/kalender.tsx](../../apps/web/src/routes/kalender.tsx).

## components/app/agent-dock.tsx

Source: [apps/web/src/components/app/agent-dock.tsx](../../apps/web/src/components/app/agent-dock.tsx)

Exports: `AgentDock`, `AgentPane`.

Local dependencies: [apps/web/src/components/app/assistant-panel.tsx](../../apps/web/src/components/app/assistant-panel.tsx), [apps/web/src/lib/assistant-quick-send.ts](../../apps/web/src/lib/assistant-quick-send.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Imported by: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx).

## components/app/agent-task-panel.tsx

Source: [apps/web/src/components/app/agent-task-panel.tsx](../../apps/web/src/components/app/agent-task-panel.tsx)

Exports: `AgentTaskPanel`.

Local dependencies: [apps/web/src/lib/agent-tasks.ts](../../apps/web/src/lib/agent-tasks.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/lesson-plans.ts](../../apps/web/src/lib/lesson-plans.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/student-home-copy.ts](../../apps/web/src/lib/student-home-copy.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `agent_tasks`, `assistant_lesson_plans`, `class_sessions`, `courses`.

Imported by: [apps/web/src/components/app/assistant-panel.tsx](../../apps/web/src/components/app/assistant-panel.tsx), [apps/web/src/components/app/personal-practice.tsx](../../apps/web/src/components/app/personal-practice.tsx), [apps/web/src/components/app/student-home-adventure.tsx](../../apps/web/src/components/app/student-home-adventure.tsx), [apps/web/src/routes/course.lesson-plan.tsx](../../apps/web/src/routes/course.lesson-plan.tsx).

## components/app/ai-evaluation-review.tsx

Source: [apps/web/src/components/app/ai-evaluation-review.tsx](../../apps/web/src/components/app/ai-evaluation-review.tsx)

Exports: `AiEvaluationAnswer`, `AiEvaluationPanel`, `AiEvaluationReviewProvider`, `EvaluatedParticipant`, `EvaluationStatusBadge`.

Local dependencies: [apps/web/src/lib/ai-evaluation.ts](../../apps/web/src/lib/ai-evaluation.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/evaluation-rubric.ts](../../apps/web/src/lib/evaluation-rubric.ts), [apps/web/src/lib/evaluation-scoring.ts](../../apps/web/src/lib/evaluation-scoring.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/research-annotation.ts](../../apps/web/src/lib/research-annotation.ts), [apps/web/src/lib/research-rater-client.ts](../../apps/web/src/lib/research-rater-client.ts).

Package imports: `lucide-react`, `react`, `react-dom`.

Literal database references: `ai_evaluations`.

Imported by: [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx).

## components/app/analytics-index.tsx

Source: [apps/web/src/components/app/analytics-index.tsx](../../apps/web/src/components/app/analytics-index.tsx)

Exports: `AnalyticsIndex`.

Local dependencies: [apps/web/src/components/app/assistant-page-context-provider.tsx](../../apps/web/src/components/app/assistant-page-context-provider.tsx), [apps/web/src/components/app/course-thumb.tsx](../../apps/web/src/components/app/course-thumb.tsx), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/course-route.ts](../../apps/web/src/lib/course-route.ts), [apps/web/src/lib/course-sections.ts](../../apps/web/src/lib/course-sections.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/styles/course-analytics.css](../../apps/web/src/styles/course-analytics.css).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `courses`, `enrollments`.

Imported by: [apps/web/src/routes/analytics.tsx](../../apps/web/src/routes/analytics.tsx).

## components/app/app-modal.tsx

Source: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx)

Exports: `AppModal`, `AppModalProps`.

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-dialog`, `react`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/bulk-paper-input.tsx](../../apps/web/src/components/app/bulk-paper-input.tsx), [apps/web/src/components/app/course-form.tsx](../../apps/web/src/components/app/course-form.tsx), [apps/web/src/components/app/course-resources.tsx](../../apps/web/src/components/app/course-resources.tsx), [apps/web/src/components/app/course-roster.tsx](../../apps/web/src/components/app/course-roster.tsx), [apps/web/src/components/app/course-sections.tsx](../../apps/web/src/components/app/course-sections.tsx), [apps/web/src/components/app/course-thumb-dialog.tsx](../../apps/web/src/components/app/course-thumb-dialog.tsx), [apps/web/src/components/app/file-upload-dialog.tsx](../../apps/web/src/components/app/file-upload-dialog.tsx), [apps/web/src/components/app/file-version-history.tsx](../../apps/web/src/components/app/file-version-history.tsx), [apps/web/src/components/app/lecturer-gradebook.tsx](../../apps/web/src/components/app/lecturer-gradebook.tsx), [apps/web/src/components/app/research-export.tsx](../../apps/web/src/components/app/research-export.tsx), [apps/web/src/components/app/resource-form.tsx](../../apps/web/src/components/app/resource-form.tsx), [apps/web/src/components/app/rps-ai-helper.tsx](../../apps/web/src/components/app/rps-ai-helper.tsx), [apps/web/src/components/app/session-date-autofill.tsx](../../apps/web/src/components/app/session-date-autofill.tsx), [apps/web/src/components/app/session-form.tsx](../../apps/web/src/components/app/session-form.tsx), [apps/web/src/components/app/structured-records.tsx](../../apps/web/src/components/app/structured-records.tsx).

## components/app/app-shell.tsx

Source: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx)

Exports: `AppShell`.

Local dependencies: [apps/web/src/components/app/agent-dock.tsx](../../apps/web/src/components/app/agent-dock.tsx), [apps/web/src/components/app/assistant-page-context-provider.tsx](../../apps/web/src/components/app/assistant-page-context-provider.tsx), [apps/web/src/components/app/global-search.tsx](../../apps/web/src/components/app/global-search.tsx), [apps/web/src/components/app/welcome-tour.tsx](../../apps/web/src/components/app/welcome-tour.tsx), [apps/web/src/components/app/workspace-guide.tsx](../../apps/web/src/components/app/workspace-guide.tsx), [apps/web/src/components/brand/laras-lockup.tsx](../../apps/web/src/components/brand/laras-lockup.tsx), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/hooks/use-theme.ts](../../apps/web/src/hooks/use-theme.ts), [apps/web/src/lib/assistant-quick-send.ts](../../apps/web/src/lib/assistant-quick-send.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/styles/login-light.css](../../apps/web/src/styles/login-light.css).

Package imports: `lucide-react`, `react`, `react-router`.

Imported by: [apps/web/src/components/app/assignment-editor-page.tsx](../../apps/web/src/components/app/assignment-editor-page.tsx), [apps/web/src/components/app/course-dashboard.tsx](../../apps/web/src/components/app/course-dashboard.tsx), [apps/web/src/components/app/courses-page.tsx](../../apps/web/src/components/app/courses-page.tsx), [apps/web/src/components/app/lecturer-assignment-preview.tsx](../../apps/web/src/components/app/lecturer-assignment-preview.tsx), [apps/web/src/components/app/rps-editor-page.tsx](../../apps/web/src/components/app/rps-editor-page.tsx), [apps/web/src/components/app/student-courses.tsx](../../apps/web/src/components/app/student-courses.tsx), [apps/web/src/components/app/student-dashboard.tsx](../../apps/web/src/components/app/student-dashboard.tsx), [apps/web/src/components/app/student-practice.tsx](../../apps/web/src/components/app/student-practice.tsx), [apps/web/src/components/app/student-work-page.tsx](../../apps/web/src/components/app/student-work-page.tsx), [apps/web/src/routes/analytics.tsx](../../apps/web/src/routes/analytics.tsx), [apps/web/src/routes/app.asisten.tsx](../../apps/web/src/routes/app.asisten.tsx), [apps/web/src/routes/app.berkas.$fileId.tsx](../../apps/web/src/routes/app.berkas.$fileId.tsx), [apps/web/src/routes/app.berkas.tsx](../../apps/web/src/routes/app.berkas.tsx), [apps/web/src/routes/app.coming.$slug.tsx](../../apps/web/src/routes/app.coming.$slug.tsx), [apps/web/src/routes/app.onboarding.tsx](../../apps/web/src/routes/app.onboarding.tsx), [apps/web/src/routes/app.pengaturan.tsx](../../apps/web/src/routes/app.pengaturan.tsx), [apps/web/src/routes/app.penilaian.tsx](../../apps/web/src/routes/app.penilaian.tsx), [apps/web/src/routes/app.riset.tsx](../../apps/web/src/routes/app.riset.tsx), [apps/web/src/routes/app.tugas.$assignmentId.tsx](../../apps/web/src/routes/app.tugas.$assignmentId.tsx), [apps/web/src/routes/app.tugas.insights.tsx](../../apps/web/src/routes/app.tugas.insights.tsx), [apps/web/src/routes/app.tugas.tsx](../../apps/web/src/routes/app.tugas.tsx), [apps/web/src/routes/course.tsx](../../apps/web/src/routes/course.tsx), [apps/web/src/routes/kalender.tsx](../../apps/web/src/routes/kalender.tsx).

## components/app/assignment-ai-policy.tsx

Source: [apps/web/src/components/app/assignment-ai-policy.tsx](../../apps/web/src/components/app/assignment-ai-policy.tsx)

Exports: `AssignmentAiPolicy`.

Local dependencies: [apps/web/src/lib/ai-capabilities.ts](../../apps/web/src/lib/ai-capabilities.ts), [apps/web/src/lib/ai-policy-form.ts](../../apps/web/src/lib/ai-policy-form.ts), [apps/web/src/lib/ai-policy.ts](../../apps/web/src/lib/ai-policy.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx).

## components/app/assignment-editor-page.tsx

Source: [apps/web/src/components/app/assignment-editor-page.tsx](../../apps/web/src/components/app/assignment-editor-page.tsx)

Exports: `AssignmentEditorPage`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/assistant-page-context-provider.tsx](../../apps/web/src/components/app/assistant-page-context-provider.tsx), [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assignments`, `courses`.

Imported by: [apps/web/src/routes/app.tugas.buat.tsx](../../apps/web/src/routes/app.tugas.buat.tsx).

## components/app/assignment-form.tsx

Source: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx)

Exports: `AssignmentForm`.

Local dependencies: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx), [apps/web/src/components/app/assignment-ai-policy.tsx](../../apps/web/src/components/app/assignment-ai-policy.tsx), [apps/web/src/components/app/datetime-picker.tsx](../../apps/web/src/components/app/datetime-picker.tsx), [apps/web/src/components/app/form-status.tsx](../../apps/web/src/components/app/form-status.tsx), [apps/web/src/components/app/task-builders/builder-shared.tsx](../../apps/web/src/components/app/task-builders/builder-shared.tsx), [apps/web/src/components/app/task-builders/listening-builder.tsx](../../apps/web/src/components/app/task-builders/listening-builder.tsx), [apps/web/src/components/app/task-builders/quiz-builder.tsx](../../apps/web/src/components/app/task-builders/quiz-builder.tsx), [apps/web/src/components/app/task-builders/reading-builder.tsx](../../apps/web/src/components/app/task-builders/reading-builder.tsx), [apps/web/src/components/app/task-builders/rubric-suggestions.tsx](../../apps/web/src/components/app/task-builders/rubric-suggestions.tsx), [apps/web/src/components/app/task-builders/speaking-builder.tsx](../../apps/web/src/components/app/task-builders/speaking-builder.tsx), [apps/web/src/components/app/task-builders/task-autofill.tsx](../../apps/web/src/components/app/task-builders/task-autofill.tsx), [apps/web/src/components/app/task-builders/writing-builder.tsx](../../apps/web/src/components/app/task-builders/writing-builder.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/components/form-stepper.tsx](../../apps/web/src/components/form-stepper.tsx), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/hooks/use-course-records.ts](../../apps/web/src/hooks/use-course-records.ts), [apps/web/src/hooks/use-course-resources.ts](../../apps/web/src/hooks/use-course-resources.ts), [apps/web/src/lib/ai-capabilities.ts](../../apps/web/src/lib/ai-capabilities.ts), [apps/web/src/lib/ai-policy-form.ts](../../apps/web/src/lib/ai-policy-form.ts), [apps/web/src/lib/assignment-import.ts](../../apps/web/src/lib/assignment-import.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/rubric-suggestions.ts](../../apps/web/src/lib/rubric-suggestions.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assignments`, `class_sessions`, `courses`, `file_library`, `task_answer_keys`.

Imported by: [apps/web/src/components/app/assignment-editor-page.tsx](../../apps/web/src/components/app/assignment-editor-page.tsx), [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx).

## components/app/assistant-clarify.tsx

Source: [apps/web/src/components/app/assistant-clarify.tsx](../../apps/web/src/components/app/assistant-clarify.tsx)

Exports: `AssistantClarify`, `ClarifyQuestion`.

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/assistant-panel.tsx](../../apps/web/src/components/app/assistant-panel.tsx).

## components/app/assistant-page-context-provider.tsx

Source: [apps/web/src/components/app/assistant-page-context-provider.tsx](../../apps/web/src/components/app/assistant-page-context-provider.tsx)

Exports: `AssistantPageContextProvider`, `useAssistantPageContext`.

Local dependencies: [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts).

Package imports: `react`.

Imported by: [apps/web/src/components/app/analytics-index.tsx](../../apps/web/src/components/app/analytics-index.tsx), [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/assignment-editor-page.tsx](../../apps/web/src/components/app/assignment-editor-page.tsx), [apps/web/src/components/app/assistant-panel.tsx](../../apps/web/src/components/app/assistant-panel.tsx), [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/rps-editor-page.tsx](../../apps/web/src/components/app/rps-editor-page.tsx).

## components/app/assistant-panel.tsx

Source: [apps/web/src/components/app/assistant-panel.tsx](../../apps/web/src/components/app/assistant-panel.tsx)

Exports: `AssistantPanel`.

Local dependencies: [apps/web/src/components/app/agent-task-panel.tsx](../../apps/web/src/components/app/agent-task-panel.tsx), [apps/web/src/components/app/assistant-clarify.tsx](../../apps/web/src/components/app/assistant-clarify.tsx), [apps/web/src/components/app/assistant-page-context-provider.tsx](../../apps/web/src/components/app/assistant-page-context-provider.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/lib/assistant/parsing.ts](../../apps/web/src/lib/assistant/parsing.ts), [apps/web/src/lib/assistant/session-stale.ts](../../apps/web/src/lib/assistant/session-stale.ts), [apps/web/src/lib/assistant/ui-labels.ts](../../apps/web/src/lib/assistant/ui-labels.ts), [apps/web/src/lib/assistant-quick-send.ts](../../apps/web/src/lib/assistant-quick-send.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Imported by: [apps/web/src/components/app/agent-dock.tsx](../../apps/web/src/components/app/agent-dock.tsx), [apps/web/src/routes/app.asisten.tsx](../../apps/web/src/routes/app.asisten.tsx).

## components/app/attendance-manager.tsx

Source: [apps/web/src/components/app/attendance-manager.tsx](../../apps/web/src/components/app/attendance-manager.tsx)

Exports: `AttendanceManager`.

Local dependencies: [apps/web/src/components/app/practice-mascot.tsx](../../apps/web/src/components/app/practice-mascot.tsx), [apps/web/src/components/app/session-roster.tsx](../../apps/web/src/components/app/session-roster.tsx), [apps/web/src/hooks/use-attendance.ts](../../apps/web/src/hooks/use-attendance.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx).

## components/app/audio-recorder.tsx

Source: [apps/web/src/components/app/audio-recorder.tsx](../../apps/web/src/components/app/audio-recorder.tsx)

Exports: `AudioRecorder`, `RecordedClip`, `RecorderState`.

Local dependencies: [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/speaking-student-panel.tsx](../../apps/web/src/components/app/task-workspaces/speaking-student-panel.tsx), [apps/web/src/components/app/task-workspaces/speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/speaking-workspace.tsx).

## components/app/bulk-paper-input.tsx

Source: [apps/web/src/components/app/bulk-paper-input.tsx](../../apps/web/src/components/app/bulk-paper-input.tsx)

Exports: `BulkPaperInput`.

Local dependencies: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/bulk-paper.ts](../../apps/web/src/lib/bulk-paper.ts), [apps/web/src/lib/heic.ts](../../apps/web/src/lib/heic.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`, `react-dom`.

Imported by: [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx).

## components/app/char-meter.tsx

Source: [apps/web/src/components/app/char-meter.tsx](../../apps/web/src/components/app/char-meter.tsx)

Exports: `CharMeter`.

Local dependencies: [apps/web/src/lib/rps-limits.ts](../../apps/web/src/lib/rps-limits.ts).

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/rps-editor-page.tsx](../../apps/web/src/components/app/rps-editor-page.tsx).

## components/app/check-history.tsx

Source: [apps/web/src/components/app/check-history.tsx](../../apps/web/src/components/app/check-history.tsx)

Exports: `CheckAttemptRow`, `CheckHistory`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `check_attempts`.

Imported by: [apps/web/src/components/app/submission-task-review.tsx](../../apps/web/src/components/app/submission-task-review.tsx).

## components/app/conversation-practice.tsx

Source: [apps/web/src/components/app/conversation-practice.tsx](../../apps/web/src/components/app/conversation-practice.tsx)

Exports: `ConversationPractice`.

Local dependencies: [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx), [apps/web/src/lib/conversation-vad.ts](../../apps/web/src/lib/conversation-vad.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/student-practice.tsx](../../apps/web/src/components/app/student-practice.tsx).

## components/app/course-analytics.tsx

Source: [apps/web/src/components/app/course-analytics.tsx](../../apps/web/src/components/app/course-analytics.tsx)

Exports: `CourseAnalytics`.

Local dependencies: [apps/web/src/components/app/practice-mascot.tsx](../../apps/web/src/components/app/practice-mascot.tsx), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/course-analytics.ts](../../apps/web/src/lib/course-analytics.ts), [apps/web/src/lib/course-sections.ts](../../apps/web/src/lib/course-sections.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/styles/course-analytics.css](../../apps/web/src/styles/course-analytics.css).

Package imports: `lucide-react`, `react`, `react-router`, `recharts`.

Literal database references: `assignment_submissions`, `assignments`, `check_attempts`, `class_sessions`, `course_roster`, `lecturer_recommendations`, `sub_cpmk`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx).

## components/app/course-assignments.tsx

Source: [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx)

Exports: `CourseAssignments`, `StudentAssignmentCard`.

Local dependencies: [apps/web/src/components/app/formative-practice.tsx](../../apps/web/src/components/app/formative-practice.tsx), [apps/web/src/components/app/practice-mascot.tsx](../../apps/web/src/components/app/practice-mascot.tsx), [apps/web/src/components/app/student-published-feedback.tsx](../../apps/web/src/components/app/student-published-feedback.tsx), [apps/web/src/components/app/task-workspaces/check-answer-panel.tsx](../../apps/web/src/components/app/task-workspaces/check-answer-panel.tsx), [apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/listening-workspace.tsx](../../apps/web/src/components/app/task-workspaces/listening-workspace.tsx), [apps/web/src/components/app/task-workspaces/quiz-workspace.tsx](../../apps/web/src/components/app/task-workspaces/quiz-workspace.tsx), [apps/web/src/components/app/task-workspaces/reading-workspace.tsx](../../apps/web/src/components/app/task-workspaces/reading-workspace.tsx), [apps/web/src/components/app/task-workspaces/speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/writing-workspace.tsx](../../apps/web/src/components/app/task-workspaces/writing-workspace.tsx), [apps/web/src/components/card-cta.tsx](../../apps/web/src/components/card-cta.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/hooks/use-course-assignments.ts](../../apps/web/src/hooks/use-course-assignments.ts), [apps/web/src/lib/ai-evaluation.ts](../../apps/web/src/lib/ai-evaluation.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/resources.ts](../../apps/web/src/lib/resources.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assignment_submissions`, `assignments`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx).

## components/app/course-catalog-card.tsx

Source: [apps/web/src/components/app/course-catalog-card.tsx](../../apps/web/src/components/app/course-catalog-card.tsx)

Exports: `CourseCatalogCard`, `CourseCatalogStats`.

Local dependencies: [apps/web/src/components/app/course-thumb.tsx](../../apps/web/src/components/app/course-thumb.tsx), [apps/web/src/lib/course-route.ts](../../apps/web/src/lib/course-route.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Imported by: [apps/web/src/components/app/courses-page.tsx](../../apps/web/src/components/app/courses-page.tsx).

## components/app/course-dashboard.tsx

Source: [apps/web/src/components/app/course-dashboard.tsx](../../apps/web/src/components/app/course-dashboard.tsx)

Exports: `CourseDashboard`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/course-thumb.tsx](../../apps/web/src/components/app/course-thumb.tsx), [apps/web/src/data/academic-calendar.ts](../../apps/web/src/data/academic-calendar.ts), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/assistant-quick-send.ts](../../apps/web/src/lib/assistant-quick-send.ts), [apps/web/src/lib/course-route.ts](../../apps/web/src/lib/course-route.ts), [apps/web/src/lib/course-thumb.ts](../../apps/web/src/lib/course-thumb.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assignment_submissions`, `assignments`, `class_sessions`, `course_sections`, `courses`.

Imported by: [apps/web/src/routes/app.tsx](../../apps/web/src/routes/app.tsx).

## components/app/course-detail.tsx

Source: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx)

Exports: `CourseDetail`.

Local dependencies: [apps/web/src/components/app/assistant-page-context-provider.tsx](../../apps/web/src/components/app/assistant-page-context-provider.tsx), [apps/web/src/components/app/attendance-manager.tsx](../../apps/web/src/components/app/attendance-manager.tsx), [apps/web/src/components/app/char-meter.tsx](../../apps/web/src/components/app/char-meter.tsx), [apps/web/src/components/app/course-analytics.tsx](../../apps/web/src/components/app/course-analytics.tsx), [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/course-form.tsx](../../apps/web/src/components/app/course-form.tsx), [apps/web/src/components/app/course-info.tsx](../../apps/web/src/components/app/course-info.tsx), [apps/web/src/components/app/course-resources.tsx](../../apps/web/src/components/app/course-resources.tsx), [apps/web/src/components/app/course-roster.tsx](../../apps/web/src/components/app/course-roster.tsx), [apps/web/src/components/app/course-sections.tsx](../../apps/web/src/components/app/course-sections.tsx), [apps/web/src/components/app/course-settings.tsx](../../apps/web/src/components/app/course-settings.tsx), [apps/web/src/components/app/course-thumb.tsx](../../apps/web/src/components/app/course-thumb.tsx), [apps/web/src/components/app/course-workspace.tsx](../../apps/web/src/components/app/course-workspace.tsx), [apps/web/src/components/app/lecturer-gradebook.tsx](../../apps/web/src/components/app/lecturer-gradebook.tsx), [apps/web/src/components/app/overflow-menu.tsx](../../apps/web/src/components/app/overflow-menu.tsx), [apps/web/src/components/app/personal-practice.tsx](../../apps/web/src/components/app/personal-practice.tsx), [apps/web/src/components/app/practice-mascot.tsx](../../apps/web/src/components/app/practice-mascot.tsx), [apps/web/src/components/app/session-date-autofill.tsx](../../apps/web/src/components/app/session-date-autofill.tsx), [apps/web/src/components/app/session-form.tsx](../../apps/web/src/components/app/session-form.tsx), [apps/web/src/components/app/structured-records.tsx](../../apps/web/src/components/app/structured-records.tsx), [apps/web/src/components/app/student-course-overview.tsx](../../apps/web/src/components/app/student-course-overview.tsx), [apps/web/src/components/app/student-grades.tsx](../../apps/web/src/components/app/student-grades.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/hooks/use-course-records.ts](../../apps/web/src/hooks/use-course-records.ts), [apps/web/src/hooks/use-course-route.ts](../../apps/web/src/hooks/use-course-route.ts), [apps/web/src/hooks/use-course-sections.ts](../../apps/web/src/hooks/use-course-sections.ts), [apps/web/src/lib/course-route.ts](../../apps/web/src/lib/course-route.ts), [apps/web/src/lib/course-sections.ts](../../apps/web/src/lib/course-sections.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/rps-limits.ts](../../apps/web/src/lib/rps-limits.ts), [apps/web/src/lib/student-home-copy.ts](../../apps/web/src/lib/student-home-copy.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `class_sessions`, `courses`, `enrollments`.

Imported by: [apps/web/src/routes/course.tsx](../../apps/web/src/routes/course.tsx).

## components/app/course-form.tsx

Source: [apps/web/src/components/app/course-form.tsx](../../apps/web/src/components/app/course-form.tsx)

Exports: `CourseForm`.

Local dependencies: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `courses`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx).

## components/app/course-info.tsx

Source: [apps/web/src/components/app/course-info.tsx](../../apps/web/src/components/app/course-info.tsx)

Exports: `CourseInfo`.

Local dependencies: [apps/web/src/components/app/practice-mascot.tsx](../../apps/web/src/components/app/practice-mascot.tsx), [apps/web/src/lib/course-sections.ts](../../apps/web/src/lib/course-sections.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react-router`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx).

## components/app/course-rail.tsx

Source: [apps/web/src/components/app/course-rail.tsx](../../apps/web/src/components/app/course-rail.tsx)

Exports: `CourseRail`.

Local dependencies: [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/lib/course-route.ts](../../apps/web/src/lib/course-route.ts), [apps/web/src/lib/course-sections.ts](../../apps/web/src/lib/course-sections.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `courses`.

Imported by: [apps/web/src/routes/course.tsx](../../apps/web/src/routes/course.tsx).

## components/app/course-resources.tsx

Source: [apps/web/src/components/app/course-resources.tsx](../../apps/web/src/components/app/course-resources.tsx)

Exports: `CourseResources`.

Local dependencies: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx), [apps/web/src/components/app/practice-mascot.tsx](../../apps/web/src/components/app/practice-mascot.tsx), [apps/web/src/components/app/resource-form.tsx](../../apps/web/src/components/app/resource-form.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/hooks/use-course-resources.ts](../../apps/web/src/hooks/use-course-resources.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/resources.ts](../../apps/web/src/lib/resources.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `course_resources`, `file_library`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx).

## components/app/course-roster.tsx

Source: [apps/web/src/components/app/course-roster.tsx](../../apps/web/src/components/app/course-roster.tsx)

Exports: `CourseRoster`.

Local dependencies: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx), [apps/web/src/components/app/overflow-menu.tsx](../../apps/web/src/components/app/overflow-menu.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/hooks/use-course-roster.ts](../../apps/web/src/hooks/use-course-roster.ts), [apps/web/src/hooks/use-course-sections.ts](../../apps/web/src/hooks/use-course-sections.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/roster-csv.ts](../../apps/web/src/lib/roster-csv.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `course_roster`, `roster_audit`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx).

## components/app/course-sections.tsx

Source: [apps/web/src/components/app/course-sections.tsx](../../apps/web/src/components/app/course-sections.tsx)

Exports: `SectionManager`, `SectionSelector`, `StudentSectionChip`, `useMySection`, `useSectionName`.

Local dependencies: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/hooks/use-course-sections.ts](../../apps/web/src/hooks/use-course-sections.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `course_sections`, `enrollments`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/lecturer-gradebook.tsx](../../apps/web/src/components/app/lecturer-gradebook.tsx), [apps/web/src/components/app/student-course-overview.tsx](../../apps/web/src/components/app/student-course-overview.tsx), [apps/web/src/components/app/student-courses.tsx](../../apps/web/src/components/app/student-courses.tsx), [apps/web/src/components/app/student-dashboard.tsx](../../apps/web/src/components/app/student-dashboard.tsx).

## components/app/course-settings.tsx

Source: [apps/web/src/components/app/course-settings.tsx](../../apps/web/src/components/app/course-settings.tsx)

Exports: `CourseSettings`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Package imports: `lucide-react`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx).

## components/app/course-thumb-dialog.tsx

Source: [apps/web/src/components/app/course-thumb-dialog.tsx](../../apps/web/src/components/app/course-thumb-dialog.tsx)

Exports: `CourseThumbDialog`.

Local dependencies: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx), [apps/web/src/components/app/course-thumb.tsx](../../apps/web/src/components/app/course-thumb.tsx), [apps/web/src/lib/course-thumb.ts](../../apps/web/src/lib/course-thumb.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `courses`.

Imported by: [apps/web/src/components/app/courses-page.tsx](../../apps/web/src/components/app/courses-page.tsx).

## components/app/course-thumb.tsx

Source: [apps/web/src/components/app/course-thumb.tsx](../../apps/web/src/components/app/course-thumb.tsx)

Exports: `CourseThumb`.

Local dependencies: [apps/web/src/lib/course-thumb.ts](../../apps/web/src/lib/course-thumb.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Imported by: [apps/web/src/components/app/analytics-index.tsx](../../apps/web/src/components/app/analytics-index.tsx), [apps/web/src/components/app/course-catalog-card.tsx](../../apps/web/src/components/app/course-catalog-card.tsx), [apps/web/src/components/app/course-dashboard.tsx](../../apps/web/src/components/app/course-dashboard.tsx), [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/course-thumb-dialog.tsx](../../apps/web/src/components/app/course-thumb-dialog.tsx), [apps/web/src/components/app/student-dashboard.tsx](../../apps/web/src/components/app/student-dashboard.tsx), [apps/web/src/components/app/tugas-board.tsx](../../apps/web/src/components/app/tugas-board.tsx).

## components/app/course-workspace.tsx

Source: [apps/web/src/components/app/course-workspace.tsx](../../apps/web/src/components/app/course-workspace.tsx)

Exports: `CourseWorkspace`.

Local dependencies: [apps/web/src/components/app/rps-ai-helper.tsx](../../apps/web/src/components/app/rps-ai-helper.tsx), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/hooks/use-course-assignments.ts](../../apps/web/src/hooks/use-course-assignments.ts), [apps/web/src/hooks/use-course-records.ts](../../apps/web/src/hooks/use-course-records.ts), [apps/web/src/hooks/use-course-resources.ts](../../apps/web/src/hooks/use-course-resources.ts), [apps/web/src/hooks/use-course-roster.ts](../../apps/web/src/hooks/use-course-roster.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/rps-fix.ts](../../apps/web/src/lib/rps-fix.ts), [apps/web/src/lib/rps-validation.ts](../../apps/web/src/lib/rps-validation.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `collaborative_tasks`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx).

## components/app/courses-page.tsx

Source: [apps/web/src/components/app/courses-page.tsx](../../apps/web/src/components/app/courses-page.tsx)

Exports: `CoursesPage`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/course-catalog-card.tsx](../../apps/web/src/components/app/course-catalog-card.tsx), [apps/web/src/components/app/course-thumb-dialog.tsx](../../apps/web/src/components/app/course-thumb-dialog.tsx), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/course-thumb.ts](../../apps/web/src/lib/course-thumb.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assignments`, `class_sessions`, `course_roster`, `courses`, `enrollments`, `file_library`.

Imported by: [apps/web/src/routes/app.courses.tsx](../../apps/web/src/routes/app.courses.tsx).

## components/app/datetime-picker.tsx

Source: [apps/web/src/components/app/datetime-picker.tsx](../../apps/web/src/components/app/datetime-picker.tsx)

Exports: `DateTimePicker`.

Local dependencies: [apps/web/src/components/ui/calendar.tsx](../../apps/web/src/components/ui/calendar.tsx), [apps/web/src/components/ui/popover.tsx](../../apps/web/src/components/ui/popover.tsx).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx).

## components/app/difficulty-insights.tsx

Source: [apps/web/src/components/app/difficulty-insights.tsx](../../apps/web/src/components/app/difficulty-insights.tsx)

Exports: `DifficultyInsights`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/check-types.ts](../../apps/web/src/lib/check-types.ts), [apps/web/src/lib/difficulty-data.ts](../../apps/web/src/lib/difficulty-data.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Package imports: `lucide-react`, `react`, `recharts`.

Imported by: [apps/web/src/components/app/tugas-insights.tsx](../../apps/web/src/components/app/tugas-insights.tsx).

## components/app/difficulty-summary.tsx

Source: [apps/web/src/components/app/difficulty-summary.tsx](../../apps/web/src/components/app/difficulty-summary.tsx)

Exports: `DifficultySummary`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/difficulty-data.ts](../../apps/web/src/lib/difficulty-data.ts).

Package imports: `lucide-react`, `react`, `react-router`, `recharts`.

Imported by: [apps/web/src/components/app/tugas-board.tsx](../../apps/web/src/components/app/tugas-board.tsx).

## components/app/enrolled-answer-sheet.tsx

Source: [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx)

Exports: `EnrolledAnswerSheet`.

Local dependencies: [apps/web/src/components/app/audio-recorder.tsx](../../apps/web/src/components/app/audio-recorder.tsx), [apps/web/src/components/app/formative-practice.tsx](../../apps/web/src/components/app/formative-practice.tsx), [apps/web/src/components/app/student-answer-sheet.tsx](../../apps/web/src/components/app/student-answer-sheet.tsx), [apps/web/src/components/app/student-assistant-panel.tsx](../../apps/web/src/components/app/student-assistant-panel.tsx), [apps/web/src/components/app/student-published-feedback.tsx](../../apps/web/src/components/app/student-published-feedback.tsx), [apps/web/src/components/app/task-workspaces/check-answer-panel.tsx](../../apps/web/src/components/app/task-workspaces/check-answer-panel.tsx), [apps/web/src/components/app/task-workspaces/listening-workspace.tsx](../../apps/web/src/components/app/task-workspaces/listening-workspace.tsx), [apps/web/src/components/app/task-workspaces/quiz-workspace.tsx](../../apps/web/src/components/app/task-workspaces/quiz-workspace.tsx), [apps/web/src/components/app/task-workspaces/reading-workspace.tsx](../../apps/web/src/components/app/task-workspaces/reading-workspace.tsx), [apps/web/src/components/app/task-workspaces/speaking-student-panel.tsx](../../apps/web/src/components/app/task-workspaces/speaking-student-panel.tsx), [apps/web/src/components/app/task-workspaces/transcript-panel.tsx](../../apps/web/src/components/app/task-workspaces/transcript-panel.tsx), [apps/web/src/components/app/task-workspaces/writing-workspace.tsx](../../apps/web/src/components/app/task-workspaces/writing-workspace.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/ai-evaluation.ts](../../apps/web/src/lib/ai-evaluation.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/cefr-level.ts](../../apps/web/src/lib/cefr-level.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/resources.ts](../../apps/web/src/lib/resources.ts), [apps/web/src/lib/speaking-directions.ts](../../apps/web/src/lib/speaking-directions.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts), [apps/web/src/lib/transcription.ts](../../apps/web/src/lib/transcription.ts), [apps/web/src/lib/worksheet-brief.ts](../../apps/web/src/lib/worksheet-brief.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assignment_submissions`.

Imported by: [apps/web/src/components/app/student-work-page.tsx](../../apps/web/src/components/app/student-work-page.tsx).

## components/app/evaluation-workspace.tsx

Source: [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx)

Exports: `EvaluationWorkspace`.

Local dependencies: [apps/web/src/components/app/ai-evaluation-review.tsx](../../apps/web/src/components/app/ai-evaluation-review.tsx), [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/bulk-paper-input.tsx](../../apps/web/src/components/app/bulk-paper-input.tsx), [apps/web/src/components/app/formative-evaluation-review.tsx](../../apps/web/src/components/app/formative-evaluation-review.tsx), [apps/web/src/components/app/overflow-menu.tsx](../../apps/web/src/components/app/overflow-menu.tsx), [apps/web/src/components/app/submission-pdf-preview.tsx](../../apps/web/src/components/app/submission-pdf-preview.tsx), [apps/web/src/components/app/submission-task-review.tsx](../../apps/web/src/components/app/submission-task-review.tsx), [apps/web/src/components/app/task-workspaces/check-feedback-body.tsx](../../apps/web/src/components/app/task-workspaces/check-feedback-body.tsx), [apps/web/src/components/app/task-workspaces/transcript-panel.tsx](../../apps/web/src/components/app/task-workspaces/transcript-panel.tsx), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/cefr-level.ts](../../apps/web/src/lib/cefr-level.ts), [apps/web/src/lib/check-types.ts](../../apps/web/src/lib/check-types.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts), [apps/web/src/lib/transcription.ts](../../apps/web/src/lib/transcription.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assignment_submissions`, `assignments`, `check_attempts`, `courses`, `public_submissions`.

Imported by: [apps/web/src/routes/app.tugas.$assignmentId.tsx](../../apps/web/src/routes/app.tugas.$assignmentId.tsx).

## components/app/feedback-uptake-review.tsx

Source: [apps/web/src/components/app/feedback-uptake-review.tsx](../../apps/web/src/components/app/feedback-uptake-review.tsx)

Exports: `FeedbackUptakeReview`.

Local dependencies: [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/feedback-uptake.ts](../../apps/web/src/lib/feedback-uptake.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `assignments`.

Imported by: [apps/web/src/routes/app.riset.tsx](../../apps/web/src/routes/app.riset.tsx).

## components/app/file-context.tsx

Source: [apps/web/src/components/app/file-context.tsx](../../apps/web/src/components/app/file-context.tsx)

Exports: `FileContextView`.

Local dependencies: [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/lib/context-suggestions-client.ts](../../apps/web/src/lib/context-suggestions-client.ts), [apps/web/src/lib/file-library.ts](../../apps/web/src/lib/file-library.ts), [apps/web/src/lib/file-metadata.ts](../../apps/web/src/lib/file-metadata.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `class_sessions`, `context_sections`, `context_suggestions`, `courses`, `cpmk`, `file_contexts`, `file_extractions`, `file_library`, `sub_cpmk`.

Imported by: [apps/web/src/routes/app.berkas.$fileId.tsx](../../apps/web/src/routes/app.berkas.$fileId.tsx).

## components/app/file-library.tsx

Source: [apps/web/src/components/app/file-library.tsx](../../apps/web/src/components/app/file-library.tsx)

Exports: `FileLibrary`.

Local dependencies: [apps/web/src/components/app/file-upload-dialog.tsx](../../apps/web/src/components/app/file-upload-dialog.tsx), [apps/web/src/components/app/file-version-history.tsx](../../apps/web/src/components/app/file-version-history.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/lib/file-library.ts](../../apps/web/src/lib/file-library.ts), [apps/web/src/lib/file-metadata.ts](../../apps/web/src/lib/file-metadata.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `class_sessions`, `courses`, `cpmk`, `file_extractions`, `file_library`, `sub_cpmk`.

Imported by: [apps/web/src/routes/app.berkas.tsx](../../apps/web/src/routes/app.berkas.tsx).

## components/app/file-upload-dialog.tsx

Source: [apps/web/src/components/app/file-upload-dialog.tsx](../../apps/web/src/components/app/file-upload-dialog.tsx)

Exports: `FileUploadDialog`.

Local dependencies: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx), [apps/web/src/components/form-stepper.tsx](../../apps/web/src/components/form-stepper.tsx), [apps/web/src/lib/context-suggestions-client.ts](../../apps/web/src/lib/context-suggestions-client.ts), [apps/web/src/lib/file-library.ts](../../apps/web/src/lib/file-library.ts), [apps/web/src/lib/file-metadata.ts](../../apps/web/src/lib/file-metadata.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `context_sections`, `file_contexts`, `file_extractions`, `file_library`.

Imported by: [apps/web/src/components/app/file-library.tsx](../../apps/web/src/components/app/file-library.tsx).

## components/app/file-version-history.tsx

Source: [apps/web/src/components/app/file-version-history.tsx](../../apps/web/src/components/app/file-version-history.tsx)

Exports: `FileVersionHistory`.

Local dependencies: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/lib/file-library.ts](../../apps/web/src/lib/file-library.ts), [apps/web/src/lib/file-metadata.ts](../../apps/web/src/lib/file-metadata.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `file_versions`.

Imported by: [apps/web/src/components/app/file-library.tsx](../../apps/web/src/components/app/file-library.tsx).

## components/app/form-status.tsx

Source: [apps/web/src/components/app/form-status.tsx](../../apps/web/src/components/app/form-status.tsx)

Exports: `MappingOption`, `MappingSelect`, `StatusDetail`, `StatusMarks`.

Package imports: `lucide-react`, `react`, `react-dom`, `react-router`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx), [apps/web/src/components/app/practice-content-autofill.tsx](../../apps/web/src/components/app/practice-content-autofill.tsx), [apps/web/src/components/app/task-builders/listening-builder.tsx](../../apps/web/src/components/app/task-builders/listening-builder.tsx), [apps/web/src/components/app/task-builders/quiz-builder.tsx](../../apps/web/src/components/app/task-builders/quiz-builder.tsx), [apps/web/src/components/app/task-builders/reading-builder.tsx](../../apps/web/src/components/app/task-builders/reading-builder.tsx), [apps/web/src/components/app/task-builders/task-autofill.tsx](../../apps/web/src/components/app/task-builders/task-autofill.tsx).

## components/app/formative-answer-script.tsx

Source: [apps/web/src/components/app/formative-answer-script.tsx](../../apps/web/src/components/app/formative-answer-script.tsx)

Exports: `FormativeAnswerScript`, `marksFromCheck`.

Local dependencies: [apps/web/src/components/app/task-workspaces/point-feedback.tsx](../../apps/web/src/components/app/task-workspaces/point-feedback.tsx).

Package imports: `react`.

Imported by: [apps/web/src/components/app/formative-evaluation-review.tsx](../../apps/web/src/components/app/formative-evaluation-review.tsx), [apps/web/src/components/app/task-workspaces/writing-workspace.tsx](../../apps/web/src/components/app/task-workspaces/writing-workspace.tsx).

## components/app/formative-evaluation-review.tsx

Source: [apps/web/src/components/app/formative-evaluation-review.tsx](../../apps/web/src/components/app/formative-evaluation-review.tsx)

Exports: `FormativeFinding`, `FormativeReviewAnswer`, `FormativeReviewEvaluation`, `FormativeReviewPanel`, `FormativeReviewProvider`.

Local dependencies: [apps/web/src/components/app/formative-answer-script.tsx](../../apps/web/src/components/app/formative-answer-script.tsx), [apps/web/src/components/app/task-workspaces/point-feedback.tsx](../../apps/web/src/components/app/task-workspaces/point-feedback.tsx), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/evaluation-scoring.ts](../../apps/web/src/lib/evaluation-scoring.ts), [apps/web/src/lib/formative-scoring.ts](../../apps/web/src/lib/formative-scoring.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `formative_reviews`.

Imported by: [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx).

## components/app/formative-practice.tsx

Source: [apps/web/src/components/app/formative-practice.tsx](../../apps/web/src/components/app/formative-practice.tsx)

Exports: `FormativePractice`.

Local dependencies: [apps/web/src/components/app/task-workspaces/check-answer-panel.tsx](../../apps/web/src/components/app/task-workspaces/check-answer-panel.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Imported by: [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx).

## components/app/global-search.tsx

Source: [apps/web/src/components/app/global-search.tsx](../../apps/web/src/components/app/global-search.tsx)

Exports: `COLORED_LOGO`, `GlobalSearch`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assignment_submissions`, `assignments`, `course_resources`, `courses`, `enrollments`, `public_submissions`.

Imported by: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx).

## components/app/lecturer-assignment-preview.tsx

Source: [apps/web/src/components/app/lecturer-assignment-preview.tsx](../../apps/web/src/components/app/lecturer-assignment-preview.tsx)

Exports: `LecturerAssignmentPreview`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/structured-assignment.ts](../../apps/web/src/lib/structured-assignment.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assignments`.

Imported by: [apps/web/src/routes/app.tugas.$assignmentId.pratinjau.tsx](../../apps/web/src/routes/app.tugas.$assignmentId.pratinjau.tsx).

## components/app/lecturer-gradebook.tsx

Source: [apps/web/src/components/app/lecturer-gradebook.tsx](../../apps/web/src/components/app/lecturer-gradebook.tsx)

Exports: `LecturerGradebook`.

Local dependencies: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx), [apps/web/src/components/app/course-sections.tsx](../../apps/web/src/components/app/course-sections.tsx), [apps/web/src/components/app/overflow-menu.tsx](../../apps/web/src/components/app/overflow-menu.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/hooks/use-course-roster.ts](../../apps/web/src/hooks/use-course-roster.ts), [apps/web/src/hooks/use-course-sections.ts](../../apps/web/src/hooks/use-course-sections.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/gradebook.ts](../../apps/web/src/lib/gradebook.ts), [apps/web/src/lib/grouped-gradebook.ts](../../apps/web/src/lib/grouped-gradebook.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assessments`, `assignment_submissions`, `assignments`, `attendance`, `class_sessions`, `grade_components`, `grade_entries`, `grade_overrides`, `grade_publications`, `participation_awards`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/penilaian-index.tsx](../../apps/web/src/components/app/penilaian-index.tsx).

## components/app/lecturer-recommendations.tsx

Source: [apps/web/src/components/app/lecturer-recommendations.tsx](../../apps/web/src/components/app/lecturer-recommendations.tsx)

Exports: `LecturerRecommendations`.

Local dependencies: [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `lecturer_recommendations`.

Imported by: [apps/web/src/components/app/tugas-insights.tsx](../../apps/web/src/components/app/tugas-insights.tsx), [apps/web/src/routes/app.tugas.insights.tsx](../../apps/web/src/routes/app.tugas.insights.tsx).

## components/app/multi-select.tsx

Source: [apps/web/src/components/app/multi-select.tsx](../../apps/web/src/components/app/multi-select.tsx)

Exports: `MultiSelect`, `MultiSelectOption`.

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/session-form.tsx](../../apps/web/src/components/app/session-form.tsx).

## components/app/overflow-menu.tsx

Source: [apps/web/src/components/app/overflow-menu.tsx](../../apps/web/src/components/app/overflow-menu.tsx)

Exports: `OverflowMenu`.

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/course-roster.tsx](../../apps/web/src/components/app/course-roster.tsx), [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx), [apps/web/src/components/app/lecturer-gradebook.tsx](../../apps/web/src/components/app/lecturer-gradebook.tsx), [apps/web/src/components/app/rps-editor-page.tsx](../../apps/web/src/components/app/rps-editor-page.tsx).

## components/app/penilaian-index.tsx

Source: [apps/web/src/components/app/penilaian-index.tsx](../../apps/web/src/components/app/penilaian-index.tsx)

Exports: `PenilaianIndex`.

Local dependencies: [apps/web/src/components/app/lecturer-gradebook.tsx](../../apps/web/src/components/app/lecturer-gradebook.tsx), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `courses`.

Imported by: [apps/web/src/routes/app.penilaian.tsx](../../apps/web/src/routes/app.penilaian.tsx).

## components/app/personal-practice.tsx

Source: [apps/web/src/components/app/personal-practice.tsx](../../apps/web/src/components/app/personal-practice.tsx)

Exports: `PersonalPractice`.

Local dependencies: [apps/web/src/components/app/agent-task-panel.tsx](../../apps/web/src/components/app/agent-task-panel.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/personal-practice.ts](../../apps/web/src/lib/personal-practice.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/student-progress.ts](../../apps/web/src/lib/student-progress.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `file_library`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/student-practice.tsx](../../apps/web/src/components/app/student-practice.tsx).

## components/app/personalization-analytics.tsx

Source: [apps/web/src/components/app/personalization-analytics.tsx](../../apps/web/src/components/app/personalization-analytics.tsx)

Exports: `PersonalizationAnalytics`.

Local dependencies: [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/personalization-analytics.ts](../../apps/web/src/lib/personalization-analytics.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/routes/app.riset.tsx](../../apps/web/src/routes/app.riset.tsx).

## components/app/practice-autofill-form.tsx

Source: [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx)

Exports: `PracticeAutofillForm`.

Local dependencies: [apps/web/src/components/app/form-status.tsx](../../apps/web/src/components/app/form-status.tsx), [apps/web/src/components/app/practice-content-autofill.tsx](../../apps/web/src/components/app/practice-content-autofill.tsx), [apps/web/src/components/app/task-builders/listening-builder.tsx](../../apps/web/src/components/app/task-builders/listening-builder.tsx), [apps/web/src/components/app/task-builders/quiz-builder.tsx](../../apps/web/src/components/app/task-builders/quiz-builder.tsx), [apps/web/src/components/app/task-builders/reading-builder.tsx](../../apps/web/src/components/app/task-builders/reading-builder.tsx), [apps/web/src/components/app/task-builders/speaking-builder.tsx](../../apps/web/src/components/app/task-builders/speaking-builder.tsx), [apps/web/src/components/app/task-builders/writing-builder.tsx](../../apps/web/src/components/app/task-builders/writing-builder.tsx), [apps/web/src/components/form-stepper.tsx](../../apps/web/src/components/form-stepper.tsx), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/hooks/use-course-records.ts](../../apps/web/src/hooks/use-course-records.ts), [apps/web/src/hooks/use-course-resources.ts](../../apps/web/src/hooks/use-course-resources.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assignments`, `courses`, `file_library`, `task_answer_keys`.

Imported by: [apps/web/src/components/app/assignment-editor-page.tsx](../../apps/web/src/components/app/assignment-editor-page.tsx).

## components/app/practice-content-autofill.tsx

Source: [apps/web/src/components/app/practice-content-autofill.tsx](../../apps/web/src/components/app/practice-content-autofill.tsx)

Exports: `PracticeContentAutofill`.

Local dependencies: [apps/web/src/components/app/form-status.tsx](../../apps/web/src/components/app/form-status.tsx), [apps/web/src/components/app/task-builders/builder-shared.tsx](../../apps/web/src/components/app/task-builders/builder-shared.tsx), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx).

## components/app/practice-mascot.tsx

Source: [apps/web/src/components/app/practice-mascot.tsx](../../apps/web/src/components/app/practice-mascot.tsx)

Exports: `PracticeMascot`.

Package imports: `react`.

Imported by: [apps/web/src/components/app/attendance-manager.tsx](../../apps/web/src/components/app/attendance-manager.tsx), [apps/web/src/components/app/course-analytics.tsx](../../apps/web/src/components/app/course-analytics.tsx), [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/course-info.tsx](../../apps/web/src/components/app/course-info.tsx), [apps/web/src/components/app/course-resources.tsx](../../apps/web/src/components/app/course-resources.tsx), [apps/web/src/components/app/student-course-overview.tsx](../../apps/web/src/components/app/student-course-overview.tsx), [apps/web/src/components/app/student-courses.tsx](../../apps/web/src/components/app/student-courses.tsx), [apps/web/src/components/app/student-grades.tsx](../../apps/web/src/components/app/student-grades.tsx), [apps/web/src/components/app/student-home-adventure.tsx](../../apps/web/src/components/app/student-home-adventure.tsx).

## components/app/research-analytics.tsx

Source: [apps/web/src/components/app/research-analytics.tsx](../../apps/web/src/components/app/research-analytics.tsx)

Exports: `ResearchAnalyticsView`.

Local dependencies: [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/feedback-uptake.ts](../../apps/web/src/lib/feedback-uptake.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/research-analytics.ts](../../apps/web/src/lib/research-analytics.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/routes/app.riset.tsx](../../apps/web/src/routes/app.riset.tsx).

## components/app/research-export.tsx

Source: [apps/web/src/components/app/research-export.tsx](../../apps/web/src/components/app/research-export.tsx)

Exports: `ResearchExport`.

Local dependencies: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `assignments`.

Imported by: [apps/web/src/routes/app.riset.tsx](../../apps/web/src/routes/app.riset.tsx).

## components/app/resource-form.tsx

Source: [apps/web/src/components/app/resource-form.tsx](../../apps/web/src/components/app/resource-form.tsx)

Exports: `ResourceForm`.

Local dependencies: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/resources.ts](../../apps/web/src/lib/resources.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `course_resources`.

Imported by: [apps/web/src/components/app/course-resources.tsx](../../apps/web/src/components/app/course-resources.tsx).

## components/app/rps-ai-helper.tsx

Source: [apps/web/src/components/app/rps-ai-helper.tsx](../../apps/web/src/components/app/rps-ai-helper.tsx)

Exports: `RpsAiHelper`.

Local dependencies: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/rps-fix.ts](../../apps/web/src/lib/rps-fix.ts), [apps/web/src/lib/rps-validation.ts](../../apps/web/src/lib/rps-validation.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/course-workspace.tsx](../../apps/web/src/components/app/course-workspace.tsx).

## components/app/rps-editor-page.tsx

Source: [apps/web/src/components/app/rps-editor-page.tsx](../../apps/web/src/components/app/rps-editor-page.tsx)

Exports: `RpsEditorPage`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/assistant-page-context-provider.tsx](../../apps/web/src/components/app/assistant-page-context-provider.tsx), [apps/web/src/components/app/char-meter.tsx](../../apps/web/src/components/app/char-meter.tsx), [apps/web/src/components/app/overflow-menu.tsx](../../apps/web/src/components/app/overflow-menu.tsx), [apps/web/src/components/form-stepper.tsx](../../apps/web/src/components/form-stepper.tsx), [apps/web/src/lib/course-route.ts](../../apps/web/src/lib/course-route.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/rps-csv.ts](../../apps/web/src/lib/rps-csv.ts), [apps/web/src/lib/rps-draft.ts](../../apps/web/src/lib/rps-draft.ts), [apps/web/src/lib/rps-limits.ts](../../apps/web/src/lib/rps-limits.ts), [apps/web/src/lib/rps-prompt.ts](../../apps/web/src/lib/rps-prompt.ts), [apps/web/src/lib/rps-text-parse.ts](../../apps/web/src/lib/rps-text-parse.ts), [apps/web/src/lib/rps-validation.ts](../../apps/web/src/lib/rps-validation.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assessments`, `class_sessions`, `collaborative_tasks`, `courses`, `cpl`, `cpmk`, `sub_cpmk`, `topics`.

Imported by: [apps/web/src/routes/app.rps.$courseId.tsx](../../apps/web/src/routes/app.rps.$courseId.tsx).

## components/app/session-date-autofill.tsx

Source: [apps/web/src/components/app/session-date-autofill.tsx](../../apps/web/src/components/app/session-date-autofill.tsx)

Exports: `SessionDateAutofill`.

Local dependencies: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx), [apps/web/src/components/ui/calendar.tsx](../../apps/web/src/components/ui/calendar.tsx), [apps/web/src/components/ui/popover.tsx](../../apps/web/src/components/ui/popover.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/session-dates.ts](../../apps/web/src/lib/session-dates.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `class_sessions`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx).

## components/app/session-form.tsx

Source: [apps/web/src/components/app/session-form.tsx](../../apps/web/src/components/app/session-form.tsx)

Exports: `SessionForm`.

Local dependencies: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx), [apps/web/src/components/app/multi-select.tsx](../../apps/web/src/components/app/multi-select.tsx), [apps/web/src/hooks/use-course-records.ts](../../apps/web/src/hooks/use-course-records.ts), [apps/web/src/hooks/use-course-sections.ts](../../apps/web/src/hooks/use-course-sections.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `class_sessions`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx).

## components/app/session-roster.tsx

Source: [apps/web/src/components/app/session-roster.tsx](../../apps/web/src/components/app/session-roster.tsx)

Exports: `SessionRoster`.

Local dependencies: [apps/web/src/hooks/use-attendance.ts](../../apps/web/src/hooks/use-attendance.ts), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/hooks/use-course-roster.ts](../../apps/web/src/hooks/use-course-roster.ts), [apps/web/src/hooks/use-course-sections.ts](../../apps/web/src/hooks/use-course-sections.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/styles/session-roster.css](../../apps/web/src/styles/session-roster.css).

Package imports: `@radix-ui/react-dialog`, `react`.

Literal database references: `attendance`, `class_sessions`, `grade_components`, `participation_awards`.

Imported by: [apps/web/src/components/app/attendance-manager.tsx](../../apps/web/src/components/app/attendance-manager.tsx).

## components/app/settings/account-info-section.tsx

Source: [apps/web/src/components/app/settings/account-info-section.tsx](../../apps/web/src/components/app/settings/account-info-section.tsx)

Exports: `AccountInfoSection`.

Local dependencies: [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Imported by: [apps/web/src/components/app/settings/settings-page.tsx](../../apps/web/src/components/app/settings/settings-page.tsx).

## components/app/settings/language-section.tsx

Source: [apps/web/src/components/app/settings/language-section.tsx](../../apps/web/src/components/app/settings/language-section.tsx)

Exports: `LanguageSection`.

Local dependencies: [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `users`.

Imported by: [apps/web/src/components/app/settings/settings-page.tsx](../../apps/web/src/components/app/settings/settings-page.tsx).

## components/app/settings/learner-profile-section.tsx

Source: [apps/web/src/components/app/settings/learner-profile-section.tsx](../../apps/web/src/components/app/settings/learner-profile-section.tsx)

Exports: `LearnerProfileSection`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/settings/settings-page.tsx](../../apps/web/src/components/app/settings/settings-page.tsx).

## components/app/settings/preferences-section.tsx

Source: [apps/web/src/components/app/settings/preferences-section.tsx](../../apps/web/src/components/app/settings/preferences-section.tsx)

Exports: `PreferencesSection`.

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/settings/settings-page.tsx](../../apps/web/src/components/app/settings/settings-page.tsx).

## components/app/settings/profile-section.tsx

Source: [apps/web/src/components/app/settings/profile-section.tsx](../../apps/web/src/components/app/settings/profile-section.tsx)

Exports: `ProfileSection`.

Local dependencies: [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `users`.

Imported by: [apps/web/src/components/app/settings/settings-page.tsx](../../apps/web/src/components/app/settings/settings-page.tsx).

## components/app/settings/recovery-section.tsx

Source: [apps/web/src/components/app/settings/recovery-section.tsx](../../apps/web/src/components/app/settings/recovery-section.tsx)

Exports: `RecoverySection`.

Local dependencies: [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `email_verifications`.

Imported by: [apps/web/src/components/app/settings/settings-page.tsx](../../apps/web/src/components/app/settings/settings-page.tsx).

## components/app/settings/security-section.tsx

Source: [apps/web/src/components/app/settings/security-section.tsx](../../apps/web/src/components/app/settings/security-section.tsx)

Exports: `SecuritySection`.

Local dependencies: [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `users`.

Imported by: [apps/web/src/components/app/settings/settings-page.tsx](../../apps/web/src/components/app/settings/settings-page.tsx).

## components/app/settings/settings-page.tsx

Source: [apps/web/src/components/app/settings/settings-page.tsx](../../apps/web/src/components/app/settings/settings-page.tsx)

Exports: `SettingsPage`.

Local dependencies: [apps/web/src/components/app/settings/account-info-section.tsx](../../apps/web/src/components/app/settings/account-info-section.tsx), [apps/web/src/components/app/settings/language-section.tsx](../../apps/web/src/components/app/settings/language-section.tsx), [apps/web/src/components/app/settings/learner-profile-section.tsx](../../apps/web/src/components/app/settings/learner-profile-section.tsx), [apps/web/src/components/app/settings/preferences-section.tsx](../../apps/web/src/components/app/settings/preferences-section.tsx), [apps/web/src/components/app/settings/profile-section.tsx](../../apps/web/src/components/app/settings/profile-section.tsx), [apps/web/src/components/app/settings/recovery-section.tsx](../../apps/web/src/components/app/settings/recovery-section.tsx), [apps/web/src/components/app/settings/security-section.tsx](../../apps/web/src/components/app/settings/security-section.tsx), [apps/web/src/components/app/settings/usage-section.tsx](../../apps/web/src/components/app/settings/usage-section.tsx), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts).

Imported by: [apps/web/src/routes/app.pengaturan.tsx](../../apps/web/src/routes/app.pengaturan.tsx).

## components/app/settings/usage-section.tsx

Source: [apps/web/src/components/app/settings/usage-section.tsx](../../apps/web/src/components/app/settings/usage-section.tsx)

Exports: `UsageSection`.

Local dependencies: [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/settings/settings-page.tsx](../../apps/web/src/components/app/settings/settings-page.tsx).

## components/app/structured-records.tsx

Source: [apps/web/src/components/app/structured-records.tsx](../../apps/web/src/components/app/structured-records.tsx)

Exports: `StructuredRecords`.

Local dependencies: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/hooks/use-course-records.ts](../../apps/web/src/hooks/use-course-records.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx).

## components/app/student-answer-sheet.tsx

Source: [apps/web/src/components/app/student-answer-sheet.tsx](../../apps/web/src/components/app/student-answer-sheet.tsx)

Exports: `AnswerEditor`, `AttachmentDrop`, `SheetBadge`, `SheetInfo`, `SheetMaterial`, `StudentAnswerSheet`, `instructionLines`.

Local dependencies: [apps/web/src/components/app/worksheet-art.tsx](../../apps/web/src/components/app/worksheet-art.tsx), [apps/web/src/components/form-stepper.tsx](../../apps/web/src/components/form-stepper.tsx), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/worksheet-brief.ts](../../apps/web/src/lib/worksheet-brief.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/student-result-view.tsx](../../apps/web/src/components/app/student-result-view.tsx).

## components/app/student-assistant-panel.tsx

Source: [apps/web/src/components/app/student-assistant-panel.tsx](../../apps/web/src/components/app/student-assistant-panel.tsx)

Exports: `AssistantPage`, `StudentAssistantPanel`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/student-assistant.server.ts](../../apps/web/src/lib/student-assistant.server.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx).

## components/app/student-course-overview.tsx

Source: [apps/web/src/components/app/student-course-overview.tsx](../../apps/web/src/components/app/student-course-overview.tsx)

Exports: `StudentCourseOverview`.

Local dependencies: [apps/web/src/components/app/course-sections.tsx](../../apps/web/src/components/app/course-sections.tsx), [apps/web/src/components/app/practice-mascot.tsx](../../apps/web/src/components/app/practice-mascot.tsx), [apps/web/src/components/app/student-home-adventure.tsx](../../apps/web/src/components/app/student-home-adventure.tsx), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/hooks/use-course-assignments.ts](../../apps/web/src/hooks/use-course-assignments.ts), [apps/web/src/hooks/use-course-resources.ts](../../apps/web/src/hooks/use-course-resources.ts), [apps/web/src/hooks/use-course-sections.ts](../../apps/web/src/hooks/use-course-sections.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/course-sections.ts](../../apps/web/src/lib/course-sections.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/student-home-copy.ts](../../apps/web/src/lib/student-home-copy.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `file_library`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx).

## components/app/student-courses.tsx

Source: [apps/web/src/components/app/student-courses.tsx](../../apps/web/src/components/app/student-courses.tsx)

Exports: `StudentCourses`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/course-sections.tsx](../../apps/web/src/components/app/course-sections.tsx), [apps/web/src/components/app/practice-mascot.tsx](../../apps/web/src/components/app/practice-mascot.tsx), [apps/web/src/components/app/student-home-adventure.tsx](../../apps/web/src/components/app/student-home-adventure.tsx), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/lib/course-route.ts](../../apps/web/src/lib/course-route.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/student-home-copy.ts](../../apps/web/src/lib/student-home-copy.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `class_sessions`, `courses`, `enrollments`.

Imported by: [apps/web/src/routes/app.courses.tsx](../../apps/web/src/routes/app.courses.tsx).

## components/app/student-dashboard.tsx

Source: [apps/web/src/components/app/student-dashboard.tsx](../../apps/web/src/components/app/student-dashboard.tsx)

Exports: `StudentDashboard`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/course-sections.tsx](../../apps/web/src/components/app/course-sections.tsx), [apps/web/src/components/app/course-thumb.tsx](../../apps/web/src/components/app/course-thumb.tsx), [apps/web/src/components/app/student-home-adventure.tsx](../../apps/web/src/components/app/student-home-adventure.tsx), [apps/web/src/components/card-cta.tsx](../../apps/web/src/components/card-cta.tsx), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/course-route.ts](../../apps/web/src/lib/course-route.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/student-home-copy.ts](../../apps/web/src/lib/student-home-copy.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assignment_submissions`, `assignments`, `class_sessions`, `courses`, `enrollments`.

Imported by: [apps/web/src/routes/app.student.tsx](../../apps/web/src/routes/app.student.tsx).

## components/app/student-grades.tsx

Source: [apps/web/src/components/app/student-grades.tsx](../../apps/web/src/components/app/student-grades.tsx)

Exports: `StudentGrades`.

Local dependencies: [apps/web/src/components/app/practice-mascot.tsx](../../apps/web/src/components/app/practice-mascot.tsx), [apps/web/src/components/app/student-published-feedback.tsx](../../apps/web/src/components/app/student-published-feedback.tsx), [apps/web/src/hooks/use-course-assignments.ts](../../apps/web/src/hooks/use-course-assignments.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/student-home-copy.ts](../../apps/web/src/lib/student-home-copy.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx).

## components/app/student-home-adventure.tsx

Source: [apps/web/src/components/app/student-home-adventure.tsx](../../apps/web/src/components/app/student-home-adventure.tsx)

Exports: `StudentHomeAdventure`, `WorldScene`.

Local dependencies: [apps/web/src/components/app/agent-task-panel.tsx](../../apps/web/src/components/app/agent-task-panel.tsx), [apps/web/src/components/app/practice-mascot.tsx](../../apps/web/src/components/app/practice-mascot.tsx), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/lib/course-route.ts](../../apps/web/src/lib/course-route.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/personal-practice.ts](../../apps/web/src/lib/personal-practice.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/student-home-copy.ts](../../apps/web/src/lib/student-home-copy.ts).

Package imports: `lucide-react`, `react-router`.

Imported by: [apps/web/src/components/app/student-course-overview.tsx](../../apps/web/src/components/app/student-course-overview.tsx), [apps/web/src/components/app/student-courses.tsx](../../apps/web/src/components/app/student-courses.tsx), [apps/web/src/components/app/student-dashboard.tsx](../../apps/web/src/components/app/student-dashboard.tsx).

## components/app/student-onboarding.tsx

Source: [apps/web/src/components/app/student-onboarding.tsx](../../apps/web/src/components/app/student-onboarding.tsx)

Exports: `StudentOnboarding`.

Local dependencies: [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `email_verifications`, `users`.

Imported by: [apps/web/src/routes/app.onboarding.tsx](../../apps/web/src/routes/app.onboarding.tsx).

## components/app/student-practice.tsx

Source: [apps/web/src/components/app/student-practice.tsx](../../apps/web/src/components/app/student-practice.tsx)

Exports: `StudentPractice`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/conversation-practice.tsx](../../apps/web/src/components/app/conversation-practice.tsx), [apps/web/src/components/app/personal-practice.tsx](../../apps/web/src/components/app/personal-practice.tsx), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `enrollments`.

Imported by: [apps/web/src/routes/app.latihan.tsx](../../apps/web/src/routes/app.latihan.tsx).

## components/app/student-published-feedback.tsx

Source: [apps/web/src/components/app/student-published-feedback.tsx](../../apps/web/src/components/app/student-published-feedback.tsx)

Exports: `StudentPublishedFeedback`.

Local dependencies: [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/student-feedback.ts](../../apps/web/src/lib/student-feedback.ts).

Package imports: `react`.

Imported by: [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/student-grades.tsx](../../apps/web/src/components/app/student-grades.tsx).

## components/app/student-result-view.tsx

Source: [apps/web/src/components/app/student-result-view.tsx](../../apps/web/src/components/app/student-result-view.tsx)

Exports: `StudentResultView`.

Local dependencies: [apps/web/src/components/app/student-answer-sheet.tsx](../../apps/web/src/components/app/student-answer-sheet.tsx), [apps/web/src/lib/ai-evaluation.ts](../../apps/web/src/lib/ai-evaluation.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/student-feedback.ts](../../apps/web/src/lib/student-feedback.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Imported by: [apps/web/src/components/app/student-work-page.tsx](../../apps/web/src/components/app/student-work-page.tsx).

## components/app/student-work-page.tsx

Source: [apps/web/src/components/app/student-work-page.tsx](../../apps/web/src/components/app/student-work-page.tsx)

Exports: `StudentWorkPage`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/student-result-view.tsx](../../apps/web/src/components/app/student-result-view.tsx), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/course-route.ts](../../apps/web/src/lib/course-route.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assignment_submissions`, `assignments`.

Imported by: [apps/web/src/routes/app.kerja.$assignmentId.tsx](../../apps/web/src/routes/app.kerja.$assignmentId.tsx).

## components/app/submission-pdf-preview.tsx

Source: [apps/web/src/components/app/submission-pdf-preview.tsx](../../apps/web/src/components/app/submission-pdf-preview.tsx)

Exports: `SubmissionPdfPreview`.

Package imports: `pdfjs-dist`, `pdfjs-dist/build/pdf.worker.min.mjs?url`, `react`.

Imported by: [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx).

## components/app/submission-task-review.tsx

Source: [apps/web/src/components/app/submission-task-review.tsx](../../apps/web/src/components/app/submission-task-review.tsx)

Exports: `SubmissionTaskReview`.

Local dependencies: [apps/web/src/components/app/check-history.tsx](../../apps/web/src/components/app/check-history.tsx), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/check-types.ts](../../apps/web/src/lib/check-types.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `ai_feedback`, `assignment_submissions`, `task_answer_keys`.

Imported by: [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx).

## components/app/task-builders/builder-shared.tsx

Source: [apps/web/src/components/app/task-builders/builder-shared.tsx](../../apps/web/src/components/app/task-builders/builder-shared.tsx)

Exports: `NumberField`, `RowActions`, `ToggleField`, `newRowId`.

Package imports: `lucide-react`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/practice-content-autofill.tsx](../../apps/web/src/components/app/practice-content-autofill.tsx), [apps/web/src/components/app/task-builders/listening-builder.tsx](../../apps/web/src/components/app/task-builders/listening-builder.tsx), [apps/web/src/components/app/task-builders/quiz-builder.tsx](../../apps/web/src/components/app/task-builders/quiz-builder.tsx), [apps/web/src/components/app/task-builders/reading-builder.tsx](../../apps/web/src/components/app/task-builders/reading-builder.tsx), [apps/web/src/components/app/task-builders/speaking-builder.tsx](../../apps/web/src/components/app/task-builders/speaking-builder.tsx), [apps/web/src/components/app/task-builders/task-autofill.tsx](../../apps/web/src/components/app/task-builders/task-autofill.tsx), [apps/web/src/components/app/task-builders/writing-builder.tsx](../../apps/web/src/components/app/task-builders/writing-builder.tsx).

## components/app/task-builders/listening-builder.tsx

Source: [apps/web/src/components/app/task-builders/listening-builder.tsx](../../apps/web/src/components/app/task-builders/listening-builder.tsx)

Exports: `ListeningBuilder`, `ListeningBuilderValue`.

Local dependencies: [apps/web/src/components/app/form-status.tsx](../../apps/web/src/components/app/form-status.tsx), [apps/web/src/components/app/task-builders/builder-shared.tsx](../../apps/web/src/components/app/task-builders/builder-shared.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/resources.ts](../../apps/web/src/lib/resources.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `lucide-react`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx).

## components/app/task-builders/quiz-builder.tsx

Source: [apps/web/src/components/app/task-builders/quiz-builder.tsx](../../apps/web/src/components/app/task-builders/quiz-builder.tsx)

Exports: `QuizBuilder`, `QuizBuilderValue`.

Local dependencies: [apps/web/src/components/app/form-status.tsx](../../apps/web/src/components/app/form-status.tsx), [apps/web/src/components/app/task-builders/builder-shared.tsx](../../apps/web/src/components/app/task-builders/builder-shared.tsx), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `lucide-react`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx).

## components/app/task-builders/reading-builder.tsx

Source: [apps/web/src/components/app/task-builders/reading-builder.tsx](../../apps/web/src/components/app/task-builders/reading-builder.tsx)

Exports: `ReadingBuilder`.

Local dependencies: [apps/web/src/components/app/form-status.tsx](../../apps/web/src/components/app/form-status.tsx), [apps/web/src/components/app/task-builders/builder-shared.tsx](../../apps/web/src/components/app/task-builders/builder-shared.tsx), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `lucide-react`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx).

## components/app/task-builders/rubric-suggestions.tsx

Source: [apps/web/src/components/app/task-builders/rubric-suggestions.tsx](../../apps/web/src/components/app/task-builders/rubric-suggestions.tsx)

Exports: `RubricSuggestionsPanel`.

Local dependencies: [apps/web/src/lib/rubric-suggestions.ts](../../apps/web/src/lib/rubric-suggestions.ts).

Package imports: `lucide-react`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx).

## components/app/task-builders/speaking-builder.tsx

Source: [apps/web/src/components/app/task-builders/speaking-builder.tsx](../../apps/web/src/components/app/task-builders/speaking-builder.tsx)

Exports: `SpeakingBuilder`.

Local dependencies: [apps/web/src/components/app/task-builders/builder-shared.tsx](../../apps/web/src/components/app/task-builders/builder-shared.tsx), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `lucide-react`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx).

## components/app/task-builders/task-autofill.tsx

Source: [apps/web/src/components/app/task-builders/task-autofill.tsx](../../apps/web/src/components/app/task-builders/task-autofill.tsx)

Exports: `TaskAutofill`.

Local dependencies: [apps/web/src/components/app/form-status.tsx](../../apps/web/src/components/app/form-status.tsx), [apps/web/src/components/app/task-builders/builder-shared.tsx](../../apps/web/src/components/app/task-builders/builder-shared.tsx), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/structured-assignment.ts](../../apps/web/src/lib/structured-assignment.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx).

## components/app/task-builders/writing-builder.tsx

Source: [apps/web/src/components/app/task-builders/writing-builder.tsx](../../apps/web/src/components/app/task-builders/writing-builder.tsx)

Exports: `WritingBuilder`.

Local dependencies: [apps/web/src/components/app/task-builders/builder-shared.tsx](../../apps/web/src/components/app/task-builders/builder-shared.tsx), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `lucide-react`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx).

## components/app/task-workspaces/check-answer-panel.tsx

Source: [apps/web/src/components/app/task-workspaces/check-answer-panel.tsx](../../apps/web/src/components/app/task-workspaces/check-answer-panel.tsx)

Exports: `CheckAnswerPanel`, `CheckAssignmentInfo`, `CheckHistoryAttempt`, `LatestFeedback`.

Local dependencies: [apps/web/src/components/app/task-workspaces/check-feedback-body.tsx](../../apps/web/src/components/app/task-workspaces/check-feedback-body.tsx), [apps/web/src/components/app/task-workspaces/point-feedback.tsx](../../apps/web/src/components/app/task-workspaces/point-feedback.tsx), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/check-types.ts](../../apps/web/src/lib/check-types.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/formative-practice.tsx](../../apps/web/src/components/app/formative-practice.tsx), [apps/web/src/components/app/task-workspaces/listening-workspace.tsx](../../apps/web/src/components/app/task-workspaces/listening-workspace.tsx), [apps/web/src/components/app/task-workspaces/quiz-workspace.tsx](../../apps/web/src/components/app/task-workspaces/quiz-workspace.tsx), [apps/web/src/components/app/task-workspaces/reading-workspace.tsx](../../apps/web/src/components/app/task-workspaces/reading-workspace.tsx), [apps/web/src/components/app/task-workspaces/speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/writing-workspace.tsx](../../apps/web/src/components/app/task-workspaces/writing-workspace.tsx).

## components/app/task-workspaces/check-feedback-body.tsx

Source: [apps/web/src/components/app/task-workspaces/check-feedback-body.tsx](../../apps/web/src/components/app/task-workspaces/check-feedback-body.tsx)

Exports: `CheckEvidence`, `CheckFeedbackBody`.

Imported by: [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx), [apps/web/src/components/app/task-workspaces/check-answer-panel.tsx](../../apps/web/src/components/app/task-workspaces/check-answer-panel.tsx).

## components/app/task-workspaces/formative-speaking-workspace.tsx

Source: [apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx)

Exports: `FormativeSpeakingWorkspace`.

Local dependencies: [apps/web/src/components/app/audio-recorder.tsx](../../apps/web/src/components/app/audio-recorder.tsx), [apps/web/src/components/app/task-workspaces/point-feedback.tsx](../../apps/web/src/components/app/task-workspaces/point-feedback.tsx), [apps/web/src/components/app/task-workspaces/transcript-panel.tsx](../../apps/web/src/components/app/task-workspaces/transcript-panel.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/resources.ts](../../apps/web/src/lib/resources.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts), [apps/web/src/lib/transcription.ts](../../apps/web/src/lib/transcription.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assignment_submissions`.

Imported by: [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx).

## components/app/task-workspaces/listening-workspace.tsx

Source: [apps/web/src/components/app/task-workspaces/listening-workspace.tsx](../../apps/web/src/components/app/task-workspaces/listening-workspace.tsx)

Exports: `ListeningWorkspace`.

Local dependencies: [apps/web/src/components/app/task-workspaces/check-answer-panel.tsx](../../apps/web/src/components/app/task-workspaces/check-answer-panel.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `assignment_submissions`.

Imported by: [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx).

## components/app/task-workspaces/point-feedback.tsx

Source: [apps/web/src/components/app/task-workspaces/point-feedback.tsx](../../apps/web/src/components/app/task-workspaces/point-feedback.tsx)

Exports: `FeedbackPoint`, `PointFeedback`, `PointStatus`, `conciseFeedbackLine`, `parseFeedbackPoints`, `readableCase`, `shortenAdvice`.

Imported by: [apps/web/src/components/app/formative-answer-script.tsx](../../apps/web/src/components/app/formative-answer-script.tsx), [apps/web/src/components/app/formative-evaluation-review.tsx](../../apps/web/src/components/app/formative-evaluation-review.tsx), [apps/web/src/components/app/task-workspaces/check-answer-panel.tsx](../../apps/web/src/components/app/task-workspaces/check-answer-panel.tsx), [apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/writing-workspace.tsx](../../apps/web/src/components/app/task-workspaces/writing-workspace.tsx).

## components/app/task-workspaces/quiz-workspace.tsx

Source: [apps/web/src/components/app/task-workspaces/quiz-workspace.tsx](../../apps/web/src/components/app/task-workspaces/quiz-workspace.tsx)

Exports: `QuizWorkspace`.

Local dependencies: [apps/web/src/components/app/task-workspaces/check-answer-panel.tsx](../../apps/web/src/components/app/task-workspaces/check-answer-panel.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `assignment_submissions`.

Imported by: [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx).

## components/app/task-workspaces/reading-workspace.tsx

Source: [apps/web/src/components/app/task-workspaces/reading-workspace.tsx](../../apps/web/src/components/app/task-workspaces/reading-workspace.tsx)

Exports: `ReadingWorkspace`.

Local dependencies: [apps/web/src/components/app/task-workspaces/check-answer-panel.tsx](../../apps/web/src/components/app/task-workspaces/check-answer-panel.tsx), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx).

## components/app/task-workspaces/speaking-student-panel.tsx

Source: [apps/web/src/components/app/task-workspaces/speaking-student-panel.tsx](../../apps/web/src/components/app/task-workspaces/speaking-student-panel.tsx)

Exports: `SpeakingChecklist`, `SpeakingClip`, `SpeakingPrepare`, `SpeakingRecord`, `SpeakingTranscriptSlot`.

Local dependencies: [apps/web/src/components/app/audio-recorder.tsx](../../apps/web/src/components/app/audio-recorder.tsx), [apps/web/src/components/app/worksheet-art.tsx](../../apps/web/src/components/app/worksheet-art.tsx), [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx), [apps/web/src/lib/speaking-directions.ts](../../apps/web/src/lib/speaking-directions.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx).

## components/app/task-workspaces/speaking-workspace.tsx

Source: [apps/web/src/components/app/task-workspaces/speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/speaking-workspace.tsx)

Exports: `SpeakingWorkspace`.

Local dependencies: [apps/web/src/components/app/audio-recorder.tsx](../../apps/web/src/components/app/audio-recorder.tsx), [apps/web/src/components/app/task-workspaces/check-answer-panel.tsx](../../apps/web/src/components/app/task-workspaces/check-answer-panel.tsx), [apps/web/src/components/app/task-workspaces/transcript-panel.tsx](../../apps/web/src/components/app/task-workspaces/transcript-panel.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx), [apps/web/src/lib/ai-evaluation.ts](../../apps/web/src/lib/ai-evaluation.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/resources.ts](../../apps/web/src/lib/resources.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts), [apps/web/src/lib/transcription.ts](../../apps/web/src/lib/transcription.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx).

## components/app/task-workspaces/transcript-panel.tsx

Source: [apps/web/src/components/app/task-workspaces/transcript-panel.tsx](../../apps/web/src/components/app/task-workspaces/transcript-panel.tsx)

Exports: `TranscriptPanel`.

Local dependencies: [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/transcription.ts](../../apps/web/src/lib/transcription.ts).

Package imports: `lucide-react`, `react`.

Literal database references: `assignment_submissions`.

Imported by: [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx), [apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/speaking-workspace.tsx).

## components/app/task-workspaces/writing-workspace.tsx

Source: [apps/web/src/components/app/task-workspaces/writing-workspace.tsx](../../apps/web/src/components/app/task-workspaces/writing-workspace.tsx)

Exports: `WritingWorkspace`.

Local dependencies: [apps/web/src/components/app/formative-answer-script.tsx](../../apps/web/src/components/app/formative-answer-script.tsx), [apps/web/src/components/app/task-workspaces/check-answer-panel.tsx](../../apps/web/src/components/app/task-workspaces/check-answer-panel.tsx), [apps/web/src/components/app/task-workspaces/point-feedback.tsx](../../apps/web/src/components/app/task-workspaces/point-feedback.tsx), [apps/web/src/components/app/worksheet-art.tsx](../../apps/web/src/components/app/worksheet-art.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/lib/ai-evaluation.ts](../../apps/web/src/lib/ai-evaluation.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/resources.ts](../../apps/web/src/lib/resources.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `lucide-react`, `react`, `react-dom`.

Literal database references: `assignment_submissions`.

Imported by: [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx).

## components/app/tugas-board.tsx

Source: [apps/web/src/components/app/tugas-board.tsx](../../apps/web/src/components/app/tugas-board.tsx)

Exports: `TugasBoard`.

Local dependencies: [apps/web/src/components/app/course-thumb.tsx](../../apps/web/src/components/app/course-thumb.tsx), [apps/web/src/components/app/difficulty-summary.tsx](../../apps/web/src/components/app/difficulty-summary.tsx), [apps/web/src/components/card-cta.tsx](../../apps/web/src/components/card-cta.tsx), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assignment_submissions`, `assignments`, `check_attempts`, `courses`, `public_submissions`.

Imported by: [apps/web/src/routes/app.tugas.tsx](../../apps/web/src/routes/app.tugas.tsx).

## components/app/tugas-insights.tsx

Source: [apps/web/src/components/app/tugas-insights.tsx](../../apps/web/src/components/app/tugas-insights.tsx)

Exports: `TugasInsights`.

Local dependencies: [apps/web/src/components/app/difficulty-insights.tsx](../../apps/web/src/components/app/difficulty-insights.tsx), [apps/web/src/components/app/lecturer-recommendations.tsx](../../apps/web/src/components/app/lecturer-recommendations.tsx), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assignments`, `courses`.

Imported by: [apps/web/src/routes/app.tugas.insights.tsx](../../apps/web/src/routes/app.tugas.insights.tsx).

## components/app/welcome-tour.tsx

Source: [apps/web/src/components/app/welcome-tour.tsx](../../apps/web/src/components/app/welcome-tour.tsx)

Exports: `TOUR_REPLAY_EVENT`, `WelcomeTour`, `tourSessionKey`.

Local dependencies: [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx), [apps/web/src/components/ui/dialog.tsx](../../apps/web/src/components/ui/dialog.tsx), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Imported by: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/auth/auth-panel.tsx](../../apps/web/src/components/auth/auth-panel.tsx), [apps/web/src/root.tsx](../../apps/web/src/root.tsx).

## components/app/worksheet-art.tsx

Source: [apps/web/src/components/app/worksheet-art.tsx](../../apps/web/src/components/app/worksheet-art.tsx)

Exports: `WorksheetArt`, `WorksheetArtName`.

Imported by: [apps/web/src/components/app/student-answer-sheet.tsx](../../apps/web/src/components/app/student-answer-sheet.tsx), [apps/web/src/components/app/task-workspaces/speaking-student-panel.tsx](../../apps/web/src/components/app/task-workspaces/speaking-student-panel.tsx), [apps/web/src/components/app/task-workspaces/writing-workspace.tsx](../../apps/web/src/components/app/task-workspaces/writing-workspace.tsx).

## components/app/workspace-guide-pages.ts

Source: [apps/web/src/components/app/workspace-guide-pages.ts](../../apps/web/src/components/app/workspace-guide-pages.ts)

Exports: `dedicatedPageSteps`.

Local dependencies: [apps/web/src/components/app/workspace-guide-steps.ts](../../apps/web/src/components/app/workspace-guide-steps.ts).

Imported by: [apps/web/src/components/app/workspace-guide-steps.ts](../../apps/web/src/components/app/workspace-guide-steps.ts).

## components/app/workspace-guide-steps.ts

Source: [apps/web/src/components/app/workspace-guide-steps.ts](../../apps/web/src/components/app/workspace-guide-steps.ts)

Exports: `WalkthroughStep`, `guideCopy`, `pageSteps`.

Local dependencies: [apps/web/src/components/app/workspace-guide-pages.ts](../../apps/web/src/components/app/workspace-guide-pages.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts).

Imported by: [apps/web/src/components/app/workspace-guide-pages.ts](../../apps/web/src/components/app/workspace-guide-pages.ts), [apps/web/src/components/app/workspace-guide.tsx](../../apps/web/src/components/app/workspace-guide.tsx).

## components/app/workspace-guide.tsx

Source: [apps/web/src/components/app/workspace-guide.tsx](../../apps/web/src/components/app/workspace-guide.tsx)

Exports: `WorkspaceGuide`.

Local dependencies: [apps/web/src/components/app/workspace-guide-steps.ts](../../apps/web/src/components/app/workspace-guide-steps.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/styles/workspace-guide.css](../../apps/web/src/styles/workspace-guide.css).

Package imports: `@radix-ui/react-dialog`, `framer-motion`, `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx).

## components/auth/auth-panel.tsx

Source: [apps/web/src/components/auth/auth-panel.tsx](../../apps/web/src/components/auth/auth-panel.tsx)

Exports: `AuthPanel`.

Local dependencies: [apps/web/src/components/app/welcome-tour.tsx](../../apps/web/src/components/app/welcome-tour.tsx), [apps/web/src/components/auth/login-feature-preview.tsx](../../apps/web/src/components/auth/login-feature-preview.tsx), [apps/web/src/components/brand/laras-lockup.tsx](../../apps/web/src/components/brand/laras-lockup.tsx), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/styles/login-light.css](../../apps/web/src/styles/login-light.css).

Package imports: `lucide-react`, `react`, `react-router`.

Imported by: [apps/web/src/routes/login.tsx](../../apps/web/src/routes/login.tsx).

## components/auth/login-feature-preview.tsx

Source: [apps/web/src/components/auth/login-feature-preview.tsx](../../apps/web/src/components/auth/login-feature-preview.tsx)

Exports: `LoginFeaturePreview`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/components/auth/auth-panel.tsx](../../apps/web/src/components/auth/auth-panel.tsx).

## components/brand/laras-lockup.tsx

Source: [apps/web/src/components/brand/laras-lockup.tsx](../../apps/web/src/components/brand/laras-lockup.tsx)

Exports: `LarasLockup`, `LarasMark`.

Imported by: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/auth/auth-panel.tsx](../../apps/web/src/components/auth/auth-panel.tsx), [apps/web/src/components/site-footer.tsx](../../apps/web/src/components/site-footer.tsx), [apps/web/src/components/site-header.tsx](../../apps/web/src/components/site-header.tsx).

## components/card-cta.tsx

Source: [apps/web/src/components/card-cta.tsx](../../apps/web/src/components/card-cta.tsx)

Exports: `CardCta`.

Package imports: `lucide-react`, `react-router`.

Imported by: [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/student-dashboard.tsx](../../apps/web/src/components/app/student-dashboard.tsx), [apps/web/src/components/app/tugas-board.tsx](../../apps/web/src/components/app/tugas-board.tsx).

## components/confirm-dialog.tsx

Source: [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx)

Exports: `ConfirmDialogHost`, `ConfirmOptions`, `ConfirmVariant`, `confirmDialog`.

Package imports: `lucide-react`, `react`, `react-dom`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/assistant-panel.tsx](../../apps/web/src/components/app/assistant-panel.tsx), [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/course-resources.tsx](../../apps/web/src/components/app/course-resources.tsx), [apps/web/src/components/app/course-roster.tsx](../../apps/web/src/components/app/course-roster.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/file-context.tsx](../../apps/web/src/components/app/file-context.tsx), [apps/web/src/components/app/file-library.tsx](../../apps/web/src/components/app/file-library.tsx), [apps/web/src/components/app/file-version-history.tsx](../../apps/web/src/components/app/file-version-history.tsx), [apps/web/src/components/app/formative-practice.tsx](../../apps/web/src/components/app/formative-practice.tsx), [apps/web/src/components/app/lecturer-gradebook.tsx](../../apps/web/src/components/app/lecturer-gradebook.tsx), [apps/web/src/components/app/structured-records.tsx](../../apps/web/src/components/app/structured-records.tsx), [apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/listening-workspace.tsx](../../apps/web/src/components/app/task-workspaces/listening-workspace.tsx), [apps/web/src/components/app/task-workspaces/quiz-workspace.tsx](../../apps/web/src/components/app/task-workspaces/quiz-workspace.tsx), [apps/web/src/components/app/task-workspaces/speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/writing-workspace.tsx](../../apps/web/src/components/app/task-workspaces/writing-workspace.tsx), [apps/web/src/root.tsx](../../apps/web/src/root.tsx).

## components/editor-overlay-guard.tsx

Source: [apps/web/src/components/editor-overlay-guard.tsx](../../apps/web/src/components/editor-overlay-guard.tsx)

Exports: `EditorOverlayGuard`.

Package imports: `react`.

Imported by: [apps/web/src/root.tsx](../../apps/web/src/root.tsx).

## components/form-stepper.tsx

Source: [apps/web/src/components/form-stepper.tsx](../../apps/web/src/components/form-stepper.tsx)

Exports: `FormStep`, `FormStepper`.

Package imports: `lucide-react`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/file-upload-dialog.tsx](../../apps/web/src/components/app/file-upload-dialog.tsx), [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx), [apps/web/src/components/app/rps-editor-page.tsx](../../apps/web/src/components/app/rps-editor-page.tsx), [apps/web/src/components/app/student-answer-sheet.tsx](../../apps/web/src/components/app/student-answer-sheet.tsx).

## components/home/ai-context.tsx

Source: [apps/web/src/components/home/ai-context.tsx](../../apps/web/src/components/home/ai-context.tsx)

Exports: `AiContext`.

Package imports: `lucide-react`.

## components/home/analytics.tsx

Source: [apps/web/src/components/home/analytics.tsx](../../apps/web/src/components/home/analytics.tsx)

Exports: `Analytics`.

Package imports: `lucide-react`.

## components/home/capabilities.tsx

Source: [apps/web/src/components/home/capabilities.tsx](../../apps/web/src/components/home/capabilities.tsx)

Exports: `Capabilities`.

Package imports: `lucide-react`.

## components/home/compact-tour.tsx

Source: [apps/web/src/components/home/compact-tour.tsx](../../apps/web/src/components/home/compact-tour.tsx)

Exports: `CompactWorkflow`, `ProgressAndTrust`.

Package imports: `lucide-react`, `react`.

Imported by: [apps/web/src/routes/home.tsx](../../apps/web/src/routes/home.tsx).

## components/home/final-cta.tsx

Source: [apps/web/src/components/home/final-cta.tsx](../../apps/web/src/components/home/final-cta.tsx)

Exports: `FinalCta`.

Package imports: `lucide-react`, `react-router`.

Imported by: [apps/web/src/routes/home.tsx](../../apps/web/src/routes/home.tsx).

## components/home/hero.tsx

Source: [apps/web/src/components/home/hero.tsx](../../apps/web/src/components/home/hero.tsx)

Exports: `Hero`.

Package imports: `lucide-react`, `react-router`.

Imported by: [apps/web/src/routes/home.tsx](../../apps/web/src/routes/home.tsx).

## components/home/landing-effects.tsx

Source: [apps/web/src/components/home/landing-effects.tsx](../../apps/web/src/components/home/landing-effects.tsx)

Exports: `LandingEffects`.

Package imports: `react`.

Imported by: [apps/web/src/routes/home.tsx](../../apps/web/src/routes/home.tsx).

## components/home/lecturer.tsx

Source: [apps/web/src/components/home/lecturer.tsx](../../apps/web/src/components/home/lecturer.tsx)

Exports: `Lecturer`.

Package imports: `lucide-react`.

## components/home/student-journey.tsx

Source: [apps/web/src/components/home/student-journey.tsx](../../apps/web/src/components/home/student-journey.tsx)

Exports: `StudentJourney`.

Package imports: `lucide-react`.

## components/home/workflow.tsx

Source: [apps/web/src/components/home/workflow.tsx](../../apps/web/src/components/home/workflow.tsx)

Exports: `Workflow`.

## components/home/workspace-preview.tsx

Source: [apps/web/src/components/home/workspace-preview.tsx](../../apps/web/src/components/home/workspace-preview.tsx)

Exports: `WorkspacePreview`.

Package imports: `lucide-react`, `react`, `react-router`.

Imported by: [apps/web/src/routes/home.tsx](../../apps/web/src/routes/home.tsx).

## components/site-footer.tsx

Source: [apps/web/src/components/site-footer.tsx](../../apps/web/src/components/site-footer.tsx)

Exports: `SiteFooter`.

Local dependencies: [apps/web/src/components/brand/laras-lockup.tsx](../../apps/web/src/components/brand/laras-lockup.tsx), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/styles/login-light.css](../../apps/web/src/styles/login-light.css).

Package imports: `react-router`.

Imported by: [apps/web/src/root.tsx](../../apps/web/src/root.tsx).

## components/site-header.tsx

Source: [apps/web/src/components/site-header.tsx](../../apps/web/src/components/site-header.tsx)

Exports: `SiteHeader`.

Local dependencies: [apps/web/src/components/brand/laras-lockup.tsx](../../apps/web/src/components/brand/laras-lockup.tsx), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/styles/login-light.css](../../apps/web/src/styles/login-light.css).

Package imports: `lucide-react`, `react`, `react-router`.

Imported by: [apps/web/src/root.tsx](../../apps/web/src/root.tsx).

## components/ui/accordion.tsx

Source: [apps/web/src/components/ui/accordion.tsx](../../apps/web/src/components/ui/accordion.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-accordion`, `lucide-react`, `react`.

## components/ui/alert-dialog.tsx

Source: [apps/web/src/components/ui/alert-dialog.tsx](../../apps/web/src/components/ui/alert-dialog.tsx)

Local dependencies: [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx), [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-alert-dialog`, `react`.

## components/ui/alert.tsx

Source: [apps/web/src/components/ui/alert.tsx](../../apps/web/src/components/ui/alert.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `class-variance-authority`, `react`.

## components/ui/aspect-ratio.tsx

Source: [apps/web/src/components/ui/aspect-ratio.tsx](../../apps/web/src/components/ui/aspect-ratio.tsx)

Package imports: `@radix-ui/react-aspect-ratio`.

## components/ui/avatar.tsx

Source: [apps/web/src/components/ui/avatar.tsx](../../apps/web/src/components/ui/avatar.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-avatar`, `react`.

## components/ui/badge.tsx

Source: [apps/web/src/components/ui/badge.tsx](../../apps/web/src/components/ui/badge.tsx)

Exports: `BadgeProps`.

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `class-variance-authority`, `react`.

## components/ui/breadcrumb.tsx

Source: [apps/web/src/components/ui/breadcrumb.tsx](../../apps/web/src/components/ui/breadcrumb.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-slot`, `lucide-react`, `react`.

## components/ui/button-group.tsx

Source: [apps/web/src/components/ui/button-group.tsx](../../apps/web/src/components/ui/button-group.tsx)

Local dependencies: [apps/web/src/components/ui/separator.tsx](../../apps/web/src/components/ui/separator.tsx), [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-slot`, `class-variance-authority`, `react`.

## components/ui/button.tsx

Source: [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx)

Exports: `ButtonProps`.

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-slot`, `class-variance-authority`, `react`.

Imported by: [apps/web/src/components/app/audio-recorder.tsx](../../apps/web/src/components/app/audio-recorder.tsx), [apps/web/src/components/app/conversation-practice.tsx](../../apps/web/src/components/app/conversation-practice.tsx), [apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/speaking-student-panel.tsx](../../apps/web/src/components/app/task-workspaces/speaking-student-panel.tsx), [apps/web/src/components/app/task-workspaces/speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/transcript-panel.tsx](../../apps/web/src/components/app/task-workspaces/transcript-panel.tsx), [apps/web/src/components/app/welcome-tour.tsx](../../apps/web/src/components/app/welcome-tour.tsx), [apps/web/src/components/ui/alert-dialog.tsx](../../apps/web/src/components/ui/alert-dialog.tsx), [apps/web/src/components/ui/calendar.tsx](../../apps/web/src/components/ui/calendar.tsx), [apps/web/src/components/ui/carousel.tsx](../../apps/web/src/components/ui/carousel.tsx), [apps/web/src/components/ui/input-group.tsx](../../apps/web/src/components/ui/input-group.tsx), [apps/web/src/components/ui/pagination.tsx](../../apps/web/src/components/ui/pagination.tsx), [apps/web/src/components/ui/sidebar.tsx](../../apps/web/src/components/ui/sidebar.tsx).

## components/ui/calendar.tsx

Source: [apps/web/src/components/ui/calendar.tsx](../../apps/web/src/components/ui/calendar.tsx)

Local dependencies: [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx), [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `lucide-react`, `react`, `react-day-picker`.

Imported by: [apps/web/src/components/app/datetime-picker.tsx](../../apps/web/src/components/app/datetime-picker.tsx), [apps/web/src/components/app/session-date-autofill.tsx](../../apps/web/src/components/app/session-date-autofill.tsx).

## components/ui/card.tsx

Source: [apps/web/src/components/ui/card.tsx](../../apps/web/src/components/ui/card.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `react`.

## components/ui/carousel.tsx

Source: [apps/web/src/components/ui/carousel.tsx](../../apps/web/src/components/ui/carousel.tsx)

Local dependencies: [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx), [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `embla-carousel-react`, `lucide-react`, `react`.

## components/ui/chart.tsx

Source: [apps/web/src/components/ui/chart.tsx](../../apps/web/src/components/ui/chart.tsx)

Exports: `ChartConfig`.

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `react`, `recharts`.

## components/ui/checkbox.tsx

Source: [apps/web/src/components/ui/checkbox.tsx](../../apps/web/src/components/ui/checkbox.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-checkbox`, `lucide-react`, `react`.

## components/ui/collapsible.tsx

Source: [apps/web/src/components/ui/collapsible.tsx](../../apps/web/src/components/ui/collapsible.tsx)

Package imports: `@radix-ui/react-collapsible`.

## components/ui/command.tsx

Source: [apps/web/src/components/ui/command.tsx](../../apps/web/src/components/ui/command.tsx)

Local dependencies: [apps/web/src/components/ui/dialog.tsx](../../apps/web/src/components/ui/dialog.tsx), [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `cmdk`, `lucide-react`, `react`.

## components/ui/context-menu.tsx

Source: [apps/web/src/components/ui/context-menu.tsx](../../apps/web/src/components/ui/context-menu.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-context-menu`, `lucide-react`, `react`.

## components/ui/dialog.tsx

Source: [apps/web/src/components/ui/dialog.tsx](../../apps/web/src/components/ui/dialog.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-dialog`, `lucide-react`, `react`.

Imported by: [apps/web/src/components/app/welcome-tour.tsx](../../apps/web/src/components/app/welcome-tour.tsx), [apps/web/src/components/ui/command.tsx](../../apps/web/src/components/ui/command.tsx).

## components/ui/drawer.tsx

Source: [apps/web/src/components/ui/drawer.tsx](../../apps/web/src/components/ui/drawer.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `react`, `vaul`.

## components/ui/dropdown-menu.tsx

Source: [apps/web/src/components/ui/dropdown-menu.tsx](../../apps/web/src/components/ui/dropdown-menu.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-dropdown-menu`, `lucide-react`, `react`.

## components/ui/empty.tsx

Source: [apps/web/src/components/ui/empty.tsx](../../apps/web/src/components/ui/empty.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `class-variance-authority`, `react`.

## components/ui/field.tsx

Source: [apps/web/src/components/ui/field.tsx](../../apps/web/src/components/ui/field.tsx)

Local dependencies: [apps/web/src/components/ui/label.tsx](../../apps/web/src/components/ui/label.tsx), [apps/web/src/components/ui/separator.tsx](../../apps/web/src/components/ui/separator.tsx), [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `class-variance-authority`, `react`.

## components/ui/form.tsx

Source: [apps/web/src/components/ui/form.tsx](../../apps/web/src/components/ui/form.tsx)

Local dependencies: [apps/web/src/components/ui/label.tsx](../../apps/web/src/components/ui/label.tsx), [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-slot`, `react`, `react-hook-form`.

## components/ui/hover-card.tsx

Source: [apps/web/src/components/ui/hover-card.tsx](../../apps/web/src/components/ui/hover-card.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-hover-card`, `react`.

## components/ui/input-group.tsx

Source: [apps/web/src/components/ui/input-group.tsx](../../apps/web/src/components/ui/input-group.tsx)

Local dependencies: [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx), [apps/web/src/components/ui/input.tsx](../../apps/web/src/components/ui/input.tsx), [apps/web/src/components/ui/textarea.tsx](../../apps/web/src/components/ui/textarea.tsx), [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `class-variance-authority`, `react`.

## components/ui/input-otp.tsx

Source: [apps/web/src/components/ui/input-otp.tsx](../../apps/web/src/components/ui/input-otp.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `input-otp`, `lucide-react`, `react`.

## components/ui/input.tsx

Source: [apps/web/src/components/ui/input.tsx](../../apps/web/src/components/ui/input.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `react`.

Imported by: [apps/web/src/components/ui/input-group.tsx](../../apps/web/src/components/ui/input-group.tsx), [apps/web/src/components/ui/sidebar.tsx](../../apps/web/src/components/ui/sidebar.tsx).

## components/ui/item.tsx

Source: [apps/web/src/components/ui/item.tsx](../../apps/web/src/components/ui/item.tsx)

Local dependencies: [apps/web/src/components/ui/separator.tsx](../../apps/web/src/components/ui/separator.tsx), [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-slot`, `class-variance-authority`, `react`.

## components/ui/kbd.tsx

Source: [apps/web/src/components/ui/kbd.tsx](../../apps/web/src/components/ui/kbd.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `react`.

## components/ui/label.tsx

Source: [apps/web/src/components/ui/label.tsx](../../apps/web/src/components/ui/label.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-label`, `class-variance-authority`, `react`.

Imported by: [apps/web/src/components/ui/field.tsx](../../apps/web/src/components/ui/field.tsx), [apps/web/src/components/ui/form.tsx](../../apps/web/src/components/ui/form.tsx).

## components/ui/menubar.tsx

Source: [apps/web/src/components/ui/menubar.tsx](../../apps/web/src/components/ui/menubar.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-menubar`, `lucide-react`, `react`.

## components/ui/navigation-menu.tsx

Source: [apps/web/src/components/ui/navigation-menu.tsx](../../apps/web/src/components/ui/navigation-menu.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-navigation-menu`, `class-variance-authority`, `lucide-react`, `react`.

## components/ui/pagination.tsx

Source: [apps/web/src/components/ui/pagination.tsx](../../apps/web/src/components/ui/pagination.tsx)

Local dependencies: [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx), [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `lucide-react`, `react`.

## components/ui/popover.tsx

Source: [apps/web/src/components/ui/popover.tsx](../../apps/web/src/components/ui/popover.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-popover`, `react`.

Imported by: [apps/web/src/components/app/datetime-picker.tsx](../../apps/web/src/components/app/datetime-picker.tsx), [apps/web/src/components/app/session-date-autofill.tsx](../../apps/web/src/components/app/session-date-autofill.tsx).

## components/ui/progress.tsx

Source: [apps/web/src/components/ui/progress.tsx](../../apps/web/src/components/ui/progress.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-progress`, `react`.

## components/ui/radio-group.tsx

Source: [apps/web/src/components/ui/radio-group.tsx](../../apps/web/src/components/ui/radio-group.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-radio-group`, `lucide-react`, `react`.

## components/ui/resizable.tsx

Source: [apps/web/src/components/ui/resizable.tsx](../../apps/web/src/components/ui/resizable.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `lucide-react`, `react`, `react-resizable-panels`.

## components/ui/scroll-area.tsx

Source: [apps/web/src/components/ui/scroll-area.tsx](../../apps/web/src/components/ui/scroll-area.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-scroll-area`, `react`.

## components/ui/select.tsx

Source: [apps/web/src/components/ui/select.tsx](../../apps/web/src/components/ui/select.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-select`, `lucide-react`, `react`.

## components/ui/separator.tsx

Source: [apps/web/src/components/ui/separator.tsx](../../apps/web/src/components/ui/separator.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-separator`, `react`.

Imported by: [apps/web/src/components/ui/button-group.tsx](../../apps/web/src/components/ui/button-group.tsx), [apps/web/src/components/ui/field.tsx](../../apps/web/src/components/ui/field.tsx), [apps/web/src/components/ui/item.tsx](../../apps/web/src/components/ui/item.tsx), [apps/web/src/components/ui/sidebar.tsx](../../apps/web/src/components/ui/sidebar.tsx).

## components/ui/sheet.tsx

Source: [apps/web/src/components/ui/sheet.tsx](../../apps/web/src/components/ui/sheet.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-dialog`, `class-variance-authority`, `lucide-react`, `react`.

Imported by: [apps/web/src/components/ui/sidebar.tsx](../../apps/web/src/components/ui/sidebar.tsx).

## components/ui/sidebar.tsx

Source: [apps/web/src/components/ui/sidebar.tsx](../../apps/web/src/components/ui/sidebar.tsx)

Local dependencies: [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx), [apps/web/src/components/ui/input.tsx](../../apps/web/src/components/ui/input.tsx), [apps/web/src/components/ui/separator.tsx](../../apps/web/src/components/ui/separator.tsx), [apps/web/src/components/ui/sheet.tsx](../../apps/web/src/components/ui/sheet.tsx), [apps/web/src/components/ui/skeleton.tsx](../../apps/web/src/components/ui/skeleton.tsx), [apps/web/src/components/ui/tooltip.tsx](../../apps/web/src/components/ui/tooltip.tsx), [apps/web/src/hooks/use-mobile.tsx](../../apps/web/src/hooks/use-mobile.tsx), [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-slot`, `class-variance-authority`, `lucide-react`, `react`.

## components/ui/skeleton.tsx

Source: [apps/web/src/components/ui/skeleton.tsx](../../apps/web/src/components/ui/skeleton.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `react`.

Imported by: [apps/web/src/components/ui/sidebar.tsx](../../apps/web/src/components/ui/sidebar.tsx).

## components/ui/slider.tsx

Source: [apps/web/src/components/ui/slider.tsx](../../apps/web/src/components/ui/slider.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-slider`, `react`.

## components/ui/sonner.tsx

Source: [apps/web/src/components/ui/sonner.tsx](../../apps/web/src/components/ui/sonner.tsx)

Package imports: `next-themes`, `sonner`.

## components/ui/spinner.tsx

Source: [apps/web/src/components/ui/spinner.tsx](../../apps/web/src/components/ui/spinner.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `lucide-react`, `react`.

## components/ui/switch.tsx

Source: [apps/web/src/components/ui/switch.tsx](../../apps/web/src/components/ui/switch.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-switch`, `react`.

## components/ui/table.tsx

Source: [apps/web/src/components/ui/table.tsx](../../apps/web/src/components/ui/table.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `react`.

## components/ui/tabs.tsx

Source: [apps/web/src/components/ui/tabs.tsx](../../apps/web/src/components/ui/tabs.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-tabs`, `react`.

## components/ui/textarea.tsx

Source: [apps/web/src/components/ui/textarea.tsx](../../apps/web/src/components/ui/textarea.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `react`.

Imported by: [apps/web/src/components/ui/input-group.tsx](../../apps/web/src/components/ui/input-group.tsx).

## components/ui/toast.tsx

Source: [apps/web/src/components/ui/toast.tsx](../../apps/web/src/components/ui/toast.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-toast`, `class-variance-authority`, `lucide-react`, `react`.

Imported by: [apps/web/src/components/ui/toaster.tsx](../../apps/web/src/components/ui/toaster.tsx), [apps/web/src/hooks/use-toast.ts](../../apps/web/src/hooks/use-toast.ts).

## components/ui/toaster.tsx

Source: [apps/web/src/components/ui/toaster.tsx](../../apps/web/src/components/ui/toaster.tsx)

Exports: `Toaster`.

Local dependencies: [apps/web/src/components/ui/toast.tsx](../../apps/web/src/components/ui/toast.tsx), [apps/web/src/hooks/use-toast.ts](../../apps/web/src/hooks/use-toast.ts).

## components/ui/toggle-group.tsx

Source: [apps/web/src/components/ui/toggle-group.tsx](../../apps/web/src/components/ui/toggle-group.tsx)

Local dependencies: [apps/web/src/components/ui/toggle.tsx](../../apps/web/src/components/ui/toggle.tsx), [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-toggle-group`, `class-variance-authority`, `react`.

## components/ui/toggle.tsx

Source: [apps/web/src/components/ui/toggle.tsx](../../apps/web/src/components/ui/toggle.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-toggle`, `class-variance-authority`, `react`.

Imported by: [apps/web/src/components/ui/toggle-group.tsx](../../apps/web/src/components/ui/toggle-group.tsx).

## components/ui/tooltip.tsx

Source: [apps/web/src/components/ui/tooltip.tsx](../../apps/web/src/components/ui/tooltip.tsx)

Local dependencies: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts).

Package imports: `@radix-ui/react-tooltip`, `react`.

Imported by: [apps/web/src/components/ui/sidebar.tsx](../../apps/web/src/components/ui/sidebar.tsx).

## constants/ai-assistant.config.ts

Source: [apps/web/src/constants/ai-assistant.config.ts](../../apps/web/src/constants/ai-assistant.config.ts)

Exports: `REQUIRE_LOGIN`, `SYSTEM_PROMPT`.

Imported by: [apps/web/src/lib/integrated-ai.server.ts](../../apps/web/src/lib/integrated-ai.server.ts), [apps/web/src/routes/api.integrated-ai.stream.ts](../../apps/web/src/routes/api.integrated-ai.stream.ts).

## constants/assistant.config.ts

Source: [apps/web/src/constants/assistant.config.ts](../../apps/web/src/constants/assistant.config.ts)

Exports: `ASSISTANT_COMPACTION_MESSAGE_THRESHOLD`, `ASSISTANT_COMPACTION_TOKEN_THRESHOLD`, `ASSISTANT_HISTORY_RETRIEVAL_LIMIT`, `ASSISTANT_MAX_HISTORY`, `ASSISTANT_MIN_MESSAGES_BEFORE_COMPACTION`, `ASSISTANT_RECENT_MESSAGE_WINDOW`, `ASSISTANT_SYSTEM_PROMPT`.

Imported by: [apps/web/src/lib/assistant/compaction.ts](../../apps/web/src/lib/assistant/compaction.ts), [apps/web/src/lib/assistant/context.server.ts](../../apps/web/src/lib/assistant/context.server.ts), [apps/web/src/lib/assistant/history-retrieval.server.ts](../../apps/web/src/lib/assistant/history-retrieval.server.ts), [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts).

## data/academic-calendar.ts

Source: [apps/web/src/data/academic-calendar.ts](../../apps/web/src/data/academic-calendar.ts)

Exports: `CALENDAR_EVENTS`, `CALENDAR_RANGE`, `CALENDAR_SOURCES`, `CATEGORY_META`, `CalendarCategory`, `CalendarEvent`, `CalendarSource`.

Imported by: [apps/web/src/components/app/academic-calendar.tsx](../../apps/web/src/components/app/academic-calendar.tsx), [apps/web/src/components/app/course-dashboard.tsx](../../apps/web/src/components/app/course-dashboard.tsx), [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts), [apps/web/src/lib/session-dates.ts](../../apps/web/src/lib/session-dates.ts).

## hooks/use-attendance.ts

Source: [apps/web/src/hooks/use-attendance.ts](../../apps/web/src/hooks/use-attendance.ts)

Exports: `AttendanceMap`, `AttendanceRecord`, `AttendanceStatus`, `useMyAttendance`, `useSessionAttendance`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `react`.

Literal database references: `attendance`.

Imported by: [apps/web/src/components/app/attendance-manager.tsx](../../apps/web/src/components/app/attendance-manager.tsx), [apps/web/src/components/app/session-roster.tsx](../../apps/web/src/components/app/session-roster.tsx).

## hooks/use-auth.ts

Source: [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts)

Exports: `useAuth`.

Local dependencies: [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `react`.

Literal database references: `users`.

Imported by: [apps/web/src/components/app/academic-calendar.tsx](../../apps/web/src/components/app/academic-calendar.tsx), [apps/web/src/components/app/analytics-index.tsx](../../apps/web/src/components/app/analytics-index.tsx), [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/course-rail.tsx](../../apps/web/src/components/app/course-rail.tsx), [apps/web/src/components/app/courses-page.tsx](../../apps/web/src/components/app/courses-page.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/feedback-uptake-review.tsx](../../apps/web/src/components/app/feedback-uptake-review.tsx), [apps/web/src/components/app/lecturer-recommendations.tsx](../../apps/web/src/components/app/lecturer-recommendations.tsx), [apps/web/src/components/app/penilaian-index.tsx](../../apps/web/src/components/app/penilaian-index.tsx), [apps/web/src/components/app/personalization-analytics.tsx](../../apps/web/src/components/app/personalization-analytics.tsx), [apps/web/src/components/app/research-analytics.tsx](../../apps/web/src/components/app/research-analytics.tsx), [apps/web/src/components/app/research-export.tsx](../../apps/web/src/components/app/research-export.tsx), [apps/web/src/components/app/settings/account-info-section.tsx](../../apps/web/src/components/app/settings/account-info-section.tsx), [apps/web/src/components/app/settings/language-section.tsx](../../apps/web/src/components/app/settings/language-section.tsx), [apps/web/src/components/app/settings/profile-section.tsx](../../apps/web/src/components/app/settings/profile-section.tsx), [apps/web/src/components/app/settings/recovery-section.tsx](../../apps/web/src/components/app/settings/recovery-section.tsx), [apps/web/src/components/app/settings/security-section.tsx](../../apps/web/src/components/app/settings/security-section.tsx), [apps/web/src/components/app/settings/settings-page.tsx](../../apps/web/src/components/app/settings/settings-page.tsx), [apps/web/src/components/app/settings/usage-section.tsx](../../apps/web/src/components/app/settings/usage-section.tsx), [apps/web/src/components/app/student-onboarding.tsx](../../apps/web/src/components/app/student-onboarding.tsx), [apps/web/src/components/app/tugas-board.tsx](../../apps/web/src/components/app/tugas-board.tsx), [apps/web/src/components/app/tugas-insights.tsx](../../apps/web/src/components/app/tugas-insights.tsx), [apps/web/src/components/app/welcome-tour.tsx](../../apps/web/src/components/app/welcome-tour.tsx), [apps/web/src/components/auth/auth-panel.tsx](../../apps/web/src/components/auth/auth-panel.tsx), [apps/web/src/components/site-footer.tsx](../../apps/web/src/components/site-footer.tsx), [apps/web/src/components/site-header.tsx](../../apps/web/src/components/site-header.tsx), [apps/web/src/routes/course.student-profile.tsx](../../apps/web/src/routes/course.student-profile.tsx), [apps/web/src/routes/course.tsx](../../apps/web/src/routes/course.tsx).

## hooks/use-cached-query.ts

Source: [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts)

Exports: `CachedQuery`, `useCachedQuery`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts).

Package imports: `react`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/course-dashboard.tsx](../../apps/web/src/components/app/course-dashboard.tsx), [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/course-rail.tsx](../../apps/web/src/components/app/course-rail.tsx), [apps/web/src/components/app/course-resources.tsx](../../apps/web/src/components/app/course-resources.tsx), [apps/web/src/components/app/course-sections.tsx](../../apps/web/src/components/app/course-sections.tsx), [apps/web/src/components/app/course-workspace.tsx](../../apps/web/src/components/app/course-workspace.tsx), [apps/web/src/components/app/courses-page.tsx](../../apps/web/src/components/app/courses-page.tsx), [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx), [apps/web/src/components/app/file-context.tsx](../../apps/web/src/components/app/file-context.tsx), [apps/web/src/components/app/file-library.tsx](../../apps/web/src/components/app/file-library.tsx), [apps/web/src/components/app/lecturer-gradebook.tsx](../../apps/web/src/components/app/lecturer-gradebook.tsx), [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx), [apps/web/src/components/app/session-roster.tsx](../../apps/web/src/components/app/session-roster.tsx), [apps/web/src/components/app/student-course-overview.tsx](../../apps/web/src/components/app/student-course-overview.tsx), [apps/web/src/components/app/student-courses.tsx](../../apps/web/src/components/app/student-courses.tsx), [apps/web/src/components/app/student-dashboard.tsx](../../apps/web/src/components/app/student-dashboard.tsx), [apps/web/src/components/app/student-home-adventure.tsx](../../apps/web/src/components/app/student-home-adventure.tsx), [apps/web/src/components/app/student-practice.tsx](../../apps/web/src/components/app/student-practice.tsx), [apps/web/src/hooks/use-course-assignments.ts](../../apps/web/src/hooks/use-course-assignments.ts), [apps/web/src/hooks/use-course-records.ts](../../apps/web/src/hooks/use-course-records.ts), [apps/web/src/hooks/use-course-resources.ts](../../apps/web/src/hooks/use-course-resources.ts), [apps/web/src/hooks/use-course-roster.ts](../../apps/web/src/hooks/use-course-roster.ts), [apps/web/src/hooks/use-course-route.ts](../../apps/web/src/hooks/use-course-route.ts), [apps/web/src/hooks/use-course-sections.ts](../../apps/web/src/hooks/use-course-sections.ts).

## hooks/use-course-assignments.ts

Source: [apps/web/src/hooks/use-course-assignments.ts](../../apps/web/src/hooks/use-course-assignments.ts)

Exports: `CourseAssignments`, `useAssignmentSubmissions`, `useCourseAssignments`, `useCourseEnrollments`, `useMySubmissions`.

Local dependencies: [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `react`.

Literal database references: `assignment_submissions`, `assignments`, `class_sessions`, `enrollments`.

Imported by: [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/course-workspace.tsx](../../apps/web/src/components/app/course-workspace.tsx), [apps/web/src/components/app/student-course-overview.tsx](../../apps/web/src/components/app/student-course-overview.tsx), [apps/web/src/components/app/student-grades.tsx](../../apps/web/src/components/app/student-grades.tsx).

## hooks/use-course-records.ts

Source: [apps/web/src/hooks/use-course-records.ts](../../apps/web/src/hooks/use-course-records.ts)

Exports: `CourseRecords`, `useCourseRecords`.

Local dependencies: [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `react`.

Literal database references: `assessments`, `cpl`, `cpmk`, `sub_cpmk`, `topics`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/course-workspace.tsx](../../apps/web/src/components/app/course-workspace.tsx), [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx), [apps/web/src/components/app/session-form.tsx](../../apps/web/src/components/app/session-form.tsx), [apps/web/src/components/app/structured-records.tsx](../../apps/web/src/components/app/structured-records.tsx).

## hooks/use-course-resources.ts

Source: [apps/web/src/hooks/use-course-resources.ts](../../apps/web/src/hooks/use-course-resources.ts)

Exports: `CourseResources`, `useCourseResources`.

Local dependencies: [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `react`.

Literal database references: `class_sessions`, `course_resources`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/course-resources.tsx](../../apps/web/src/components/app/course-resources.tsx), [apps/web/src/components/app/course-workspace.tsx](../../apps/web/src/components/app/course-workspace.tsx), [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx), [apps/web/src/components/app/student-course-overview.tsx](../../apps/web/src/components/app/student-course-overview.tsx).

## hooks/use-course-roster.ts

Source: [apps/web/src/hooks/use-course-roster.ts](../../apps/web/src/hooks/use-course-roster.ts)

Exports: `CourseRoster`, `useCourseRoster`.

Local dependencies: [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `react`.

Literal database references: `course_roster`.

Imported by: [apps/web/src/components/app/course-roster.tsx](../../apps/web/src/components/app/course-roster.tsx), [apps/web/src/components/app/course-workspace.tsx](../../apps/web/src/components/app/course-workspace.tsx), [apps/web/src/components/app/lecturer-gradebook.tsx](../../apps/web/src/components/app/lecturer-gradebook.tsx), [apps/web/src/components/app/session-roster.tsx](../../apps/web/src/components/app/session-roster.tsx).

## hooks/use-course-route.ts

Source: [apps/web/src/hooks/use-course-route.ts](../../apps/web/src/hooks/use-course-route.ts)

Exports: `useCourseByRoute`.

Local dependencies: [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/lib/course-route.ts](../../apps/web/src/lib/course-route.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/routes/course.lesson-plan.tsx](../../apps/web/src/routes/course.lesson-plan.tsx), [apps/web/src/routes/course.student-profile.tsx](../../apps/web/src/routes/course.student-profile.tsx), [apps/web/src/routes/course.tsx](../../apps/web/src/routes/course.tsx).

## hooks/use-course-sections.ts

Source: [apps/web/src/hooks/use-course-sections.ts](../../apps/web/src/hooks/use-course-sections.ts)

Exports: `CourseSections`, `useCourseSections`.

Local dependencies: [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `react`.

Literal database references: `course_sections`.

Imported by: [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/course-roster.tsx](../../apps/web/src/components/app/course-roster.tsx), [apps/web/src/components/app/course-sections.tsx](../../apps/web/src/components/app/course-sections.tsx), [apps/web/src/components/app/lecturer-gradebook.tsx](../../apps/web/src/components/app/lecturer-gradebook.tsx), [apps/web/src/components/app/session-form.tsx](../../apps/web/src/components/app/session-form.tsx), [apps/web/src/components/app/session-roster.tsx](../../apps/web/src/components/app/session-roster.tsx), [apps/web/src/components/app/student-course-overview.tsx](../../apps/web/src/components/app/student-course-overview.tsx).

## hooks/use-hydrated.ts

Source: [apps/web/src/hooks/use-hydrated.ts](../../apps/web/src/hooks/use-hydrated.ts)

Exports: `useHydrated`.

Package imports: `react`.

## hooks/use-mobile.tsx

Source: [apps/web/src/hooks/use-mobile.tsx](../../apps/web/src/hooks/use-mobile.tsx)

Exports: `useIsMobile`.

Package imports: `react`.

Imported by: [apps/web/src/components/ui/sidebar.tsx](../../apps/web/src/components/ui/sidebar.tsx).

## hooks/use-theme.ts

Source: [apps/web/src/hooks/use-theme.ts](../../apps/web/src/hooks/use-theme.ts)

Exports: `Theme`, `useTheme`.

Package imports: `react`.

Imported by: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx).

## hooks/use-toast.ts

Source: [apps/web/src/hooks/use-toast.ts](../../apps/web/src/hooks/use-toast.ts)

Exports: `reducer`.

Local dependencies: [apps/web/src/components/ui/toast.tsx](../../apps/web/src/components/ui/toast.tsx).

Package imports: `react`.

Imported by: [apps/web/src/components/ui/toaster.tsx](../../apps/web/src/components/ui/toaster.tsx).

## horizons-preview-scripts.tsx

Source: [apps/web/src/horizons-preview-scripts.tsx](../../apps/web/src/horizons-preview-scripts.tsx)

Exports: `HorizonsPreviewScripts`.

Package imports: `react`, `virtual:horizons-banner`, `virtual:horizons-runtime`.

Imported by: [apps/web/src/root.tsx](../../apps/web/src/root.tsx).

## index.css

Source: [apps/web/src/index.css](../../apps/web/src/index.css)

Imported by: [apps/web/src/root.tsx](../../apps/web/src/root.tsx).

## lib/agent-tasks.server.ts

Source: [apps/web/src/lib/agent-tasks.server.ts](../../apps/web/src/lib/agent-tasks.server.ts)

Exports: `actOnAgentTask`, `createAgentTask`, `listAgentTasks`.

Local dependencies: [apps/web/src/lib/agent-tasks.ts](../../apps/web/src/lib/agent-tasks.ts), [apps/web/src/lib/ai-usage.server.ts](../../apps/web/src/lib/ai-usage.server.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/feedback.server.ts](../../apps/web/src/lib/feedback.server.ts), [apps/web/src/lib/hostinger-model.server.ts](../../apps/web/src/lib/hostinger-model.server.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/lecturer-recommendations.server.ts](../../apps/web/src/lib/lecturer-recommendations.server.ts), [apps/web/src/lib/lesson-plans.server.ts](../../apps/web/src/lib/lesson-plans.server.ts), [apps/web/src/lib/personal-practice.server.ts](../../apps/web/src/lib/personal-practice.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Package imports: `node:crypto`, `pocketbase`.

Literal database references: `agent_tasks`, `assignments`, `courses`, `enrollments`, `file_extractions`, `users`.

Imported by: [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts), [apps/web/src/routes/api.agent-tasks.ts](../../apps/web/src/routes/api.agent-tasks.ts).

## lib/agent-tasks.ts

Source: [apps/web/src/lib/agent-tasks.ts](../../apps/web/src/lib/agent-tasks.ts)

Exports: `AGENT_STATUS`, `AgentStep`, `AgentTask`, `LessonPlan`.

Imported by: [apps/web/src/components/app/agent-task-panel.tsx](../../apps/web/src/components/app/agent-task-panel.tsx), [apps/web/src/lib/agent-tasks.server.ts](../../apps/web/src/lib/agent-tasks.server.ts), [apps/web/src/lib/lesson-plans.server.ts](../../apps/web/src/lib/lesson-plans.server.ts), [apps/web/src/lib/lesson-plans.ts](../../apps/web/src/lib/lesson-plans.ts), [apps/web/src/routes/course.lesson-plan.tsx](../../apps/web/src/routes/course.lesson-plan.tsx).

## lib/ai-capabilities.ts

Source: [apps/web/src/lib/ai-capabilities.ts](../../apps/web/src/lib/ai-capabilities.ts)

Exports: `ALLOWED_CAPABILITIES`, `CAPABILITY_CATEGORY`, `CAPABILITY_LABEL`, `Capability`, `CapabilityCategory`, `PROHIBITED_CAPABILITIES`, `RESTRICTED_CAPABILITIES`, `inherentCategoryOf`, `isCapability`.

Imported by: [apps/web/src/components/app/assignment-ai-policy.tsx](../../apps/web/src/components/app/assignment-ai-policy.tsx), [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/lib/ai-policy-form.ts](../../apps/web/src/lib/ai-policy-form.ts), [apps/web/src/lib/ai-policy.server.ts](../../apps/web/src/lib/ai-policy.server.ts), [apps/web/src/lib/ai-policy.ts](../../apps/web/src/lib/ai-policy.ts), [apps/web/src/lib/ai-rate-limits.ts](../../apps/web/src/lib/ai-rate-limits.ts), [apps/web/src/lib/student-assistant-tools.server.ts](../../apps/web/src/lib/student-assistant-tools.server.ts), [apps/web/src/lib/student-assistant.server.ts](../../apps/web/src/lib/student-assistant.server.ts).

## lib/ai-evaluation.server.ts

Source: [apps/web/src/lib/ai-evaluation.server.ts](../../apps/web/src/lib/ai-evaluation.server.ts)

Exports: `AI_EVALUATION_PROMPT_VERSION`, `AI_EVALUATION_SYSTEM_PROMPT_VERSION`, `RESEARCH_SCHEMA_VERSION`, `queueEvaluationDraft`.

Local dependencies: [apps/web/src/lib/ai-evaluation.ts](../../apps/web/src/lib/ai-evaluation.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/cefr-level.ts](../../apps/web/src/lib/cefr-level.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/evaluation-rubric.ts](../../apps/web/src/lib/evaluation-rubric.ts), [apps/web/src/lib/evaluation-snapshot.server.ts](../../apps/web/src/lib/evaluation-snapshot.server.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/task-assist.server.ts](../../apps/web/src/lib/task-assist.server.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `crypto`, `node:util`.

Literal database references: `ai_evaluations`, `courses`.

Imported by: [apps/web/src/routes/api.evaluation-draft.ts](../../apps/web/src/routes/api.evaluation-draft.ts), [apps/web/src/routes/api.task-submit.ts](../../apps/web/src/routes/api.task-submit.ts).

## lib/ai-evaluation.ts

Source: [apps/web/src/lib/ai-evaluation.ts](../../apps/web/src/lib/ai-evaluation.ts)

Exports: `ANCHOR_ERROR`, `AiEvaluationRow`, `AnchorError`, `AnchorResolution`, `EvalCitation`, `EvalFinding`, `EvalRubricRow`, `EvalSeverity`, `FEEDBACK_CATEGORIES`, `FEEDBACK_TAXONOMY`, `FeedbackItemClass`, `FindingAnchorValidation`, `MAX_STRUCTURED_FINDINGS`, `MarkedSegment`, `REVIEW_STATUS_LABEL`, `ResearchProvenance`, `ReviewFinding`, `ReviewSource`, `ReviewStatus`, `SEVERITY_LABEL`, `TranscriptConfidence`, `buildMarkedSegments`, `classifyFeedbackItem`, `deriveAiReviewFindings`, `isValidTaxonomy`, `isValidatedForPersonalization`, `normalizeReviewFindings`, `parseCitations`, `parseFindings`, `parseProvenance`, `parseReviewFindings`, `parseRubric`, `parseStructuredFindings`, `parseTranscriptConfidence`, `requestEvaluationDraft`, `resolveAnchor`, `sanitizeTaxonomy`, `validateFindingAnchor`.

Local dependencies: [apps/web/src/lib/evaluation-scoring.ts](../../apps/web/src/lib/evaluation-scoring.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Imported by: [apps/web/src/components/app/ai-evaluation-review.tsx](../../apps/web/src/components/app/ai-evaluation-review.tsx), [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/student-result-view.tsx](../../apps/web/src/components/app/student-result-view.tsx), [apps/web/src/components/app/task-workspaces/speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/writing-workspace.tsx](../../apps/web/src/components/app/task-workspaces/writing-workspace.tsx), [apps/web/src/lib/ai-evaluation.server.ts](../../apps/web/src/lib/ai-evaluation.server.ts), [apps/web/src/lib/evaluation-annotation.server.ts](../../apps/web/src/lib/evaluation-annotation.server.ts), [apps/web/src/lib/evaluation-review.server.ts](../../apps/web/src/lib/evaluation-review.server.ts), [apps/web/src/lib/learner-profile.server.ts](../../apps/web/src/lib/learner-profile.server.ts), [apps/web/src/lib/research-annotation.ts](../../apps/web/src/lib/research-annotation.ts), [apps/web/src/lib/research-export.server.ts](../../apps/web/src/lib/research-export.server.ts), [apps/web/src/routes/api.evaluation-publish.ts](../../apps/web/src/routes/api.evaluation-publish.ts), [apps/web/src/routes/api.evaluation-result.ts](../../apps/web/src/routes/api.evaluation-result.ts).

## lib/ai-policy-form.ts

Source: [apps/web/src/lib/ai-policy-form.ts](../../apps/web/src/lib/ai-policy-form.ts)

Exports: `ALL_TOGGLEABLE`, `AiPolicyMode`, `CORE_CAPABILITIES`, `OPTIONAL_CAPABILITIES`, `POLICY_MODE_DESCRIPTION`, `POLICY_MODE_LABEL`, `POLICY_MODE_ORDER`, `buildStoredPolicy`, `capabilityLabel`, `defaultEnabledCapsForLevel`, `policySummary`, `prohibitedCapsAtLevel`, `readEnabledCaps`, `readPolicyMode`.

Local dependencies: [apps/web/src/lib/ai-capabilities.ts](../../apps/web/src/lib/ai-capabilities.ts), [apps/web/src/lib/ai-policy.ts](../../apps/web/src/lib/ai-policy.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts).

Imported by: [apps/web/src/components/app/assignment-ai-policy.tsx](../../apps/web/src/components/app/assignment-ai-policy.tsx), [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx).

## lib/ai-policy.server.ts

Source: [apps/web/src/lib/ai-policy.server.ts](../../apps/web/src/lib/ai-policy.server.ts)

Exports: `AuthorizationDecision`, `CHECK_ANSWER_CAPABILITIES`, `PRACTICE_ASSIST_CAPABILITIES`, `PRACTICE_SPEAKING_CAPABILITIES`, `PolicyResolution`, `STUDENT_ALLOWED_DATA`, `STUDENT_PROHIBITED_DATA`, `SanitizedStudentContext`, `StudentAllowedData`, `StudentProhibitedData`, `authorizeCapabilities`, `authorizeCapability`, `authorizeStudentCapability`, `findProhibitedDataKeys`, `resolveStudentAiPolicy`, `sanitizeStudentContext`.

Local dependencies: [apps/web/src/lib/ai-capabilities.ts](../../apps/web/src/lib/ai-capabilities.ts), [apps/web/src/lib/ai-policy.ts](../../apps/web/src/lib/ai-policy.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts).

Package imports: `pocketbase`.

Literal database references: `assignments`.

Imported by: [apps/web/src/lib/student-assistant-tools.server.ts](../../apps/web/src/lib/student-assistant-tools.server.ts), [apps/web/src/lib/student-assistant.server.ts](../../apps/web/src/lib/student-assistant.server.ts), [apps/web/src/routes/api.check-answer.ts](../../apps/web/src/routes/api.check-answer.ts), [apps/web/src/routes/api.practice-assist.ts](../../apps/web/src/routes/api.practice-assist.ts), [apps/web/src/routes/api.practice-speaking.ts](../../apps/web/src/routes/api.practice-speaking.ts).

## lib/ai-policy.ts

Source: [apps/web/src/lib/ai-policy.ts](../../apps/web/src/lib/ai-policy.ts)

Exports: `ASSISTANCE_LEVELS`, `ASSISTANCE_LEVEL_DESCRIPTION`, `ASSISTANCE_LEVEL_LABEL`, `AiPolicy`, `AssistanceLevel`, `CapabilityDecision`, `LEVEL_POLICIES`, `checkCapability`, `defaultLevelForActivity`, `denialMessage`, `isCapabilityAllowed`, `isCapabilityProhibited`, `parseExplicitPolicyMode`, `resolveAssignmentPolicy`.

Local dependencies: [apps/web/src/lib/ai-capabilities.ts](../../apps/web/src/lib/ai-capabilities.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts).

Imported by: [apps/web/src/components/app/assignment-ai-policy.tsx](../../apps/web/src/components/app/assignment-ai-policy.tsx), [apps/web/src/lib/ai-policy-form.ts](../../apps/web/src/lib/ai-policy-form.ts), [apps/web/src/lib/ai-policy.server.ts](../../apps/web/src/lib/ai-policy.server.ts), [apps/web/src/lib/student-assistant-tools.server.ts](../../apps/web/src/lib/student-assistant-tools.server.ts), [apps/web/src/lib/student-assistant.server.ts](../../apps/web/src/lib/student-assistant.server.ts), [apps/web/src/routes/api.check-answer.ts](../../apps/web/src/routes/api.check-answer.ts), [apps/web/src/routes/api.practice-assist.ts](../../apps/web/src/routes/api.practice-assist.ts), [apps/web/src/routes/api.practice-speaking.ts](../../apps/web/src/routes/api.practice-speaking.ts), [apps/web/src/routes/api.student-assistant.ts](../../apps/web/src/routes/api.student-assistant.ts).

## lib/ai-rate-limits.ts

Source: [apps/web/src/lib/ai-rate-limits.ts](../../apps/web/src/lib/ai-rate-limits.ts)

Exports: `AI_CAPABILITY_WEIGHTS`, `AI_DEFAULT_CAPABILITY_WEIGHT`, `AI_IDEMPOTENCY_WINDOW_MS`, `AI_RATE_LIMITS`, `AI_RETRY_POLICY`, `AI_TOKEN_LIMITS`, `AI_USAGE_BUDGET`, `AiRateWindow`, `AiRole`, `AiRoleRateLimits`, `capabilityWeight`, `toAiRole`.

Local dependencies: [apps/web/src/lib/ai-capabilities.ts](../../apps/web/src/lib/ai-capabilities.ts).

Imported by: [apps/web/src/lib/ai-usage.server.ts](../../apps/web/src/lib/ai-usage.server.ts), [apps/web/src/routes/api.assistant.ts](../../apps/web/src/routes/api.assistant.ts), [apps/web/src/routes/api.student-assistant.ts](../../apps/web/src/routes/api.student-assistant.ts).

## lib/ai-usage.server.ts

Source: [apps/web/src/lib/ai-usage.server.ts](../../apps/web/src/lib/ai-usage.server.ts)

Exports: `AiAccessDecision`, `AiDenialReason`, `EnforceAiAccessInput`, `checkInputSize`, `commitUsage`, `deriveIdempotencyKey`, `enforceAiAccess`, `estimateTokens`, `getUsageSummary`, `maxToolCallsPerTurn`, `recordUsageEvent`, `toolCallLimitReached`, `withBoundedRetry`.

Local dependencies: [apps/web/src/lib/ai-rate-limits.ts](../../apps/web/src/lib/ai-rate-limits.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Package imports: `node:crypto`, `rate-limiter-flexible`.

Imported by: [apps/web/src/lib/agent-tasks.server.ts](../../apps/web/src/lib/agent-tasks.server.ts), [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts), [apps/web/src/lib/personal-practice.server.ts](../../apps/web/src/lib/personal-practice.server.ts), [apps/web/src/routes/api.ai-usage.ts](../../apps/web/src/routes/api.ai-usage.ts), [apps/web/src/routes/api.assistant.ts](../../apps/web/src/routes/api.assistant.ts), [apps/web/src/routes/api.conversation-practice.ts](../../apps/web/src/routes/api.conversation-practice.ts), [apps/web/src/routes/api.integrated-ai.stream.ts](../../apps/web/src/routes/api.integrated-ai.stream.ts), [apps/web/src/routes/api.student-assistant.ts](../../apps/web/src/routes/api.student-assistant.ts).

## lib/api.server.ts

Source: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts)

Exports: `ApiArgs`, `BODY_LIMIT_BYTES`, `apiError`, `json`, `readFormData`, `readJsonBody`, `withApi`.

Local dependencies: [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/rate-limit.server.ts](../../apps/web/src/lib/rate-limit.server.ts).

Imported by: [apps/web/src/lib/integrated-ai.server.ts](../../apps/web/src/lib/integrated-ai.server.ts), [apps/web/src/lib/student-onboarding.server.ts](../../apps/web/src/lib/student-onboarding.server.ts), [apps/web/src/routes/api.$.ts](../../apps/web/src/routes/api.$.ts), [apps/web/src/routes/api.agent-tasks.ts](../../apps/web/src/routes/api.agent-tasks.ts), [apps/web/src/routes/api.ai-usage.ts](../../apps/web/src/routes/api.ai-usage.ts), [apps/web/src/routes/api.assignment-draft.ts](../../apps/web/src/routes/api.assignment-draft.ts), [apps/web/src/routes/api.assistant.ts](../../apps/web/src/routes/api.assistant.ts), [apps/web/src/routes/api.berkas-parse.ts](../../apps/web/src/routes/api.berkas-parse.ts), [apps/web/src/routes/api.berkas-process.ts](../../apps/web/src/routes/api.berkas-process.ts), [apps/web/src/routes/api.berkas-restore.ts](../../apps/web/src/routes/api.berkas-restore.ts), [apps/web/src/routes/api.berkas-snapshot.ts](../../apps/web/src/routes/api.berkas-snapshot.ts), [apps/web/src/routes/api.berkas-suggest.ts](../../apps/web/src/routes/api.berkas-suggest.ts), [apps/web/src/routes/api.bulk-paper-extract.ts](../../apps/web/src/routes/api.bulk-paper-extract.ts), [apps/web/src/routes/api.bulk-paper-prepare.ts](../../apps/web/src/routes/api.bulk-paper-prepare.ts), [apps/web/src/routes/api.bulk-paper-submit.ts](../../apps/web/src/routes/api.bulk-paper-submit.ts), [apps/web/src/routes/api.check-answer.ts](../../apps/web/src/routes/api.check-answer.ts), [apps/web/src/routes/api.context-check.ts](../../apps/web/src/routes/api.context-check.ts), [apps/web/src/routes/api.context-insights.ts](../../apps/web/src/routes/api.context-insights.ts), [apps/web/src/routes/api.context-material.ts](../../apps/web/src/routes/api.context-material.ts), [apps/web/src/routes/api.conversation-practice.ts](../../apps/web/src/routes/api.conversation-practice.ts), [apps/web/src/routes/api.course-grade-summary.ts](../../apps/web/src/routes/api.course-grade-summary.ts), [apps/web/src/routes/api.course-thumbnail.ts](../../apps/web/src/routes/api.course-thumbnail.ts), [apps/web/src/routes/api.evaluation-annotation.ts](../../apps/web/src/routes/api.evaluation-annotation.ts), [apps/web/src/routes/api.evaluation-draft.ts](../../apps/web/src/routes/api.evaluation-draft.ts), [apps/web/src/routes/api.evaluation-missed-error.ts](../../apps/web/src/routes/api.evaluation-missed-error.ts), [apps/web/src/routes/api.evaluation-participants.ts](../../apps/web/src/routes/api.evaluation-participants.ts), [apps/web/src/routes/api.evaluation-publish.ts](../../apps/web/src/routes/api.evaluation-publish.ts), [apps/web/src/routes/api.evaluation-result.ts](../../apps/web/src/routes/api.evaluation-result.ts), [apps/web/src/routes/api.evaluation-review.ts](../../apps/web/src/routes/api.evaluation-review.ts), [apps/web/src/routes/api.feedback-uptake.ts](../../apps/web/src/routes/api.feedback-uptake.ts), [apps/web/src/routes/api.feedback.ts](../../apps/web/src/routes/api.feedback.ts), [apps/web/src/routes/api.health.ts](../../apps/web/src/routes/api.health.ts), [apps/web/src/routes/api.integrated-ai.stream.ts](../../apps/web/src/routes/api.integrated-ai.stream.ts), [apps/web/src/routes/api.lesson-plans.ts](../../apps/web/src/routes/api.lesson-plans.ts), [apps/web/src/routes/api.personal-practice.ts](../../apps/web/src/routes/api.personal-practice.ts), [apps/web/src/routes/api.personalization-analytics.ts](../../apps/web/src/routes/api.personalization-analytics.ts), [apps/web/src/routes/api.practice-assist.ts](../../apps/web/src/routes/api.practice-assist.ts), [apps/web/src/routes/api.practice-speaking.ts](../../apps/web/src/routes/api.practice-speaking.ts), [apps/web/src/routes/api.recommendations-generate.ts](../../apps/web/src/routes/api.recommendations-generate.ts), [apps/web/src/routes/api.recommendations-review.ts](../../apps/web/src/routes/api.recommendations-review.ts), [apps/web/src/routes/api.recovery-email-request-reset.ts](../../apps/web/src/routes/api.recovery-email-request-reset.ts), [apps/web/src/routes/api.recovery-email-request.ts](../../apps/web/src/routes/api.recovery-email-request.ts), [apps/web/src/routes/api.recovery-email-reset-password.ts](../../apps/web/src/routes/api.recovery-email-reset-password.ts), [apps/web/src/routes/api.recovery-email-verify.ts](../../apps/web/src/routes/api.recovery-email-verify.ts), [apps/web/src/routes/api.research-analytics.ts](../../apps/web/src/routes/api.research-analytics.ts), [apps/web/src/routes/api.research-export.ts](../../apps/web/src/routes/api.research-export.ts), [apps/web/src/routes/api.roster-enroll.ts](../../apps/web/src/routes/api.roster-enroll.ts), [apps/web/src/routes/api.roster-language.ts](../../apps/web/src/routes/api.roster-language.ts), [apps/web/src/routes/api.roster-reset-password.ts](../../apps/web/src/routes/api.roster-reset-password.ts), [apps/web/src/routes/api.roster-status.ts](../../apps/web/src/routes/api.roster-status.ts), [apps/web/src/routes/api.rps-assist.ts](../../apps/web/src/routes/api.rps-assist.ts), [apps/web/src/routes/api.rps-import.ts](../../apps/web/src/routes/api.rps-import.ts), [apps/web/src/routes/api.rubric-suggestions.ts](../../apps/web/src/routes/api.rubric-suggestions.ts), [apps/web/src/routes/api.student-assistant.ts](../../apps/web/src/routes/api.student-assistant.ts), [apps/web/src/routes/api.student-password.ts](../../apps/web/src/routes/api.student-password.ts), [apps/web/src/routes/api.student-profile.ts](../../apps/web/src/routes/api.student-profile.ts), [apps/web/src/routes/api.task-assist.ts](../../apps/web/src/routes/api.task-assist.ts), [apps/web/src/routes/api.task-config-draft.ts](../../apps/web/src/routes/api.task-config-draft.ts), [apps/web/src/routes/api.task-submit.ts](../../apps/web/src/routes/api.task-submit.ts), [apps/web/src/routes/api.transcribe.ts](../../apps/web/src/routes/api.transcribe.ts).

## lib/assignment-draft.server.ts

Source: [apps/web/src/lib/assignment-draft.server.ts](../../apps/web/src/lib/assignment-draft.server.ts)

Exports: `AssignmentDraftContext`, `AssignmentDraftResult`, `DraftResource`, `buildAssignmentDraft`, `collectModel`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/hostinger-model.server.ts](../../apps/web/src/lib/hostinger-model.server.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts).

Imported by: [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts), [apps/web/src/lib/rubric-suggestions.server.ts](../../apps/web/src/lib/rubric-suggestions.server.ts), [apps/web/src/lib/task-config-draft.server.ts](../../apps/web/src/lib/task-config-draft.server.ts), [apps/web/src/routes/api.assignment-draft.ts](../../apps/web/src/routes/api.assignment-draft.ts).

## lib/assignment-import.ts

Source: [apps/web/src/lib/assignment-import.ts](../../apps/web/src/lib/assignment-import.ts)

Exports: `ImportedAssignment`, `parseAssignmentImport`, `readAssignmentSourceFile`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts).

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx).

## lib/assignments.ts

Source: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts)

Exports: `ACTIVITY_TYPE_LABEL`, `ACTIVITY_TYPE_OPTIONS`, `ASSIGNMENT_STATUS_LABEL`, `ActivityType`, `Assignment`, `AssignmentMode`, `AssignmentShape`, `AssignmentStage`, `AssignmentStatus`, `AssignmentSubmission`, `LEGACY_SHAPE_LABEL`, `MODE_LABEL`, `NOT_SUBMITTED_LABEL`, `PracticeSyncState`, `SHAPE_LABEL`, `SHAPE_OPTIONS`, `STAGE_PRESETS`, `SUBMISSION_STATUS_LABEL`, `ShapeOption`, `SubmissionStatus`, `UploadProgress`, `activityTypeOf`, `clearPracticeIntent`, `deadlineHint`, `deadlineLabel`, `deadlineToLocalInput`, `defaultStagesForShape`, `generatePublicToken`, `isPastDeadline`, `isPracticeOutdated`, `isPreviewableSubmissionFile`, `lecturerGradeLabel`, `letterGrade`, `localInputToDeadline`, `parseStages`, `peekPracticeIntent`, `practiceSyncState`, `practiceTitleFor`, `setPracticeIntent`, `shapeOption`, `studentGradeLabel`, `studentWorkPath`, `submissionFileUrl`, `submissionStatusLabel`, `uploadSubmission`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Imported by: [apps/web/src/components/app/ai-evaluation-review.tsx](../../apps/web/src/components/app/ai-evaluation-review.tsx), [apps/web/src/components/app/assignment-ai-policy.tsx](../../apps/web/src/components/app/assignment-ai-policy.tsx), [apps/web/src/components/app/assignment-editor-page.tsx](../../apps/web/src/components/app/assignment-editor-page.tsx), [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/bulk-paper-input.tsx](../../apps/web/src/components/app/bulk-paper-input.tsx), [apps/web/src/components/app/check-history.tsx](../../apps/web/src/components/app/check-history.tsx), [apps/web/src/components/app/course-analytics.tsx](../../apps/web/src/components/app/course-analytics.tsx), [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/course-dashboard.tsx](../../apps/web/src/components/app/course-dashboard.tsx), [apps/web/src/components/app/course-workspace.tsx](../../apps/web/src/components/app/course-workspace.tsx), [apps/web/src/components/app/courses-page.tsx](../../apps/web/src/components/app/courses-page.tsx), [apps/web/src/components/app/difficulty-insights.tsx](../../apps/web/src/components/app/difficulty-insights.tsx), [apps/web/src/components/app/difficulty-summary.tsx](../../apps/web/src/components/app/difficulty-summary.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx), [apps/web/src/components/app/feedback-uptake-review.tsx](../../apps/web/src/components/app/feedback-uptake-review.tsx), [apps/web/src/components/app/formative-evaluation-review.tsx](../../apps/web/src/components/app/formative-evaluation-review.tsx), [apps/web/src/components/app/formative-practice.tsx](../../apps/web/src/components/app/formative-practice.tsx), [apps/web/src/components/app/lecturer-assignment-preview.tsx](../../apps/web/src/components/app/lecturer-assignment-preview.tsx), [apps/web/src/components/app/lecturer-gradebook.tsx](../../apps/web/src/components/app/lecturer-gradebook.tsx), [apps/web/src/components/app/lecturer-recommendations.tsx](../../apps/web/src/components/app/lecturer-recommendations.tsx), [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx), [apps/web/src/components/app/practice-content-autofill.tsx](../../apps/web/src/components/app/practice-content-autofill.tsx), [apps/web/src/components/app/research-export.tsx](../../apps/web/src/components/app/research-export.tsx), [apps/web/src/components/app/student-course-overview.tsx](../../apps/web/src/components/app/student-course-overview.tsx), [apps/web/src/components/app/student-dashboard.tsx](../../apps/web/src/components/app/student-dashboard.tsx), [apps/web/src/components/app/student-grades.tsx](../../apps/web/src/components/app/student-grades.tsx), [apps/web/src/components/app/student-result-view.tsx](../../apps/web/src/components/app/student-result-view.tsx), [apps/web/src/components/app/student-work-page.tsx](../../apps/web/src/components/app/student-work-page.tsx), [apps/web/src/components/app/submission-task-review.tsx](../../apps/web/src/components/app/submission-task-review.tsx), [apps/web/src/components/app/task-builders/task-autofill.tsx](../../apps/web/src/components/app/task-builders/task-autofill.tsx), [apps/web/src/components/app/task-workspaces/check-answer-panel.tsx](../../apps/web/src/components/app/task-workspaces/check-answer-panel.tsx), [apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/listening-workspace.tsx](../../apps/web/src/components/app/task-workspaces/listening-workspace.tsx), [apps/web/src/components/app/task-workspaces/quiz-workspace.tsx](../../apps/web/src/components/app/task-workspaces/quiz-workspace.tsx), [apps/web/src/components/app/task-workspaces/reading-workspace.tsx](../../apps/web/src/components/app/task-workspaces/reading-workspace.tsx), [apps/web/src/components/app/task-workspaces/speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/writing-workspace.tsx](../../apps/web/src/components/app/task-workspaces/writing-workspace.tsx), [apps/web/src/components/app/tugas-board.tsx](../../apps/web/src/components/app/tugas-board.tsx), [apps/web/src/components/app/tugas-insights.tsx](../../apps/web/src/components/app/tugas-insights.tsx), [apps/web/src/hooks/use-course-assignments.ts](../../apps/web/src/hooks/use-course-assignments.ts), [apps/web/src/lib/ai-evaluation.server.ts](../../apps/web/src/lib/ai-evaluation.server.ts), [apps/web/src/lib/ai-policy-form.ts](../../apps/web/src/lib/ai-policy-form.ts), [apps/web/src/lib/ai-policy.server.ts](../../apps/web/src/lib/ai-policy.server.ts), [apps/web/src/lib/ai-policy.ts](../../apps/web/src/lib/ai-policy.ts), [apps/web/src/lib/assignment-draft.server.ts](../../apps/web/src/lib/assignment-draft.server.ts), [apps/web/src/lib/assignment-import.ts](../../apps/web/src/lib/assignment-import.ts), [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts), [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts), [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts), [apps/web/src/lib/bulk-paper.server.ts](../../apps/web/src/lib/bulk-paper.server.ts), [apps/web/src/lib/cefr-level.ts](../../apps/web/src/lib/cefr-level.ts), [apps/web/src/lib/check-answer.server.ts](../../apps/web/src/lib/check-answer.server.ts), [apps/web/src/lib/check-types.ts](../../apps/web/src/lib/check-types.ts), [apps/web/src/lib/course-analytics.ts](../../apps/web/src/lib/course-analytics.ts), [apps/web/src/lib/difficulty-data.ts](../../apps/web/src/lib/difficulty-data.ts), [apps/web/src/lib/evaluation-review.server.ts](../../apps/web/src/lib/evaluation-review.server.ts), [apps/web/src/lib/evaluation-scoring.ts](../../apps/web/src/lib/evaluation-scoring.ts), [apps/web/src/lib/feedback-uptake.server.ts](../../apps/web/src/lib/feedback-uptake.server.ts), [apps/web/src/lib/feedback.server.ts](../../apps/web/src/lib/feedback.server.ts), [apps/web/src/lib/gradebook.ts](../../apps/web/src/lib/gradebook.ts), [apps/web/src/lib/grouped-gradebook.ts](../../apps/web/src/lib/grouped-gradebook.ts), [apps/web/src/lib/personalization-analytics.server.ts](../../apps/web/src/lib/personalization-analytics.server.ts), [apps/web/src/lib/practice-assist.server.ts](../../apps/web/src/lib/practice-assist.server.ts), [apps/web/src/lib/public-drafts.server.ts](../../apps/web/src/lib/public-drafts.server.ts), [apps/web/src/lib/public-linking.server.ts](../../apps/web/src/lib/public-linking.server.ts), [apps/web/src/lib/research-analytics.server.ts](../../apps/web/src/lib/research-analytics.server.ts), [apps/web/src/lib/research-export.server.ts](../../apps/web/src/lib/research-export.server.ts), [apps/web/src/lib/research-target.server.ts](../../apps/web/src/lib/research-target.server.ts), [apps/web/src/lib/rubric-suggestions.server.ts](../../apps/web/src/lib/rubric-suggestions.server.ts), [apps/web/src/lib/student-assistant-tools.server.ts](../../apps/web/src/lib/student-assistant-tools.server.ts), [apps/web/src/lib/student-assistant.server.ts](../../apps/web/src/lib/student-assistant.server.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts), [apps/web/src/routes/api.assignment-draft.ts](../../apps/web/src/routes/api.assignment-draft.ts), [apps/web/src/routes/api.bulk-paper-extract.ts](../../apps/web/src/routes/api.bulk-paper-extract.ts), [apps/web/src/routes/api.bulk-paper-prepare.ts](../../apps/web/src/routes/api.bulk-paper-prepare.ts), [apps/web/src/routes/api.bulk-paper-submit.ts](../../apps/web/src/routes/api.bulk-paper-submit.ts), [apps/web/src/routes/api.check-answer.ts](../../apps/web/src/routes/api.check-answer.ts), [apps/web/src/routes/api.context-check.ts](../../apps/web/src/routes/api.context-check.ts), [apps/web/src/routes/api.context-insights.ts](../../apps/web/src/routes/api.context-insights.ts), [apps/web/src/routes/api.course-grade-summary.ts](../../apps/web/src/routes/api.course-grade-summary.ts), [apps/web/src/routes/api.evaluation-draft.ts](../../apps/web/src/routes/api.evaluation-draft.ts), [apps/web/src/routes/api.evaluation-participants.ts](../../apps/web/src/routes/api.evaluation-participants.ts), [apps/web/src/routes/api.feedback.ts](../../apps/web/src/routes/api.feedback.ts), [apps/web/src/routes/api.practice-assist.ts](../../apps/web/src/routes/api.practice-assist.ts), [apps/web/src/routes/api.practice-speaking.ts](../../apps/web/src/routes/api.practice-speaking.ts), [apps/web/src/routes/api.recommendations-generate.ts](../../apps/web/src/routes/api.recommendations-generate.ts), [apps/web/src/routes/api.rubric-suggestions.ts](../../apps/web/src/routes/api.rubric-suggestions.ts), [apps/web/src/routes/api.student-assistant.ts](../../apps/web/src/routes/api.student-assistant.ts), [apps/web/src/routes/api.task-assist.ts](../../apps/web/src/routes/api.task-assist.ts), [apps/web/src/routes/api.task-submit.ts](../../apps/web/src/routes/api.task-submit.ts), [apps/web/src/routes/api.transcribe.ts](../../apps/web/src/routes/api.transcribe.ts).

## lib/assistant/attachments.server.ts

Source: [apps/web/src/lib/assistant/attachments.server.ts](../../apps/web/src/lib/assistant/attachments.server.ts)

Exports: `AssistantImageRef`, `AttachmentBlock`, `buildAttachmentBlock`, `buildImageMarker`, `parseImageMarker`, `signImageRef`, `stripImageMarker`.

Local dependencies: [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `_integrated`.

Imported by: [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts), [apps/web/src/lib/assistant.server.ts](../../apps/web/src/lib/assistant.server.ts), [apps/web/src/routes/api.assistant.ts](../../apps/web/src/routes/api.assistant.ts).

## lib/assistant/audit.server.ts

Source: [apps/web/src/lib/assistant/audit.server.ts](../../apps/web/src/lib/assistant/audit.server.ts)

Exports: `recordToolAudit`, `sanitizeArgsForAudit`.

Local dependencies: [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts).

Package imports: `pocketbase`.

Imported by: [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts).

## lib/assistant/auth.server.ts

Source: [apps/web/src/lib/assistant/auth.server.ts](../../apps/web/src/lib/assistant/auth.server.ts)

Exports: `failAssistant`, `resolveFaculty`, `toError`.

Local dependencies: [apps/web/src/lib/assistant/env.server.ts](../../apps/web/src/lib/assistant/env.server.ts), [apps/web/src/lib/assistant/logging.server.ts](../../apps/web/src/lib/assistant/logging.server.ts), [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts).

Package imports: `pocketbase`.

Literal database references: `users`.

Imported by: [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts), [apps/web/src/lib/assistant.server.ts](../../apps/web/src/lib/assistant.server.ts).

## lib/assistant/authorization.server.ts

Source: [apps/web/src/lib/assistant/authorization.server.ts](../../apps/web/src/lib/assistant/authorization.server.ts)

Exports: `AuthorizationDenial`, `AuthorizationOk`, `AuthorizationResult`, `authorizeCourseId`, `isDenied`, `verifyOwnedAssignment`, `verifyOwnedCourse`, `verifyOwnedResource`, `verifyOwnedSession`, `verifySessionBelongsToCourse`, `verifySubCpmkBelongsToCourse`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Package imports: `pocketbase`.

Imported by: [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts).

## lib/assistant/compaction.server.ts

Source: [apps/web/src/lib/assistant/compaction.server.ts](../../apps/web/src/lib/assistant/compaction.server.ts)

Exports: `ModelCaller`, `maybeCompact`, `mergeStructuredContexts`.

Local dependencies: [apps/web/src/lib/assistant/compaction.ts](../../apps/web/src/lib/assistant/compaction.ts), [apps/web/src/lib/assistant/logging.server.ts](../../apps/web/src/lib/assistant/logging.server.ts), [apps/web/src/lib/assistant/model.server.ts](../../apps/web/src/lib/assistant/model.server.ts), [apps/web/src/lib/assistant/persistence.server.ts](../../apps/web/src/lib/assistant/persistence.server.ts), [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts).

Package imports: `pocketbase`.

Imported by: [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts).

## lib/assistant/compaction.ts

Source: [apps/web/src/lib/assistant/compaction.ts](../../apps/web/src/lib/assistant/compaction.ts)

Exports: `COMPACTION_SYSTEM_PROMPT`, `CompactionInput`, `buildCompactionPrompt`, `computeMessageTokens`, `estimateTokens`, `formatSessionContext`, `hasDurableContext`, `matchOlderMessages`, `olderThanRecentWindow`, `parseStructuredContext`, `shouldCompact`, `splitForCompaction`.

Local dependencies: [apps/web/src/constants/assistant.config.ts](../../apps/web/src/constants/assistant.config.ts), [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts).

Imported by: [apps/web/src/lib/assistant/compaction.server.ts](../../apps/web/src/lib/assistant/compaction.server.ts), [apps/web/src/lib/assistant/context.server.ts](../../apps/web/src/lib/assistant/context.server.ts), [apps/web/src/lib/assistant/history-retrieval.server.ts](../../apps/web/src/lib/assistant/history-retrieval.server.ts).

## lib/assistant/context.server.ts

Source: [apps/web/src/lib/assistant/context.server.ts](../../apps/web/src/lib/assistant/context.server.ts)

Exports: `CourseResolution`, `buildPageContext`, `buildSystemPrompt`, `courseLabel`, `courseMissMessage`, `loadOwnedCourses`, `matchOwnedCourse`, `resolveCourseRef`.

Local dependencies: [apps/web/src/constants/assistant.config.ts](../../apps/web/src/constants/assistant.config.ts), [apps/web/src/lib/assistant/compaction.ts](../../apps/web/src/lib/assistant/compaction.ts), [apps/web/src/lib/assistant/features.ts](../../apps/web/src/lib/assistant/features.ts), [apps/web/src/lib/assistant/parsing.ts](../../apps/web/src/lib/assistant/parsing.ts), [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Package imports: `pocketbase`.

Literal database references: `courses`.

Imported by: [apps/web/src/lib/assistant/page-context.server.ts](../../apps/web/src/lib/assistant/page-context.server.ts), [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts), [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts).

## lib/assistant/env.server.ts

Source: [apps/web/src/lib/assistant/env.server.ts](../../apps/web/src/lib/assistant/env.server.ts)

Exports: `pocketbaseUrl`, `requireEnv`.

Imported by: [apps/web/src/lib/assistant/auth.server.ts](../../apps/web/src/lib/assistant/auth.server.ts).

## lib/assistant/features.ts

Source: [apps/web/src/lib/assistant/features.ts](../../apps/web/src/lib/assistant/features.ts)

Exports: `ASSISTANT_FEATURES`, `ENTITY_TYPES`, `FEATURE_BY_NAME`, `FeatureDescriptor`, `featureDescriptor`.

Imported by: [apps/web/src/lib/assistant/context.server.ts](../../apps/web/src/lib/assistant/context.server.ts), [apps/web/src/lib/assistant/page-context.ts](../../apps/web/src/lib/assistant/page-context.ts), [apps/web/src/lib/assistant/ui-labels.ts](../../apps/web/src/lib/assistant/ui-labels.ts).

## lib/assistant/history-retrieval.server.ts

Source: [apps/web/src/lib/assistant/history-retrieval.server.ts](../../apps/web/src/lib/assistant/history-retrieval.server.ts)

Exports: `retrieveOlderHistory`.

Local dependencies: [apps/web/src/constants/assistant.config.ts](../../apps/web/src/constants/assistant.config.ts), [apps/web/src/lib/assistant/compaction.ts](../../apps/web/src/lib/assistant/compaction.ts), [apps/web/src/lib/assistant/persistence.server.ts](../../apps/web/src/lib/assistant/persistence.server.ts).

Package imports: `pocketbase`.

Imported by: [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts).

## lib/assistant/logging.server.ts

Source: [apps/web/src/lib/assistant/logging.server.ts](../../apps/web/src/lib/assistant/logging.server.ts)

Exports: `logAssistantError`, `logAssistantRequest`, `logConfirmation`, `logModelRequest`, `logModelResult`, `logToolExecution`.

Local dependencies: [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts).

Imported by: [apps/web/src/lib/assistant/auth.server.ts](../../apps/web/src/lib/assistant/auth.server.ts), [apps/web/src/lib/assistant/compaction.server.ts](../../apps/web/src/lib/assistant/compaction.server.ts), [apps/web/src/lib/assistant/model.server.ts](../../apps/web/src/lib/assistant/model.server.ts), [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts).

## lib/assistant/model.server.ts

Source: [apps/web/src/lib/assistant/model.server.ts](../../apps/web/src/lib/assistant/model.server.ts)

Exports: `collectModel`.

Local dependencies: [apps/web/src/lib/assistant/logging.server.ts](../../apps/web/src/lib/assistant/logging.server.ts), [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts), [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts), [apps/web/src/lib/hostinger-model.server.ts](../../apps/web/src/lib/hostinger-model.server.ts).

Imported by: [apps/web/src/lib/assistant/compaction.server.ts](../../apps/web/src/lib/assistant/compaction.server.ts), [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts).

## lib/assistant/page-context.server.ts

Source: [apps/web/src/lib/assistant/page-context.server.ts](../../apps/web/src/lib/assistant/page-context.server.ts)

Exports: `validateAndAuthorizePageContext`.

Local dependencies: [apps/web/src/lib/assistant/context.server.ts](../../apps/web/src/lib/assistant/context.server.ts), [apps/web/src/lib/assistant/page-context.ts](../../apps/web/src/lib/assistant/page-context.ts), [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Package imports: `pocketbase`.

Imported by: [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts).

## lib/assistant/page-context.ts

Source: [apps/web/src/lib/assistant/page-context.ts](../../apps/web/src/lib/assistant/page-context.ts)

Exports: `deicticCourseId`, `hasPageContextSignal`, `resolveDeicticEntity`, `sanitizePageContextInput`.

Local dependencies: [apps/web/src/lib/assistant/features.ts](../../apps/web/src/lib/assistant/features.ts), [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts).

Imported by: [apps/web/src/lib/assistant/page-context.server.ts](../../apps/web/src/lib/assistant/page-context.server.ts), [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts).

## lib/assistant/parsing.ts

Source: [apps/web/src/lib/assistant/parsing.ts](../../apps/web/src/lib/assistant/parsing.ts)

Exports: `DuplicateDecision`, `PB_ID_RE`, `ROSTER_ADD_CONFIRM_NOTE`, `SHAPE_LABEL`, `collapseAssistantThread`, `collapseRepeatedAssistantText`, `decideAssistantVisible`, `extractProseQuestions`, `hasClarifyProtocol`, `isSameAssistantText`, `isUnconfirmedRosterAdd`, `normalizeAssistantText`, `normalizeSkill`, `parseClarifyBlock`, `parsePrimaryToolCall`, `parseToolBlock`, `parseToolCalls`, `rowId`, `shortenClarifyPrompt`, `skillFromText`, `slugifyCode`, `str`, `stripClarifyBlock`, `stripEmbeddedPayload`, `stripToolBlock`, `stripToolCalls`, `weekFromText`.

Local dependencies: [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts).

Imported by: [apps/web/src/components/app/assistant-panel.tsx](../../apps/web/src/components/app/assistant-panel.tsx), [apps/web/src/lib/assistant/context.server.ts](../../apps/web/src/lib/assistant/context.server.ts), [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts), [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts).

## lib/assistant/persistence.server.ts

Source: [apps/web/src/lib/assistant/persistence.server.ts](../../apps/web/src/lib/assistant/persistence.server.ts)

Exports: `archiveSession`, `createSession`, `deleteSession`, `dismissPendingClarify`, `getSession`, `handleClear`, `handleHistory`, `listSessions`, `loadHistory`, `loadSessionMessages`, `mapHistoryItem`, `mapSessionSummary`, `renameSession`, `resolveDefaultSession`, `saveMessage`, `saveSessionMessage`, `setSessionStatus`, `touchSession`, `updateSessionContext`.

Local dependencies: [apps/web/src/lib/assistant/session-stale.ts](../../apps/web/src/lib/assistant/session-stale.ts), [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts).

Package imports: `pocketbase`.

Imported by: [apps/web/src/lib/assistant/compaction.server.ts](../../apps/web/src/lib/assistant/compaction.server.ts), [apps/web/src/lib/assistant/history-retrieval.server.ts](../../apps/web/src/lib/assistant/history-retrieval.server.ts), [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts), [apps/web/src/lib/assistant.server.ts](../../apps/web/src/lib/assistant.server.ts).

## lib/assistant/runtime.server.ts

Source: [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts)

Exports: `handleConfirm`, `handleReject`, `handleSend`.

Local dependencies: [apps/web/src/constants/assistant.config.ts](../../apps/web/src/constants/assistant.config.ts), [apps/web/src/lib/ai-usage.server.ts](../../apps/web/src/lib/ai-usage.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/assistant/attachments.server.ts](../../apps/web/src/lib/assistant/attachments.server.ts), [apps/web/src/lib/assistant/audit.server.ts](../../apps/web/src/lib/assistant/audit.server.ts), [apps/web/src/lib/assistant/auth.server.ts](../../apps/web/src/lib/assistant/auth.server.ts), [apps/web/src/lib/assistant/compaction.server.ts](../../apps/web/src/lib/assistant/compaction.server.ts), [apps/web/src/lib/assistant/context.server.ts](../../apps/web/src/lib/assistant/context.server.ts), [apps/web/src/lib/assistant/logging.server.ts](../../apps/web/src/lib/assistant/logging.server.ts), [apps/web/src/lib/assistant/model.server.ts](../../apps/web/src/lib/assistant/model.server.ts), [apps/web/src/lib/assistant/page-context.server.ts](../../apps/web/src/lib/assistant/page-context.server.ts), [apps/web/src/lib/assistant/page-context.ts](../../apps/web/src/lib/assistant/page-context.ts), [apps/web/src/lib/assistant/parsing.ts](../../apps/web/src/lib/assistant/parsing.ts), [apps/web/src/lib/assistant/persistence.server.ts](../../apps/web/src/lib/assistant/persistence.server.ts), [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts), [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Package imports: `pocketbase`.

Literal database references: `assignments`, `assistant_messages`, `class_sessions`, `course_roster`, `courses`.

Imported by: [apps/web/src/lib/assistant.server.ts](../../apps/web/src/lib/assistant.server.ts).

## lib/assistant/session-stale.ts

Source: [apps/web/src/lib/assistant/session-stale.ts](../../apps/web/src/lib/assistant/session-stale.ts)

Exports: `ASSISTANT_SESSION_AUTO_NEW_AFTER_MS`, `isSessionStale`.

Imported by: [apps/web/src/components/app/assistant-panel.tsx](../../apps/web/src/components/app/assistant-panel.tsx), [apps/web/src/lib/assistant/persistence.server.ts](../../apps/web/src/lib/assistant/persistence.server.ts).

## lib/assistant/tools.server.ts

Source: [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts)

Exports: `ASSISTANT_TOOLS`, `READ_TOOL_NAMES`, `TOOL_REGISTRY`, `ValidationResult`, `WRITE_TOOL_NAMES`, `cleanAssignmentSummary`, `cleanLinkSummary`, `cleanRosterTransferSummary`, `executeAddRosterStudents`, `executeCreateAssignment`, `executeCreateCourse`, `executeLinkSessionOutcomes`, `executeReadTool`, `getToolDefinition`, `prepareAssignmentDraft`, `prepareLinkPlan`, `prepareRosterTransfer`, `runReadTool`, `serializeToolResult`, `validateToolArgs`.

Local dependencies: [apps/web/src/data/academic-calendar.ts](../../apps/web/src/data/academic-calendar.ts), [apps/web/src/lib/agent-tasks.server.ts](../../apps/web/src/lib/agent-tasks.server.ts), [apps/web/src/lib/assignment-draft.server.ts](../../apps/web/src/lib/assignment-draft.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/assistant/authorization.server.ts](../../apps/web/src/lib/assistant/authorization.server.ts), [apps/web/src/lib/assistant/context.server.ts](../../apps/web/src/lib/assistant/context.server.ts), [apps/web/src/lib/assistant/history-retrieval.server.ts](../../apps/web/src/lib/assistant/history-retrieval.server.ts), [apps/web/src/lib/assistant/parsing.ts](../../apps/web/src/lib/assistant/parsing.ts), [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/rps-pdf-import.server.ts](../../apps/web/src/lib/rps-pdf-import.server.ts), [apps/web/src/lib/student-onboarding.server.ts](../../apps/web/src/lib/student-onboarding.server.ts), [apps/web/src/lib/student-progress.server.ts](../../apps/web/src/lib/student-progress.server.ts), [apps/web/src/lib/task-config-draft.server.ts](../../apps/web/src/lib/task-config-draft.server.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `pocketbase`.

Literal database references: `assessments`, `assignment_submissions`, `assignments`, `attendance`, `check_attempts`, `class_sessions`, `course_resources`, `course_roster`, `course_sections`, `courses`, `cpl`, `cpmk`, `enrollments`, `grade_components`, `grade_entries`, `grade_overrides`, `grade_publications`, `student_learning_profiles`, `sub_cpmk`, `task_answer_keys`, `users`.

Imported by: [apps/web/src/lib/assistant/model.server.ts](../../apps/web/src/lib/assistant/model.server.ts), [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts).

## lib/assistant/types.ts

Source: [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts)

Exports: `ACTIVE_SHAPES`, `ActiveShape`, `AssistantContext`, `AssistantHistoryItem`, `AssistantMemory`, `AssistantMessage`, `AssistantMessageRecord`, `AssistantPageContext`, `AssistantPageContextInput`, `AssistantSession`, `AssistantSessionRecord`, `AssistantSessionSummary`, `AssistantTool`, `AssistantToolAudit`, `AssistantToolCall`, `AssistantToolDefinition`, `AssistantToolResult`, `AssistantUser`, `CONFIRMATION_REQUIRED_TOOLS`, `Clarification`, `ClarifyQuestion`, `ConvRow`, `PendingAction`, `PreparedAssignment`, `PreparedLinkPlan`, `PreparedRosterTransfer`, `READ_TOOLS`, `SendResult`, `SessionStructuredContext`, `StructuredToolCall`, `ToolExecutionContext`, `ToolFieldSchema`, `ToolInputSchema`, `ToolPermission`, `TypedToolResult`, `WRITE_TOOLS`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Package imports: `pocketbase`.

Imported by: [apps/web/src/components/app/assistant-page-context-provider.tsx](../../apps/web/src/components/app/assistant-page-context-provider.tsx), [apps/web/src/lib/assistant/audit.server.ts](../../apps/web/src/lib/assistant/audit.server.ts), [apps/web/src/lib/assistant/auth.server.ts](../../apps/web/src/lib/assistant/auth.server.ts), [apps/web/src/lib/assistant/compaction.server.ts](../../apps/web/src/lib/assistant/compaction.server.ts), [apps/web/src/lib/assistant/compaction.ts](../../apps/web/src/lib/assistant/compaction.ts), [apps/web/src/lib/assistant/context.server.ts](../../apps/web/src/lib/assistant/context.server.ts), [apps/web/src/lib/assistant/logging.server.ts](../../apps/web/src/lib/assistant/logging.server.ts), [apps/web/src/lib/assistant/model.server.ts](../../apps/web/src/lib/assistant/model.server.ts), [apps/web/src/lib/assistant/page-context.server.ts](../../apps/web/src/lib/assistant/page-context.server.ts), [apps/web/src/lib/assistant/page-context.ts](../../apps/web/src/lib/assistant/page-context.ts), [apps/web/src/lib/assistant/parsing.ts](../../apps/web/src/lib/assistant/parsing.ts), [apps/web/src/lib/assistant/persistence.server.ts](../../apps/web/src/lib/assistant/persistence.server.ts), [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts), [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts), [apps/web/src/lib/assistant/ui-labels.ts](../../apps/web/src/lib/assistant/ui-labels.ts), [apps/web/src/lib/assistant.server.ts](../../apps/web/src/lib/assistant.server.ts), [apps/web/src/routes/api.assistant.ts](../../apps/web/src/routes/api.assistant.ts).

## lib/assistant/ui-labels.ts

Source: [apps/web/src/lib/assistant/ui-labels.ts](../../apps/web/src/lib/assistant/ui-labels.ts)

Exports: `ToolActivityItem`, `buildContextBreadcrumb`, `formatLastActivity`, `hasContextIndicator`, `sanitizeError`, `toolActivity`, `toolActivityLabel`.

Local dependencies: [apps/web/src/lib/assistant/features.ts](../../apps/web/src/lib/assistant/features.ts), [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts).

Imported by: [apps/web/src/components/app/assistant-panel.tsx](../../apps/web/src/components/app/assistant-panel.tsx).

## lib/assistant-quick-send.ts

Source: [apps/web/src/lib/assistant-quick-send.ts](../../apps/web/src/lib/assistant-quick-send.ts)

Exports: `AssistantSeed`, `QUICK_ASSISTANT_EVENT`, `onQuickAssistantSend`, `quickSendToAssistant`.

Imported by: [apps/web/src/components/app/agent-dock.tsx](../../apps/web/src/components/app/agent-dock.tsx), [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/assistant-panel.tsx](../../apps/web/src/components/app/assistant-panel.tsx), [apps/web/src/components/app/course-dashboard.tsx](../../apps/web/src/components/app/course-dashboard.tsx).

## lib/assistant.server.ts

Source: [apps/web/src/lib/assistant.server.ts](../../apps/web/src/lib/assistant.server.ts)

Local dependencies: [apps/web/src/lib/assistant/attachments.server.ts](../../apps/web/src/lib/assistant/attachments.server.ts), [apps/web/src/lib/assistant/auth.server.ts](../../apps/web/src/lib/assistant/auth.server.ts), [apps/web/src/lib/assistant/persistence.server.ts](../../apps/web/src/lib/assistant/persistence.server.ts), [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts), [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts).

Imported by: [apps/web/src/routes/api.assistant.ts](../../apps/web/src/routes/api.assistant.ts).

## lib/berkas-versions.server.ts

Source: [apps/web/src/lib/berkas-versions.server.ts](../../apps/web/src/lib/berkas-versions.server.ts)

Exports: `AuthFailure`, `FacultyUser`, `authenticateFaculty`, `fetchStoredFile`, `libraryStatusFor`, `loadExtraction`, `snapshotActiveVersion`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Package imports: `pocketbase`.

Literal database references: `file_extractions`, `file_versions`, `users`.

Imported by: [apps/web/src/routes/api.berkas-restore.ts](../../apps/web/src/routes/api.berkas-restore.ts), [apps/web/src/routes/api.berkas-snapshot.ts](../../apps/web/src/routes/api.berkas-snapshot.ts), [apps/web/src/routes/api.berkas-suggest.ts](../../apps/web/src/routes/api.berkas-suggest.ts), [apps/web/src/routes/api.context-insights.ts](../../apps/web/src/routes/api.context-insights.ts), [apps/web/src/routes/api.recommendations-generate.ts](../../apps/web/src/routes/api.recommendations-generate.ts), [apps/web/src/routes/api.recommendations-review.ts](../../apps/web/src/routes/api.recommendations-review.ts).

## lib/bulk-paper.server.ts

Source: [apps/web/src/lib/bulk-paper.server.ts](../../apps/web/src/lib/bulk-paper.server.ts)

Exports: `SubmitOutcome`, `createPaperSubmissions`, `extractImageEntries`, `resolveEnrolledRoster`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/bulk-paper.ts](../../apps/web/src/lib/bulk-paper.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/task-assist.server.ts](../../apps/web/src/lib/task-assist.server.ts).

Literal database references: `assignment_submissions`.

Imported by: [apps/web/src/routes/api.bulk-paper-extract.ts](../../apps/web/src/routes/api.bulk-paper-extract.ts), [apps/web/src/routes/api.bulk-paper-prepare.ts](../../apps/web/src/routes/api.bulk-paper-prepare.ts), [apps/web/src/routes/api.bulk-paper-submit.ts](../../apps/web/src/routes/api.bulk-paper-submit.ts).

## lib/bulk-paper.ts

Source: [apps/web/src/lib/bulk-paper.ts](../../apps/web/src/lib/bulk-paper.ts)

Exports: `MatchResult`, `PaperEntry`, `RosterStudent`, `matchStudent`, `newRowId`, `parseTextEntries`.

Imported by: [apps/web/src/components/app/bulk-paper-input.tsx](../../apps/web/src/components/app/bulk-paper-input.tsx), [apps/web/src/lib/bulk-paper.server.ts](../../apps/web/src/lib/bulk-paper.server.ts), [apps/web/src/routes/api.bulk-paper-submit.ts](../../apps/web/src/routes/api.bulk-paper-submit.ts).

## lib/cefr-level.ts

Source: [apps/web/src/lib/cefr-level.ts](../../apps/web/src/lib/cefr-level.ts)

Exports: `CefrLevel`, `cefrLevelGuide`, `extractCefrLevel`, `languageLevelGuide`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Imported by: [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx), [apps/web/src/lib/ai-evaluation.server.ts](../../apps/web/src/lib/ai-evaluation.server.ts), [apps/web/src/lib/feedback-uptake.server.ts](../../apps/web/src/lib/feedback-uptake.server.ts), [apps/web/src/lib/personal-practice.server.ts](../../apps/web/src/lib/personal-practice.server.ts), [apps/web/src/lib/personalization-analytics.server.ts](../../apps/web/src/lib/personalization-analytics.server.ts), [apps/web/src/lib/research-analytics.server.ts](../../apps/web/src/lib/research-analytics.server.ts), [apps/web/src/lib/research-export.server.ts](../../apps/web/src/lib/research-export.server.ts), [apps/web/src/routes/api.check-answer.ts](../../apps/web/src/routes/api.check-answer.ts).

## lib/check-answer.server.ts

Source: [apps/web/src/lib/check-answer.server.ts](../../apps/web/src/lib/check-answer.server.ts)

Exports: `CheckFeedback`, `CheckHintCriterion`, `buildCheckFeedback`, `normalizeOcrText`, `renderResponseText`, `responseHasDirectAnswer`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/check-types.ts](../../apps/web/src/lib/check-types.ts), [apps/web/src/lib/feedback.server.ts](../../apps/web/src/lib/feedback.server.ts), [apps/web/src/lib/task-assist.server.ts](../../apps/web/src/lib/task-assist.server.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Imported by: [apps/web/src/routes/api.check-answer.ts](../../apps/web/src/routes/api.check-answer.ts), [apps/web/src/routes/api.practice-assist.ts](../../apps/web/src/routes/api.practice-assist.ts).

## lib/check-types.ts

Source: [apps/web/src/lib/check-types.ts](../../apps/web/src/lib/check-types.ts)

Exports: `CHECK_KIND_NOTE`, `CHECK_LEVEL_LABEL`, `CheckResponsePayload`, `DEFAULT_CHECK_MAX`, `EXPLICIT_CORRECTION_LEVEL`, `FeedbackInteractionMeta`, `MAX_PROGRESSIVE_LEVEL`, `PublicCheckIdentity`, `checkLevelOf`, `checkMaxOf`, `enrolledIdentityKey`, `identityOf`, `interactionMetaOf`, `publicIdentityComplete`, `responseSignatureOf`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts).

Imported by: [apps/web/src/components/app/difficulty-insights.tsx](../../apps/web/src/components/app/difficulty-insights.tsx), [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx), [apps/web/src/components/app/submission-task-review.tsx](../../apps/web/src/components/app/submission-task-review.tsx), [apps/web/src/components/app/task-workspaces/check-answer-panel.tsx](../../apps/web/src/components/app/task-workspaces/check-answer-panel.tsx), [apps/web/src/lib/check-answer.server.ts](../../apps/web/src/lib/check-answer.server.ts), [apps/web/src/routes/api.check-answer.ts](../../apps/web/src/routes/api.check-answer.ts), [apps/web/src/routes/api.practice-assist.ts](../../apps/web/src/routes/api.practice-assist.ts).

## lib/context-retrieval.server.ts

Source: [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts)

Exports: `AuthFailure`, `AuthedUser`, `ContextBundle`, `ContextCitation`, `ContextFeature`, `ContextSectionRef`, `ContextSource`, `Requester`, `RequesterRole`, `RetrievalScope`, `SourceKind`, `authenticateUser`, `cpmkOfSubCpmk`, `retrieveContextBundle`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Package imports: `node:crypto`, `pocketbase`.

Literal database references: `context_retrievals`, `context_sections`, `file_contexts`, `file_extractions`, `file_library`, `sub_cpmk`, `users`.

Imported by: [apps/web/src/lib/agent-tasks.server.ts](../../apps/web/src/lib/agent-tasks.server.ts), [apps/web/src/lib/ai-evaluation.server.ts](../../apps/web/src/lib/ai-evaluation.server.ts), [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts), [apps/web/src/lib/evaluation-annotation.server.ts](../../apps/web/src/lib/evaluation-annotation.server.ts), [apps/web/src/lib/evaluation-review.server.ts](../../apps/web/src/lib/evaluation-review.server.ts), [apps/web/src/lib/feedback-uptake.server.ts](../../apps/web/src/lib/feedback-uptake.server.ts), [apps/web/src/lib/lecturer-recommendations.server.ts](../../apps/web/src/lib/lecturer-recommendations.server.ts), [apps/web/src/lib/lesson-plans.server.ts](../../apps/web/src/lib/lesson-plans.server.ts), [apps/web/src/lib/personalization-analytics.server.ts](../../apps/web/src/lib/personalization-analytics.server.ts), [apps/web/src/lib/research-analytics.server.ts](../../apps/web/src/lib/research-analytics.server.ts), [apps/web/src/lib/research-export.server.ts](../../apps/web/src/lib/research-export.server.ts), [apps/web/src/lib/research-target.server.ts](../../apps/web/src/lib/research-target.server.ts), [apps/web/src/lib/student-assistant-tools.server.ts](../../apps/web/src/lib/student-assistant-tools.server.ts), [apps/web/src/lib/student-assistant.server.ts](../../apps/web/src/lib/student-assistant.server.ts), [apps/web/src/routes/api.agent-tasks.ts](../../apps/web/src/routes/api.agent-tasks.ts), [apps/web/src/routes/api.ai-usage.ts](../../apps/web/src/routes/api.ai-usage.ts), [apps/web/src/routes/api.bulk-paper-extract.ts](../../apps/web/src/routes/api.bulk-paper-extract.ts), [apps/web/src/routes/api.bulk-paper-prepare.ts](../../apps/web/src/routes/api.bulk-paper-prepare.ts), [apps/web/src/routes/api.bulk-paper-submit.ts](../../apps/web/src/routes/api.bulk-paper-submit.ts), [apps/web/src/routes/api.context-check.ts](../../apps/web/src/routes/api.context-check.ts), [apps/web/src/routes/api.context-insights.ts](../../apps/web/src/routes/api.context-insights.ts), [apps/web/src/routes/api.context-material.ts](../../apps/web/src/routes/api.context-material.ts), [apps/web/src/routes/api.conversation-practice.ts](../../apps/web/src/routes/api.conversation-practice.ts), [apps/web/src/routes/api.course-grade-summary.ts](../../apps/web/src/routes/api.course-grade-summary.ts), [apps/web/src/routes/api.course-thumbnail.ts](../../apps/web/src/routes/api.course-thumbnail.ts), [apps/web/src/routes/api.evaluation-draft.ts](../../apps/web/src/routes/api.evaluation-draft.ts), [apps/web/src/routes/api.evaluation-participants.ts](../../apps/web/src/routes/api.evaluation-participants.ts), [apps/web/src/routes/api.evaluation-result.ts](../../apps/web/src/routes/api.evaluation-result.ts), [apps/web/src/routes/api.lesson-plans.ts](../../apps/web/src/routes/api.lesson-plans.ts), [apps/web/src/routes/api.personal-practice.ts](../../apps/web/src/routes/api.personal-practice.ts), [apps/web/src/routes/api.practice-assist.ts](../../apps/web/src/routes/api.practice-assist.ts), [apps/web/src/routes/api.practice-speaking.ts](../../apps/web/src/routes/api.practice-speaking.ts), [apps/web/src/routes/api.recommendations-generate.ts](../../apps/web/src/routes/api.recommendations-generate.ts), [apps/web/src/routes/api.rubric-suggestions.ts](../../apps/web/src/routes/api.rubric-suggestions.ts), [apps/web/src/routes/api.task-config-draft.ts](../../apps/web/src/routes/api.task-config-draft.ts).

## lib/context-suggestions-client.ts

Source: [apps/web/src/lib/context-suggestions-client.ts](../../apps/web/src/lib/context-suggestions-client.ts)

Exports: `ApplyContext`, `ApplyResult`, `SuggestionGenerateResult`, `applyContextSuggestion`, `fetchContextSuggestions`, `generateContextSuggestions`, `reviewContextSuggestion`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Literal database references: `context_sections`, `context_suggestions`, `file_contexts`, `file_library`.

Imported by: [apps/web/src/components/app/file-context.tsx](../../apps/web/src/components/app/file-context.tsx), [apps/web/src/components/app/file-upload-dialog.tsx](../../apps/web/src/components/app/file-upload-dialog.tsx).

## lib/context-suggestions.server.ts

Source: [apps/web/src/lib/context-suggestions.server.ts](../../apps/web/src/lib/context-suggestions.server.ts)

Exports: `GenerateInput`, `GenerateResult`, `SuggestionDraft`, `generateSuggestions`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/task-assist.server.ts](../../apps/web/src/lib/task-assist.server.ts).

Package imports: `node:crypto`.

Literal database references: `class_sessions`, `context_suggestions`, `courses`, `cpmk`, `file_extractions`, `file_library`, `sub_cpmk`.

Imported by: [apps/web/src/routes/api.berkas-suggest.ts](../../apps/web/src/routes/api.berkas-suggest.ts).

## lib/conversation-turns.ts

Source: [apps/web/src/lib/conversation-turns.ts](../../apps/web/src/lib/conversation-turns.ts)

Exports: `CONVERSATION_TURNS`, `closeConversation`, `conversationTurn`.

Imported by: [apps/web/src/routes/api.conversation-practice.ts](../../apps/web/src/routes/api.conversation-practice.ts).

## lib/conversation-vad.ts

Source: [apps/web/src/lib/conversation-vad.ts](../../apps/web/src/lib/conversation-vad.ts)

Exports: `ConversationVad`.

Imported by: [apps/web/src/components/app/conversation-practice.tsx](../../apps/web/src/components/app/conversation-practice.tsx).

## lib/course-analytics.ts

Source: [apps/web/src/lib/course-analytics.ts](../../apps/web/src/lib/course-analytics.ts)

Exports: `AlertItem`, `AnalyticsAttempt`, `AnalyticsModel`, `CourseAnalyticsInput`, `DistRow`, `OwnerIdentity`, `RosterAccount`, `StudentAttention`, `SubCpmkRow`, `TopicRow`, `WeekBar`, `buildCourseAnalytics`, `isCollected`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Imported by: [apps/web/src/components/app/course-analytics.tsx](../../apps/web/src/components/app/course-analytics.tsx).

## lib/course-route.ts

Source: [apps/web/src/lib/course-route.ts](../../apps/web/src/lib/course-route.ts)

Exports: `courseCodeSlug`, `courseRouteId`, `fetchCourseByRoute`, `isCourseIdParam`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Literal database references: `courses`.

Imported by: [apps/web/src/components/app/academic-calendar.tsx](../../apps/web/src/components/app/academic-calendar.tsx), [apps/web/src/components/app/analytics-index.tsx](../../apps/web/src/components/app/analytics-index.tsx), [apps/web/src/components/app/course-catalog-card.tsx](../../apps/web/src/components/app/course-catalog-card.tsx), [apps/web/src/components/app/course-dashboard.tsx](../../apps/web/src/components/app/course-dashboard.tsx), [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/course-rail.tsx](../../apps/web/src/components/app/course-rail.tsx), [apps/web/src/components/app/rps-editor-page.tsx](../../apps/web/src/components/app/rps-editor-page.tsx), [apps/web/src/components/app/student-courses.tsx](../../apps/web/src/components/app/student-courses.tsx), [apps/web/src/components/app/student-dashboard.tsx](../../apps/web/src/components/app/student-dashboard.tsx), [apps/web/src/components/app/student-home-adventure.tsx](../../apps/web/src/components/app/student-home-adventure.tsx), [apps/web/src/components/app/student-work-page.tsx](../../apps/web/src/components/app/student-work-page.tsx), [apps/web/src/hooks/use-course-route.ts](../../apps/web/src/hooks/use-course-route.ts).

## lib/course-sections.ts

Source: [apps/web/src/lib/course-sections.ts](../../apps/web/src/lib/course-sections.ts)

Exports: `COURSE_SECTIONS`, `CourseSection`, `FACULTY_COURSE_SECTIONS`, `SECTION_LABEL`, `SECTION_LABEL_STUDENT`, `STUDENT_COURSE_SECTIONS`, `courseSectionPath`, `isCourseSection`, `sectionFromLegacyTab`, `sectionFromPath`.

Imported by: [apps/web/src/components/app/analytics-index.tsx](../../apps/web/src/components/app/analytics-index.tsx), [apps/web/src/components/app/course-analytics.tsx](../../apps/web/src/components/app/course-analytics.tsx), [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/course-info.tsx](../../apps/web/src/components/app/course-info.tsx), [apps/web/src/components/app/course-rail.tsx](../../apps/web/src/components/app/course-rail.tsx), [apps/web/src/components/app/student-course-overview.tsx](../../apps/web/src/components/app/student-course-overview.tsx), [apps/web/src/routes/course.section.tsx](../../apps/web/src/routes/course.section.tsx).

## lib/course-thumb.ts

Source: [apps/web/src/lib/course-thumb.ts](../../apps/web/src/lib/course-thumb.ts)

Exports: `COURSE_COVERS`, `courseCoverFor`, `courseThumbUrl`.

Local dependencies: [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Imported by: [apps/web/src/components/app/course-dashboard.tsx](../../apps/web/src/components/app/course-dashboard.tsx), [apps/web/src/components/app/course-thumb-dialog.tsx](../../apps/web/src/components/app/course-thumb-dialog.tsx), [apps/web/src/components/app/course-thumb.tsx](../../apps/web/src/components/app/course-thumb.tsx), [apps/web/src/components/app/courses-page.tsx](../../apps/web/src/components/app/courses-page.tsx).

## lib/course-thumbnail.server.ts

Source: [apps/web/src/lib/course-thumbnail.server.ts](../../apps/web/src/lib/course-thumbnail.server.ts)

Exports: `GeneratedThumbnail`, `generateCourseThumbnail`.

Local dependencies: [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts).

Imported by: [apps/web/src/routes/api.course-thumbnail.ts](../../apps/web/src/routes/api.course-thumbnail.ts).

## lib/difficulty-data.ts

Source: [apps/web/src/lib/difficulty-data.ts](../../apps/web/src/lib/difficulty-data.ts)

Exports: `DifficultyAttempt`, `DifficultyChannel`, `channelOf`, `useDifficultyData`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `react`.

Literal database references: `assignment_submissions`, `check_attempts`, `public_submissions`.

Imported by: [apps/web/src/components/app/difficulty-insights.tsx](../../apps/web/src/components/app/difficulty-insights.tsx), [apps/web/src/components/app/difficulty-summary.tsx](../../apps/web/src/components/app/difficulty-summary.tsx).

## lib/elevenlabs-tts.server.ts

Source: [apps/web/src/lib/elevenlabs-tts.server.ts](../../apps/web/src/lib/elevenlabs-tts.server.ts)

Exports: `synthesizeElevenLabsSpeech`.

Imported by: [apps/web/src/routes/api.conversation-practice.ts](../../apps/web/src/routes/api.conversation-practice.ts).

## lib/evaluation-annotation.server.ts

Source: [apps/web/src/lib/evaluation-annotation.server.ts](../../apps/web/src/lib/evaluation-annotation.server.ts)

Exports: `AiContentFields`, `AnnotationBody`, `AnnotationError`, `AnnotationSave`, `EMPTY_AI_CONTENT_FIELDS`, `MissedErrorBody`, `buildAiContentFields`, `deleteMissedErrorAnnotation`, `loadResearchRatings`, `saveMissedErrorAnnotation`, `saveResearchAnnotation`.

Local dependencies: [apps/web/src/lib/ai-evaluation.ts](../../apps/web/src/lib/ai-evaluation.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/research-annotation.ts](../../apps/web/src/lib/research-annotation.ts), [apps/web/src/lib/research-rater.ts](../../apps/web/src/lib/research-rater.ts), [apps/web/src/lib/research-target.server.ts](../../apps/web/src/lib/research-target.server.ts).

Literal database references: `ai_evaluations`, `ai_feedback_items`, `research_annotation_locks`.

Imported by: [apps/web/src/routes/api.evaluation-annotation.ts](../../apps/web/src/routes/api.evaluation-annotation.ts), [apps/web/src/routes/api.evaluation-missed-error.ts](../../apps/web/src/routes/api.evaluation-missed-error.ts).

## lib/evaluation-review.server.ts

Source: [apps/web/src/lib/evaluation-review.server.ts](../../apps/web/src/lib/evaluation-review.server.ts)

Exports: `EvaluationTarget`, `TargetError`, `loadEvaluationTarget`, `validateReviewFindings`.

Local dependencies: [apps/web/src/lib/ai-evaluation.ts](../../apps/web/src/lib/ai-evaluation.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/evaluation-scoring.ts](../../apps/web/src/lib/evaluation-scoring.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Literal database references: `assignments`.

Imported by: [apps/web/src/routes/api.evaluation-publish.ts](../../apps/web/src/routes/api.evaluation-publish.ts), [apps/web/src/routes/api.evaluation-review.ts](../../apps/web/src/routes/api.evaluation-review.ts).

## lib/evaluation-rubric.ts

Source: [apps/web/src/lib/evaluation-rubric.ts](../../apps/web/src/lib/evaluation-rubric.ts)

Exports: `Criterion`, `CriterionResult`, `matchCriterion`, `rubricTotal`, `validatedRubric`.

Imported by: [apps/web/src/components/app/ai-evaluation-review.tsx](../../apps/web/src/components/app/ai-evaluation-review.tsx), [apps/web/src/lib/ai-evaluation.server.ts](../../apps/web/src/lib/ai-evaluation.server.ts).

## lib/evaluation-scoring.ts

Source: [apps/web/src/lib/evaluation-scoring.ts](../../apps/web/src/lib/evaluation-scoring.ts)

Exports: `COMPLETION_CAP_SCORE`, `COMPLETION_CAP_WORDS`, `CONFIDENCE_LOW_THRESHOLD`, `CURRENT_SCORING_VERSION`, `LENGTH_TOLERANCE`, `MAJOR_CAP`, `MAJOR_PER_POINT`, `MINOR_CAP`, `MINOR_PER_POINT`, `RUBRIC_MAJOR_PENALTY`, `RUBRIC_MINOR_PENALTY`, `RubricCriterion`, `RubricGeneralRow`, `RubricScoreRow`, `RubricScores`, `ScoreFactor`, `autoAssignCriterion`, `calculateRubricScores`, `clampScore`, `countWords`, `isCountedFinding`, `normalizeCriterionId`, `rubricCriteriaOf`, `speakingTranscriptUnavailable`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Imported by: [apps/web/src/components/app/ai-evaluation-review.tsx](../../apps/web/src/components/app/ai-evaluation-review.tsx), [apps/web/src/components/app/formative-evaluation-review.tsx](../../apps/web/src/components/app/formative-evaluation-review.tsx), [apps/web/src/lib/ai-evaluation.ts](../../apps/web/src/lib/ai-evaluation.ts), [apps/web/src/lib/evaluation-review.server.ts](../../apps/web/src/lib/evaluation-review.server.ts), [apps/web/src/lib/formative-scoring.ts](../../apps/web/src/lib/formative-scoring.ts), [apps/web/src/routes/api.evaluation-publish.ts](../../apps/web/src/routes/api.evaluation-publish.ts), [apps/web/src/routes/api.evaluation-result.ts](../../apps/web/src/routes/api.evaluation-result.ts).

## lib/evaluation-snapshot.server.ts

Source: [apps/web/src/lib/evaluation-snapshot.server.ts](../../apps/web/src/lib/evaluation-snapshot.server.ts)

Exports: `canonicalEvidenceJson`, `createResearchSnapshot`.

Package imports: `node:crypto`.

Imported by: [apps/web/src/lib/ai-evaluation.server.ts](../../apps/web/src/lib/ai-evaluation.server.ts).

## lib/feedback-uptake.server.ts

Source: [apps/web/src/lib/feedback-uptake.server.ts](../../apps/web/src/lib/feedback-uptake.server.ts)

Exports: `ParticipantChain`, `SaveAssociationInput`, `SaveUptakeInput`, `UPTAKE_CSV_HEADERS`, `UptakeError`, `UptakeExportRow`, `UptakeViewData`, `buildUptakeCsv`, `buildUptakeExportRows`, `computeUptakeAnalyticsForUser`, `csvEscapeUptake`, `groupByParticipant`, `loadUptakeView`, `responseTextOf`, `saveAssociation`, `saveUptakeAnnotation`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/cefr-level.ts](../../apps/web/src/lib/cefr-level.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/feedback-uptake.ts](../../apps/web/src/lib/feedback-uptake.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/research-export.server.ts](../../apps/web/src/lib/research-export.server.ts).

Literal database references: `assignments`, `check_attempts`, `courses`, `feedback_revisions`, `feedback_uptake`.

Imported by: [apps/web/src/routes/api.feedback-uptake.ts](../../apps/web/src/routes/api.feedback-uptake.ts), [apps/web/src/routes/api.research-export.ts](../../apps/web/src/routes/api.research-export.ts).

## lib/feedback-uptake.ts

Source: [apps/web/src/lib/feedback-uptake.ts](../../apps/web/src/lib/feedback-uptake.ts)

Exports: `AFTER_STATUS_LABEL`, `AFTER_STATUS_OPTIONS`, `ATTRIBUTION_LABEL`, `ATTRIBUTION_OPTIONS`, `AfterRevisionStatus`, `AttemptRef`, `AttributionStatus`, `BEFORE_STATUS_LABEL`, `BEFORE_STATUS_OPTIONS`, `BeforeRevisionStatus`, `EXPLICIT_CORRECTION_LEVEL`, `MAX_PROGRESSIVE_LEVEL`, `MIN_UPTAKE_ANNOTATED`, `UPTAKE_JUDGMENT_DESCRIPTION`, `UPTAKE_JUDGMENT_LABEL`, `UPTAKE_JUDGMENT_OPTIONS`, `UptakeAnalytics`, `UptakeJudgment`, `UptakeRecord`, `ValidationError`, `computeUptakeAnalytics`, `hintLevelsBeforeRevision`, `maxHintLevelBeforeRevision`, `normalizeHintLevels`, `requiredExplicitCorrection`, `validateAssociationPair`, `validateUptakeRelationship`.

Imported by: [apps/web/src/components/app/feedback-uptake-review.tsx](../../apps/web/src/components/app/feedback-uptake-review.tsx), [apps/web/src/components/app/research-analytics.tsx](../../apps/web/src/components/app/research-analytics.tsx), [apps/web/src/lib/feedback-uptake.server.ts](../../apps/web/src/lib/feedback-uptake.server.ts).

## lib/feedback.server.ts

Source: [apps/web/src/lib/feedback.server.ts](../../apps/web/src/lib/feedback.server.ts)

Exports: `ExtractedContent`, `HintCriterion`, `OcrAttemptSnapshot`, `ProgressiveHint`, `TASK_KIND_GUIDANCE`, `buildProgressiveHint`, `criteriaForAssignment`, `extractStoredFiles`, `extractSubmissionContent`, `parseExtracted`, `parseModelJson`, `taskSourceContext`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/task-assist.server.ts](../../apps/web/src/lib/task-assist.server.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `pdf-parse`.

Imported by: [apps/web/src/lib/agent-tasks.server.ts](../../apps/web/src/lib/agent-tasks.server.ts), [apps/web/src/lib/check-answer.server.ts](../../apps/web/src/lib/check-answer.server.ts), [apps/web/src/lib/personal-practice.server.ts](../../apps/web/src/lib/personal-practice.server.ts), [apps/web/src/lib/practice-assist.server.ts](../../apps/web/src/lib/practice-assist.server.ts), [apps/web/src/routes/api.check-answer.ts](../../apps/web/src/routes/api.check-answer.ts), [apps/web/src/routes/api.conversation-practice.ts](../../apps/web/src/routes/api.conversation-practice.ts), [apps/web/src/routes/api.feedback.ts](../../apps/web/src/routes/api.feedback.ts), [apps/web/src/routes/api.practice-assist.ts](../../apps/web/src/routes/api.practice-assist.ts), [apps/web/src/routes/api.practice-speaking.ts](../../apps/web/src/routes/api.practice-speaking.ts).

## lib/file-library.ts

Source: [apps/web/src/lib/file-library.ts](../../apps/web/src/lib/file-library.ts)

Exports: `ACCESS_HINTS`, `ACCESS_LABELS`, `EXTRACTION_STATUS_LABELS`, `FILE_KIND_LABELS`, `FILE_LIBRARY_MAX_SIZE`, `FILE_LIBRARY_MIME_TYPES`, `FileKind`, `ProcessSummary`, `ProcessingState`, `STATUS_LABELS`, `fileKindFor`, `formatBytes`, `processLibraryFile`, `processingStateFor`, `restoreFileVersion`, `snapshotLibraryFile`, `validateLibraryFile`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Imported by: [apps/web/src/components/app/file-context.tsx](../../apps/web/src/components/app/file-context.tsx), [apps/web/src/components/app/file-library.tsx](../../apps/web/src/components/app/file-library.tsx), [apps/web/src/components/app/file-upload-dialog.tsx](../../apps/web/src/components/app/file-upload-dialog.tsx), [apps/web/src/components/app/file-version-history.tsx](../../apps/web/src/components/app/file-version-history.tsx).

## lib/file-metadata.ts

Source: [apps/web/src/lib/file-metadata.ts](../../apps/web/src/lib/file-metadata.ts)

Exports: `DetectedLanguage`, `LANGUAGE_LABELS`, `PARSE_MAX_SIZE`, `detectLanguage`, `isClientTextFile`, `matchCourseFromFilename`, `normalizeForMatch`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Imported by: [apps/web/src/components/app/file-context.tsx](../../apps/web/src/components/app/file-context.tsx), [apps/web/src/components/app/file-library.tsx](../../apps/web/src/components/app/file-library.tsx), [apps/web/src/components/app/file-upload-dialog.tsx](../../apps/web/src/components/app/file-upload-dialog.tsx), [apps/web/src/components/app/file-version-history.tsx](../../apps/web/src/components/app/file-version-history.tsx), [apps/web/src/routes/api.berkas-process.ts](../../apps/web/src/routes/api.berkas-process.ts).

## lib/formative-scoring.ts

Source: [apps/web/src/lib/formative-scoring.ts](../../apps/web/src/lib/formative-scoring.ts)

Exports: `FormativeAdvisory`, `FormativeScoreFactor`, `calculateFormativeAdvisory`, `feedbackCitesMaterial`.

Local dependencies: [apps/web/src/lib/evaluation-scoring.ts](../../apps/web/src/lib/evaluation-scoring.ts).

Imported by: [apps/web/src/components/app/formative-evaluation-review.tsx](../../apps/web/src/components/app/formative-evaluation-review.tsx).

## lib/gradebook.ts

Source: [apps/web/src/lib/gradebook.ts](../../apps/web/src/lib/gradebook.ts)

Exports: `FinalGradeResult`, `GradeComponent`, `GradeComponentKind`, `GradeEntry`, `GradeOverride`, `GradePublication`, `GradebookStudent`, `LETTER_GRADES`, `STATUS_LABEL`, `StudentStatus`, `calculateFinalGrade`, `componentCounts`, `componentScore`, `letterGrade`, `parseGradeInput`, `studentStatus`, `totalWeight`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts).

Imported by: [apps/web/src/components/app/lecturer-gradebook.tsx](../../apps/web/src/components/app/lecturer-gradebook.tsx), [apps/web/src/lib/grouped-gradebook.ts](../../apps/web/src/lib/grouped-gradebook.ts), [apps/web/src/routes/api.course-grade-summary.ts](../../apps/web/src/routes/api.course-grade-summary.ts).

## lib/grouped-gradebook.ts

Source: [apps/web/src/lib/grouped-gradebook.ts](../../apps/web/src/lib/grouped-gradebook.ts)

Exports: `AttendanceRecord`, `AttendanceSession`, `ParticipationAward`, `groupedComponents`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/gradebook.ts](../../apps/web/src/lib/gradebook.ts).

Imported by: [apps/web/src/components/app/lecturer-gradebook.tsx](../../apps/web/src/components/app/lecturer-gradebook.tsx), [apps/web/src/routes/api.course-grade-summary.ts](../../apps/web/src/routes/api.course-grade-summary.ts).

## lib/heic.ts

Source: [apps/web/src/lib/heic.ts](../../apps/web/src/lib/heic.ts)

Exports: `convertHeicToJpeg`, `isHeic`.

Package imports: `heic2any`.

Imported by: [apps/web/src/components/app/bulk-paper-input.tsx](../../apps/web/src/components/app/bulk-paper-input.tsx).

## lib/hostinger-model.server.ts

Source: [apps/web/src/lib/hostinger-model.server.ts](../../apps/web/src/lib/hostinger-model.server.ts)

Exports: `HostingerMessage`, `HostingerResult`, `HostingerTool`, `HostingerToolCall`, `collectHostingerText`.

Imported by: [apps/web/src/lib/agent-tasks.server.ts](../../apps/web/src/lib/agent-tasks.server.ts), [apps/web/src/lib/assignment-draft.server.ts](../../apps/web/src/lib/assignment-draft.server.ts), [apps/web/src/lib/assistant/model.server.ts](../../apps/web/src/lib/assistant/model.server.ts), [apps/web/src/lib/integrated-ai.server.ts](../../apps/web/src/lib/integrated-ai.server.ts), [apps/web/src/lib/personal-practice.server.ts](../../apps/web/src/lib/personal-practice.server.ts), [apps/web/src/lib/rps-ai-extract.server.ts](../../apps/web/src/lib/rps-ai-extract.server.ts), [apps/web/src/lib/rps-assist.server.ts](../../apps/web/src/lib/rps-assist.server.ts), [apps/web/src/lib/task-assist.server.ts](../../apps/web/src/lib/task-assist.server.ts), [apps/web/src/routes/api.conversation-practice.ts](../../apps/web/src/routes/api.conversation-practice.ts).

## lib/hostinger-tts.server.ts

Source: [apps/web/src/lib/hostinger-tts.server.ts](../../apps/web/src/lib/hostinger-tts.server.ts)

Exports: `HOSTINGER_TTS_MODELS`, `HostingerTtsModel`, `HostingerTtsVoice`, `synthesizeHostingerSpeech`.

Imported by: [apps/web/src/routes/api.conversation-practice.ts](../../apps/web/src/routes/api.conversation-practice.ts).

## lib/i18n.ts

Source: [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts)

Exports: `DEFAULT_LANGUAGE`, `DEFAULT_STUDENT_LANGUAGE`, `LANGUAGES`, `Language`, `isLanguage`, `languageOf`, `nativeName`, `translate`, `useLanguage`, `useT`.

Local dependencies: [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `react`.

Imported by: [apps/web/src/components/app/academic-calendar.tsx](../../apps/web/src/components/app/academic-calendar.tsx), [apps/web/src/components/app/ai-evaluation-review.tsx](../../apps/web/src/components/app/ai-evaluation-review.tsx), [apps/web/src/components/app/analytics-index.tsx](../../apps/web/src/components/app/analytics-index.tsx), [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/attendance-manager.tsx](../../apps/web/src/components/app/attendance-manager.tsx), [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/course-rail.tsx](../../apps/web/src/components/app/course-rail.tsx), [apps/web/src/components/app/course-resources.tsx](../../apps/web/src/components/app/course-resources.tsx), [apps/web/src/components/app/course-roster.tsx](../../apps/web/src/components/app/course-roster.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx), [apps/web/src/components/app/lecturer-gradebook.tsx](../../apps/web/src/components/app/lecturer-gradebook.tsx), [apps/web/src/components/app/settings/language-section.tsx](../../apps/web/src/components/app/settings/language-section.tsx), [apps/web/src/components/app/student-answer-sheet.tsx](../../apps/web/src/components/app/student-answer-sheet.tsx), [apps/web/src/components/app/student-course-overview.tsx](../../apps/web/src/components/app/student-course-overview.tsx), [apps/web/src/components/app/student-courses.tsx](../../apps/web/src/components/app/student-courses.tsx), [apps/web/src/components/app/student-dashboard.tsx](../../apps/web/src/components/app/student-dashboard.tsx), [apps/web/src/components/app/student-grades.tsx](../../apps/web/src/components/app/student-grades.tsx), [apps/web/src/components/app/student-result-view.tsx](../../apps/web/src/components/app/student-result-view.tsx), [apps/web/src/components/app/workspace-guide-steps.ts](../../apps/web/src/components/app/workspace-guide-steps.ts), [apps/web/src/components/app/workspace-guide.tsx](../../apps/web/src/components/app/workspace-guide.tsx), [apps/web/src/lib/student-home-copy.ts](../../apps/web/src/lib/student-home-copy.ts), [apps/web/src/lib/worksheet-brief.ts](../../apps/web/src/lib/worksheet-brief.ts), [apps/web/src/routes/api.roster-language.ts](../../apps/web/src/routes/api.roster-language.ts).

## lib/integrated-ai.server.ts

Source: [apps/web/src/lib/integrated-ai.server.ts](../../apps/web/src/lib/integrated-ai.server.ts)

Exports: `ContentBlock`, `MAX_MESSAGE_BYTES`, `consumeAssistantRateLimit`, `isOwnFileReference`, `resolveChatUserId`, `streamAssistant`, `uploadImages`.

Local dependencies: [apps/web/src/constants/ai-assistant.config.ts](../../apps/web/src/constants/ai-assistant.config.ts), [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/hostinger-model.server.ts](../../apps/web/src/lib/hostinger-model.server.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/rate-limit.server.ts](../../apps/web/src/lib/rate-limit.server.ts).

Imported by: [apps/web/src/routes/api.integrated-ai.stream.ts](../../apps/web/src/routes/api.integrated-ai.stream.ts).

## lib/learner-profile.server.ts

Source: [apps/web/src/lib/learner-profile.server.ts](../../apps/web/src/lib/learner-profile.server.ts)

Exports: `buildLearnerProfileForUser`, `enrolledUserIdFromKey`.

Local dependencies: [apps/web/src/lib/ai-evaluation.ts](../../apps/web/src/lib/ai-evaluation.ts), [apps/web/src/lib/learner-profile.ts](../../apps/web/src/lib/learner-profile.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `ai_feedback_items`, `assignment_submissions`.

Imported by: [apps/web/src/lib/personal-practice.server.ts](../../apps/web/src/lib/personal-practice.server.ts), [apps/web/src/lib/student-progress.server.ts](../../apps/web/src/lib/student-progress.server.ts), [apps/web/src/routes/api.check-answer.ts](../../apps/web/src/routes/api.check-answer.ts).

## lib/learner-profile.ts

Source: [apps/web/src/lib/learner-profile.ts](../../apps/web/src/lib/learner-profile.ts)

Exports: `DEFAULT_PERSONALIZATION_THRESHOLD`, `LearnerObservation`, `LearnerPattern`, `LearnerProfile`, `PATTERN_STATUS_LABEL`, `PatternStatus`, `aggregatePatterns`, `buildLearnerProfile`, `categoryObservationCount`, `profileVersionHash`, `relevantPatterns`.

Imported by: [apps/web/src/lib/learner-profile.server.ts](../../apps/web/src/lib/learner-profile.server.ts), [apps/web/src/lib/personalization.server.ts](../../apps/web/src/lib/personalization.server.ts).

## lib/learning.ts

Source: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts)

Exports: `Assessment`, `ClassSession`, `ClassSessionLinks`, `CollaborativeTask`, `ContextLanguage`, `ContextSectionRecord`, `ContextSectionStatus`, `ContextSuggestionKind`, `ContextSuggestionRecord`, `ContextSuggestionReview`, `Course`, `CourseResource`, `CourseRosterEntry`, `CourseSection`, `Cpmk`, `Enrollment`, `ExtractionStatus`, `FACULTY_DASHBOARD`, `FileAccess`, `FileContextRecord`, `FileExtractionRecord`, `FileLibraryRecord`, `FileProcessingStatus`, `FileVersionRecord`, `Role`, `STUDENT_DASHBOARD`, `SpecialWeekType`, `StructuredItem`, `SubCpmk`, `dashboardForRole`, `dateLabel`, `errorMessage`, `isAbortError`, `isSessionDone`, `sessionProgressPct`.

Imported by: [apps/web/src/components/app/academic-calendar.tsx](../../apps/web/src/components/app/academic-calendar.tsx), [apps/web/src/components/app/agent-task-panel.tsx](../../apps/web/src/components/app/agent-task-panel.tsx), [apps/web/src/components/app/analytics-index.tsx](../../apps/web/src/components/app/analytics-index.tsx), [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/assignment-editor-page.tsx](../../apps/web/src/components/app/assignment-editor-page.tsx), [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/attendance-manager.tsx](../../apps/web/src/components/app/attendance-manager.tsx), [apps/web/src/components/app/course-analytics.tsx](../../apps/web/src/components/app/course-analytics.tsx), [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/course-catalog-card.tsx](../../apps/web/src/components/app/course-catalog-card.tsx), [apps/web/src/components/app/course-dashboard.tsx](../../apps/web/src/components/app/course-dashboard.tsx), [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/course-form.tsx](../../apps/web/src/components/app/course-form.tsx), [apps/web/src/components/app/course-info.tsx](../../apps/web/src/components/app/course-info.tsx), [apps/web/src/components/app/course-rail.tsx](../../apps/web/src/components/app/course-rail.tsx), [apps/web/src/components/app/course-resources.tsx](../../apps/web/src/components/app/course-resources.tsx), [apps/web/src/components/app/course-roster.tsx](../../apps/web/src/components/app/course-roster.tsx), [apps/web/src/components/app/course-sections.tsx](../../apps/web/src/components/app/course-sections.tsx), [apps/web/src/components/app/course-settings.tsx](../../apps/web/src/components/app/course-settings.tsx), [apps/web/src/components/app/course-thumb-dialog.tsx](../../apps/web/src/components/app/course-thumb-dialog.tsx), [apps/web/src/components/app/course-thumb.tsx](../../apps/web/src/components/app/course-thumb.tsx), [apps/web/src/components/app/course-workspace.tsx](../../apps/web/src/components/app/course-workspace.tsx), [apps/web/src/components/app/courses-page.tsx](../../apps/web/src/components/app/courses-page.tsx), [apps/web/src/components/app/difficulty-insights.tsx](../../apps/web/src/components/app/difficulty-insights.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx), [apps/web/src/components/app/feedback-uptake-review.tsx](../../apps/web/src/components/app/feedback-uptake-review.tsx), [apps/web/src/components/app/file-context.tsx](../../apps/web/src/components/app/file-context.tsx), [apps/web/src/components/app/file-library.tsx](../../apps/web/src/components/app/file-library.tsx), [apps/web/src/components/app/file-upload-dialog.tsx](../../apps/web/src/components/app/file-upload-dialog.tsx), [apps/web/src/components/app/file-version-history.tsx](../../apps/web/src/components/app/file-version-history.tsx), [apps/web/src/components/app/global-search.tsx](../../apps/web/src/components/app/global-search.tsx), [apps/web/src/components/app/lecturer-assignment-preview.tsx](../../apps/web/src/components/app/lecturer-assignment-preview.tsx), [apps/web/src/components/app/lecturer-gradebook.tsx](../../apps/web/src/components/app/lecturer-gradebook.tsx), [apps/web/src/components/app/lecturer-recommendations.tsx](../../apps/web/src/components/app/lecturer-recommendations.tsx), [apps/web/src/components/app/penilaian-index.tsx](../../apps/web/src/components/app/penilaian-index.tsx), [apps/web/src/components/app/personal-practice.tsx](../../apps/web/src/components/app/personal-practice.tsx), [apps/web/src/components/app/personalization-analytics.tsx](../../apps/web/src/components/app/personalization-analytics.tsx), [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx), [apps/web/src/components/app/practice-content-autofill.tsx](../../apps/web/src/components/app/practice-content-autofill.tsx), [apps/web/src/components/app/research-analytics.tsx](../../apps/web/src/components/app/research-analytics.tsx), [apps/web/src/components/app/research-export.tsx](../../apps/web/src/components/app/research-export.tsx), [apps/web/src/components/app/resource-form.tsx](../../apps/web/src/components/app/resource-form.tsx), [apps/web/src/components/app/rps-ai-helper.tsx](../../apps/web/src/components/app/rps-ai-helper.tsx), [apps/web/src/components/app/rps-editor-page.tsx](../../apps/web/src/components/app/rps-editor-page.tsx), [apps/web/src/components/app/session-date-autofill.tsx](../../apps/web/src/components/app/session-date-autofill.tsx), [apps/web/src/components/app/session-form.tsx](../../apps/web/src/components/app/session-form.tsx), [apps/web/src/components/app/session-roster.tsx](../../apps/web/src/components/app/session-roster.tsx), [apps/web/src/components/app/settings/account-info-section.tsx](../../apps/web/src/components/app/settings/account-info-section.tsx), [apps/web/src/components/app/settings/language-section.tsx](../../apps/web/src/components/app/settings/language-section.tsx), [apps/web/src/components/app/settings/learner-profile-section.tsx](../../apps/web/src/components/app/settings/learner-profile-section.tsx), [apps/web/src/components/app/settings/profile-section.tsx](../../apps/web/src/components/app/settings/profile-section.tsx), [apps/web/src/components/app/settings/recovery-section.tsx](../../apps/web/src/components/app/settings/recovery-section.tsx), [apps/web/src/components/app/settings/security-section.tsx](../../apps/web/src/components/app/settings/security-section.tsx), [apps/web/src/components/app/settings/usage-section.tsx](../../apps/web/src/components/app/settings/usage-section.tsx), [apps/web/src/components/app/structured-records.tsx](../../apps/web/src/components/app/structured-records.tsx), [apps/web/src/components/app/student-assistant-panel.tsx](../../apps/web/src/components/app/student-assistant-panel.tsx), [apps/web/src/components/app/student-course-overview.tsx](../../apps/web/src/components/app/student-course-overview.tsx), [apps/web/src/components/app/student-courses.tsx](../../apps/web/src/components/app/student-courses.tsx), [apps/web/src/components/app/student-dashboard.tsx](../../apps/web/src/components/app/student-dashboard.tsx), [apps/web/src/components/app/student-grades.tsx](../../apps/web/src/components/app/student-grades.tsx), [apps/web/src/components/app/student-home-adventure.tsx](../../apps/web/src/components/app/student-home-adventure.tsx), [apps/web/src/components/app/student-onboarding.tsx](../../apps/web/src/components/app/student-onboarding.tsx), [apps/web/src/components/app/student-practice.tsx](../../apps/web/src/components/app/student-practice.tsx), [apps/web/src/components/app/student-result-view.tsx](../../apps/web/src/components/app/student-result-view.tsx), [apps/web/src/components/app/student-work-page.tsx](../../apps/web/src/components/app/student-work-page.tsx), [apps/web/src/components/app/submission-task-review.tsx](../../apps/web/src/components/app/submission-task-review.tsx), [apps/web/src/components/app/task-builders/listening-builder.tsx](../../apps/web/src/components/app/task-builders/listening-builder.tsx), [apps/web/src/components/app/task-builders/task-autofill.tsx](../../apps/web/src/components/app/task-builders/task-autofill.tsx), [apps/web/src/components/app/task-workspaces/check-answer-panel.tsx](../../apps/web/src/components/app/task-workspaces/check-answer-panel.tsx), [apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/listening-workspace.tsx](../../apps/web/src/components/app/task-workspaces/listening-workspace.tsx), [apps/web/src/components/app/task-workspaces/quiz-workspace.tsx](../../apps/web/src/components/app/task-workspaces/quiz-workspace.tsx), [apps/web/src/components/app/task-workspaces/reading-workspace.tsx](../../apps/web/src/components/app/task-workspaces/reading-workspace.tsx), [apps/web/src/components/app/task-workspaces/speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/writing-workspace.tsx](../../apps/web/src/components/app/task-workspaces/writing-workspace.tsx), [apps/web/src/components/app/tugas-board.tsx](../../apps/web/src/components/app/tugas-board.tsx), [apps/web/src/components/app/tugas-insights.tsx](../../apps/web/src/components/app/tugas-insights.tsx), [apps/web/src/components/auth/auth-panel.tsx](../../apps/web/src/components/auth/auth-panel.tsx), [apps/web/src/components/auth/login-feature-preview.tsx](../../apps/web/src/components/auth/login-feature-preview.tsx), [apps/web/src/components/site-footer.tsx](../../apps/web/src/components/site-footer.tsx), [apps/web/src/components/site-header.tsx](../../apps/web/src/components/site-header.tsx), [apps/web/src/hooks/use-attendance.ts](../../apps/web/src/hooks/use-attendance.ts), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts), [apps/web/src/hooks/use-course-assignments.ts](../../apps/web/src/hooks/use-course-assignments.ts), [apps/web/src/hooks/use-course-records.ts](../../apps/web/src/hooks/use-course-records.ts), [apps/web/src/hooks/use-course-resources.ts](../../apps/web/src/hooks/use-course-resources.ts), [apps/web/src/hooks/use-course-roster.ts](../../apps/web/src/hooks/use-course-roster.ts), [apps/web/src/hooks/use-course-route.ts](../../apps/web/src/hooks/use-course-route.ts), [apps/web/src/hooks/use-course-sections.ts](../../apps/web/src/hooks/use-course-sections.ts), [apps/web/src/lib/agent-tasks.server.ts](../../apps/web/src/lib/agent-tasks.server.ts), [apps/web/src/lib/assignment-draft.server.ts](../../apps/web/src/lib/assignment-draft.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/assistant/authorization.server.ts](../../apps/web/src/lib/assistant/authorization.server.ts), [apps/web/src/lib/assistant/context.server.ts](../../apps/web/src/lib/assistant/context.server.ts), [apps/web/src/lib/assistant/page-context.server.ts](../../apps/web/src/lib/assistant/page-context.server.ts), [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts), [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts), [apps/web/src/lib/berkas-versions.server.ts](../../apps/web/src/lib/berkas-versions.server.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/context-suggestions-client.ts](../../apps/web/src/lib/context-suggestions-client.ts), [apps/web/src/lib/context-suggestions.server.ts](../../apps/web/src/lib/context-suggestions.server.ts), [apps/web/src/lib/course-analytics.ts](../../apps/web/src/lib/course-analytics.ts), [apps/web/src/lib/course-route.ts](../../apps/web/src/lib/course-route.ts), [apps/web/src/lib/file-library.ts](../../apps/web/src/lib/file-library.ts), [apps/web/src/lib/file-metadata.ts](../../apps/web/src/lib/file-metadata.ts), [apps/web/src/lib/lesson-plans.server.ts](../../apps/web/src/lib/lesson-plans.server.ts), [apps/web/src/lib/personal-practice.server.ts](../../apps/web/src/lib/personal-practice.server.ts), [apps/web/src/lib/resources.ts](../../apps/web/src/lib/resources.ts), [apps/web/src/lib/roster-csv.ts](../../apps/web/src/lib/roster-csv.ts), [apps/web/src/lib/rps-draft.ts](../../apps/web/src/lib/rps-draft.ts), [apps/web/src/lib/rps-validation.ts](../../apps/web/src/lib/rps-validation.ts), [apps/web/src/lib/student-progress.server.ts](../../apps/web/src/lib/student-progress.server.ts), [apps/web/src/lib/task-config-draft.server.ts](../../apps/web/src/lib/task-config-draft.server.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts), [apps/web/src/routes/api.assignment-draft.ts](../../apps/web/src/routes/api.assignment-draft.ts), [apps/web/src/routes/api.berkas-process.ts](../../apps/web/src/routes/api.berkas-process.ts), [apps/web/src/routes/api.berkas-restore.ts](../../apps/web/src/routes/api.berkas-restore.ts), [apps/web/src/routes/api.berkas-snapshot.ts](../../apps/web/src/routes/api.berkas-snapshot.ts), [apps/web/src/routes/api.course-thumbnail.ts](../../apps/web/src/routes/api.course-thumbnail.ts), [apps/web/src/routes/api.feedback-uptake.ts](../../apps/web/src/routes/api.feedback-uptake.ts), [apps/web/src/routes/api.roster-enroll.ts](../../apps/web/src/routes/api.roster-enroll.ts), [apps/web/src/routes/api.roster-language.ts](../../apps/web/src/routes/api.roster-language.ts), [apps/web/src/routes/api.roster-reset-password.ts](../../apps/web/src/routes/api.roster-reset-password.ts), [apps/web/src/routes/api.roster-status.ts](../../apps/web/src/routes/api.roster-status.ts), [apps/web/src/routes/api.rps-assist.ts](../../apps/web/src/routes/api.rps-assist.ts), [apps/web/src/routes/api.student-profile.ts](../../apps/web/src/routes/api.student-profile.ts), [apps/web/src/routes/api.task-config-draft.ts](../../apps/web/src/routes/api.task-config-draft.ts), [apps/web/src/routes/app.asisten.tsx](../../apps/web/src/routes/app.asisten.tsx), [apps/web/src/routes/app.berkas.$fileId.tsx](../../apps/web/src/routes/app.berkas.$fileId.tsx), [apps/web/src/routes/app.berkas.tsx](../../apps/web/src/routes/app.berkas.tsx), [apps/web/src/routes/app.latihan.tsx](../../apps/web/src/routes/app.latihan.tsx), [apps/web/src/routes/app.onboarding.tsx](../../apps/web/src/routes/app.onboarding.tsx), [apps/web/src/routes/app.penilaian.tsx](../../apps/web/src/routes/app.penilaian.tsx), [apps/web/src/routes/app.rps.$courseId.tsx](../../apps/web/src/routes/app.rps.$courseId.tsx), [apps/web/src/routes/app.student.tsx](../../apps/web/src/routes/app.student.tsx), [apps/web/src/routes/app.tsx](../../apps/web/src/routes/app.tsx), [apps/web/src/routes/app.tugas.$assignmentId.pratinjau.tsx](../../apps/web/src/routes/app.tugas.$assignmentId.pratinjau.tsx), [apps/web/src/routes/app.tugas.$assignmentId.tsx](../../apps/web/src/routes/app.tugas.$assignmentId.tsx), [apps/web/src/routes/app.tugas.buat.tsx](../../apps/web/src/routes/app.tugas.buat.tsx), [apps/web/src/routes/app.tugas.insights.tsx](../../apps/web/src/routes/app.tugas.insights.tsx), [apps/web/src/routes/app.tugas.tsx](../../apps/web/src/routes/app.tugas.tsx), [apps/web/src/routes/course.lesson-plan.tsx](../../apps/web/src/routes/course.lesson-plan.tsx), [apps/web/src/routes/course.student-profile.tsx](../../apps/web/src/routes/course.student-profile.tsx).

## lib/lecturer-recommendations.server.ts

Source: [apps/web/src/lib/lecturer-recommendations.server.ts](../../apps/web/src/lib/lecturer-recommendations.server.ts)

Exports: `DraftRecommendation`, `InsightArea`, `InsightSignals`, `draftRecommendations`, `loadInsightSignals`.

Local dependencies: [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/task-assist.server.ts](../../apps/web/src/lib/task-assist.server.ts).

Literal database references: `check_attempts`.

Imported by: [apps/web/src/lib/agent-tasks.server.ts](../../apps/web/src/lib/agent-tasks.server.ts), [apps/web/src/routes/api.recommendations-generate.ts](../../apps/web/src/routes/api.recommendations-generate.ts).

## lib/lesson-plans.server.ts

Source: [apps/web/src/lib/lesson-plans.server.ts](../../apps/web/src/lib/lesson-plans.server.ts)

Exports: `cleanLessonPlan`, `ensureLessonPlan`, `lessonSession`.

Local dependencies: [apps/web/src/lib/agent-tasks.ts](../../apps/web/src/lib/agent-tasks.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/lesson-plans.ts](../../apps/web/src/lib/lesson-plans.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Package imports: `pocketbase`.

Literal database references: `class_sessions`, `courses`.

Imported by: [apps/web/src/lib/agent-tasks.server.ts](../../apps/web/src/lib/agent-tasks.server.ts), [apps/web/src/routes/api.lesson-plans.ts](../../apps/web/src/routes/api.lesson-plans.ts).

## lib/lesson-plans.ts

Source: [apps/web/src/lib/lesson-plans.ts](../../apps/web/src/lib/lesson-plans.ts)

Exports: `SessionLessonPlan`, `emptyLessonPlan`, `lessonPlanLink`.

Local dependencies: [apps/web/src/lib/agent-tasks.ts](../../apps/web/src/lib/agent-tasks.ts).

Imported by: [apps/web/src/components/app/agent-task-panel.tsx](../../apps/web/src/components/app/agent-task-panel.tsx), [apps/web/src/lib/lesson-plans.server.ts](../../apps/web/src/lib/lesson-plans.server.ts), [apps/web/src/routes/course.lesson-plan.tsx](../../apps/web/src/routes/course.lesson-plan.tsx).

## lib/local-cache.ts

Source: [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts)

Exports: `cachedQuery`, `clearAllCache`, `clearUserCache`, `invalidate`, `invalidateCollections`, `invalidateCourseData`, `isCacheFresh`, `peekCache`, `subscribeCache`.

Local dependencies: [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/course-form.tsx](../../apps/web/src/components/app/course-form.tsx), [apps/web/src/components/app/course-resources.tsx](../../apps/web/src/components/app/course-resources.tsx), [apps/web/src/components/app/course-roster.tsx](../../apps/web/src/components/app/course-roster.tsx), [apps/web/src/components/app/course-sections.tsx](../../apps/web/src/components/app/course-sections.tsx), [apps/web/src/components/app/course-thumb-dialog.tsx](../../apps/web/src/components/app/course-thumb-dialog.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx), [apps/web/src/components/app/file-context.tsx](../../apps/web/src/components/app/file-context.tsx), [apps/web/src/components/app/file-library.tsx](../../apps/web/src/components/app/file-library.tsx), [apps/web/src/components/app/file-upload-dialog.tsx](../../apps/web/src/components/app/file-upload-dialog.tsx), [apps/web/src/components/app/lecturer-gradebook.tsx](../../apps/web/src/components/app/lecturer-gradebook.tsx), [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx), [apps/web/src/components/app/resource-form.tsx](../../apps/web/src/components/app/resource-form.tsx), [apps/web/src/components/app/rps-ai-helper.tsx](../../apps/web/src/components/app/rps-ai-helper.tsx), [apps/web/src/components/app/rps-editor-page.tsx](../../apps/web/src/components/app/rps-editor-page.tsx), [apps/web/src/components/app/session-date-autofill.tsx](../../apps/web/src/components/app/session-date-autofill.tsx), [apps/web/src/components/app/session-form.tsx](../../apps/web/src/components/app/session-form.tsx), [apps/web/src/components/app/session-roster.tsx](../../apps/web/src/components/app/session-roster.tsx), [apps/web/src/components/app/structured-records.tsx](../../apps/web/src/components/app/structured-records.tsx), [apps/web/src/components/app/submission-task-review.tsx](../../apps/web/src/components/app/submission-task-review.tsx), [apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/listening-workspace.tsx](../../apps/web/src/components/app/task-workspaces/listening-workspace.tsx), [apps/web/src/components/app/task-workspaces/quiz-workspace.tsx](../../apps/web/src/components/app/task-workspaces/quiz-workspace.tsx), [apps/web/src/components/app/task-workspaces/speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/writing-workspace.tsx](../../apps/web/src/components/app/task-workspaces/writing-workspace.tsx), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/hooks/use-cached-query.ts](../../apps/web/src/hooks/use-cached-query.ts).

## lib/logger.server.ts

Source: [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts)

Imported by: [apps/web/src/lib/ai-evaluation.server.ts](../../apps/web/src/lib/ai-evaluation.server.ts), [apps/web/src/lib/ai-usage.server.ts](../../apps/web/src/lib/ai-usage.server.ts), [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignment-draft.server.ts](../../apps/web/src/lib/assignment-draft.server.ts), [apps/web/src/lib/assistant/attachments.server.ts](../../apps/web/src/lib/assistant/attachments.server.ts), [apps/web/src/lib/assistant/audit.server.ts](../../apps/web/src/lib/assistant/audit.server.ts), [apps/web/src/lib/assistant/logging.server.ts](../../apps/web/src/lib/assistant/logging.server.ts), [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/course-thumbnail.server.ts](../../apps/web/src/lib/course-thumbnail.server.ts), [apps/web/src/lib/feedback.server.ts](../../apps/web/src/lib/feedback.server.ts), [apps/web/src/lib/integrated-ai.server.ts](../../apps/web/src/lib/integrated-ai.server.ts), [apps/web/src/lib/lecturer-recommendations.server.ts](../../apps/web/src/lib/lecturer-recommendations.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/rps-ai-extract.server.ts](../../apps/web/src/lib/rps-ai-extract.server.ts), [apps/web/src/lib/rps-assist.server.ts](../../apps/web/src/lib/rps-assist.server.ts), [apps/web/src/lib/rps-pdf-import.server.ts](../../apps/web/src/lib/rps-pdf-import.server.ts), [apps/web/src/lib/rubric-suggestions.server.ts](../../apps/web/src/lib/rubric-suggestions.server.ts), [apps/web/src/lib/student-assistant-tools.server.ts](../../apps/web/src/lib/student-assistant-tools.server.ts), [apps/web/src/lib/task-assist.server.ts](../../apps/web/src/lib/task-assist.server.ts), [apps/web/src/lib/task-config-draft.server.ts](../../apps/web/src/lib/task-config-draft.server.ts), [apps/web/src/lib/transcription.server.ts](../../apps/web/src/lib/transcription.server.ts), [apps/web/src/routes/api.berkas-parse.ts](../../apps/web/src/routes/api.berkas-parse.ts), [apps/web/src/routes/api.berkas-process.ts](../../apps/web/src/routes/api.berkas-process.ts), [apps/web/src/routes/api.berkas-restore.ts](../../apps/web/src/routes/api.berkas-restore.ts), [apps/web/src/routes/api.berkas-snapshot.ts](../../apps/web/src/routes/api.berkas-snapshot.ts), [apps/web/src/routes/api.check-answer.ts](../../apps/web/src/routes/api.check-answer.ts).

## lib/personal-practice.server.ts

Source: [apps/web/src/lib/personal-practice.server.ts](../../apps/web/src/lib/personal-practice.server.ts)

Exports: `answerPractice`, `checkPracticeLesson`, `practiceContext`, `practiceError`, `practiceLesson`, `publicRound`, `readRound`, `reportPractice`, `startPractice`.

Local dependencies: [apps/web/src/lib/ai-usage.server.ts](../../apps/web/src/lib/ai-usage.server.ts), [apps/web/src/lib/cefr-level.ts](../../apps/web/src/lib/cefr-level.ts), [apps/web/src/lib/feedback.server.ts](../../apps/web/src/lib/feedback.server.ts), [apps/web/src/lib/hostinger-model.server.ts](../../apps/web/src/lib/hostinger-model.server.ts), [apps/web/src/lib/learner-profile.server.ts](../../apps/web/src/lib/learner-profile.server.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/personal-practice.ts](../../apps/web/src/lib/personal-practice.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/student-progress.server.ts](../../apps/web/src/lib/student-progress.server.ts), [apps/web/src/lib/student-progress.ts](../../apps/web/src/lib/student-progress.ts).

Package imports: `pocketbase`.

Literal database references: `assignment_submissions`, `attendance`, `class_sessions`, `courses`, `enrollments`, `file_library`, `personal_practice_attempts`, `personal_practice_interactions`, `personal_practice_reports`, `personal_practice_rounds`.

Imported by: [apps/web/src/lib/agent-tasks.server.ts](../../apps/web/src/lib/agent-tasks.server.ts), [apps/web/src/routes/api.conversation-practice.ts](../../apps/web/src/routes/api.conversation-practice.ts), [apps/web/src/routes/api.personal-practice.ts](../../apps/web/src/routes/api.personal-practice.ts).

## lib/personal-practice.ts

Source: [apps/web/src/lib/personal-practice.ts](../../apps/web/src/lib/personal-practice.ts)

Exports: `PersonalQuestion`, `PracticeLesson`, `PracticeReadiness`, `PracticeResult`, `PracticeRound`, `PracticeSource`.

Local dependencies: [apps/web/src/lib/student-progress.ts](../../apps/web/src/lib/student-progress.ts).

Imported by: [apps/web/src/components/app/personal-practice.tsx](../../apps/web/src/components/app/personal-practice.tsx), [apps/web/src/components/app/student-home-adventure.tsx](../../apps/web/src/components/app/student-home-adventure.tsx), [apps/web/src/lib/personal-practice.server.ts](../../apps/web/src/lib/personal-practice.server.ts), [apps/web/src/lib/student-progress.server.ts](../../apps/web/src/lib/student-progress.server.ts).

## lib/personalization-analytics.server.ts

Source: [apps/web/src/lib/personalization-analytics.server.ts](../../apps/web/src/lib/personalization-analytics.server.ts)

Exports: `PersonalizationAnalyticsData`, `loadPersonalizationAnalytics`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/cefr-level.ts](../../apps/web/src/lib/cefr-level.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/personalization-analytics.ts](../../apps/web/src/lib/personalization-analytics.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/research-export.server.ts](../../apps/web/src/lib/research-export.server.ts).

Literal database references: `assignment_submissions`, `assignments`, `courses`.

Imported by: [apps/web/src/routes/api.personalization-analytics.ts](../../apps/web/src/routes/api.personalization-analytics.ts).

## lib/personalization-analytics.ts

Source: [apps/web/src/lib/personalization-analytics.ts](../../apps/web/src/lib/personalization-analytics.ts)

Exports: `CategoryTrajectories`, `CategoryTrajectory`, `ComparisonBreakdownRow`, `ComparisonFilters`, `FeedbackMode`, `HINT_LEVELS`, `InteractionRecord`, `MIN_COMPARISON`, `ModeStats`, `PersonalizationComparison`, `TrajectoryPoint`, `ValidatedObservation`, `applyFilters`, `computeCategoryTrajectories`, `computeModeStats`, `computePersonalizationComparison`, `matchesFilters`.

Local dependencies: [apps/web/src/lib/research-analytics.ts](../../apps/web/src/lib/research-analytics.ts).

Imported by: [apps/web/src/components/app/personalization-analytics.tsx](../../apps/web/src/components/app/personalization-analytics.tsx), [apps/web/src/lib/personalization-analytics.server.ts](../../apps/web/src/lib/personalization-analytics.server.ts).

## lib/personalization.server.ts

Source: [apps/web/src/lib/personalization.server.ts](../../apps/web/src/lib/personalization.server.ts)

Exports: `FeedbackStrategy`, `PersonalizationDecision`, `PracticeSuggestion`, `STRATEGY_LABEL`, `buildPersonalizationContext`, `selectStrategy`, `suggestPractice`, `summarizeDecision`.

Local dependencies: [apps/web/src/lib/learner-profile.ts](../../apps/web/src/lib/learner-profile.ts).

Imported by: [apps/web/src/routes/api.check-answer.ts](../../apps/web/src/routes/api.check-answer.ts).

## lib/pocketbase-client.server.ts

Source: [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts)

Exports: `RecordListResult`, `pocketbaseAdmin`.

Local dependencies: [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts).

Package imports: `pocketbase`.

Imported by: [apps/web/src/lib/agent-tasks.server.ts](../../apps/web/src/lib/agent-tasks.server.ts), [apps/web/src/lib/ai-evaluation.server.ts](../../apps/web/src/lib/ai-evaluation.server.ts), [apps/web/src/lib/ai-usage.server.ts](../../apps/web/src/lib/ai-usage.server.ts), [apps/web/src/lib/assistant/attachments.server.ts](../../apps/web/src/lib/assistant/attachments.server.ts), [apps/web/src/lib/assistant/runtime.server.ts](../../apps/web/src/lib/assistant/runtime.server.ts), [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts), [apps/web/src/lib/berkas-versions.server.ts](../../apps/web/src/lib/berkas-versions.server.ts), [apps/web/src/lib/bulk-paper.server.ts](../../apps/web/src/lib/bulk-paper.server.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/context-suggestions.server.ts](../../apps/web/src/lib/context-suggestions.server.ts), [apps/web/src/lib/evaluation-annotation.server.ts](../../apps/web/src/lib/evaluation-annotation.server.ts), [apps/web/src/lib/evaluation-review.server.ts](../../apps/web/src/lib/evaluation-review.server.ts), [apps/web/src/lib/feedback-uptake.server.ts](../../apps/web/src/lib/feedback-uptake.server.ts), [apps/web/src/lib/integrated-ai.server.ts](../../apps/web/src/lib/integrated-ai.server.ts), [apps/web/src/lib/learner-profile.server.ts](../../apps/web/src/lib/learner-profile.server.ts), [apps/web/src/lib/lecturer-recommendations.server.ts](../../apps/web/src/lib/lecturer-recommendations.server.ts), [apps/web/src/lib/lesson-plans.server.ts](../../apps/web/src/lib/lesson-plans.server.ts), [apps/web/src/lib/personal-practice.server.ts](../../apps/web/src/lib/personal-practice.server.ts), [apps/web/src/lib/personalization-analytics.server.ts](../../apps/web/src/lib/personalization-analytics.server.ts), [apps/web/src/lib/public-drafts.server.ts](../../apps/web/src/lib/public-drafts.server.ts), [apps/web/src/lib/public-linking.server.ts](../../apps/web/src/lib/public-linking.server.ts), [apps/web/src/lib/research-analytics.server.ts](../../apps/web/src/lib/research-analytics.server.ts), [apps/web/src/lib/research-export.server.ts](../../apps/web/src/lib/research-export.server.ts), [apps/web/src/lib/research-target.server.ts](../../apps/web/src/lib/research-target.server.ts), [apps/web/src/lib/roster-audit.server.ts](../../apps/web/src/lib/roster-audit.server.ts), [apps/web/src/lib/student-progress.server.ts](../../apps/web/src/lib/student-progress.server.ts), [apps/web/src/lib/transcription.server.ts](../../apps/web/src/lib/transcription.server.ts), [apps/web/src/routes/api.berkas-process.ts](../../apps/web/src/routes/api.berkas-process.ts), [apps/web/src/routes/api.berkas-restore.ts](../../apps/web/src/routes/api.berkas-restore.ts), [apps/web/src/routes/api.berkas-snapshot.ts](../../apps/web/src/routes/api.berkas-snapshot.ts), [apps/web/src/routes/api.bulk-paper-extract.ts](../../apps/web/src/routes/api.bulk-paper-extract.ts), [apps/web/src/routes/api.bulk-paper-prepare.ts](../../apps/web/src/routes/api.bulk-paper-prepare.ts), [apps/web/src/routes/api.bulk-paper-submit.ts](../../apps/web/src/routes/api.bulk-paper-submit.ts), [apps/web/src/routes/api.check-answer.ts](../../apps/web/src/routes/api.check-answer.ts), [apps/web/src/routes/api.context-insights.ts](../../apps/web/src/routes/api.context-insights.ts), [apps/web/src/routes/api.context-material.ts](../../apps/web/src/routes/api.context-material.ts), [apps/web/src/routes/api.conversation-practice.ts](../../apps/web/src/routes/api.conversation-practice.ts), [apps/web/src/routes/api.course-grade-summary.ts](../../apps/web/src/routes/api.course-grade-summary.ts), [apps/web/src/routes/api.evaluation-draft.ts](../../apps/web/src/routes/api.evaluation-draft.ts), [apps/web/src/routes/api.evaluation-participants.ts](../../apps/web/src/routes/api.evaluation-participants.ts), [apps/web/src/routes/api.evaluation-publish.ts](../../apps/web/src/routes/api.evaluation-publish.ts), [apps/web/src/routes/api.evaluation-result.ts](../../apps/web/src/routes/api.evaluation-result.ts), [apps/web/src/routes/api.evaluation-review.ts](../../apps/web/src/routes/api.evaluation-review.ts), [apps/web/src/routes/api.feedback.ts](../../apps/web/src/routes/api.feedback.ts), [apps/web/src/routes/api.lesson-plans.ts](../../apps/web/src/routes/api.lesson-plans.ts), [apps/web/src/routes/api.recommendations-generate.ts](../../apps/web/src/routes/api.recommendations-generate.ts), [apps/web/src/routes/api.recommendations-review.ts](../../apps/web/src/routes/api.recommendations-review.ts), [apps/web/src/routes/api.recovery-email-request-reset.ts](../../apps/web/src/routes/api.recovery-email-request-reset.ts), [apps/web/src/routes/api.recovery-email-request.ts](../../apps/web/src/routes/api.recovery-email-request.ts), [apps/web/src/routes/api.recovery-email-reset-password.ts](../../apps/web/src/routes/api.recovery-email-reset-password.ts), [apps/web/src/routes/api.recovery-email-verify.ts](../../apps/web/src/routes/api.recovery-email-verify.ts), [apps/web/src/routes/api.roster-enroll.ts](../../apps/web/src/routes/api.roster-enroll.ts), [apps/web/src/routes/api.roster-language.ts](../../apps/web/src/routes/api.roster-language.ts), [apps/web/src/routes/api.roster-reset-password.ts](../../apps/web/src/routes/api.roster-reset-password.ts), [apps/web/src/routes/api.roster-status.ts](../../apps/web/src/routes/api.roster-status.ts), [apps/web/src/routes/api.student-password.ts](../../apps/web/src/routes/api.student-password.ts), [apps/web/src/routes/api.student-profile.ts](../../apps/web/src/routes/api.student-profile.ts), [apps/web/src/routes/api.task-submit.ts](../../apps/web/src/routes/api.task-submit.ts), [apps/web/src/routes/api.transcribe.ts](../../apps/web/src/routes/api.transcribe.ts).

## lib/pocketbase-client.ts

Source: [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts)

Package imports: `pocketbase`.

Imported by: [apps/web/src/api/integrated-ai-api.ts](../../apps/web/src/api/integrated-ai-api.ts), [apps/web/src/components/app/academic-calendar.tsx](../../apps/web/src/components/app/academic-calendar.tsx), [apps/web/src/components/app/agent-task-panel.tsx](../../apps/web/src/components/app/agent-task-panel.tsx), [apps/web/src/components/app/ai-evaluation-review.tsx](../../apps/web/src/components/app/ai-evaluation-review.tsx), [apps/web/src/components/app/analytics-index.tsx](../../apps/web/src/components/app/analytics-index.tsx), [apps/web/src/components/app/assignment-editor-page.tsx](../../apps/web/src/components/app/assignment-editor-page.tsx), [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/assistant-panel.tsx](../../apps/web/src/components/app/assistant-panel.tsx), [apps/web/src/components/app/bulk-paper-input.tsx](../../apps/web/src/components/app/bulk-paper-input.tsx), [apps/web/src/components/app/check-history.tsx](../../apps/web/src/components/app/check-history.tsx), [apps/web/src/components/app/conversation-practice.tsx](../../apps/web/src/components/app/conversation-practice.tsx), [apps/web/src/components/app/course-analytics.tsx](../../apps/web/src/components/app/course-analytics.tsx), [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/course-dashboard.tsx](../../apps/web/src/components/app/course-dashboard.tsx), [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/course-form.tsx](../../apps/web/src/components/app/course-form.tsx), [apps/web/src/components/app/course-info.tsx](../../apps/web/src/components/app/course-info.tsx), [apps/web/src/components/app/course-rail.tsx](../../apps/web/src/components/app/course-rail.tsx), [apps/web/src/components/app/course-resources.tsx](../../apps/web/src/components/app/course-resources.tsx), [apps/web/src/components/app/course-roster.tsx](../../apps/web/src/components/app/course-roster.tsx), [apps/web/src/components/app/course-sections.tsx](../../apps/web/src/components/app/course-sections.tsx), [apps/web/src/components/app/course-thumb-dialog.tsx](../../apps/web/src/components/app/course-thumb-dialog.tsx), [apps/web/src/components/app/course-workspace.tsx](../../apps/web/src/components/app/course-workspace.tsx), [apps/web/src/components/app/courses-page.tsx](../../apps/web/src/components/app/courses-page.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx), [apps/web/src/components/app/feedback-uptake-review.tsx](../../apps/web/src/components/app/feedback-uptake-review.tsx), [apps/web/src/components/app/file-context.tsx](../../apps/web/src/components/app/file-context.tsx), [apps/web/src/components/app/file-library.tsx](../../apps/web/src/components/app/file-library.tsx), [apps/web/src/components/app/file-upload-dialog.tsx](../../apps/web/src/components/app/file-upload-dialog.tsx), [apps/web/src/components/app/file-version-history.tsx](../../apps/web/src/components/app/file-version-history.tsx), [apps/web/src/components/app/formative-evaluation-review.tsx](../../apps/web/src/components/app/formative-evaluation-review.tsx), [apps/web/src/components/app/global-search.tsx](../../apps/web/src/components/app/global-search.tsx), [apps/web/src/components/app/lecturer-assignment-preview.tsx](../../apps/web/src/components/app/lecturer-assignment-preview.tsx), [apps/web/src/components/app/lecturer-gradebook.tsx](../../apps/web/src/components/app/lecturer-gradebook.tsx), [apps/web/src/components/app/lecturer-recommendations.tsx](../../apps/web/src/components/app/lecturer-recommendations.tsx), [apps/web/src/components/app/penilaian-index.tsx](../../apps/web/src/components/app/penilaian-index.tsx), [apps/web/src/components/app/personal-practice.tsx](../../apps/web/src/components/app/personal-practice.tsx), [apps/web/src/components/app/personalization-analytics.tsx](../../apps/web/src/components/app/personalization-analytics.tsx), [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx), [apps/web/src/components/app/practice-content-autofill.tsx](../../apps/web/src/components/app/practice-content-autofill.tsx), [apps/web/src/components/app/research-analytics.tsx](../../apps/web/src/components/app/research-analytics.tsx), [apps/web/src/components/app/research-export.tsx](../../apps/web/src/components/app/research-export.tsx), [apps/web/src/components/app/resource-form.tsx](../../apps/web/src/components/app/resource-form.tsx), [apps/web/src/components/app/rps-ai-helper.tsx](../../apps/web/src/components/app/rps-ai-helper.tsx), [apps/web/src/components/app/rps-editor-page.tsx](../../apps/web/src/components/app/rps-editor-page.tsx), [apps/web/src/components/app/session-date-autofill.tsx](../../apps/web/src/components/app/session-date-autofill.tsx), [apps/web/src/components/app/session-form.tsx](../../apps/web/src/components/app/session-form.tsx), [apps/web/src/components/app/session-roster.tsx](../../apps/web/src/components/app/session-roster.tsx), [apps/web/src/components/app/settings/language-section.tsx](../../apps/web/src/components/app/settings/language-section.tsx), [apps/web/src/components/app/settings/learner-profile-section.tsx](../../apps/web/src/components/app/settings/learner-profile-section.tsx), [apps/web/src/components/app/settings/profile-section.tsx](../../apps/web/src/components/app/settings/profile-section.tsx), [apps/web/src/components/app/settings/recovery-section.tsx](../../apps/web/src/components/app/settings/recovery-section.tsx), [apps/web/src/components/app/settings/security-section.tsx](../../apps/web/src/components/app/settings/security-section.tsx), [apps/web/src/components/app/settings/usage-section.tsx](../../apps/web/src/components/app/settings/usage-section.tsx), [apps/web/src/components/app/structured-records.tsx](../../apps/web/src/components/app/structured-records.tsx), [apps/web/src/components/app/student-assistant-panel.tsx](../../apps/web/src/components/app/student-assistant-panel.tsx), [apps/web/src/components/app/student-course-overview.tsx](../../apps/web/src/components/app/student-course-overview.tsx), [apps/web/src/components/app/student-courses.tsx](../../apps/web/src/components/app/student-courses.tsx), [apps/web/src/components/app/student-dashboard.tsx](../../apps/web/src/components/app/student-dashboard.tsx), [apps/web/src/components/app/student-grades.tsx](../../apps/web/src/components/app/student-grades.tsx), [apps/web/src/components/app/student-home-adventure.tsx](../../apps/web/src/components/app/student-home-adventure.tsx), [apps/web/src/components/app/student-onboarding.tsx](../../apps/web/src/components/app/student-onboarding.tsx), [apps/web/src/components/app/student-practice.tsx](../../apps/web/src/components/app/student-practice.tsx), [apps/web/src/components/app/student-published-feedback.tsx](../../apps/web/src/components/app/student-published-feedback.tsx), [apps/web/src/components/app/student-result-view.tsx](../../apps/web/src/components/app/student-result-view.tsx), [apps/web/src/components/app/student-work-page.tsx](../../apps/web/src/components/app/student-work-page.tsx), [apps/web/src/components/app/submission-task-review.tsx](../../apps/web/src/components/app/submission-task-review.tsx), [apps/web/src/components/app/task-builders/task-autofill.tsx](../../apps/web/src/components/app/task-builders/task-autofill.tsx), [apps/web/src/components/app/task-workspaces/check-answer-panel.tsx](../../apps/web/src/components/app/task-workspaces/check-answer-panel.tsx), [apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/listening-workspace.tsx](../../apps/web/src/components/app/task-workspaces/listening-workspace.tsx), [apps/web/src/components/app/task-workspaces/quiz-workspace.tsx](../../apps/web/src/components/app/task-workspaces/quiz-workspace.tsx), [apps/web/src/components/app/task-workspaces/reading-workspace.tsx](../../apps/web/src/components/app/task-workspaces/reading-workspace.tsx), [apps/web/src/components/app/task-workspaces/speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/transcript-panel.tsx](../../apps/web/src/components/app/task-workspaces/transcript-panel.tsx), [apps/web/src/components/app/task-workspaces/writing-workspace.tsx](../../apps/web/src/components/app/task-workspaces/writing-workspace.tsx), [apps/web/src/components/app/tugas-board.tsx](../../apps/web/src/components/app/tugas-board.tsx), [apps/web/src/components/app/tugas-insights.tsx](../../apps/web/src/components/app/tugas-insights.tsx), [apps/web/src/components/auth/auth-panel.tsx](../../apps/web/src/components/auth/auth-panel.tsx), [apps/web/src/hooks/use-attendance.ts](../../apps/web/src/hooks/use-attendance.ts), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/hooks/use-course-assignments.ts](../../apps/web/src/hooks/use-course-assignments.ts), [apps/web/src/hooks/use-course-records.ts](../../apps/web/src/hooks/use-course-records.ts), [apps/web/src/hooks/use-course-resources.ts](../../apps/web/src/hooks/use-course-resources.ts), [apps/web/src/hooks/use-course-roster.ts](../../apps/web/src/hooks/use-course-roster.ts), [apps/web/src/hooks/use-course-sections.ts](../../apps/web/src/hooks/use-course-sections.ts), [apps/web/src/lib/ai-evaluation.ts](../../apps/web/src/lib/ai-evaluation.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/context-suggestions-client.ts](../../apps/web/src/lib/context-suggestions-client.ts), [apps/web/src/lib/course-route.ts](../../apps/web/src/lib/course-route.ts), [apps/web/src/lib/course-thumb.ts](../../apps/web/src/lib/course-thumb.ts), [apps/web/src/lib/difficulty-data.ts](../../apps/web/src/lib/difficulty-data.ts), [apps/web/src/lib/file-library.ts](../../apps/web/src/lib/file-library.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/local-cache.ts](../../apps/web/src/lib/local-cache.ts), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/resources.ts](../../apps/web/src/lib/resources.ts), [apps/web/src/lib/transcription.ts](../../apps/web/src/lib/transcription.ts), [apps/web/src/root.tsx](../../apps/web/src/root.tsx), [apps/web/src/routes/app.courses.tsx](../../apps/web/src/routes/app.courses.tsx), [apps/web/src/routes/course.lesson-plan.tsx](../../apps/web/src/routes/course.lesson-plan.tsx), [apps/web/src/routes/course.student-profile.tsx](../../apps/web/src/routes/course.student-profile.tsx), [apps/web/src/routes/course.tsx](../../apps/web/src/routes/course.tsx), [apps/web/src/routes/tugas.$token.tsx](../../apps/web/src/routes/tugas.$token.tsx).

## lib/practice-assist.server.ts

Source: [apps/web/src/lib/practice-assist.server.ts](../../apps/web/src/lib/practice-assist.server.ts)

Exports: `PracticeAssist`, `PracticeCitation`, `buildPracticeAssist`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/feedback.server.ts](../../apps/web/src/lib/feedback.server.ts), [apps/web/src/lib/task-assist.server.ts](../../apps/web/src/lib/task-assist.server.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Imported by: [apps/web/src/routes/api.practice-assist.ts](../../apps/web/src/routes/api.practice-assist.ts), [apps/web/src/routes/api.practice-speaking.ts](../../apps/web/src/routes/api.practice-speaking.ts).

## lib/public-drafts.server.ts

Source: [apps/web/src/lib/public-drafts.server.ts](../../apps/web/src/lib/public-drafts.server.ts)

Exports: `PublicSubmissionRow`, `continuationMatches`, `countSubmittedPublic`, `findPublicAssignment`, `findPublicRow`, `publicFileUrl`, `randomContinuationCode`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `assignments`, `public_submissions`.

Imported by: [apps/web/src/lib/public-linking.server.ts](../../apps/web/src/lib/public-linking.server.ts), [apps/web/src/routes/api.check-answer.ts](../../apps/web/src/routes/api.check-answer.ts), [apps/web/src/routes/api.context-check.ts](../../apps/web/src/routes/api.context-check.ts).

## lib/public-linking.server.ts

Source: [apps/web/src/lib/public-linking.server.ts](../../apps/web/src/lib/public-linking.server.ts)

Exports: `LinkOutcome`, `LinkResult`, `LinkSummary`, `linkPublicAnswersForAssignment`, `linkPublicAnswersForCourse`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/public-drafts.server.ts](../../apps/web/src/lib/public-drafts.server.ts).

Literal database references: `assignment_submissions`, `assignments`, `enrollments`, `public_submissions`, `users`.

Imported by: [apps/web/src/routes/api.roster-enroll.ts](../../apps/web/src/routes/api.roster-enroll.ts).

## lib/rate-limit.server.ts

Source: [apps/web/src/lib/rate-limit.server.ts](../../apps/web/src/lib/rate-limit.server.ts)

Exports: `RateLimitVerdict`, `clientIdentifier`, `consumeRateLimit`, `createRateLimiter`, `rateLimitHeaders`.

Package imports: `ipaddr.js`, `rate-limiter-flexible`.

Imported by: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/integrated-ai.server.ts](../../apps/web/src/lib/integrated-ai.server.ts), [apps/web/src/routes/api.agent-tasks.ts](../../apps/web/src/routes/api.agent-tasks.ts), [apps/web/src/routes/api.conversation-practice.ts](../../apps/web/src/routes/api.conversation-practice.ts), [apps/web/src/routes/api.personal-practice.ts](../../apps/web/src/routes/api.personal-practice.ts), [apps/web/src/routes/api.practice-assist.ts](../../apps/web/src/routes/api.practice-assist.ts), [apps/web/src/routes/api.practice-speaking.ts](../../apps/web/src/routes/api.practice-speaking.ts).

## lib/require-auth.ts

Source: [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts)

Exports: `HydrateFallback`, `clientLoader`, `requireAuth`.

Local dependencies: [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `react-router`.

Imported by: [apps/web/src/routes/analytics.tsx](../../apps/web/src/routes/analytics.tsx), [apps/web/src/routes/app.asisten.tsx](../../apps/web/src/routes/app.asisten.tsx), [apps/web/src/routes/app.berkas.$fileId.tsx](../../apps/web/src/routes/app.berkas.$fileId.tsx), [apps/web/src/routes/app.berkas.tsx](../../apps/web/src/routes/app.berkas.tsx), [apps/web/src/routes/app.coming.$slug.tsx](../../apps/web/src/routes/app.coming.$slug.tsx), [apps/web/src/routes/app.courses.tsx](../../apps/web/src/routes/app.courses.tsx), [apps/web/src/routes/app.kerja.$assignmentId.tsx](../../apps/web/src/routes/app.kerja.$assignmentId.tsx), [apps/web/src/routes/app.latihan.tsx](../../apps/web/src/routes/app.latihan.tsx), [apps/web/src/routes/app.onboarding.tsx](../../apps/web/src/routes/app.onboarding.tsx), [apps/web/src/routes/app.pengaturan.tsx](../../apps/web/src/routes/app.pengaturan.tsx), [apps/web/src/routes/app.penilaian.tsx](../../apps/web/src/routes/app.penilaian.tsx), [apps/web/src/routes/app.riset.tsx](../../apps/web/src/routes/app.riset.tsx), [apps/web/src/routes/app.rps.$courseId.tsx](../../apps/web/src/routes/app.rps.$courseId.tsx), [apps/web/src/routes/app.student.tsx](../../apps/web/src/routes/app.student.tsx), [apps/web/src/routes/app.tsx](../../apps/web/src/routes/app.tsx), [apps/web/src/routes/app.tugas.$assignmentId.pratinjau.tsx](../../apps/web/src/routes/app.tugas.$assignmentId.pratinjau.tsx), [apps/web/src/routes/app.tugas.$assignmentId.tsx](../../apps/web/src/routes/app.tugas.$assignmentId.tsx), [apps/web/src/routes/app.tugas.buat.tsx](../../apps/web/src/routes/app.tugas.buat.tsx), [apps/web/src/routes/app.tugas.insights.tsx](../../apps/web/src/routes/app.tugas.insights.tsx), [apps/web/src/routes/app.tugas.tsx](../../apps/web/src/routes/app.tugas.tsx), [apps/web/src/routes/course.tsx](../../apps/web/src/routes/course.tsx), [apps/web/src/routes/kalender.tsx](../../apps/web/src/routes/kalender.tsx).

## lib/research-analytics.server.ts

Source: [apps/web/src/lib/research-analytics.server.ts](../../apps/web/src/lib/research-analytics.server.ts)

Exports: `AnalyticsError`, `AnalyticsInput`, `computeResearchAnalytics`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/cefr-level.ts](../../apps/web/src/lib/cefr-level.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/research-analytics.ts](../../apps/web/src/lib/research-analytics.ts), [apps/web/src/lib/research-export.server.ts](../../apps/web/src/lib/research-export.server.ts).

Literal database references: `ai_evaluations`, `ai_feedback_items`, `assignments`, `courses`.

Imported by: [apps/web/src/routes/api.research-analytics.ts](../../apps/web/src/routes/api.research-analytics.ts).

## lib/research-analytics.ts

Source: [apps/web/src/lib/research-analytics.ts](../../apps/web/src/lib/research-analytics.ts)

Exports: `AlignmentAwareDetection`, `AlignmentLink`, `AlignmentRationale`, `AnalyticsError`, `AnalyticsItem`, `BreakdownRow`, `DatasetAgreementSummary`, `DetectionMetrics`, `JudgmentAccuracy`, `MIN_ANNOTATED`, `MetricEligibility`, `Rate`, `ResearchAnalytics`, `SliceStats`, `accuracy`, `alignErrors`, `assertResearchAccess`, `attachProvenanceToItems`, `breakdown`, `computeAlignmentAwareDetection`, `computeSliceStats`, `countDistinctReferenceErrors`, `goldStandardJudgment`, `isGoldStandard`, `normalizeRaterJudgments`, `rate`, `sameScope`, `summarizeDatasetAgreement`.

Local dependencies: [apps/web/src/lib/research-rater.ts](../../apps/web/src/lib/research-rater.ts).

Imported by: [apps/web/src/components/app/research-analytics.tsx](../../apps/web/src/components/app/research-analytics.tsx), [apps/web/src/lib/personalization-analytics.ts](../../apps/web/src/lib/personalization-analytics.ts), [apps/web/src/lib/research-analytics.server.ts](../../apps/web/src/lib/research-analytics.server.ts).

## lib/research-annotation.ts

Source: [apps/web/src/lib/research-annotation.ts](../../apps/web/src/lib/research-annotation.ts)

Exports: `ADJUDICATION_STATUS_LABEL`, `AdjudicationStatus`, `COMPLETENESS_JUDGMENT_LABEL`, `COMPLETENESS_JUDGMENT_OPTIONS`, `CORRECTION_JUDGMENT_LABEL`, `CORRECTION_JUDGMENT_OPTIONS`, `CompletenessJudgment`, `CorrectionJudgment`, `DETECTION_JUDGMENT_LABEL`, `DETECTION_JUDGMENT_OPTIONS`, `DetectionJudgment`, `EMPTY_ANNOTATION`, `EMPTY_MISSED_ERROR_DRAFT`, `ERROR_PRESENT_LABEL`, `ERROR_PRESENT_OPTIONS`, `EXPLANATION_JUDGMENT_LABEL`, `EXPLANATION_JUDGMENT_OPTIONS`, `ErrorPresent`, `ExplanationJudgment`, `HumanMissedError`, `MissedErrorDraft`, `NECESSITY_JUDGMENT_LABEL`, `NECESSITY_JUDGMENT_OPTIONS`, `NecessityJudgment`, `PEDAGOGICAL_JUDGMENT_LABEL`, `PEDAGOGICAL_JUDGMENT_OPTIONS`, `PedagogicalJudgment`, `REFERENCE_CATEGORIES`, `REFERENCE_SEVERITY_LABEL`, `REFERENCE_SEVERITY_OPTIONS`, `ReferenceSeverity`, `ResearchAnnotation`, `annotationIsStarted`, `findSourceFindingByFingerprint`, `findingFingerprint`, `missedErrorIsStarted`, `parseHumanMissedError`, `referenceSubcategories`.

Local dependencies: [apps/web/src/lib/ai-evaluation.ts](../../apps/web/src/lib/ai-evaluation.ts).

Imported by: [apps/web/src/components/app/ai-evaluation-review.tsx](../../apps/web/src/components/app/ai-evaluation-review.tsx), [apps/web/src/lib/evaluation-annotation.server.ts](../../apps/web/src/lib/evaluation-annotation.server.ts), [apps/web/src/lib/research-export.server.ts](../../apps/web/src/lib/research-export.server.ts), [apps/web/src/lib/research-rater-client.ts](../../apps/web/src/lib/research-rater-client.ts).

## lib/research-export.server.ts

Source: [apps/web/src/lib/research-export.server.ts](../../apps/web/src/lib/research-export.server.ts)

Exports: `ActiveRaterMembership`, `CSV_HEADERS`, `CsvRow`, `EXPORT_RESEARCH_SCHEMA_VERSION`, `ExportError`, `ExportInput`, `PseudonymKind`, `Pseudonymizer`, `RESEARCH_DATASET_VERSION`, `ResearchExport`, `ResolvedAiItemFields`, `ReviewDecision`, `assignParticipantIds`, `buildCsv`, `buildResearchExport`, `computeDatasetSnapshotId`, `createPseudonymizer`, `csvEscape`, `isActiveRater`, `isActiveRaterForAssignment`, `isAuthorizedExporter`, `parseResearcherIds`, `resolveAiItemFields`, `resolveReviewDecision`, `serializeReviewFindings`, `serializeSnapshotProvenance`.

Local dependencies: [apps/web/src/lib/ai-evaluation.ts](../../apps/web/src/lib/ai-evaluation.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/cefr-level.ts](../../apps/web/src/lib/cefr-level.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/research-annotation.ts](../../apps/web/src/lib/research-annotation.ts), [apps/web/src/lib/research-rater.ts](../../apps/web/src/lib/research-rater.ts).

Package imports: `node:crypto`.

Literal database references: `ai_evaluations`, `ai_feedback_items`, `assignment_submissions`, `assignments`, `courses`, `personalization_logs`, `research_rater_assignments`.

Imported by: [apps/web/src/lib/feedback-uptake.server.ts](../../apps/web/src/lib/feedback-uptake.server.ts), [apps/web/src/lib/personalization-analytics.server.ts](../../apps/web/src/lib/personalization-analytics.server.ts), [apps/web/src/lib/research-analytics.server.ts](../../apps/web/src/lib/research-analytics.server.ts), [apps/web/src/routes/api.research-export.ts](../../apps/web/src/routes/api.research-export.ts).

## lib/research-rater-client.ts

Source: [apps/web/src/lib/research-rater-client.ts](../../apps/web/src/lib/research-rater-client.ts)

Exports: `BlindResearchLoad`, `assertBlindResearchRound`, `projectBlindResearchItems`.

Local dependencies: [apps/web/src/lib/research-annotation.ts](../../apps/web/src/lib/research-annotation.ts).

Imported by: [apps/web/src/components/app/ai-evaluation-review.tsx](../../apps/web/src/components/app/ai-evaluation-review.tsx).

## lib/research-rater.ts

Source: [apps/web/src/lib/research-rater.ts](../../apps/web/src/lib/research-rater.ts)

Exports: `ADJUDICATION_ROUND`, `FieldAgreement`, `RATER_1_ROUND`, `RATER_2_ROUND`, `RaterAgreementSummary`, `RaterIndependenceError`, `RaterIndependenceOk`, `RaterIndependenceResult`, `RaterJudgment`, `RaterRound`, `adjudicationJudgment`, `appendRaterJudgment`, `fieldAgreement`, `finalResearchJudgment`, `hasAdjudication`, `judgmentsForRound`, `parseRaterJudgments`, `rater1Judgment`, `rater2Judgment`, `summarizeRaterAgreement`, `validateRaterIndependence`.

Imported by: [apps/web/src/lib/evaluation-annotation.server.ts](../../apps/web/src/lib/evaluation-annotation.server.ts), [apps/web/src/lib/research-analytics.ts](../../apps/web/src/lib/research-analytics.ts), [apps/web/src/lib/research-export.server.ts](../../apps/web/src/lib/research-export.server.ts), [apps/web/src/lib/research-target.server.ts](../../apps/web/src/lib/research-target.server.ts).

## lib/research-target.server.ts

Source: [apps/web/src/lib/research-target.server.ts](../../apps/web/src/lib/research-target.server.ts)

Exports: `ResearchError`, `ResearchTarget`, `ResearchTargetBody`, `loadResearchTarget`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/research-rater.ts](../../apps/web/src/lib/research-rater.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Literal database references: `assignments`, `research_rater_assignments`.

Imported by: [apps/web/src/lib/evaluation-annotation.server.ts](../../apps/web/src/lib/evaluation-annotation.server.ts).

## lib/resources.ts

Source: [apps/web/src/lib/resources.ts](../../apps/web/src/lib/resources.ts)

Exports: `ACCEPTED_MIME`, `CATEGORY_LABEL`, `FileCategory`, `MAX_UPLOAD_BYTES`, `SUPPORTED_EXTS`, `UploadProgress`, `canPreview`, `fileCategory`, `formatBytes`, `resourceFileUrl`, `uploadResource`, `validateFile`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Imported by: [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/course-resources.tsx](../../apps/web/src/components/app/course-resources.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/resource-form.tsx](../../apps/web/src/components/app/resource-form.tsx), [apps/web/src/components/app/task-builders/listening-builder.tsx](../../apps/web/src/components/app/task-builders/listening-builder.tsx), [apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/writing-workspace.tsx](../../apps/web/src/components/app/task-workspaces/writing-workspace.tsx).

## lib/roster-audit.server.ts

Source: [apps/web/src/lib/roster-audit.server.ts](../../apps/web/src/lib/roster-audit.server.ts)

Exports: `RosterAuditAction`, `RosterAuditEntry`, `RosterAuditOutcome`, `logRosterAudit`, `logRosterAuditBatch`.

Local dependencies: [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `roster_audit`.

Imported by: [apps/web/src/routes/api.roster-enroll.ts](../../apps/web/src/routes/api.roster-enroll.ts), [apps/web/src/routes/api.roster-reset-password.ts](../../apps/web/src/routes/api.roster-reset-password.ts).

## lib/roster-csv.ts

Source: [apps/web/src/lib/roster-csv.ts](../../apps/web/src/lib/roster-csv.ts)

Exports: `ParsedRosterRow`, `ROSTER_CSV_HEADER`, `ROSTER_NAME_MAX`, `ROSTER_NIM_MAX`, `buildRosterCsv`, `escapeCsvField`, `parseCsvLine`, `parseRosterText`, `splitRosterRow`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Imported by: [apps/web/src/components/app/course-roster.tsx](../../apps/web/src/components/app/course-roster.tsx).

## lib/rps-ai-extract.server.ts

Source: [apps/web/src/lib/rps-ai-extract.server.ts](../../apps/web/src/lib/rps-ai-extract.server.ts)

Exports: `AiExtractionResult`, `AiStageDiagnostics`, `extractRpsWithAi`, `normalizeAiParsed`.

Local dependencies: [apps/web/src/lib/hostinger-model.server.ts](../../apps/web/src/lib/hostinger-model.server.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/rps-parser.server.ts](../../apps/web/src/lib/rps-parser.server.ts).

Imported by: [apps/web/src/lib/rps-pdf-import.server.ts](../../apps/web/src/lib/rps-pdf-import.server.ts).

## lib/rps-assist.server.ts

Source: [apps/web/src/lib/rps-assist.server.ts](../../apps/web/src/lib/rps-assist.server.ts)

Exports: `assistFix`.

Local dependencies: [apps/web/src/lib/hostinger-model.server.ts](../../apps/web/src/lib/hostinger-model.server.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/rps-fix.ts](../../apps/web/src/lib/rps-fix.ts), [apps/web/src/lib/rps-validation.ts](../../apps/web/src/lib/rps-validation.ts).

Imported by: [apps/web/src/routes/api.rps-assist.ts](../../apps/web/src/routes/api.rps-assist.ts).

## lib/rps-csv.ts

Source: [apps/web/src/lib/rps-csv.ts](../../apps/web/src/lib/rps-csv.ts)

Exports: `CSV_TEMPLATES`, `CsvRow`, `downloadCsvTemplate`, `parseCsv`, `parseSectionCsv`.

Local dependencies: [apps/web/src/lib/rps-draft.ts](../../apps/web/src/lib/rps-draft.ts), [apps/web/src/lib/rps-text-parse.ts](../../apps/web/src/lib/rps-text-parse.ts).

Imported by: [apps/web/src/components/app/rps-editor-page.tsx](../../apps/web/src/components/app/rps-editor-page.tsx).

## lib/rps-draft.ts

Source: [apps/web/src/lib/rps-draft.ts](../../apps/web/src/lib/rps-draft.ts)

Exports: `DEFAULT_ASSESSMENTS`, `DraftAssessment`, `DraftCollab`, `DraftCpmk`, `DraftItem`, `DraftSession`, `EMPTY_DRAFT`, `RPS_STEPS`, `RpsDraft`, `RpsStepKey`, `composeRpsText`, `draftFromCourse`, `isFieldMissing`, `missingFields`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Imported by: [apps/web/src/components/app/rps-editor-page.tsx](../../apps/web/src/components/app/rps-editor-page.tsx), [apps/web/src/lib/rps-csv.ts](../../apps/web/src/lib/rps-csv.ts), [apps/web/src/lib/rps-limits.ts](../../apps/web/src/lib/rps-limits.ts), [apps/web/src/lib/rps-text-parse.ts](../../apps/web/src/lib/rps-text-parse.ts), [apps/web/src/lib/rps-validation.ts](../../apps/web/src/lib/rps-validation.ts).

## lib/rps-fix.ts

Source: [apps/web/src/lib/rps-fix.ts](../../apps/web/src/lib/rps-fix.ts)

Exports: `FixAssessment`, `FixChange`, `FixContext`, `FixItem`, `FixOp`, `FixSession`, `RpsFixProposal`, `buildFixProposal`, `candidateSubCpmks`, `rescaleWeights`.

Local dependencies: [apps/web/src/lib/rps-validation.ts](../../apps/web/src/lib/rps-validation.ts).

Imported by: [apps/web/src/components/app/course-workspace.tsx](../../apps/web/src/components/app/course-workspace.tsx), [apps/web/src/components/app/rps-ai-helper.tsx](../../apps/web/src/components/app/rps-ai-helper.tsx), [apps/web/src/lib/rps-assist.server.ts](../../apps/web/src/lib/rps-assist.server.ts), [apps/web/src/routes/api.rps-assist.ts](../../apps/web/src/routes/api.rps-assist.ts).

## lib/rps-limits.ts

Source: [apps/web/src/lib/rps-limits.ts](../../apps/web/src/lib/rps-limits.ts)

Exports: `LIMITS`, `LimitIssue`, `findRpsLimitIssue`, `formatCount`, `issueFromPocketBase`, `limitMessage`, `runeCount`.

Local dependencies: [apps/web/src/lib/rps-draft.ts](../../apps/web/src/lib/rps-draft.ts).

Imported by: [apps/web/src/components/app/char-meter.tsx](../../apps/web/src/components/app/char-meter.tsx), [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/rps-editor-page.tsx](../../apps/web/src/components/app/rps-editor-page.tsx).

## lib/rps-parser.server.ts

Source: [apps/web/src/lib/rps-parser.server.ts](../../apps/web/src/lib/rps-parser.server.ts)

Exports: `PARSED_LABELS`, `ParsedAssessment`, `ParsedCollabTask`, `ParsedCpmk`, `ParsedItem`, `ParsedRps`, `ParsedSession`, `buildWarnings`, `deriveSessionsFromTopics`, `parseRpsText`, `splitAssessments`, `splitCpmk`, `splitItems`.

Imported by: [apps/web/src/lib/rps-ai-extract.server.ts](../../apps/web/src/lib/rps-ai-extract.server.ts), [apps/web/src/lib/rps-pdf-import.server.ts](../../apps/web/src/lib/rps-pdf-import.server.ts), [apps/web/src/lib/rps-table-parser.server.ts](../../apps/web/src/lib/rps-table-parser.server.ts), [apps/web/src/routes/api.rps-import.ts](../../apps/web/src/routes/api.rps-import.ts).

## lib/rps-pdf-import.server.ts

Source: [apps/web/src/lib/rps-pdf-import.server.ts](../../apps/web/src/lib/rps-pdf-import.server.ts)

Exports: `ExtractDiagnostics`, `ImportResult`, `ImportStages`, `NormalizeDiagnostics`, `TableDiagnostics`, `extractPdfText`, `importRpsPdf`.

Local dependencies: [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/rps-ai-extract.server.ts](../../apps/web/src/lib/rps-ai-extract.server.ts), [apps/web/src/lib/rps-parser.server.ts](../../apps/web/src/lib/rps-parser.server.ts), [apps/web/src/lib/rps-table-parser.server.ts](../../apps/web/src/lib/rps-table-parser.server.ts).

Package imports: `pdf-parse`.

Imported by: [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts), [apps/web/src/routes/api.rps-import.ts](../../apps/web/src/routes/api.rps-import.ts).

## lib/rps-prompt.ts

Source: [apps/web/src/lib/rps-prompt.ts](../../apps/web/src/lib/rps-prompt.ts)

Exports: `SECTION_PROMPTS`, `SECTION_PROMPT_LABELS`, `copyToClipboard`, `getSectionPrompt`.

Imported by: [apps/web/src/components/app/rps-editor-page.tsx](../../apps/web/src/components/app/rps-editor-page.tsx).

## lib/rps-table-parser.server.ts

Source: [apps/web/src/lib/rps-table-parser.server.ts](../../apps/web/src/lib/rps-table-parser.server.ts)

Exports: `TableParseResult`, `parseWeeklySchedule`.

Local dependencies: [apps/web/src/lib/rps-parser.server.ts](../../apps/web/src/lib/rps-parser.server.ts).

Imported by: [apps/web/src/lib/rps-pdf-import.server.ts](../../apps/web/src/lib/rps-pdf-import.server.ts).

## lib/rps-text-parse.ts

Source: [apps/web/src/lib/rps-text-parse.ts](../../apps/web/src/lib/rps-text-parse.ts)

Exports: `SECTION_PARSERS`, `SectionParseResult`, `SectionParser`, `SectionPatch`, `deriveSessionsFromTopics`, `extractSessions`, `mergePatch`, `parseAssessmentSection`, `parseCollabSection`, `parseIdentitySection`, `parseOutcomesSection`, `parsePlanSection`, `parseWorkloadSection`, `replacePatch`, `splitAssessments`, `splitCpmk`, `splitItems`.

Local dependencies: [apps/web/src/lib/rps-draft.ts](../../apps/web/src/lib/rps-draft.ts).

Imported by: [apps/web/src/components/app/rps-editor-page.tsx](../../apps/web/src/components/app/rps-editor-page.tsx), [apps/web/src/lib/rps-csv.ts](../../apps/web/src/lib/rps-csv.ts).

## lib/rps-validation.ts

Source: [apps/web/src/lib/rps-validation.ts](../../apps/web/src/lib/rps-validation.ts)

Exports: `RpsValidationInput`, `RpsValidationResult`, `VALIDATION_CATEGORY_LABELS`, `ValidationAssessment`, `ValidationCategory`, `ValidationSession`, `ValidationWarning`, `validateRps`, `validationFromDraft`, `validationFromRecords`.

Local dependencies: [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/rps-draft.ts](../../apps/web/src/lib/rps-draft.ts).

Imported by: [apps/web/src/components/app/course-workspace.tsx](../../apps/web/src/components/app/course-workspace.tsx), [apps/web/src/components/app/rps-ai-helper.tsx](../../apps/web/src/components/app/rps-ai-helper.tsx), [apps/web/src/components/app/rps-editor-page.tsx](../../apps/web/src/components/app/rps-editor-page.tsx), [apps/web/src/lib/rps-assist.server.ts](../../apps/web/src/lib/rps-assist.server.ts), [apps/web/src/lib/rps-fix.ts](../../apps/web/src/lib/rps-fix.ts), [apps/web/src/routes/api.rps-assist.ts](../../apps/web/src/routes/api.rps-assist.ts).

## lib/rubric-suggestions.server.ts

Source: [apps/web/src/lib/rubric-suggestions.server.ts](../../apps/web/src/lib/rubric-suggestions.server.ts)

Exports: `buildRubricSuggestions`, `deriveSuggestionInput`.

Local dependencies: [apps/web/src/lib/assignment-draft.server.ts](../../apps/web/src/lib/assignment-draft.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/rubric-suggestions.ts](../../apps/web/src/lib/rubric-suggestions.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Imported by: [apps/web/src/routes/api.rubric-suggestions.ts](../../apps/web/src/routes/api.rubric-suggestions.ts).

## lib/rubric-suggestions.ts

Source: [apps/web/src/lib/rubric-suggestions.ts](../../apps/web/src/lib/rubric-suggestions.ts)

Exports: `EMPTY_SUGGESTED_CRITERIA`, `MAX_RUBRIC_SUGGESTIONS`, `MIN_PROMPT_CHARS`, `SuggestedCriteria`, `SuggestedCriterion`, `acceptSuggestion`, `canSuggestCriteria`, `dismissSuggestion`, `mergeGenerated`, `parseSuggestedCriteria`.

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/task-builders/rubric-suggestions.tsx](../../apps/web/src/components/app/task-builders/rubric-suggestions.tsx), [apps/web/src/lib/rubric-suggestions.server.ts](../../apps/web/src/lib/rubric-suggestions.server.ts), [apps/web/src/routes/api.rubric-suggestions.ts](../../apps/web/src/routes/api.rubric-suggestions.ts).

## lib/seo.ts

Source: [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts)

Exports: `SeoArgs`, `SeoInput`, `absoluteUrl`, `seo`, `siteOriginFrom`.

Package imports: `react-router`.

Imported by: [apps/web/src/routes/analytics.tsx](../../apps/web/src/routes/analytics.tsx), [apps/web/src/routes/app.asisten.tsx](../../apps/web/src/routes/app.asisten.tsx), [apps/web/src/routes/app.berkas.$fileId.tsx](../../apps/web/src/routes/app.berkas.$fileId.tsx), [apps/web/src/routes/app.berkas.tsx](../../apps/web/src/routes/app.berkas.tsx), [apps/web/src/routes/app.coming.$slug.tsx](../../apps/web/src/routes/app.coming.$slug.tsx), [apps/web/src/routes/app.courses.tsx](../../apps/web/src/routes/app.courses.tsx), [apps/web/src/routes/app.kerja.$assignmentId.tsx](../../apps/web/src/routes/app.kerja.$assignmentId.tsx), [apps/web/src/routes/app.latihan.tsx](../../apps/web/src/routes/app.latihan.tsx), [apps/web/src/routes/app.onboarding.tsx](../../apps/web/src/routes/app.onboarding.tsx), [apps/web/src/routes/app.pengaturan.tsx](../../apps/web/src/routes/app.pengaturan.tsx), [apps/web/src/routes/app.penilaian.tsx](../../apps/web/src/routes/app.penilaian.tsx), [apps/web/src/routes/app.riset.tsx](../../apps/web/src/routes/app.riset.tsx), [apps/web/src/routes/app.rps.$courseId.tsx](../../apps/web/src/routes/app.rps.$courseId.tsx), [apps/web/src/routes/app.student.tsx](../../apps/web/src/routes/app.student.tsx), [apps/web/src/routes/app.tsx](../../apps/web/src/routes/app.tsx), [apps/web/src/routes/app.tugas.$assignmentId.pratinjau.tsx](../../apps/web/src/routes/app.tugas.$assignmentId.pratinjau.tsx), [apps/web/src/routes/app.tugas.$assignmentId.tsx](../../apps/web/src/routes/app.tugas.$assignmentId.tsx), [apps/web/src/routes/app.tugas.buat.tsx](../../apps/web/src/routes/app.tugas.buat.tsx), [apps/web/src/routes/app.tugas.insights.tsx](../../apps/web/src/routes/app.tugas.insights.tsx), [apps/web/src/routes/app.tugas.tsx](../../apps/web/src/routes/app.tugas.tsx), [apps/web/src/routes/course.index.tsx](../../apps/web/src/routes/course.index.tsx), [apps/web/src/routes/course.section.tsx](../../apps/web/src/routes/course.section.tsx), [apps/web/src/routes/home.tsx](../../apps/web/src/routes/home.tsx), [apps/web/src/routes/kalender.tsx](../../apps/web/src/routes/kalender.tsx), [apps/web/src/routes/login.tsx](../../apps/web/src/routes/login.tsx), [apps/web/src/routes/lupa-sandi.tsx](../../apps/web/src/routes/lupa-sandi.tsx), [apps/web/src/routes/reset-password.tsx](../../apps/web/src/routes/reset-password.tsx), [apps/web/src/routes/tugas.$token.tsx](../../apps/web/src/routes/tugas.$token.tsx), [apps/web/src/routes/verifikasi-email.tsx](../../apps/web/src/routes/verifikasi-email.tsx).

## lib/session-dates.ts

Source: [apps/web/src/lib/session-dates.ts](../../apps/web/src/lib/session-dates.ts)

Exports: `ScheduleResult`, `ScheduledSession`, `SessionInput`, `generateSchedule`, `inferFirstSessionDate`, `isoDate`, `parseDateOnly`, `toDateOnly`, `toPocketBaseDate`.

Local dependencies: [apps/web/src/data/academic-calendar.ts](../../apps/web/src/data/academic-calendar.ts).

Package imports: `date-fns`.

Imported by: [apps/web/src/components/app/session-date-autofill.tsx](../../apps/web/src/components/app/session-date-autofill.tsx).

## lib/site-origin.server.ts

Source: [apps/web/src/lib/site-origin.server.ts](../../apps/web/src/lib/site-origin.server.ts)

Exports: `siteOrigin`.

Imported by: [apps/web/src/root.tsx](../../apps/web/src/root.tsx), [apps/web/src/routes/robots.txt.ts](../../apps/web/src/routes/robots.txt.ts), [apps/web/src/routes/sitemap.xml.ts](../../apps/web/src/routes/sitemap.xml.ts).

## lib/speaking-directions.ts

Source: [apps/web/src/lib/speaking-directions.ts](../../apps/web/src/lib/speaking-directions.ts)

Exports: `SpeakingDirection`, `speakingChecklist`, `speakingDirections`, `speakingLead`.

Local dependencies: [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Imported by: [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/task-workspaces/speaking-student-panel.tsx](../../apps/web/src/components/app/task-workspaces/speaking-student-panel.tsx).

## lib/structured-assignment.ts

Source: [apps/web/src/lib/structured-assignment.ts](../../apps/web/src/lib/structured-assignment.ts)

Exports: `ChecklistItem`, `EMPTY_STRUCTURED`, `ResponseFormat`, `StructuredAssignmentContent`, `StructuredKind`, `StructuredRequirement`, `StructuredSection`, `StructuredValidation`, `hasStructuredContent`, `parseStructuredContent`, `parseStructuredContentFromConfig`, `sanitizeStructuredContent`, `structuredChecklist`, `validateStructuredContent`.

Imported by: [apps/web/src/components/app/lecturer-assignment-preview.tsx](../../apps/web/src/components/app/lecturer-assignment-preview.tsx), [apps/web/src/components/app/task-builders/task-autofill.tsx](../../apps/web/src/components/app/task-builders/task-autofill.tsx), [apps/web/src/lib/student-assistant.server.ts](../../apps/web/src/lib/student-assistant.server.ts), [apps/web/src/lib/task-config-draft.server.ts](../../apps/web/src/lib/task-config-draft.server.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts), [apps/web/src/lib/worksheet-brief.ts](../../apps/web/src/lib/worksheet-brief.ts).

## lib/student-assistant-tools.server.ts

Source: [apps/web/src/lib/student-assistant-tools.server.ts](../../apps/web/src/lib/student-assistant-tools.server.ts)

Exports: `InvokeStudentToolInput`, `InvokeStudentToolOutcome`, `STUDENT_TOOL_NAMES`, `STUDENT_TOOL_REGISTRY`, `StudentPageContext`, `StudentToolContext`, `StudentToolDefinition`, `StudentToolName`, `StudentToolResult`, `ToolValidation`, `buildStudentPageContext`, `getStudentToolDefinition`, `invokeStudentTool`, `isStudentToolName`, `toolStateAvailability`, `validateStudentToolArgs`.

Local dependencies: [apps/web/src/lib/ai-capabilities.ts](../../apps/web/src/lib/ai-capabilities.ts), [apps/web/src/lib/ai-policy.server.ts](../../apps/web/src/lib/ai-policy.server.ts), [apps/web/src/lib/ai-policy.ts](../../apps/web/src/lib/ai-policy.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/student-assistant.server.ts](../../apps/web/src/lib/student-assistant.server.ts), [apps/web/src/lib/task-assist.server.ts](../../apps/web/src/lib/task-assist.server.ts).

Package imports: `pocketbase`.

Literal database references: `assignment_submissions`, `enrollments`.

Imported by: [apps/web/src/routes/api.student-assistant.ts](../../apps/web/src/routes/api.student-assistant.ts).

## lib/student-assistant.server.ts

Source: [apps/web/src/lib/student-assistant.server.ts](../../apps/web/src/lib/student-assistant.server.ts)

Exports: `AssistantChat`, `AssistantContext`, `AssistantMessage`, `AssistantMode`, `AssistantTurnResult`, `HINT_LEVEL_LABEL`, `MODE_CAPABILITY`, `MODE_DESCRIPTION`, `MODE_KIND`, `MODE_LABEL`, `QUICK_MODES`, `SUBMISSION_STATE_LABEL`, `SubmissionState`, `appendMessages`, `buildAssistantTurn`, `clearChat`, `loadAssistantContext`, `loadChat`, `modeAvailability`, `renderStudentDraft`, `submissionStateOf`.

Local dependencies: [apps/web/src/lib/ai-capabilities.ts](../../apps/web/src/lib/ai-capabilities.ts), [apps/web/src/lib/ai-policy.server.ts](../../apps/web/src/lib/ai-policy.server.ts), [apps/web/src/lib/ai-policy.ts](../../apps/web/src/lib/ai-policy.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/structured-assignment.ts](../../apps/web/src/lib/structured-assignment.ts), [apps/web/src/lib/task-assist.server.ts](../../apps/web/src/lib/task-assist.server.ts).

Package imports: `pocketbase`.

Literal database references: `assignment_submissions`, `student_assistant_chats`.

Imported by: [apps/web/src/components/app/student-assistant-panel.tsx](../../apps/web/src/components/app/student-assistant-panel.tsx), [apps/web/src/lib/student-assistant-tools.server.ts](../../apps/web/src/lib/student-assistant-tools.server.ts), [apps/web/src/routes/api.student-assistant.ts](../../apps/web/src/routes/api.student-assistant.ts).

## lib/student-feedback.ts

Source: [apps/web/src/lib/student-feedback.ts](../../apps/web/src/lib/student-feedback.ts)

Exports: `StudentRecommendation`, `parseStudentRecommendations`, `studentGeneralNote`, `studentRecommendationText`.

Imported by: [apps/web/src/components/app/student-published-feedback.tsx](../../apps/web/src/components/app/student-published-feedback.tsx), [apps/web/src/components/app/student-result-view.tsx](../../apps/web/src/components/app/student-result-view.tsx).

## lib/student-home-copy.ts

Source: [apps/web/src/lib/student-home-copy.ts](../../apps/web/src/lib/student-home-copy.ts)

Exports: `useStudentHomeText`.

Local dependencies: [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts).

Imported by: [apps/web/src/components/app/agent-task-panel.tsx](../../apps/web/src/components/app/agent-task-panel.tsx), [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/student-course-overview.tsx](../../apps/web/src/components/app/student-course-overview.tsx), [apps/web/src/components/app/student-courses.tsx](../../apps/web/src/components/app/student-courses.tsx), [apps/web/src/components/app/student-dashboard.tsx](../../apps/web/src/components/app/student-dashboard.tsx), [apps/web/src/components/app/student-grades.tsx](../../apps/web/src/components/app/student-grades.tsx), [apps/web/src/components/app/student-home-adventure.tsx](../../apps/web/src/components/app/student-home-adventure.tsx).

## lib/student-onboarding.server.ts

Source: [apps/web/src/lib/student-onboarding.server.ts](../../apps/web/src/lib/student-onboarding.server.ts)

Exports: `OnboardingUser`, `PASSWORD_MAX`, `PASSWORD_MIN`, `VERIFICATION_TTL_MS`, `authFaculty`, `authUser`, `esc`, `randomToken`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts).

Package imports: `node:crypto`, `pocketbase`.

Literal database references: `users`.

Imported by: [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts), [apps/web/src/routes/api.recovery-email-request-reset.ts](../../apps/web/src/routes/api.recovery-email-request-reset.ts), [apps/web/src/routes/api.recovery-email-request.ts](../../apps/web/src/routes/api.recovery-email-request.ts), [apps/web/src/routes/api.recovery-email-reset-password.ts](../../apps/web/src/routes/api.recovery-email-reset-password.ts), [apps/web/src/routes/api.recovery-email-verify.ts](../../apps/web/src/routes/api.recovery-email-verify.ts), [apps/web/src/routes/api.roster-language.ts](../../apps/web/src/routes/api.roster-language.ts), [apps/web/src/routes/api.roster-reset-password.ts](../../apps/web/src/routes/api.roster-reset-password.ts), [apps/web/src/routes/api.roster-status.ts](../../apps/web/src/routes/api.roster-status.ts), [apps/web/src/routes/api.student-password.ts](../../apps/web/src/routes/api.student-password.ts), [apps/web/src/routes/api.student-profile.ts](../../apps/web/src/routes/api.student-profile.ts).

## lib/student-progress.server.ts

Source: [apps/web/src/lib/student-progress.server.ts](../../apps/web/src/lib/student-progress.server.ts)

Exports: `studentProgress`.

Local dependencies: [apps/web/src/lib/learner-profile.server.ts](../../apps/web/src/lib/learner-profile.server.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/personal-practice.ts](../../apps/web/src/lib/personal-practice.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/student-progress.ts](../../apps/web/src/lib/student-progress.ts).

Imported by: [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts), [apps/web/src/lib/personal-practice.server.ts](../../apps/web/src/lib/personal-practice.server.ts), [apps/web/src/routes/api.student-profile.ts](../../apps/web/src/routes/api.student-profile.ts).

## lib/student-progress.ts

Source: [apps/web/src/lib/student-progress.ts](../../apps/web/src/lib/student-progress.ts)

Exports: `PRACTICE_SKILLS`, `PracticeSkillId`, `StudentProgress`, `normalizePracticeSkill`.

Imported by: [apps/web/src/components/app/personal-practice.tsx](../../apps/web/src/components/app/personal-practice.tsx), [apps/web/src/lib/personal-practice.server.ts](../../apps/web/src/lib/personal-practice.server.ts), [apps/web/src/lib/personal-practice.ts](../../apps/web/src/lib/personal-practice.ts), [apps/web/src/lib/student-progress.server.ts](../../apps/web/src/lib/student-progress.server.ts), [apps/web/src/routes/course.student-profile.tsx](../../apps/web/src/routes/course.student-profile.tsx).

## lib/task-assist.server.ts

Source: [apps/web/src/lib/task-assist.server.ts](../../apps/web/src/lib/task-assist.server.ts)

Exports: `ASSIST_KIND_LABEL`, `AssistInput`, `AssistKind`, `ModelProvenance`, `buildTaskAssist`, `collectModel`, `collectModelWithProvenance`, `imageFilenames`, `storedFileUrl`, `submissionImageUrl`.

Local dependencies: [apps/web/src/lib/hostinger-model.server.ts](../../apps/web/src/lib/hostinger-model.server.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts).

Imported by: [apps/web/src/lib/ai-evaluation.server.ts](../../apps/web/src/lib/ai-evaluation.server.ts), [apps/web/src/lib/bulk-paper.server.ts](../../apps/web/src/lib/bulk-paper.server.ts), [apps/web/src/lib/check-answer.server.ts](../../apps/web/src/lib/check-answer.server.ts), [apps/web/src/lib/context-suggestions.server.ts](../../apps/web/src/lib/context-suggestions.server.ts), [apps/web/src/lib/feedback.server.ts](../../apps/web/src/lib/feedback.server.ts), [apps/web/src/lib/lecturer-recommendations.server.ts](../../apps/web/src/lib/lecturer-recommendations.server.ts), [apps/web/src/lib/practice-assist.server.ts](../../apps/web/src/lib/practice-assist.server.ts), [apps/web/src/lib/student-assistant-tools.server.ts](../../apps/web/src/lib/student-assistant-tools.server.ts), [apps/web/src/lib/student-assistant.server.ts](../../apps/web/src/lib/student-assistant.server.ts), [apps/web/src/routes/api.task-assist.ts](../../apps/web/src/routes/api.task-assist.ts).

## lib/task-config-draft.server.ts

Source: [apps/web/src/lib/task-config-draft.server.ts](../../apps/web/src/lib/task-config-draft.server.ts)

Exports: `ListeningQuestionSuggestion`, `QuizQuestionSuggestion`, `TaskConfigDraft`, `TaskConfigDraftContext`, `WritingCriterionSuggestion`, `WritingFormatsSuggestion`, `buildTaskConfigDraft`.

Local dependencies: [apps/web/src/lib/assignment-draft.server.ts](../../apps/web/src/lib/assignment-draft.server.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/structured-assignment.ts](../../apps/web/src/lib/structured-assignment.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Imported by: [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts), [apps/web/src/routes/api.task-config-draft.ts](../../apps/web/src/routes/api.task-config-draft.ts).

## lib/task-types.ts

Source: [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts)

Exports: `DEFAULT_LISTENING_CONFIG`, `DEFAULT_QUIZ_CONFIG`, `DEFAULT_READING_CONFIG`, `DEFAULT_SPEAKING_CONFIG`, `DEFAULT_WRITING_CONFIG`, `EMPTY_ANSWER_KEY`, `EditableTaskConfig`, `GradeResult`, `GradedQuestion`, `LISTENING_TYPE_LABEL`, `ListeningConfig`, `ListeningQuestionEditable`, `ListeningQuestionType`, `ListeningStudentAnswers`, `ParsedQuizImport`, `QUIZ_RELEASE_LABEL`, `QuizConfig`, `QuizQuestionEditable`, `QuizReleaseMode`, `QuizStudentAnswers`, `ReadingConfig`, `SpeakingConfig`, `TASK_KIND_LABEL`, `TaskAnswerKey`, `TaskAnswers`, `TaskConfigWarning`, `TaskKeyEntry`, `TaskKind`, `TaskReview`, `WritingConfig`, `WritingCriterion`, `WritingQuestion`, `countWords`, `emptyEditableConfig`, `formatTimestamp`, `gradeListening`, `gradeQuiz`, `gradeReading`, `hasWritingQuestions`, `mediaResources`, `mergeTaskConfigWithKey`, `normalizeEditableConfig`, `parseAnswerKey`, `parseListeningConfig`, `parseQuizConfig`, `parseQuizQuestionsFromText`, `parseReadingConfig`, `parseSpeakingConfig`, `parseTaskAnswers`, `parseTaskConfig`, `parseTaskReview`, `parseTimestamp`, `parseWritingConfig`, `splitTaskConfigForSave`, `taskKindForShape`, `validateEditableConfig`.

Local dependencies: [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/structured-assignment.ts](../../apps/web/src/lib/structured-assignment.ts).

Imported by: [apps/web/src/components/app/assignment-form.tsx](../../apps/web/src/components/app/assignment-form.tsx), [apps/web/src/components/app/course-assignments.tsx](../../apps/web/src/components/app/course-assignments.tsx), [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx), [apps/web/src/components/app/formative-practice.tsx](../../apps/web/src/components/app/formative-practice.tsx), [apps/web/src/components/app/lecturer-assignment-preview.tsx](../../apps/web/src/components/app/lecturer-assignment-preview.tsx), [apps/web/src/components/app/practice-autofill-form.tsx](../../apps/web/src/components/app/practice-autofill-form.tsx), [apps/web/src/components/app/practice-content-autofill.tsx](../../apps/web/src/components/app/practice-content-autofill.tsx), [apps/web/src/components/app/submission-task-review.tsx](../../apps/web/src/components/app/submission-task-review.tsx), [apps/web/src/components/app/task-builders/listening-builder.tsx](../../apps/web/src/components/app/task-builders/listening-builder.tsx), [apps/web/src/components/app/task-builders/quiz-builder.tsx](../../apps/web/src/components/app/task-builders/quiz-builder.tsx), [apps/web/src/components/app/task-builders/reading-builder.tsx](../../apps/web/src/components/app/task-builders/reading-builder.tsx), [apps/web/src/components/app/task-builders/speaking-builder.tsx](../../apps/web/src/components/app/task-builders/speaking-builder.tsx), [apps/web/src/components/app/task-builders/task-autofill.tsx](../../apps/web/src/components/app/task-builders/task-autofill.tsx), [apps/web/src/components/app/task-builders/writing-builder.tsx](../../apps/web/src/components/app/task-builders/writing-builder.tsx), [apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/listening-workspace.tsx](../../apps/web/src/components/app/task-workspaces/listening-workspace.tsx), [apps/web/src/components/app/task-workspaces/quiz-workspace.tsx](../../apps/web/src/components/app/task-workspaces/quiz-workspace.tsx), [apps/web/src/components/app/task-workspaces/reading-workspace.tsx](../../apps/web/src/components/app/task-workspaces/reading-workspace.tsx), [apps/web/src/components/app/task-workspaces/speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/writing-workspace.tsx](../../apps/web/src/components/app/task-workspaces/writing-workspace.tsx), [apps/web/src/lib/ai-evaluation.server.ts](../../apps/web/src/lib/ai-evaluation.server.ts), [apps/web/src/lib/assistant/tools.server.ts](../../apps/web/src/lib/assistant/tools.server.ts), [apps/web/src/lib/cefr-level.ts](../../apps/web/src/lib/cefr-level.ts), [apps/web/src/lib/check-answer.server.ts](../../apps/web/src/lib/check-answer.server.ts), [apps/web/src/lib/evaluation-review.server.ts](../../apps/web/src/lib/evaluation-review.server.ts), [apps/web/src/lib/evaluation-scoring.ts](../../apps/web/src/lib/evaluation-scoring.ts), [apps/web/src/lib/feedback.server.ts](../../apps/web/src/lib/feedback.server.ts), [apps/web/src/lib/practice-assist.server.ts](../../apps/web/src/lib/practice-assist.server.ts), [apps/web/src/lib/research-target.server.ts](../../apps/web/src/lib/research-target.server.ts), [apps/web/src/lib/rubric-suggestions.server.ts](../../apps/web/src/lib/rubric-suggestions.server.ts), [apps/web/src/lib/speaking-directions.ts](../../apps/web/src/lib/speaking-directions.ts), [apps/web/src/lib/task-config-draft.server.ts](../../apps/web/src/lib/task-config-draft.server.ts), [apps/web/src/routes/api.check-answer.ts](../../apps/web/src/routes/api.check-answer.ts), [apps/web/src/routes/api.feedback.ts](../../apps/web/src/routes/api.feedback.ts), [apps/web/src/routes/api.practice-assist.ts](../../apps/web/src/routes/api.practice-assist.ts), [apps/web/src/routes/api.practice-speaking.ts](../../apps/web/src/routes/api.practice-speaking.ts), [apps/web/src/routes/api.rubric-suggestions.ts](../../apps/web/src/routes/api.rubric-suggestions.ts), [apps/web/src/routes/api.task-assist.ts](../../apps/web/src/routes/api.task-assist.ts), [apps/web/src/routes/api.task-config-draft.ts](../../apps/web/src/routes/api.task-config-draft.ts), [apps/web/src/routes/api.task-submit.ts](../../apps/web/src/routes/api.task-submit.ts), [apps/web/src/routes/api.transcribe.ts](../../apps/web/src/routes/api.transcribe.ts).

## lib/transcription.server.ts

Source: [apps/web/src/lib/transcription.server.ts](../../apps/web/src/lib/transcription.server.ts)

Exports: `isAudioName`, `queueTranscription`, `runTranscription`.

Local dependencies: [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `assignment_submissions`.

Imported by: [apps/web/src/routes/api.transcribe.ts](../../apps/web/src/routes/api.transcribe.ts).

## lib/transcription.ts

Source: [apps/web/src/lib/transcription.ts](../../apps/web/src/lib/transcription.ts)

Exports: `TranscriptStatus`, `requestTranscription`.

Local dependencies: [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Imported by: [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx), [apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/formative-speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/speaking-workspace.tsx](../../apps/web/src/components/app/task-workspaces/speaking-workspace.tsx), [apps/web/src/components/app/task-workspaces/transcript-panel.tsx](../../apps/web/src/components/app/task-workspaces/transcript-panel.tsx).

## lib/utils.ts

Source: [apps/web/src/lib/utils.ts](../../apps/web/src/lib/utils.ts)

Exports: `cn`.

Package imports: `clsx`, `tailwind-merge`.

Imported by: [apps/web/src/components/app/app-modal.tsx](../../apps/web/src/components/app/app-modal.tsx), [apps/web/src/components/ui/accordion.tsx](../../apps/web/src/components/ui/accordion.tsx), [apps/web/src/components/ui/alert-dialog.tsx](../../apps/web/src/components/ui/alert-dialog.tsx), [apps/web/src/components/ui/alert.tsx](../../apps/web/src/components/ui/alert.tsx), [apps/web/src/components/ui/avatar.tsx](../../apps/web/src/components/ui/avatar.tsx), [apps/web/src/components/ui/badge.tsx](../../apps/web/src/components/ui/badge.tsx), [apps/web/src/components/ui/breadcrumb.tsx](../../apps/web/src/components/ui/breadcrumb.tsx), [apps/web/src/components/ui/button-group.tsx](../../apps/web/src/components/ui/button-group.tsx), [apps/web/src/components/ui/button.tsx](../../apps/web/src/components/ui/button.tsx), [apps/web/src/components/ui/calendar.tsx](../../apps/web/src/components/ui/calendar.tsx), [apps/web/src/components/ui/card.tsx](../../apps/web/src/components/ui/card.tsx), [apps/web/src/components/ui/carousel.tsx](../../apps/web/src/components/ui/carousel.tsx), [apps/web/src/components/ui/chart.tsx](../../apps/web/src/components/ui/chart.tsx), [apps/web/src/components/ui/checkbox.tsx](../../apps/web/src/components/ui/checkbox.tsx), [apps/web/src/components/ui/command.tsx](../../apps/web/src/components/ui/command.tsx), [apps/web/src/components/ui/context-menu.tsx](../../apps/web/src/components/ui/context-menu.tsx), [apps/web/src/components/ui/dialog.tsx](../../apps/web/src/components/ui/dialog.tsx), [apps/web/src/components/ui/drawer.tsx](../../apps/web/src/components/ui/drawer.tsx), [apps/web/src/components/ui/dropdown-menu.tsx](../../apps/web/src/components/ui/dropdown-menu.tsx), [apps/web/src/components/ui/empty.tsx](../../apps/web/src/components/ui/empty.tsx), [apps/web/src/components/ui/field.tsx](../../apps/web/src/components/ui/field.tsx), [apps/web/src/components/ui/form.tsx](../../apps/web/src/components/ui/form.tsx), [apps/web/src/components/ui/hover-card.tsx](../../apps/web/src/components/ui/hover-card.tsx), [apps/web/src/components/ui/input-group.tsx](../../apps/web/src/components/ui/input-group.tsx), [apps/web/src/components/ui/input-otp.tsx](../../apps/web/src/components/ui/input-otp.tsx), [apps/web/src/components/ui/input.tsx](../../apps/web/src/components/ui/input.tsx), [apps/web/src/components/ui/item.tsx](../../apps/web/src/components/ui/item.tsx), [apps/web/src/components/ui/kbd.tsx](../../apps/web/src/components/ui/kbd.tsx), [apps/web/src/components/ui/label.tsx](../../apps/web/src/components/ui/label.tsx), [apps/web/src/components/ui/menubar.tsx](../../apps/web/src/components/ui/menubar.tsx), [apps/web/src/components/ui/navigation-menu.tsx](../../apps/web/src/components/ui/navigation-menu.tsx), [apps/web/src/components/ui/pagination.tsx](../../apps/web/src/components/ui/pagination.tsx), [apps/web/src/components/ui/popover.tsx](../../apps/web/src/components/ui/popover.tsx), [apps/web/src/components/ui/progress.tsx](../../apps/web/src/components/ui/progress.tsx), [apps/web/src/components/ui/radio-group.tsx](../../apps/web/src/components/ui/radio-group.tsx), [apps/web/src/components/ui/resizable.tsx](../../apps/web/src/components/ui/resizable.tsx), [apps/web/src/components/ui/scroll-area.tsx](../../apps/web/src/components/ui/scroll-area.tsx), [apps/web/src/components/ui/select.tsx](../../apps/web/src/components/ui/select.tsx), [apps/web/src/components/ui/separator.tsx](../../apps/web/src/components/ui/separator.tsx), [apps/web/src/components/ui/sheet.tsx](../../apps/web/src/components/ui/sheet.tsx), [apps/web/src/components/ui/sidebar.tsx](../../apps/web/src/components/ui/sidebar.tsx), [apps/web/src/components/ui/skeleton.tsx](../../apps/web/src/components/ui/skeleton.tsx), [apps/web/src/components/ui/slider.tsx](../../apps/web/src/components/ui/slider.tsx), [apps/web/src/components/ui/spinner.tsx](../../apps/web/src/components/ui/spinner.tsx), [apps/web/src/components/ui/switch.tsx](../../apps/web/src/components/ui/switch.tsx), [apps/web/src/components/ui/table.tsx](../../apps/web/src/components/ui/table.tsx), [apps/web/src/components/ui/tabs.tsx](../../apps/web/src/components/ui/tabs.tsx), [apps/web/src/components/ui/textarea.tsx](../../apps/web/src/components/ui/textarea.tsx), [apps/web/src/components/ui/toast.tsx](../../apps/web/src/components/ui/toast.tsx), [apps/web/src/components/ui/toggle-group.tsx](../../apps/web/src/components/ui/toggle-group.tsx), [apps/web/src/components/ui/toggle.tsx](../../apps/web/src/components/ui/toggle.tsx), [apps/web/src/components/ui/tooltip.tsx](../../apps/web/src/components/ui/tooltip.tsx).

## lib/worksheet-brief.ts

Source: [apps/web/src/lib/worksheet-brief.ts](../../apps/web/src/lib/worksheet-brief.ts)

Exports: `WorksheetBrief`, `WorksheetChip`, `WorksheetSection`, `buildWorksheetBrief`.

Local dependencies: [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/structured-assignment.ts](../../apps/web/src/lib/structured-assignment.ts).

Imported by: [apps/web/src/components/app/enrolled-answer-sheet.tsx](../../apps/web/src/components/app/enrolled-answer-sheet.tsx), [apps/web/src/components/app/student-answer-sheet.tsx](../../apps/web/src/components/app/student-answer-sheet.tsx).

## root.tsx

Source: [apps/web/src/root.tsx](../../apps/web/src/root.tsx)

Exports: `ErrorBoundary`, `Layout`, `headers`, `links`, `loader`, `shouldRevalidate`.

Local dependencies: [apps/web/src/components/app/welcome-tour.tsx](../../apps/web/src/components/app/welcome-tour.tsx), [apps/web/src/components/confirm-dialog.tsx](../../apps/web/src/components/confirm-dialog.tsx), [apps/web/src/components/editor-overlay-guard.tsx](../../apps/web/src/components/editor-overlay-guard.tsx), [apps/web/src/components/site-footer.tsx](../../apps/web/src/components/site-footer.tsx), [apps/web/src/components/site-header.tsx](../../apps/web/src/components/site-header.tsx), [apps/web/src/horizons-preview-scripts.tsx](../../apps/web/src/horizons-preview-scripts.tsx), [apps/web/src/index.css](../../apps/web/src/index.css), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/site-origin.server.ts](../../apps/web/src/lib/site-origin.server.ts), [apps/web/src/styles/agent-tasks.css](../../apps/web/src/styles/agent-tasks.css), [apps/web/src/styles/dark-overrides.css](../../apps/web/src/styles/dark-overrides.css), [apps/web/src/styles/lesson-plans.css](../../apps/web/src/styles/lesson-plans.css), [apps/web/src/styles/personal-practice.css](../../apps/web/src/styles/personal-practice.css), [apps/web/src/styles/premium-workspace.css](../../apps/web/src/styles/premium-workspace.css), [apps/web/src/styles/student-home.css](../../apps/web/src/styles/student-home.css).

Package imports: `react`, `react-router`.

## routes/analytics.tsx

Source: [apps/web/src/routes/analytics.tsx](../../apps/web/src/routes/analytics.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/analytics-index.tsx](../../apps/web/src/components/app/analytics-index.tsx), [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

## routes/api.$.ts

Source: [apps/web/src/routes/api.$.ts](../../apps/web/src/routes/api.$.ts)

Exports: `action`, `loader`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts).

## routes/api.agent-tasks.ts

Source: [apps/web/src/routes/api.agent-tasks.ts](../../apps/web/src/routes/api.agent-tasks.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/agent-tasks.server.ts](../../apps/web/src/lib/agent-tasks.server.ts), [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/rate-limit.server.ts](../../apps/web/src/lib/rate-limit.server.ts).

## routes/api.ai-usage.ts

Source: [apps/web/src/routes/api.ai-usage.ts](../../apps/web/src/routes/api.ai-usage.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/ai-usage.server.ts](../../apps/web/src/lib/ai-usage.server.ts), [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts).

## routes/api.assignment-draft.ts

Source: [apps/web/src/routes/api.assignment-draft.ts](../../apps/web/src/routes/api.assignment-draft.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignment-draft.server.ts](../../apps/web/src/lib/assignment-draft.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Package imports: `pocketbase`.

Literal database references: `assessments`, `class_sessions`, `course_resources`, `courses`, `cpl`, `cpmk`, `sub_cpmk`, `users`.

## routes/api.assistant.ts

Source: [apps/web/src/routes/api.assistant.ts](../../apps/web/src/routes/api.assistant.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/ai-rate-limits.ts](../../apps/web/src/lib/ai-rate-limits.ts), [apps/web/src/lib/ai-usage.server.ts](../../apps/web/src/lib/ai-usage.server.ts), [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assistant/attachments.server.ts](../../apps/web/src/lib/assistant/attachments.server.ts), [apps/web/src/lib/assistant/types.ts](../../apps/web/src/lib/assistant/types.ts), [apps/web/src/lib/assistant.server.ts](../../apps/web/src/lib/assistant.server.ts).

## routes/api.berkas-parse.ts

Source: [apps/web/src/routes/api.berkas-parse.ts](../../apps/web/src/routes/api.berkas-parse.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts).

Package imports: `pdf-parse`.

## routes/api.berkas-process.ts

Source: [apps/web/src/routes/api.berkas-process.ts](../../apps/web/src/routes/api.berkas-process.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/file-metadata.ts](../../apps/web/src/lib/file-metadata.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Package imports: `pdf-parse`, `pocketbase`.

Literal database references: `file_extractions`, `file_library`, `users`.

## routes/api.berkas-restore.ts

Source: [apps/web/src/routes/api.berkas-restore.ts](../../apps/web/src/routes/api.berkas-restore.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/berkas-versions.server.ts](../../apps/web/src/lib/berkas-versions.server.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `file_extractions`, `file_library`, `file_versions`.

## routes/api.berkas-snapshot.ts

Source: [apps/web/src/routes/api.berkas-snapshot.ts](../../apps/web/src/routes/api.berkas-snapshot.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/berkas-versions.server.ts](../../apps/web/src/lib/berkas-versions.server.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `file_library`.

## routes/api.berkas-suggest.ts

Source: [apps/web/src/routes/api.berkas-suggest.ts](../../apps/web/src/routes/api.berkas-suggest.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/berkas-versions.server.ts](../../apps/web/src/lib/berkas-versions.server.ts), [apps/web/src/lib/context-suggestions.server.ts](../../apps/web/src/lib/context-suggestions.server.ts).

## routes/api.bulk-paper-extract.ts

Source: [apps/web/src/routes/api.bulk-paper-extract.ts](../../apps/web/src/routes/api.bulk-paper-extract.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/bulk-paper.server.ts](../../apps/web/src/lib/bulk-paper.server.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `assignments`.

## routes/api.bulk-paper-prepare.ts

Source: [apps/web/src/routes/api.bulk-paper-prepare.ts](../../apps/web/src/routes/api.bulk-paper-prepare.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/bulk-paper.server.ts](../../apps/web/src/lib/bulk-paper.server.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `assignments`.

## routes/api.bulk-paper-submit.ts

Source: [apps/web/src/routes/api.bulk-paper-submit.ts](../../apps/web/src/routes/api.bulk-paper-submit.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/bulk-paper.server.ts](../../apps/web/src/lib/bulk-paper.server.ts), [apps/web/src/lib/bulk-paper.ts](../../apps/web/src/lib/bulk-paper.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `assignments`.

## routes/api.check-answer.ts

Source: [apps/web/src/routes/api.check-answer.ts](../../apps/web/src/routes/api.check-answer.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/ai-policy.server.ts](../../apps/web/src/lib/ai-policy.server.ts), [apps/web/src/lib/ai-policy.ts](../../apps/web/src/lib/ai-policy.ts), [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/cefr-level.ts](../../apps/web/src/lib/cefr-level.ts), [apps/web/src/lib/check-answer.server.ts](../../apps/web/src/lib/check-answer.server.ts), [apps/web/src/lib/check-types.ts](../../apps/web/src/lib/check-types.ts), [apps/web/src/lib/feedback.server.ts](../../apps/web/src/lib/feedback.server.ts), [apps/web/src/lib/learner-profile.server.ts](../../apps/web/src/lib/learner-profile.server.ts), [apps/web/src/lib/logger.server.ts](../../apps/web/src/lib/logger.server.ts), [apps/web/src/lib/personalization.server.ts](../../apps/web/src/lib/personalization.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/public-drafts.server.ts](../../apps/web/src/lib/public-drafts.server.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `pocketbase`.

Literal database references: `assignment_submissions`, `assignments`, `check_attempts`, `courses`, `personalization_logs`, `public_submissions`, `users`.

## routes/api.context-check.ts

Source: [apps/web/src/routes/api.context-check.ts](../../apps/web/src/routes/api.context-check.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/public-drafts.server.ts](../../apps/web/src/lib/public-drafts.server.ts).

Literal database references: `assignments`.

## routes/api.context-insights.ts

Source: [apps/web/src/routes/api.context-insights.ts](../../apps/web/src/routes/api.context-insights.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/berkas-versions.server.ts](../../apps/web/src/lib/berkas-versions.server.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `assignments`, `courses`.

## routes/api.context-material.ts

Source: [apps/web/src/routes/api.context-material.ts](../../apps/web/src/routes/api.context-material.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `courses`, `enrollments`.

## routes/api.conversation-practice.ts

Source: [apps/web/src/routes/api.conversation-practice.ts](../../apps/web/src/routes/api.conversation-practice.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/ai-usage.server.ts](../../apps/web/src/lib/ai-usage.server.ts), [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/conversation-turns.ts](../../apps/web/src/lib/conversation-turns.ts), [apps/web/src/lib/elevenlabs-tts.server.ts](../../apps/web/src/lib/elevenlabs-tts.server.ts), [apps/web/src/lib/feedback.server.ts](../../apps/web/src/lib/feedback.server.ts), [apps/web/src/lib/hostinger-model.server.ts](../../apps/web/src/lib/hostinger-model.server.ts), [apps/web/src/lib/hostinger-tts.server.ts](../../apps/web/src/lib/hostinger-tts.server.ts), [apps/web/src/lib/personal-practice.server.ts](../../apps/web/src/lib/personal-practice.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/rate-limit.server.ts](../../apps/web/src/lib/rate-limit.server.ts).

Package imports: `zod`.

Literal database references: `student_conversation_reflections`.

## routes/api.course-grade-summary.ts

Source: [apps/web/src/routes/api.course-grade-summary.ts](../../apps/web/src/routes/api.course-grade-summary.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/gradebook.ts](../../apps/web/src/lib/gradebook.ts), [apps/web/src/lib/grouped-gradebook.ts](../../apps/web/src/lib/grouped-gradebook.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `enrollments`.

## routes/api.course-thumbnail.ts

Source: [apps/web/src/routes/api.course-thumbnail.ts](../../apps/web/src/routes/api.course-thumbnail.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/course-thumbnail.server.ts](../../apps/web/src/lib/course-thumbnail.server.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

Literal database references: `courses`.

## routes/api.evaluation-annotation.ts

Source: [apps/web/src/routes/api.evaluation-annotation.ts](../../apps/web/src/routes/api.evaluation-annotation.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/evaluation-annotation.server.ts](../../apps/web/src/lib/evaluation-annotation.server.ts).

## routes/api.evaluation-draft.ts

Source: [apps/web/src/routes/api.evaluation-draft.ts](../../apps/web/src/routes/api.evaluation-draft.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/ai-evaluation.server.ts](../../apps/web/src/lib/ai-evaluation.server.ts), [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `assignment_submissions`, `assignments`, `public_submissions`.

## routes/api.evaluation-missed-error.ts

Source: [apps/web/src/routes/api.evaluation-missed-error.ts](../../apps/web/src/routes/api.evaluation-missed-error.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/evaluation-annotation.server.ts](../../apps/web/src/lib/evaluation-annotation.server.ts).

## routes/api.evaluation-participants.ts

Source: [apps/web/src/routes/api.evaluation-participants.ts](../../apps/web/src/routes/api.evaluation-participants.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `assignments`.

## routes/api.evaluation-publish.ts

Source: [apps/web/src/routes/api.evaluation-publish.ts](../../apps/web/src/routes/api.evaluation-publish.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/ai-evaluation.ts](../../apps/web/src/lib/ai-evaluation.ts), [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/evaluation-review.server.ts](../../apps/web/src/lib/evaluation-review.server.ts), [apps/web/src/lib/evaluation-scoring.ts](../../apps/web/src/lib/evaluation-scoring.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `ai_evaluations`.

## routes/api.evaluation-result.ts

Source: [apps/web/src/routes/api.evaluation-result.ts](../../apps/web/src/routes/api.evaluation-result.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/ai-evaluation.ts](../../apps/web/src/lib/ai-evaluation.ts), [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/evaluation-scoring.ts](../../apps/web/src/lib/evaluation-scoring.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `assignment_submissions`.

## routes/api.evaluation-review.ts

Source: [apps/web/src/routes/api.evaluation-review.ts](../../apps/web/src/routes/api.evaluation-review.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/evaluation-review.server.ts](../../apps/web/src/lib/evaluation-review.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `ai_evaluations`.

## routes/api.feedback-uptake.ts

Source: [apps/web/src/routes/api.feedback-uptake.ts](../../apps/web/src/routes/api.feedback-uptake.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/feedback-uptake.server.ts](../../apps/web/src/lib/feedback-uptake.server.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts).

## routes/api.feedback.ts

Source: [apps/web/src/routes/api.feedback.ts](../../apps/web/src/routes/api.feedback.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/feedback.server.ts](../../apps/web/src/lib/feedback.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `pocketbase`.

Literal database references: `ai_feedback`, `assignment_submissions`, `assignments`, `users`.

## routes/api.health.ts

Source: [apps/web/src/routes/api.health.ts](../../apps/web/src/routes/api.health.ts)

Exports: `loader`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts).

## routes/api.integrated-ai.stream.ts

Source: [apps/web/src/routes/api.integrated-ai.stream.ts](../../apps/web/src/routes/api.integrated-ai.stream.ts)

Exports: `action`.

Local dependencies: [apps/web/src/constants/ai-assistant.config.ts](../../apps/web/src/constants/ai-assistant.config.ts), [apps/web/src/lib/ai-usage.server.ts](../../apps/web/src/lib/ai-usage.server.ts), [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/integrated-ai.server.ts](../../apps/web/src/lib/integrated-ai.server.ts).

## routes/api.lesson-plans.ts

Source: [apps/web/src/routes/api.lesson-plans.ts](../../apps/web/src/routes/api.lesson-plans.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/lesson-plans.server.ts](../../apps/web/src/lib/lesson-plans.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `cpmk`, `file_library`, `sub_cpmk`.

## routes/api.personal-practice.ts

Source: [apps/web/src/routes/api.personal-practice.ts](../../apps/web/src/routes/api.personal-practice.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/personal-practice.server.ts](../../apps/web/src/lib/personal-practice.server.ts), [apps/web/src/lib/rate-limit.server.ts](../../apps/web/src/lib/rate-limit.server.ts).

## routes/api.personalization-analytics.ts

Source: [apps/web/src/routes/api.personalization-analytics.ts](../../apps/web/src/routes/api.personalization-analytics.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/personalization-analytics.server.ts](../../apps/web/src/lib/personalization-analytics.server.ts).

## routes/api.practice-assist.ts

Source: [apps/web/src/routes/api.practice-assist.ts](../../apps/web/src/routes/api.practice-assist.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/ai-policy.server.ts](../../apps/web/src/lib/ai-policy.server.ts), [apps/web/src/lib/ai-policy.ts](../../apps/web/src/lib/ai-policy.ts), [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/check-answer.server.ts](../../apps/web/src/lib/check-answer.server.ts), [apps/web/src/lib/check-types.ts](../../apps/web/src/lib/check-types.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/feedback.server.ts](../../apps/web/src/lib/feedback.server.ts), [apps/web/src/lib/practice-assist.server.ts](../../apps/web/src/lib/practice-assist.server.ts), [apps/web/src/lib/rate-limit.server.ts](../../apps/web/src/lib/rate-limit.server.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Literal database references: `assignments`.

## routes/api.practice-speaking.ts

Source: [apps/web/src/routes/api.practice-speaking.ts](../../apps/web/src/routes/api.practice-speaking.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/ai-policy.server.ts](../../apps/web/src/lib/ai-policy.server.ts), [apps/web/src/lib/ai-policy.ts](../../apps/web/src/lib/ai-policy.ts), [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/feedback.server.ts](../../apps/web/src/lib/feedback.server.ts), [apps/web/src/lib/practice-assist.server.ts](../../apps/web/src/lib/practice-assist.server.ts), [apps/web/src/lib/rate-limit.server.ts](../../apps/web/src/lib/rate-limit.server.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Literal database references: `assignment_submissions`, `assignments`.

## routes/api.recommendations-generate.ts

Source: [apps/web/src/routes/api.recommendations-generate.ts](../../apps/web/src/routes/api.recommendations-generate.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/berkas-versions.server.ts](../../apps/web/src/lib/berkas-versions.server.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/lecturer-recommendations.server.ts](../../apps/web/src/lib/lecturer-recommendations.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `assignments`, `courses`, `lecturer_recommendations`.

## routes/api.recommendations-review.ts

Source: [apps/web/src/routes/api.recommendations-review.ts](../../apps/web/src/routes/api.recommendations-review.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/berkas-versions.server.ts](../../apps/web/src/lib/berkas-versions.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts).

Literal database references: `lecturer_recommendations`.

## routes/api.recovery-email-request-reset.ts

Source: [apps/web/src/routes/api.recovery-email-request-reset.ts](../../apps/web/src/routes/api.recovery-email-request-reset.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/student-onboarding.server.ts](../../apps/web/src/lib/student-onboarding.server.ts).

Literal database references: `password_resets`, `users`.

## routes/api.recovery-email-request.ts

Source: [apps/web/src/routes/api.recovery-email-request.ts](../../apps/web/src/routes/api.recovery-email-request.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/student-onboarding.server.ts](../../apps/web/src/lib/student-onboarding.server.ts).

Literal database references: `email_verifications`, `users`.

## routes/api.recovery-email-reset-password.ts

Source: [apps/web/src/routes/api.recovery-email-reset-password.ts](../../apps/web/src/routes/api.recovery-email-reset-password.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/student-onboarding.server.ts](../../apps/web/src/lib/student-onboarding.server.ts).

Literal database references: `password_resets`, `users`.

## routes/api.recovery-email-verify.ts

Source: [apps/web/src/routes/api.recovery-email-verify.ts](../../apps/web/src/routes/api.recovery-email-verify.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/student-onboarding.server.ts](../../apps/web/src/lib/student-onboarding.server.ts).

Literal database references: `email_verifications`, `users`.

## routes/api.research-analytics.ts

Source: [apps/web/src/routes/api.research-analytics.ts](../../apps/web/src/routes/api.research-analytics.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/research-analytics.server.ts](../../apps/web/src/lib/research-analytics.server.ts).

## routes/api.research-export.ts

Source: [apps/web/src/routes/api.research-export.ts](../../apps/web/src/routes/api.research-export.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/feedback-uptake.server.ts](../../apps/web/src/lib/feedback-uptake.server.ts), [apps/web/src/lib/research-export.server.ts](../../apps/web/src/lib/research-export.server.ts).

## routes/api.roster-enroll.ts

Source: [apps/web/src/routes/api.roster-enroll.ts](../../apps/web/src/routes/api.roster-enroll.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/public-linking.server.ts](../../apps/web/src/lib/public-linking.server.ts), [apps/web/src/lib/roster-audit.server.ts](../../apps/web/src/lib/roster-audit.server.ts).

Package imports: `node:crypto`, `pocketbase`.

Literal database references: `course_roster`, `courses`, `enrollments`, `users`.

## routes/api.roster-language.ts

Source: [apps/web/src/routes/api.roster-language.ts](../../apps/web/src/routes/api.roster-language.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/i18n.ts](../../apps/web/src/lib/i18n.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/student-onboarding.server.ts](../../apps/web/src/lib/student-onboarding.server.ts).

Literal database references: `course_roster`, `courses`, `users`.

## routes/api.roster-reset-password.ts

Source: [apps/web/src/routes/api.roster-reset-password.ts](../../apps/web/src/routes/api.roster-reset-password.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/roster-audit.server.ts](../../apps/web/src/lib/roster-audit.server.ts), [apps/web/src/lib/student-onboarding.server.ts](../../apps/web/src/lib/student-onboarding.server.ts).

Package imports: `node:crypto`.

Literal database references: `course_roster`, `courses`, `users`.

## routes/api.roster-status.ts

Source: [apps/web/src/routes/api.roster-status.ts](../../apps/web/src/routes/api.roster-status.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/student-onboarding.server.ts](../../apps/web/src/lib/student-onboarding.server.ts).

Literal database references: `assignments`, `course_roster`, `courses`, `enrollments`, `public_submissions`, `users`.

## routes/api.rps-assist.ts

Source: [apps/web/src/routes/api.rps-assist.ts](../../apps/web/src/routes/api.rps-assist.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/rps-assist.server.ts](../../apps/web/src/lib/rps-assist.server.ts), [apps/web/src/lib/rps-fix.ts](../../apps/web/src/lib/rps-fix.ts), [apps/web/src/lib/rps-validation.ts](../../apps/web/src/lib/rps-validation.ts).

Package imports: `pocketbase`.

Literal database references: `assessments`, `class_sessions`, `courses`, `cpmk`, `sub_cpmk`, `topics`, `users`.

## routes/api.rps-import.ts

Source: [apps/web/src/routes/api.rps-import.ts](../../apps/web/src/routes/api.rps-import.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/rps-parser.server.ts](../../apps/web/src/lib/rps-parser.server.ts), [apps/web/src/lib/rps-pdf-import.server.ts](../../apps/web/src/lib/rps-pdf-import.server.ts).

## routes/api.rubric-suggestions.ts

Source: [apps/web/src/routes/api.rubric-suggestions.ts](../../apps/web/src/routes/api.rubric-suggestions.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/rubric-suggestions.server.ts](../../apps/web/src/lib/rubric-suggestions.server.ts), [apps/web/src/lib/rubric-suggestions.ts](../../apps/web/src/lib/rubric-suggestions.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Literal database references: `assignments`.

## routes/api.student-assistant.ts

Source: [apps/web/src/routes/api.student-assistant.ts](../../apps/web/src/routes/api.student-assistant.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/ai-policy.ts](../../apps/web/src/lib/ai-policy.ts), [apps/web/src/lib/ai-rate-limits.ts](../../apps/web/src/lib/ai-rate-limits.ts), [apps/web/src/lib/ai-usage.server.ts](../../apps/web/src/lib/ai-usage.server.ts), [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/student-assistant-tools.server.ts](../../apps/web/src/lib/student-assistant-tools.server.ts), [apps/web/src/lib/student-assistant.server.ts](../../apps/web/src/lib/student-assistant.server.ts).

Literal database references: `student_assistant_chats`.

## routes/api.student-password.ts

Source: [apps/web/src/routes/api.student-password.ts](../../apps/web/src/routes/api.student-password.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/student-onboarding.server.ts](../../apps/web/src/lib/student-onboarding.server.ts).

Package imports: `pocketbase`.

Literal database references: `users`.

## routes/api.student-profile.ts

Source: [apps/web/src/routes/api.student-profile.ts](../../apps/web/src/routes/api.student-profile.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/student-onboarding.server.ts](../../apps/web/src/lib/student-onboarding.server.ts), [apps/web/src/lib/student-progress.server.ts](../../apps/web/src/lib/student-progress.server.ts).

Literal database references: `assignment_submissions`, `assignments`, `attendance`, `course_roster`, `courses`, `student_conversation_reflections`, `student_learning_profiles`.

## routes/api.task-assist.ts

Source: [apps/web/src/routes/api.task-assist.ts](../../apps/web/src/routes/api.task-assist.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/task-assist.server.ts](../../apps/web/src/lib/task-assist.server.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `pocketbase`.

Literal database references: `assignment_submissions`, `assignments`, `users`.

## routes/api.task-config-draft.ts

Source: [apps/web/src/routes/api.task-config-draft.ts](../../apps/web/src/routes/api.task-config-draft.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/context-retrieval.server.ts](../../apps/web/src/lib/context-retrieval.server.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/task-config-draft.server.ts](../../apps/web/src/lib/task-config-draft.server.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `pocketbase`.

Literal database references: `assessments`, `class_sessions`, `course_resources`, `courses`, `cpl`, `cpmk`, `sub_cpmk`, `users`.

## routes/api.task-submit.ts

Source: [apps/web/src/routes/api.task-submit.ts](../../apps/web/src/routes/api.task-submit.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/ai-evaluation.server.ts](../../apps/web/src/lib/ai-evaluation.server.ts), [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts).

Package imports: `pocketbase`.

Literal database references: `assignment_submissions`, `assignments`, `task_answer_keys`, `users`.

## routes/api.transcribe.ts

Source: [apps/web/src/routes/api.transcribe.ts](../../apps/web/src/routes/api.transcribe.ts)

Exports: `action`.

Local dependencies: [apps/web/src/lib/api.server.ts](../../apps/web/src/lib/api.server.ts), [apps/web/src/lib/assignments.ts](../../apps/web/src/lib/assignments.ts), [apps/web/src/lib/pocketbase-client.server.ts](../../apps/web/src/lib/pocketbase-client.server.ts), [apps/web/src/lib/task-types.ts](../../apps/web/src/lib/task-types.ts), [apps/web/src/lib/transcription.server.ts](../../apps/web/src/lib/transcription.server.ts).

Package imports: `pocketbase`.

Literal database references: `assignment_submissions`, `assignments`, `users`.

## routes/app.asisten.tsx

Source: [apps/web/src/routes/app.asisten.tsx](../../apps/web/src/routes/app.asisten.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/assistant-panel.tsx](../../apps/web/src/components/app/assistant-panel.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react-router`.

## routes/app.berkas.$fileId.tsx

Source: [apps/web/src/routes/app.berkas.$fileId.tsx](../../apps/web/src/routes/app.berkas.$fileId.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/file-context.tsx](../../apps/web/src/components/app/file-context.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react-router`.

## routes/app.berkas.tsx

Source: [apps/web/src/routes/app.berkas.tsx](../../apps/web/src/routes/app.berkas.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/file-library.tsx](../../apps/web/src/components/app/file-library.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react-router`.

## routes/app.coming.$slug.tsx

Source: [apps/web/src/routes/app.coming.$slug.tsx](../../apps/web/src/routes/app.coming.$slug.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `lucide-react`, `react-router`.

## routes/app.courses.tsx

Source: [apps/web/src/routes/app.courses.tsx](../../apps/web/src/routes/app.courses.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/courses-page.tsx](../../apps/web/src/components/app/courses-page.tsx), [apps/web/src/components/app/student-courses.tsx](../../apps/web/src/components/app/student-courses.tsx), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react-router`.

## routes/app.kerja.$assignmentId.tsx

Source: [apps/web/src/routes/app.kerja.$assignmentId.tsx](../../apps/web/src/routes/app.kerja.$assignmentId.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/student-work-page.tsx](../../apps/web/src/components/app/student-work-page.tsx), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react-router`.

## routes/app.latihan.tsx

Source: [apps/web/src/routes/app.latihan.tsx](../../apps/web/src/routes/app.latihan.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/student-practice.tsx](../../apps/web/src/components/app/student-practice.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react-router`.

## routes/app.onboarding.tsx

Source: [apps/web/src/routes/app.onboarding.tsx](../../apps/web/src/routes/app.onboarding.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/student-onboarding.tsx](../../apps/web/src/components/app/student-onboarding.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react-router`.

## routes/app.pengaturan.tsx

Source: [apps/web/src/routes/app.pengaturan.tsx](../../apps/web/src/routes/app.pengaturan.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/settings/settings-page.tsx](../../apps/web/src/components/app/settings/settings-page.tsx), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

## routes/app.penilaian.tsx

Source: [apps/web/src/routes/app.penilaian.tsx](../../apps/web/src/routes/app.penilaian.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/penilaian-index.tsx](../../apps/web/src/components/app/penilaian-index.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react-router`.

## routes/app.riset.tsx

Source: [apps/web/src/routes/app.riset.tsx](../../apps/web/src/routes/app.riset.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/feedback-uptake-review.tsx](../../apps/web/src/components/app/feedback-uptake-review.tsx), [apps/web/src/components/app/personalization-analytics.tsx](../../apps/web/src/components/app/personalization-analytics.tsx), [apps/web/src/components/app/research-analytics.tsx](../../apps/web/src/components/app/research-analytics.tsx), [apps/web/src/components/app/research-export.tsx](../../apps/web/src/components/app/research-export.tsx), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react`, `react-router`.

## routes/app.rps.$courseId.tsx

Source: [apps/web/src/routes/app.rps.$courseId.tsx](../../apps/web/src/routes/app.rps.$courseId.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/rps-editor-page.tsx](../../apps/web/src/components/app/rps-editor-page.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react-router`.

## routes/app.student.tsx

Source: [apps/web/src/routes/app.student.tsx](../../apps/web/src/routes/app.student.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/student-dashboard.tsx](../../apps/web/src/components/app/student-dashboard.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react-router`.

## routes/app.tsx

Source: [apps/web/src/routes/app.tsx](../../apps/web/src/routes/app.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/course-dashboard.tsx](../../apps/web/src/components/app/course-dashboard.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react-router`.

## routes/app.tugas.$assignmentId.pratinjau.tsx

Source: [apps/web/src/routes/app.tugas.$assignmentId.pratinjau.tsx](../../apps/web/src/routes/app.tugas.$assignmentId.pratinjau.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/lecturer-assignment-preview.tsx](../../apps/web/src/components/app/lecturer-assignment-preview.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react-router`.

## routes/app.tugas.$assignmentId.tsx

Source: [apps/web/src/routes/app.tugas.$assignmentId.tsx](../../apps/web/src/routes/app.tugas.$assignmentId.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/evaluation-workspace.tsx](../../apps/web/src/components/app/evaluation-workspace.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react-router`.

## routes/app.tugas.buat.tsx

Source: [apps/web/src/routes/app.tugas.buat.tsx](../../apps/web/src/routes/app.tugas.buat.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/assignment-editor-page.tsx](../../apps/web/src/components/app/assignment-editor-page.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react-router`.

## routes/app.tugas.insights.tsx

Source: [apps/web/src/routes/app.tugas.insights.tsx](../../apps/web/src/routes/app.tugas.insights.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/lecturer-recommendations.tsx](../../apps/web/src/components/app/lecturer-recommendations.tsx), [apps/web/src/components/app/tugas-insights.tsx](../../apps/web/src/components/app/tugas-insights.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react-router`.

## routes/app.tugas.tsx

Source: [apps/web/src/routes/app.tugas.tsx](../../apps/web/src/routes/app.tugas.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/tugas-board.tsx](../../apps/web/src/components/app/tugas-board.tsx), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react-router`.

## routes/course.index.tsx

Source: [apps/web/src/routes/course.index.tsx](../../apps/web/src/routes/course.index.tsx)

Exports: `meta`.

Local dependencies: [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

## routes/course.lesson-plan.tsx

Source: [apps/web/src/routes/course.lesson-plan.tsx](../../apps/web/src/routes/course.lesson-plan.tsx)

Exports: `meta`.

Local dependencies: [apps/web/src/components/app/agent-task-panel.tsx](../../apps/web/src/components/app/agent-task-panel.tsx), [apps/web/src/hooks/use-course-route.ts](../../apps/web/src/hooks/use-course-route.ts), [apps/web/src/lib/agent-tasks.ts](../../apps/web/src/lib/agent-tasks.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/lesson-plans.ts](../../apps/web/src/lib/lesson-plans.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts).

Package imports: `lucide-react`, `react`, `react-router`.

Literal database references: `assistant_lesson_plans`, `class_sessions`, `cpmk`, `file_library`, `lesson_plan_revisions`, `sub_cpmk`.

## routes/course.section.tsx

Source: [apps/web/src/routes/course.section.tsx](../../apps/web/src/routes/course.section.tsx)

Exports: `clientLoader`, `meta`.

Local dependencies: [apps/web/src/lib/course-sections.ts](../../apps/web/src/lib/course-sections.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `react-router`.

## routes/course.student-profile.tsx

Source: [apps/web/src/routes/course.student-profile.tsx](../../apps/web/src/routes/course.student-profile.tsx)

Local dependencies: [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/hooks/use-course-route.ts](../../apps/web/src/hooks/use-course-route.ts), [apps/web/src/lib/learning.ts](../../apps/web/src/lib/learning.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/student-progress.ts](../../apps/web/src/lib/student-progress.ts).

Package imports: `lucide-react`, `react`, `react-router`.

## routes/course.tsx

Source: [apps/web/src/routes/course.tsx](../../apps/web/src/routes/course.tsx)

Exports: `HydrateFallback`, `clientLoader`.

Local dependencies: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/app/course-detail.tsx](../../apps/web/src/components/app/course-detail.tsx), [apps/web/src/components/app/course-rail.tsx](../../apps/web/src/components/app/course-rail.tsx), [apps/web/src/hooks/use-auth.ts](../../apps/web/src/hooks/use-auth.ts), [apps/web/src/hooks/use-course-route.ts](../../apps/web/src/hooks/use-course-route.ts), [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts).

Package imports: `react-router`.

## routes/hcgi.platform.$.ts

Source: [apps/web/src/routes/hcgi.platform.$.ts](../../apps/web/src/routes/hcgi.platform.$.ts)

Exports: `action`, `loader`.

Package imports: `react-router`.

## routes/home.tsx

Source: [apps/web/src/routes/home.tsx](../../apps/web/src/routes/home.tsx)

Exports: `meta`.

Local dependencies: [apps/web/src/components/home/compact-tour.tsx](../../apps/web/src/components/home/compact-tour.tsx), [apps/web/src/components/home/final-cta.tsx](../../apps/web/src/components/home/final-cta.tsx), [apps/web/src/components/home/hero.tsx](../../apps/web/src/components/home/hero.tsx), [apps/web/src/components/home/landing-effects.tsx](../../apps/web/src/components/home/landing-effects.tsx), [apps/web/src/components/home/workspace-preview.tsx](../../apps/web/src/components/home/workspace-preview.tsx), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts), [apps/web/src/styles/landing.css](../../apps/web/src/styles/landing.css).

## routes/kalender.tsx

Source: [apps/web/src/routes/kalender.tsx](../../apps/web/src/routes/kalender.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/components/app/academic-calendar.tsx](../../apps/web/src/components/app/academic-calendar.tsx), [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/lib/require-auth.ts](../../apps/web/src/lib/require-auth.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

## routes/login.tsx

Source: [apps/web/src/routes/login.tsx](../../apps/web/src/routes/login.tsx)

Exports: `meta`.

Local dependencies: [apps/web/src/components/auth/auth-panel.tsx](../../apps/web/src/components/auth/auth-panel.tsx), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

## routes/lupa-sandi.tsx

Source: [apps/web/src/routes/lupa-sandi.tsx](../../apps/web/src/routes/lupa-sandi.tsx)

Exports: `meta`.

Local dependencies: [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `lucide-react`, `react`, `react-router`.

## routes/reset-password.tsx

Source: [apps/web/src/routes/reset-password.tsx](../../apps/web/src/routes/reset-password.tsx)

Exports: `meta`.

Local dependencies: [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `lucide-react`, `react`, `react-router`.

## routes/robots.txt.ts

Source: [apps/web/src/routes/robots.txt.ts](../../apps/web/src/routes/robots.txt.ts)

Exports: `loader`.

Local dependencies: [apps/web/src/lib/site-origin.server.ts](../../apps/web/src/lib/site-origin.server.ts).

## routes/sitemap.xml.ts

Source: [apps/web/src/routes/sitemap.xml.ts](../../apps/web/src/routes/sitemap.xml.ts)

Exports: `loader`.

Local dependencies: [apps/web/src/lib/site-origin.server.ts](../../apps/web/src/lib/site-origin.server.ts).

## routes/tugas.$token.tsx

Source: [apps/web/src/routes/tugas.$token.tsx](../../apps/web/src/routes/tugas.$token.tsx)

Exports: `HydrateFallback`, `clientLoader`, `meta`.

Local dependencies: [apps/web/src/lib/pocketbase-client.ts](../../apps/web/src/lib/pocketbase-client.ts), [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `lucide-react`, `react-router`.

Literal database references: `assignments`.

## routes/verifikasi-email.tsx

Source: [apps/web/src/routes/verifikasi-email.tsx](../../apps/web/src/routes/verifikasi-email.tsx)

Exports: `meta`.

Local dependencies: [apps/web/src/lib/seo.ts](../../apps/web/src/lib/seo.ts).

Package imports: `lucide-react`, `react`, `react-router`.

## routes.ts

Source: [apps/web/src/routes.ts](../../apps/web/src/routes.ts)

Package imports: `@react-router/dev/routes`.

## styles/academic-calendar.css

Source: [apps/web/src/styles/academic-calendar.css](../../apps/web/src/styles/academic-calendar.css)

Imported by: [apps/web/src/components/app/academic-calendar.tsx](../../apps/web/src/components/app/academic-calendar.tsx).

## styles/agent-tasks.css

Source: [apps/web/src/styles/agent-tasks.css](../../apps/web/src/styles/agent-tasks.css)

Imported by: [apps/web/src/root.tsx](../../apps/web/src/root.tsx).

## styles/course-analytics.css

Source: [apps/web/src/styles/course-analytics.css](../../apps/web/src/styles/course-analytics.css)

Imported by: [apps/web/src/components/app/analytics-index.tsx](../../apps/web/src/components/app/analytics-index.tsx), [apps/web/src/components/app/course-analytics.tsx](../../apps/web/src/components/app/course-analytics.tsx).

## styles/dark-overrides.css

Source: [apps/web/src/styles/dark-overrides.css](../../apps/web/src/styles/dark-overrides.css)

Imported by: [apps/web/src/root.tsx](../../apps/web/src/root.tsx).

## styles/landing.css

Source: [apps/web/src/styles/landing.css](../../apps/web/src/styles/landing.css)

Imported by: [apps/web/src/routes/home.tsx](../../apps/web/src/routes/home.tsx).

## styles/lesson-plans.css

Source: [apps/web/src/styles/lesson-plans.css](../../apps/web/src/styles/lesson-plans.css)

Imported by: [apps/web/src/root.tsx](../../apps/web/src/root.tsx).

## styles/login-light.css

Source: [apps/web/src/styles/login-light.css](../../apps/web/src/styles/login-light.css)

Imported by: [apps/web/src/components/app/app-shell.tsx](../../apps/web/src/components/app/app-shell.tsx), [apps/web/src/components/auth/auth-panel.tsx](../../apps/web/src/components/auth/auth-panel.tsx), [apps/web/src/components/site-footer.tsx](../../apps/web/src/components/site-footer.tsx), [apps/web/src/components/site-header.tsx](../../apps/web/src/components/site-header.tsx).

## styles/personal-practice.css

Source: [apps/web/src/styles/personal-practice.css](../../apps/web/src/styles/personal-practice.css)

Imported by: [apps/web/src/root.tsx](../../apps/web/src/root.tsx).

## styles/premium-workspace.css

Source: [apps/web/src/styles/premium-workspace.css](../../apps/web/src/styles/premium-workspace.css)

Imported by: [apps/web/src/root.tsx](../../apps/web/src/root.tsx).

## styles/session-roster.css

Source: [apps/web/src/styles/session-roster.css](../../apps/web/src/styles/session-roster.css)

Imported by: [apps/web/src/components/app/session-roster.tsx](../../apps/web/src/components/app/session-roster.tsx).

## styles/student-home.css

Source: [apps/web/src/styles/student-home.css](../../apps/web/src/styles/student-home.css)

Imported by: [apps/web/src/root.tsx](../../apps/web/src/root.tsx).

## styles/workspace-guide.css

Source: [apps/web/src/styles/workspace-guide.css](../../apps/web/src/styles/workspace-guide.css)

Imported by: [apps/web/src/components/app/workspace-guide.tsx](../../apps/web/src/components/app/workspace-guide.tsx).

## types/css-properties.d.ts

Source: [apps/web/src/types/css-properties.d.ts](../../apps/web/src/types/css-properties.d.ts)

Package imports: `react`.

## types/heic2any.d.ts

Source: [apps/web/src/types/heic2any.d.ts](../../apps/web/src/types/heic2any.d.ts)

## vite-env.d.ts

Source: [apps/web/src/vite-env.d.ts](../../apps/web/src/vite-env.d.ts)

Exports: `bannerAttrs`, `isDev`.
