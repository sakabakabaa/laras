import {
	Fragment,
	useCallback,
	useEffect,
	useRef,
	useState,
	type DragEvent,
} from 'react';
import { Link, useBlocker, useNavigate } from 'react-router';
import {
	ArrowDown,
	ArrowLeft,
	ArrowUp,
	Check,
	Copy,
	Download,
	Eye,
	FileCheck2,
	GripVertical,
	LayoutGrid,
	ListTree,
	Plus,
	Redo2,
	Save,
	Settings2,
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
import pb from '@/lib/pocketbase-client';
import { toWibInput, fromWibInput } from '@/lib/scheduled-classes';
import {
	appendBlock,
	appendQuestion,
	BLOCK_LABELS,
	builderIssues,
	builderRequest,
	encodeBuilderDraft,
	duplicateActivity,
	newActivity,
	plain,
	questionIds,
	removeBlock,
	rich,
	uid,
	type BuilderEnvelope,
	type BuilderRecord,
} from '@/lib/builder-document';
import { BlockEditor, BuilderPreview, KeyInspector } from './builder-elements';
import {
	BuilderElementLibrary,
	BUILDER_ELEMENTS,
	BUILDER_DRAG_TYPE,
} from './builder-element-library';

type Change = (edit: (draft: BuilderEnvelope) => void) => void;
const encode = encodeBuilderDraft;
function readRecovery(key: string) {
	try {
		const saved = JSON.parse(localStorage.getItem(key) || 'null');
		if (
			saved &&
			Date.now() - saved.at < 7 * 86400000 &&
			saved.envelope?.document?.schemaVersion === 1 &&
			saved.envelope?.privateKeys?.schemaVersion === 1
		)
			return saved.envelope as BuilderEnvelope;
	} catch {
		/* Storage may be blocked. */
	}
	return null;
}
export function BuilderWorkspace({ id }: { id: string }) {
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
		[panel, setPanel] = useState<'content' | 'delivery' | 'review'>('content'),
		[picker, setPicker] = useState(false),
		[leftTab, setLeftTab] = useState<'elements' | 'outline'>('elements'),
		[insertion, setInsertion] = useState<{
			activityId: string;
			beforeId?: string;
		} | null>(null),
		[dragging, setDragging] = useState(false),
		[dropTarget, setDropTarget] = useState(''),
		[announcement, setAnnouncement] = useState(''),
		[preview, setPreview] = useState(false),
		[inspectorOpen, setInspectorOpen] = useState(false),
		[previewMobile, setPreviewMobile] = useState(false),
		[historyVersion, setHistoryVersion] = useState(0);
	const current = useRef<BuilderEnvelope | null>(null),
		revisionRef = useRef(0),
		savingRef = useRef(false),
		conflictRef = useRef(false),
		past = useRef<BuilderEnvelope[]>([]),
		future = useRef<BuilderEnvelope[]>([]),
		activeId = useRef(id),
		dragItem = useRef<{
			elementId?: string;
			activityId?: string;
			blockId?: string;
		} | null>(null);
	activeId.current = id;
	const storageKey = `laras-builder:${pb.authStore.record?.id || 'anonymous'}:${id}`;
	const dirty = Boolean(draft && encode(draft) !== saved);
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
		setError('');
		setConflict(false);
		conflictRef.current = false;
		setRecovery(null);
		past.current = [];
		future.current = [];
		builderRequest<BuilderRecord>('get', { id })
			.then((r) => {
				if (!live) return;
				const envelope = { document: r.document, privateKeys: r.privateKeys };
				install(envelope);
				setSaved(encode(envelope));
				setRevision(r.revision);
				revisionRef.current = r.revision;
				setActive(r.document.activities[0]?.id || '');
				setSelected('');
				const local = readRecovery(storageKey);
				if (local && encode(local) !== encode(envelope)) setRecovery(local);
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
	const change: Change = (edit) => {
		if (!current.current || recovery || conflict) return;
		const prior = current.current,
			next = structuredClone(prior);
		edit(next);
		if (encode(next) === encode(prior)) return;
		past.current = [...past.current.slice(-29), prior];
		future.current = [];
		install(next);
		setHistoryVersion((v) => v + 1);
	};
	const save = useCallback(async () => {
		if (!current.current || savingRef.current || conflictRef.current) return;
		const savingId = id,
			snapshot = structuredClone(current.current),
			hash = encode(snapshot),
			baseRevision = revisionRef.current;
		savingRef.current = true;
		setSaving(true);
		setError('');
		try {
			const record = await builderRequest<BuilderRecord>('save', {
				id: savingId,
				baseRevision,
				commandId: uid(),
				...snapshot,
			});
			if (activeId.current !== savingId) return;
			revisionRef.current = record.revision;
			setRevision(record.revision);
			setSaved(hash);
		} catch (e) {
			if (activeId.current !== savingId) return;
			const message = (e as Error).message;
			setError(message);
			if (message.includes('REVISION_CONFLICT')) {
				conflictRef.current = true;
				setConflict(true);
			}
		} finally {
			savingRef.current = false;
			if (activeId.current === savingId) setSaving(false);
		}
	}, [id]);
	useEffect(() => {
		if (!draft || !dirty || saving || recovery || conflict || error) return;
		const timer = window.setTimeout(() => void save(), 1000);
		return () => window.clearTimeout(timer);
	}, [draft, dirty, saving, recovery, conflict, error, save]);
	useEffect(() => {
		if (!draft || recovery) return;
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
			/* Server save still works when device storage is unavailable. */
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
		const from = forward ? future : past,
			to = forward ? past : future,
			next = from.current.at(-1);
		if (!next || !current.current) return;
		to.current.push(current.current);
		from.current = from.current.slice(0, -1);
		install(next);
		setHistoryVersion((v) => v + 1);
	};
	const download = () => {
		if (!current.current) return;
		const url = URL.createObjectURL(
			new Blob([JSON.stringify(current.current, null, 2)], {
				type: 'application/json',
			}),
		);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'laras-draf-pribadi.json';
		a.click();
		URL.revokeObjectURL(url);
	};
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
			install({ document: r.document, privateKeys: r.privateKeys });
			setSaved(encode({ document: r.document, privateKeys: r.privateKeys }));
			revisionRef.current = r.revision;
			setRevision(r.revision);
			setConflict(false);
			conflictRef.current = false;
			past.current = [];
			future.current = [];
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
	const selectActivity = (activityId: string) => {
		setActive(activityId);
		setInsertion(null);
		setSelected('');
		setPanel('content');
		setPicker(false);
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
	const finishDrag = () => {
		dragItem.current = null;
		setDragging(false);
		setDropTarget('');
	};
	const openElements = (activityId: string, beforeId?: string) => {
		setActive(activityId);
		setInsertion({ activityId, beforeId });
		setLeftTab('elements');
		setPanel('content');
		if (window.matchMedia('(max-width: 1100px)').matches) setPicker(true);
		else
			requestAnimationFrame(() =>
				document
					.querySelector<HTMLInputElement>(
						'.bd-builder-sidebar input[type="search"]',
					)
					?.focus(),
			);
	};
	const revealBlock = (activityId: string, blockId: string) => {
		setActive(activityId);
		setSelected(blockId);
		setPicker(false);
		requestAnimationFrame(() => {
			const element = document.getElementById('builder-block-' + blockId);
			element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
			element?.focus({ preventScroll: true });
		});
	};
	const addElement = (
		elementId: string,
		position = insertion || {
			activityId: activity?.id,
			beforeId: undefined as string | undefined,
		},
	) => {
		const { activityId, beforeId } = position;
		const element = BUILDER_ELEMENTS.find((e) => e.id === elementId);
		if (!element || !activityId || locked) return;
		const target = current.current?.document.activities.find(
			(a) => a.id === activityId,
		);
		if (!target) return;
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
		change((next) => {
			blockId = appendBlock(next, activityId, element.type);
			const blocks = next.document.activities.find(
				(a) => a.id === activityId,
			)!.blocks;
			const added = blocks.pop()!;
			if (element.shortAnswer) {
				for (const qid of added.questionIds || []) {
					delete next.document.questionsById[qid];
					delete next.privateKeys.answersByQuestionId[qid];
				}
				added.questionIds = [appendQuestion(next, 'short_answer')];
			}
			const index = beforeId ? blocks.findIndex((b) => b.id === beforeId) : -1;
			blocks.splice(index < 0 ? blocks.length : index, 0, added);
		});
		setInsertion({ activityId, beforeId });
		setAnnouncement(
			`${element.label} ditambahkan ke ${target.title || 'kegiatan'}.`,
		);
		revealBlock(activityId, blockId);
	};
	const dropElement = (
		event: DragEvent,
		activityId: string,
		beforeId?: string,
	) => {
		event.preventDefault();
		const item = dragItem.current;
		finishDrag();
		if (!item || locked) return;
		if (item.elementId) {
			addElement(item.elementId, { activityId, beforeId });
			return;
		}
		if (!item.blockId || !item.activityId || item.blockId === beforeId) return;
		const source = current.current?.document.activities.find(
			(a) => a.id === item.activityId,
		);
		if (!source?.blocks.some((b) => b.id === item.blockId)) return;
		change((next) => {
			const from = next.document.activities.find(
				(a) => a.id === item.activityId,
			)!;
			const to = next.document.activities.find((a) => a.id === activityId);
			if (!to) return;
			const index = from.blocks.findIndex((b) => b.id === item.blockId);
			const [moving] = from.blocks.splice(index, 1);
			const at = beforeId ? to.blocks.findIndex((b) => b.id === beforeId) : -1;
			to.blocks.splice(at < 0 ? to.blocks.length : at, 0, moving);
		});
		setInsertion(null);
		setAnnouncement('Posisi elemen diperbarui.');
		revealBlock(activityId, item.blockId);
	};
	const insertionSlot = (activityId: string, beforeId?: string) => {
		const key = activityId + ':' + (beforeId || 'end');
		return (
			<div
				className={
					'bd-insertion-slot' +
					(dragging ? ' is-dragging' : '') +
					(dropTarget === key ? ' is-over' : '')
				}
				onDragOver={(event) => {
					if (!dragItem.current || locked) return;
					event.preventDefault();
					event.dataTransfer.dropEffect = dragItem.current.elementId
						? 'copy'
						: 'move';
					setDropTarget(key);
				}}
				onDragLeave={() =>
					setDropTarget((current) => (current === key ? '' : current))
				}
				onDrop={(event) => dropElement(event, activityId, beforeId)}
			>
				<button
					type="button"
					disabled={locked}
					aria-label={
						beforeId
							? `Sisipkan elemen sebelum ${BLOCK_LABELS[d.activities.find((a) => a.id === activityId)!.blocks.find((b) => b.id === beforeId)!.type]}`
							: 'Tambah elemen di akhir kegiatan'
					}
					onClick={() => openElements(activityId, beforeId)}
				>
					<Plus size={14} />
					<span>
						{dragging ? 'Letakkan elemen di sini' : 'Sisipkan elemen'}
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
									change((next) => {
										copied = duplicateActivity(next, a.id);
									});
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
					setActive(a.id);
					setInsertion(null);
					setSelected('');
				}}
			>
				<Plus size={16} />
				Tambah kegiatan
			</button>
			<p>Draf pribadi · hanya dosen</p>
		</div>
	);
	const insertionActivity =
		d.activities.find((a) => a.id === insertion?.activityId) || activity;
	const beforeIndex =
		insertionActivity?.blocks.findIndex((b) => b.id === insertion?.beforeId) ??
		-1;
	const sidebarContents = (surface: string) => (
		<>
			<div
				className="bd-sidebar-tabs"
				role="tablist"
				aria-label="Panel builder"
				onKeyDown={(event) => {
					if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
						return;
					event.preventDefault();
					const tab =
						event.key === 'Home'
							? 'elements'
							: event.key === 'End'
								? 'outline'
								: leftTab === 'elements'
									? 'outline'
									: 'elements';
					setLeftTab(tab);
					document.getElementById(`builder-${tab}-tab-${surface}`)?.focus();
				}}
			>
				<button
					type="button"
					role="tab"
					tabIndex={leftTab === 'elements' ? 0 : -1}
					aria-selected={leftTab === 'elements'}
					aria-controls={`builder-elements-panel-${surface}`}
					id={`builder-elements-tab-${surface}`}
					onClick={() => setLeftTab('elements')}
				>
					<LayoutGrid size={15} /> Elemen
				</button>
				<button
					type="button"
					role="tab"
					tabIndex={leftTab === 'outline' ? 0 : -1}
					aria-selected={leftTab === 'outline'}
					aria-controls={`builder-outline-panel-${surface}`}
					id={`builder-outline-tab-${surface}`}
					onClick={() => setLeftTab('outline')}
				>
					<ListTree size={15} /> Outline
				</button>
			</div>
			<div
				role="tabpanel"
				id={`builder-elements-panel-${surface}`}
				aria-labelledby={`builder-elements-tab-${surface}`}
				hidden={leftTab !== 'elements'}
			>
				<BuilderElementLibrary
					disabled={locked || !activity}
					target={
						insertionActivity
							? `${insertionActivity.title || 'Kegiatan'} · ${beforeIndex >= 0 ? `sebelum elemen ${beforeIndex + 1}` : 'akhir kegiatan'}`
							: 'Tambahkan kegiatan terlebih dahulu.'
					}
					onAdd={(elementId) => addElement(elementId)}
					onDragStart={(elementId, event) => {
						dragItem.current = { elementId };
						event.dataTransfer.setData(BUILDER_DRAG_TYPE, elementId);
						event.dataTransfer.effectAllowed = 'copy';
						setDragging(true);
					}}
					onDragEnd={finishDrag}
				/>
			</div>
			<div
				role="tabpanel"
				id={`builder-outline-panel-${surface}`}
				aria-labelledby={`builder-outline-tab-${surface}`}
				hidden={leftTab !== 'outline'}
			>
				{outlineContents}
			</div>
		</>
	);
	const inspectorContents = (
		<>
			<header>
				<Settings2 size={16} />
				<h2>{block ? 'Pengaturan elemen' : 'Pengaturan kegiatan'}</h2>
			</header>
			{block ? (
				<KeyInspector block={block} envelope={draft} onChange={change} />
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
						onClick={() => {
							if (
								activity.blocks.length &&
								!window.confirm(
									'Hapus kegiatan beserta semua elemennya? Anda dapat mengurungkannya.',
								)
							)
								return;
							change((next) => {
								for (const b of [...activity.blocks])
									removeBlock(next, activity.id, b.id);
								next.document.activities = next.document.activities.filter(
									(a) => a.id !== activity.id,
								);
							});
							setActive(
								d.activities.find((a) => a.id !== activity.id)?.id || '',
							);
							setSelected('');
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
		<div className="bd-workspace" data-history-version={historyVersion}>
			<header className="bd-topbar">
				<div className="bd-title-group">
					<Link
						aria-label="Kembali ke daftar"
						className="bd-icon"
						to={d.kind === 'kelas' ? '/app/kelas-terjadwal' : '/app/tugas'}
					>
						<ArrowLeft size={18} />
					</Link>
					<div>
						<span className="bd-kicker">
							BUILDER · {d.kind === 'kelas' ? 'KELAS' : 'TUGAS'}
						</span>
						<input
							aria-label="Judul dokumen"
							maxLength={200}
							value={d.title}
							onChange={(e) =>
								change((v) => {
									v.document.title = e.target.value;
								})
							}
						/>
					</div>
				</div>
				<div className="bd-toolbar-actions">
					<span className="bd-save-status" role="status">
						{conflict
							? 'Konflik revisi'
							: saving
								? 'Menyimpan…'
								: error
									? 'Belum tersimpan'
									: dirty
										? 'Perubahan belum tersimpan'
										: 'Tersimpan'}{' '}
						{!dirty && !saving && !error && <Check size={13} />}
					</span>
					<button
						type="button"
						className="bd-icon"
						disabled={!past.current.length || conflict || Boolean(recovery)}
						aria-label="Urungkan"
						onClick={() => undo()}
					>
						<Undo2 size={17} />
					</button>
					<button
						type="button"
						className="bd-icon"
						disabled={!future.current.length || conflict || Boolean(recovery)}
						aria-label="Ulangi"
						onClick={() => undo(true)}
					>
						<Redo2 size={17} />
					</button>
					<button
						className="bd-secondary"
						disabled={saving || !dirty || conflict || Boolean(recovery)}
						onClick={() => void save()}
					>
						<Save size={15} />
						Simpan
					</button>
					<button
						className="bd-secondary bd-inspector-toggle"
						onClick={() => setInspectorOpen(true)}
					>
						<Settings2 size={15} />
						Pengaturan
					</button>
					<button className="bd-secondary" onClick={() => setPreview(true)}>
						<Eye size={15} />
						Pratinjau
					</button>
					<button className="bd-primary" onClick={() => setPanel('review')}>
						<FileCheck2 size={16} />
						Tinjau draf
					</button>
				</div>
			</header>
			<div className="bd-subbar">
				<span>
					{d.activities.length} kegiatan · {questionCount} pertanyaan · {points}{' '}
					poin · Revisi {revision}
				</span>
				<nav aria-label="Bagian builder">
					{(
						[
							{ id: 'content', label: 'Isi kegiatan' },
							{
								id: 'delivery',
								label: d.kind === 'kelas' ? 'Jadwal kelas' : 'Pengumpulan',
							},
							{ id: 'review', label: 'Tinjau' },
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
			{recovery && (
				<div className="bd-recovery" role="alert">
					<strong>Ada perubahan yang tersimpan di perangkat.</strong>
					<p>
						Versi ini berbeda dari server. Pilih versi yang ingin dilanjutkan.
					</p>
					<div className="bd-inline-actions">
						<button
							className="bd-primary"
							onClick={() => {
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
						<button
							className="bd-secondary"
							onClick={() => {
								setLeftTab('elements');
								setPicker(true);
							}}
						>
							<LayoutGrid size={16} /> Elemen
						</button>
						<button
							className="bd-secondary"
							onClick={() => {
								setLeftTab('outline');
								setPicker(true);
							}}
						>
							<ListTree size={16} /> Outline
						</button>
					</div>
					<aside className="bd-builder-sidebar" aria-label="Panel builder">
						{sidebarContents('desktop')}
					</aside>
					<section className="bd-canvas" aria-label="Isi kegiatan">
						<section className="bd-document-intro">
							<label>
								Instruksi umum
								<textarea
									rows={3}
									maxLength={20000}
									placeholder="Apa yang perlu diketahui mahasiswa?"
									value={plain(d.instructions)}
									onChange={(e) =>
										change((next) => {
											next.document.instructions = rich(e.target.value);
										})
									}
								/>
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
										}}
									>
										<Settings2 size={17} />
									</button>
								</header>
								{a.blocks.map((b, j) => (
									<Fragment key={b.id}>
										{insertionSlot(a.id, b.id)}
										<article
											className={
												'bd-block' + (selected === b.id ? ' is-selected' : '')
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
														draggable={!locked}
														disabled={locked}
														aria-label={`Seret ${BLOCK_LABELS[b.type]}`}
														title="Seret untuk memindahkan elemen"
														onDragStart={(event) => {
															event.stopPropagation();
															dragItem.current = {
																activityId: a.id,
																blockId: b.id,
															};
															event.dataTransfer.setData(
																BUILDER_DRAG_TYPE,
																b.id,
															);
															event.dataTransfer.effectAllowed = 'move';
															setDragging(true);
														}}
														onDragEnd={finishDrag}
													>
														<GripVertical size={15} />
													</button>
													{BLOCK_LABELS[b.type]}
												</span>
												<div>
													<button
														type="button"
														className="bd-icon"
														aria-label="Naikkan elemen"
														disabled={j === 0}
														onClick={() =>
															change((next) => {
																const blocks = next.document.activities.find(
																	(x) => x.id === a.id,
																)!.blocks;
																[blocks[j - 1], blocks[j]] = [
																	blocks[j],
																	blocks[j - 1],
																];
															})
														}
													>
														<ArrowUp size={14} />
													</button>
													<button
														type="button"
														className="bd-icon"
														aria-label="Turunkan elemen"
														disabled={j === a.blocks.length - 1}
														onClick={() =>
															change((next) => {
																const blocks = next.document.activities.find(
																	(x) => x.id === a.id,
																)!.blocks;
																[blocks[j + 1], blocks[j]] = [
																	blocks[j],
																	blocks[j + 1],
																];
															})
														}
													>
														<ArrowDown size={14} />
													</button>
													<button
														type="button"
														className="bd-icon"
														aria-label="Hapus elemen"
														onClick={(e) => {
															e.stopPropagation();
															change((next) => removeBlock(next, a.id, b.id));
															setSelected('');
														}}
													>
														<Trash2 size={14} />
													</button>
												</div>
											</div>
											<BlockEditor
												block={b}
												envelope={draft}
												onChange={change}
											/>
										</article>
									</Fragment>
								))}
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
							Konten dan pengaturan ini tersimpan untuk Anda. Draf ini belum
							dibagikan kepada mahasiswa.
						</p>
					</div>
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
												setActive(issue.activityId);
												setSelected(issue.blockId || '');
												setPanel('content');
												requestAnimationFrame(() =>
													document
														.getElementById(
															'builder-activity-' + issue.activityId,
														)
														?.scrollIntoView({ block: 'start' }),
												);
											} else setPanel('delivery');
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
						<button className="bd-primary" onClick={() => setPreview(true)}>
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
						<DialogTitle>Panel builder</DialogTitle>
						<DialogDescription>
							Pilih elemen atau kegiatan. Ketuk elemen untuk menambahkannya.
						</DialogDescription>
					</DialogHeader>
					{sidebarContents('drawer')}
				</DialogContent>
			</Dialog>
			<Dialog open={preview} onOpenChange={setPreview}>
				<DialogContent className="bd-preview-dialog">
					<DialogHeader>
						<DialogTitle>Pratinjau mahasiswa</DialogTitle>
						<DialogDescription>
							Menampilkan perubahan terbaru. Jawaban percobaan tidak disimpan
							sebagai kiriman mahasiswa.
						</DialogDescription>
					</DialogHeader>
					<div className="bd-inline-actions">
						<button
							className="bd-secondary"
							aria-pressed={!previewMobile}
							onClick={() => setPreviewMobile(false)}
						>
							Desktop
						</button>
						<button
							className="bd-secondary"
							aria-pressed={previewMobile}
							onClick={() => setPreviewMobile(true)}
						>
							Ponsel
						</button>
					</div>
					<div
						className={
							previewMobile ? 'bd-preview-frame is-mobile' : 'bd-preview-frame'
						}
					>
						<BuilderPreview document={d} />
					</div>
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
		</div>
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
						<label>
							Alur kegiatan
							<select
								value={p.progression}
								onChange={(e) =>
									onChange((next) => {
										next.document.delivery.progression = e.target
											.value as typeof p.progression;
									})
								}
							>
								<option value="scheduled">Terjadwal otomatis</option>
								<option value="guided">Dipandu dosen</option>
								<option value="free">Navigasi bebas</option>
							</select>
						</label>
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
