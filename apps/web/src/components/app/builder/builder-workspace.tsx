import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type DragEvent,
	type PointerEvent as ReactPointerEvent,
	type CSSProperties,
} from 'react';
import { Link, useBlocker, useNavigate, useSearchParams } from 'react-router';
import { canPasteBuilderStyle, copyBuilderStyle, pasteBuilderStyle, type BuilderStyleClipboard, type BuilderStyleSelection } from '@/lib/builder-style-clipboard';
import { BuilderStyleActions } from './builder-style-actions';
import { renameNavigatorGroup, revealNavigatorCanvas, type NavigatorReveal } from '@/lib/builder-navigator';
import { activityLayoutProtected, guardedLayoutEdit, hasLayoutLockFields, layoutLockState, layoutLockTransitionReason, LAYOUT_LOCK_CAPABILITY_REASON, LAYOUT_LOCK_REASON } from '@/lib/builder-layout-lock';
import { BuilderLayoutLockControl } from './builder-layout-lock-control';
import {
	ArrowDown,
	ChevronDown,
	ChevronRight,
	History,
	ArrowLeft,
	ArrowUp,
	Copy,
	Download,
	Eye,
	FileCheck2,
	GripVertical,
	ListTree,
	MoreHorizontal,
	Plus,
	Redo2,
	Save,
	Settings2,
	Sparkles,
	Trash2,
	Undo2,
} from 'lucide-react';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { hasDocumentAppearanceToReset, resetDocumentAppearance } from '@/lib/builder-appearance';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import pb from '@/lib/pocketbase-client';
import { useCachedQuery } from '@/hooks/use-cached-query';
import { createBuilderSaveQueue } from '@/lib/builder-save';
import { type ProposalOperation, type ProposalTarget } from '@/lib/builder-authoring';
import { useBuilderAuthoringTools } from './builder-authoring-tools';
import { BuilderPublishDialog, builderPublishWarnings } from './builder-publish-dialog';
import {
	enhancedAuthoringNotice,
	fetchBuilderCapability,
	isEnhancedAuthoringDenied,
	usesEnhancedAuthoring,
	hasCustomThemeColors,
	hasDetailedBorderRadius,
	hasResponsiveBorderRadius,
	hasBuilderCaptions,
	hasBuilderPlaybackDetails,
	hasBuilderAnchors,
	type BuilderCapabilityPayload,
} from '@/lib/builder-capability';
import { toWibInput, fromWibInput } from '@/lib/scheduled-classes';
import {
	appendBlock,
	appendQuestion,
	BLOCK_LABELS,
	builderIssues,
	hasBuilderVisibility,
	builderNodeVisibilitySafe,
	hasBuilderThemePalette,
	builderAnchors,
	remapDuplicateBuilderAnchors,
	builderRichTextValid,
	builderRequest,
	encodeBuilderDraft,
	hasNestedBuilderLists,
	duplicateActivity,
	duplicateBlock,
	activitySummary,
	newActivity,
	plain,
	replaceRichText,
	questionIds,
	removeBlock,
	insertGroupTemplate,
	moveBuilderHistory,
	rich,
	uid,
	type BuilderEnvelope,
	type BuilderRecord,
} from '@/lib/builder-document';
import { BuilderCanvasText } from './builder-elements';
import { BuilderAnchorScope } from './builder-anchor-scope';
import { BuilderThemePaletteControl } from './builder-theme-palette-control';
import { BuilderInspectorDispatch } from './builder-inspector-dispatch';
import { isBuilderRegistryKind } from '@/lib/builder-element-registry';
import { BuilderElementInspector } from './builder-element-inspector';
import { BuilderRunList } from './builder-run';
import { deliveryRequest } from '@/lib/builder-delivery';
import {
	BuilderSavedItems,
	insertActivityTemplate,
} from './builder-saved-items';
import {
	BuilderElementLibrary,
	BUILDER_ELEMENTS,
	BUILDER_DRAG_TYPE,
} from './builder-element-library';
import { BuilderLayoutView } from './builder-layout-view';
import { builderThemePaletteStyle } from '@/lib/builder-theme';
import { builderDragEdgeSpeed, builderDragScrollDelta, builderDropTargetFromElement, updateBuilderPointerGesture, type BuilderPointerGesture } from '@/lib/builder-pointer-drag';
import {
	BuilderLayoutBreadcrumbs,
	BuilderLayoutInspector,
	BuilderLayoutNavigator,
	addLayoutGroupToActivity,
	removeLayoutGroupFromActivity,
} from './builder-layout-panels';
import {
	canMoveLayoutItem,
	findLayoutGroup,
	layoutItemLocation,
	moveBlockBetweenActivities,
	insertBlockAtTarget,
	removeBlockFromLayout,
	resolveBlockInsertionTarget,
	resolveLayoutGroupMoveTarget,
	moveLayoutGroupAtTarget,
	moveBlockInLayout,
	moveLayoutItem,
	reparentLayoutItem,
} from '@/lib/builder-layout';

