import { useRef, type ReactNode } from 'react';
import { FormStepper } from '@/components/form-stepper';
import { WorksheetArt } from '@/components/app/worksheet-art';
import { useT } from '@/lib/i18n';
import {
	ArrowLeft,
	ArrowRight,
	Bold,
	BookOpen,
	CheckCircle2,
	ClipboardList,
	Clock3,
	Copy,
	FileText,
	Heading2,
	Info,
	Italic,
	Languages,
	Lightbulb,
	Link2,
	List,
	ListChecks,
	ListOrdered,
	LoaderCircle,
	MessageCircle,
	Save,
	Sparkles,
	Target,
	Underline,
	UploadCloud,
	Users,
	X,
} from 'lucide-react';
import type { WorksheetBrief } from '@/lib/worksheet-brief';

export type SheetBadge = { label: string; tone?: 'green' | 'blue' | 'neutral' };
export type SheetMaterial = {
	title: string;
	meta: string;
	href?: string;
	kind?: 'pdf' | 'audio' | 'link' | 'video' | 'file';
};
export type SheetInfo = { label: string; value: string };

const STEP_LABELS = ['Identitas', 'Jawaban', 'Periksa jawaban', 'Kirim'] as const;

/**
 * Student answer sheet chrome shared by enrolled tasks and public links.
 * It only lays out the existing draft / Cek jawaban / submit actions — it
 * does not grade, publish, or store a second submission.
 */
