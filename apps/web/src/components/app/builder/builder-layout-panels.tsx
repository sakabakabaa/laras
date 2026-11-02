import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import {
	BLOCK_LABELS,
	type BuilderActivity,
	type BuilderEnvelope,
} from '@/lib/builder-document';
import {
	LAYOUT_LIMITS,
	addLayoutGroup,
	countLayoutGroups,
	findLayoutGroup,
	layoutPath,
	removeLayoutGroup,
	resolveActivityLayout,
	type BuilderLayoutGroup,
	type ResolvedLayoutNode,
} from '@/lib/builder-layout';

type Change = (edit: (draft: BuilderEnvelope) => void) => void;

function activityIn(draft: BuilderEnvelope, activityId: string) {
	return draft.document.activities.find((item) => item.id === activityId);
}

function count(nodes: ResolvedLayoutNode[]): number {
	return nodes.reduce(
		(sum, node) => sum + 1 + (node.kind === 'block' ? 0 : count(node.children)),
		0,
	);
}

function StructureRows({
	nodes,
	activity,
	selectedNodeId,
	selectedBlockId,
	onSelectGroup,
	onSelectBlock,
	onMove,
	onReparent,
	onRemoveGroup,
	depth = 0,
}: {
	nodes: ResolvedLayoutNode[];
	activity: BuilderActivity;
	selectedNodeId: string;
	selectedBlockId: string;
	onSelectGroup: (id: string) => void;
	onSelectBlock: (id: string) => void;
	onMove: (id: string, delta: number) => void;
	onReparent: (id: string, direction: 'in' | 'out') => void;
	onRemoveGroup: (id: string) => void;
	depth?: number;
}): ReactNode {
	return nodes.map((node) => {
		if (node.kind === 'block') {
			const selected = selectedBlockId === node.block.id;
			return (
				<li
					key={'block-' + node.block.id}
					className={'bd-structure-block' + (selected ? ' is-selected' : '')}
					style={{ paddingLeft: depth * 14 }}
				>
					<button
						type="button"
						className="bd-structure-select"
						aria-current={selected ? 'true' : undefined}
						onClick={() => onSelectBlock(node.block.id)}
						onKeyDown={(event) => moveKeys(event, node.block.id)}
					>
						<span>{BLOCK_LABELS[node.block.type]}</span>
					</button>
					{selected && (
						<span className="bd-structure-actions">
							<Action label="Naikkan" onClick={() => onMove(node.block.id, -1)} />
							<Action
								label="Turunkan"
								onClick={() => onMove(node.block.id, 1)}
							/>
							<Action
								label="Masukkan ke bagian sebelumnya"
								onClick={() => onReparent(node.block.id, 'in')}
							/>
							<Action
								label="Keluarkan dari bagian"
								onClick={() => onReparent(node.block.id, 'out')}
							/>
						</span>
					)}
				</li>
			);
		}
		const selected = selectedNodeId === node.id;
		return (
			<li
				key={node.id}
				className={'bd-structure-group' + (selected ? ' is-selected' : '')}
				style={{ paddingLeft: depth * 14 }}
			>
				<div className="bd-structure-row">
					<button
						type="button"
						className="bd-structure-select"
						aria-current={selected ? 'true' : undefined}
						onClick={() => onSelectGroup(node.id)}
						onKeyDown={(event) => moveKeys(event, node.id)}
					>
						{node.kind === 'section' ? (
							<ChevronDown size={13} />
						) : (
							<ChevronRight size={13} />
						)}
						<strong>{node.title || (node.kind === 'section' ? 'Bagian' : 'Kontainer')}</strong>
						<small>{node.columns} kolom</small>
					</button>
					{selected && (
						<span className="bd-structure-actions">
							<Action label="Naikkan" onClick={() => onMove(node.id, -1)} />
							<Action label="Turunkan" onClick={() => onMove(node.id, 1)} />
							<Action
								label="Masukkan ke bagian sebelumnya"
								onClick={() => onReparent(node.id, 'in')}
							/>
							<Action
								label="Keluarkan dari bagian"
								onClick={() => onReparent(node.id, 'out')}
							/>
							<Action
								label="Hapus bagian, simpan isinya"
								onClick={() => onRemoveGroup(node.id)}
								danger
							/>
						</span>
					)}
				</div>
				{node.children.length > 0 && (
					<ol className="bd-structure-children">
						<StructureRows
							nodes={node.children}
							activity={activity}
							selectedNodeId={selectedNodeId}
							selectedBlockId={selectedBlockId}
							onSelectGroup={onSelectGroup}
							onSelectBlock={onSelectBlock}
							onMove={onMove}
							onReparent={onReparent}
							onRemoveGroup={onRemoveGroup}
							depth={depth + 1}
						/>
					</ol>
				)}
			</li>
		);
	});

	function moveKeys(event: React.KeyboardEvent, id: string) {
		if (!event.altKey) return;
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			onMove(id, -1);
		} else if (event.key === 'ArrowDown') {
			event.preventDefault();
			onMove(id, 1);
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			onReparent(id, 'in');
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			onReparent(id, 'out');
		}
	}
}

