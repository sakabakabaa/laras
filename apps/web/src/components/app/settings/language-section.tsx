import { useState } from 'react';
import { BadgeCheck, Globe, LoaderCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import pb from '@/lib/pocketbase-client';
import { errorMessage, isAbortError } from '@/lib/learning';
import { LANGUAGES, languageOf, type Language } from '@/lib/i18n';

/**
 * Interface language for the signed-in lecturer. Saved to the `users.language`
 * field (faculty may self-update; students may not — their language is
 * lecturer-managed from the roster page). Saving the updated record back into
 * the auth store propagates the new language across the whole app instantly.
 */
export function LanguageSection() {
	const { user } = useAuth();
	const current = languageOf(user);
	const [value, setValue] = useState<Language>(current);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [success, setSuccess] = useState(false);

	const changed = value !== current;

	const save = async () => {
		if (!changed || !user) return;
		setBusy(true);
		setError('');
		setSuccess(false);
		try {
			const updated = await pb.collection('users').update(user.id, { language: value });
			pb.authStore.save(pb.authStore.token, updated);
			setSuccess(true);
		} catch (err) {
			if (!isAbortError(err)) setError(errorMessage(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<section className="ld-panel ld-settings-panel">
			<div className="ld-card-head">
				<div>
					<span className="ld-eyebrow">
						<Globe size={13} /> Bahasa antarmuka
					</span>
					<h2>Bahasa</h2>
				</div>
			</div>
			<p className="ld-settings-lede">
				Pilih bahasa tampilan ruang kerja Anda. Pilihan ini disimpan ke akun Anda dan
				diterapkan di seluruh antarmuka dosen.
			</p>

			<div className="ld-settings-pref">
				<div className="ld-settings-pref-icon">
					<Globe size={18} />
				</div>
				<div className="ld-settings-pref-body">
					<strong>Bahasa saat ini</strong>
					<span>{LANGUAGES.find((l) => l.code === value)?.native}</span>
				</div>
				<div className="ld-settings-seg" role="group" aria-label="Bahasa antarmuka">
					{LANGUAGES.map((l) => (
						<button
							key={l.code}
							type="button"
							className={value === l.code ? 'active' : ''}
							onClick={() => {
								setValue(l.code);
								setSuccess(false);
							}}
							aria-pressed={value === l.code}
						>
							{l.native}
						</button>
					))}
				</div>
			</div>

			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
			{success && (
				<p className="ld-settings-success">
					<BadgeCheck size={14} /> Bahasa berhasil disimpan.
				</p>
			)}

			<div className="ld-settings-actions">
				<button
					type="button"
					className="ld-btn-primary"
					onClick={() => void save()}
					disabled={busy || !changed}
				>
					{busy ? <LoaderCircle size={16} className="spin" /> : null}
					Simpan bahasa
				</button>
			</div>

			<p className="ld-settings-note">
				<Globe size={13} /> Bahasa berlaku untuk antarmuka dosen Anda. Bahasa dashboard
				mahasiswa diatur oleh dosen pada halaman daftar mahasiswa.
			</p>
		</section>
	);
}
