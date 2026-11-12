import { useCallback, useEffect, useState } from 'react';
import { Cpu, ExternalLink, LoaderCircle, Plus, Trash2, Zap } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { errorMessage, isAbortError } from '@/lib/learning';

type Capabilities = { tools?: boolean; vision?: boolean; json?: boolean; streaming?: boolean };

type CodexConnection = {
	accountId: string;
	planType: string;
	status: 'active' | 'expired' | 'revoked' | 'error';
	expiresAt: string | null;
	lastRefresh: string | null;
	lastError: string;
};

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
	connection?: CodexConnection | null;
};

type Preference = { id: string; surface: string; provider: string; model: string };

type Surface = { id: string; label: string; requires: string[] };

type PendingCodexLogin = {
	loginId: string;
	userCode: string;
	verificationUrl: string;
	intervalSeconds: number;
	expiresAt: string;
};

const authHeaders = () => ({
	'Content-Type': 'application/json',
	Authorization: `Bearer ${pb.authStore.token}`,
});

const errorText = (data: unknown, fallback: string) =>
	typeof (data as { error?: unknown })?.error === 'string' ? String((data as { error: string }).error) : fallback;

const CONNECTION_LABEL: Record<CodexConnection['status'], string> = {
	active: 'Terhubung',
	expired: 'Sesi berakhir — hubungkan ulang',
	revoked: 'Akses dicabut — hubungkan ulang',
	error: 'Bermasalah — hubungkan ulang',
};

/**
 * Phase 1 — per-lecturer model providers.
 *
 * A lecturer registers their own [OI]-compatible provider, tests it, and picks
 * which provider+model serves each surface. Keys are write-only: the list shows
 * a masked `last4` and no response ever returns the secret.
 *
 * A Codex/ChatGPT provider is different: it holds an OAuth grant rather than a
 * key, so it is connected through a device login and can expire. This component
 * shows its connection state and offers a reconnect, and it never receives token
 * material — only an opaque account id and a status.
 */
