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
	learning_support: {
		label: 'Dukungan Pembelajaran',
		note: 'Saya menjelaskan konsep, petunjuk, dan memeriksa drafmu — tanpa menulis jawaban untukmu.',
		tone: 'learn',
	},
	guided_assistance: {
		label: 'Bantuan Terbimbing',
		note: 'Saya membantu dengan contoh dan saran terbatas, tetap tanpa menyusun jawaban lengkap.',
		tone: 'guided',
	},
	assessment_mode: {
		label: 'Mode Penilaian',
		note: 'Bantuan AI dibatasi untuk tugas ini. Saya tidak dapat menulis jawaban untuk Anda, tetapi saya bisa membantu dengan aksi yang diizinkan.',
		tone: 'assessment',
	},
};

/** Contextual starters per page. Each maps to one controlled mode. */
const CONTEXTUAL_STARTERS: Record<AssistantPage, Starter[]> = {
	assignment: [
		{ mode: 'explain_instruction', label: 'Jelaskan tugas ini' },
		{ mode: 'give_hint', label: 'Beri saya petunjuk' },
		{ mode: 'vocabulary', label: 'Latihan kosakata' },
		{ mode: 'give_practice', label: 'Contoh kalimat' },
		{ mode: 'check_draft', label: 'Periksa jawaban saya' },
	],
	speaking: [
		{ mode: 'explain_instruction', label: 'Jelaskan tugas ini' },
		{ mode: 'give_hint', label: 'Beri saya petunjuk' },
		{ mode: 'vocabulary', label: 'Latihan kosakata' },
		{ mode: 'give_practice', label: 'Contoh kalimat' },
		{ mode: 'check_draft', label: 'Periksa jawaban saya' },
	],
	writing: [
		{ mode: 'explain_instruction', label: 'Jelaskan tugas ini' },
		{ mode: 'give_hint', label: 'Beri saya petunjuk' },
		{ mode: 'vocabulary', label: 'Jelaskan kosakata' },
		{
			mode: 'give_practice',
			label: 'Beri contoh struktur',
			message: 'Beri contoh struktur untuk tulisan ini, tanpa menulis jawaban lengkap.',
		},
	],
	feedback: [
		{ mode: 'explain_mistake', label: 'Jelaskan umpan balik ini' },
		{
			mode: 'check_draft',
			label: 'Apa yang harus saya perbaiki dulu?',
			message: 'Apa yang sebaiknya saya perbaiki terlebih dahulu?',
		},
		{ mode: 'give_practice', label: 'Beri latihan' },
	],
};

const TOOL_LABEL: Record<string, string> = {
	get_current_assignment: 'Ringkasan tugas',
	get_assignment_instructions: 'Instruksi & ketentuan',
	get_allowed_course_materials: 'Materi yang disetujui',
	get_my_draft: 'Draf saya',
	get_my_previous_submission: 'Pengumpulan lalu',
	analyze_my_draft: 'Analisis draf',
	explain_assignment_requirement: 'Jelaskan ketentuan',
	generate_practice_activity: 'Latihan singkat',
};

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

const HINT_LEVEL_LABEL: Record<number, string> = {
	1: 'Petunjuk konsep',
	2: 'Penjelasan aturan',
	3: 'Struktur/contoh sebagian',
	4: 'Umpan balik terarah',
};

/** Phrases that signal a helpful boundary/refusal message from the assistant. */
const BOUNDARY_PHRASES = [
	'tidak tersedia',
	'tidak bisa',
	'tidak diizinkan',
	'sedang dinilai',
	'tidak dapat',
	'tidak boleh',
];

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