function Action({
	label,
	onClick,
	disabled = false,
	danger = false,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	danger?: boolean;
}) {
	return (
		<button
			type="button"
			className={'bd-structure-action' + (danger ? ' is-danger' : '')}
			aria-label={label}
			title={label}
			disabled={disabled}
			onClick={onClick}
		>
			{danger ? <Trash2 size={12} /> : '•'}
		</button>
	);
}

export function BuilderLayoutNavigator({
	activity,
	selectedNodeId,
	selectedBlockId,
	disabled,
	onSelectGroup,
	onSelectBlock,
	onAddGroup,
	onMove,
	onReparent,
	onRemoveGroup,
}: {
	activity: BuilderActivity | undefined;
	selectedNodeId: string;
	selectedBlockId: string;
	disabled: boolean;
	onSelectGroup: (id: string) => void;
	onSelectBlock: (id: string) => void;
	onAddGroup: (kind: 'section' | 'container', parentId: string | null) => void;
	onMove: (id: string, delta: number) => void;
	onReparent: (id: string, direction: 'in' | 'out') => void;
	onRemoveGroup: (id: string) => void;
}) {
	if (!activity) return null;
	const nodes = resolveActivityLayout(activity);
	const groups = activity.layout ? countLayoutGroups(activity.layout) : 0;
	const total = count(nodes);
	return (
		<section className="bd-structure" aria-label="Struktur kegiatan">
			<header>
				<strong>Struktur</strong>
				<span>{total}</span>
			</header>
			<ol className="bd-structure-root">
				<StructureRows
					nodes={nodes}
					activity={activity}
					selectedNodeId={selectedNodeId}
					selectedBlockId={selectedBlockId}
					onSelectGroup={onSelectGroup}
					onSelectBlock={onSelectBlock}
					onMove={onMove}
					onReparent={onReparent}
					onRemoveGroup={onRemoveGroup}
				/>
			</ol>
			<div className="bd-structure-add">
				<button
					type="button"
					disabled={disabled || groups >= LAYOUT_LIMITS.maxGroups}
					onClick={() => onAddGroup('section', selectedNodeId || null)}
				>
					<Plus size={14} /> Bagian
				</button>
				<button
					type="button"
					disabled={disabled || groups >= LAYOUT_LIMITS.maxGroups}
					onClick={() => onAddGroup('container', selectedNodeId || null)}
				>
					<Plus size={14} /> Kontainer
				</button>
			</div>
		</section>
	);
}