export function AiModelSection() {
	const [providers, setProviders] = useState<Provider[]>([]);
	const [preferences, setPreferences] = useState<Preference[]>([]);
	const [surfaces, setSurfaces] = useState<Surface[]>([]);
	const [codexEnabled, setCodexEnabled] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [busy, setBusy] = useState('');
	const [adding, setAdding] = useState(false);
	const [form, setForm] = useState({ label: '', baseUrl: 'https://router.hostinger.com/v1', models: '', apiKey: '', isDefault: false });
	const [codexForm, setCodexForm] = useState({ label: 'Akun Codex', models: '', isDefault: false });
	const [codexLogin, setCodexLogin] = useState<PendingCodexLogin | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError('');
		try {
			const res = await fetch('/api/ai-providers', { headers: authHeaders() });
			const data = (await res.json()) as {
				providers?: Provider[];
				preferences?: Preference[];
				surfaces?: Surface[];
				codexEnabled?: boolean;
				error?: string;
			};
			if (!res.ok) throw new Error(errorText(data, 'Gagal memuat model AI.'));
			setProviders(data.providers || []);
			setPreferences(data.preferences || []);
			setSurfaces(data.surfaces || []);
			setCodexEnabled(Boolean(data.codexEnabled));
		} catch (err) {
			if (!isAbortError(err)) setError(errorMessage(err));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	/**
	 * Polls one pending device login until it resolves.
	 *
	 * The browser owns the cadence: the poll endpoint performs a single upstream
	 * check, so a long login never holds a server request open. The effect tears
	 * itself down when `codexLogin` clears, which is also how a reconnect restarts
	 * cleanly.
	 */
	useEffect(() => {
		const active = codexLogin;
		if (!active) return;
		let stopped = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const tick = async () => {
			if (stopped) return;
			try {
				const res = await fetch('/api/ai-providers-codex-poll', {
					method: 'POST',
					headers: authHeaders(),
					body: JSON.stringify({ loginId: active.loginId }),
				});
				const data = (await res.json()) as { status?: string; error?: string };
				if (stopped) return;
				if (!res.ok) {
					setError(errorText(data, 'Gagal memeriksa status login.'));
					setCodexLogin(null);
					return;
				}
				if (data.status === 'connected') {
					setCodexLogin(null);
					setNotice('Akun Codex terhubung. Pilih provider ini untuk bagian yang Anda inginkan.');
					await load();
					return;
				}
				if (data.status === 'expired') {
					setCodexLogin(null);
					setError('Kode login kedaluwarsa. Mulai login lagi.');
					return;
				}
				if (data.status === 'failed') {
					setCodexLogin(null);
					setError(data.error || 'Login akun Codex gagal.');
					return;
				}
			} catch (err) {
				if (stopped || isAbortError(err)) return;
				setError(errorMessage(err));
				setCodexLogin(null);
				return;
			}
			timer = setTimeout(() => void tick(), Math.max(2, active.intervalSeconds) * 1000);
		};

		timer = setTimeout(() => void tick(), Math.max(2, active.intervalSeconds) * 1000);
		return () => {
			stopped = true;
			if (timer) clearTimeout(timer);
		};
	}, [codexLogin, load]);

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

	const startCodex = async () => {
		setBusy('codex-start');
		setError('');
		setNotice('');
		try {
			const res = await fetch('/api/ai-providers-codex-start', {
				method: 'POST',
				headers: authHeaders(),
				body: JSON.stringify({
					label: codexForm.label,
					models: codexForm.models.split(',').map((model) => model.trim()).filter(Boolean),
					isDefault: codexForm.isDefault,
				}),
			});
			const data = (await res.json()) as { login?: PendingCodexLogin; error?: string };
			if (!res.ok || !data.login) throw new Error(errorText(data, 'Gagal memulai login akun Codex.'));
			setCodexLogin(data.login);
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setBusy('');
		}
	};

	const cancelCodex = async () => {
		const active = codexLogin;
		setCodexLogin(null);
		setNotice('');
		if (!active) return;
		await fetch('/api/ai-providers-codex-cancel', {
			method: 'POST',
			headers: authHeaders(),
			body: JSON.stringify({ loginId: active.loginId }),
		}).catch(() => undefined);
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
					<h2>Provider dan model</h2>
				</div>
			</div>
			<p className="ld-settings-lede">
				Hubungkan provider [OI]-compatible, lalu pilih model untuk tiap bagian aplikasi. Kunci API tersimpan
				terenkripsi dan tidak ditampilkan lagi.
			</p>

			{error && (
				<p className="form-error" role="alert">
					{error}
				</p>
			)}
			{notice && <p className="ld-settings-success">{notice}</p>}

			{codexLogin && (
				<div className="ld-settings-form">
					<p className="ld-settings-note">
						Buka halaman verifikasi, masuk dengan akun ChatGPT Anda, lalu masukkan kode ini. Halaman ini
						menunggu otomatis.
					</p>
					<p className="ld-codex-code" aria-label="Kode verifikasi">
						{codexLogin.userCode}
					</p>
					<div className="ld-settings-actions">
						<a className="ld-outline-action sm" href={codexLogin.verificationUrl} target="_blank" rel="noreferrer noopener">
							<ExternalLink size={14} /> Buka halaman verifikasi
						</a>
						<button type="button" className="ld-outline-action sm" onClick={() => void cancelCodex()}>
							Batalkan
						</button>
					</div>
					<p className="ld-settings-note">
						<LoaderCircle size={14} className="spin" /> Menunggu persetujuan…
					</p>
				</div>
			)}

			{!codexLogin && codexEnabled && (
				<div className="ld-settings-form">
					<p className="ld-settings-note">
						Pakai langganan ChatGPT Anda sebagai model. Akun dan kuota Anda sendiri yang dipakai, dan sesi
						ini bisa dicabut kapan saja dari halaman akun [OI].
					</p>
					<label className="ld-settings-field">
						Nama provider
						<input
							value={codexForm.label}
							onChange={(event) => setCodexForm({ ...codexForm, label: event.target.value })}
							placeholder="Contoh: Akun Codex saya"
						/>
					</label>
					<label className="ld-settings-field">
						Model (pisahkan dengan koma)
						<input
							value={codexForm.models}
							onChange={(event) => setCodexForm({ ...codexForm, models: event.target.value })}
							placeholder="nama model yang tersedia untuk akun Anda"
						/>
					</label>
					<label className="ld-settings-field ld-ai-check">
						<input
							type="checkbox"
							checked={codexForm.isDefault}
							onChange={(event) => setCodexForm({ ...codexForm, isDefault: event.target.checked })}
						/>
						Jadikan provider bawaan
					</label>
					<button type="button" className="ld-btn-primary" disabled={busy === 'codex-start'} onClick={() => void startCodex()}>
						{busy === 'codex-start' ? <LoaderCircle size={14} className="spin" /> : null} Hubungkan akun Codex
					</button>
				</div>
			)}

			{adding && (
				<div className="ld-settings-form">
					<label className="ld-settings-field">
						Nama provider
						<input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="Contoh: Router kampus" />
					</label>
					<label className="ld-settings-field">
						Base URL
						<input value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://…/v1" />
					</label>
					<label className="ld-settings-field">
						Model (pisahkan dengan koma)
						<input value={form.models} onChange={(event) => setForm({ ...form, models: event.target.value })} placeholder="gpt-6-luna, gpt-6-mini" />
					</label>
					<label className="ld-settings-field">
						Kunci API
						<input type="password" value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder="disimpan terenkripsi" autoComplete="off" />
					</label>
					<label className="ld-settings-field ld-ai-check">
						<input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />
						Jadikan provider bawaan
					</label>
					<button type="button" className="ld-btn-primary" disabled={busy === 'create'} onClick={() => void create()}>
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
				<ul className="ld-ai-list">
					{providers.map((provider) => {
						const isCodex = provider.kind === 'codex_oauth';
						const connection = provider.connection || null;
						const healthy = isCodex ? connection?.status === 'active' : true;
						return (
							<li key={provider.id} className="ld-ai-row">
								<div className="ld-ai-row-main">
									<strong>
										{provider.label}
										{provider.isDefault && <span className="ld-ai-default">Bawaan</span>}
									</strong>
									<dl className="ld-ai-meta">
										<dt>Endpoint</dt>
										<dd>{isCodex ? 'Akun Codex (chatgpt.com)' : provider.baseUrl}</dd>
										<dt>Model</dt>
										<dd>{provider.models.join(', ')}</dd>
										{isCodex ? (
											<>
												<dt>Akun</dt>
												<dd>{connection?.accountId ? `••••${connection.accountId.slice(-6)}` : 'belum terhubung'}</dd>
												<dt>Status</dt>
												<dd>{connection ? CONNECTION_LABEL[connection.status] : 'belum terhubung'}</dd>
											</>
										) : (
											<>
												<dt>Kunci</dt>
												<dd>{provider.keyMasked || 'tersimpan'}</dd>
											</>
										)}
									</dl>
									{isCodex && !healthy && (
										<p className="ld-settings-note">
											Provider ini tidak akan dipakai sampai akun dihubungkan ulang lewat tombol di atas.
										</p>
									)}
								</div>
								<div className="ld-ai-row-actions">
									<button
										type="button"
										className="ld-outline-action sm"
										disabled={busy === `test-${provider.id}`}
										onClick={() => void test(provider)}
									>
										{busy === `test-${provider.id}` ? <LoaderCircle size={14} className="spin" /> : <Zap size={14} />} Uji
									</button>
									<button
										type="button"
										className="ld-icon-action sm danger"
										aria-label={`Hapus ${provider.label}`}
										disabled={busy === provider.id}
										onClick={() => void remove(provider)}
									>
										<Trash2 size={15} />
									</button>
								</div>
							</li>
						);
					})}
				</ul>
			)}

			{providers.length > 0 && (
				<div className="ld-ai-grid">
					{surfaces.map((surface) => {
						const preference = preferenceFor(surface.id);
						return (
							<label key={surface.id} className="ld-settings-field">
								{surface.label}
								{surface.requires.length > 0 && <small> butuh: {surface.requires.join(', ')}</small>}
								<select
									value={preference?.provider || ''}
									disabled={busy === `pref-${surface.id}`}
									onChange={(event) => void choose(surface, event.target.value)}
								>
									<option value="">Bawaan server (env)</option>
									{providers.map((provider) => {
										// A Codex grant cannot run tool calls, so it must not be
										// selectable for a surface that requires them.
										const unsupported =
											provider.kind === 'codex_oauth' && surface.requires.includes('tools');
										return (
											<option key={provider.id} value={provider.id} disabled={unsupported}>
												{provider.label} — {provider.models[0]}
												{unsupported ? ' (tidak didukung)' : ''}
											</option>
										);
									})}
								</select>
							</label>
						);
					})}
				</div>
			)}

			<div className="ld-settings-actions ld-ai-actions">
				<button type="button" className="ld-btn-primary" onClick={() => setAdding((value) => !value)}>
					<Plus size={15} /> {adding ? 'Tutup formulir' : 'Tambah provider'}
				</button>
			</div>
			{providers.length > 0 && <p className="ld-settings-note">Pilihan model tersimpan otomatis saat diubah.</p>}
		</section>
	);
}