export function StudentAnswerSheet({
	onBack,
	backLabel = 'Kembali',
	badges,
	title,
	description,
	instructions,
	materials,
	info,
	access,
	formative,
	step,
	onStep,
	hideSubmitStep,
	workspace,
	prepare,
	identity,
	answer,
	review,
	reviewAside,
	result,
	tips,
	draftStatus,
	busy,
	error,
	onSaveDraft,
	onPrimary,
	primaryLabel,
	primaryDisabled,
	courseLabel,
	task,
	requirements,
	statusLabel,
	statusTone,
	assistant,
	brief,
	metaPills,
	languageLabel,
}: {
	onBack?: () => void;
	backLabel?: string;
	badges: SheetBadge[];
	title: string;
	description?: string;
	instructions: string[];
	materials: SheetMaterial[];
	info: SheetInfo[];
	access?: { code?: string; note: string; onCopy?: () => void; copied?: boolean };
	/** Prominent lecturer evaluation (grade + feedback) shown once work is submitted. */
	result?: ReactNode;
	formative: boolean;
	step: number;
	onStep: (step: number) => void;
	hideSubmitStep?: boolean;
	/** Full-screen student workspace: answer stays visible beside the AI panel. */
	workspace?: boolean;
	/** Speaking flow: Persiapan sits between identity and the recorder. */
	prepare?: ReactNode;
	identity: ReactNode;
	answer: ReactNode;
	review: ReactNode;
	/** Replaces the info sidebar on the check step (AI results). */
	reviewAside?: ReactNode;
	tips: string[];
	draftStatus?: string;
	busy?: boolean;
	error?: string;
	onSaveDraft?: () => void;
	onPrimary?: () => void;
	primaryLabel: string;
	primaryDisabled?: boolean;
	/** Course name shown as the worksheet eyebrow. */
	courseLabel?: string;
	/** The task description ("what to do"), shown as its own scannable section. */
	task?: string;
	/** The submission requirements / criteria, shown as a checkmark list. */
	requirements?: string;
	/** Concise submission status shown in the header pill. */
	statusLabel?: string;
	statusTone?: 'idle' | 'draft' | 'submitted' | 'graded' | 'revision' | 'late' | 'closed';
	/** Student Learning Assistant panel rendered in the side rail. */
	assistant?: ReactNode;
	/** Scannable summary derived from existing assignment text. Presentation only. */
	brief?: WorksheetBrief | null;
	metaPills?: string[];
	/** Task language, shown as compact header metadata — not a second instruction. */
	languageLabel?: string;
}) {
	const t = useT();
	const speaking = Boolean(prepare);
	const focused = Boolean(workspace && brief);
	const deadlineFact = info.find((row) => row.label === 'Batas waktu');
	const steps = speaking
		? (['Identitas', 'Persiapan', 'Rekam', 'Periksa jawaban', 'Kirim'] as const)
		: hideSubmitStep
			? STEP_LABELS.slice(0, 3)
			: STEP_LABELS;
	const visibleStep = !speaking && hideSubmitStep && step === 4 ? 3 : step;
	const checkStep = speaking ? 4 : 3;
	const sendStep = steps.length;
	const answerStep = speaking ? 3 : 2;
	// Full-screen non-speaking work is one sheet: no identity step, no stepper card.
	const flat = Boolean(workspace);
	const showAnswer = flat || visibleStep === answerStep || Boolean(workspace && visibleStep === checkStep);
	const sideReview = Boolean((flat || visibleStep === checkStep) && reviewAside);
	const stepAdvance = /^(Lanjut|Cek jawaban|Tinjau pengumpulan)$/.test(primaryLabel);
	const stepper = !flat ? (
		<div className={workspace ? 'sas-step-row' : undefined}>
			<FormStepper
				ariaLabel="Tahapan pengerjaan"
				current={visibleStep}
				steps={steps.map((label, i) => ({ id: i + 1, label }))}
				canSelect={() => true}
				onSelect={(id) => onStep(id)}
			/>
		</div>
	) : null;

	return (
		<section className={`sas${workspace ? ' sas-workspace' : ''}`} aria-label="Lembar jawaban">
			{workspace ? stepper : null}
			<div className="sas-main">
				{onBack && !workspace && (
					<button type="button" className="sas-back" onClick={onBack}>
						<ArrowLeft size={15} /> {backLabel}
					</button>
				)}
				{workspace && onBack && (
					<button type="button" className="sas-back sas-back-inline" onClick={onBack}>
						<ArrowLeft size={15} /> {backLabel}
					</button>
				)}
				{!focused && (
				<div className="sas-badges">
					{badges.map((badge) => (
						<span key={badge.label} className={`sas-badge${badge.tone ? ` ${badge.tone}` : ''}`}>
							{badge.label}
						</span>
					))}
				</div>
				)}
				{focused ? (
					<header className="ws-head">
						<span className="ws-head-mark" aria-hidden="true">
							<FileText size={18} />
						</span>
						<div className="ws-head-copy">
							<h1>{title}</h1>
							<div className="ws-pills">
								{(metaPills || []).map((pill) => (
									<span key={pill}>{pill}</span>
								))}
							</div>
						</div>
						<div className="ws-head-meta">
							{statusLabel && (
								<span className={`sas-status-pill${statusTone ? ` ${statusTone}` : ''}`}>
									<span className="sas-status-dot" aria-hidden="true" />
									{statusLabel}
								</span>
							)}
							{deadlineFact && (
								<span>
									<Clock3 size={13} /> {deadlineFact.value}
								</span>
							)}
							{languageLabel && (
								<span>
									<Languages size={13} /> {languageLabel}
								</span>
							)}
						</div>
					</header>
				) : (
				<div className="sas-header">
					<div className="sas-header-title">
						{courseLabel && <span className="sas-header-eyebrow">{courseLabel}</span>}
						<h1>{title}</h1>
					</div>
					{(statusLabel || !workspace) && (
						<div className="sas-header-status">
							{statusLabel && (
								<span className={`sas-status-pill${statusTone ? ` ${statusTone}` : ''}`}>
									<span className="sas-status-dot" aria-hidden="true" />
									{statusLabel}
								</span>
							)}
							{!workspace && (
								<span className="sas-header-kind">
									{formative ? 'Latihan formatif' : 'Tugas formal'}
								</span>
							)}
						</div>
					)}
				</div>
				)}
				{description && !workspace && <p className="sas-header-desc">{description}</p>}

				{speaking && visibleStep === 1 && (
					<p className="spk-flow-note">
						Tugas berbicara: rekam suara kamu. Arahan ada di langkah Persiapan — bukan catatan internal dosen.
					</p>
				)}

				{result && (
					<div className="sas-result" role="status">{result}</div>
				)}

				{focused && brief && (
					<section className="ws-task" aria-label="Tugas kamu">
						<div className="ws-task-copy">
							<h2>
								<Target size={16} /> {t('worksheet.taskForYou')}
							</h2>
							<p>{brief.summary}</p>
							{speaking && (
								<p className="ws-task-note">Rekam jawaban lisan, atau unggah berkas yang didukung.</p>
							)}
						</div>
						<span className="ws-task-art" aria-hidden="true">
							<WorksheetArt name={speaking ? 'speaking' : 'writing'} size="lg" />
						</span>
					</section>
				)}
				{focused && brief && brief.chips.length > 0 && (
					<section className="ws-must" aria-label={t(speaking ? 'worksheet.speakingRequirements' : 'worksheet.answerRequirements')}>
						<div className="ws-must-head">
						<h2>
							<ListChecks size={15} /> {t(speaking ? 'worksheet.speakingRequirements' : 'worksheet.answerRequirements')}
						</h2>
						<WorksheetArt name="checklist" size="sm" />
						</div>
						<ul>
							{brief.chips.map((chip, index) => {
								const Icon = [MessageCircle, FileText, Users, BookOpen][index % 4];
								return (
									<li key={chip.id} title={chip.detail}>
										<span className={`ws-must-ico tone-${index % 4}`} aria-hidden="true">
											<Icon size={16} />
										</span>
										<strong>{chip.label}</strong>
										<small>{chip.detail}</small>
									</li>
								);
							})}
						</ul>
					</section>
				)}
				{task && !speaking && !focused && (
					<section className="sas-section sas-task" aria-label="Tugas">
						<h2>
							<FileText size={16} /> Tugas
						</h2>
						<p className="sas-task-text">{task}</p>
					</section>
				)}
				{requirements && !speaking && !focused && (
					<section className="sas-section sas-requirements" aria-label="Ketentuan">
						<h2>
							<ListChecks size={16} /> Ketentuan
						</h2>
						<ul className="sas-req-list">
							{instructionLines(requirements, 'Ikuti ketentuan pengumpulan dari dosen.').map((line) => (
								<li key={line}>
									<span className="sas-req-check" aria-hidden="true">
										<CheckCircle2 size={13} />
									</span>
									{line}
								</li>
							))}
						</ul>
					</section>
				)}
				{instructions.length > 0 && !speaking && !task && !requirements && !focused && (
					<div className="sas-card soft">
						<h2>
							<ClipboardList size={16} /> Instruksi tugas
						</h2>
						<ol className="sas-steps-list">
							{instructions.map((line, i) => (
								<li key={line}>
									<span>{i + 1}</span>
									{line}
								</li>
							))}
						</ol>
					</div>
				)}

				{materials.length > 0 && !workspace && (
					<div className="sas-card">
						<h2>
							<FileText size={16} /> Materi pendukung
						</h2>
						<ul className="sas-materials">
							{materials.map((item) => (
								<li key={`${item.title}-${item.meta}`}>
									<span className={`sas-mat-ico ${item.kind || 'file'}`}>
										{item.kind === 'link' ? <Link2 size={15} /> : <FileText size={15} />}
									</span>
									<div>
										<strong>{item.title}</strong>
										<small>{item.meta}</small>
									</div>
									{item.href ? (
										<a href={item.href} target="_blank" rel="noreferrer">
											Buka
										</a>
									) : null}
								</li>
							))}
						</ul>
					</div>
				)}

				{!workspace ? stepper : null}

				<div className="sas-panel">
					<div hidden={flat || visibleStep !== 1}>{identity}</div>
					{speaking && <div hidden={visibleStep !== 2}>{prepare}</div>}
					<div hidden={!showAnswer}>{answer}</div>
					<div hidden={visibleStep !== checkStep || Boolean(workspace)}>{review}</div>
					{visibleStep === sendStep && !hideSubmitStep && (
						<div className="sas-confirm">
							<CheckCircle2 size={18} />
							<div>
								<strong>
									{formative
										? 'Latihan ini tidak dikumpulkan sebagai nilai.'
										: 'Siap mengumpulkan versi terakhir?'}
								</strong>
								<p>
									{formative
										? 'Cek jawaban dan panduan AI hanya formatif. Nilai resmi hanya ada pada tugas formal.'
										: 'Setelah terkirim, Cek jawaban ditutup dan hasil menunggu penilaian dosen. Tidak ada nilai yang terbit otomatis.'}
								</p>
							</div>
						</div>
					)}
				</div>

				{materials.length > 0 && workspace && (
					<div className="sas-card">
						<h2>
							<FileText size={16} /> Materi pendukung
						</h2>
						<ul className="sas-materials">
							{materials.map((item) => (
								<li key={`${item.title}-${item.meta}`}>
									<span className={`sas-mat-ico ${item.kind || 'file'}`}>
										{item.kind === 'link' ? <Link2 size={15} /> : <FileText size={15} />}
									</span>
									<div>
										<strong>{item.title}</strong>
										<small>{item.meta}</small>
									</div>
									{item.href ? (
										<a href={item.href} target="_blank" rel="noreferrer">
											Buka
										</a>
									) : null}
								</li>
							))}
						</ul>
					</div>
				)}

				{focused && brief?.fullText && (
					<details className="ws-full">
						<summary>
							<FileText size={15} /> Lihat petunjuk lengkap
						</summary>
						<p>{brief.fullText}</p>
						{brief.sections.length > 0 && (
							<ol className="ws-full-sections">
								{brief.sections.map((section) => (
									<li key={section.title}>
										<strong>{section.title}</strong>
										<span>{section.body}</span>
									</li>
								))}
							</ol>
						)}
					</details>
				)}

				{error && (
					<p className="form-error" role="alert">
						{error}
					</p>
				)}

				<footer className="sas-foot" hidden={focused && !onSaveDraft && stepAdvance}>
					<span className={`sas-draft${busy ? ' saving' : ''}`} aria-live="polite">
						{busy ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />}{' '}
						{busy ? 'Menyimpan…' : draftStatus || 'Belum ada draf tersimpan'}
					</span>
					<div>
						{onSaveDraft && (
							<button type="button" className="sas-btn ghost" onClick={onSaveDraft} disabled={busy}>
								{busy ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />} Simpan draf
							</button>
						)}
						{onPrimary && !(flat && stepAdvance) && (
						<button
						type="button"
						className="sas-btn primary"
						disabled={primaryDisabled || busy}
						onClick={onPrimary}
					>
						{primaryLabel} <ArrowRight size={15} />
					</button>
						)}
					</div>
				</footer>
			</div>

			<aside className="sas-side">
				{workspace && (
					<div className="sas-ai-rail" aria-label="Bantuan AI">
						<span className="sas-ai-rail-label">
							<Sparkles size={14} /> Bantuan AI
						</span>
						<div id="sas-review-portal" className="sas-review-portal" />
					</div>
				)}
				{!workspace && <div id="sas-review-portal" className="sas-review-portal" />}
				{assistant}
				<details className={`sas-card sas-info-card${workspace ? ' collapsible' : ''}`} open={!workspace} hidden={sideReview && !workspace}>
					<summary className="sas-info-summary">
						<Info size={16} /> Informasi tugas
					</summary>
					<dl className="sas-info">
						{info.map((row) => (
							<div key={row.label}>
								<dt>{row.label}</dt>
								<dd>{row.value}</dd>
							</div>
						))}
					</dl>
				</details>
				{focused && (
					<div className="ws-before">
						<div className="ws-before-head">
						<h2>
							<CheckCircle2 size={15} /> Sebelum mengirim
						</h2>
						<WorksheetArt name="books" size="sm" />
						</div>
						<ol>
							{tips.slice(0, 4).map((tip, index) => (
								<li key={tip}>
									<span>{index + 1}</span>
									{tip}
								</li>
							))}
						</ol>
					</div>
				)}
				{sideReview ? <div className="spk-ai-slot">{reviewAside || review}</div> : null}

				{access && !sideReview && !workspace && (
					<div className="sas-card blush">
						<h2>
							<Info size={16} /> Simpan akses pengerjaan
						</h2>
						<p>{access.note}</p>
						{access.code ? (
							<div className="sas-code">
								<code>{access.code}</code>
								<button type="button" onClick={access.onCopy}>
									<Copy size={13} /> {access.copied ? 'Tersalin' : 'Salin'}
								</button>
							</div>
						) : null}
					</div>
				)}

				{!workspace && (
				<div className="sas-card" hidden={sideReview}>
					<h2>
						<Lightbulb size={16} /> Tips mengerjakan
					</h2>
					<ul className="sas-tips">
						{tips.map((tip) => (
							<li key={tip}>{tip}</li>
						))}
					</ul>
				</div>
				)}
			</aside>
		</section>
	);
}