export function BuilderLayoutBreadcrumbs({
	activity,
	selectedNodeId,
	selectedBlockId,
	onSelectActivity,
	onSelectGroup,
	onSelectBlock,
}: {
	activity: BuilderActivity | undefined;
	selectedNodeId: string;
	selectedBlockId: string;
	onSelectActivity: () => void;
	onSelectGroup: (id: string) => void;
	onSelectBlock: (id: string) => void;
}) {
	if (!activity) return null;
	const target = selectedNodeId || selectedBlockId;
	const path = target ? layoutPath(activity, target) : [];
	const block = selectedBlockId
		? activity.blocks.find((item) => item.id === selectedBlockId)
		: undefined;
	return (
		<nav className="bd-breadcrumbs" aria-label="Posisi pilihan">
			<button type="button" onClick={onSelectActivity}>
				{activity.title || 'Kegiatan'}
			</button>
			{path.map((item) => (
				<span key={item.kind + item.id} className="bd-breadcrumb-item">
					<span aria-hidden="true">/</span>
					{item.kind === 'block' ? (
						<button type="button" onClick={() => onSelectBlock(item.id)}>
							{block ? BLOCK_LABELS[block.type] : 'Elemen'}
						</button>
					) : (
						<button type="button" onClick={() => onSelectGroup(item.id)}>
							{item.title || (item.kind === 'section' ? 'Bagian' : 'Kontainer')}
						</button>
					)}
				</span>
			))}
			{block && !path.length && (
				<span className="bd-breadcrumb-item">
					<span aria-hidden="true">/</span>
					<button type="button" onClick={() => onSelectBlock(block.id)}>
						{BLOCK_LABELS[block.type]}
					</button>
				</span>
			)}
		</nav>
	);
}

