import { FileText, ListOrdered, PenLine, Plus, Trash2 } from 'lucide-react';
import type { WritingConfig } from '@/lib/task-types';
import { NumberField, RowActions, ToggleField, newRowId } from '@/components/app/task-builders/builder-shared';

/**
 * Menulis builder: prompt, format, language, length guidance, rubric criteria,
 * and which submission formats (direct text, document, photos) are allowed.
 */
export function WritingBuilder({
	value,
	onChange,
}: {
	value: WritingConfig;
	onChange: (next: WritingConfig) => void;
}) {
	const addCriterion = () => {
		onChange({ ...value, criteria: [...value.criteria, { id: newRowId('c'), label: '', weight: 1 }] });
	};

	const addQuestion = () => {
		onChange({
			...value,
			questions: [
				...value.questions,
				{ id: newRowId('wq'), prompt: '', guidance: '', minWords: 0, maxWords: 0 },
			],
		});
	};
	const setQuestion = (i: number, patch: Partial<WritingConfig['questions'][number]>) => {
		onChange({
			...value,
			questions: value.questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q)),
		});
	};
	const moveQuestion = (i: number, dir: -1 | 1) => {
		onChange({
			...value,
			questions: (() => {
				const next = [...value.questions];
				const j = i + dir;
				if (j < 0 || j >= next.length) return next;
				[next[i], next[j]] = [next[j], next[i]];
				return next;
			})(),
		});
	};
	const removeQuestion = (i: number) => {
		onChange({ ...value, questions: value.questions.filter((_, idx) => idx !== i) });
	};

	return (
		<div className="tkb-builder">
			<div className="tkb-head">
				<PenLine size={16} />
				<div>
					<h3>Konfigurasi menulis</h3>
					<p>Prompt, panduan format, rubrik penilaian, dan format pengumpulan yang diizinkan.</p>
				</div>
			</div>

			<label className="tkb-num tkb-wide">
				<span>Prompt / instruksi menulis *</span>
				<textarea
					rows={3}
					maxLength={5000}
					value={value.prompt}
					onChange={(e) => onChange({ ...value, prompt: e.target.value })}
					placeholder="mis. Tulis esai argumentatif 500–700 kata tentang topik pertemuan ini…"
				/>
			</label>

			<div className="tkb-grid">
				<label className="tkb-num">
					<span>Bahasa</span>
					<input
						maxLength={80}
						value={value.language}
						onChange={(e) => onChange({ ...value, language: e.target.value })}
						placeholder="mis. Indonesia / English / bebas"
					/>
					<small>Panduan bahasa untuk mahasiswa (teks bebas).</small>
				</label>
				<NumberField
					label="Panjang minimal"
					value={value.minWords}
					min={0}
					max={10000}
					suffix="kata"
					hint="0 = tanpa batas bawah"
					onChange={(minWords) => onChange({ ...value, minWords })}
				/>
				<NumberField
					label="Panjang maksimal"
					value={value.maxWords}
					min={0}
					max={20000}
					suffix="kata"
					hint="0 = tanpa batas atas"
					onChange={(maxWords) => onChange({ ...value, maxWords })}
				/>
			</div>

			<label className="tkb-num tkb-wide">
				<span>Panduan format &amp; gaya</span>
				<textarea
					rows={3}
					maxLength={5000}
					value={value.formatGuidance}
					onChange={(e) => onChange({ ...value, formatGuidance: e.target.value })}
					placeholder="mis. Esai dengan struktur pembuka–isi–penutup, sitasi gaya APA bila memakai rujukan…"
				/>
			</label>

			<div className="tkb-list-head">
				<h4>
					<ListOrdered size={14} /> Pertanyaan / blok jawaban <span>({value.questions.length})</span>
				</h4>
				<button type="button" className="ld-text-btn" onClick={addQuestion}>
					<Plus size={13} /> Tambah pertanyaan
				</button>
			</div>
			<p className="tkb-empty">
				Tambahkan beberapa blok pertanyaan bila mahasiswa harus menjawab lebih dari satu hal
				secara terpisah dalam satu tugas. Setiap blok punya prompt dan panduan sendiri; mahasiswa
				menjawab semua blok lalu mengumpulkan sekali. Kosongkan bila tugas hanya satu tulisan.
			</p>
			{value.questions.length > 0 && (
				<ol className="tkb-questions">
					{value.questions.map((question, i) => (
						<li key={question.id} className="tkb-question">
							<div className="tkb-question-head">
								<span className="tkb-question-num">{i + 1}</span>
								<RowActions
									index={i}
									count={value.questions.length}
									onMove={(dir) => moveQuestion(i, dir)}
									onRemove={() => removeQuestion(i)}
									labels={{
										up: `Naikkan pertanyaan ${i + 1}`,
										down: `Turunkan pertanyaan ${i + 1}`,
										remove: `Hapus pertanyaan ${i + 1}`,
									}}
								/>
							</div>
							<label className="tkb-num tkb-wide">
								<span>Prompt pertanyaan *</span>
								<textarea
									rows={2}
									maxLength={3000}
									value={question.prompt}
									onChange={(e) => setQuestion(i, { prompt: e.target.value })}
									placeholder="mis. Jelaskan argumen utama yang menurut Anda paling kuat…"
								/>
							</label>
							<label className="tkb-num tkb-wide">
								<span>Panduan / kriteria penilaian (opsional)</span>
								<textarea
									rows={2}
									maxLength={3000}
									value={question.guidance}
									onChange={(e) => setQuestion(i, { guidance: e.target.value })}
									placeholder="mis. Minimal 120 kata, fokus pada satu argumen dengan satu bukti…"
								/>
							</label>
							<div className="tkb-grid">
								<NumberField
									label="Panjang minimal"
									value={question.minWords}
									min={0}
									max={10000}
									suffix="kata"
									hint="0 = ikut batas tugas"
									onChange={(minWords) => setQuestion(i, { minWords })}
								/>
								<NumberField
									label="Panjang maksimal"
									value={question.maxWords}
									min={0}
									max={20000}
									suffix="kata"
									hint="0 = ikut batas tugas"
									onChange={(maxWords) => setQuestion(i, { maxWords })}
								/>
							</div>
						</li>
					))}
				</ol>
			)}

			<div className="tkb-list-head">
				<h4>
					Rubrik penilaian <span>({value.criteria.length})</span>
				</h4>
				<button type="button" className="ld-text-btn" onClick={addCriterion}>
					<Plus size={13} /> Tambah kriteria
				</button>
			</div>
			{value.criteria.length === 0 && (
				<p className="tkb-empty">
					Belum ada kriteria rubrik. Tambahkan manual — misalnya diambil dari komponen penilaian RPS
					yang sudah tersimpan (salin labelnya; bobot rubrik ini relatif antar kriteria, bukan bobot RPS).
				</p>
			)}
			<ul className="tkb-criteria">
				{value.criteria.map((criterion, i) => (
					<li key={criterion.id} className="tkb-criterion">
						<input
							maxLength={200}
							value={criterion.label}
							onChange={(e) =>
								onChange({
									...value,
									criteria: value.criteria.map((c, idx) =>
										idx === i ? { ...c, label: e.target.value } : c,
									),
								})
							}
							placeholder="mis. Kejelasan argumen"
							aria-label={`Kriteria rubrik ${i + 1}`}
						/>
						<NumberField
							label="Bobot relatif"
							value={criterion.weight}
							min={0}
							max={100}
							onChange={(weight) =>
								onChange({
									...value,
									criteria: value.criteria.map((c, idx) => (idx === i ? { ...c, weight } : c)),
								})
							}
						/>
						<RowActions
							index={i}
							count={value.criteria.length}
							onMove={(dir) =>
								onChange({
									...value,
									criteria: (() => {
										const next = [...value.criteria];
										const j = i + dir;
										if (j < 0 || j >= next.length) return next;
										[next[i], next[j]] = [next[j], next[i]];
										return next;
									})(),
								})
							}
							onRemove={() =>
								onChange({ ...value, criteria: value.criteria.filter((_, idx) => idx !== i) })
							}
							labels={{
								up: `Naikkan kriteria ${i + 1}`,
								down: `Turunkan kriteria ${i + 1}`,
								remove: `Hapus kriteria ${i + 1}`,
							}}
						/>
					</li>
				))}
			</ul>

			<div className="tkb-list-head">
				<h4>Format pengumpulan yang diizinkan</h4>
			</div>
			<div className="tkb-toggles tkb-formats">
				<ToggleField
					label="Teks langsung"
					hint="Mahasiswa menulis di aplikasi"
					checked={value.allowText}
					onChange={(allowText) => onChange({ ...value, allowText })}
				/>
				<ToggleField
					label="Dokumen"
					hint="PDF/DOCX dan sejenisnya"
					checked={value.allowDocument}
					onChange={(allowDocument) => onChange({ ...value, allowDocument })}
				/>
				<ToggleField
					label="Foto tulisan tangan"
					hint="Kamera/unggah gambar, bisa diurutkan"
					checked={value.allowPhotos}
					onChange={(allowPhotos) => onChange({ ...value, allowPhotos })}
				/>
			</div>
			{!value.allowText && !value.allowDocument && !value.allowPhotos && (
				<p className="tkb-warn">
					<FileText size={12} /> Pilih minimal satu format pengumpulan.
				</p>
			)}
		</div>
	);
}
