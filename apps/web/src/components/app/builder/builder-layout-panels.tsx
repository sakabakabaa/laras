import { BuilderAppearanceControls } from './builder-appearance-controls';
import { BuilderGroupBackgroundControls } from './builder-group-background-controls';
import { useId, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
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
	setLayoutSide,
	type BuilderLayoutGroup,
	type BuilderResponsiveOverride,
	type ResolvedLayoutNode,
} from '@/lib/builder-layout';

function SideSpacing({ label, value, linked, onLink, onChange }: { label: string; value?: Record<string, number>; linked: boolean; onLink: (linked: boolean) => void; onChange: (side: 'top'|'right'|'bottom'|'left', value: number | undefined, linked: boolean) => void }) {
	const [isLinked, setIsLinked] = useState(linked);
	return <fieldset className="bd-fields"><legend>{label}</legend><button type="button" className="bd-secondary" aria-pressed={isLinked} onClick={() => { const next = !isLinked; setIsLinked(next); onLink(next); }}>{isLinked ? 'Tertaut' : 'Tidak tertaut'}</button><div className="bd-inline-actions">{(['top','right','bottom','left'] as const).map(side => <label key={side}>{({top:'Atas',right:'Kanan',bottom:'Bawah',left:'Kiri'})[side]}<input type="number" min={0} max={120} step={1} value={value?.[side] ?? ''} onChange={event => { const raw = event.target.value; const parsed = Number(raw); if (raw !== '' && (!Number.isInteger(parsed) || parsed < 0 || parsed > 120)) return; onChange(side, raw === '' ? undefined : parsed, isLinked); }} /></label>)}</div></fieldset>;
}

function deviceTarget(target: BuilderLayoutGroup, device: 'tablet'|'mobile') {
	target.responsive ??= {};
	target.responsive[device] ??= {};
	return target.responsive[device]!;
}

function sideLinked(value?: Record<string, number>) { return new Set(Object.values(value ?? {})).size <= 1; }

function setSideLinked(target: BuilderLayoutGroup | BuilderResponsiveOverride, key: 'paddingLinked'|'marginLinked', linked: boolean) { target[key] = linked; }

function editPx(target: BuilderLayoutGroup, key: 'rowGap'|'columnGap', raw: string) {
	if (raw === '') { delete target[key]; return; }
	const value = Number(raw);
	if (Number.isInteger(value) && value >= 0 && value <= 80) target[key] = value;
}

type Change = (edit: (draft: BuilderEnvelope) => void) => void;

