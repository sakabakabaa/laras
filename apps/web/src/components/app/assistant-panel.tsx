import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import {
	Archive,
	ArrowUp,
	Bold,
	CheckCircle2,
	ChevronDown,
	FileText,
	History,
	Italic,
	List,
	LoaderCircle,
	MessageSquare,
	Mic,
	MoreHorizontal,
	PencilLine,
	Paperclip,
	Plus,
	Search,
	Sparkles,
	Trash2,
	X,
	Zap,
	type LucideIcon,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { AssistantClarify, type ClarifyQuestion } from '@/components/app/assistant-clarify';
import { useAssistantPageContext } from '@/components/app/assistant-page-context-provider';
import type { AssistantSeed } from '@/lib/assistant-quick-send';
import { isSessionStale } from '@/lib/assistant/session-stale';
import { buildContextBreadcrumb, formatLastActivity, sanitizeError, toolActivityLabel } from '@/lib/assistant/ui-labels';
import { collapseAssistantThread, decideAssistantVisible, hasClarifyProtocol, parseClarifyBlock, stripClarifyBlock } from '@/lib/assistant/parsing';
import { confirmDialog } from '@/components/confirm-dialog';

type ConvMessage = {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	toolName: string;
	toolArgs: Record<string, unknown> | null;
	actionStatus: string;
	created: string;
	attachments?: string[];
	/** Ready-to-render image URLs (object URLs for just-sent, signed for history). */
	images?: string[];
	/** Read tools executed during this turn, for the activity trail. */
	toolActivity?: { tool: string; ok: boolean }[];
};

type SessionSummary = {
	id: string;
	title: string;
	status: 'active' | 'archived';
	messageCount: number;
	lastMessageAt: string;
	created: string;
	updated: string;
	summaryVersion: number;
	estimatedTokens: number;
	feature: string;
	summary: string;
};

type PendingAction = {
	messageId: string;
	tool: string;
	args: Record<string, unknown>;
	summary: string;
};

type Clarification = {
	messageId: string;
	questions: ClarifyQuestion[];
};

const asQuestions = (value: unknown): ClarifyQuestion[] => {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => {
			const row = item && typeof item === 'object' ? (item as { prompt?: unknown; placeholder?: unknown }) : {};
			const prompt = typeof row.prompt === 'string' ? row.prompt.trim() : '';
			const placeholder = typeof row.placeholder === 'string' && row.placeholder.trim() ? row.placeholder.trim() : 'Ketik jawaban Anda...';
			return prompt ? { prompt, placeholder } : null;
		})
		.filter((item): item is ClarifyQuestion => Boolean(item))
		.slice(0, 3);
};

const pendingClarify = (items: ConvMessage[]): Clarification | null => {
	for (let i = items.length - 1; i >= 0; i -= 1) {
		const item = items[i];
		if (item.role === 'user') return null;
		if (item.role !== 'assistant') continue;
		if (item.actionStatus === 'confirmed' || item.actionStatus === 'rejected') continue;
		const fromArgs = item.toolName === 'clarify' ? asQuestions(item.toolArgs?.questions) : [];
		const fromText = fromArgs.length ? fromArgs : (parseClarifyBlock(item.content) ?? []);
		if (fromText.length && (item.toolName === 'clarify' || item.actionStatus === 'pending' || item.actionStatus === 'none' || !item.actionStatus)) {
			return { messageId: item.id, questions: fromText };
		}
	}
	return null;
};

const lecturerVisible = (text: string) => {
	const clean = stripClarifyBlock(text);
	if (clean) return clean;
	return hasClarifyProtocol(text) ? 'Saya perlu beberapa detail sebelum melanjutkan.' : text;
};

type Suggestion = { icon: LucideIcon; label: string; tone: 'chat' | 'spark' | 'file' };

const TOOL_LABEL: Record<string, string> = {
	create_course: 'Membuat mata kuliah',
	create_assignment: 'Membuat tugas',
	link_session_outcomes: 'Menautkan capaian ke pertemuan',
	add_roster_students: 'Menambah mahasiswa ke roster',
	list_courses: 'Daftar mata kuliah',
	list_assignments: 'Daftar tugas',
	course_detail: 'Ringkasan mata kuliah',
	summarize_insights: 'Wawasan akademik',
};

/** Confirmation-card action verb shown before the draft description. */
const CONFIRM_ACTION_LABEL: Record<string, string> = {
	create_course: 'Anda akan membuat mata kuliah',
	create_assignment: 'Anda akan membuat tugas',
	link_session_outcomes: 'Anda akan menautkan capaian ke pertemuan',
	add_roster_students: 'Anda akan menambah mahasiswa ke roster',
};

/**
 * Diagnostics are gated behind the Vite dev flag — true in local dev and the
 * preview build, false in the published production bundle — so ordinary
 * lecturers never see session ids, tool counts, or compaction status.
 */
const DIAGNOSTICS_ENABLED = Boolean(import.meta.env.DEV);

const SUGGESTIONS: Suggestion[] = [
	{ icon: Sparkles, label: 'Buatkan mata kuliah baru untuk semester ini', tone: 'spark' },
	{ icon: FileText, label: 'Buat draf tugas untuk mata kuliah saya', tone: 'file' },
	{ icon: MessageSquare, label: 'Ringkas wawasan akademik saya', tone: 'chat' },
];

const MORE_SUGGESTIONS: Suggestion[] = [
	{ icon: FileText, label: 'Daftar mata kuliah saya', tone: 'file' },
	{ icon: Sparkles, label: 'Ringkasan satu mata kuliah', tone: 'spark' },
	{ icon: MessageSquare, label: 'Daftar tugas saya', tone: 'chat' },
];

const ACCEPT = '.pdf,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.docx,.pptx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation';
const MAX_FILES = 4;
const MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_MARK = '<<gambar';

type StoredImage = { name: string; ref: string };

