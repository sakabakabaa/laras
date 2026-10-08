import { Mic, Plus } from 'lucide-react';
import type { SpeakingConfig } from '@/lib/task-types';
import { NumberField, RowActions, ToggleField, newRowId } from '@/components/app/task-builders/builder-shared';

/** Berbicara / role-play: prompt, duration, allowed evidence, rubric. No invented media. */
export function SpeakingBuilder({
	value,
	onChange,
	heading = 'Konfigurasi berbicara',
	lead = 'Prompt lisan, durasi, cara pengumpulan, dan rubrik. Materi tidak dipilih otomatis.',
}: {
	value: SpeakingConfig;
	onChange: (next: SpeakingConfig) => void;
	heading?: string;
	lead?: string;
}) {
	return (
		<div className="tkb-builder">
			<div className="tkb-head">
				<Mic size={16} />
				<div>
					<h3>{heading}</h3>
					<p>{lead}</p>
				</div>
			</div>
			<label className="tkb-num tkb-wide">
				<span>Prompt / skenario *</span>
				<textarea
					rows={3}
					maxLength={5000}
					value={value.prompt}
					onChange={(e) => onChange({ ...value, prompt: e.target.value })}
					placeholder="Tulis prompt atau skenario yang sudah Anda siapkan…"
				/>
			</label>
			<div className="tkb-grid">
				<label className="tkb-num">
					<span>Bahasa</span>
					<input
						maxLength={80}
						value={value.language}
						onChange={(e) => onChange({ ...value, language: e.target.value })}
						placeholder="mis. Jerman / Indonesia"
					/>
				</label>
				<NumberField
					label="Durasi saran"
					value={value.durationMin}
					min={0}
					max={60}
					suffix="menit"
					hint="0 = tanpa saran durasi"
					onChange={(durationMin) => onChange({ ...value, durationMin })}
				/>
			</div>
			<div className="tkb-toggles">
				<ToggleField label="Rekaman audio" checked={value.allowAudio} onChange={(allowAudio) => onChange({ ...value, allowAudio })} />
				<ToggleField label="Rekaman video" checked={value.allowVideo} onChange={(allowVideo) => onChange({ ...value, allowVideo })} />
				<ToggleField label="Tautan" checked={value.allowLink} onChange={(allowLink) => onChange({ ...value, allowLink })} />
			</div>
			<div className="tkb-list-head">
				<h4>Rubrik <span>({value.criteria.length})</span></h4>
				<button
					type="button"
					className="ld-text-btn"
					onClick={() =>
						onChange({ ...value, criteria: [...value.criteria, { id: newRowId('c'), label: '', weight: 1 }] })
					}
				>
					<Plus size={13} /> Tambah kriteria
				</button>
			</div>
			{value.criteria.length === 0 && (
				<p className="tkb-empty">Belum ada kriteria. Tambahkan manual — bobot di sini relatif, bukan bobot RPS.</p>
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
									criteria: value.criteria.map((c, idx) => (idx === i ? { ...c, label: e.target.value } : c)),
								})
							}
							placeholder="mis. Kelancaran"
							aria-label={`Kriteria ${i + 1}`}
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
							onRemove={() => onChange({ ...value, criteria: value.criteria.filter((_, idx) => idx !== i) })}
							labels={{ up: `Naikkan kriteria ${i + 1}`, down: `Turunkan kriteria ${i + 1}`, remove: `Hapus kriteria ${i + 1}` }}
						/>
					</li>
				))}
			</ul>
		</div>
	);
}