type Change = (edit: (draft: BuilderEnvelope) => void) => boolean;
type CourseOption = { id: string; title: string; code: string };
type MeetingOption = { id: string; title: string; week: number; section: string };
const encode = encodeBuilderDraft;
function readRecovery(key: string) {
	try {
		const saved = JSON.parse(localStorage.getItem(key) || 'null');
		if (
			saved &&
			Number.isFinite(saved.at) && saved.at <= Date.now() &&
			Date.now() - saved.at < 7 * 86400000 &&
			saved.envelope?.document?.schemaVersion === 1 &&
			saved.envelope?.privateKeys?.schemaVersion === 1
		)
			return { envelope: saved.envelope as BuilderEnvelope, at: saved.at as number, baseRevision: saved.baseRevision as number | undefined };
	} catch {
		/* Storage may be blocked. */
	}
	return null;
}
export function BuilderWorkspace({ id }: { id: string }) {
	const [params] = useSearchParams();
	const navigate = useNavigate(),
		[draft, setDraft] = useState<BuilderEnvelope | null>(null),
		[saved, setSaved] = useState(''),
		[revision, setRevision] = useState(0),
		[loading, setLoading] = useState(true),
		[error, setError] = useState(''),
		[saving, setSaving] = useState(false),
		[conflict, setConflict] = useState(false),
		[recovery, setRecovery] = useState<BuilderEnvelope | null>(null),
		[active, setActive] = useState(''),
		[selected, setSelected] = useState(''),
		[selectedNode, setSelectedNode] = useState(''),
		[styleClipboard, setStyleClipboard] = useState<BuilderStyleClipboard | null>(null),
		[styleStatus, setStyleStatus] = useState(''),
		[panel, setPanel] = useState<'content' | 'delivery' | 'review'>('content'),
		[picker, setPicker] = useState(false),
		[activityDrawer, setActivityDrawer] = useState(false),
		[assistance, setAssistance] = useState(() => ['ai', 'book'].includes(params.get('tool') || '')),
		[insertion, setInsertion] = useState<{
			activityId: string;
			beforeId?: string;
			parentId?: string;
		} | null>(null),
		[dragging, setDragging] = useState(false),
		[dropTarget, setDropTarget] = useState(''),
		[announcement, setAnnouncement] = useState(''),
		[resetAppearanceOpen, setResetAppearanceOpen] = useState(false),
		[collapsed, setCollapsed] = useState<string[]>([]),
		[savedItems, setSavedItems] = useState<{ activityId?: string; groupId?: string } | null>(
			null,
		),
		[publishing, setPublishing] = useState(false),
		[inspectorOpen, setInspectorOpen] = useState(false),
		[historyVersion, setHistoryVersion] = useState(0);
	const [sidebar, setSidebar] = useState<'elements' | 'structure'>('elements');
	const [canvasReveal, setCanvasReveal] = useState<NavigatorReveal | null>(null);
	const drawerReveal = useRef<NavigatorReveal | null>(null);
	useEffect(() => {
		if (!canvasReveal || activityDrawer) return;
		revealNavigatorCanvas({ ...canvasReveal, focus: false }, document, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
		setCanvasReveal(null);
	}, [canvasReveal, activityDrawer]);
	const [online, setOnline] = useState(true);
	const [storageWarning, setStorageWarning] = useState('');
	const [capability, setCapability] = useState<BuilderCapabilityPayload | null>(null);
	const [layoutLocksSupported, setLayoutLocksSupported] = useState(false);
	const layoutLocksSupportedRef = useRef(false);
	const [customColorsSupported, setCustomColorsSupported] = useState(false);
	const customColorsSupportedRef = useRef(false);
	const detailedBorderRadiusSupportedRef = useRef(false);
	const [detailedBorderRadiusSupported, setDetailedBorderRadiusSupported] = useState(false);
	const responsiveBorderRadiusSupportedRef = useRef(false);
	const [responsiveBorderRadiusSupported, setResponsiveBorderRadiusSupported] = useState(false);
	const mediaCaptionsSupportedRef = useRef(false);
	const [mediaCaptionsSupported, setMediaCaptionsSupported] = useState(false);
	const mediaPlaybackSupportedRef = useRef(false);
	const [mediaPlaybackSupported, setMediaPlaybackSupported] = useState(false);
	const nestedRichTextSupportedRef = useRef(false);
	const [nestedRichTextSupported, setNestedRichTextSupported] = useState(false);
	const documentAnchorsSupportedRef = useRef(false);
	const [documentAnchorsSupported, setDocumentAnchorsSupported] = useState(false);
	const presentationVisibilitySupportedRef = useRef(false);
	const [presentationVisibilitySupported, setPresentationVisibilitySupported] = useState(false);
	const themePaletteSupportedRef = useRef(false);
	const [themePaletteSupported, setThemePaletteSupported] = useState(false);
	const [recoveryInfo, setRecoveryInfo] = useState<{ at: number; baseRevision?: number } | null>(null);
	const [publishReview, setPublishReview] = useState(false);
	const saveQueue = useRef(createBuilderSaveQueue((command) => builderRequest<BuilderRecord>('save', command)));
	const current = useRef<BuilderEnvelope | null>(null),
		revisionRef = useRef(0),
		savingRef = useRef(false),
		conflictRef = useRef(false),
		readOnlyRef = useRef(false),
		lockedRef = useRef(false),
		past = useRef<BuilderEnvelope[]>([]),
		future = useRef<BuilderEnvelope[]>([]),
		activeId = useRef(id),
		publishCommand = useRef({ revision: 0, id: '' }),
		pointerGesture = useRef<BuilderPointerGesture | null>(null),
		pointerDropTarget = useRef(''),
		workspaceRoot = useRef<HTMLDivElement | null>(null),
		canvasRoot = useRef<HTMLElement | null>(null),
		edgeScrollFrame = useRef<number | null>(null),
		edgeScrollElement = useRef<HTMLElement | null>(null),
		edgeScrollPoint = useRef<{ x: number; y: number } | null>(null),
		edgeScrollTime = useRef(0),
		dragItem = useRef<{
			elementId?: string;
			activityId?: string;
			blockId?: string;
			groupId?: string;
			revision?: number;
			snapshot?: BuilderEnvelope | null;
		} | null>(null);
	activeId.current = id;
	const stopEdgeScroll = () => {
		if (edgeScrollFrame.current !== null) cancelAnimationFrame(edgeScrollFrame.current);
		edgeScrollFrame.current = null;
		edgeScrollElement.current = null;
		edgeScrollPoint.current = null;
		edgeScrollTime.current = 0;
	};
	useEffect(() => () => { stopEdgeScroll(); pointerGesture.current = null; dragItem.current = null; }, []);
	const storageKey = `laras-builder:${pb.authStore.record?.id || 'anonymous'}:${id}`;
	const dirty = Boolean(draft && encode(draft) !== saved);
	const contextCourseId = draft?.document.context.courseId || '';
	const contextMeetingId = draft?.document.context.meetingId || '';
	const contextCourses = useCachedQuery<CourseOption[]>(
		contextCourseId ? 'builder-course-options' : null,
		() =>
			pb.collection('courses').getFullList<CourseOption>({
				filter: pb.filter('owner={:u}', { u: pb.authStore.record?.id }),
				fields: 'id,title,code',
				sort: 'title',
			}),
	);
	const contextMeetings = useCachedQuery<MeetingOption[]>(
		contextCourseId ? `builder-meetings:${contextCourseId}` : null,
		() =>
			pb.collection('class_sessions').getFullList<MeetingOption>({
				filter: pb.filter('course={:c}', { c: contextCourseId }),
				fields: 'id,title,week,section',
				sort: 'week',
			}),
	);
	const contextCourse = contextCourses.data?.find(
		(item) => item.id === contextCourseId,
	);
	const contextMeeting = contextMeetings.data?.find(
		(item) => item.id === contextMeetingId,
	);
	useEffect(() => {
		let live = true;
		void fetchBuilderCapability(current.current?.document).then((result) => {
			if (live) setCapability(result);
		});
		return () => {
			live = false;
		};
	}, [id]);
	useEffect(() => {
		const update = () => {
			setOnline(navigator.onLine);
		};
		update();
		window.addEventListener('online', update);
		window.addEventListener('offline', update);
		return () => {
			window.removeEventListener('online', update);
			window.removeEventListener('offline', update);
		};
	}, []);
	useEffect(() => {
		const owner = pb.authStore.record?.id;
		return pb.authStore.onChange(() => {
			if (pb.authStore.record?.id === owner) return;
			try {
				for (const key of Object.keys(localStorage))
					if (key.startsWith(`laras-builder:${owner}:`))
						localStorage.removeItem(key);
			} catch {
				/* Optional device storage. */
			}
			current.current = null;
			setDraft(null);
		});
	}, []);
	const blocker = useBlocker(dirty && !recovery);
	const install = useCallback((next: BuilderEnvelope) => {
		current.current = next;
		setDraft(next);
		setError('');
	}, []);
	useEffect(() => {
		let live = true;
		setLoading(true);
		setDraft(null);
		current.current = null;
		themePaletteSupportedRef.current = false;
		setThemePaletteSupported(false);
		layoutLocksSupportedRef.current = false;
		setLayoutLocksSupported(false);
		customColorsSupportedRef.current = false;
		detailedBorderRadiusSupportedRef.current = false;
		setDetailedBorderRadiusSupported(false);
		responsiveBorderRadiusSupportedRef.current = false;
		setResponsiveBorderRadiusSupported(false);
		mediaCaptionsSupportedRef.current = false;
		setMediaCaptionsSupported(false);
		mediaPlaybackSupportedRef.current = false;
		setMediaPlaybackSupported(false);
		nestedRichTextSupportedRef.current = false;
		setNestedRichTextSupported(false);
		documentAnchorsSupportedRef.current = false;
		setDocumentAnchorsSupported(false);
		presentationVisibilitySupportedRef.current = false; setPresentationVisibilitySupported(false);
		setCustomColorsSupported(false);
		setStyleClipboard(null);
		setStyleStatus('');
		setError('');
		setConflict(false);
		saveQueue.current.reset();
		conflictRef.current = false;
		setRecovery(null);
		setRecoveryInfo(null);
		past.current = [];
		future.current = [];
		builderRequest<BuilderRecord>('get', { id })
			.then((r) => {
				if (!live) return;
				layoutLocksSupportedRef.current = r.layoutLocks === true;
				setLayoutLocksSupported(r.layoutLocks === true);
				customColorsSupportedRef.current = r.customColors === true;
				detailedBorderRadiusSupportedRef.current = r.detailedBorderRadius === true;
				setDetailedBorderRadiusSupported(r.detailedBorderRadius === true);
				responsiveBorderRadiusSupportedRef.current = r.responsiveBorderRadius === true;
				setResponsiveBorderRadiusSupported(r.responsiveBorderRadius === true);
				mediaCaptionsSupportedRef.current = r.mediaCaptions === true;
				setMediaCaptionsSupported(r.mediaCaptions === true);
				mediaPlaybackSupportedRef.current = r.mediaPlayback === true;
				setMediaPlaybackSupported(r.mediaPlayback === true);
				nestedRichTextSupportedRef.current = r.nestedRichText === true;
				setNestedRichTextSupported(r.nestedRichText === true);
				documentAnchorsSupportedRef.current = r.documentAnchors === true;
				setDocumentAnchorsSupported(r.documentAnchors === true);
				presentationVisibilitySupportedRef.current = r.presentationVisibility === true; setPresentationVisibilitySupported(r.presentationVisibility === true);
				themePaletteSupportedRef.current = r.themePalette === true; setThemePaletteSupported(r.themePalette === true);
				setCustomColorsSupported(r.customColors === true);
				const envelope = { document: r.document, privateKeys: r.privateKeys };
				install(envelope);
				setSaved(encode(envelope));
				setRevision(r.revision);
				revisionRef.current = r.revision;
				setActive(r.document.activities[0]?.id || '');
				setSelected('');
				setSelectedNode('');
				const local = readRecovery(storageKey);
				if (local && encode(local.envelope) !== encode(envelope)) {
					setRecovery(local.envelope);
					setRecoveryInfo({ at: local.at, baseRevision: local.baseRevision });
				}
			})
			.catch((e) => {
				if (live) setError(e.message);
			})
			.finally(() => {
				if (live) setLoading(false);
			});
		return () => {
			live = false;
		};
	}, [id, storageKey, install]);
	useEffect(() => {
		if (selected) setSelectedNode('');
	}, [selected]);
	const change: Change = (edit) => {
		if (!current.current || recovery || conflict || readOnlyRef.current) return false;
		const prior = current.current;
		const { next, reason } = guardedLayoutEdit(prior, edit, layoutLocksSupportedRef.current);
		if (!next) { setError(reason); setAnnouncement(reason); return false; }
		if (!documentAnchorsSupportedRef.current && hasBuilderAnchors(next)) { setError('Backend belum mendukung tautan bagian; perubahan ditahan agar nama jangkar tidak hilang.'); return false; }
		if (!presentationVisibilitySupportedRef.current && hasBuilderVisibility(next)) { const reason = 'Backend belum mendukung visibilitas presentasi; perubahan ditahan agar data tidak hilang.'; setError(reason); setAnnouncement(reason); return false; }
		if (!themePaletteSupportedRef.current && hasBuilderThemePalette(next)) { const reason = 'Backend belum mendukung palet tema dokumen; perubahan ditahan agar data tidak hilang.'; setError(reason); setAnnouncement(reason); return false; }
		if (!builderNodeVisibilitySafe(next)) { const reason = 'Visibilitas ditolak: elemen tersembunyi tidak boleh berisi asesmen, pengakuan wajib, atau jenis elemen yang belum didukung.'; setError(reason); setAnnouncement(reason); return false; }
		remapDuplicateBuilderAnchors(next);
		if (!nestedRichTextSupportedRef.current && hasNestedBuilderLists(next)) { setError('Backend belum mendukung daftar bertingkat; perubahan ditahan agar struktur teks tidak hilang.'); return false; }
		if (!mediaPlaybackSupportedRef.current && hasBuilderPlaybackDetails(next)) { setError('Backend belum mendukung rentang dan kecepatan pemutaran media; perubahan ditahan agar data tidak hilang.'); return false; }
		if (encode(next) === encode(prior)) return false;
		past.current = [...past.current.slice(-29), prior];
		future.current = [];
		install(next);
		setHistoryVersion((v) => v + 1);
		return true;
	};
	const authoringTools = useBuilderAuthoringTools({ id, draft, disabled: conflict || Boolean(recovery) || !online || readOnlyRef.current, selectedActivityId: active, selectedBlockId: selected, selectedGroupId: selectedNode,
		onApply: (source, operation: ProposalOperation, target: ProposalTarget) => {
			if (!current.current || conflict || recovery || !online) throw new Error('Draf belum siap menerima tambahan. Selesaikan pemulihan atau konflik terlebih dahulu.');
			const reason = layoutLockTransitionReason(current.current, source, layoutLocksSupportedRef.current);
			if (reason) throw new Error(reason);
			if (!change(next => { Object.assign(next, structuredClone(source)); })) throw new Error('Usulan tidak diterapkan. Periksa mode hanya-baca atau status draf.');
			if (operation === 'replace') setActive(target.activityId);
			else if (operation === 'insert') setActive(target.activityId);
			else setActive(source.document.activities[0]?.id || active);
			setSelected(''); setInsertion(null);
			setAnnouncement(`Usulan ${operation.toUpperCase()} diterapkan sebagai satu perubahan. Jadwal draf tetap dipertahankan.`);
		},
	});
	const save = useCallback(async () => {
		if (!current.current || savingRef.current || conflictRef.current) return;
		if (!themePaletteSupportedRef.current && hasBuilderThemePalette(current.current)) { setError('Backend belum mendukung palet tema dokumen; perubahan ditahan agar warna tidak hilang.'); return; }
		if (!presentationVisibilitySupportedRef.current && hasBuilderVisibility(current.current)) { setError('Backend belum mendukung visibilitas presentasi; perubahan ditahan agar data tidak hilang.'); return; }
		if (!builderRichTextValid(current.current)) { setError('Format teks atau kedalaman daftar tidak valid; perbaiki sebelum menyimpan.'); return; }
		if (!documentAnchorsSupportedRef.current && hasBuilderAnchors(current.current)) { setError('Backend belum mendukung tautan bagian; perubahan ditahan agar nama jangkar tidak hilang.'); return; }
		if (!mediaCaptionsSupportedRef.current && hasBuilderCaptions(current.current)) { setError('Backend belum mendukung keterangan media bertanda waktu; perubahan ditahan agar data tidak hilang.'); return; }
		if (!mediaPlaybackSupportedRef.current && hasBuilderPlaybackDetails(current.current)) { setError('Backend belum mendukung rentang dan kecepatan pemutaran media; perubahan ditahan agar data tidak hilang.'); return; }
		if (!nestedRichTextSupportedRef.current && hasNestedBuilderLists(current.current)) { setError('Backend belum mendukung daftar bertingkat; perubahan ditahan agar struktur teks tidak hilang.'); return; }
		if (!layoutLocksSupportedRef.current && hasLayoutLockFields(current.current)) { setError(LAYOUT_LOCK_CAPABILITY_REASON); return; }
		if (!detailedBorderRadiusSupportedRef.current && hasDetailedBorderRadius(current.current)) { setError('Backend belum mendukung garis tepi dan sudut terperinci; perubahan ditahan agar data tidak hilang.'); return; }
		if (!responsiveBorderRadiusSupportedRef.current && hasResponsiveBorderRadius(current.current)) { setError('Backend belum mendukung garis dan sudut responsif; perubahan ditahan agar data tidak hilang.'); return; }
		if (readOnlyRef.current) return;
		if (!navigator.onLine) { setError('Anda sedang offline. Perubahan belum tersimpan di server; coba simpan setelah terhubung.'); return; }
		const savingId = id;
		savingRef.current = true;
		setSaving(true);
		setError('');
		try {
			const { record, hash } = await saveQueue.current.save(savingId, revisionRef.current, current.current);
			if (activeId.current !== savingId) return;
			revisionRef.current = record.revision;
			setRevision(record.revision);
			setSaved(hash);
		} catch (e) {
			if (activeId.current !== savingId) return;
			const message = (e as Error).message;
			setError(message);
			if (isEnhancedAuthoringDenied(e)) {
				readOnlyRef.current = true;
				setCapability((prior) => ({
					authoring: false,
					readOnlyRendering: true,
					mode: 'off',
					reason: 'disabled',
					notice: prior?.notice || '',
				}));
			} else if (message.includes('REVISION_CONFLICT')) {
				conflictRef.current = true;
				setConflict(true);
			}
		} finally {
			savingRef.current = false;
			if (activeId.current === savingId) setSaving(false);
		}
	}, [id]);
	useEffect(() => {
		if (!draft || !dirty || saving || recovery || conflict || error || !online || readOnlyRef.current) return;
		const timer = window.setTimeout(() => void save(), 1000);
		return () => window.clearTimeout(timer);
	}, [draft, dirty, saving, recovery, conflict, error, online, save]);
	useEffect(() => {
		if (!draft || recovery || readOnlyRef.current) return;
		try {
			if (dirty)
				localStorage.setItem(
					storageKey,
					JSON.stringify({
						at: Date.now(),
						envelope: draft,
						baseRevision: revisionRef.current,
					}),
				);
			else localStorage.removeItem(storageKey);
		} catch {
			setStorageWarning('Salinan pemulihan perangkat tidak tersedia. Simpan di server atau unduh draf sebelum keluar.');
		}
	}, [draft, dirty, recovery, storageKey]);
	useEffect(() => {
		if (!dirty && !saving) return;
		const handler = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = '';
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	}, [dirty, saving]);
	const undo = (forward = false) => {
		if (recovery || conflict || readOnlyRef.current) return;
		const next = moveBuilderHistory(
			past.current,
			future.current,
			current.current,
			forward,
		);
		if (!next) return;
		install(next);
		setHistoryVersion((v) => v + 1);
	};
	const downloadEnvelope = (envelope: BuilderEnvelope) => {
		const url = URL.createObjectURL(
			new Blob([JSON.stringify(envelope, null, 2)], {
				type: 'application/json',
			}),
		);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'laras-draf-pribadi.json';
		a.click();
		URL.revokeObjectURL(url);
	};
	const download = () => { if (current.current) downloadEnvelope(current.current); };
	const reload = async () => {
		if (
			dirty &&
			!window.confirm(
				'Muat versi server? Unduh salinan draf terlebih dahulu jika ingin menyimpan perubahan perangkat.',
			)
		)
			return;
		setLoading(true);
		try {
			const r = await builderRequest<BuilderRecord>('get', { id });
			documentAnchorsSupportedRef.current = r.documentAnchors === true;
			setDocumentAnchorsSupported(r.documentAnchors === true);
			presentationVisibilitySupportedRef.current = r.presentationVisibility === true; setPresentationVisibilitySupported(r.presentationVisibility === true);
			themePaletteSupportedRef.current = r.themePalette === true; setThemePaletteSupported(r.themePalette === true);
			layoutLocksSupportedRef.current = r.layoutLocks === true;
			setLayoutLocksSupported(r.layoutLocks === true);
			customColorsSupportedRef.current = r.customColors === true;
			detailedBorderRadiusSupportedRef.current = r.detailedBorderRadius === true;
			setDetailedBorderRadiusSupported(r.detailedBorderRadius === true);
			responsiveBorderRadiusSupportedRef.current = r.responsiveBorderRadius === true;
			setResponsiveBorderRadiusSupported(r.responsiveBorderRadius === true);
			mediaCaptionsSupportedRef.current = r.mediaCaptions === true;
			setMediaCaptionsSupported(r.mediaCaptions === true);
			mediaPlaybackSupportedRef.current = r.mediaPlayback === true;
			setMediaPlaybackSupported(r.mediaPlayback === true);
			nestedRichTextSupportedRef.current = r.nestedRichText === true;
			setNestedRichTextSupported(r.nestedRichText === true);
			setCustomColorsSupported(r.customColors === true);
			install({ document: r.document, privateKeys: r.privateKeys });
			setSaved(encode({ document: r.document, privateKeys: r.privateKeys }));
			revisionRef.current = r.revision;
			setRevision(r.revision);
			setConflict(false);
			saveQueue.current.reset();
			conflictRef.current = false;
			past.current = [];
			future.current = [];
			setSelected('');
			setSelectedNode('');
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setLoading(false);
		}
	};
	if (loading)
		return (
			<div className="bd-loading" role="status">
				Membuka builder…
			</div>
		);
	if (!draft)
		return (
			<div className="bd-new">
				<h1>Draf belum dapat dibuka</h1>
				<p role="alert">{error}</p>
				<Link to="/app/kelas-terjadwal">Kembali ke kelas</Link>
			</div>
		);
	const d = draft.document,
		activity = d.activities.find((a) => a.id === active) || d.activities[0],
		block = activity?.blocks.find((b) => b.id === selected),
		issues = builderIssues(draft),
		questionCount = Object.keys(d.questionsById).length,
		points = Object.values(d.questionsById).reduce((s, q) => s + q.points, 0);
	const selectedGroup =
		activity?.layout && selectedNode
			? findLayoutGroup(activity.layout, selectedNode)
			: null;
	const libraryGroup = selectedGroup || (activity && block ? layoutItemLocation(activity, block.id)?.parent : null);
	const contextLabel = [
		contextCourse ? `${contextCourse.code} · ${contextCourse.title}` : '',
		contextMeeting
			? `Pertemuan ${contextMeeting.week} · ${contextMeeting.title}`
			: '',
	].filter(Boolean).join(' · ');
	const saveLabel = !online
		? 'Offline'
		: conflict
			? 'Konflik revisi'
			: recovery
				? 'Ada pemulihan perangkat'
				: error
					? 'Belum tersimpan'
					: saving
						? 'Menyimpan…'
						: dirty
							? 'Belum tersimpan'
							: 'Tersimpan';
	const selectActivity = (activityId: string) => {
		setCollapsed((items) => items.filter((id) => id !== activityId));
		setActive(activityId);
		setInsertion(null);
		setSelected('');
		setSelectedNode('');
		setPanel('content');
		setPicker(false);
		setActivityDrawer(false);
		requestAnimationFrame(() =>
			document
				.getElementById('builder-activity-' + activityId)
				?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
		);
	};
	const moveActivity = (aId: string, delta: number) =>
		change((next) => {
			const index = next.document.activities.findIndex((a) => a.id === aId),
				to = index + delta;
			if (to < 0 || to >= next.document.activities.length) return;
			[next.document.activities[index], next.document.activities[to]] = [
				next.document.activities[to],
				next.document.activities[index],
			];
		});
	const locked = conflict || Boolean(recovery);
	lockedRef.current = locked;
	// Enhanced capability is server-owned; a denied lecturer gets a fully capable
	// read-only view instead of a reduced editor that would drop layout/appearance.
	const enhancedDocument = usesEnhancedAuthoring(draft.document);
	// Reflect the server decision so enabled lecturers never see a denial notice.
	const layoutLockFallback = !layoutLocksSupported && hasLayoutLockFields(draft);
	const nestedListsFallback = !nestedRichTextSupported && hasNestedBuilderLists(draft);
	const anchorFallback = !documentAnchorsSupported && hasBuilderAnchors(draft);
	const themePaletteFallback = !themePaletteSupported && hasBuilderThemePalette(draft);
	const readOnly = (capability ? !capability.authoring : false) || layoutLockFallback || nestedListsFallback || anchorFallback || themePaletteFallback;
	readOnlyRef.current = readOnly;
	const capabilityNotice = anchorFallback
		? 'Backend belum mendukung tautan bagian. Draf ditampilkan hanya-baca agar ID tujuan dan tautan internal tidak hilang.'
		: themePaletteFallback
		? 'Backend belum mendukung palet tema dokumen. Draf ditampilkan hanya-baca agar warna tidak hilang.'
		: nestedListsFallback
		? 'Backend belum mendukung daftar bertingkat. Draf ditampilkan hanya-baca agar struktur, urutan, dan isi teks tidak hilang.'
		: capability
		? enhancedAuthoringNotice(
				capability,
				enhancedDocument,
			)
		: '';
	const appearanceResetUnsupported = (!customColorsSupported && hasCustomThemeColors(draft)) || (!detailedBorderRadiusSupported && hasDetailedBorderRadius(draft)) || (!responsiveBorderRadiusSupported && hasResponsiveBorderRadius(draft));
	const canResetDocumentAppearance = !saving && !locked && !readOnly && !appearanceResetUnsupported && hasDocumentAppearanceToReset(draft);
	const resetDocumentAppearanceNow = () => {
		const envelope = current.current;
		if (!envelope || savingRef.current || conflictRef.current || recovery || readOnlyRef.current ||
			(!customColorsSupportedRef.current && hasCustomThemeColors(envelope)) ||
			(!detailedBorderRadiusSupportedRef.current && hasDetailedBorderRadius(envelope)) ||
			(!responsiveBorderRadiusSupportedRef.current && hasResponsiveBorderRadius(envelope))) return;
		if (change(resetDocumentAppearance)) setAnnouncement('Tampilan elemen direset. Tata letak, latar khusus, dan palet warna dokumen tetap dipertahankan.');
		setResetAppearanceOpen(false);
	};
	const requestCanvasReveal = (kind: 'group' | 'block', itemId: string) => {
		const request = { kind, id: itemId, focus: activityDrawer };
		if (activityDrawer) drawerReveal.current = request;
		setCanvasReveal(request);
	};
	const selectGroup = (activityId: string, nodeId: string, fromNavigator = false) => {
		setCollapsed((items) => items.filter((id) => id !== activityId));
		setActive(activityId);
		setSelected('');
		setSelectedNode(nodeId);
		setInsertion(null);
		setPicker(false);
		setActivityDrawer(false);
		setPanel('content');
		if (!fromNavigator && window.matchMedia('(max-width: 650px)').matches) setInspectorOpen(true);
		requestCanvasReveal('group', nodeId);
	};
	const addGroup = (kind: 'section' | 'container', parentId: string | null = null) => {
		if (!activity || locked) return;
		let id = '';
		if (!change((next) => {
			id = addLayoutGroupToActivity(next, activity.id, kind, parentId);
		})) return;
		if (!id) {
			setAnnouncement('Batas bagian atau kedalaman tata letak tercapai.');
			return;
		}
		selectGroup(activity.id, id);
		setAnnouncement(
			kind === 'section' ? 'Bagian ditambahkan.' : 'Kontainer ditambahkan.',
		);
	};
	const moveStructureItem = (itemId: string, delta: number) => {
		if (!activity || locked) return;
		change((next) => {
			const target = next.document.activities.find((a) => a.id === activity.id);
			if (!target) return;
			if (target.layout) {
				moveLayoutItem(target, itemId, delta);
				return;
			}
			const index = target.blocks.findIndex((b) => b.id === itemId);
			const to = index + delta;
			if (index < 0 || to < 0 || to >= target.blocks.length) return;
			[target.blocks[index], target.blocks[to]] = [
				target.blocks[to],
				target.blocks[index],
			];
		});
	};
	const moveBlockBy = (activityId: string, blockId: string, delta: number) => {
		if (locked) return;
		change((next) => {
			const target = next.document.activities.find((a) => a.id === activityId);
			if (!target) return;
			if (target.layout) {
				moveLayoutItem(target, blockId, delta);
				return;
			}
			const index = target.blocks.findIndex((b) => b.id === blockId);
			const to = index + delta;
			if (index < 0 || to < 0 || to >= target.blocks.length) return;
			[target.blocks[index], target.blocks[to]] = [
				target.blocks[to],
				target.blocks[index],
			];
		});
	};
	const reparentStructureItem = (
		itemId: string,
		direction: 'in' | 'out',
	) => {
		if (!activity || locked) return;
		let moved = false;
		if (!change((next) => {
			const target = next.document.activities.find((a) => a.id === activity.id);
			if (target) moved = reparentLayoutItem(target, itemId, direction);
		})) return;
		if (!moved)
			setAnnouncement('Tidak dapat memindahkan bagian ke dalam dirinya sendiri atau melewati batas kedalaman.');
	};
	const removeGroup = (groupId: string, activityId = activity?.id) => {
		if (!activityId || locked) return;
		if (!change((next) => {
			removeLayoutGroupFromActivity(next, activityId, groupId);
		})) return;
		setSelectedNode('');
		setAnnouncement('Bagian dihapus. Elemen dan pertanyaan di dalamnya tetap tersimpan.');
	};
	const publish = async () => {
		if (dirty || saving || locked || publishing || !online || readOnly || builderIssues(draft).length || (!presentationVisibilitySupportedRef.current && hasBuilderVisibility(draft)) || (!themePaletteSupportedRef.current && hasBuilderThemePalette(draft)) || (!responsiveBorderRadiusSupportedRef.current && hasResponsiveBorderRadius(draft)) || (!mediaCaptionsSupportedRef.current && hasBuilderCaptions(draft)) || (!mediaPlaybackSupportedRef.current && hasBuilderPlaybackDetails(draft)) || (!nestedRichTextSupportedRef.current && hasNestedBuilderLists(draft))) return;
		setPublishing(true); setError('');
		if (publishCommand.current.revision !== revision) publishCommand.current = { revision, id: uid() };
		try {
			const hasResponsiveDetails = hasResponsiveBorderRadius(draft);
			const hasCaptions = hasBuilderCaptions(draft);
			const hasNestedLists = hasNestedBuilderLists(draft);
			const hasPlayback = hasBuilderPlaybackDetails(draft);
			const hasAnchors = hasBuilderAnchors(draft);
			const hasVisibility = hasBuilderVisibility(draft);
			const hasThemePalette = hasBuilderThemePalette(draft);
			const result = await deliveryRequest<{ runId: string }>(hasThemePalette ? 'themePalette:publish' : hasVisibility ? 'presentationVisibility:publish' : hasAnchors ? 'documentAnchors:publish' : hasPlayback ? 'mediaPlayback:publish' : hasNestedLists ? 'nestedLists:publish' : hasCaptions ? 'mediaCaptions:publish' : hasResponsiveDetails ? 'responsiveStyles:publish' : 'publish', { id, baseRevision: revision, commandId: publishCommand.current.id, ...(hasThemePalette ? { themePalette: true } : {}), ...(hasVisibility ? { presentationVisibility: true } : {}), ...(hasAnchors ? { documentAnchors: true } : {}), ...(hasResponsiveDetails ? { responsiveBorderRadius: true } : {}), ...(hasCaptions ? { mediaCaptions: true } : {}), ...(hasNestedLists ? { nestedRichText: true } : {}), ...(hasPlayback ? { mediaPlayback: true } : {}) });
			navigate('/app/kegiatan/' + result.runId);
		} catch (failure) {
			setError((failure as Error).message);
			setPublishReview(false);
		} finally { setPublishing(false); }
	};
	const resolveCanvasScrollElement = (): HTMLElement | null => {
		let element = canvasRoot.current;
		while (element && element !== document.body) {
			if (!element.classList.contains('bd-builder-sidebar') && !element.classList.contains('bd-inspector')) {
				const overflowY = getComputedStyle(element).overflowY;
				if ((overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight) return element;
			}
			element = element.parentElement;
		}
		// The page is the canvas scroll surface at normal viewport sizes; side panels are siblings.
		const page = document.scrollingElement as HTMLElement | null;
		return page && page.scrollHeight > page.clientHeight ? page : null;
	};
	const refreshDropTargetAt = (x: number, y: number) => {
		const root = workspaceRoot.current;
		if (!root) return;
		const address = builderDropTargetFromElement(document.elementFromPoint(x, y), root);
		const key = address ? `${address.activityId}:${address.parentId || 'root'}:${address.beforeId || 'end'}` : '';
		if (key !== pointerDropTarget.current && address) {
			pointerDropTarget.current = key;
			const targetActivity = current.current?.document.activities.find(activity => activity.id === address.activityId);
			const targetBlock = targetActivity?.blocks.find(block => block.id === address.beforeId);
			const targetGroup = address.parentId && targetActivity?.layout ? findLayoutGroup(targetActivity.layout, address.parentId) : null;
			const location = targetBlock ? `sebelum ${BLOCK_LABELS[targetBlock.type] || 'elemen'}` : targetGroup ? `di akhir ${targetGroup.title || 'bagian'}` : 'di akhir kegiatan';
			setAnnouncement(`Tujuan seret: ${targetActivity?.title || 'kegiatan'}, ${location}.`);
		} else if (!address) pointerDropTarget.current = '';
		setDropTarget(currentKey => currentKey === key ? currentKey : key);
	};
	const scheduleEdgeScroll = (x: number, y: number) => {
		edgeScrollPoint.current = { x, y };
		const canvasBounds = canvasRoot.current?.getBoundingClientRect();
		const scrollElement = resolveCanvasScrollElement();
		const bounds = scrollElement?.getBoundingClientRect();
		if (!canvasBounds || x < canvasBounds.left || x > canvasBounds.right || !scrollElement || !bounds || !builderDragEdgeSpeed(y, bounds.top, bounds.bottom)) { stopEdgeScroll(); return; }
		edgeScrollElement.current = scrollElement;
		if (edgeScrollFrame.current !== null) return;
		edgeScrollTime.current = performance.now();
		const step = (now: number) => {
			edgeScrollFrame.current = null;
			const point = edgeScrollPoint.current;
			const target = edgeScrollElement.current;
			const activeCanvas = canvasRoot.current?.getBoundingClientRect();
			if (!point || !target || !activeCanvas || point.x < activeCanvas.left || point.x > activeCanvas.right || !dragItem.current || lockedRef.current || readOnlyRef.current || conflictRef.current || dragItem.current.revision !== undefined && (revisionRef.current !== dragItem.current.revision || current.current !== dragItem.current.snapshot)) { stopEdgeScroll(); return; }
			const rect = target.getBoundingClientRect();
			const speed = builderDragEdgeSpeed(point.y, rect.top, rect.bottom);
			const delta = builderDragScrollDelta(speed, now - edgeScrollTime.current);
			edgeScrollTime.current = now;
			const max = Math.max(0, target.scrollHeight - target.clientHeight);
			const before = target.scrollTop;
			target.scrollTop = Math.max(0, Math.min(max, before + delta));
			if (target.scrollTop !== before) {
				refreshDropTargetAt(point.x, point.y);
				edgeScrollFrame.current = requestAnimationFrame(step);
			} else stopEdgeScroll();
		};
		edgeScrollFrame.current = requestAnimationFrame(step);
	};
	const finishDrag = () => {
		stopEdgeScroll();
		dragItem.current = null;
		pointerGesture.current = null;
		setDragging(false);
		setDropTarget('');
	};
	const cancelPointerDrag = () => {
		if (!pointerGesture.current) return;
		stopEdgeScroll();
		pointerGesture.current = null;
		pointerDropTarget.current = '';
		dragItem.current = null;
		setDragging(false);
		setDropTarget('');
	};
	const beginPointerDrag = (event: ReactPointerEvent<HTMLElement>, item: NonNullable<typeof dragItem.current>) => {
		if (pointerGesture.current && pointerGesture.current.pointerId !== event.pointerId) { cancelPointerDrag(); return; }
		if ((event.pointerType !== 'touch' && event.pointerType !== 'pen') || event.isPrimary === false || locked || readOnly || recovery || conflict || !current.current) return;
		const captured = { ...item, revision: revisionRef.current, snapshot: current.current };
		dragItem.current = captured;
		pointerGesture.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, activated: false, item: captured, revision: revisionRef.current, snapshot: current.current };
		try { event.currentTarget.setPointerCapture(event.pointerId); } catch { cancelPointerDrag(); }
	};
	const movePointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
		const gesture = pointerGesture.current;
		if (!gesture || gesture.pointerId !== event.pointerId) return;
		if (!updateBuilderPointerGesture(gesture, event.clientX, event.clientY)) return;
		if (!dragging) setDragging(true);
		refreshDropTargetAt(event.clientX, event.clientY);
		scheduleEdgeScroll(event.clientX, event.clientY);
	};
	const finishPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
		const gesture = pointerGesture.current;
		if (!gesture || gesture.pointerId !== event.pointerId) return;
		const hit = document.elementFromPoint(event.clientX, event.clientY);
		const address = builderDropTargetFromElement(hit, workspaceRoot.current!);
		const activated = gesture.activated;
		const validSnapshot = current.current === gesture.snapshot && revisionRef.current === gesture.revision && !locked && !readOnlyRef.current && !recovery && !conflict;
		pointerGesture.current = null;
		pointerDropTarget.current = '';
		stopEdgeScroll();
		if (activated && validSnapshot && address) {
			const { activityId, beforeId, parentId } = address;
			if (gesture.item.elementId) addElement(gesture.item.elementId, { activityId, beforeId, parentId });
			else if (gesture.item.groupId) {
				const fakeEvent = { preventDefault() {}, stopPropagation() {}, dataTransfer: { getData: () => gesture.item.groupId || '' } } as unknown as DragEvent;
				dropElement(fakeEvent, activityId, beforeId, parentId);
			}
			else {
				const fakeEvent = { preventDefault() {}, stopPropagation() {}, dataTransfer: { getData: () => gesture.item.blockId || '' } } as unknown as DragEvent;
				dropElement(fakeEvent, activityId, beforeId, parentId);
			}
		}
		if (activated) {
			event.preventDefault();
			if (gesture.item.groupId) {
				if (!validSnapshot || !address) setAnnouncement('Seret bagian dibatalkan; draf tidak berubah.');
			} else setAnnouncement(validSnapshot && address ? 'Elemen dipindahkan atau ditambahkan.' : 'Seret dibatalkan; draf tidak berubah.');
		}
		dragItem.current = null;
		setDragging(false);
		setDropTarget('');
	};
	const openElements = (
		activityId: string,
		beforeId?: string,
		parentId?: string,
	) => {
		setActive(activityId);
		setSelectedNode(parentId || '');
		setInsertion({ activityId, beforeId, parentId });
		setPanel('content');
		setActivityDrawer(false);
		setInspectorOpen(false);
		setPicker(true);
	};
	const revealBlock = (activityId: string, blockId: string) => {
		setCollapsed((items) => items.filter((id) => id !== activityId));
		setActive(activityId);
		setSelected(blockId);
		setSelectedNode('');
		setPanel('content');
		setPicker(false);
		setActivityDrawer(false);
		requestCanvasReveal('block', blockId);
	};
	const addInlineText = (activityId: string, text: string) => {
		if (!text.trim() || locked) return;
		const target = current.current?.document.activities.find(item => item.id === activityId);
		if (!target || target.blocks.length) return;
		if (!current.current || current.current.document.activities.reduce((sum, item) => sum + item.blocks.length, 0) >= 500) {
			setAnnouncement('Batas 500 elemen tercapai. Hapus elemen sebelum menambah lagi.');
			return;
		}
		let blockId = '';
		change((next) => {
			blockId = appendBlock(next, activityId, 'instructions');
			const added = next.document.activities
				.find((a) => a.id === activityId)!
				.blocks.find((b) => b.id === blockId)!;
			added.body = rich(text);
		});
		if (!blockId) return;
		setActive(activityId);
		setSelected(blockId);
		setInsertion(null);
		setAnnouncement('Teks ditambahkan. Anda dapat langsung menyuntingnya.');
		requestAnimationFrame(() => {
			const field = document.querySelector<HTMLTextAreaElement>(
				`#builder-block-${blockId} textarea`,
			);
			field?.focus();
			if (field) field.setSelectionRange(field.value.length, field.value.length);
		});
	};
	const addElement = (
		elementId: string,
		position = insertion || {
			activityId: activity?.id,
			beforeId: undefined as string | undefined,
		},
	) => {
		const { activityId, beforeId, parentId } = position;
		const element = BUILDER_ELEMENTS.find((e) => e.id === elementId);
		if (!element || !activityId || locked) return;
		const target = current.current?.document.activities.find(
			(a) => a.id === activityId,
		);
		if (!target) return;
		const insertionTarget = resolveBlockInsertionTarget(structuredClone(target), beforeId, parentId || null);
		if (!insertionTarget) return;
		if (
			current.current!.document.activities.reduce(
				(sum, a) => sum + a.blocks.length,
				0,
			) >= 500 ||
			Object.keys(current.current!.document.questionsById).length >= 500
		) {
			setAnnouncement(
				'Batas 500 elemen atau pertanyaan tercapai. Hapus elemen sebelum menambah lagi.',
			);
			return;
		}
		let blockId = '';
		if (!change((next) => {
			blockId = appendBlock(next, activityId, element.type);
			const blocks = next.document.activities.find(
				(a) => a.id === activityId,
			)!.blocks;
			const added = blocks.find((block) => block.id === blockId)!;
			if (element.shortAnswer) {
				for (const qid of added.questionIds || []) {
					delete next.document.questionsById[qid];
					delete next.privateKeys.answersByQuestionId[qid];
				}
				added.questionIds = [appendQuestion(next, 'short_answer')];
			}
			const targetActivity = next.document.activities.find(
				(a) => a.id === activityId,
			);
			if (targetActivity) {
				insertBlockAtTarget(targetActivity, blockId, insertionTarget);
			}
		})) return;
		setInsertion({ activityId, beforeId, parentId });
		setAnnouncement(
			`${element.label} ditambahkan ke ${target.title || 'kegiatan'}.`,
		);
		revealBlock(activityId, blockId);
	};
	const dropElement = (
		event: DragEvent,
		activityId: string,
		beforeId?: string,
		parentId?: string,
	) => {
		event.preventDefault();
		event.stopPropagation();
		const item = dragItem.current;
		finishDrag();
		if (!item || locked || readOnly || recovery || conflict) return;
		const raw = event.dataTransfer.getData(BUILDER_DRAG_TYPE);
		if (item.elementId ? raw !== item.elementId : raw !== (item.groupId || item.blockId)) return;
		if (item.revision !== undefined && (revisionRef.current !== item.revision || current.current !== item.snapshot)) { setAnnouncement('Draf berubah saat elemen diseret; draf tidak berubah.'); return; }
		if (item.elementId) {
			addElement(item.elementId, { activityId, beforeId, parentId });
			return;
		}
		if (item.groupId) {
			if (!item.activityId || item.activityId !== activityId) { setAnnouncement('Bagian hanya dapat dipindahkan di dalam kegiatan yang sama.'); return; }
			if (item.revision !== undefined && (revisionRef.current !== item.revision || current.current !== item.snapshot)) { setAnnouncement('Draf berubah saat bagian diseret; draf tidak berubah.'); return; }
			const source = current.current?.document.activities.find(a => a.id === item.activityId);
			if (!source || !findLayoutGroup(source.layout!, item.groupId)) return;
			const target = resolveLayoutGroupMoveTarget(structuredClone(source), beforeId, parentId || null);
			if (!target) { setAnnouncement('Tujuan bagian tidak valid; draf tidak berubah.'); return; }
			const preview = structuredClone(source);
			if (!moveLayoutGroupAtTarget(preview, item.groupId, target)) { setAnnouncement('Tujuan tidak mengubah posisi bagian atau berada di dalam bagiannya sendiri.'); return; }
			let moved = false;
			if (!change(next => {
				const destination = next.document.activities.find(a => a.id === item.activityId);
				if (destination) moved = moveLayoutGroupAtTarget(destination, item.groupId!, target);
			})) return;
			if (!moved) return;
			setInsertion(null);
			setAnnouncement('Bagian dan seluruh isinya dipindahkan.');
			selectGroup(activityId, item.groupId);
			return;
		}
		if (!item.blockId || !item.activityId || item.blockId === beforeId) return;
		const source = current.current?.document.activities.find(
			(a) => a.id === item.activityId,
		);
		if (!source?.blocks.some((b) => b.id === item.blockId)) return;
		const targetSnapshot = current.current?.document.activities.find((a) => a.id === activityId);
		if (!targetSnapshot) return;
		const insertionTarget = resolveBlockInsertionTarget(structuredClone(targetSnapshot), beforeId, parentId || null);
		if (!insertionTarget) return;
		if (!change((next) => {
			const from = next.document.activities.find(
				(a) => a.id === item.activityId,
			)!;
			const to = next.document.activities.find((a) => a.id === activityId);
			if (!to) return;
			if (from.id !== to.id) {
				const index = from.blocks.findIndex((block) => block.id === item.blockId);
				if (index < 0) return;
				if (from.layout) removeBlockFromLayout(from, item.blockId!);
				const [moving] = from.blocks.splice(index, 1);
				const beforeIndex = beforeId ? to.blocks.findIndex((block) => block.id === beforeId) : -1;
				to.blocks.splice(beforeIndex < 0 ? to.blocks.length : beforeIndex, 0, moving);
				if (to.layout) insertBlockAtTarget(to, item.blockId!, insertionTarget);
				return;
			}
			const index = from.blocks.findIndex((b) => b.id === item.blockId);
			const [moving] = from.blocks.splice(index, 1);
			const at = beforeId ? to.blocks.findIndex((b) => b.id === beforeId) : -1;
			to.blocks.splice(at < 0 ? to.blocks.length : at, 0, moving);
			if (to.layout) insertBlockAtTarget(to, item.blockId!, insertionTarget);
		})) return;
		setInsertion(null);
		setAnnouncement('Posisi elemen diperbarui.');
		revealBlock(activityId, item.blockId);
	};
	const insertionSlot = (activityId: string, beforeId?: string, parentId?: string) => {
		const key = activityId + ':' + (parentId || 'root') + ':' + (beforeId || 'end');
		return (
			<div
				className={
					'bd-insertion-slot' +
					(dragging ? ' is-dragging' : '') +
					(dropTarget === key ? ' is-over' : '')
				}
				data-builder-drop-activity={activityId}
				data-builder-drop-before={beforeId || undefined}
				data-builder-drop-parent={parentId || undefined}
				onDragOver={(event) => {
				if (!dragItem.current || locked) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = dragItem.current.elementId
					? 'copy'
					: 'move';
					setDropTarget(key);
					refreshDropTargetAt(event.clientX, event.clientY);
					scheduleEdgeScroll(event.clientX, event.clientY);
				}}
				onDragLeave={() =>
					setDropTarget((current) => (current === key ? '' : current))
				}
				onDrop={(event) => dropElement(event, activityId, beforeId, parentId)}
			>
				<button
					type="button"
					disabled={locked}
					aria-label={
						beforeId
							? `Sisipkan elemen sebelum ${(() => { const target = d.activities.find(a => a.id === activityId); const block = target?.blocks.find(b => b.id === beforeId); const group = target?.layout ? findLayoutGroup(target.layout, beforeId) : null; return block ? BLOCK_LABELS[block.type] : group ? (group.kind === 'section' ? 'bagian' : 'kontainer') : 'elemen'; })()}`
							: 'Tambah elemen di akhir kegiatan'
					}
					onClick={() => openElements(activityId, beforeId, parentId)}
				>
					<Plus size={14} />
					<span>
						{dragging ? 'Letakkan di sini' : 'Tambah'}
					</span>
				</button>
			</div>
		);
	};
	const outlineContents = (
		<div className="bd-outline">
			<header>
				<span className="bd-kicker">KEGIATAN</span>
				<span>{d.activities.length}</span>
			</header>
			<ol>
				{d.activities.map((a, i) => (
					<li key={a.id} className={activity?.id === a.id ? 'is-active' : ''}>
						<button
							type="button"
							className="bd-outline-select"
							onClick={() => selectActivity(a.id)}
						>
							<span>{String(i + 1).padStart(2, '0')}</span>
							<strong>{a.title || 'Kegiatan tanpa judul'}</strong>
							<small>
								{a.blocks.length} elemen
								{d.kind === 'kelas' ? ` · ${a.plannedMinutes} menit` : ''}
							</small>
						</button>
						<div className="bd-outline-actions">
							<button
								type="button"
								aria-label={`Naikkan kegiatan ${i + 1}`}
								disabled={i === 0 || conflict || Boolean(recovery)}
								onClick={() => moveActivity(a.id, -1)}
							>
								<ArrowUp size={13} />
							</button>
							<button
								type="button"
								aria-label={`Turunkan kegiatan ${i + 1}`}
								disabled={
									i === d.activities.length - 1 || conflict || Boolean(recovery)
								}
								onClick={() => moveActivity(a.id, 1)}
							>
								<ArrowDown size={13} />
							</button>
							<button
								type="button"
								aria-label={`Duplikat kegiatan ${i + 1}`}
								disabled={
									conflict || Boolean(recovery) || d.activities.length >= 50
								}
								onClick={() => {
									let copied = '';
									if (!change((next) => {
										copied = duplicateActivity(next, a.id);
									})) return;
									setActive(copied);
									setInsertion(null);
									setSelected('');
								}}
							>
								<Copy size={13} />
							</button>
						</div>
					</li>
				))}
			</ol>
			<button
				className="bd-outline-add"
				disabled={d.activities.length >= 50 || conflict || Boolean(recovery)}
				onClick={() => {
					const a = newActivity();
					change((next) => {
						next.document.activities.push(a);
					});
					setPicker(false);
					setActivityDrawer(false);
					setActive(a.id);
					setInsertion(null);
					setSelected('');
				}}
			>
				<Plus size={16} />
				Tambah kegiatan
			</button>
			<BuilderLayoutNavigator
				activity={activity}
				selectedNodeId={selectedNode}
				selectedBlockId={selected}
				disabled={locked || readOnly}
				onRenameGroup={(nodeId, title) => {
					if (!activity || locked || readOnly) return;
					change(next => { renameNavigatorGroup(next, activity.id, nodeId, title, locked || readOnlyRef.current); });
				}}
				onSelectGroup={(nodeId) => activity && selectGroup(activity.id, nodeId, true)}
				onSelectBlock={(blockId) => activity && revealBlock(activity.id, blockId)}
				onAddGroup={(kind, parentId) => addGroup(kind, parentId)}
				onMove={moveStructureItem}
				onReparent={reparentStructureItem}
				onRemoveGroup={removeGroup}
			/>
			{activity && (selected || selectedNode) && <BuilderLayoutLockControl activity={activity} nodeId={selected || selectedNode} disabled={locked || readOnly} supported={layoutLocksSupported} onChange={change} />}
			<p>Draf pribadi · hanya dosen</p>
		</div>
	);
	const insertionActivity =
		d.activities.find((a) => a.id === insertion?.activityId) || activity;
	const beforeIndex =
		insertionActivity?.blocks.findIndex((b) => b.id === insertion?.beforeId) ??
		-1;
	const inspectorContents = (
		<>
			<header>
				<Settings2 size={16} />
				<h2>
					{block
						? 'Pengaturan elemen'
						: selectedGroup
							? selectedGroup.kind === 'section'
								? 'Pengaturan bagian'
								: 'Pengaturan kontainer'
							: 'Pengaturan kegiatan'}
				</h2>
			</header>
			{activity && (block || selectedGroup) && (() => {
				const selection: BuilderStyleSelection = { activityId: activity.id, ...(block ? { blockId: block.id } : { groupId: selectedGroup!.id }) };
				const blocked = locked || readOnly;
				return <BuilderStyleActions disabled={blocked} canPaste={canPasteBuilderStyle(draft, selection, styleClipboard, blocked)} status={styleStatus}
						onCopy={() => {
							const copied = current.current && copyBuilderStyle(current.current, selection, locked || readOnlyRef.current);
							if (copied) { setStyleClipboard(copied); setStyleStatus('Gaya disalin. Pilih target sejenis untuk menempel.'); }
						}}
						onPaste={() => {
							change(next => {
								if (pasteBuilderStyle(next, selection, styleClipboard, locked || readOnlyRef.current)) setStyleStatus('Gaya ditempel. Gunakan Urungkan untuk membatalkan.');
							});
						}} />;
			})()}
			{activity && (block || selectedGroup) && <BuilderLayoutLockControl activity={activity} nodeId={block?.id || selectedGroup!.id} disabled={locked || readOnly} supported={layoutLocksSupported} onChange={change} />}
			{block ? (
				<BuilderElementInspector key={block.id} block={block} envelope={draft} disabled={locked || readOnly} customColorsSupported={customColorsSupported} detailedBorderRadiusSupported={detailedBorderRadiusSupported} responsiveBorderRadiusSupported={responsiveBorderRadiusSupported} presentationVisibilitySupported={presentationVisibilitySupported} captionsSupported={mediaCaptionsSupported} nestedListsSupported={nestedRichTextSupported} onChange={change} />
			) : selectedGroup && activity ? (
				<>
					<BuilderLayoutInspector
						activity={activity}
						courseId={contextCourseId}
						group={selectedGroup}
						disabled={locked || readOnly}
						customColorsSupported={customColorsSupported}
						detailedBorderRadiusSupported={detailedBorderRadiusSupported}
						responsiveBorderRadiusSupported={responsiveBorderRadiusSupported}
						presentationVisibilitySupported={presentationVisibilitySupported}
						anchorNames={builderAnchors(draft).map(item => item.anchor)}
						onChange={change}
						onAddBlock={() =>
							openElements(activity.id, undefined, selectedGroup.id)
						}
						onAddGroup={(kind) => addGroup(kind, selectedGroup.id)}
						onMove={(delta) => moveStructureItem(selectedGroup.id, delta)}
						onReparent={(direction) =>
							reparentStructureItem(selectedGroup.id, direction)
						}
						onRemove={() => removeGroup(selectedGroup.id)}
					/>
					<button
						className="bd-secondary"
						disabled={locked || readOnly || dirty || saving}
						onClick={() =>
							setSavedItems({
								activityId: activity.id,
								groupId: selectedGroup.id,
							})
						}
					>
						Simpan template
					</button>
				</>
			) : activity ? (
				<div className="bd-fields">
					<label>
						Nama kegiatan
						<input
							maxLength={200}
							value={activity.title}
							onChange={(e) =>
								change((next) => {
									next.document.activities.find(
										(a) => a.id === activity.id,
									)!.title = e.target.value;
								})
							}
						/>
					</label>
					{d.kind === 'kelas' && (
						<label>
							Durasi (menit)
							<input
								type="number"
								min={1}
								max={600}
								value={activity.plannedMinutes}
								onChange={(e) =>
									change((next) => {
										next.document.activities.find(
											(a) => a.id === activity.id,
										)!.plannedMinutes = Number(e.target.value);
									})
								}
							/>
						</label>
					)}
					<label className="bd-check">
						<input
							type="checkbox"
							checked={activity.required}
							onChange={(e) =>
								change((next) => {
									next.document.activities.find(
										(a) => a.id === activity.id,
									)!.required = e.target.checked;
								})
							}
						/>
						Kegiatan wajib
					</label>
					<p className="bd-help">
						Pilih elemen pertanyaan untuk mengatur kunci jawaban dan poin.
					</p>
					<button
						className="bd-secondary"
						onClick={() => activity && openElements(activity.id)}
					>
						<Plus size={15} />
						Tambah elemen
					</button>
					<button
						className="bd-text-button"
						disabled={locked || readOnly || activityLayoutProtected(activity)}
						title={activityLayoutProtected(activity) ? LAYOUT_LOCK_REASON : undefined}
						onClick={() => {
							if (
								activity.blocks.length &&
								!window.confirm(
									'Hapus kegiatan beserta semua elemennya? Anda dapat mengurungkannya.',
								)
							)
								return;
							if (!change((next) => {
								for (const b of [...activity.blocks])
									removeBlock(next, activity.id, b.id);
								next.document.activities = next.document.activities.filter(
									(a) => a.id !== activity.id,
								);
							})) return;
							setActive(
								d.activities.find((a) => a.id !== activity.id)?.id || '',
							);
							setSelected('');
							setInsertion(null);
							setAnnouncement(
								'Kegiatan dihapus. Gunakan Urungkan untuk mengembalikannya.',
							);
						}}
					>
						Hapus kegiatan
					</button>
				</div>
			) : (
				<p>Tambahkan kegiatan untuk mulai menyusun.</p>
			)}
		</>
	);
	return (
		<BuilderAnchorScope><div ref={workspaceRoot} className="bd-workspace" data-history-version={historyVersion}
			onPointerMove={movePointerDrag}
			onPointerUp={finishPointerDrag}
			onPointerCancel={cancelPointerDrag}
			onLostPointerCapture={cancelPointerDrag}
			onKeyDown={event => { if (event.key === 'Escape') cancelPointerDrag(); }}>
			<header className="bd-topbar">
				<div className="bd-title-group">
					<Link
						aria-label="Kembali ke daftar"
						className="bd-icon"
						to={d.kind === 'kelas' ? '/app/kelas-terjadwal' : '/app/tugas'}
					>
						<ArrowLeft size={18} />
					</Link>
					<div className="bd-title-stack">
						<span className="bd-kicker">
							BUILDER · {d.kind === 'kelas' ? 'KELAS' : 'TUGAS'}
						</span>
						<input
							aria-label="Judul dokumen"
							className="bd-title-input"
							maxLength={200}
							value={d.title}
							onChange={(e) =>
								change((v) => {
									v.document.title = e.target.value;
								})
							}
						/>
						{contextLabel && (
							<p className="bd-context-line">{contextLabel}</p>
						)}
					</div>
				</div>
				<div className="bd-toolbar-actions">
					{saveLabel && (
						<span className="bd-save-status" role="status">
							{saveLabel}
						</span>
					)}
					<button type="button" className="bd-secondary" disabled={!canResetDocumentAppearance} title={appearanceResetUnsupported ? 'Server belum mendukung semua gaya tersimpan; reset dinonaktifkan agar data tetap aman.' : undefined} onClick={() => setResetAppearanceOpen(true)}>
						Reset tampilan dokumen
					</button>
					<div className="bd-history-actions">
						<button
							type="button"
							className="bd-icon"
							disabled={!past.current.length || conflict || Boolean(recovery) || readOnly}
							aria-label="Urungkan"
							onClick={() => undo()}
						>
							<Undo2 size={17} />
						</button>
						<button
							type="button"
							className="bd-icon"
							disabled={!future.current.length || conflict || Boolean(recovery) || readOnly}
							aria-label="Ulangi"
							onClick={() => undo(true)}
						>
							<Redo2 size={17} />
						</button>
					</div>
					{(dirty || error) && !conflict && !recovery && (
						<button
							className="bd-secondary"
							disabled={saving}
							onClick={() => void save()}
						>
							<Save size={15} />
							Simpan
						</button>
					)}
					<button
						className="bd-secondary bd-inspector-toggle"
						onClick={() => setInspectorOpen(true)}
					>
						<Settings2 size={15} />
						Pengaturan
					</button>
					<button
						type="button"
						className="bd-icon"
						aria-label="Pratinjau"
						title={
							dirty || saving
								? 'Menunggu perubahan tersimpan…'
								: 'Buka halaman pratinjau'
						}
						disabled={dirty || saving || conflict || Boolean(recovery)}
						onClick={() => navigate(`/app/builder/${id}/pratinjau`)}
					>
						<Eye size={17} />
					</button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="bd-icon"
								aria-label="Menu lainnya"
							>
								<MoreHorizontal size={17} />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onSelect={() => setSavedItems({})}>
								<History size={15} /> Riwayat & template
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<button className="bd-primary" onClick={() => setPanel('review')}>
						<FileCheck2 size={16} />
						Tinjau draf
					</button>
				</div>
			</header>
			<div className="bd-subbar">
				<span>
					{d.activities.length} kegiatan · {questionCount} pertanyaan · {points}{' '}
					poin · {d.activities.reduce((sum, a) => sum + a.plannedMinutes, 0)}{' '}
					menit
					{d.kind === 'kelas' && d.delivery.startsAt && d.delivery.endsAt && (
						<>
							{' '}
							/{' '}
							{Math.round(
								(Date.parse(d.delivery.endsAt) -
									Date.parse(d.delivery.startsAt)) /
									60000,
							)}{' '}
							menit kelas
						</>
					)}{' '}
					· Revisi {revision}
				</span>
				<nav aria-label="Bagian builder">
					{(
						[
							{ id: 'content', label: 'Isi kegiatan' },
							{
								id: 'delivery',
								label: d.kind === 'kelas' ? 'Jadwal kelas' : 'Pengumpulan',
							},
						] as const
					).map((t) => (
						<button
							key={t.id}
							type="button"
							aria-current={panel === t.id ? 'page' : undefined}
							onClick={() => setPanel(t.id)}
						>
							{t.label}
						</button>
					))}
				</nav>
			</div>
			{capabilityNotice && (
				<section className="bd-capability-banner" role="status" aria-live="polite" data-read-only={readOnly ? 'true' : 'false'}>
					<strong>{readOnly ? 'Mode hanya-baca · penyunting lanjutan dinonaktifkan' : 'Penyunting lanjutan dinonaktifkan'}</strong>
					<p>{capabilityNotice}</p>
					{readOnly ? <p>Tampilan ini memakai penyaji bersama yang sama dengan mahasiswa, sehingga seluruh kegiatan, tata letak, dan tampilan tetap terlihat utuh. Penyimpanan, pemulihan, dan penerbitan dinonaktifkan agar tidak ada data yang hilang.</p> : <p>Tata letak bagian, tampilan, dan kontrol responsif tidak tersedia. Elemen, isi, penilaian, pemulihan, dan penerbitan tetap berfungsi.</p>}
					<div className="bd-inline-actions">
						<button type="button" className="bd-secondary" onClick={download}>
							<Download size={14} />
							Unduh salinan pribadi
						</button>
						<button type="button" className="bd-secondary" disabled={readOnly} title={readOnly ? 'Buka pratinjau mahasiswa dari panel Tinjau setelah simpan dinonaktifkan' : undefined} onClick={() => navigate(`/app/builder/${id}/pratinjau`)}>
							<Eye size={14} />
							Pratinjau mahasiswa
						</button>
						<Link className="bd-secondary" to={d.kind === 'kelas' ? '/app/kelas-terjadwal' : '/app/tugas'}>Kembali ke daftar</Link>
					</div>
				</section>
			)}
			{storageWarning && <p role="status">{storageWarning}</p>}
			{error && (
				<div className="bd-error" role="alert">
					<p>{error}</p>
					{conflict ? (
						<div className="bd-inline-actions">
							<button onClick={download}>
								<Download size={14} />
								Unduh salinan draf
							</button>
							<button onClick={() => void reload()}>Muat versi server</button>
						</div>
					) : (
						<button disabled={saving} onClick={() => void save()}>
							Coba simpan lagi
						</button>
					)}
				</div>
			)}
			{layoutLockFallback && <p role="alert">{LAYOUT_LOCK_CAPABILITY_REASON}</p>}
			{recovery && (
				<div className="bd-recovery" role="alert">
					<strong>Ada perubahan yang tersimpan di perangkat.</strong>
					<p>
						Versi ini berbeda dari server. Pilih versi yang ingin dilanjutkan.
					</p>
					{recoveryInfo && <p>Perangkat: revisi {recoveryInfo.baseRevision ?? 'tidak diketahui'} · {new Date(recoveryInfo.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB. Server: revisi {revision}. Pemulihan hanya memuat editor; penyimpanan membuat revisi baru.</p>}
					<div className="bd-inline-actions">
						<button className="bd-secondary" onClick={() => downloadEnvelope(recovery)}>Unduh salinan perangkat</button>
						<button
							className="bd-primary"
								disabled={readOnly || (!presentationVisibilitySupported && hasBuilderVisibility(recovery)) || (!documentAnchorsSupported && hasBuilderAnchors(recovery)) || (!layoutLocksSupported && hasLayoutLockFields(recovery)) || (!customColorsSupported && hasCustomThemeColors(recovery)) || (!detailedBorderRadiusSupported && hasDetailedBorderRadius(recovery)) || (!responsiveBorderRadiusSupported && hasResponsiveBorderRadius(recovery)) || (!mediaCaptionsSupported && hasBuilderCaptions(recovery)) || (!mediaPlaybackSupported && hasBuilderPlaybackDetails(recovery)) || (!nestedRichTextSupported && hasNestedBuilderLists(recovery))}
							title={!layoutLocksSupported && hasLayoutLockFields(recovery) ? LAYOUT_LOCK_CAPABILITY_REASON : (!customColorsSupported && hasCustomThemeColors(recovery) ? 'Backend belum mendukung pasangan warna tema.' : (!detailedBorderRadiusSupported && hasDetailedBorderRadius(recovery) ? 'Backend belum mendukung garis tepi dan sudut terperinci.' : (!responsiveBorderRadiusSupported && hasResponsiveBorderRadius(recovery) ? 'Backend belum mendukung garis dan sudut responsif.' : undefined)))}
							onClick={() => {
								if (readOnlyRef.current || (!presentationVisibilitySupportedRef.current && hasBuilderVisibility(recovery)) || (!documentAnchorsSupportedRef.current && hasBuilderAnchors(recovery)) || (!layoutLocksSupportedRef.current && hasLayoutLockFields(recovery)) || (!customColorsSupportedRef.current && hasCustomThemeColors(recovery)) || (!detailedBorderRadiusSupportedRef.current && hasDetailedBorderRadius(recovery)) || (!responsiveBorderRadiusSupportedRef.current && hasResponsiveBorderRadius(recovery)) || (!mediaCaptionsSupportedRef.current && hasBuilderCaptions(recovery)) || (!mediaPlaybackSupportedRef.current && hasBuilderPlaybackDetails(recovery)) || (!nestedRichTextSupportedRef.current && hasNestedBuilderLists(recovery))) return;
								if (!builderNodeVisibilitySafe(recovery)) { const reason = 'Pemulihan ditolak karena menyembunyikan asesmen atau elemen yang tidak didukung.'; setError(reason); setAnnouncement(reason); return; }
								const reason = current.current && layoutLockTransitionReason(current.current, recovery, layoutLocksSupportedRef.current);
								if (reason) { setError(reason); setAnnouncement(reason); return; }
								if (recoveryInfo?.baseRevision !== revision && !window.confirm('Revisi perangkat dan server berbeda. Muat salinan perangkat ke editor untuk ditinjau sebelum menyimpan?')) return;
								install(recovery);
								setRecovery(null);
							}}
						>
							Pulihkan perubahan perangkat
						</button>
						<button
							className="bd-secondary"
							onClick={() => {
								setRecovery(null);
								try {
									localStorage.removeItem(storageKey);
								} catch {
									/* Optional storage. */
								}
							}}
						>
							Gunakan versi server
						</button>
					</div>
				</div>
			)}
			<p className="bd-sr-only" role="status" aria-live="polite">
				{announcement}
			</p>
			{panel === 'content' ? (
				<div className="bd-layout">
					<div className="bd-mobile-library-actions">
						<button className="bd-secondary" disabled={locked || readOnly || !activity} onClick={() => activity && openElements(activity.id, undefined, selectedGroup?.id)}><Plus size={16} /> Elemen</button>
						<button
							className="bd-secondary"
							onClick={() => setActivityDrawer(true)}
						>
							<ListTree size={16} /> Kegiatan
						</button>
						<button
							className="bd-secondary"
							onClick={() => setAssistance(true)}
						>
							<Sparkles size={16} /> Bantuan
						</button>
					</div>
					<aside className="bd-builder-sidebar" aria-label="Elemen dan struktur">
						<div className="bd-sidebar-tabs" role="group" aria-label="Panel builder">
							<button type="button" aria-pressed={sidebar === 'elements'} onClick={() => setSidebar('elements')}>Elemen</button>
							<button type="button" aria-pressed={sidebar === 'structure'} onClick={() => setSidebar('structure')}>Struktur</button>
						</div>
						{sidebar === 'elements' ? <>
							<label className="bd-library-activity">Kegiatan tujuan
								<select value={activity?.id || ''} onChange={event => selectActivity(event.target.value)}>
									{!d.activities.length && <option value="">Tambahkan kegiatan dahulu</option>}
									{d.activities.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.title || 'Kegiatan'}</option>)}
								</select>
							</label>
							<BuilderElementLibrary compact disabled={locked || readOnly || !activity}
								target={libraryGroup ? `Tujuan: ${libraryGroup.title || 'Bagian'}` : `Tujuan: akhir ${activity?.title || 'kegiatan'}`}
								onAdd={elementId => addElement(elementId, { activityId: activity?.id, beforeId: undefined, parentId: libraryGroup?.id })}
								onDragStart={(elementId, event) => {
									dragItem.current = { elementId, revision: revisionRef.current, snapshot: current.current };
									event.dataTransfer.setData(BUILDER_DRAG_TYPE, elementId);
									event.dataTransfer.effectAllowed = 'copy';
									setDragging(true);
								}}
								onDragEnd={finishDrag}
								onPointerStart={(elementId, event) => beginPointerDrag(event, { elementId })}
							/>
							<div className="bd-library-layout">
								<strong>Tata letak</strong>
								<button type="button" className="bd-secondary" disabled={locked || readOnly || !activity} onClick={() => addGroup('section', libraryGroup?.id || null)}><Plus size={14} /> Bagian</button>
								<button type="button" className="bd-secondary" disabled={locked || readOnly || !activity} onClick={() => addGroup('container', libraryGroup?.id || null)}><Plus size={14} /> Kontainer</button>
							</div>
						</> : outlineContents}
						{authoringTools}
					</aside>
					<section ref={canvasRoot} className={'bd-canvas' + (hasBuilderThemePalette(d) ? ' bd-lesson-theme' : '')} style={builderThemePaletteStyle(d.theme) as CSSProperties} aria-label="Isi kegiatan">
						<BuilderThemePaletteControl value={d.theme} supported={themePaletteSupported} disabled={locked || readOnly || saving || conflict || Boolean(recovery) || !online} onChange={theme => { if (change(next => { if (theme) next.document.theme = theme; else delete next.document.theme; })) setAnnouncement(theme ? 'Palet tema dokumen diterapkan.' : 'Palet tema standar dipulihkan.'); }} />
						<BuilderLayoutBreadcrumbs
							activity={activity}
							selectedNodeId={selectedNode}
							selectedBlockId={selected}
							onSelectActivity={() => {
								setSelected('');
								setSelectedNode('');
							}}
							onSelectGroup={(nodeId) =>
								activity && selectGroup(activity.id, nodeId)
							}
							onSelectBlock={(blockId) =>
								activity && revealBlock(activity.id, blockId)
							}
						/>
						<section className="bd-document-intro">
							<label>
								Instruksi umum
							<BuilderCanvasText block={{id:'general-instructions',type:'instructions',body:d.instructions}} selected nestedListsSupported={nestedRichTextSupported} onChange={value=>change(next=>{next.document.instructions=value})} />
							</label>
						</section>
						{d.activities.map((a, i) => (
							<section
								id={'builder-activity-' + a.id}
								className={
									'bd-activity' + (activity?.id === a.id ? ' is-active' : '')
								}
								key={a.id}
								onFocus={() => {
									setActive(a.id);
									setInsertion(null);
								}}
							>
								<header>
									<div>
										<span className="bd-kicker">KEGIATAN {i + 1}</span>
										<input
											aria-label={`Judul kegiatan ${i + 1}`}
											maxLength={200}
											value={a.title}
											onChange={(e) =>
												change((next) => {
													next.document.activities.find(
														(v) => v.id === a.id,
													)!.title = e.target.value;
												})
											}
										/>
									</div>
									<button
										className="bd-icon"
										aria-label={`Pengaturan kegiatan ${i + 1}`}
										onClick={() => {
											setActive(a.id);
											setSelected('');
											setSelectedNode('');
										}}
									>
										<Settings2 size={17} />
									</button>
								</header>
								<div className="bd-activity-summary">
									<button
										className="bd-text-button"
										aria-expanded={!collapsed.includes(a.id)}
										onClick={() =>
											setCollapsed((items) =>
												items.includes(a.id)
													? items.filter((id) => id !== a.id)
													: [...items, a.id],
											)
										}
									>
										{collapsed.includes(a.id) ? (
											<ChevronRight size={15} />
										) : (
											<ChevronDown size={15} />
										)}
										{collapsed.includes(a.id) ? 'Buka' : 'Ringkas'}
									</button>
									<span>
										{a.blocks.length} elemen ·{' '}
										{activitySummary(draft, a).questions} pertanyaan ·{' '}
										{activitySummary(draft, a).points} poin · {a.plannedMinutes}{' '}
										menit · {a.required ? 'Wajib' : 'Opsional'}
									</span>
									<button
										className="bd-text-button"
										disabled={locked || readOnly || dirty || saving}
										onClick={() => setSavedItems({ activityId: a.id })}
									>
										Simpan template
									</button>
								</div>
								{!collapsed.includes(a.id) && (
									<>
						<BuilderLayoutView
							activity={a}
							editorMode
											renderBeforeBlock={(b) =>
												insertionSlot(a.id, b.id)
											}
								renderGroup={(group, children) => (
												<>
													{(() => { const location = layoutItemLocation(a, group.id); return insertionSlot(a.id, group.id, location?.parent?.id); })()}
													<div className="bd-layout-group-head">
														<button
															type="button"
														className="bd-layout-group-select"
														id={'builder-group-' + group.id}
															aria-current={
																selectedNode === group.id ? 'true' : undefined
															}
															onClick={() => selectGroup(a.id, group.id)}
														>
															<strong>
																{group.title ||
																	(group.kind === 'section'
																		? 'Bagian'
																		: 'Kontainer')}
															</strong>
															<small>
																{group.kind === 'section' ? 'Bagian' : 'Kontainer'} ·{' '}
																{group.columns} kolom
															</small>
														</button>
														<span className="bd-layout-group-actions">
														<button type="button" className="bd-icon bd-group-grip" draggable={!locked && !readOnly && !layoutLockState(a, group.id).protectedStructure} disabled={locked || readOnly || layoutLockState(a, group.id).protectedStructure} aria-label={`Seret ${group.kind === 'section' ? 'bagian' : 'kontainer'} ${group.title || ''}`} title={layoutLockState(a, group.id).protectedStructure ? LAYOUT_LOCK_REASON : 'Seret untuk memindahkan seluruh bagian'} onDragStart={event => { event.stopPropagation(); dragItem.current = { activityId: a.id, groupId: group.id, revision: revisionRef.current, snapshot: current.current }; event.dataTransfer.setData(BUILDER_DRAG_TYPE, group.id); event.dataTransfer.effectAllowed = 'move'; setDragging(true); }} onDragEnd={finishDrag} onPointerDown={event => beginPointerDrag(event, { activityId: a.id, groupId: group.id })}><GripVertical size={14} /></button>
															<button
																type="button"
																className="bd-icon"
																disabled={locked || readOnly || layoutLockState(a, group.id).own || Boolean(layoutLockState(a, group.id).inheritedFrom)}
																aria-label="Tambah elemen ke bagian ini"
																title={layoutLockState(a, group.id).own || layoutLockState(a, group.id).inheritedFrom ? LAYOUT_LOCK_REASON : 'Tambah elemen ke bagian ini'}
																onClick={() =>
																	openElements(a.id, undefined, group.id)
																}
															>
																<Plus size={13} />
															</button>
															<button
																type="button"
																className="bd-icon"
																disabled={locked || readOnly || layoutLockState(a, group.id).protectedStructure}
																aria-label="Hapus bagian, simpan isinya"
																title={layoutLockState(a, group.id).protectedStructure ? LAYOUT_LOCK_REASON : 'Hapus bagian, simpan isinya'}
															onClick={() => removeGroup(group.id, a.id)}
															>
																<Trash2 size={13} />
															</button>
														</span>
													</div>
													{children}
													<div className="bd-layout-group-tail">
														{insertionSlot(a.id, undefined, group.id)}
													</div>
												</>
											)}
											renderBlock={(b) => {
											const knownInspectorKind = isBuilderRegistryKind((b as { type: string }).type);
											return (
												<article
													className={
														'bd-block' +
														(selected === b.id ? ' is-selected' : '')
													}
													id={'builder-block-' + b.id}
													tabIndex={-1}
													onFocus={() => {
														setActive(a.id);
														setSelected(b.id);
													}}
													onClick={() => {
														setActive(a.id);
														setSelected(b.id);
													}}
												>
													<div className="bd-block-heading">
														<span className="bd-block-title">
															<button
																type="button"
																className="bd-block-grip"
											draggable={knownInspectorKind && !locked && !readOnly && !layoutLockState(a, b.id).protectedStructure}
											disabled={!knownInspectorKind || locked || readOnly || layoutLockState(a, b.id).protectedStructure}
											aria-label={`Seret ${BLOCK_LABELS[b.type] || 'elemen tidak didukung'}`}
																title={layoutLockState(a, b.id).protectedStructure ? LAYOUT_LOCK_REASON : 'Seret untuk memindahkan elemen'}
																onDragStart={(event) => {
																	event.stopPropagation();
																	dragItem.current = {
								activityId: a.id,
								blockId: b.id,
								revision: revisionRef.current,
								snapshot: current.current,
																	};
																	event.dataTransfer.setData(
																		BUILDER_DRAG_TYPE,
																		b.id,
																	);
																	event.dataTransfer.effectAllowed = 'move';
																	setDragging(true);
																}}
											onDragEnd={finishDrag}
											onPointerDown={(event) => beginPointerDrag(event, { activityId: a.id, blockId: b.id })}
										>
																<GripVertical size={15} />
															</button>
											{BLOCK_LABELS[b.type] || 'Elemen tidak didukung'}
														</span>
														<div>
															{!readOnly && (<>
															<button
																className="bd-icon"
																disabled={
												!knownInspectorKind || locked || readOnly ||
																	questionCount + questionIds(b).length > 500 ||
																	d.activities.reduce(
																		(sum, a) => sum + a.blocks.length,
																		0,
																	) >= 500
																}
																aria-label="Duplikat elemen"
																onClick={(e) => {
																	e.stopPropagation();
																	let copy = '';
																	if (!change((next) => {
																		copy = duplicateBlock(next, a.id, b.id);
																	})) return;
																	revealBlock(a.id, copy);
																	setAnnouncement('Elemen diduplikat.');
																}}
															>
																<Copy size={14} />
															</button>
															<select
																className="bd-move-select"
																aria-label="Pindahkan elemen ke kegiatan"
																value=""
											disabled={!knownInspectorKind || locked || readOnly || layoutLockState(a, b.id).protectedStructure}
																title={layoutLockState(a, b.id).protectedStructure ? LAYOUT_LOCK_REASON : undefined}
																onClick={(e) => e.stopPropagation()}
																onChange={(e) => {
																	const targetId = e.target.value;
																	if (!change((next) => {
																		const source =
																				next.document.activities.find(
																					(v) => v.id === a.id,
																				)!,
																			target = next.document.activities.find(
																				(v) => v.id === targetId,
																			);
																		if (target)
																			moveBlockBetweenActivities(
																				source,
																				target,
																				b.id,
																			);
																	})) return;
																	revealBlock(targetId, b.id);
																	setAnnouncement('Elemen dipindahkan.');
																}}
															>
																<option value="" disabled>
																	Pindahkan ke…
																</option>
																{d.activities
																	.filter((v) => v.id !== a.id)
																	.map((v) => (
																		<option key={v.id} value={v.id}>
																			{v.title || 'Kegiatan tanpa judul'}
																		</option>
																	))}
															</select>
															<button
																className="bd-icon"
																aria-label="Pengaturan elemen"
																onClick={(e) => {
																	e.stopPropagation();
																	setActive(a.id);
																	setSelected(b.id);
																	if (
																		window.matchMedia('(max-width: 650px)')
																			.matches
																	)
																		setInspectorOpen(true);
																}}
															>
																<Settings2 size={14} />
															</button>
															<button
																type="button"
																className="bd-icon"
																aria-label="Naikkan elemen"
											disabled={!knownInspectorKind || locked || readOnly || layoutLockState(a, b.id).protectedStructure || !canMoveLayoutItem(a, b.id, -1)}
															title={layoutLockState(a, b.id).protectedStructure ? LAYOUT_LOCK_REASON : undefined}
															onClick={() => moveBlockBy(a.id, b.id, -1)}
															>
																<ArrowUp size={14} />
															</button>
															<button
																type="button"
																className="bd-icon"
																aria-label="Turunkan elemen"
											disabled={!knownInspectorKind || locked || readOnly || layoutLockState(a, b.id).protectedStructure || !canMoveLayoutItem(a, b.id, 1)}
															title={layoutLockState(a, b.id).protectedStructure ? LAYOUT_LOCK_REASON : undefined}
															onClick={() => moveBlockBy(a.id, b.id, 1)}
															>
																<ArrowDown size={14} />
															</button>
															<button
																type="button"
																className="bd-icon"
																aria-label="Hapus elemen"
											disabled={!knownInspectorKind || locked || readOnly || layoutLockState(a, b.id).protectedStructure}
																title={layoutLockState(a, b.id).protectedStructure ? LAYOUT_LOCK_REASON : undefined}
																onClick={(e) => {
																	e.stopPropagation();
																	if (!change((next) =>
																		removeBlock(next, a.id, b.id),
																	)) return;
																	setAnnouncement(
																		'Elemen dihapus. Gunakan Urungkan untuk mengembalikannya.',
																	);
																	setSelected('');
																}}
															>
																<Trash2 size={14} />
															</button>
																</>)}
														</div>
													</div>
															{b.type === 'instructions' || b.type === 'acknowledgement' ? (
																<BuilderCanvasText
												block={b}
												selected={selected === b.id}
												nestedListsSupported={nestedRichTextSupported}
											disabled={locked || readOnly}
																	onChange={value => change(next => {
																		const target = next.document.activities.flatMap(activity => activity.blocks).find(item => item.id === b.id);
											if (target) target.body = value;
																	})}
																/>
										) : <BuilderInspectorDispatch block={b} envelope={draft} onChange={change} />}
												</article>
												);
											}}
										/>
										{!a.blocks.length && (
											<div className="bd-empty-activity">
												<textarea
													rows={3}
													maxLength={20000}
													aria-label={`Tulis pengantar ${a.title || `kegiatan ${i + 1}`}`}
													placeholder="Tulis pengantar kegiatan di sini…"
													disabled={locked || readOnly || d.activities.reduce((sum, item) => sum + item.blocks.length, 0) >= 500}
													onFocus={() => {
														setActive(a.id);
														setSelected('');
													}}
													onCompositionEnd={(event) => addInlineText(a.id, event.currentTarget.value)}
													onChange={(event) => {
														if (!(event.nativeEvent as InputEvent).isComposing) addInlineText(a.id, event.target.value);
													}}
												/>
												<p className="bd-help">
													Mulai mengetik untuk menambah teks, atau pilih
													elemen di bawah.
												</p>
											</div>
										)}
										{insertionSlot(a.id)}
										<button
											className="bd-add-block"
											disabled={conflict || Boolean(recovery)}
											onClick={() => {
												openElements(a.id);
											}}
										>
											<Plus size={18} />
											{a.blocks.length
												? 'Tambah elemen'
												: 'Tambahkan elemen pertama'}
										</button>
									</>
								)}
							</section>
						))}
					</section>
					<aside className="bd-inspector">{inspectorContents}</aside>
				</div>
			) : panel === 'delivery' ? (
				<DeliverySettings envelope={draft} onChange={change} />
			) : (
				<section className="bd-review">
					<span className="bd-kicker">TINJAU DRAF</span>
					<h1>{d.title || 'Dokumen tanpa judul'}</h1>
					<p>
						{d.activities.length} kegiatan · {questionCount} pertanyaan ·{' '}
						{points} poin
					</p>
					<div className="bd-review-notice">
						<strong>Draf pribadi</strong>
						<p>
							Draf ini tersimpan privat. Terbitkan salinan versi untuk
							mahasiswa. Perubahan draf setelah penerbitan tidak mengubah versi
							yang sudah diterbitkan.
						</p>
					</div>
					<div className="bd-publish-checklist">
						<h2>Siap diterbitkan?</h2>
						<ul>
							<li>
								{issues.length
									? `${issues.length} bagian belum lengkap`
									: 'Konten, kunci, dan jadwal lengkap'}
							</li>
							<li>
								Audiens:{' '}
								{d.context.sectionIds.length
									? `${d.context.sectionIds.length} rombel terpilih`
									: 'Semua mahasiswa terdaftar di mata kuliah'}
							</li>
							<li>
								{d.kind === 'kelas'
									? 'Check-in dan waktu kegiatan mengikuti jadwal kelas.'
									: 'Seluruh tugas dikumpulkan dalam satu pengiriman.'}
							</li>
							<li>
								Setiap penerbitan membuat kegiatan baru dengan versi tetap.
								Gunakan tautan kegiatan yang sesuai untuk mahasiswa.
							</li>
						</ul>
						<button
							className="bd-primary"
							disabled={
								issues.length > 0 || dirty || saving || locked || readOnly || publishing
							}
								onClick={() => setPublishReview(true)}
						>
							{publishing
								? 'Menerbitkan…'
								: d.kind === 'kelas'
									? 'Terbitkan / jadwalkan kelas'
									: 'Terbitkan tugas'}
						</button>
						{(dirty || saving) && (
							<p>Tunggu draf tersimpan sebelum menerbitkan.</p>
						)}
					</div>
					<BuilderRunList documentId={id} />
					{builderPublishWarnings(draft).length > 0 && <ul aria-label="Peringatan jadwal">{builderPublishWarnings(draft).map((warning) => <li key={warning}>{warning}</li>)}</ul>}
					<h2>
						{issues.length
							? `${issues.length} bagian perlu dilengkapi`
							: 'Konten draf sudah lengkap'}
					</h2>
					{issues.length ? (
						<ul className="bd-issue-list">
							{issues.map((issue, i) => (
								<li key={i}>
									<button
										onClick={() => {
											if (issue.activityId) {
												setCollapsed((items) =>
													items.filter((id) => id !== issue.activityId),
												);
												setActive(issue.activityId);
												setSelected(issue.blockId || '');
												setPanel('content');
												requestAnimationFrame(() => {
													const keyIssue = /kunci|pasangan|diterima/.test(
														issue.message,
													);
													const node = document.getElementById(
														issue.questionId
															? (keyIssue
																	? 'builder-key-'
																	: 'builder-question-') + issue.questionId
															: issue.blockId
																? 'builder-block-' + issue.blockId
																: 'builder-activity-' + issue.activityId,
													);
													node?.scrollIntoView({
														block: 'center',
														behavior: 'smooth',
													});
													node
														?.querySelector<HTMLElement>(
															issue.message.includes('alternatif') ? 'input[maxlength="1000"]' : issue.message.includes('pilihan') ? 'input' : keyIssue ? 'select,textarea' : 'textarea,input,select',
														)
														?.focus({ preventScroll: true });
													if (
														keyIssue &&
														window.matchMedia('(max-width: 650px)').matches
													)
														setInspectorOpen(true);
												});
											} else if (issue.message.includes('judul dokumen')) {
												setPanel('content');
												requestAnimationFrame(() =>
													document
														.querySelector<HTMLInputElement>(
															'[aria-label="Judul dokumen"]',
														)
														?.focus(),
												);
											} else if (issue.message === 'Tambahkan kegiatan.') {
												setPanel('content');
												requestAnimationFrame(() =>
													document
														.querySelector<HTMLButtonElement>('.bd-outline-add')
														?.focus(),
												);
											} else {
												setPanel('delivery');
												requestAnimationFrame(() => {
													const field = issue.field || (issue.message.includes('check-in')
														? 'checkInClosesAt'
														: issue.message.includes('Tutup pengumpulan')
															? 'hardCloseAt'
															: issue.message.includes('tersedia')
																? 'availableAt'
																: d.kind === 'tugas'
																	? 'dueAt'
																	: issue.message.includes('selesai')
																		? 'endsAt'
																		: 'startsAt');
													document
														.getElementById('builder-delivery-' + field)
														?.focus();
												});
											}
										}}
									>
										{issue.message}
										<ArrowRightIcon />
									</button>
								</li>
							))}
						</ul>
					) : (
						<p>Gunakan pratinjau untuk mencoba kegiatan sebagai mahasiswa.</p>
					)}
					<div className="bd-inline-actions">
						<button className="bd-primary" disabled={dirty || saving || conflict || Boolean(recovery)} title={dirty || saving ? 'Menunggu perubahan tersimpan…' : 'Buka halaman pratinjau'} onClick={() => navigate(`/app/builder/${id}/pratinjau`)}>
							<Eye size={15} />
							Pratinjau mahasiswa
						</button>
						<button
							className="bd-secondary"
							disabled={dirty || saving}
							onClick={() =>
								navigate(
									`/app/builder/new?kind=${d.kind}&course=${d.context.courseId}&source=${id}`,
								)
							}
						>
							<Copy size={15} />
							Duplikat sebagai draf baru
						</button>
						<button className="bd-secondary" onClick={download}>
							<Download size={15} />
							Unduh salinan pribadi
						</button>
					</div>
				</section>
			)}
			{announcement && (
				<div className="bd-change-notice" role="status">
					<span>{announcement}</span>
					{past.current.length > 0 && (
						<button
							className="bd-text-button"
							disabled={locked || readOnly}
							onClick={() => {
								undo();
								setAnnouncement('Perubahan diurungkan.');
							}}
						>
							Urungkan
						</button>
					)}
					<button
						className="bd-icon"
						aria-label="Tutup pemberitahuan"
						onClick={() => setAnnouncement('')}
					>
						×
					</button>
				</div>
			)}
			{publishReview && <BuilderPublishDialog id={id} revision={revision} envelope={draft} busy={publishing} blocked={dirty || saving || locked || readOnly || !online || (!presentationVisibilitySupported && hasBuilderVisibility(draft)) || (!themePaletteSupported && hasBuilderThemePalette(draft)) || (!responsiveBorderRadiusSupported && hasResponsiveBorderRadius(draft)) || (!mediaCaptionsSupported && hasBuilderCaptions(draft)) || (!mediaPlaybackSupported && hasBuilderPlaybackDetails(draft)) || (!nestedRichTextSupported && hasNestedBuilderLists(draft))} onClose={() => setPublishReview(false)} onPublish={publish} />}
			<AlertDialog open={resetAppearanceOpen} onOpenChange={setResetAppearanceOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Reset tampilan seluruh dokumen?</AlertDialogTitle>
						<AlertDialogDescription>
							Semua gaya tampilan elemen, bagian, dan kontainer di seluruh kegiatan akan kembali ke tema netral, termasuk warna kustom, garis, sudut, bayangan, dan efek hover. Latar khusus bagian dan latar tablet/ponsel, ruang dalam bagian/kontainer, tata letak responsif, palet warna dokumen, isi teks/media, aset, ID, urutan, penilaian, kunci jawaban, dan penguncian tata letak tetap dipertahankan. Reset palet dokumen tersedia terpisah. Tindakan ini dapat diurungkan sekali.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Batal</AlertDialogCancel>
						<AlertDialogAction disabled={!canResetDocumentAppearance} onClick={(event) => { event.preventDefault(); resetDocumentAppearanceNow(); }}>Reset tampilan</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			{savedItems && (
				<BuilderSavedItems
					id={id}
					revision={revision}
					detailedBorderRadiusSupported={detailedBorderRadiusSupported}
					detailedStylesInDocument={hasDetailedBorderRadius(draft)}
					responsiveBorderRadiusSupported={responsiveBorderRadiusSupported}
					responsiveStylesInDocument={hasResponsiveBorderRadius(draft)}
					mediaCaptionsInDocument={hasBuilderCaptions(draft)}
					mediaCaptionsSupported={mediaCaptionsSupported}
					mediaPlaybackInDocument={hasBuilderPlaybackDetails(draft)}
					mediaPlaybackSupported={mediaPlaybackSupported}
					nestedRichTextInDocument={hasNestedBuilderLists(draft)}
					nestedRichTextSupported={nestedRichTextSupported}
					documentAnchorsInDocument={hasBuilderAnchors(draft)}
					documentAnchorsSupported={documentAnchorsSupported}
					presentationVisibilityInDocument={hasBuilderVisibility(draft)}
					presentationVisibilitySupported={presentationVisibilitySupported}
					themePaletteInDocument={hasBuilderThemePalette(draft)}
					activityId={savedItems.activityId}
					groupId={savedItems.groupId}
					dirty={dirty || saving || locked || readOnly}
					onClose={() => setSavedItems(null)}
					onRestore={(envelope) => {
						if (!change((next) => {
							next.document = envelope.document;
							next.privateKeys = envelope.privateKeys;
						})) return;
						setActive(envelope.document.activities[0]?.id || '');
						setSelected('');
						setAnnouncement('Snapshot dipulihkan ke draf.');
					}}
					onInsert={(envelope) => {
						if (envelope.scope === 'group') {
							const targetActivity = d.activities.find(item => item.id === active);
							const targetGroup = savedItems.groupId && targetActivity?.layout ? findLayoutGroup(targetActivity.layout, savedItems.groupId) : null;
							if (!targetActivity || !targetGroup) { setError('Pilih kegiatan dan bagian tujuan yang masih tersedia.'); return; }
						let inserted = '';
						try {
							if (!change(next => { inserted = insertGroupTemplate(next, targetActivity.id, targetGroup.id, envelope); })) return;
							setSelectedNode(inserted);
							setSelected('');
							setAnnouncement('Template bagian disisipkan sebagai salinan.');
						} catch (e) { setError((e as Error).message); }
						return;
						}
						if (
							d.activities.length >= 50 ||
							Object.keys(d.questionsById).length +
								Object.keys(envelope.document.questionsById).length >
								500 ||
							d.activities.reduce((s, a) => s + a.blocks.length, 0) +
								envelope.document.activities[0].blocks.length >
								500
						) {
							setError('Batas kegiatan, elemen, atau pertanyaan tercapai.');
							return;
						}
						let inserted = '';
						if (!change((next) => {
							inserted = insertActivityTemplate(next, envelope);
						})) return;
						selectActivity(inserted);
						setAnnouncement('Template kegiatan ditambahkan.');
					}}
				/>
			)}
			<Dialog open={inspectorOpen} onOpenChange={setInspectorOpen}>
				<DialogContent className="bd-inspector bd-mobile-inspector">
					<DialogHeader>
						<DialogTitle>Pengaturan</DialogTitle>
						<DialogDescription>
							Pilih kegiatan atau elemen untuk mengatur isinya.
						</DialogDescription>
					</DialogHeader>
					{inspectorContents}
				</DialogContent>
			</Dialog>
			<Dialog open={picker} onOpenChange={setPicker}>
				<DialogContent className="bd-picker-dialog bd-library-drawer">
					<DialogHeader>
						<DialogTitle>Tambah elemen</DialogTitle>
						<DialogDescription>
							{insertionActivity
								? `Sisipkan ke ${insertionActivity.title || 'kegiatan'}${beforeIndex >= 0 ? ` sebelum elemen ${beforeIndex + 1}` : ' di akhir kegiatan'}.`
								: 'Tambahkan kegiatan terlebih dahulu.'}
						</DialogDescription>
					</DialogHeader>
					<BuilderElementLibrary
						allowDrag={false}
						disabled={locked || readOnly || !activity}
						target={
							insertionActivity
								? `${insertionActivity.title || 'Kegiatan'} · ${beforeIndex >= 0 ? `sebelum elemen ${beforeIndex + 1}` : 'akhir kegiatan'}`
								: 'Tambahkan kegiatan terlebih dahulu.'
						}
						onAdd={(elementId) => addElement(elementId)}
						onDragStart={(elementId, event) => {
							dragItem.current = { elementId, revision: revisionRef.current, snapshot: current.current };
							event.dataTransfer.setData(BUILDER_DRAG_TYPE, elementId);
							event.dataTransfer.effectAllowed = 'copy';
							setDragging(true);
						}}
						onDragEnd={finishDrag}
						onPointerStart={(elementId, event) => beginPointerDrag(event, { elementId })}
					/>
				</DialogContent>
			</Dialog>
			<Dialog open={activityDrawer} onOpenChange={setActivityDrawer}>
				<DialogContent className="bd-picker-dialog bd-library-drawer" onCloseAutoFocus={event => {
					const request = drawerReveal.current;
					if (!request) return;
					event.preventDefault();
					drawerReveal.current = null;
					document.getElementById(`builder-${request.kind}-${request.id}`)?.focus({ preventScroll: true });
				}}>
					<DialogHeader>
						<DialogTitle>Kegiatan</DialogTitle>
						<DialogDescription>
							Pilih, tambahkan, atau atur urutan kegiatan.
						</DialogDescription>
					</DialogHeader>
					{outlineContents}
				</DialogContent>
			</Dialog>
			<Dialog open={assistance} onOpenChange={setAssistance}>
				<DialogContent className="bd-picker-dialog bd-library-drawer bd-assistance-drawer">
					<DialogHeader>
						<DialogTitle>Bantuan</DialogTitle>
						<DialogDescription>
							Buat dengan AI atau unggah bahan. Hasil ditambahkan ke draf
							tanpa mengganti isi yang sudah ada.
						</DialogDescription>
					</DialogHeader>
					{authoringTools}
				</DialogContent>
			</Dialog>
			<Dialog
				open={blocker.state === 'blocked'}
				onOpenChange={(open) => {
					if (!open && blocker.state === 'blocked') blocker.reset();
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Perubahan belum tersimpan</DialogTitle>
						<DialogDescription>
							Anda dapat menunggu penyimpanan, atau meninggalkan halaman dengan
							salinan pemulihan di perangkat jika penyimpanan perangkat
							tersedia.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<button
							className="bd-secondary"
							onClick={() => blocker.state === 'blocked' && blocker.reset()}
						>
							Tetap menyusun
						</button>
						<button
							className="bd-primary"
							onClick={() => blocker.state === 'blocked' && blocker.proceed()}
						>
							Tinggalkan halaman
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div></BuilderAnchorScope>
	);
}
function ArrowRightIcon() {
	return <span aria-hidden="true">→</span>;
}
function DeliverySettings({
	envelope,
	onChange,
}: {
	envelope: BuilderEnvelope;
	onChange: Change;
}) {
	const d = envelope.document,
		p = d.delivery,
		total = d.activities.reduce((s, a) => s + a.plannedMinutes, 0);
	const date = (
		label: string,
		field:
			| 'startsAt'
			| 'endsAt'
			| 'checkInClosesAt'
			| 'availableAt'
			| 'dueAt'
			| 'hardCloseAt',
	) => (
		<label>
			{label} (WIB)
			<input
				type="datetime-local"
				id={'builder-delivery-' + field}
				value={p[field] ? toWibInput(p[field]) : ''}
				onChange={(e) =>
					onChange((next) => {
						next.document.delivery[field] = fromWibInput(e.target.value);
					})
				}
			/>
		</label>
	);
	return (
		<section className="bd-settings-page">
			<span className="bd-kicker">
				{d.kind === 'kelas' ? 'JADWAL KELAS' : 'PENGUMPULAN TUGAS'}
			</span>
			<h1>
				{d.kind === 'kelas'
					? 'Atur waktu dan alur kelas'
					: 'Atur waktu pengumpulan'}
			</h1>
			<p>
				Semua waktu menggunakan WIB. Pengaturan dapat disimpan meski belum
				lengkap.
			</p>
			<div className="bd-form-grid">
				{d.kind === 'kelas' ? (
					<>
						{date('Mulai', 'startsAt')}
						{date('Selesai', 'endsAt')}
						{date('Batas check-in', 'checkInClosesAt')}
						<label>
							Terlambat setelah (menit)
							<input
								type="number"
								min={0}
								max={1440}
								value={p.lateAfterMinutes}
								onChange={(e) =>
									onChange((next) => {
										next.document.delivery.lateAfterMinutes = Number(
											e.target.value,
										);
									})
								}
							/>
						</label>
                        <p className="bd-muted">Navigasi bebas selama waktu kelas. Durasi tiap kegiatan adalah perkiraan; batas pengerjaan mengikuti waktu selesai kelas.</p>
					</>
				) : (
					<>
						{date('Tersedia mulai', 'availableAt')}
						{date('Batas pengumpulan', 'dueAt')}
						{date('Tutup pengumpulan', 'hardCloseAt')}
						<label className="bd-check">
							<input
								type="checkbox"
								checked={p.allowLate}
								onChange={(e) =>
									onChange((next) => {
										next.document.delivery.allowLate = e.target.checked;
									})
								}
							/>
							Terima kiriman terlambat
						</label>
						<label>
							Batas waktu pengerjaan (menit, 0 = tanpa batas)
							<input
								type="number"
								min={0}
								max={1440}
								value={p.timeLimitMinutes}
								onChange={(e) =>
									onChange((next) => {
										next.document.delivery.timeLimitMinutes = Number(
											e.target.value,
										);
									})
								}
							/>
						</label>
					</>
				)}
			</div>
			{d.kind === 'kelas' && (
				<div className="bd-timeline">
					<h2>Total {total} menit</h2>
					{d.activities.map((a, i) => {
						const offset = d.activities
							.slice(0, i)
							.reduce((s, x) => s + x.plannedMinutes, 0);
						return (
							<div key={a.id}>
								<span>{i + 1}</span>
								<strong>{a.title}</strong>
								<label>
									<input
										type="number"
										aria-label={`Durasi ${a.title}`}
										min={1}
										max={600}
										value={a.plannedMinutes}
										onChange={(e) =>
											onChange((next) => {
												next.document.activities.find(
													(x) => x.id === a.id,
												)!.plannedMinutes = Number(e.target.value);
											})
										}
									/>{' '}
									menit
								</label>
								<small>
									Menit {offset}–{offset + a.plannedMinutes}
								</small>
							</div>
						);
					})}
				</div>
			)}
			<div className="bd-review-notice">
				<strong>
					{d.kind === 'kelas'
						? 'Rencana kegiatan'
						: 'Satu pengumpulan untuk seluruh tugas'}
				</strong>
				<p>
					{d.kind === 'kelas'
						? 'Durasi tidak diubah otomatis. Cocokkan total kegiatan dengan waktu kelas.'
						: 'Mahasiswa menyelesaikan semua kegiatan dan mengumpulkan tugas sebagai satu kiriman.'}
				</p>
			</div>
		</section>
	);
}
