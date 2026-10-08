import { useMemo, useState } from 'react';
import { ChevronDown, Info, Shield, Sparkles } from 'lucide-react';
import {
	ALL_TOGGLEABLE,
	CORE_CAPABILITIES,
	OPTIONAL_CAPABILITIES,
	POLICY_MODE_DESCRIPTION,
	POLICY_MODE_LABEL,
	POLICY_MODE_ORDER,
	capabilityLabel,
	defaultEnabledCapsForLevel,
	prohibitedCapsAtLevel,
	type AiPolicyMode,
} from '@/lib/ai-policy-form';
import type { AssistanceLevel } from '@/lib/ai-policy';
import type { Capability } from '@/lib/ai-capabilities';
import type { ActivityType } from '@/lib/assignments';

/**
 * Phase 3 — lecturer controls for student AI assistance on an assignment.
 *
 * Renders a level selector (Bawaan / Dukungan pembelajaran / Bantuan
 * terbimbing / Mode penilaian / Nonaktif) plus an expandable advanced section
 * of individual capability toggles. The toggles preset to the chosen level's
 * defaults; the lecturer may restrict further or enable optional (restricted)
 * capabilities. Prohibited capabilities at a level are shown disabled.
 *
 * This component is presentational — the parent owns the state and passes
 * `mode`, `enabledCaps`, and change handlers. It never touches the assignment
 * record or the save flow directly.
 */
export function AssignmentAiPolicy({
	mode,
	enabledCaps,
	activityType,
	onModeChange,
	onToggleCap,
}: {
	mode: AiPolicyMode;
	enabledCaps: Set<Capability>;
	activityType: ActivityType | '';
	onModeChange: (mode: AiPolicyMode) => void;
	onToggleCap: (cap: Capability, enabled: boolean) => void;
}) {
	const [advancedOpen, setAdvancedOpen] = useState(false);

	// When a concrete level is active, compute which capabilities are locked
	// (prohibited) at that level so the UI can disable them.
	const level = mode === 'off' || mode === 'default' ? null : (mode as AssistanceLevel);
	const prohibited = useMemo(
		() => (level ? new Set(prohibitedCapsAtLevel(level)) : new Set<Capability>()),
		[level],
	);
	const showToggles = level !== null;

	// The capability count actually enabled (for the summary line).
	const enabledCount = enabledCaps.size;

	return (
		<div className="asg-aipolicy">
			<p className="rps-help">
				Atur berapa banyak bantuan AI yang dapat diterima mahasiswa untuk tugas ini.
				Pengaturan ini mengatur <strong>asisten AI mahasiswa</strong> — apa yang boleh
				dan tidak boleh dilakukannya. Tidak memengaruhi AI dosen, penilaian, rubrik,
				atau riset.
			</p>

			<div className="asg-aipolicy-levels" role="radiogroup" aria-label="Tingkat bantuan AI mahasiswa">
				{POLICY_MODE_ORDER.map((value) => {
					const checked = mode === value;
					const isOff = value === 'off';
					return (
						<label
							key={value}
							className={`asg-shape-card asg-aipolicy-card${checked ? ' checked' : ''}${isOff ? ' danger' : ''}`}
						>
							<input
								type="radio"
								name="assignment-ai-policy-mode"
								checked={checked}
								onChange={() => onModeChange(value)}
							/>
							<strong>
								{value === 'off' ? <Shield size={15} /> : value === 'default' ? <Info size={15} /> : <Sparkles size={15} />}
								{POLICY_MODE_LABEL[value]}
							</strong>
							<span>{POLICY_MODE_DESCRIPTION[value]}</span>
						</label>
					);
				})}
			</div>

			{mode === 'off' && (
				<p className="asg-shape-note">
					<Shield size={13} /> Mahasiswa tidak dapat memakai asisten AI pada tugas ini.
					Cek jawaban (jika aktif) tetap berjalan — itu terpisah dari asisten AI.
				</p>
			)}

			{showToggles && (
				<details
					className="asg-disclosure asg-aipolicy-advanced"
					open={advancedOpen}
					onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
				>
					<summary>
						<Sparkles size={14} /> Pengaturan lanjutan
						<span className="asg-disclosure-count">{enabledCount}</span>
						<ChevronDown size={15} />
					</summary>
					<div className="asg-disclosure-body">
						<p className="rps-help">
							Aktifkan atau nonaktifkan kemampuan individual. Bawaan mengikuti tingkat
							yang dipilih. Kemampuan yang dinonaktifkan tidak dapat diminta mahasiswa;
							kemampuan yang dilarang pada tingkat ini tidak dapat diaktifkan.
						</p>

						<div className="asg-aipolicy-group">
							<h4>Bantuan inti</h4>
							<ul className="asg-aipolicy-toggles">
								{CORE_CAPABILITIES.map((cap) => (
									<CapabilityToggle
										key={cap}
										cap={cap}
										checked={enabledCaps.has(cap)}
										disabled={prohibited.has(cap)}
										onToggle={(enabled) => onToggleCap(cap, enabled)}
									/>
								))}
							</ul>
						</div>

						<div className="asg-aipolicy-group">
							<h4>Bantuan terbatas (opsional)</h4>
							<p className="asg-shape-note">
								<Info size={12} /> Kemampuan ini menghasilkan konten yang sebaiknya
								mahasiswa tulis sendiri. Nonaktif secara bawaan — aktifkan hanya bila
								diperlukan.
							</p>
							<ul className="asg-aipolicy-toggles">
								{OPTIONAL_CAPABILITIES.map((cap) => (
									<CapabilityToggle
										key={cap}
										cap={cap}
										checked={enabledCaps.has(cap)}
										disabled={prohibited.has(cap)}
										onToggle={(enabled) => onToggleCap(cap, enabled)}
									/>
								))}
							</ul>
						</div>

						<div className="asg-aipolicy-reset">
							<button
								type="button"
								className="ld-text-btn"
								onClick={() => {
									if (!level) return;
									const defaults = defaultEnabledCapsForLevel(level);
									// Reset every toggleable cap to its level default.
									for (const cap of ALL_TOGGLEABLE) {
										const want = defaults.has(cap);
										const has = enabledCaps.has(cap);
										if (want !== has) onToggleCap(cap, want);
									}
								}}
							>
								<Sparkles size={13} /> Kembalikan ke bawaan tingkat ini
							</button>
						</div>
					</div>
				</details>
			)}
		</div>
	);
}

function CapabilityToggle({
	cap,
	checked,
	disabled,
	onToggle,
}: {
	cap: Capability;
	checked: boolean;
	disabled: boolean;
	onToggle: (enabled: boolean) => void;
}) {
	return (
		<li>
			<label className={`asg-toggle${disabled ? ' locked' : ''}`}>
				<input
					type="checkbox"
					checked={checked}
					disabled={disabled}
					onChange={(e) => onToggle(e.target.checked)}
				/>
				<span>
					<strong>{capabilityLabel(cap)}</strong>
					{disabled && <small>Dilarang pada tingkat ini</small>}
				</span>
			</label>
		</li>
	);
}
