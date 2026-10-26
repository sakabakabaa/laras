import { useT } from '@/lib/i18n';
import { confirmDialog } from '@/components/confirm-dialog';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
	ArrowUp,
	BookOpen,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	ClipboardList,
	GraduationCap,
	HelpCircle,
	Info,
	Lightbulb,
	LoaderCircle,
	MessageSquareText,
	ShieldCheck,
	Sparkles,
	SpellCheck,
	Trash2,
	Wand2,
	Wrench,
	X,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { errorMessage } from '@/lib/learning';
import type { AssistantMode, AssistantMessage } from '@/lib/student-assistant.server';

type ModeInfo = {
	mode: AssistantMode;
	label: string;
	kind: 'help' | 'feedback';
	available: boolean;
	reason?: string;
};

type ContextSummary = {
	state: string;
	stateLabel: string;
	formative: boolean;
	policyLabel: string;
	policyEnabled: boolean;
	materialsResult: 'sufficient' | 'insufficient';
	materialsReason: string;
	hasDraft: boolean;
};

type ToolInfo = {
	name: string;
	description: string;
	available: boolean;
};

/** The page the assistant is mounted on, used to pick contextual starters. */
export type AssistantPage = 'assignment' | 'writing' | 'speaking' | 'feedback';

type Starter = { mode: AssistantMode; label: string; message?: string };

/** Friendly transparency badge for the active AI assistance level. */
const POLICY_BADGE: Record<string, { label: string; note: string; tone: 'learn' | 'guided' | 'assessment' }> = {
 learning_support: { label: 'assistant.policy.learning_support', note: 'assistant.policy.learning_support.note', tone: 'learn' },
 guided_assistance: { label: 'assistant.policy.guided_assistance', note: 'assistant.policy.guided_assistance.note', tone: 'guided' },
 assessment_mode: { label: 'assistant.policy.assessment_mode', note: 'assistant.policy.assessment_mode.note', tone: 'assessment' },
};
const CONTEXTUAL_STARTERS: Record<AssistantPage, Starter[]> = {
 assignment: [{ mode: 'explain_instruction', label: 'assistant.mode.explain_instruction' }, { mode: 'give_hint', label: 'assistant.mode.give_hint' }, { mode: 'vocabulary', label: 'assistant.mode.vocabulary' }],
 writing: [{ mode: 'explain_instruction', label: 'assistant.mode.explain_instruction' }, { mode: 'give_hint', label: 'assistant.mode.give_hint' }, { mode: 'vocabulary', label: 'assistant.mode.vocabulary' }],
 speaking: [{ mode: 'explain_instruction', label: 'assistant.mode.explain_instruction' }, { mode: 'give_hint', label: 'assistant.mode.give_hint' }, { mode: 'vocabulary', label: 'assistant.mode.vocabulary' }],
 feedback: [{ mode: 'explain_mistake', label: 'assistant.mode.explain_mistake' }, { mode: 'check_draft', label: 'assistant.mode.check_draft' }, { mode: 'give_practice', label: 'assistant.mode.give_practice' }],
};
const TOOL_LABEL: Record<string, string> = Object.fromEntries(['get_current_assignment','get_assignment_instructions','get_allowed_course_materials','get_my_draft','get_my_previous_submission','analyze_my_draft','explain_assignment_requirement','generate_practice_activity'].map(name => [name, `assistant.tool.${name}`]));

const MODE_ICON: Record<AssistantMode, typeof Sparkles> = {
	chat: MessageSquareText,
	explain_instruction: ClipboardList,
	give_hint: Lightbulb,
	explain_grammar: SpellCheck,
	vocabulary: BookOpen,
	check_draft: CheckCircle2,
	give_practice: Wand2,
	explain_mistake: HelpCircle,
};

const HINT_LEVEL_LABEL: Record<number, string> = { 1: 'assistant.hint.1', 2: 'assistant.hint.2', 3: 'assistant.hint.3', 4: 'assistant.hint.4' };