export function BuilderLayoutInspector({
	activity,
	group,
	disabled,
	onChange,
	onAddBlock,
	onAddGroup,
	onMove,
	onReparent,
	onRemove,
}: {
	activity: BuilderActivity;
	group: BuilderLayoutGroup;
	disabled: boolean;
	onChange: Change;
	onAddBlock: () => void;
	onAddGroup: (kind: 'section' | 'container') => void;
	onMove: (delta: number) => void;
	onReparent: (direction: 'in' | 'out') => void;
	onRemove: () => void;
}) {
	const [tab, setTab] = useState<'content' | 'style' | 'advanced'>('content');
	const tabId = useId();
	const update = (edit: (target: BuilderLayoutGroup) => void) =>
		onChange((draft) => {
			const target = activityIn(draft, activity.id);
			const current = target?.layout
				? findLayoutGroup(target.layout, group.id)
				: null;
			if (current) edit(current);
		});
	const tabs = [
		['content', 'Isi'],
		['style', 'Tampilan'],
		['advanced', 'Lanjutan'],
	] as const;
	return (
		<fieldset disabled={disabled}>
			<div className="bd-inspector-tabs" role="tablist" aria-label="Pengaturan bagian">
				{tabs.map(([id, label]) => (
					<button
						key={id}
						type="button"
						role="tab"
						id={`${tabId}-${id}`}
						aria-controls={`${tabId}-panel`}
						aria-selected={tab === id}
						tabIndex={tab === id ? 0 : -1}
						className={tab === id ? 'is-active' : ''}
						onClick={() => setTab(id)}
						onKeyDown={(event) => {
							const index = tabs.findIndex(([value]) => value === id);
							const nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length
								: event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
									: event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
							if (nextIndex < 0) return;
							event.preventDefault();
							setTab(tabs[nextIndex][0]);
							document.getElementById(`${tabId}-${tabs[nextIndex][0]}`)?.focus();
						}}
					>
						{label}
					</button>
				))}
			</div>
			<div role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${tab}`}>
			{tab === 'content' ? (
				<div className="bd-fields">
					<label>
						Nama {group.kind === 'section' ? 'bagian' : 'kontainer'}
						<input
							maxLength={200}
							value={group.title}
							onChange={(event) => update((target) => (target.title = event.target.value))}
						/>
					</label>
					<p className="bd-help">
						Elemen baru dari pustaka akan masuk ke bagian ini. Urutan elemen
						yang belum ditempatkan tetap tampil di akhir kegiatan.
					</p>
					<button className="bd-secondary" disabled={disabled} onClick={onAddBlock}>
						<Plus size={15} /> Tambah elemen ke bagian ini
					</button>
					<div className="bd-inline-actions">
						<button
							className="bd-secondary"
							disabled={disabled}
							onClick={() => onAddGroup('section')}
						>
							<Plus size={14} /> Bagian dalam
						</button>
						<button
							className="bd-secondary"
							disabled={disabled}
							onClick={() => onAddGroup('container')}
						>
							<Plus size={14} /> Kontainer dalam
						</button>
					</div>
				</div>
			) : tab === 'style' ? (
				<div className="bd-fields">
					<label>
						Kolom
						<select
							value={group.columns}
							onChange={(event) =>
								update(
									(target) =>
										(target.columns = Number(event.target.value) as 1 | 2 | 3),
								)
							}
						>
							<option value={1}>1 kolom</option>
							<option value={2}>2 kolom</option>
							<option value={3}>3 kolom</option>
						</select>
					</label>
					<label>
						Jarak antarelemen
						<select
							value={group.gap}
							onChange={(event) =>
								update(
									(target) =>
										(target.gap = event.target.value as BuilderLayoutGroup['gap']),
								)
							}
						>
							<option value="none">Rapat</option>
							<option value="sm">Kecil</option>
							<option value="md">Sedang</option>
							<option value="lg">Besar</option>
						</select>
					</label>
					<label>
						Padding
						<select
							value={group.padding}
							onChange={(event) =>
								update(
									(target) =>
										(target.padding = event.target
											.value as BuilderLayoutGroup['padding']),
								)
							}
						>
							<option value="none">Tanpa padding</option>
							<option value="sm">Kecil</option>
							<option value="md">Sedang</option>
						</select>
					</label>
					<label>
						Latar
						<select
							value={group.surface}
							onChange={(event) =>
								update(
									(target) =>
										(target.surface = event.target
											.value as BuilderLayoutGroup['surface']),
								)
							}
						>
							<option value="none">Transparan</option>
							<option value="muted">Lembut</option>
							<option value="accent">Aksen</option>
						</select>
					</label>
					<p className="bd-help">
						Pada layar sempit, kolom ditumpuk otomatis. Tidak ada CSS bebas
						per bagian.
					</p>
				</div>
			) : (
				<div className="bd-fields">
					<p className="bd-help">
						Gunakan tombol atau Alt+panah saat fokus di navigator struktur.
					</p>
					<div className="bd-inline-actions">
						<button className="bd-secondary" disabled={disabled} onClick={() => onMove(-1)}>
							Naikkan
						</button>
						<button className="bd-secondary" disabled={disabled} onClick={() => onMove(1)}>
							Turunkan
						</button>
						<button className="bd-secondary" disabled={disabled} onClick={() => onReparent('in')}>
							Masukkan
						</button>
						<button className="bd-secondary" disabled={disabled} onClick={() => onReparent('out')}>
							Keluarkan
						</button>
					</div>
					<button className="bd-text-button" disabled={disabled} onClick={onRemove}>
						Hapus bagian, simpan isinya
					</button>
				</div>
			)}
			</div>
		</fieldset>
	);
}

export function addLayoutGroupToActivity(
	draft: BuilderEnvelope,
	activityId: string,
	kind: 'section' | 'container',
	parentId: string | null,
) {
	const activity = activityIn(draft, activityId);
	if (!activity) return '';
	return addLayoutGroup(activity, kind, parentId);
}

export function removeLayoutGroupFromActivity(
	draft: BuilderEnvelope,
	activityId: string,
	groupId: string,
) {
	const activity = activityIn(draft, activityId);
	return activity ? removeLayoutGroup(activity, groupId) : false;
}
