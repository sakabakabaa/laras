"""Generate navigation indexes from checked-in source; never read .env or live data."""
from pathlib import Path
import re
from collections import defaultdict
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/engineering'
SRC = ROOT / 'apps/web/src'

def link(p):
    rel = p.relative_to(ROOT).as_posix()
    return f'[{rel}](../../{rel})'

def save(name, lines):
    (OUT / name).write_text('\n'.join(lines).rstrip() + '\n')

def imports(p):
    text = p.read_text()
    return re.findall(r'(?:from\s+|import\s*\(|import\s+)[\'\"]([^\'\"]+)', text)

def resolve(p, name):
    if name.startswith('@/'):
        base = SRC / name[2:]
    elif name.startswith('.'):
        base = p.parent / name
    else:
        return None
    base = Path(str(base).split('?')[0])
    for candidate in [base, *[Path(str(base) + ext) for ext in ['.ts', '.tsx', '.js', '.jsx']], base / 'index.ts', base / 'index.tsx']:
        if candidate.is_file():
            return candidate.resolve()
    return None

files = sorted(p for p in SRC.rglob('*') if p.suffix in ('.ts', '.tsx', '.js', '.jsx', '.css'))
reverse = defaultdict(list)
for p in files:
    for name in imports(p):
        target = resolve(p, name)
        if target:
            reverse[target].append(p)
atlas = ['# Source atlas', '', 'Generated with `python3 docs/engineering/generate_indexes.py`. Includes web source modules and styles. Imports are static source references; dynamic calls and computed collection names may not appear. For behavior read the linked implementation, not just this index.', '']
for p in files:
    text = p.read_text()
    local = sorted({q for n in imports(p) if (q := resolve(p, n))})
    external = sorted({n for n in imports(p) if not n.startswith(('.', '@/'))})
    collections = sorted(set(re.findall(r'(?:collection|listRecords|getRecord|createRecord|createRecords|updateRecord|deleteRecord)\s*(?:<[^\n]*?>)?\s*\(\s*[\'\"]([a-z_]+)', text)))
    exports = sorted(set(re.findall(r'export\s+(?:async\s+)?(?:function|const|class|type|interface|enum)\s+(\w+)', text)))
    atlas += [f'## {p.relative_to(SRC).as_posix()}', '', f'Source: {link(p)}', '']
    if exports:
        atlas += ['Exports: ' + ', '.join(f'`{n}`' for n in exports) + '.', '']
    if local:
        atlas += ['Local dependencies: ' + ', '.join(link(q) for q in local) + '.', '']
    if external:
        atlas += ['Package imports: ' + ', '.join(f'`{n}`' for n in external) + '.', '']
    if collections:
        atlas += ['Literal database references: ' + ', '.join(f'`{n}`' for n in collections) + '.', '']
    callers = sorted(set(reverse[p.resolve()]))
    if callers:
        atlas += ['Imported by: ' + ', '.join(link(q) for q in callers) + '.', '']
save('source-atlas.md', atlas)

text = (SRC / 'routes.ts').read_text()
routes = ['# Registered routes', '', 'Generated from [routes.ts](../../apps/web/src/routes.ts). Course child patterns are relative to `/app/courses/:courseId`. The course index has that parent URL. Other routes are root-relative. Method exports indicate the handler entry points; read its validation and authentication for the full request contract.', '', '| Pattern | Source | Handler exports |', '|---|---|---|']
for match in re.finditer(r"\b(route|index)\(\s*'([^']+)'(?:\s*,\s*'([^']+)')?", text):
    kind, first, second = match.groups()
    path = SRC / (first if kind == 'index' else second)
    pattern = ('/' if first == 'routes/home.tsx' else 'app/courses/:courseId') if kind == 'index' else first
    if kind != 'index' and second in {'routes/course.lesson-plan.tsx', 'routes/course.student-profile.tsx', 'routes/course.section.tsx'}:
        pattern = 'app/courses/:courseId/' + first
    handler = path.read_text()
    methods = sorted(set(re.findall(r'export\s+(?:async\s+)?(?:function|const)\s+(action|loader|clientLoader|clientAction|HydrateFallback)\b', handler)))
    routes += [f'| `{pattern}` | {link(path)} | {", ".join(methods) or "Component / route module"} |']
save('routes.md', routes)

env = defaultdict(set)
for folder in [ROOT/'apps/web/src', ROOT/'apps/web/plugins', ROOT/'apps/pocketbase/pb_hooks', ROOT/'apps/pocketbase/pb_migrations']:
    for p in folder.rglob('*'):
        if p.suffix not in ('.ts','.tsx','.js','.mjs'):
            continue
        text = p.read_text()
        keys = re.findall(r'process\.env\.([A-Z][A-Z0-9_]+)', text)
        keys += re.findall(r'(?:requireEnv|\$os.getenv)\(\s*[\'\"]([A-Z][A-Z0-9_]+)', text)
        for k in keys:
            env[k].add(p)
for p in [ROOT/'Dockerfile',ROOT/'docker-compose.yml',ROOT/'docker-compose.local.yml']:
    for k in re.findall(r'\$\{([A-Z][A-Z0-9_]+)', p.read_text()):
        env[k].add(p)