export function AnswerEditor({
	value,
	onChange,
	placeholder,
	maxLength = 10000,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	maxLength?: number;
}) {
	const ref = useRef<HTMLTextAreaElement>(null);
	const wrap = (before: string, after = before) => {
		const el = ref.current;
		if (!el) return;
		const start = el.selectionStart;
		const end = el.selectionEnd;
		const next = value.slice(0, start) + before + value.slice(start, end) + after + value.slice(end);
		onChange(next.slice(0, maxLength));
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(start + before.length, end + before.length);
		});
	};
	const words = value.trim() ? value.trim().split(/\s+/).length : 0;
	return (
		<div className="sas-editor">
			<div className="sas-toolbar" role="toolbar" aria-label="Format jawaban">
				<span>Normal</span>
				<button type="button" aria-label="Tebal" onClick={() => wrap('**')}>
					<Bold size={14} />
				</button>
				<button type="button" aria-label="Miring" onClick={() => wrap('*')}>
					<Italic size={14} />
				</button>
				<button type="button" aria-label="Garis bawah" onClick={() => wrap('<u>', '</u>')}>
					<Underline size={14} />
				</button>
				<button type="button" aria-label="Judul" onClick={() => wrap('\n## ', '\n')}>
					<Heading2 size={14} />
				</button>
				<button type="button" aria-label="Daftar" onClick={() => wrap('\n- ')}>
					<List size={14} />
				</button>
				<button type="button" aria-label="Daftar bernomor" onClick={() => wrap('\n1. ')}>
					<ListOrdered size={14} />
				</button>
			</div>
			<textarea
				ref={ref}
				rows={8}
				maxLength={maxLength}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
			/>
			<small>
				{words} / 1000 kata
			</small>
		</div>
	);
}

