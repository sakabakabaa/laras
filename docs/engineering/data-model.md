# Data model and schema evolution

PocketBase stores collection records in SQLite and files in its data directory. Migrations define fields, indexes and access rules. Apply migrations in filename order; later changes may replace earlier rules or fields. This index is not a flattened final schema: read all relevant migrations and inspect a safe local instance when changing a collection.

## Domain groups

| Area | Main collections | Meaning |
|---|---|---|
| Identity and enrollment | users, courses, enrollments, course_roster, course_sections | Users and course membership; roster entries and authenticated accounts are distinct |
| Academic plan | cpl, cpmk, sub_cpmk, topics, assessments, class_sessions, collaborative_tasks | CPL → CPMK → Sub-CPMK and week/session planning |
| Assignments | assignments, assignment_submissions, public_submissions, task_answer_keys | Task configuration, enrolled/public answers and marking |
| Materials | file_library, file_extractions, file_versions, file_contexts, context_sections, context_suggestions, context_retrievals | File identity/version, extracted text, reviewed mappings, retrieved evidence |
| AI assessment | ai_evaluations, ai_feedback_items | AI draft, lecturer review and research annotation evidence |
| Feedback/research | check_attempts, ai_feedback, formative_reviews, feedback_revisions, feedback_uptake, research_rater_assignments, personalization_logs | Feedback history, revision uptake and rater workflow; legacy names are not proof of active usage |
| Gradebook | grade_components, grade_entries, grade_publications, grade_overrides | Official course grading aggregation and release |
| Personal practice | personal_practice_settings, personal_practice_rounds, personal_practice_attempts, personal_practice_reports, student_conversation_reflections | Personal activities and saved reflection, separate from assignment grades |
| Assistant | assistant_sessions, assistant_messages, assistant_tool_audits, student_assistant_chats, student_assistant_tool_audits | Conversation state and action audit |
| Planning agents | agent_tasks, agent_task_events, assistant_lesson_plans, lesson_plan_revisions | Workflow leases, events, plans and revision snapshots |
| Learning and access | student_learning_profiles, ai_usage_events, participation_awards, attendance | Preferences, usage limits and class activity |

## Relationships and important distinctions

A course owns its academic plan and sessions. Assignments link to course, session and Sub-CPMK; task-specific rubric/configuration is nested in JSON. Submissions link to assignment and student owner. Public submissions have a separate identity/linking path. AI evaluations link to the assignment and either enrolled or public submission, and have lecturer-private ownership rules. Do not use an ungraded record's default numeric grade as an actual lecturer zero.

Files link to course and optional academic/session scope. Extraction and context records refer to a file version. A restored file and its mappings must remain version-consistent. Context section suitability is the retrieval approval boundary; file context draft state is not equivalent to rejection of all its sections.

Lecturer review fields, AI raw/provenance snapshots and published feedback represent different sources of truth. Superuser access bypasses database rules, requiring endpoint-level authorization. Collection rules must be reviewed together with server callers and custom PocketBase hooks.

## Migration index

