import { useCallback, useEffect, useState } from 'react';
import { Cpu, LoaderCircle, Plus, Trash2, Zap } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { errorMessage, isAbortError } from '@/lib/learning';

type Capabilities = { tools?: boolean; vision?: boolean; json?: boolean; streaming?: boolean };

type Provider = {
	id: string;
	label: string;
	kind: string;
	baseUrl: string;
	models: string[];
	capabilities: Capabilities;
	enabled: boolean;
	isDefault: boolean;
	keyMasked: string;
};

type Preference = { id: string; surface: string; provider: string; model: string };

type Surface = { id: string; label: string; requires: string[] };

const authHeaders = () => ({
	'Content-Type': 'application/json',
	Authorization: `Bearer ${pb.authStore.token}`,
});

const errorText = (data: unknown, fallback: string) =>
	typeof (data as { error?: unknown })?.error === 'string' ? String((data as { error: string }).error) : fallback;

/**
 * Phase 1 — per-lecturer model providers.
 *
 * A lecturer registers their own [OI]-compatible provider, tests it, and picks
 * which provider+model serves each surface. Keys are write-only: the list shows
 * a masked `last4` and no response ever returns the secret.
 */
export function AiModelSection() {
	const [providers, setProviders] = useState<Provider[]>([]);
	const [preferences, setPreferences] = useState<Preference[]>([]);
	const [surfaces, setSurfaces] = useState<Surface[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [busy, setBusy] = useState('');
	const [adding, setAdding] = useState(false);
	const [form, setForm] = useState({ label: '', baseUrl: 'https://router.hostinger.com/v1', models: '', apiKey: '', isDefault: false });

	const load = useCallback(async () => {
		setLoading(true);
		setError('');
		try {
			const res = await fetch('/api/ai-providers', { headers: authHeaders() });
			const data = (await res.json()) as { providers?: Provider[]; preferences?: Preference[]; surfaces?: Surface[]; error?: string };
			if (!res.ok) throw new Error(errorText(data, 'Gagal memuat model AI.'));
			setProviders(data.providers || []);
			setPreferences(data.preferences || []);
			setSurfaces(data.surfaces || []);
		} catch (err) {
			if (!isAbortError(err)) setError(errorMessage(err));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const create = async () => {
		setBusy('create');
		setError('');
		setNotice('');
		try {
			const res = await fetch('/api/ai-providers', {
				method: 'POST',
				headers: authHeaders(),
				body: JSON.stringify({
					label: form.label,
					baseUrl: form.baseUrl,
					models: form.models.split(',').map((model) => model.trim()).filter(Boolean),
					apiKey: form.apiKey,
					isDefault: form.isDefault,
				}),
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) throw new Error(errorText(data, 'Gagal menyimpan provider.'));
			setForm({ label: '', baseUrl: 'https://router.hostinger.com/v1', models: '', apiKey: '', isDefault: false });
			setAdding(false);
			setNotice('Provider tersimpan. Kunci API tidak akan ditampilkan lagi.');
			await load();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy('');
		}
	};

	const remove = async (provider: Provider) => {
		if (!window.confirm(`Hapus provider "${provider.label}"? Preferensi yang memakainya juga dihapus.`)) return;
		setBusy(provider.id);
		setError('');
		try {
			const res = await fetch(`/api/ai-providers?id=${encodeURIComponent(provider.id)}`, { method: 'DELETE', headers: authHeaders() });
			const data = (await res.json()) as { error?: string };
			if (!res.ok) throw new Error(errorText(data, 'Gagal menghapus provider.'));
			await load();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy('');
		}
	};

	const test = async (provider: Provider) => {
		setBusy(`test-${provider.id}`);
		setError('');
		setNotice('');
		try {
			const res = await fetch('/api/ai-providers-test', {
				method: 'POST',
				headers: authHeaders(),
				body: JSON.stringify({ providerId: provider.id, model: provider.models[0] }),
			});
			const data = (await res.json()) as { error?: string; model?: string; latencyMs?: number };
			if (!res.ok) throw new Error(errorText(data, 'Koneksi gagal.'));
			setNotice(`Terhubung: ${data.model} · ${data.latencyMs} ms`);
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy('');
		}
	};

	const choose = async (surface: Surface, providerId: string) => {
		const provider = providers.find((entry) => entry.id === providerId);
		if (!provider) return;
		const model = provider.models[0];
		setBusy(`pref-${surface.id}`);
		setError('');
		try {
			const res = await fetch('/api/ai-model-prefs', {
				method: 'POST',
				headers: authHeaders(),
				body: JSON.stringify({ surface: surface.id, providerId, model }),
			});
			const data = (await res.json()) as { error?: string };
			if (!res.ok) throw new Error(errorText(data, 'Gagal menyimpan pilihan.'));
			setNotice(`Model untuk ${surface.label} disimpan.`);
			await load();
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy('');
		}
	};

	const preferenceFor = (surfaceId: string) => preferences.find((entry) => entry.surface === surfaceId);

	return (
		<section className="ld-panel ld-settings-panel">
			<div className="ld-card-head">
				<div>
					<span className="ld-eyebrow">
						<Cpu size={13} /> Model AI
					</span>
					<h2>Provider model</h2>
				</div>
				<button type="button" className="ld-btn ld-btn-ghost" onClick={() => setAdding((value) => !value)}>
					<Plus size={14} /> Tambah provider
				</button>
			</div>
			<p className="ld-settings-lede">
				Hubungkan provider [OI]-compatible milik Anda dan pilih model untuk tiap bagian aplikasi. Kunci API disimpan
				terenkripsi di server dan tidak pernah ditampilkan kembali.
			</p>

			{error && <p className="ld-settings-error">{error}</p>}
			{notice && <p className="ld-settings-note">{notice}</p>}

			{adding && (
				<div className="ld-settings-form">
					<label>
						Nama provider
						<input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="Contoh: Router kampus" />
					</label>
					<label>
						Base URL
						<input value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://…/v1" />
					</label>
					<label>
						Model (pisahkan dengan koma)
						<input value={form.models} onChange={(event) => setForm({ ...form, models: event.target.value })} placeholder="gpt-6-luna, gpt-6-mini" />
					</label>
					<label>
						Kunci API
						<input type="password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder="disimpan terenkripsi" autoComplete="off" />
					</label>
					<label className="ld-settings-check">
						<input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />
						Jadikan provider bawaan
					</label>
					<button type="button" className="ld-btn ld-btn-primary" disabled={busy === 'create'} onClick={() => void create()}>
						{busy === 'create' ? <LoaderCircle size={14} className="spin" /> : null} Simpan provider
					</button>
				</div>
			)}

			{loading ? (
				<p className="ld-settings-note">
					<LoaderCircle size={14} className="spin" /> Memuat…
				</p>
			) : providers.length === 0 ? (
				<p className="ld-settings-note">Belum ada provider. Aplikasi memakai model bawaan server sampai Anda menambahkan satu.</p>
			) : (
				<ul className="ld-settings-list">
					{providers.map((provider) => (
						<li key={provider.id}>
							<div>
								<strong>{provider.label}</strong>
								{provider.isDefault && <span className="ld-badge">Bawaan</span>}
								<small>
									{provider.baseUrl} · {provider.models.join(', ')} · {provider.keyMasked || 'kunci tersimpan'}
								</small>
							</div>
							<div className="ld-settings-actions">
								<button type="button" className="ld-btn ld-btn-ghost" disabled={busy === `test-${provider.id}`} onClick={() => void test(provider)}>
									{busy === `test-${provider.id}` ? <LoaderCircle size={14} className="spin" /> : <Zap size={14} />} Uji
								</button>
								<button type="button" className="ld-btn ld-btn-ghost" disabled={busy === provider.id} onClick={() => void remove(provider)}>
									<Trash2 size={14} /> Hapus
								</button>
							</div>
						</li>
					))}
				</ul>
			)}

			{providers.length > 0 && (
				<div className="ld-settings-grid">
					{surfaces.map((surface) => {
						const preference = preferenceFor(surface.id);
						return (
							<label key={surface.id}>
								{surface.label}
								{surface.requires.length > 0 && <small> butuh: {surface.requires.join(', ')}</small>}
								<select
									value={preference?.provider || ''}
									disabled={busy === `pref-${surface.id}`}
									onChange={(event) => void choose(surface, event.target.value)}
								>
									<option value="">Bawaan server</option>
									{providers.map((provider) => (
										<option key={provider.id} value={provider.id}>
											{provider.label} — {provider.models[0]}
										</option>
									))}
								</select>
							</label>
						);
					})}
				</div>
			)}
		</section>
	);
}