function renderInline(text: string, key: string): ReactNode[] {
	const nodes: ReactNode[] = [];
	const re = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*)/g;
	let last = 0;
	let match: RegExpExecArray | null;
	let i = 0;
	while ((match = re.exec(text))) {
		if (match.index > last) nodes.push(text.slice(last, match.index));
		const token = match[0];
		const inner = token.startsWith('**') || token.startsWith('__') ? token.slice(2, -2) : token.slice(1, -1);
		if (token.startsWith('**') || token.startsWith('__')) nodes.push(<strong key={`${key}-b${i}`}>{inner}</strong>);
		else if (token.startsWith('`')) nodes.push(<code key={`${key}-c${i}`}>{inner}</code>);
		else nodes.push(<em key={`${key}-i${i}`}>{inner}</em>);
		last = match.index + token.length;
		i += 1;
	}
	if (last < text.length) nodes.push(text.slice(last));
	return nodes.length ? nodes : [text];
}

/** Student-safe markdown: headings, lists, bold, italic, and inline code. */
function AssistantMarkdown({ text }: { text: string }) {
	const lines = text.replace(/\r\n/g, '\n').split('\n');
	const blocks: ReactNode[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const heading = /^(#{1,3})\s+(.+)$/.exec(line.trim());
		if (heading) {
			const Tag = heading[1].length <= 2 ? 'h3' : 'h4';
			blocks.push(<Tag key={`h${i}`}>{renderInline(heading[2], `h${i}`)}</Tag>);
			i += 1;
			continue;
		}
		const bullet = /^[-*]\s+(.+)$/.exec(line.trim());
		const ordered = /^\d+[.)]\s+(.+)$/.exec(line.trim());
		if (bullet || ordered) {
			const items: string[] = [];
			const start = i;
			const numbered = Boolean(ordered);
			while (i < lines.length) {
				const item = (numbered ? /^\d+[.)]\s+(.+)$/ : /^[-*]\s+(.+)$/).exec(lines[i].trim());
				if (!item) break;
				items.push(item[1]);
				i += 1;
			}
			const List = numbered ? 'ol' : 'ul';
			blocks.push(
				<List key={`l${start}`}>
					{items.map((item, n) => (
						<li key={n}>{renderInline(item, `l${start}-${n}`)}</li>
					))}
				</List>,
			);
			continue;
		}
		if (!line.trim()) {
			i += 1;
			continue;
		}
		const para: string[] = [line];
		const start = i;
		i += 1;
		while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|[-*]\s|\d+[.)]\s)/.test(lines[i].trim())) {
			para.push(lines[i]);
			i += 1;
		}
		blocks.push(<p key={`p${start}`}>{renderInline(para.join(' '), `p${start}`)}</p>);
	}
	if (!blocks.length) return <p>{'\u00a0'}</p>;
	return <div className="sa-md">{blocks}</div>;
}

/**
 * Student Learning Assistant panel. A tutor-first AI helper mounted in the
 * student worksheet side rail. It is context-aware (loads the assignment,
 * the student's draft, the submission state, and the AI policy) and offers
 * controlled modes rather than arbitrary tool calls. Reuses the LARAS visual
 * language — no new design system.
 *
 * Phase 5 polish: contextual starters, a transparency badge for the active
 * AI policy, a visual hint ladder, clearer visual distinction between student
 * writing / AI help / AI feedback, and stronger accessibility.
 */