export function AttachmentDrop({
	files,
	onAdd,
	onRemove,
	hint,
}: {
	files: { key: string; name: string; href?: string }[];
	onAdd: (list: FileList | null) => void;
	onRemove: (key: string) => void;
	hint: string;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	return (
		<div className="sas-attach">
			<span>
				<Link2 size={14} /> Lampiran (opsional)
			</span>
			<button type="button" className="sas-drop" onClick={() => inputRef.current?.click()}>
				<UploadCloud size={18} />
				<strong>Klik untuk mengunggah file</strong>
				<small>{hint}</small>
			</button>
			<input
				ref={inputRef}
				type="file"
				multiple
				hidden
				onChange={(e) => {
					onAdd(e.target.files);
					e.target.value = '';
				}}
			/>
			{files.length > 0 && (
				<div className="sas-file-row">
					{files.map((file) => (
						<span key={file.key}>
							{file.href ? (
								<a href={file.href} target="_blank" rel="noreferrer">
									{file.name}
								</a>
							) : (
								file.name
							)}
							<button type="button" aria-label={`Hapus ${file.name}`} onClick={() => onRemove(file.key)}>
								<X size={12} />
							</button>
						</span>
					))}
				</div>
			)}
		</div>
	);
}

/** Split lecturer instructions into short numbered lines for the sheet. */
export function instructionLines(text: string, fallback: string) {
	const parts = text
		.split(/\n+|(?<=\.)\s+/)
		.map((line) => line.trim())
		.filter(Boolean)
		.slice(0, 6);
	return parts.length ? parts : [fallback];
}