const parseImageRefs = (content: string): StoredImage[] => {
	const idx = content.indexOf(IMAGE_MARK);
	if (idx < 0) return [];
	const head = content.slice(idx + IMAGE_MARK.length);
	const close = head.indexOf('>>');
	if (close < 0) return [];
	const payload = head.slice(0, close).trim();
	if (!payload) return [];
	return payload.split('|').map((entry) => {
		const [name, ref] = entry.split('::');
		return { name: (name || 'gambar').trim(), ref: (ref || '').trim() };
	}).filter((img) => img.ref);
};

const stripImageMarker = (content: string): string => {
	const idx = content.indexOf(IMAGE_MARK);
	if (idx < 0) return content;
	return content.slice(0, idx).trimEnd();
};

let imageTokenCache: { value: string; issuedAt: number } | null = null;
const imageToken = async (): Promise<string> => {
	if (imageTokenCache && Date.now() - imageTokenCache.issuedAt < 90_000) return imageTokenCache.value;
	const token = await pb.files.getToken();
	imageTokenCache = { value: token, issuedAt: Date.now() };
	return token;
};

const signImageRef = async (ref: string): Promise<string> => {
	if (!ref) return '';
	try {
		const token = await imageToken();
		const origin = window.location.origin;
		const absolute = ref.startsWith('http') ? ref : `${origin}${ref.startsWith('/') ? '' : '/'}${ref}`;
		const url = new URL(absolute);
		url.searchParams.set('token', token);
		return url.toString();
	} catch {
		return '';
	}
};

const splitStored = (content: string): { text: string; attachments: string[]; imageRefs: StoredImage[] } => {
	const imageRefs = parseImageRefs(content);
	const withoutImages = stripImageMarker(content);
	const marker = withoutImages.indexOf('\n\n<<lampiran');
	if (marker < 0) return { text: withoutImages, attachments: [], imageRefs };
	const head = withoutImages.slice(marker + 2);
	const close = head.indexOf('>>');
	const names = close > 0 ? head.slice('<<lampiran'.length, close).trim() : '';
	return {
		text: withoutImages.slice(0, marker).trim(),
		attachments: names ? names.split(',').map((name) => name.trim()).filter(Boolean) : [],
		imageRefs,
	};
};

const isImageFile = (file: File) => {
	const type = file.type || '';
	const lower = file.name.toLowerCase();
	return type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(lower);
};

const FIELD_LABEL: Record<string, string> = {
	courseLabel: 'Mata kuliah',
	title: 'Judul',
	code: 'Kode',
	semester: 'Semester',
	academicYear: 'Tahun akademik',
	shape: 'Bentuk',
	mode: 'Format kerja',
	activityType: 'Jenis',
	sessionLabel: 'Pertemuan',
	subCpmkLabel: 'Sub-CPMK',
	generated: 'Isi draf',
	instructions: 'Instruksi',
	description: 'Deskripsi',
	sessionCount: 'Jumlah pertemuan',
	outcomeCount: 'Jumlah Sub-CPMK',
	sourceCourseLabel: 'Dari mata kuliah',
	destinationCourseLabel: 'Ke mata kuliah',
	section: 'Kelas sumber',
	studentCount: 'Jumlah mahasiswa',
};

const VALUE_LABEL: Record<string, string> = {
	individual: 'Individu',
	collaborative: 'Kelompok',
	group_project: 'Proyek kelompok',
	case_study: 'Studi kasus',
	presentation: 'Presentasi',
	practical: 'Praktik',
	portfolio: 'Portofolio',
	discussion: 'Diskusi',
	quiz: 'Kuis',
	listening: 'Menyimak',
	writing: 'Menulis',
	speaking: 'Berbicara',
	reading: 'Membaca',
	conversation: 'Percakapan',
	vocabulary: 'Kosakata',
	language_project: 'Proyek bahasa',
	formal: 'Tugas formal',
	formative: 'Latihan formatif',
};

const cleanConfirmText = (text: string) =>
	text
		.replace(/```[\s\S]*?```/g, '')
		.replace(/\{[\s\S]*?"(?:courseId|tool)"[\s\S]*?\}/g, '')
		.replace(/\*\*/g, '')
		.replace(/\s+\n/g, '\n')
		.trim();

function ConfirmBody({
	tool,
	args,
	summary,
}: {
	tool: string;
	args: Record<string, unknown>;
	summary: string;
}) {
	const rows = Object.entries(FIELD_LABEL)
		.filter(([key]) => {
			if (key === 'courseLabel') return Boolean(args.courseLabel || args.courseId);
			if (key === 'instructions' && tool === 'create_assignment') return Boolean(String(args.instructions || '').trim()) && !args.generated;
			const value = args[key];
			return typeof value === 'string' ? value.trim().length > 0 : typeof value === 'number';
		})
		.map(([key, label]) => {
			const raw = key === 'courseLabel'
				? String(args.courseLabel || args.courseId || '')
				: String(args[key] ?? '');
			const value = VALUE_LABEL[raw] || raw || '—';
			return { key, label, value: key === 'instructions' && !raw.trim() ? 'Masih kosong' : value };
		});
	const intro = cleanConfirmText(summary);
	return (
		<>
			{intro ? <p className="asst-confirm-summary">{intro}</p> : null}
			{rows.length > 0 && (
				<dl className="asst-confirm-fields">
					{rows.map((row) => (
						<div key={row.key}>
							<dt>{row.label}</dt>
							<dd>{row.value}</dd>
						</div>
					))}
				</dl>
			)}
		</>
	);
}

function RichText({ text }: { text: string }) {
	const lines = text.split('\n');
	return (
		<div className="asst-text">
			{lines.map((line, index) => (
				<p key={`${index}-${line.slice(0, 12)}`}>
					{line.startsWith('- ') ? <span className="asst-li">{renderInline(line.slice(2))}</span> : renderInline(line) || '\u00a0'}
				</p>
			))}
		</div>
	);
}

function renderInline(line: string) {
	const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
	return parts.map((part, index) => {
		if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
		if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
		return <span key={index}>{part}</span>;
	});
}