| Migration | Literal collection references / created names |
|---|---|
| [apps/pocketbase/pb_migrations/1759383931_initial_app_settings.js](../../apps/pocketbase/pb_migrations/1759383931_initial_app_settings.js) | Settings, dynamic reference or other schema operation |
| [apps/pocketbase/pb_migrations/1764579159_create_superuser.js](../../apps/pocketbase/pb_migrations/1764579159_create_superuser.js) | `_superusers` |
| [apps/pocketbase/pb_migrations/1769159103_disable_auth_alert_superusers.js](../../apps/pocketbase/pb_migrations/1769159103_disable_auth_alert_superusers.js) | `_superusers` |
| [apps/pocketbase/pb_migrations/1769164585_set_rate_limits.js](../../apps/pocketbase/pb_migrations/1769164585_set_rate_limits.js) | Settings, dynamic reference or other schema operation |
| [apps/pocketbase/pb_migrations/1774828800_create_integrated_ai_messages.js](../../apps/pocketbase/pb_migrations/1774828800_create_integrated_ai_messages.js) | `_integratedAiMessages`, `content`, `created`, `id`, `role`, `updated` |
| [apps/pocketbase/pb_migrations/1774828801_create_integrated_ai_images.js](../../apps/pocketbase/pb_migrations/1774828801_create_integrated_ai_images.js) | `_integratedAiImages`, `created`, `file`, `id` |
| [apps/pocketbase/pb_migrations/1774828802_enable_batch_api.js](../../apps/pocketbase/pb_migrations/1774828802_enable_batch_api.js) | Settings, dynamic reference or other schema operation |
| [apps/pocketbase/pb_migrations/1775709407_disable_auth_alert_users.js](../../apps/pocketbase/pb_migrations/1775709407_disable_auth_alert_users.js) | `users` |
| [apps/pocketbase/pb_migrations/1790619611_create_learning_collections.js](../../apps/pocketbase/pb_migrations/1790619611_create_learning_collections.js) | `class_sessions`, `code`, `completed`, `course`, `courses`, `created`, `date`, `description`, `notes`, `owner`, `rps`, `semester`, `syllabus`, `title`, `topic`, `updated`, `users`, `week` |
| [apps/pocketbase/pb_migrations/1790621200_add_role_and_enrollments.js](../../apps/pocketbase/pb_migrations/1790621200_add_role_and_enrollments.js) | `class_sessions`, `course`, `courses`, `created`, `enrollments`, `owner`, `role`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1790625756_add_rps_file_to_courses.js](../../apps/pocketbase/pb_migrations/1790625756_add_rps_file_to_courses.js) | `courses` |
| [apps/pocketbase/pb_migrations/1790627800_create_structured_rps_records.js](../../apps/pocketbase/pb_migrations/1790627800_create_structured_rps_records.js) | `assessments`, `class_sessions`, `code`, `course`, `courses`, `cpl`, `cpmk`, `created`, `description`, `order`, `owner`, `sub_cpmk`, `topics`, `updated`, `users`, `weight` |
| [apps/pocketbase/pb_migrations/1790629958_rps_editor_fields.js](../../apps/pocketbase/pb_migrations/1790629958_rps_editor_fields.js) | `assessments`, `collaborative_tasks`, `course`, `courses`, `cpl`, `cpmk`, `created`, `description`, `objectives`, `order`, `owner`, `schedule`, `sub_cpmk`, `title`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1790638000_weekly_plan_fields.js](../../apps/pocketbase/pb_migrations/1790638000_weekly_plan_fields.js) | `class_sessions`, `duration`, `references` |
| [apps/pocketbase/pb_migrations/1790641000_create_course_resources.js](../../apps/pocketbase/pb_migrations/1790641000_create_course_resources.js) | `class_sessions`, `course`, `course_resources`, `courses`, `created`, `description`, `file`, `kind`, `owner`, `session`, `title`, `updated`, `url`, `users` |
| [apps/pocketbase/pb_migrations/1790693000_create_assignments.js](../../apps/pocketbase/pb_migrations/1790693000_create_assignments.js) | `assignment`, `assignment_submissions`, `assignments`, `attachments`, `class_sessions`, `content`, `course`, `course_resources`, `courses`, `created`, `deadline`, `feedback`, `files`, `grade`, `group`, `instructions`, `link`, `mode`, `owner`, `requirements`, `session`, `stages`, `status`, `sub_cpmk`, `title`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1790694176_add_shape_to_assignments.js](../../apps/pocketbase/pb_migrations/1790694176_add_shape_to_assignments.js) | `assignments`, `shape` |
| [apps/pocketbase/pb_migrations/1790695050_raise_rps_text_limits.js](../../apps/pocketbase/pb_migrations/1790695050_raise_rps_text_limits.js) | `courses` |
| [apps/pocketbase/pb_migrations/1790696800_task_type_foundation.js](../../apps/pocketbase/pb_migrations/1790696800_task_type_foundation.js) | `assignment`, `assignment_submissions`, `assignments`, `created`, `key`, `task_answer_keys`, `updated` |
| [apps/pocketbase/pb_migrations/1790700484_language_tasks_and_public_access.js](../../apps/pocketbase/pb_migrations/1790700484_language_tasks_and_public_access.js) | `assignment`, `assignments`, `content`, `created`, `feedback`, `files`, `grade`, `link`, `members`, `nim`, `public_submissions`, `status`, `updated` |
| [apps/pocketbase/pb_migrations/1790703100_create_ai_feedback.js](../../apps/pocketbase/pb_migrations/1790703100_create_ai_feedback.js) | `ai_feedback`, `area`, `assignment`, `assignment_submissions`, `assignments`, `attempt`, `created`, `criteria`, `evidence`, `extracted`, `focus`, `hint`, `level`, `owner`, `released`, `review`, `status`, `submission`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1790704890_create_check_attempts.js](../../apps/pocketbase/pb_migrations/1790704890_create_check_attempts.js) | `area`, `assignment`, `assignment_submissions`, `assignments`, `attempt`, `channel`, `check_attempts`, `created`, `criteria`, `evidence`, `extracted`, `feedback`, `focus`, `owner`, `submission`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1790712200_add_level_to_check_attempts.js](../../apps/pocketbase/pb_migrations/1790712200_add_level_to_check_attempts.js) | `check_attempts`, `level` |
| [apps/pocketbase/pb_migrations/1790713888_public_drafts_phase3.js](../../apps/pocketbase/pb_migrations/1790713888_public_drafts_phase3.js) | `public_submissions` |
| [apps/pocketbase/pb_migrations/1790718200_enable_check_by_default.js](../../apps/pocketbase/pb_migrations/1790718200_enable_check_by_default.js) | Settings, dynamic reference or other schema operation |
| [apps/pocketbase/pb_migrations/1790743691_add_course_thumbnail.js](../../apps/pocketbase/pb_migrations/1790743691_add_course_thumbnail.js) | `courses`, `thumbnail` |
| [apps/pocketbase/pb_migrations/1790745400_create_file_library.js](../../apps/pocketbase/pb_migrations/1790745400_create_file_library.js) | `access`, `class_sessions`, `course`, `courses`, `cpmk`, `created`, `description`, `file`, `file_library`, `owner`, `session`, `size`, `status`, `sub_cpmk`, `title`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1790746000_file_library_500mb_required_course.js](../../apps/pocketbase/pb_migrations/1790746000_file_library_500mb_required_course.js) | `file_library` |
| [apps/pocketbase/pb_migrations/1790746460_create_file_extractions.js](../../apps/pocketbase/pb_migrations/1790746460_create_file_extractions.js) | `chars`, `created`, `file`, `file_extractions`, `file_library`, `language`, `owner`, `pages`, `status`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1790747700_file_versions_phase3.js](../../apps/pocketbase/pb_migrations/1790747700_file_versions_phase3.js) | `chars`, `created`, `file`, `file_extractions`, `file_library`, `file_versions`, `filename`, `language`, `owner`, `pages`, `size`, `status`, `updated`, `users`, `version` |
| [apps/pocketbase/pb_migrations/1790748500_file_contexts_phase4.js](../../apps/pocketbase/pb_migrations/1790748500_file_contexts_phase4.js) | `class_sessions`, `context_sections`, `cpmk`, `created`, `file`, `file_contexts`, `file_library`, `label`, `language`, `note`, `order`, `owner`, `session`, `status`, `sub_cpmk`, `topics`, `updated`, `users`, `version` |
| [apps/pocketbase/pb_migrations/1790749300_context_retrieval_phase5.js](../../apps/pocketbase/pb_migrations/1790749300_context_retrieval_phase5.js) | `context_retrievals`, `created`, `feature`, `owner`, `reason`, `requester`, `result`, `scope`, `sources`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1790750000_lecturer_recommendations_phase6.js](../../apps/pocketbase/pb_migrations/1790750000_lecturer_recommendations_phase6.js) | `action`, `audit`, `created`, `evidence`, `interpretation`, `lecturer_recommendations`, `note`, `observed`, `owner`, `scope`, `signal`, `status`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1790760577_activity_type_phase1.js](../../apps/pocketbase/pb_migrations/1790760577_activity_type_phase1.js) | `assignments` |
| [apps/pocketbase/pb_migrations/1790762067_allow_revision_phase2.js](../../apps/pocketbase/pb_migrations/1790762067_allow_revision_phase2.js) | `assignments` |
| [apps/pocketbase/pb_migrations/1790767000_create_ai_evaluations.js](../../apps/pocketbase/pb_migrations/1790767000_create_ai_evaluations.js) | `ai_evaluations`, `assignment`, `assignment_submissions`, `assignments`, `citations`, `created`, `findings`, `owner`, `public_submissions`, `reason`, `result`, `status`, `submission`, `summary`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1790768000_evaluation_review_phase2.js](../../apps/pocketbase/pb_migrations/1790768000_evaluation_review_phase2.js) | `ai_evaluations` |
| [apps/pocketbase/pb_migrations/1790769000_evaluation_publish_phase3.js](../../apps/pocketbase/pb_migrations/1790769000_evaluation_publish_phase3.js) | `ai_evaluations` |
| [apps/pocketbase/pb_migrations/1790825100_parent_assignment_batch1.js](../../apps/pocketbase/pb_migrations/1790825100_parent_assignment_batch1.js) | `assignments` |
| [apps/pocketbase/pb_migrations/1790828060_practice_ai_assist_batch3.js](../../apps/pocketbase/pb_migrations/1790828060_practice_ai_assist_batch3.js) | `assignments` |
| [apps/pocketbase/pb_migrations/1790839000_context_suggestions_phase7.js](../../apps/pocketbase/pb_migrations/1790839000_context_suggestions_phase7.js) | `class_sessions`, `context_suggestions`, `course`, `courses`, `cpmk`, `created`, `file`, `file_library`, `kind`, `label`, `note`, `owner`, `review`, `session`, `sub_cpmk`, `updated`, `users`, `version` |
| [apps/pocketbase/pb_migrations/1790845000_speaking_audio_mime_types.js](../../apps/pocketbase/pb_migrations/1790845000_speaking_audio_mime_types.js) | Settings, dynamic reference or other schema operation |
| [apps/pocketbase/pb_migrations/1790845100_speaking_transcript_phase2.js](../../apps/pocketbase/pb_migrations/1790845100_speaking_transcript_phase2.js) | `assignment_submissions`, `transcript` |
| [apps/pocketbase/pb_migrations/1790859000_attachments_to_file_library.js](../../apps/pocketbase/pb_migrations/1790859000_attachments_to_file_library.js) | `assignments`, `attachments`, `course_resources`, `file_library` |
| [apps/pocketbase/pb_migrations/1790862000_create_course_roster.js](../../apps/pocketbase/pb_migrations/1790862000_create_course_roster.js) | `course`, `course_roster`, `courses`, `created`, `name`, `nim`, `owner`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1790862800_add_nim_to_users.js](../../apps/pocketbase/pb_migrations/1790862800_add_nim_to_users.js) | `nim`, `users` |
| [apps/pocketbase/pb_migrations/1790863300_student_onboarding_phase3.js](../../apps/pocketbase/pb_migrations/1790863300_student_onboarding_phase3.js) | `created`, `email`, `email_verifications`, `owner`, `token`, `users`, `verified` |
| [apps/pocketbase/pb_migrations/1790864000_link_public_answers_phase4.js](../../apps/pocketbase/pb_migrations/1790864000_link_public_answers_phase4.js) | `assignment_submissions`, `public_submissions`, `users` |
| [apps/pocketbase/pb_migrations/1790865000_password_reset_phase5.js](../../apps/pocketbase/pb_migrations/1790865000_password_reset_phase5.js) | `created`, `email`, `owner`, `password_resets`, `token`, `used`, `users` |
| [apps/pocketbase/pb_migrations/1790865400_roster_audit_phase6.js](../../apps/pocketbase/pb_migrations/1790865400_roster_audit_phase6.js) | `action`, `assignment`, `assignments`, `course`, `courses`, `created`, `detail`, `nim`, `outcome`, `owner`, `roster_audit`, `users` |
| [apps/pocketbase/pb_migrations/1790948000_create_formative_reviews.js](../../apps/pocketbase/pb_migrations/1790948000_create_formative_reviews.js) | `assignment`, `assignment_submissions`, `assignments`, `channel`, `created`, `findings`, `formative_reviews`, `owner`, `strengths`, `submission`, `updated`, `users`, `weaknesses` |
| [apps/pocketbase/pb_migrations/1790999300_student_materi_visibility.js](../../apps/pocketbase/pb_migrations/1790999300_student_materi_visibility.js) | `file_library` |
| [apps/pocketbase/pb_migrations/1791001000_create_assistant_conversations.js](../../apps/pocketbase/pb_migrations/1791001000_create_assistant_conversations.js) | `assistant_conversations`, `content`, `created`, `owner`, `role`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1791013000_backfill_session_dates.js](../../apps/pocketbase/pb_migrations/1791013000_backfill_session_dates.js) | Settings, dynamic reference or other schema operation |
| [apps/pocketbase/pb_migrations/1791020000_create_course_sections.js](../../apps/pocketbase/pb_migrations/1791020000_create_course_sections.js) | `course`, `course_sections`, `courses`, `created`, `name`, `owner`, `section`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1791030000_migrate_a1jr241_to_kelas_a.js](../../apps/pocketbase/pb_migrations/1791030000_migrate_a1jr241_to_kelas_a.js) | `course_sections` |
| [apps/pocketbase/pb_migrations/1791030001_create_attendance.js](../../apps/pocketbase/pb_migrations/1791030001_create_attendance.js) | `attendance`, `class_sessions`, `course_roster`, `course_sections`, `created`, `note`, `owner`, `roster`, `section`, `session`, `status`, `student`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1791040000_upi_standard_rps_fields.js](../../apps/pocketbase/pb_migrations/1791040000_upi_standard_rps_fields.js) | `criteria`, `indicators`, `method`, `notes`, `outputs`, `steps`, `taxonomy`, `weight` |
| [apps/pocketbase/pb_migrations/1791080000_scoring_v2_confidence.js](../../apps/pocketbase/pb_migrations/1791080000_scoring_v2_confidence.js) | `ai_evaluations`, `assignment_submissions` |
| [apps/pocketbase/pb_migrations/1791090000_add_suggested_criteria.js](../../apps/pocketbase/pb_migrations/1791090000_add_suggested_criteria.js) | `assignments` |
| [apps/pocketbase/pb_migrations/1791100000_ai_evaluation_raw_output.js](../../apps/pocketbase/pb_migrations/1791100000_ai_evaluation_raw_output.js) | `ai_evaluations` |
| [apps/pocketbase/pb_migrations/1791100000_create_ai_feedback_items.js](../../apps/pocketbase/pb_migrations/1791100000_create_ai_feedback_items.js) | `ai_evaluations`, `ai_feedback_items`, `assignment`, `assignment_submissions`, `assignments`, `created`, `evaluation`, `origin`, `owner`, `quote`, `reviewer`, `submission`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1791110000_ai_evaluation_provenance_phase5.js](../../apps/pocketbase/pb_migrations/1791110000_ai_evaluation_provenance_phase5.js) | `ai_evaluations` |
| [apps/pocketbase/pb_migrations/1791120000_phase8_feedback_levels.js](../../apps/pocketbase/pb_migrations/1791120000_phase8_feedback_levels.js) | `check_attempts` |
| [apps/pocketbase/pb_migrations/1791130000_phase9_feedback_uptake.js](../../apps/pocketbase/pb_migrations/1791130000_phase9_feedback_uptake.js) | `assignment`, `assignment_submissions`, `assignments`, `check_attempts`, `created`, `feedback_revisions`, `feedback_uptake`, `owner`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1791140000_phase10_personalization.js](../../apps/pocketbase/pb_migrations/1791140000_phase10_personalization.js) | `assignment`, `assignments`, `created`, `model`, `owner`, `personalization_logs`, `users` |
| [apps/pocketbase/pb_migrations/1791150000_phase10_2_research_integrity.js](../../apps/pocketbase/pb_migrations/1791150000_phase10_2_research_integrity.js) | `ai_feedback_items`, `personalization_logs` |
| [apps/pocketbase/pb_migrations/1791160000_create_assistant_sessions.js](../../apps/pocketbase/pb_migrations/1791160000_create_assistant_sessions.js) | `assistant_conversations`, `assistant_messages`, `assistant_sessions`, `content`, `created`, `feature`, `owner`, `role`, `session`, `status`, `summary`, `title`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1791170000_assistant_session_compaction_fields.js](../../apps/pocketbase/pb_migrations/1791170000_assistant_session_compaction_fields.js) | `assistant_sessions` |
| [apps/pocketbase/pb_migrations/1791180000_assistant_tool_audits.js](../../apps/pocketbase/pb_migrations/1791180000_assistant_tool_audits.js) | `args`, `assistant_messages`, `assistant_sessions`, `assistant_tool_audits`, `created`, `message`, `owner`, `session`, `status`, `tool`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1791200000_add_language_to_users.js](../../apps/pocketbase/pb_migrations/1791200000_add_language_to_users.js) | `language`, `users` |
| [apps/pocketbase/pb_migrations/1791215000_add_ai_policy_to_assignments.js](../../apps/pocketbase/pb_migrations/1791215000_add_ai_policy_to_assignments.js) | `assignments` |
| [apps/pocketbase/pb_migrations/1791220000_create_student_assistant_chats.js](../../apps/pocketbase/pb_migrations/1791220000_create_student_assistant_chats.js) | `assignment`, `assignments`, `course`, `courses`, `created`, `messages`, `owner`, `student_assistant_chats`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1791230000_create_student_assistant_tool_audits.js](../../apps/pocketbase/pb_migrations/1791230000_create_student_assistant_tool_audits.js) | `assignment`, `assignments`, `capability`, `course`, `courses`, `created`, `owner`, `params`, `result`, `student_assistant_tool_audits`, `tool`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1791240000_create_ai_usage_events.js](../../apps/pocketbase/pb_migrations/1791240000_create_ai_usage_events.js) | `ai_usage_events`, `allowed`, `assignment`, `capability`, `created`, `owner`, `role`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1791287000_create_gradebook.js](../../apps/pocketbase/pb_migrations/1791287000_create_gradebook.js) | `assignment`, `assignments`, `component`, `course`, `courses`, `created`, `description`, `grade_components`, `grade_entries`, `grade_overrides`, `grade_publications`, `kind`, `name`, `note`, `order`, `owner`, `source`, `status`, `student`, `updated`, `users`, `value`, `weight` |
| [apps/pocketbase/pb_migrations/1791288200_enrollments_owner_read.js](../../apps/pocketbase/pb_migrations/1791288200_enrollments_owner_read.js) | `enrollments` |
| [apps/pocketbase/pb_migrations/1791317000_add_anchor_error_to_feedback_items.js](../../apps/pocketbase/pb_migrations/1791317000_add_anchor_error_to_feedback_items.js) | `ai_feedback_items` |
| [apps/pocketbase/pb_migrations/1791320000_ai_evaluation_evidence_snapshots.js](../../apps/pocketbase/pb_migrations/1791320000_ai_evaluation_evidence_snapshots.js) | `ai_evaluations` |
| [apps/pocketbase/pb_migrations/1791321000_research_rater_access.js](../../apps/pocketbase/pb_migrations/1791321000_research_rater_access.js) | `active`, `ai_feedback_items`, `assignment`, `assignments`, `key`, `research_annotation_locks`, `research_rater_assignments`, `reviewer`, `round`, `users` |
| [apps/pocketbase/pb_migrations/1791450000_personal_practice.js](../../apps/pocketbase/pb_migrations/1791450000_personal_practice.js) | `answer`, `context_sections`, `courses`, `created`, `enabled`, `language`, `level`, `ordinal`, `payload`, `personal_practice_rounds`, `preview`, `result`, `status`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1791450100_practice_sources_reports.js](../../apps/pocketbase/pb_migrations/1791450100_practice_sources_reports.js) | `class_sessions`, `context_sections`, `created`, `ordinal`, `personal_practice_reports`, `personal_practice_rounds`, `reason`, `round` |
| [apps/pocketbase/pb_migrations/1791450200_rubric_achievement.js](../../apps/pocketbase/pb_migrations/1791450200_rubric_achievement.js) | `ai_evaluations` |
| [apps/pocketbase/pb_migrations/1791450300_grouped_assessment.js](../../apps/pocketbase/pb_migrations/1791450300_grouped_assessment.js) | Settings, dynamic reference or other schema operation |
| [apps/pocketbase/pb_migrations/1791450400_attendance_credit.js](../../apps/pocketbase/pb_migrations/1791450400_attendance_credit.js) | `grade_components` |
| [apps/pocketbase/pb_migrations/1791450500_session_participation.js](../../apps/pocketbase/pb_migrations/1791450500_session_participation.js) | `attendance`, `class_sessions`, `participation_awards` |
| [apps/pocketbase/pb_migrations/1791450600_participation_rules.js](../../apps/pocketbase/pb_migrations/1791450600_participation_rules.js) | `created`, `note`, `participation_awards`, `points`, `reason`, `revoked`, `updated` |
| [apps/pocketbase/pb_migrations/1791450700_remove_public_file_access.js](../../apps/pocketbase/pb_migrations/1791450700_remove_public_file_access.js) | `file_library` |
| [apps/pocketbase/pb_migrations/1791450800_student_learning_profiles.js](../../apps/pocketbase/pb_migrations/1791450800_student_learning_profiles.js) | `confidence`, `created`, `goals`, `student`, `student_learning_profiles`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1791450900_learning_guidance_evidence.js](../../apps/pocketbase/pb_migrations/1791450900_learning_guidance_evidence.js) | `attempt`, `created`, `kind`, `personal_practice_attempts`, `personal_practice_interactions`, `student_learning_profiles`, `verdict` |
| [apps/pocketbase/pb_migrations/1791451000_agent_tasks.js](../../apps/pocketbase/pb_migrations/1791451000_agent_tasks.js) | `agent_tasks`, `assistant_lesson_plans`, `attempts`, `course`, `courses`, `created`, `credential`, `error`, `goal`, `kind`, `lease`, `owner`, `payload`, `plan`, `result`, `revision`, `status`, `steps`, `task`, `title`, `updated`, `users` |
| [apps/pocketbase/pb_migrations/1791451100_agent_task_events.js](../../apps/pocketbase/pb_migrations/1791451100_agent_task_events.js) | `action`, `agent_task_events`, `agent_tasks`, `created`, `owner`, `revision`, `status`, `task`, `users` |
| [apps/pocketbase/pb_migrations/1791530000_session_lesson_plans.js](../../apps/pocketbase/pb_migrations/1791530000_session_lesson_plans.js) | `assistant_lesson_plans`, `class_sessions`, `created`, `lesson_plan_revisions`, `origin`, `owner`, `revision`, `session`, `snapshot`, `status`, `users` |
| [apps/pocketbase/pb_migrations/1791540000_create_student_conversation_reflections.js](../../apps/pocketbase/pb_migrations/1791540000_create_student_conversation_reflections.js) | `course`, `courses`, `created`, `language`, `level`, `owner`, `reflection`, `scenario`, `student_conversation_reflections`, `transcript`, `updated`, `users` |