function isBoundaryMessage(text: string): boolean {
	const lower = text.toLocaleLowerCase('id-ID');
	return BOUNDARY_PHRASES.some((phrase) => lower.includes(phrase));
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
		const payload = mode === 'chat' ? message : message || MODE_LABEL_PLACEHOLDER[mode];
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
			if (!res.ok) throw new Error(data.message || data.error || 'Asisten gagal merespons.');
			setMessages((prev) => [...prev, data.message as AssistantMessage]);
			setHintLevel(data.hintLevel || hintLevel);
			// Refresh mode availability (submission state may have changed).
			void load();
		} catch (err) {
			setError(errorMessage(err));
			setMessages((prev) => prev.slice(0, -1));
		} finally {
			setBusy(false);
			requestAnimationFrame(autoGrow);
		}
	};

	const clearAll = async () => {
		try {
			await fetch('/api/student-assistant', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify({ action: 'clear', assignmentId }),
			});
			setMessages([]);
			setHintLevel(1);
			setError('');
		} catch {
			/* ignore */
		}
	};

	// Phase 4 — invoke a context-aware student tool (audited server-side).
	const runTool = async (tool: string) => {
		setToolsOpen(false);
		if (busy) return;
		const label = TOOL_LABEL[tool] || tool;
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
				body: JSON.stringify({ action: 'invoke_tool', assignmentId, tool, params: {} }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.message || data.error || 'Tool gagal dijalankan.');
			const result = data.result;
			const text = result?.ok ? formatToolResult(tool, result.data) : `Maaf, ${label.toLowerCase()} tidak dapat dijalankan saat ini.`;
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
	const showHintLadder = Boolean(lastHint) && hintLevel > 0;

	const rail = variant === 'rail';
	const expanded = rail ? (narrow ? open : true) : open;
	return (
		<section className={`sa-panel${expanded ? ' open' : ''}${rail ? ' sa-rail' : ''}`} aria-label="Asisten Belajar">
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
					<strong>Asisten Belajar</strong>
					<small>{context ? context.stateLabel : 'Memuat…'}</small>
				</span>
				{policy && (
					<span className={`sa-toggle-policy sa-policy-${policy.tone}`} title={policy.label}>
						<ShieldCheck size={12} strokeWidth={2} />
						{policy.label}
					</span>
				)}
				<Sparkles size={14} className="sa-toggle-spark" />
			</button>

			{expanded && (
				<div className="sa-body" id={`${panelId}-body`}>
					{loading ? (
						<div className="sa-loading">
							<LoaderCircle size={18} className="spin" /> Memuat asisten…
						</div>
					) : disabled ? (
						<div className="sa-empty-state">
							<span className="sa-empty-ico"><X size={18} /></span>
							<h4>Bantuan AI tidak aktif</h4>
							<p>Bantuan AI tidak diaktifkan untuk tugas ini.</p>
						</div>
					) : (
						<>
							{context && (
								<div className="sa-context">
									<span className={`sa-state ${context.state}`}>{context.stateLabel}</span>
									{context.materialsResult === 'insufficient' && (
										<span className="sa-mat-note" title={context.materialsReason}>
											<Info size={13} aria-hidden="true" /> Materi bantuan terbatas
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
										<span className="sa-policy-label">{policy.label}</span>
										<Info size={12} className="sa-policy-info" />
									</button>
									{policyOpen && <p className="sa-policy-note">{policy.note}</p>}
								</div>
							)}

							{rail && policy && <p className="sa-rail-intro">{policy.note}</p>}

							{starters.length > 0 && (
								<div className="sa-starters" role="group" aria-label="Aksi bantuan kontekstual">
									{starters.map((s) => {
										const Icon = MODE_ICON[s.mode];
										const modeInfo = availableModes.find((m) => m.mode === s.mode)!;
										return (
											<button
												key={s.label}
												type="button"
												className={`sa-starter ${modeInfo.kind}`}
												onClick={() => void send(s.mode, s.message)}
												disabled={busy}
												title={modeInfo.reason || s.label}
											>
												<Icon size={14} strokeWidth={1.75} />
												<span>{s.label}</span>
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
										<Wrench size={13} strokeWidth={1.75} /> Alat bantu
										<ChevronDown size={13} className={toolsOpen ? 'open' : ''} />
									</button>
									{toolsOpen && (
										<div className="sa-tools-menu" role="menu">
											{availableTools.map((t) => (
												<button
													key={t.name}
													type="button"
													role="menuitem"
													className="sa-tools-item"
													onClick={() => void runTool(t.name)}
													disabled={busy}
													title={t.description}
												>
													{TOOL_LABEL[t.name] || t.name}
													<small>{t.description}</small>
												</button>
											))}
										</div>
									)}
								</div>
							)}

							<div
								className="sa-thread"
								ref={scrollRef}
								aria-live="polite"
								aria-label="Riwayat percakapan dengan asisten belajar"
							>
								{messages.length === 0 && !busy && !rail && (
									<div className="sa-empty-state">
										<span className="sa-empty-ico"><Sparkles size={20} /></span>
										<h4>Halo! Saya asisten belajar kamu.</h4>
										<p>
											Saya bantu kamu memahami instruksi, memberi petunjuk bertahap, menjelaskan
											tata bahasa &amp; kosakata, dan memeriksa drafmu. Pilih salah satu aksi di
											atas, atau tulis pertanyaan di bawah.
										</p>
									</div>
								)}
								{messages.map((m, i) => {
									const boundary = m.role === 'assistant' && isBoundaryMessage(m.content);
									return (
										<div
											key={i}
											className={`sa-msg sa-msg-${m.role} sa-msg-${m.kind}${boundary ? ' sa-msg-boundary' : ''}`}
										>
											{m.role === 'assistant' && (
												<span className="sa-msg-tag">
													{boundary ? (
														<>
															<Info size={11} /> Batas bantuan
														</>
													) : m.kind === 'feedback' ? (
														'Feedback AI'
													) : (
														'Bantuan AI'
													)}
													{m.mode === 'give_hint' && m.level
														? ` · ${HINT_LEVEL_LABEL[m.level] || `Tingkat ${m.level}`}`
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
										<span className="sa-hint-ladder-label">Petunjuk bertahap</span>
										<ol className="sa-hint-steps">
											{[1, 2, 3, 4].map((lvl) => (
												<li
													key={lvl}
													className={`sa-hint-step${lvl <= hintLevel ? ' done' : ''}${lvl === hintLevel ? ' current' : ''}`}
													aria-current={lvl === hintLevel ? 'step' : undefined}
												>
													<span className="sa-hint-dot" />
													<small>{HINT_LEVEL_LABEL[lvl]}</small>
												</li>
											))}
										</ol>
										<p className="sa-hint-note">
											Minta petunjuk berikutnya untuk bantuan lebih lanjut. Saya membantu belajar,
											bukan menuliskan jawaban akhir.
										</p>
									</div>
								)}
								{busy && (
									<div className="sa-msg sa-msg-assistant">
										<span className="sa-msg-tag">Asisten sedang menulis…</span>
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
									<Trash2 size={12} /> Hapus percakapan
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
									placeholder="Tulis pertanyaan untuk asisten belajar…"
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
									aria-label="Pesan untuk asisten belajar"
								/>
								<button type="submit" className="sa-send" disabled={busy || !input.trim()} aria-label="Kirim pesan">
									{busy ? <LoaderCircle size={15} className="spin" /> : <ArrowUp size={15} />}
								</button>
							</form>
							<p className="sa-foot-note">
								<Sparkles size={11} /> Bantuan AI — bukan umpan balik dosen. Bantu belajar, bukan
								menyelesaikan tugas untukmu.
							</p>
						</>
					)}
				</div>
			)}
		</section>
	);
}

const MODE_LABEL_PLACEHOLDER: Record<AssistantMode, string> = {
	chat: '',
	explain_instruction: 'Tolong jelaskan instruksi tugas ini.',
	give_hint: 'Beri saya petunjuk untuk tugas ini.',
	explain_grammar: 'Jelaskan tata bahasa yang relevan dengan tugas ini.',
	vocabulary: 'Bantu saya dengan kosakata untuk tugas ini.',
	check_draft: 'Tolong periksa draf saya dan beri umpan balik formatif.',
	give_practice: 'Buatkan latihan singkat terkait tugas ini.',
	explain_mistake: 'Jelaskan kesalahan pada jawaban saya.',
};

function modeKindOf(mode: AssistantMode): 'help' | 'feedback' {
	return mode === 'check_draft' || mode === 'explain_mistake' ? 'feedback' : 'help';
}

/**
 * Renders a tool result as concise, student-readable text. Only student-
 * authorized fields are surfaced; internal ids and security metadata are
 * omitted. Falls back to a compact JSON view for unfamiliar shapes.
 */
function formatToolResult(tool: string, data: unknown): string {
	if (!data || typeof data !== 'object') return 'Tidak ada data.';
	const d = data as Record<string, unknown>;
	switch (tool) {
		case 'get_current_assignment': {
			const a = d as { title?: string; mode?: string; activityType?: string; deadline?: string; submissionState?: string };
			return [
				`Ringkasan tugas: ${a.title || '—'}`,
				`Format: ${a.mode || '—'} · Jenis: ${a.activityType === 'formative' ? 'Latihan formatif' : 'Tugas formal'}`,
				a.deadline ? `Tenggat: ${a.deadline}` : 'Tanpa tenggat',
				`Status pengerjaan: ${a.submissionState || '—'}`,
			].join('\n');
		}
		case 'get_assignment_instructions': {
			const i = d as { instructions?: string; requirements?: string };
			return [
				i.instructions ? `Instruksi:\n${i.instructions}` : 'Instruksi belum diisi.',
				i.requirements ? `\nKetentuan/rubrik:\n${i.requirements}` : '',
			].filter(Boolean).join('\n');
		}
		case 'get_allowed_course_materials': {
			const m = d as { result?: string; reason?: string; materials?: Array<{ title?: string; sections?: string[]; excerpt?: string }> };
			if (d.result === 'insufficient' || !m.materials?.length) {
				return `Materi yang disetujui dosen belum tersedia untuk tugas ini.${m.reason ? ` (${m.reason})` : ''}`;
			}
			return m.materials.map((s) => `• ${s.title}${s.sections?.length ? ` — ${s.sections.join(', ')}` : ''}${s.excerpt ? `\n  ${s.excerpt.slice(0, 240)}${s.excerpt.length > 240 ? '…' : ''}` : ''}`).join('\n');
		}
		case 'get_my_draft': {
			const r = d as { hasDraft?: boolean; draft?: string };
			return r.hasDraft ? `Draf kamu saat ini:\n${r.draft}` : 'Kamu belum menulis draf apa pun.';
		}
		case 'get_my_previous_submission': {
			const r = d as { count?: number; submissions?: Array<{ status?: string; gradeLetter?: string; feedback?: string }> };
			if (!r.submissions?.length) return 'Belum ada pengumpulan sebelumnya.';
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