export function AssistantPanel({
	variant = 'page',
	name,
	seed,
	onSeedConsumed,
}: {
	variant?: 'page' | 'drawer';
	name?: string;
	seed?: AssistantSeed | null;
	onSeedConsumed?: () => void;
}) {
	const [messages, setMessages] = useState<ConvMessage[]>([]);
	const [input, setInput] = useState('');
	const [files, setFiles] = useState<File[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [pending, setPending] = useState<PendingAction | null>(null);
	const [clarify, setClarify] = useState<Clarification | null>(null);
	const [loadingHistory, setLoadingHistory] = useState(true);
	const [showNew, setShowNew] = useState(true);
	const [showAll, setShowAll] = useState(false);
	const [styleOpen, setStyleOpen] = useState(false);
	const [listening, setListening] = useState(false);
	const [sessions, setSessions] = useState<SessionSummary[]>([]);
	const [currentSession, setCurrentSession] = useState<SessionSummary | null>(null);
	const [sessionsOpen, setSessionsOpen] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const [renaming, setRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState('');
	const [sessionSearch, setSessionSearch] = useState('');
	const [diagOpen, setDiagOpen] = useState(false);
	const [lastToolCount, setLastToolCount] = useState(0);
	const scrollRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const styleRef = useRef<HTMLDivElement>(null);
	const sessionsRef = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const recognitionRef = useRef<{ stop: () => void } | null>(null);
	const token = pb.authStore.token;
	const { pathname } = useLocation();
	const courseRoute = pathname.match(/^\/app\/courses\/([^/]+)/)?.[1] || '';
	const pageCtx = useAssistantPageContext();
	const consumedSeedRef = useRef<number | null>(null);

	const autoGrow = () => {
		const el = inputRef.current;
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
	};

	useEffect(() => {
		autoGrow();
	}, [input]);

	useEffect(() => {
		if (!styleOpen) return;
		const onDoc = (event: MouseEvent) => {
			if (!styleRef.current?.contains(event.target as Node)) setStyleOpen(false);
		};
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	}, [styleOpen]);

	useEffect(() => {
		if (!sessionsOpen) return;
		const onDoc = (event: MouseEvent) => {
			if (!sessionsRef.current?.contains(event.target as Node)) setSessionsOpen(false);
		};
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	}, [sessionsOpen]);

	useEffect(() => {
		if (!menuOpen) return;
		const onDoc = (event: MouseEvent) => {
			if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
		};
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	}, [menuOpen]);

	const authHeaders = (json = true) => ({
		...(json ? { 'Content-Type': 'application/json' } : {}),
		...(token ? { Authorization: `Bearer ${token}` } : {}),
	});

	const post = async (body: Record<string, unknown>) => {
		const res = await fetch('/api/assistant', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
		const data = await res.json();
		if (!res.ok) throw new Error(data.message || data.error || 'Asisten gagal merespons.');
		return data;
	};

	const refreshSessions = useCallback(async () => {
		try {
			const data = await post({ action: 'list_sessions' });
			const list: SessionSummary[] = data.sessions ?? [];
			setSessions(list);
			return list;
		} catch {
			return [];
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [token]);

	const loadSession = useCallback(
		async (sessionId: string) => {
			setLoadingHistory(true);
			try {
				const data = await post({ action: 'session_messages', sessionId });
				const items: ConvMessage[] = data.items ?? [];
				setMessages(items);
				setClarify(pendingClarify(items));
				const pendingWrite = [...items].reverse().find(
					(item) => item.role === 'assistant' && item.actionStatus === 'pending' && (item.toolName === 'create_course' || item.toolName === 'create_assignment' || item.toolName === 'link_session_outcomes' || item.toolName === 'add_roster_students'),
				);
				if (pendingWrite?.toolArgs) {
					setPending({ messageId: pendingWrite.id, tool: pendingWrite.toolName, args: pendingWrite.toolArgs, summary: pendingWrite.content });
				} else {
					setPending(null);
				}
			} catch {
				setMessages([]);
				setPending(null);
				setClarify(null);
			} finally {
				setLoadingHistory(false);
			}
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[token],
	);

	// Initial load: fetch sessions, then load the most recent (or default) session.
	useEffect(() => {
		let alive = true;
		(async () => {
			setLoadingHistory(true);
			try {
				const list = await refreshSessions();
				if (!alive) return;
				// The history action resolves the default/most-recent session and
				// returns its messages plus the resolved sessionId.
				const data = await post({ action: 'history' });
				if (!alive) return;
				const items: ConvMessage[] = data.items ?? [];
				setMessages(items);
				setClarify(pendingClarify(items));
				const resolvedId: string = data.sessionId || '';
				const sessionSummary = (data.session ?? null) as SessionSummary | null;
				const resolved = sessionSummary || list.find((s) => s.id === resolvedId) || null;
				setCurrentSession(resolved);
				const pendingWrite = [...items].reverse().find(
					(item) => item.role === 'assistant' && item.actionStatus === 'pending' && (item.toolName === 'create_course' || item.toolName === 'create_assignment' || item.toolName === 'link_session_outcomes' || item.toolName === 'add_roster_students'),
				);
				if (pendingWrite?.toolArgs) {
					setPending({ messageId: pendingWrite.id, tool: pendingWrite.toolName, args: pendingWrite.toolArgs, summary: pendingWrite.content });
				}
			} catch {
				/* ignore — start fresh */
			} finally {
				if (alive) setLoadingHistory(false);
			}
		})();
		return () => {
			alive = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [token]);

	useEffect(() => {
		scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
	}, [messages, busy, pending, clarify]);

	// Sign image references recovered from stored user messages so pasted
	// images render in the thread. Object URLs from just-sent messages are
	// already set; this fills in signed URLs for history loaded from the server.
	useEffect(() => {
		let alive = true;
		(async () => {
			const pending = messages.filter((m) => m.role === 'user' && !m.images?.length && m.content.includes('<<gambar'));
			if (!pending.length) return;
			const updates = await Promise.all(pending.map(async (m) => {
				const refs = parseImageRefs(m.content);
				const signed = (await Promise.all(refs.map((r) => signImageRef(r.ref)))).filter(Boolean);
				return { id: m.id, images: signed };
			}));
			if (!alive) return;
			const valid = updates.filter((u) => u.images.length);
			if (!valid.length) return;
			setMessages((prev) => prev.map((m) => {
				const u = valid.find((x) => x.id === m.id);
				return u ? { ...m, images: u.images } : m;
			}));
		})();
		return () => { alive = false; };
	}, [messages]);

	// A message typed in the dashboard quick-chat box arrives as a `seed`.
	useEffect(() => {
		if (!seed) return;
		if (loadingHistory || busy) return;
		if (consumedSeedRef.current === seed.nonce) return;
		consumedSeedRef.current = seed.nonce;
		void send(seed.text, seed.files ?? []);
		onSeedConsumed?.();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [seed, loadingHistory, busy]);

	const send = async (text: string, attached: File[] = files, clarifyMessageId = '') => {
		const trimmed = text.trim();
		if ((!trimmed && attached.length === 0) || busy || loadingHistory) return;
		// If the current session has been idle past the auto-new threshold,
		// start a fresh one before sending. A pending clarification belonged to
		// the old session, so it is dropped on switch.
		const fresh = await ensureFreshSession();
		if (!fresh) return;
		const switched = currentSession?.id !== fresh.id;
		const sid = fresh.id;
		const clarifyId = switched ? '' : clarifyMessageId;
		setInput('');
		setFiles([]);
		setError('');
		setPending(null);
		setClarify(null);
		setStyleOpen(false);
		const imageFiles = attached.filter(isImageFile);
		const names = attached.filter((f) => !isImageFile(f)).map((file) => file.name);
		const userMsg: ConvMessage = {
			id: `u-${Date.now()}`,
			role: 'user',
			content: trimmed || 'Tolong tinjau lampiran berikut.',
			toolName: '',
			toolArgs: null,
			actionStatus: 'none',
			created: new Date().toISOString(),
			attachments: names,
			images: imageFiles.map((file) => URL.createObjectURL(file)),
		};
		setMessages((prev) => [...prev, userMsg]);
		setBusy(true);
		try {
			let data: { text: string; pendingAction?: PendingAction; clarification?: Clarification; toolActivity?: { tool: string; ok: boolean }[]; suppressedDuplicate?: boolean };
			if (attached.length) {
				const form = new FormData();
				form.set('action', 'send');
				form.set('message', trimmed);
				if (clarifyId) form.set('clarifyMessageId', clarifyId);
				if (courseRoute) form.set('courseRoute', courseRoute);
				if (sid) form.set('sessionId', sid);
				form.set('pageContext', JSON.stringify(pageCtx.context));
				attached.forEach((file) => form.append('files', file));
				const res = await fetch('/api/assistant', { method: 'POST', headers: authHeaders(false), body: form });
				data = await res.json();
				if (!res.ok) throw new Error((data as { message?: string; error?: string }).message || (data as { error?: string }).error || 'Asisten gagal merespons.');
			} else {
				data = await post({ action: 'send', message: trimmed, clarifyMessageId: clarifyId, courseRoute, sessionId: sid, pageContext: pageCtx.context });
			}
			const turnTools = Array.isArray(data.toolActivity) ? data.toolActivity : [];
			setLastToolCount(turnTools.length);
			const nextClarify = data.clarification as Clarification | null;
			const priorAssistant = messages.filter((item) => item.role === 'assistant').map((item) => item.content);
			const decision = decideAssistantVisible(data.text || '', priorAssistant);
			const showBubble = !data.suppressedDuplicate && decision.action !== 'suppress' && !(data.pendingAction && decision.action === 'show');
			const assistantMsg: ConvMessage = {
				id: nextClarify?.messageId || data.pendingAction?.messageId || `a-${Date.now()}`,
				role: 'assistant',
				content: decision.action === 'suppress' ? '' : decision.text,
				toolName: data.pendingAction?.tool || (nextClarify ? 'clarify' : ''),
				toolArgs: data.pendingAction?.args ?? (nextClarify ? { questions: nextClarify.questions } : null),
				actionStatus: data.pendingAction || nextClarify ? 'pending' : 'none',
				created: new Date().toISOString(),
				toolActivity: turnTools,
			};
			if (showBubble || turnTools.length > 0) {
				setMessages((prev) => {
					const again = decideAssistantVisible(assistantMsg.content, prev.filter((item) => item.role === 'assistant').map((item) => item.content));
					if (!turnTools.length && (data.suppressedDuplicate || again.action === 'suppress')) return prev;
					const content = again.action === 'suppress' ? '' : again.text;
					if (!content && turnTools.length === 0) return prev;
					return [...prev, { ...assistantMsg, content: content || assistantMsg.content }];
				});
			}
			if (data.pendingAction) setPending(data.pendingAction);
			if (nextClarify?.questions?.length) setClarify(nextClarify);
			// Refresh session metadata (title/lastMessageAt) in the background.
			void refreshSessions().then((list) => {
				const updated = list.find((s) => s.id === (sid || currentSession?.id)) || null;
				if (updated) setCurrentSession(updated);
			});
		} catch (err) {
			setError(sanitizeError(err));
			if (!clarifyMessageId && clarify) setClarify(clarify);
		} finally {
			setBusy(false);
			requestAnimationFrame(autoGrow);
		}
	};

	const confirm = async () => {
		if (!pending || busy) return;
		setBusy(true);
		setError('');
		try {
			const data = await post({ action: 'confirm', messageId: pending.messageId, courseRoute });
			setMessages((prev) => [
				...prev,
				{
					id: `s-${Date.now()}`,
					role: 'assistant',
					content: data.text,
					toolName: '',
					toolArgs: null,
					actionStatus: 'executed',
					created: new Date().toISOString(),
				},
			]);
			setPending(null);
		} catch (err) {
			setError(sanitizeError(err));
		} finally {
			setBusy(false);
		}
	};

	const reject = async () => {
		if (!pending) return;
		try {
			await post({ action: 'reject', messageId: pending.messageId });
		} catch {
			/* ignore */
		}
		setPending(null);
	};

	const clearAll = async () => {
		if (
			!(await confirmDialog({
				title: 'Hapus pesan',
				message: 'Hapus seluruh pesan di percakapan ini?',
				variant: 'danger',
				confirmLabel: 'Hapus',
			}))
		)
			return;
		try {
			await post({ action: 'clear', sessionId: currentSession?.id || '' });
			setMessages([]);
			setPending(null);
			setClarify(null);
		} catch {
			/* ignore */
		}
	};

	const startNewSession = async () => {
		setSessionsOpen(false);
		setMenuOpen(false);
		try {
			const data = await post({ action: 'create_session', title: '' });
			const session: SessionSummary = data.session;
			setSessions((prev) => [session, ...prev]);
			setCurrentSession(session);
			setMessages([]);
			setPending(null);
			setClarify(null);
			setError('');
			setShowNew(true);
		} catch (err) {
			setError(sanitizeError(err));
		}
	};

	/**
	 * Starts a fresh session when the current one has been idle longer than the
	 * auto-new threshold (3 hours). Returns the session id to send into, or null
	 * if creation failed (in which case the caller aborts the turn). The old
	 * session stays in the list as history; only the active conversation resets.
	 */
	const ensureFreshSession = async (): Promise<{ id: string } | null> => {
		// Reuse the current session when it is loaded and still fresh. When no
		// session is loaded yet (e.g. the initial history load failed) or the
		// current one has gone stale, start a fresh conversation so the message
		// is never silently dropped — Enter always submits.
		if (currentSession && !isSessionStale(currentSession.lastMessageAt)) {
			return { id: currentSession.id };
		}
		try {
			const data = await post({ action: 'create_session', title: '' });
			const session: SessionSummary = data.session;
			setSessions((prev) => [session, ...prev.filter((s) => s.id !== session.id)]);
			setCurrentSession(session);
			setMessages([]);
			setPending(null);
			setClarify(null);
			return { id: session.id };
		} catch (err) {
			setError(sanitizeError(err));
			return null;
		}
	};

	const selectSession = async (session: SessionSummary) => {
		setSessionsOpen(false);
		if (currentSession?.id === session.id) return;
		setCurrentSession(session);
		await loadSession(session.id);
	};

	const beginRename = () => {
		setMenuOpen(false);
		setRenameValue(currentSession?.title || '');
		setRenaming(true);
	};

	const submitRename = async () => {
		const title = renameValue.trim();
		if (!currentSession || !title) {
			setRenaming(false);
			return;
		}
		try {
			const data = await post({ action: 'rename_session', sessionId: currentSession.id, title });
			const session: SessionSummary = data.session;
			setCurrentSession(session);
			setSessions((prev) => prev.map((s) => (s.id === session.id ? session : s)));
		} catch (err) {
			setError(sanitizeError(err));
		}
		setRenaming(false);
	};

	const archiveCurrent = async () => {
		setMenuOpen(false);
		if (!currentSession) return;
		try {
			const data = await post({ action: 'archive_session', sessionId: currentSession.id });
			const session: SessionSummary = data.session;
			setSessions((prev) => prev.map((s) => (s.id === session.id ? session : s)));
			setCurrentSession(session);
		} catch (err) {
			setError(sanitizeError(err));
		}
	};

	const deleteCurrent = async () => {
		if (!currentSession) return;
		if (
			!(await confirmDialog({
				title: 'Hapus percakapan',
				message: `Hapus percakapan “${currentSession.title}”? Seluruh pesan akan dihapus.`,
				variant: 'danger',
				confirmLabel: 'Hapus',
			}))
		)
			return;
		setMenuOpen(false);
		try {
			await post({ action: 'delete_session', sessionId: currentSession.id });
			const remaining = sessions.filter((s) => s.id !== currentSession.id);
			setSessions(remaining);
			if (remaining.length) {
				setCurrentSession(remaining[0]);
				await loadSession(remaining[0].id);
			} else {
				await startNewSession();
			}
		} catch (err) {
			setError(sanitizeError(err));
		}
	};

	const addFiles = (list: FileList | File[] | null) => {
		if (!list?.length) return;
		const next = [...files];
		for (const file of Array.from(list)) {
			if (next.length >= MAX_FILES) {
				setError(`Maksimal ${MAX_FILES} lampiran per pesan.`);
				break;
			}
			if (file.size > MAX_BYTES) {
				setError(`"${file.name}" melebihi 8 MB.`);
				continue;
			}
			if (next.some((item) => item.name === file.name && item.size === file.size)) continue;
			next.push(file);
		}
		setFiles(next);
		if (fileRef.current) fileRef.current.value = '';
	};

	const applyStyle = (kind: 'bold' | 'italic' | 'list') => {
		const el = inputRef.current;
		const start = el?.selectionStart ?? input.length;
		const end = el?.selectionEnd ?? start;
		const selected = input.slice(start, end);
		let insert = selected;
		let cursor = start;
		if (kind === 'bold') insert = `**${selected || 'teks'}**`;
		if (kind === 'italic') insert = `*${selected || 'teks'}*`;
		if (kind === 'list') {
			const body = selected || 'butir';
			insert = body
				.split('\n')
				.map((line) => (line.startsWith('- ') ? line : `- ${line}`))
				.join('\n');
		}
		const next = input.slice(0, start) + insert + input.slice(end);
		setInput(next);
		cursor = start + insert.length;
		setStyleOpen(false);
		requestAnimationFrame(() => {
			el?.focus();
			el?.setSelectionRange(cursor, cursor);
			autoGrow();
		});
	};

	const toggleMic = () => {
		if (listening) {
			recognitionRef.current?.stop();
			setListening(false);
			return;
		}
		const Speech = (window as unknown as { webkitSpeechRecognition?: new () => SpeechHandle; SpeechRecognition?: new () => SpeechHandle }).SpeechRecognition
			|| (window as unknown as { webkitSpeechRecognition?: new () => SpeechHandle }).webkitSpeechRecognition;
		if (!Speech) {
			setError('Mikrofon tidak didukung di peramban ini.');
			return;
		}
		const recognition = new Speech();
		recognition.lang = 'id-ID';
		recognition.interimResults = false;
		recognition.onresult = (event) => {
			const said = event.results?.[0]?.[0]?.transcript || '';
			if (!said) return;
			setInput((current) => (current ? `${current} ${said}` : said));
		};
		recognition.onerror = () => setListening(false);
		recognition.onend = () => setListening(false);
		recognitionRef.current = recognition;
		setListening(true);
		setError('');
		recognition.start();
	};

	const firstName = (name || 'Dosen').trim().split(/\s+/)[0];
	const prompts = showAll ? [...SUGGESTIONS, ...MORE_SUGGESTIONS] : SUGGESTIONS;
	const threadMessages = collapseAssistantThread(messages.map((item) => {
		if (item.role !== 'assistant') return item;
		const stored = item.attachments ? { text: item.content, attachments: item.attachments } : splitStored(item.content);
		return { ...item, content: lecturerVisible(stored.text), attachments: stored.attachments };
	})).filter((item) => !(pending && item.id === pending.messageId));
	const canSend = Boolean(input.trim() || files.length) && !busy && !loadingHistory;
	const sessionTitle = currentSession?.title || 'Percakapan baru';
	const contextSegments = buildContextBreadcrumb(pageCtx.context);
	const searchQuery = sessionSearch.trim().toLowerCase();
	const filteredSessions = searchQuery
		? sessions.filter((s) => (s.title || 'Percakapan baru').toLowerCase().includes(searchQuery))
		: sessions;

	return (
		<div className={`asst-wrap${variant === 'drawer' ? ' asst-drawer' : ''}`}>
			{variant === 'page' && (
				<header className="asst-head">
					<div className="asst-head-title">
						<span className="asst-head-icon">
							<Sparkles size={18} strokeWidth={1.75} />
						</span>
						<div>
							<h1>Asisten Dosen</h1>
							<p>Buat mata kuliah &amp; tugas, dan ringkas wawasan akademik Anda — dengan konfirmasi sebelum data dibuat.</p>
						</div>
					</div>
				</header>
			)}

			<div className="asst-card">
				<div className="asst-session-bar" ref={sessionsRef}>
					<div className="asst-session-switch">
						<button
							type="button"
							className="asst-session-title"
							onClick={() => setSessionsOpen((open) => !open)}
							aria-haspopup="menu"
							aria-expanded={sessionsOpen}
							aria-label="Buka riwayat percakapan"
							disabled={renaming}
						>
							<span className="asst-session-title-text">{sessionTitle}</span>
							{currentSession?.status === 'archived' && <span className="asst-session-archived">Arsip</span>}
							<ChevronDown size={14} className={`asst-session-chevron${sessionsOpen ? ' open' : ''}`} />
						</button>
						{sessionsOpen && (
							<div className="asst-session-list" role="menu">
								<button type="button" className="asst-session-new" onClick={() => void startNewSession()} role="menuitem">
									<Plus size={15} strokeWidth={2} /> Percakapan baru
								</button>
								{sessions.length > 0 && (
									<div className="asst-session-search">
										<Search size={14} strokeWidth={1.75} />
										<input
											type="search"
											value={sessionSearch}
											placeholder="Cari percakapan..."
											aria-label="Cari percakapan"
											onChange={(e) => setSessionSearch(e.target.value)}
											onClick={(e) => e.stopPropagation()}
										/>
									</div>
								)}
								{filteredSessions.length === 0 && <p className="asst-session-empty">{sessions.length === 0 ? 'Belum ada percakapan lain.' : 'Tidak ada yang cocok.'}</p>}
								{filteredSessions.map((s) => (
									<button
										key={s.id}
										type="button"
										className={`asst-session-item${s.id === currentSession?.id ? ' active' : ''}`}
										onClick={() => void selectSession(s)}
										role="menuitem"
									>
										<span className="asst-session-item-meta">
											<span className="asst-session-item-title">{s.title || 'Percakapan baru'}</span>
											<span className="asst-session-item-when">{formatLastActivity(s.lastMessageAt)}</span>
										</span>
										{s.status === 'archived' && <Archive size={13} className="asst-session-item-arch" />}
									</button>
								))}
							</div>
						)}
					</div>
					<div className="asst-session-actions">
						<button
							type="button"
							className={`asst-history-btn${sessionsOpen ? ' open' : ''}`}
							onClick={() => setSessionsOpen((open) => !open)}
							aria-expanded={sessionsOpen}
							aria-label="Riwayat percakapan"
							title="Riwayat percakapan"
						>
							<History size={15} strokeWidth={1.75} />
							<span>Riwayat</span>
							{sessions.length > 0 && <em>{sessions.length}</em>}
						</button>
						<button type="button" className="asst-session-add" onClick={() => void startNewSession()} aria-label="Percakapan baru" title="Percakapan baru">
							<Plus size={16} strokeWidth={2} />
						</button>
						{renaming ? (
							<div className="asst-rename-inline">
								<input
									autoFocus
									value={renameValue}
									onChange={(e) => setRenameValue(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') void submitRename();
										if (e.key === 'Escape') setRenaming(false);
									}}
									maxLength={200}
									placeholder="Judul percakapan"
								/>
								<button type="button" className="asst-rename-save" onClick={() => void submitRename()} aria-label="Simpan judul">
									<CheckCircle2 size={15} />
								</button>
								<button type="button" className="asst-rename-cancel" onClick={() => setRenaming(false)} aria-label="Batal ganti judul">
									<X size={15} />
								</button>
							</div>
						) : (
							<div className="asst-session-menu-wrap" ref={menuRef}>
								<button
									type="button"
									className="asst-session-menu"
									onClick={() => setMenuOpen((open) => !open)}
									aria-haspopup="menu"
									aria-expanded={menuOpen}
									aria-label="Opsi percakapan"
								>
									<MoreHorizontal size={16} />
								</button>
								{menuOpen && (
									<div className="asst-session-menu-pop" role="menu">
										<button type="button" role="menuitem" onClick={beginRename}>
											<PencilLine size={14} /> Ganti judul
										</button>
										<button type="button" role="menuitem" onClick={() => void archiveCurrent()}>
											<Archive size={14} /> Arsipkan
										</button>
										<button type="button" role="menuitem" className="danger" onClick={() => void deleteCurrent()}>
											<Trash2 size={14} /> Hapus
										</button>
									</div>
								)}
							</div>
						)}
					</div>
				</div>

				{(contextSegments.length > 0 || (DIAGNOSTICS_ENABLED && currentSession)) && (
					<div className="asst-context-bar">
						{contextSegments.length > 0 && (
							<span className="asst-context-crumbs" title={contextSegments.join(' › ')}>
								<span className="asst-context-label">Konteks</span>
								{contextSegments.map((segment, i) => (
									<span key={`${segment}-${i}`} className="asst-context-seg">
										{i > 0 && <span className="asst-context-arrow">›</span>}
										{segment}
									</span>
								))}
							</span>
						)}
						{DIAGNOSTICS_ENABLED && currentSession && (
							<button
								type="button"
								className={`asst-diag-toggle${diagOpen ? ' open' : ''}`}
								onClick={() => setDiagOpen((open) => !open)}
								aria-expanded={diagOpen}
								aria-label="Diagnostik asisten"
								title="Diagnostik (dev)"
							>
								<Zap size={13} strokeWidth={2} />
							</button>
						)}
					</div>
				)}
				{DIAGNOSTICS_ENABLED && diagOpen && currentSession && (
					<dl className="asst-diag">
						<div><dt>Sesi</dt><dd>{currentSession.id.slice(0, 8)}</dd></div>
						<div><dt>Fitur</dt><dd>{pageCtx.context.feature || currentSession.feature || '—'}</dd></div>
						<div><dt>Tool (putaran)</dt><dd>{lastToolCount}</dd></div>
						<div><dt>Kompaksi</dt><dd>{currentSession.summaryVersion > 0 ? `v${currentSession.summaryVersion} · ~${currentSession.estimatedTokens} tkn` : 'belum'}</dd></div>
						<div><dt>Pesan</dt><dd>{currentSession.messageCount}</dd></div>
						<div><dt>Model</dt><dd>{busy ? 'Aktif' : 'Idle'}</dd></div>
					</dl>
				)}

				<div className="asst-thread" ref={scrollRef}>
					{!loadingHistory && messages.length > 0 && currentSession?.summary && (
						<details className="asst-session-summary">
							<summary>
								<Sparkles size={13} strokeWidth={1.75} /> Melanjutkan percakapan sebelumnya
							</summary>
							<p>{currentSession.summary}</p>
						</details>
					)}
					{loadingHistory ? (
						<div className="asst-thinking">
							<LoaderCircle size={18} className="spin" /> Memuat percakapan...
						</div>
					) : messages.length === 0 ? (
						<div className="asst-empty">
							<span className="asst-empty-icon">
								<Sparkles size={22} strokeWidth={1.6} />
							</span>
							<h3>Senang bertemu, {firstName}</h3>
							<p>Pilih saran di bawah atau tulis sendiri. Lampiran PDF, Word (.docx), PowerPoint (.pptx), teks, dan gambar ikut dibaca asisten — gambar bisa langsung ditempel (paste).</p>
						</div>
					) : (
						threadMessages.map((m) => {
							const stored = m.attachments ? { text: m.content, attachments: m.attachments } : splitStored(m.content);
							return (
								<div key={m.id} className={`asst-msg asst-msg-${m.role}`}>
									<div className="asst-bubble">
										<RichText text={m.role === 'assistant' ? lecturerVisible(stored.text) : stored.text} />
										{m.images && m.images.length > 0 && (
											<div className="asst-images">
												{m.images.map((src, i) => (
													<img key={`${m.id}-img-${i}`} src={src} alt={`Lampiran gambar ${i + 1}`} className="asst-image" loading="lazy" />
												))}
											</div>
										)}
										{stored.attachments.length > 0 && (
											<ul className="asst-attach-chips">
												{stored.attachments.map((file) => (
													<li key={file}><Paperclip size={12} /> {file}</li>
												))}
											</ul>
										)}
										{m.toolActivity && m.toolActivity.length > 0 && (
											<ul className="asst-tool-trail" aria-label="Aktivitas tool">
												{m.toolActivity.map((t, i) => (
													<li key={`${t.tool}-${i}`} className={t.ok ? 'ok' : 'fail'}>
														{t.ok ? <CheckCircle2 size={12} /> : <X size={12} />}
														{toolActivityLabel(t.tool)}
													</li>
												))}
											</ul>
										)}
										{m.actionStatus === 'executed' && m.toolArgs && (
											<Link to={(m.toolArgs as { link?: string }).link ?? '#'} className="asst-result-link">
												<CheckCircle2 size={14} /> Buka catatan
											</Link>
										)}
									</div>
								</div>
							);
						})
					)}
					{busy && (
						<div className="asst-msg asst-msg-assistant">
							<div className="asst-bubble asst-bubble-thinking">
								<span className="asst-dot" />
								<span className="asst-dot" />
								<span className="asst-dot" />
								<span className="asst-thinking-label">Sedang memproses…</span>
							</div>
						</div>
					)}
				</div>

				{pending && (
					<div className="asst-confirm" role="alertdialog" aria-label="Konfirmasi aksi">
						<div className="asst-confirm-head">
							<span className="asst-confirm-badge">{TOOL_LABEL[pending.tool] || pending.tool}</span>
							<button type="button" className="asst-confirm-x" aria-label="Tolak" onClick={() => void reject()}>
								<X size={16} />
							</button>
						</div>
						<p className="asst-confirm-verb">{CONFIRM_ACTION_LABEL[pending.tool] || 'Anda akan membuat catatan'}:</p>
						<div className="asst-confirm-scroll">
							<ConfirmBody tool={pending.tool} args={pending.args} summary={pending.summary} />
						</div>
						<p className="asst-confirm-note">Konfirmasi untuk membuat catatan ini. Anda masih bisa menyuntingnya setelahnya di editor.</p>
						<div className="asst-confirm-actions">
							<button type="button" className="ld-outline-action sm" onClick={() => void reject()} disabled={busy}>Batal</button>
							<button type="button" className="ld-btn-primary sm" onClick={() => void confirm()} disabled={busy}>
								<CheckCircle2 size={15} /> Konfirmasi
							</button>
						</div>
					</div>
				)}

				{clarify && !pending && (
					<AssistantClarify
						key={clarify.messageId}
						questions={clarify.questions}
						disabled={busy}
						onSubmit={(answers) => {
							const lines = clarify.questions.map((question, i) => {
								const answer = answers[i];
								return answer ? `${i + 1}. ${question.prompt}\n${answer}` : '';
							}).filter(Boolean);
							void send(`Jawaban klarifikasi:\n${lines.join('\n\n')}`, [], clarify.messageId);
						}}
					/>
				)}

				{error && <div className="ld-alert" role="alert">{error}</div>}

				{messages.length === 0 && !loadingHistory && (
					<div className="asst-suggest-stack" aria-label="Saran percakapan">
						{prompts.map((item) => {
							const Icon = item.icon;
							return (
								<button key={item.label} type="button" className="asst-suggest-row" onClick={() => void send(item.label, [])}>
									<span className={`asst-suggest-ico ${item.tone}`} aria-hidden>
										<Icon size={16} strokeWidth={1.75} />
									</span>
									<span>{item.label}</span>
								</button>
							);
						})}
						{showNew && (
							<div className="asst-new-banner">
								<Sparkles size={15} strokeWidth={1.75} />
								<strong>Baru:</strong>
								<span>Lampirkan berkas ke percakapan</span>
								<button type="button" className="asst-see-all" onClick={() => setShowAll((open) => !open)}>
									{showAll ? 'Sembunyikan' : 'Lihat semua'}
								</button>
								<button type="button" className="asst-new-x" aria-label="Tutup pengumuman" onClick={() => setShowNew(false)}>
									<X size={15} />
								</button>
							</div>
						)}
					</div>
				)}

				{variant === 'drawer' && messages.length > 0 && (
					<div className="asst-drawer-tools">
						<button type="button" className="asst-quiet" onClick={() => void clearAll()}>
							<Trash2 size={13} /> Hapus pesan
						</button>
					</div>
				)}

				<form
					className="asst-composer"
					onSubmit={(event) => {
						event.preventDefault();
						void send(input);
					}}
				>
					<div className="asst-composer-box">
						<textarea
							ref={inputRef}
							className="asst-input"
							placeholder={clarify ? 'Atau ketik di sini untuk lewati semua pertanyaan' : 'Tulis pesan untuk asisten...'}
							value={input}
							onChange={(event) => {
								setInput(event.target.value);
								autoGrow();
							}}
							onKeyDown={(event) => {
								if (event.key === 'Enter' && !event.shiftKey) {
									event.preventDefault();
									void send(input);
								}
							}}
							onPaste={(event) => {
								const items = event.clipboardData?.items;
								if (!items) return;
								const pasted: File[] = [];
								for (const item of Array.from(items)) {
									if (item.kind === 'file' && item.type.startsWith('image/')) {
										const file = item.getAsFile();
										if (file) pasted.push(file);
									}
								}
								if (pasted.length) {
									event.preventDefault();
									addFiles(pasted);
								}
							}}
							rows={1}
							disabled={busy}
							aria-label="Pesan untuk asisten"
						/>
						{files.length > 0 && (
							<ul className="asst-file-row">
								{files.map((file) => (
									<li key={`${file.name}-${file.size}`}>
										<Paperclip size={12} />
										<span>{file.name}</span>
										<button type="button" aria-label={`Hapus ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => item !== file))}>
											<X size={12} />
										</button>
									</li>
								))}
							</ul>
						)}
						<div className="asst-composer-bar">
							<input ref={fileRef} type="file" className="asst-file-input" accept={ACCEPT} multiple onChange={(event) => addFiles(event.target.files)} />
							<button type="button" className="asst-tool" aria-label="Lampirkan berkas" disabled={busy} onClick={() => fileRef.current?.click()}>
								<Paperclip size={16} strokeWidth={1.75} />
							</button>
							<div className="asst-style-wrap" ref={styleRef}>
								<button
									type="button"
									className={`asst-skills${styleOpen ? ' open' : ''}`}
									aria-expanded={styleOpen}
									aria-haspopup="menu"
									onClick={() => setStyleOpen((open) => !open)}
								>
									<Zap size={14} strokeWidth={1.75} /> Gaya
								</button>
								{styleOpen && (
									<div className="asst-style-menu" role="menu">
										<button type="button" role="menuitem" onClick={() => applyStyle('bold')}><Bold size={14} /> Tebal</button>
										<button type="button" role="menuitem" onClick={() => applyStyle('italic')}><Italic size={14} /> Miring</button>
										<button type="button" role="menuitem" onClick={() => applyStyle('list')}><List size={14} /> Daftar</button>
									</div>
								)}
							</div>
							<div className="asst-composer-end">
								<button
									type="button"
									className={`asst-mic${listening ? ' live' : ''}`}
									aria-label={listening ? 'Berhenti merekam' : 'Ucapkan pesan'}
									aria-pressed={listening}
									onClick={toggleMic}
									disabled={busy}
								>
									<Mic size={16} strokeWidth={1.75} />
								</button>
								<button type="submit" className="asst-send" disabled={!canSend} aria-label="Kirim">
									{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={16} />}
								</button>
							</div>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
}

type SpeechHandle = {
	lang: string;
	interimResults: boolean;
	onresult: ((event: { results?: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
	onerror: (() => void) | null;
	onend: (() => void) | null;
	start: () => void;
	stop: () => void;
};
