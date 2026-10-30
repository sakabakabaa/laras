# Class and term safety

Classes may run in parallel within the parent course's academic year and semester. Cohort (angkatan) describes the student and can differ from that term.

Cross-term reuse is deliberately blocked until enrollments, submissions, grades, overrides and publications all carry a term identity. Create a separate course for a new term. The existing unique course/NIM roster constraint remains in place. Backend hooks enforce the same-term boundary and prevent changing the period of an already populated course.

Chapter component scores are calculated from current chapter definitions and saved completion statuses when read. Adding/removing a chapter or changing the maximum score therefore updates computed grades immediately, without re-marking students. Missing grade entries remain ungraded.