function ResponsiveControls({ group, update }: { group: BuilderLayoutGroup; update: (edit: (group: BuilderLayoutGroup) => void) => void }) {
	const [device, setDevice] = useState<'tablet'|'mobile'>('tablet');
	const values = group.responsive?.[device] ?? {};
	const set = (key: 'columns'|'direction'|'align'|'distribute'|'wrap'|'gap'|'padding'|'rowGap'|'columnGap', value: string) => update(target => {
		const responsive = { ...(target.responsive ?? {}) };
		const current = { ...(responsive[device] ?? {}) };
		if (value === '') delete current[key];
		else {
			const next = ['columns','rowGap','columnGap'].includes(key) ? Number(value) : key === 'wrap' ? value === 'true' : value;
			if (['rowGap','columnGap'].includes(key) && (!Number.isInteger(next) || Number(next) < 0 || Number(next) > 80)) return;
			(current as Record<string, unknown>)[key] = next;
		}
		if (Object.keys(current).length) responsive[device] = current;
		else delete responsive[device];
		target.responsive = Object.keys(responsive).length ? responsive : undefined;
	});
	return <fieldset className="bd-fields"><legend>Tata letak perangkat</legend>
		<div className="bd-inline-actions">{(['tablet','mobile'] as const).map(value => <button type="button" key={value} className="bd-secondary" aria-pressed={device===value} onClick={() => setDevice(value)}>{value==='tablet'?'Tablet':'Ponsel'}</button>)}</div>
		<label>Kolom<select value={values.columns ?? ''} onChange={e=>set('columns',e.target.value)}><option value="">Otomatis mengikuti layar</option><option value="1">1 kolom</option><option value="2">2 kolom</option><option value="3">3 kolom</option></select></label>
		<label>Arah<select value={values.direction ?? ''} onChange={e=>set('direction',e.target.value)}><option value="">Ikuti dasar ({group.direction ?? 'grid'})</option><option value="grid">Grid</option><option value="row">Baris</option><option value="column">Kolom</option></select></label>
		<label>Perataan silang<select value={values.align ?? ''} onChange={e=>set('align',e.target.value)}><option value="">Ikuti dasar</option><option value="start">Awal</option><option value="center">Tengah</option><option value="end">Akhir</option><option value="stretch">Regangkan</option></select></label>
		<label>Distribusi utama<select value={values.distribute ?? ''} onChange={e=>set('distribute',e.target.value)}><option value="">Ikuti dasar</option><option value="start">Awal</option><option value="center">Tengah</option><option value="end">Akhir</option><option value="between">Ruang di antara</option></select></label>
		<label>Bungkus baris<select value={values.wrap === undefined ? '' : String(values.wrap)} onChange={e=>set('wrap',e.target.value)}><option value="">Ikuti dasar</option><option value="true">Bungkus</option><option value="false">Jangan bungkus</option></select></label>
		<label>Jarak<select value={values.gap ?? ''} onChange={e=>set('gap',e.target.value)}><option value="">Ikuti dasar ({group.gap})</option>{(['none','sm','md','lg'] as const).map(x=><option key={x} value={x}>{({none: 'Tanpa jarak', sm: 'Kecil', md: 'Sedang', lg: 'Besar'})[x]}</option>)}</select></label>
		<label>Padding<select value={values.padding ?? ''} onChange={e=>set('padding',e.target.value)}><option value="">Ikuti dasar ({group.padding})</option>{(['none','sm','md'] as const).map(x=><option key={x} value={x}>{({none: 'Tanpa padding', sm: 'Kecil', md: 'Sedang'})[x]}</option>)}</select></label>
		<SideSpacing key={`${device}-padding`} label="Padding per sisi (px)" value={values.paddingSides} linked={values.paddingLinked ?? sideLinked(values.paddingSides)} onLink={next=>update(target=>{const deviceGroup=deviceTarget(target,device);setSideLinked(deviceGroup,'paddingLinked',next);if(next){const value=Object.values(values.paddingSides ?? {})[0];setLayoutSide(deviceGroup, 'paddingSides','top',value,true);}})} onChange={(side,value,linked)=>update(target=>setLayoutSide(deviceTarget(target,device), 'paddingSides',side,value,linked))} />
		<SideSpacing key={`${device}-margin`} label="Margin per sisi (px)" value={values.margin} linked={values.marginLinked ?? sideLinked(values.margin)} onLink={next=>update(target=>{const deviceGroup=deviceTarget(target,device);setSideLinked(deviceGroup,'marginLinked',next);if(next){const value=Object.values(values.margin ?? {})[0];setLayoutSide(deviceGroup, 'margin','top',value,true);}})} onChange={(side,value,linked)=>update(target=>setLayoutSide(deviceTarget(target,device), 'margin',side,value,linked))} />
		<label>Jarak baris (px)<input type="number" min={0} max={80} value={values.rowGap ?? ''} onChange={e=>set('rowGap',e.target.value)} /></label><label>Jarak kolom (px)<input type="number" min={0} max={80} value={values.columnGap ?? ''} onChange={e=>set('columnGap',e.target.value)} /></label>
		<button type="button" className="bd-secondary" onClick={()=>update(target=>{if(target.responsive) delete target.responsive[device]; if(target.responsive&&!Object.keys(target.responsive).length) delete target.responsive;})}>Reset perangkat ini</button>
	</fieldset>;
}

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
	collapsedGroups,
	setCollapsedGroups,
	idPrefix,
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
	collapsedGroups: string[];
	setCollapsedGroups: React.Dispatch<React.SetStateAction<string[]>>;
	idPrefix: string;
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
							<Action label="Naikkan" onClick={() => onMove(node.block.id, -1)} icon={<ArrowUp size={12} />} />
							<Action
								label="Turunkan"
								onClick={() => onMove(node.block.id, 1)}
								icon={<ArrowDown size={12} />}
							/>
							<Action
								label="Masukkan ke bagian sebelumnya"
								onClick={() => onReparent(node.block.id, 'in')}
								icon={<ArrowRight size={12} />}
							/>
							<Action
								label="Keluarkan dari bagian"
								onClick={() => onReparent(node.block.id, 'out')}
								icon={<ArrowLeft size={12} />}
							/>
						</span>
					)}
				</li>
			);
		}
		const selected = selectedNodeId === node.id;
		const collapsed = collapsedGroups.includes(node.id);
		return (
			<li
				key={node.id}
				className={'bd-structure-group' + (selected ? ' is-selected' : '')}
				style={{ paddingLeft: depth * 14 }}
			>
				<div className="bd-structure-row">
					<button type="button" className="bd-structure-toggle" aria-label={`${collapsed ? 'Buka' : 'Ringkas'} ${node.title || (node.kind === 'section' ? 'bagian' : 'kontainer')}`} aria-expanded={!collapsed} aria-controls={`${idPrefix}-${node.id}`} onClick={() => setCollapsedGroups(groups => collapsed ? groups.filter(id => id !== node.id) : [...groups, node.id])}>
						{collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
					</button>
					<button
						type="button"
						className="bd-structure-select"
						aria-current={selected ? 'true' : undefined}
						onClick={() => onSelectGroup(node.id)}
						onKeyDown={(event) => moveKeys(event, node.id)}
					>
						<strong>{node.title || (node.kind === 'section' ? 'Bagian' : 'Kontainer')}</strong>
						<small>{node.columns} kolom</small>
					</button>
					{selected && (
						<span className="bd-structure-actions">
							<Action label="Naikkan" onClick={() => onMove(node.id, -1)} icon={<ArrowUp size={12} />} />
							<Action label="Turunkan" onClick={() => onMove(node.id, 1)} icon={<ArrowDown size={12} />} />
							<Action
								label="Masukkan ke bagian sebelumnya"
								onClick={() => onReparent(node.id, 'in')}
								icon={<ArrowRight size={12} />}
							/>
							<Action
								label="Keluarkan dari bagian"
								onClick={() => onReparent(node.id, 'out')}
								icon={<ArrowLeft size={12} />}
							/>
							<Action
								label="Hapus bagian, simpan isinya"
								onClick={() => onRemoveGroup(node.id)}
								danger
								icon={<Trash2 size={12} />}
							/>
						</span>
					)}
				</div>
				<ol id={`${idPrefix}-${node.id}`} className="bd-structure-children" hidden={collapsed}>
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
							collapsedGroups={collapsedGroups}
							setCollapsedGroups={setCollapsedGroups}
							idPrefix={idPrefix}
							depth={depth + 1}
						/>
				</ol>
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
	icon,
}: {
	label: string;
	onClick: () => void;
	disabled?: boolean;
	danger?: boolean;
	icon?: ReactNode;
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
			{icon || (danger ? <Trash2 size={12} /> : <ArrowUp size={12} />)}
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
	const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
	const structureId = useId();
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
					collapsedGroups={collapsedGroups}
					setCollapsedGroups={setCollapsedGroups}
					idPrefix={structureId}
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
	courseId,
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
	courseId: string;
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
					<BuilderAppearanceControls exclude={['padding', 'background']} value={group.appearance} onChange={appearance => update(target => { if (appearance) target.appearance = appearance; else delete target.appearance; })} />
					<BuilderGroupBackgroundControls courseId={courseId} value={group.background} onChange={background => update(target => { if (background) target.background = background; else delete target.background; })} />
					<ResponsiveControls group={group} update={update} />
					<label>Arah alur<select value={group.direction ?? 'grid'} onChange={event=>update(target=>{const value=event.target.value as 'grid'|'row'|'column'; if(value==='grid') delete target.direction; else target.direction=value; })}><option value="grid">Grid</option><option value="row">Baris</option><option value="column">Kolom</option></select></label>
					<label>Perataan silang<select value={group.align ?? ''} onChange={event=>update(target=>{if(event.target.value) target.align=event.target.value as 'start'|'center'|'end'|'stretch'; else delete target.align;})}><option value="">Regangkan (default)</option><option value="start">Awal</option><option value="center">Tengah</option><option value="end">Akhir</option><option value="stretch">Regangkan</option></select></label>
					<label>Distribusi utama<select value={group.distribute ?? ''} onChange={event=>update(target=>{if(event.target.value) target.distribute=event.target.value as 'start'|'center'|'end'|'between'; else delete target.distribute;})}><option value="">Awal (default)</option><option value="start">Awal</option><option value="center">Tengah</option><option value="end">Akhir</option><option value="between">Ruang di antara</option></select></label>
					{group.direction && group.direction !== 'grid' && <label>Bungkus baris<input type="checkbox" checked={group.wrap ?? true} onChange={event=>update(target=>{if(event.target.checked) delete target.wrap; else target.wrap=false;})} /></label>}
					<SideSpacing label="Padding per sisi (px)" value={group.paddingSides} linked={group.paddingLinked ?? sideLinked(group.paddingSides)} onLink={next=>update(target=>{target.paddingLinked=next;if(next){const value=Object.values(group.paddingSides ?? {})[0];setLayoutSide(target,'paddingSides','top',value,true);}})} onChange={(side,value,linked)=>update(target=>setLayoutSide(target,'paddingSides',side,value,linked))} />
					<SideSpacing label="Margin per sisi (px)" value={group.margin} linked={group.marginLinked ?? sideLinked(group.margin)} onLink={next=>update(target=>{target.marginLinked=next;if(next){const value=Object.values(group.margin ?? {})[0];setLayoutSide(target,'margin','top',value,true);}})} onChange={(side,value,linked)=>update(target=>setLayoutSide(target,'margin',side,value,linked))} />
					<label>Jarak baris (px)<input type="number" min={0} max={80} value={group.rowGap ?? ''} onChange={event=>update(target=>editPx(target,'rowGap',event.target.value))} /></label><label>Jarak kolom (px)<input type="number" min={0} max={80} value={group.columnGap ?? ''} onChange={event=>update(target=>editPx(target,'columnGap',event.target.value))} /></label>
					<label>Lebar bagian<select value={group.width ?? 'full'} onChange={event => update(target => { if (event.target.value === 'full') delete target.width; else target.width = 'contained'; })}><option value="full">Penuh</option><option value="contained">Terbatas</option></select></label>
					{group.width === 'contained' && <label>Lebar maksimum (px)<input type="number" min={320} max={1920} step={40} value={group.maxWidth ?? 1200} onChange={event => update(target => { const value = Number(event.target.value); if (Number.isFinite(value) && value >= 320 && value <= 1920) target.maxWidth = Math.round(value); else delete target.maxWidth; })} /></label>}
					{group.columns > 1 && (group.direction ?? 'grid') === 'grid' && <label>Rasio kolom<select value={group.columnWeights?.join(':') ?? ''} onChange={event => update(target => { const values = event.target.value ? event.target.value.split(':').map(Number) : undefined; if (values) target.columnWeights = values as [number, number] | [number, number, number]; else delete target.columnWeights; })}><option value="">Sama rata</option>{group.columns === 2 ? <><option value="2:1">2 : 1</option><option value="1:2">1 : 2</option><option value="3:2">3 : 2</option></> : <><option value="2:1:1">2 : 1 : 1</option><option value="1:2:1">1 : 2 : 1</option><option value="1:1:2">1 : 1 : 2</option></>}</select></label>}
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