config = ['# Configuration reference', '', 'Generated literal variable usages. No values are read from private environment files. Runtime providers/defaults are explained in [AI and evidence](ai-and-evidence.md). Variables used only by preview plugins or historical migrations are not automatically required in production. Dynamic lookups can require additional variables; inspect the linked service.', '', 'Root Compose reads root `.env`. Direct web npm scripts read `apps/web/.env`; backend shell scripts depend on exported process environment. Required Compose variables are PocketBase encryption and superuser identity/password. The public URL and provider keys are deployment-specific.', '', '| Variable | Source consumers |', '|---|---|']
for k, paths in sorted(env.items()):
    config += [f'| `{k}` | {", ".join(link(p) for p in sorted(paths))} |']
save('configuration.md', config)

model = ['# Data model and schema evolution', '', 'PocketBase stores collection records in SQLite and files in its data directory. Migrations define fields, indexes and access rules. Apply migrations in filename order; later changes may replace earlier rules or fields. This index is not a flattened final schema: read all relevant migrations and inspect a safe local instance when changing a collection.', '', '## Domain groups', '', '| Area | Main collections | Meaning |', '|---|---|---|', '| Identity and enrollment | users, courses, enrollments, course_roster, course_sections | Users and course membership; roster entries and authenticated accounts are distinct |', '| Academic plan | cpl, cpmk, sub_cpmk, topics, assessments, class_sessions, collaborative_tasks | CPL → CPMK → Sub-CPMK and week/session planning |', '| Assignments | assignments, assignment_submissions, public_submissions, task_answer_keys | Task configuration, enrolled/public answers and marking |', '| Materials | file_library, file_extractions, file_versions, file_contexts, context_sections, context_suggestions, context_retrievals | File identity/version, extracted text, reviewed mappings, retrieved evidence |', '| AI assessment | ai_evaluations, ai_feedback_items | AI draft, lecturer review and research annotation evidence |', '| Feedback/research | check_attempts, ai_feedback, formative_reviews, feedback_revisions, feedback_uptake, research_rater_assignments, personalization_logs | Feedback history, revision uptake and rater workflow; legacy names are not proof of active usage |', '| Gradebook | grade_components, grade_entries, grade_publications, grade_overrides | Official course grading aggregation and release |', '| Personal practice | personal_practice_settings, personal_practice_rounds, personal_practice_attempts, personal_practice_reports, student_conversation_reflections | Personal activities and saved reflection, separate from assignment grades |', '| Assistant | assistant_sessions, assistant_messages, assistant_tool_audits, student_assistant_chats, student_assistant_tool_audits | Conversation state and action audit |', '| Planning agents | agent_tasks, agent_task_events, assistant_lesson_plans, lesson_plan_revisions | Workflow leases, events, plans and revision snapshots |', '| Learning and access | student_learning_profiles, ai_usage_events, participation_awards, attendance | Preferences, usage limits and class activity |', '', '## Relationships and important distinctions', '', 'A course owns its academic plan and sessions. Assignments link to course, session and Sub-CPMK; task-specific rubric/configuration is nested in JSON. Submissions link to assignment and student owner. Public submissions have a separate identity/linking path. AI evaluations link to the assignment and either enrolled or public submission, and have lecturer-private ownership rules. Do not use an ungraded record\'s default numeric grade as an actual lecturer zero.', '', 'Files link to course and optional academic/session scope. Extraction and context records refer to a file version. A restored file and its mappings must remain version-consistent. Context section suitability is the retrieval approval boundary; file context draft state is not equivalent to rejection of all its sections.', '', 'Lecturer review fields, AI raw/provenance snapshots and published feedback represent different sources of truth. Superuser access bypasses database rules, requiring endpoint-level authorization. Collection rules must be reviewed together with server callers and custom PocketBase hooks.', '', '## Migration index', '', '| Migration | Literal collection references / created names |', '|---|---|']
for p in sorted((ROOT/'apps/pocketbase/pb_migrations').glob('*.js')):
    text=p.read_text()
    names=sorted(set(re.findall(r'(?:findCollectionByNameOrId|collection)\(\s*[\'\"]([^\'\"]+)',text)+re.findall(r'name:\s*[\'\"]([a-z_]+)[\'\"]',text)))
    model += [f'| {link(p)} | {", ".join(f"`{n}`" for n in names) or "Settings, dynamic reference or other schema operation"} |']
model += ['', 'The names column is a literal scan and includes field names in collection definitions. It is a search aid, not a table list.', '', '## Backend hooks', '']
for p in sorted((ROOT/'apps/pocketbase/pb_hooks').glob('*')):
    if p.is_file():
        model += [f'- {link(p)}']
save('data-model.md',model)
save('tests.md',['# Test inventory','','Generated from the web test directory. Run with `npm run test --prefix apps/web`; use a test filename as a Vitest filter for focused checks. Names describe coverage intent, not proof of a successful test run.','',*[f'- {link(p)}' for p in sorted((ROOT/'apps/web/tests').glob('*')) if p.is_file()]])
print('Generated route, dependency, configuration, migration and test indexes.')