The names column is a literal scan and includes field names in collection definitions. It is a search aid, not a table list.

## Backend hooks

- [apps/pocketbase/pb_hooks/agent-tasks.pb.js](../../apps/pocketbase/pb_hooks/agent-tasks.pb.js)
- [apps/pocketbase/pb_hooks/attendance-student-link.pb.js](../../apps/pocketbase/pb_hooks/attendance-student-link.pb.js)
- [apps/pocketbase/pb_hooks/builder-mailer.pb.js](../../apps/pocketbase/pb_hooks/builder-mailer.pb.js)
- [apps/pocketbase/pb_hooks/custom-migrations-cmd.pb.js](../../apps/pocketbase/pb_hooks/custom-migrations-cmd.pb.js)
- [apps/pocketbase/pb_hooks/external-dashboard.pb.js](../../apps/pocketbase/pb_hooks/external-dashboard.pb.js)
- [apps/pocketbase/pb_hooks/grouped-assessment.js](../../apps/pocketbase/pb_hooks/grouped-assessment.js)
- [apps/pocketbase/pb_hooks/grouped-assessment.pb.js](../../apps/pocketbase/pb_hooks/grouped-assessment.pb.js)
- [apps/pocketbase/pb_hooks/lesson-plans.pb.js](../../apps/pocketbase/pb_hooks/lesson-plans.pb.js)
- [apps/pocketbase/pb_hooks/logs-forwarder.pb.js](../../apps/pocketbase/pb_hooks/logs-forwarder.pb.js)
- [apps/pocketbase/pb_hooks/participation.pb.js](../../apps/pocketbase/pb_hooks/participation.pb.js)
- [apps/pocketbase/pb_hooks/password-reset-send.pb.js](../../apps/pocketbase/pb_hooks/password-reset-send.pb.js)
- [apps/pocketbase/pb_hooks/recovery-email-verify.pb.js](../../apps/pocketbase/pb_hooks/recovery-email-verify.pb.js)
- [apps/pocketbase/pb_hooks/session-completion.js](../../apps/pocketbase/pb_hooks/session-completion.js)
- [apps/pocketbase/pb_hooks/session-completion.pb.js](../../apps/pocketbase/pb_hooks/session-completion.pb.js)
- [apps/pocketbase/pb_hooks/users-send-verification.pb.js](../../apps/pocketbase/pb_hooks/users-send-verification.pb.js)