export function StudentAssistantPanel({
	assignmentId,
	page = 'assignment',
	variant = 'card',
}: {
	assignmentId: string;
	page?: AssistantPage;
	variant?: 'card' | 'rail';
}) {
	const t = useT();
	const [requirement, setRequirement] = useState<string | null>(null);
	const [messages, setMessages] = useState<AssistantMessage[]>([]);
	const [modes, setModes] = useState<ModeInfo[]>([]);
	const [tools, setTools] = useState<ToolInfo[]>([]);
	const [context, setContext] = useState<ContextSummary | null>(null);
	const [hintLevel, setHintLevel] = useState(1);
	const [input, setInput] = useState('');
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [open, setOpen] = useState(variant !== 'rail');
	const [narrow, setNarrow] = useState(false);
	const [toolsOpen, setToolsOpen] = useState(false);
	const [policyOpen, setPolicyOpen] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const toolsRef = useRef<HTMLDivElement>(null);
	const panelId = useId();

	const token = pb.authStore.token;

	const load = useCallback(async () => {
		setLoading(true);
		setError('');
		try {
			const res = await fetch('/api/student-assistant', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify({ action: 'load', assignmentId }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message || data.error || 'Gagal memuat asisten.');
			setMessages(data.messages || []);
			setModes(data.modes || []);
			setTools(data.tools || []);
			setContext(data.context || null);
			setHintLevel(data.hintLevel || 1);
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setLoading(false);
		}
	}, [assignmentId, token]);

	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) return;
		const mq = window.matchMedia('(max-width: 900px)');
		const apply = () => setNarrow(mq.matches);
		apply();
		mq.addEventListener('change', apply);
		return () => mq.removeEventListener('change', apply);
	}, []);

	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
	}, [messages, busy]);

	// Move keyboard focus back to the composer after an assistant reply so the
	// conversation stays keyboard-navigable.
	useEffect(() => {
		if (!busy && messages.length > 0) inputRef.current?.focus();
	}, [busy, messages.length]);

	const autoGrow = () => {
		const el = inputRef.current;
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
	};
	useEffect(() => {
		autoGrow();
	}, [input]);

	const send = async (mode: AssistantMode, text?: string) => {
		const message = (text ?? input).trim();
		if ((!message && mode === 'chat') || busy) return;
		const payload = mode === 'chat' ? message : message || t(`assistant.mode.${mode}`);
		if (!payload) return;
		setInput('');
		setError('');
		const userMsg: AssistantMessage = {
			role: 'user',
			content: payload,
			mode,
			kind: modeKindOf(mode),
			createdAt: new Date().toISOString(),
		};
		setMessages((prev) => [...prev, userMsg]);
		setBusy(true);
		try {
			const res = await fetch('/api/student-assistant', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify({ action: 'send', assignmentId, mode, message: payload }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(res.status === 503 ? t('assistant.unavailable') : data.message || data.error || t('assistant.failed'));
			setMessages((prev) => [...prev, data.message as AssistantMessage]);
			setHintLevel(data.hintLevel || hintLevel);
			// Refresh mode availability (submission state may have changed).
			void load();
		} catch (err) {
			setError(errorMessage(err));
			setMessages((prev) => prev.slice(0, -1));
			setInput(payload);
		} finally {
			setBusy(false);
			requestAnimationFrame(autoGrow);
		}
	};

	const clearAll = async () => {
  if (busy || !(await confirmDialog({ title: t('assistant.clearTitle'), message: t('assistant.clearConfirm'), confirmLabel: t('assistant.clear'), cancelLabel: t('assistant.cancel'), variant: 'danger' }))) return;
  setBusy(true);
  try {
   const res = await fetch('/api/student-assistant', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action: 'clear', assignmentId }) });
   if (!res.ok) throw new Error(t('assistant.clearFailed'));
   setMessages([]); setHintLevel(1); setError('');
  } catch (err) { setError(errorMessage(err)); }
  finally { setBusy(false); }
 };

	// Phase 4 — invoke a context-aware student tool (audited server-side).
	const runTool = async (tool: string, params: Record<string, string> = {}) => {
		setToolsOpen(false);
		if (busy) return;
		if (tool === 'explain_assignment_requirement' && !params.requirement?.trim()) { setRequirement(''); return; }
		setRequirement(null);
		const label = t(TOOL_LABEL[tool] || tool);
		const userMsg: AssistantMessage = {
			role: 'user',
			content: label,
			mode: 'chat',
			kind: 'help',
			createdAt: new Date().toISOString(),
		};
		setMessages((prev) => [...prev, userMsg]);
		setBusy(true);
		setError('');
		try {
			const res = await fetch('/api/student-assistant', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify({ action: 'invoke_tool', assignmentId, tool, params }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message || data.error || 'Tool gagal dijalankan.');
			const result = data.result;
			const text = result?.ok ? formatToolResult(tool, result.data, t) : t('assistant.failed');
			setMessages((prev) => [
				...prev,
				{
					role: 'assistant',
					content: text,
					mode: 'chat',
					kind: 'help',
					createdAt: new Date().toISOString(),
				} as AssistantMessage,
			]);
		} catch (err) {
			setError(errorMessage(err));
			setMessages((prev) => prev.slice(0, -1));
		} finally {
			setBusy(false);
		}
	};

	useEffect(() => {
		if (!toolsOpen) return;
		const onDoc = (event: MouseEvent) => {
			if (!toolsRef.current?.contains(event.target as Node)) setToolsOpen(false);
		};
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	}, [toolsOpen]);

	const availableModes = modes.filter((m) => m.available && m.mode !== 'chat');
	const availableTools = tools.filter((t) => t.available);
	const disabled = context && !context.policyEnabled;

	// Contextual starters for the current page, filtered to modes the policy
	// and submission state currently permit. De-duplicated by mode so a page
	// never offers two identical actions.
	const starters = CONTEXTUAL_STARTERS[page].filter((s, i, arr) => {
		const modeInfo = availableModes.find((m) => m.mode === s.mode);
		return modeInfo && arr.findIndex((x) => x.mode === s.mode) === i;
	});

	const policy = context ? POLICY_BADGE[context.policyLabel] : null;
	const lastHint = [...messages].reverse().find((m) => m.role === 'assistant' && m.mode === 'give_hint');
	const showHintLadder = Boolean(lastHint?.level) && lastHint?.outcome !== 'unavailable' && hintLevel > 0;

	const rail = variant === 'rail';
	const expanded = rail ? (narrow ? open : true) : open;
	return (
		<section className={`sa-panel${expanded ? ' open' : ''}${rail ? ' sa-rail' : ''}`} aria-label={t('assistant.title')}>
			<button
				type="button"
				className="sa-toggle"
				onClick={() => {
					if (!rail || narrow) setOpen((o) => !o);
				}}
				aria-expanded={expanded}
				aria-controls={`${panelId}-body`}
			>
				<span className="sa-toggle-ico">
					<GraduationCap size={16} strokeWidth={1.75} />
				</span>
				<span className="sa-toggle-text">
					<strong>{t('assistant.title')}</strong>
					<small>{context ? t(`assistant.${context.state}`) : t('assistant.loading')}</small>
				</span>
				{policy && (
					<span className={`sa-toggle-policy sa-policy-${policy.tone}`} title={t(policy.label)}>
						<ShieldCheck size={12} strokeWidth={2} />
						{t(policy.label)}
					</span>
				)}
				<Sparkles size={14} className="sa-toggle-spark" />
			</button>

			{expanded && (
				<div className="sa-body" id={`${panelId}-body`}>
					{loading ? (
						<div className="sa-loading">
							<LoaderCircle size={18} className="spin" /> {t('assistant.loading')}
						</div>
					) : disabled ? (
						<div className="sa-empty-state">
							<span className="sa-empty-ico"><X size={18} /></span>
							<h4>{t('assistant.inactive')}</h4>
							<p>{t('assistant.inactiveNote')}</p>
						</div>
					) : (
						<>
							{context && (
								<div className="sa-context">
									<span className={`sa-state ${context.state}`}>{t(`assistant.${context.state}`)}</span>
									{context.materialsResult === 'insufficient' && (
										<span className="sa-mat-note" title={context.materialsReason}>
											<Info size={13} aria-hidden="true" /> {t('assistant.limitedMaterials')}
										</span>
									)}
								</div>
							)}

							{policy && (
								<div className={`sa-policy sa-policy-${policy.tone}`}>
									<button
										type="button"
										className="sa-policy-head"
										aria-expanded={policyOpen}
										onClick={() => setPolicyOpen((o) => !o)}
									>
										<span className="sa-policy-ico"><ShieldCheck size={13} strokeWidth={2} /></span>
										<span className="sa-policy-label">{t(policy.label)}</span>
										<Info size={12} className="sa-policy-info" />
									</button>
									{policyOpen && <p className="sa-policy-note">{t(policy.note)}</p>}
								</div>
							)}

							{rail && policy && <p className="sa-rail-intro">{t(policy.note)}</p>}

							{starters.length > 0 && (
								<div className="sa-starters" role="group" aria-label={t('assistant.actions')}>
									{starters.map((s) => {
										const Icon = MODE_ICON[s.mode];
										const modeInfo = availableModes.find((m) => m.mode === s.mode)!;
										return (
											<button
												key={t(s.label)}
												type="button"
												className={`sa-starter ${modeInfo.kind}`}
												onClick={() => void send(s.mode, s.message)}
												disabled={busy}
												title={t(s.label)}
											>
												<Icon size={14} strokeWidth={1.75} />
												<span>{t(s.label)}</span>
												{rail && <ChevronRight size={14} className="sa-starter-go" aria-hidden="true" />}
											</button>
										);
									})}
								</div>
							)}

							{availableTools.length > 0 && (
								<div className="sa-tools-wrap" ref={toolsRef}>
									<button
										type="button"
										className="sa-tools-btn"
										onClick={() => setToolsOpen((o) => !o)}
										aria-expanded={toolsOpen}
										aria-haspopup="menu"
										disabled={busy}
									>
										<Wrench size={13} strokeWidth={1.75} /> {t('assistant.tools')}
										<ChevronDown size={13} className={toolsOpen ? 'open' : ''} />
									</button>
									{toolsOpen && (
										<div className="sa-tools-menu" role="menu">
											{availableTools.map((toolInfo) => (
												<button
													key={toolInfo.name}
													type="button"
													role="menuitem"
													className="sa-tools-item"
													onClick={() => void runTool(toolInfo.name)}
													disabled={busy}
													title={t(TOOL_LABEL[toolInfo.name] || toolInfo.name)}
												>
													{t(TOOL_LABEL[toolInfo.name] || toolInfo.name)}

												</button>
											))}
										</div>
									)}
								</div>
							)}

       {requirement !== null && <form className="sa-requirement" onSubmit={event => { event.preventDefault(); void runTool('explain_assignment_requirement', { requirement: requirement.trim() }); }}>
        <label>{t('assistant.requirementLabel')}<textarea autoFocus value={requirement} maxLength={500} onChange={event => setRequirement(event.target.value)} /></label>
        <button type="submit" className="ld-btn-primary" disabled={!requirement.trim() || busy}>{t('assistant.explain')}</button>
        <button type="button" className="ld-text-btn" onClick={() => setRequirement(null)}>{t('assistant.cancel')}</button>
       </form>}
       <p className="sa-saved-draft-note">{t('assistant.savedDraftNote')}</p>
							<div
								className="sa-thread"
								ref={scrollRef}
								aria-live="polite"
								aria-label={t('assistant.thread')}
							>
								{messages.length === 0 && !busy && !rail && (
									<div className="sa-empty-state">
										<span className="sa-empty-ico"><Sparkles size={20} /></span>
										<h4>{t('assistant.title')}</h4>
										<p>
											{t('assistant.disclaimer')}
										</p>
									</div>
								)}
								{messages.map((m, i) => {
									const boundary = m.role === 'assistant' && m.outcome === 'restricted';
									return (
										<div
											key={i}
											className={`sa-msg sa-msg-${m.role} sa-msg-${m.kind}${boundary ? ' sa-msg-boundary' : ''}`}
										>
											{m.role === 'assistant' && (
												<span className="sa-msg-tag">
													{boundary ? (
														<>
															<Info size={11} /> {t('assistant.boundary')}
														</>
													) : m.kind === 'feedback' ? (
														t('assistant.feedback')
													) : (
														t('assistant.help')
													)}
													{m.mode === 'give_hint' && m.level
														? ` · ${t(HINT_LEVEL_LABEL[m.level] || String(m.level))}`
														: ''}
												</span>
											)}
											<div className="sa-bubble">
												<AssistantMarkdown text={m.content} />
											</div>
										</div>
									);
								})}
								{showHintLadder && (
									<div className="sa-hint-ladder" aria-label={`Petunjuk bertahap, tingkat ${hintLevel} dari 4`}>
										<span className="sa-hint-ladder-label">{t('assistant.hintLadder')}</span>
										<ol className="sa-hint-steps">
											{[1, 2, 3, 4].map((lvl) => (
												<li
													key={lvl}
													className={`sa-hint-step${lvl <= hintLevel ? ' done' : ''}${lvl === hintLevel ? ' current' : ''}`}
													aria-current={lvl === hintLevel ? 'step' : undefined}
												>
													<span className="sa-hint-dot" />
													<small>{t(HINT_LEVEL_LABEL[lvl])}</small>
												</li>
											))}
										</ol>
										<p className="sa-hint-note">
											{t('assistant.hintNote')}
										</p>
									</div>
								)}
								{busy && (
									<div className="sa-msg sa-msg-assistant">
										<span className="sa-msg-tag">{t('assistant.thinking')}</span>
										<div className="sa-bubble sa-bubble-thinking">
											<span className="sa-dot" />
											<span className="sa-dot" />
											<span className="sa-dot" />
										</div>
									</div>
								)}
							</div>

							{error && <div className="sa-error" role="alert">{error}</div>}

							{messages.length > 0 && (
								<button type="button" className="sa-clear" onClick={() => void clearAll()} disabled={busy}>
									<Trash2 size={12} /> {t('assistant.clear')}
								</button>
							)}

							<form
								className="sa-composer"
								onSubmit={(e) => {
									e.preventDefault();
									void send('chat', input);
								}}
							>
								<textarea
									ref={inputRef}
									className="sa-input"
									placeholder={t('assistant.placeholder')}
									value={input}
									onChange={(e) => setInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault();
											void send('chat', input);
										}
									}}
									rows={1}
									disabled={busy}
									aria-label={t('assistant.input')}
								/>
								<button type="submit" className="sa-send" disabled={busy || !input.trim()} aria-label={t('assistant.send')}>
									{busy ? <LoaderCircle size={15} className="spin" /> : <ArrowUp size={15} />}
								</button>
							</form>
							<p className="sa-foot-note">
								<Sparkles size={11} /> {t('assistant.disclaimer')}
							</p>
						</>
					)}
				</div>
			)}
		</section>
	);
}

