import { useMemo, useState } from 'react';
import { LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { invalidate } from '@/lib/local-cache';
import type { StructuredItem, Cpmk, SubCpmk, Assessment } from '@/lib/learning';
import { errorMessage } from '@/lib/learning';
import type { CourseRecords } from '@/hooks/use-course-records';
import { confirmDialog } from '@/components/confirm-dialog';
import { AppModal } from '@/components/app/app-modal';

type Collection = 'cpl' | 'cpmk' | 'sub_cpmk' | 'topics' | 'assessments';

type Editing = {
	collection: Collection;
	id?: string;
	/** For sub_cpmk: the parent cpmk id. */
	cpmkParent?: string;
} | null;

const LABELS: Record<Collection, { singular: string; title: string }> = {
	cpl: { singular: 'CPL', title: 'Capaian Pembelajaran Lulusan' },
	cpmk: { singular: 'CPMK', title: 'Capaian Pembelajaran Mata Kuliah' },
	sub_cpmk: { singular: 'Sub-CPMK', title: 'Sub-CPMK' },
	topics: { singular: 'Topik', title: 'Topik / Materi' },
	assessments: { singular: 'Penilaian', title: 'Komponen Penilaian' },
};

export function StructuredRecords({
	courseId,
	canEdit,
	records,
}: {
	courseId: string;
	canEdit: boolean;
	records: CourseRecords;
}) {
	const { cpl, cpmk, subCpmk, topics, assessments, loading, reload } = records;
	const [editing, setEditing] = useState<Editing>(null);
	const [openCpmk, setOpenCpmk] = useState<Set<string>>(new Set());
	const [removeError, setRemoveError] = useState('');

	const cplOptions = useMemo(
		() => cpl.map((item) => ({ id: item.id, label: item.code || item.description })),
		[cpl],
	);
	const cpmkLabel = useMemo(() => {
		const map = new Map<string, string>();
		for (const item of cpmk) map.set(item.id, item.code || item.description);
		return map;
	}, [cpmk]);

	const toggleCpmk = (id: string) =>
		setOpenCpmk((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	const remove = async (collection: Collection, id: string) => {
		if (
			!(await confirmDialog({
				title: 'Hapus catatan',
				message: 'Hapus catatan ini? Tautan dari sesi akan ikut terlepas.',
				variant: 'danger',
				confirmLabel: 'Hapus',
			}))
		)
			return;
		try {
			await pb.collection(collection).delete(id);
			invalidate(collection);
			await reload();
		} catch (err) {
			setRemoveError(errorMessage(err));
		}
	};

	if (loading) {
		return (
			<div className="ld-loading">
				<LoaderCircle size={22} className="spin" /> Memuat capaian…
			</div>
		);
	}

	const isEmpty =
		cpl.length === 0 && cpmk.length === 0 && topics.length === 0 && assessments.length === 0;

	return (
		<div className="sr-wrap">
			{isEmpty && (
				<div className="ld-empty-sm">
					Belum ada CPL/CPMK/topik/penilaian terstruktur. {canEdit
						? 'Impor RPS dari PDF atau tambah manual di bawah.'
						: 'Dosen belum menambahkannya.'}
				</div>
			)}

			{removeError && (
				<div className="ld-alert" role="alert">
					{removeError}{' '}
					<button type="button" onClick={() => setRemoveError('')}>Tutup</button>
				</div>
			)}

			<GroupBlock
				title={LABELS.cpl.title}
				canEdit={canEdit}
				onAdd={() => setEditing({ collection: 'cpl' })}
			>
				{cpl.map((item) => (
					<ItemRow
						key={item.id}
						code={item.code}
						description={item.description}
						canEdit={canEdit}
						onEdit={() => setEditing({ collection: 'cpl', id: item.id })}
						onDelete={() => void remove('cpl', item.id)}
					/>
				))}
			</GroupBlock>

			<GroupBlock
				title={LABELS.cpmk.title}
				canEdit={canEdit}
				onAdd={() => setEditing({ collection: 'cpmk' })}
			>
				{cpmk.map((item) => {
					const subs = subCpmk.filter((s) => s.cpmk === item.id);
					const parent = cpl.find((c) => c.id === item.cpl);
					const open = openCpmk.has(item.id);
					return (
						<div className="sr-cpmk" key={item.id}>
							<ItemRow
								code={item.code}
								description={item.description}
								hint={parent ? `menunjang ${parent.code || parent.description}` : undefined}
								expandable={subs.length > 0}
								expanded={open}
								onToggle={() => toggleCpmk(item.id)}
								canEdit={canEdit}
								onEdit={() => setEditing({ collection: 'cpmk', id: item.id })}
								onDelete={() => void remove('cpmk', item.id)}
							/>
							{open && subs.length > 0 && (
								<ul className="sr-sub-list">
									{subs.map((sub) => (
										<ItemRow
											key={sub.id}
											code={sub.code}
											description={sub.description}
											nested
											canEdit={canEdit}
											onEdit={() =>
												setEditing({ collection: 'sub_cpmk', id: sub.id, cpmkParent: item.id })
											}
											onDelete={() => void remove('sub_cpmk', sub.id)}
										/>
									))}
								</ul>
							)}
							{canEdit && open && (
								<button
									type="button"
									className="ld-text-btn sr-sub-add"
									onClick={() => setEditing({ collection: 'sub_cpmk', cpmkParent: item.id })}
								>
									<Plus size={14} /> Tambah Sub-CPMK
								</button>
							)}
						</div>
					);
				})}
			</GroupBlock>

			<GroupBlock
				title={LABELS.topics.title}
				canEdit={canEdit}
				onAdd={() => setEditing({ collection: 'topics' })}
			>
				{topics.map((item) => (
					<ItemRow
						key={item.id}
						code={item.code}
						description={item.description}
						canEdit={canEdit}
						onEdit={() => setEditing({ collection: 'topics', id: item.id })}
						onDelete={() => void remove('topics', item.id)}
					/>
				))}
			</GroupBlock>

			<GroupBlock
				title={LABELS.assessments.title}
				canEdit={canEdit}
				onAdd={() => setEditing({ collection: 'assessments' })}
			>
				{assessments.map((item) => (
					<ItemRow
						key={item.id}
						code={item.code}
						description={item.description}
						hint={
							item.weight != null && !Number.isNaN(item.weight)
								? `bobot ${item.weight}%`
								: undefined
						}
						canEdit={canEdit}
						onEdit={() => setEditing({ collection: 'assessments', id: item.id })}
						onDelete={() => void remove('assessments', item.id)}
					/>
				))}
			</GroupBlock>

			{editing && (
				<RecordEditor
					courseId={courseId}
					editing={editing}
					cplOptions={cplOptions}
					cpmkParentLabel={
						editing.cpmkParent ? cpmkLabel.get(editing.cpmkParent) : undefined
					}
					existing={
						editing.id
							? findExisting(editing, { cpl, cpmk, subCpmk, topics, assessments })
							: undefined
					}
					onClose={() => setEditing(null)}
					onSaved={() => {
						setEditing(null);
						void reload();
					}}
				/>
			)}
		</div>
	);
}

function findExisting(
	editing: NonNullable<Editing>,
	records: { cpl: StructuredItem[]; cpmk: Cpmk[]; subCpmk: SubCpmk[]; topics: StructuredItem[]; assessments: Assessment[] },
): StructuredItem | Cpmk | SubCpmk | Assessment | undefined {
	if (!editing.id) return undefined;
	const key: keyof typeof records =
		editing.collection === 'sub_cpmk' ? 'subCpmk' : editing.collection;
	const list = records[key];
	return list.find((row) => row.id === editing.id);
}

function GroupBlock({
	title,
	canEdit,
	onAdd,
	children,
}: {
	title: string;
	canEdit: boolean;
	onAdd: () => void;
	children: React.ReactNode;
}) {
	const hasChildren = Boolean(children);
	return (
		<section className="sr-group">
			<div className="sr-group-head">
				<h3>{title}</h3>
				{canEdit && (
					<button type="button" className="ld-btn-soft" onClick={onAdd}>
						<Plus size={15} /> Tambah
					</button>
				)}
			</div>
			{hasChildren ? <ul className="sr-list">{children}</ul> : <p className="ld-empty-sm">Belum ada.</p>}
		</section>
	);
}

function ItemRow({
	code,
	description,
	hint,
	nested,
	expandable,
	expanded,
	onToggle,
	canEdit,
	onEdit,
	onDelete,
}: {
	code: string;
	description: string;
	hint?: string;
	nested?: boolean;
	expandable?: boolean;
	expanded?: boolean;
	onToggle?: () => void;
	canEdit: boolean;
	onEdit: () => void;
	onDelete: () => void;
}) {
	return (
		<li className={`sr-row${nested ? ' nested' : ''}`}>
			<div className="sr-row-top">
				{expandable && (
					<button
						type="button"
						className="sr-toggle"
						onClick={onToggle}
						aria-label={expanded ? 'Lipat' : 'Bentangkan'}
					>
						{expanded ? '▾' : '▸'}
					</button>
				)}
				{code && <span className="sr-code">{code}</span>}
				{canEdit && (
					<span className="sr-actions">
						<button type="button" aria-label="Edit" title="Edit" onClick={onEdit}>
							<Pencil size={15} />
						</button>
						<button type="button" aria-label="Hapus" title="Hapus" onClick={onDelete}>
							<Trash2 size={15} />
						</button>
					</span>
				)}
			</div>
			<details className="sr-desc">
				<summary>{description}</summary>
				{hint && <small>{hint}</small>}
			</details>
		</li>
	);
}

function RecordEditor({
	courseId,
	editing,
	cplOptions,
	cpmkParentLabel,
	existing,
	onClose,
	onSaved,
}: {
	courseId: string;
	editing: NonNullable<Editing>;
	cplOptions: { id: string; label: string }[];
	cpmkParentLabel?: string;
	existing?: StructuredItem;
	onClose: () => void;
	onSaved: () => void;
}) {
	const collection = editing.collection;
	const [code, setCode] = useState(existing?.code || '');
	const [description, setDescription] = useState(existing?.description || '');
	const [cpl, setCpl] = useState(
		existing && 'cpl' in existing ? (existing as Cpmk).cpl || '' : '',
	);
	const [weight, setWeight] = useState<string>(
		existing && 'weight' in existing
			? (existing as Assessment).weight == null
				? ''
				: String((existing as Assessment).weight)
			: '',
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	const label = LABELS[collection];

	const save = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setBusy(true);
		setError('');
		try {
			const ownerId = pb.authStore.record?.id || '';
			const data: Record<string, unknown> = {
				owner: ownerId,
				course: courseId,
				code: code.trim(),
				description: description.trim(),
			};
			if (collection === 'cpmk') data.cpl = cpl || '';
			if (collection === 'sub_cpmk') data.cpmk = editing.cpmkParent || '';
			if (collection === 'assessments')
				data.weight = weight === '' ? null : Number(weight);

			if (editing.id) await pb.collection(collection).update(editing.id, data);
			else await pb.collection(collection).create(data);
			invalidate(collection);
			onSaved();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<AppModal open onClose={onClose} title={editing.id ? `Edit ${label.singular}` : `Tambah ${label.singular}`}>
			<div className="modal-top">
					<span>{label.singular} / {editing.id ? 'EDIT' : 'BARU'}</span>
					<button type="button" aria-label="Tutup" onClick={onClose}>
						<X size={21} />
					</button>
				</div>
				<h2 id="sr-editor-title">
					{editing.id ? `Edit ${label.singular}` : `Tambah ${label.singular}`}
				</h2>
				{cpmkParentLabel && <p>Bagian dari CPMK: {cpmkParentLabel}</p>}
				<form onSubmit={save} className="editor-form">
					<div className="form-two">
						<label>
							KODE
							<input
								maxLength={40}
								value={code}
								onChange={(e) => setCode(e.target.value)}
								placeholder="mis. CPL-1"
							/>
						</label>
						{collection === 'cpmk' && (
							<label>
								CPL INDUK
								<select value={cpl} onChange={(e) => setCpl(e.target.value)}>
									<option value="">— tidak ditautkan —</option>
									{cplOptions.map((option) => (
										<option key={option.id} value={option.id}>
											{option.label}
										</option>
									))}
								</select>
							</label>
						)}
						{collection === 'assessments' && (
							<label>
								BOBOT (%)
								<input
									type="number"
									min="0"
									max="100"
									value={weight}
									onChange={(e) => setWeight(e.target.value)}
									placeholder="opsional"
								/>
							</label>
						)}
					</div>
					<label>
						DESKRIPSI <span>*</span>
						<textarea
							required
							rows={3}
							maxLength={2000}
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Deskripsi singkat"
						/>
					</label>
					{error && (
						<p className="form-error" role="alert">
							{error}
						</p>
					)}
					<div className="modal-actions">
						<button type="button" className="ld-btn-quiet" onClick={onClose}>
							Batal
						</button>
						<button type="submit" className="ld-btn-primary" disabled={busy}>
							{busy ? <LoaderCircle className="spin" size={18} /> : 'Simpan'}
						</button>
					</div>
				</form>
		</AppModal>
	);
}