function modeKindOf(mode: AssistantMode): 'help' | 'feedback' {
	return mode === 'check_draft' || mode === 'explain_mistake' ? 'feedback' : 'help';
}

/**
 * Renders a tool result as concise, student-readable text. Only student-
 * authorized fields are surfaced; internal ids and security metadata are
 * omitted. Falls back to a compact JSON view for unfamiliar shapes.
 */
function formatToolResult(tool: string, data: unknown, t: (key: string, vars?: Record<string, string>) => string): string {
	if (!data || typeof data !== 'object') return t('assistant.noData');
	const d = data as Record<string, unknown>;
	switch (tool) {
		case 'get_current_assignment': {
			const a = d as { title?: string; mode?: string; activityType?: string; deadline?: string; submissionState?: string };
			return [
				`${t('assistant.tool.get_current_assignment')}: ${a.title || '—'}`,
				`Format: ${a.mode || '—'} · Jenis: ${a.activityType === 'formative' ? 'Latihan formatif' : 'Tugas formal'}`,
				a.deadline ? `${t('worksheet.deadline')}: ${a.deadline}` : t('worksheet.noDeadline'),
				`Status pengerjaan: ${a.submissionState || '—'}`,
			].join('\n');
		}
		case 'get_assignment_instructions': {
			const i = d as { instructions?: string; requirements?: string };
			return [
				i.instructions ? `${t('assistant.instructions')}:\n${i.instructions}` : t('assistant.noInstructions'),
				i.requirements ? `\n${t('assistant.requirements')}:\n${i.requirements}` : '',
			].filter(Boolean).join('\n');
		}
		case 'get_allowed_course_materials': {
			const m = d as { result?: string; reason?: string; materials?: Array<{ title?: string; sections?: string[]; excerpt?: string }> };
			if (d.result === 'insufficient' || !m.materials?.length) {
				return t('assistant.noMaterials');
			}
			return m.materials.map((s) => `• ${s.title}${s.sections?.length ? ` — ${s.sections.join(', ')}` : ''}${s.excerpt ? `\n  ${s.excerpt.slice(0, 240)}${s.excerpt.length > 240 ? '…' : ''}` : ''}`).join('\n');
		}
		case 'get_my_draft': {
			const r = d as { hasDraft?: boolean; draft?: string };
			return r.hasDraft ? `${t('assistant.savedDraft')}:\n${r.draft}` : t('assistant.noDraft');
		}
		case 'get_my_previous_submission': {
			const r = d as { count?: number; submissions?: Array<{ status?: string; gradeLetter?: string; feedback?: string }> };
			if (!r.submissions?.length) return t('assistant.noPrevious');
			return `Pengumpulan sebelumnya (${r.count}):\n` + r.submissions.map((s, i) => `${i + 1}. ${s.status}${s.gradeLetter ? ` · ${s.gradeLetter}` : ''}${s.feedback ? `\n   Umpan balik: ${s.feedback.slice(0, 200)}` : ''}`).join('\n');
		}
		case 'analyze_my_draft': {
			const r = d as { analysis?: string };
			return r.analysis || 'Analisis belum tersedia.';
		}
		case 'explain_assignment_requirement': {
			const r = d as { requirement?: string; explanation?: string };
			return `${r.requirement || 'Ketentuan'}:\n${r.explanation || 'Penjelasan belum tersedia.'}`;
		}
		case 'generate_practice_activity': {
			const r = d as { practice?: string };
			return r.practice || 'Latihan belum tersedia.';
		}
		default:
			return JSON.stringify(data, null, 2).slice(0, 1000);
	}
}
