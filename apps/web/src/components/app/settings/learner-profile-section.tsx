import { useEffect, useState } from 'react';
import { BadgeCheck, Brain, LoaderCircle, Save, UserRound } from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { errorMessage } from '@/lib/learning';

type LearnerPrefs = {
	goals: string; currentGoal: string; priorExperience: string; confidence: string; explanationLanguage: string;
	supportPreference: string; shareWithLecturer: boolean; aiPersonalization: boolean;
};
const empty: LearnerPrefs = { goals: '', currentGoal: '', priorExperience: '', confidence: '', explanationLanguage: '', supportPreference: '', shareWithLecturer: false, aiPersonalization: false };

export function LearnerProfileSection() {
	const [value, setValue] = useState<LearnerPrefs>(empty);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [saved, setSaved] = useState(false);
	useEffect(() => {
		let active = true;
		fetch('/api/student-profile', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pb.authStore.token}` }, body: JSON.stringify({ mode: 'load' }) })
			.then(async (res) => { const data = await res.json().catch(() => null) as { profile?: LearnerPrefs; error?: string } | null; if (!res.ok) throw new Error(data?.error || 'Preferensi gagal dimuat.'); if (active) setValue({ ...empty, ...data?.profile }); })
			.catch((err) => { if (active) setError(errorMessage(err)); }).finally(() => { if (active) setLoading(false); });
		return () => { active = false; };
	}, []);
	const update = <K extends keyof LearnerPrefs>(key: K, next: LearnerPrefs[K]) => setValue((prev) => ({ ...prev, [key]: next }));
	const save = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault(); setSaving(true); setError(''); setSaved(false);
		try {
			const res = await fetch('/api/student-profile', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pb.authStore.token}` }, body: JSON.stringify({ mode: 'save', ...value }) });
			const data = await res.json().catch(() => null) as { error?: string } | null;
			if (!res.ok) throw new Error(data?.error || 'Preferensi gagal disimpan.');
			setSaved(true);
		} catch (err) { setError(errorMessage(err)); } finally { setSaving(false); }
	};
	return <section className="ld-panel ld-settings-panel sp-preferences-panel">
		<div className="ld-card-head"><div><span className="ld-eyebrow">PROFIL BELAJAR</span><h2>Tujuan dan preferensi belajar</h2></div></div>
		<p className="ld-settings-lede">Ceritakan cara belajar yang cocok untuk Anda. Dosen hanya dapat melihatnya jika Anda mengizinkan. Preferensi AI terpisah dan mati secara default.</p>
		{loading ? <p className="sp-loading"><LoaderCircle size={17} className="spin" /> Memuat preferensi…</p> : <form className="ld-settings-form" onSubmit={save}>
			<label className="ld-settings-field"><span>Tujuan belajar <small>Opsional</small></span><textarea maxLength={2000} rows={3} value={value.goals} onChange={(e) => update('goals', e.target.value)} placeholder="Contoh: lebih percaya diri berbicara dalam bahasa Jerman." /></label>
			<label className="ld-settings-field"><span>Fokus belajar saat ini <small>Opsional</small></span><input maxLength={500} value={value.currentGoal} onChange={(e) => update('currentGoal', e.target.value)} placeholder="Contoh: minggu ini berlatih artikel Akkusativ." /></label>
			<label className="ld-settings-field"><span>Pengalaman sebelumnya <small>Opsional</small></span><textarea maxLength={2000} rows={3} value={value.priorExperience} onChange={(e) => update('priorExperience', e.target.value)} placeholder="Apa yang sudah pernah Anda pelajari?" /></label>
			<div className="ld-settings-form-grid">
				<label className="ld-settings-field"><span>Kepercayaan diri</span><select value={value.confidence} onChange={(e) => update('confidence', e.target.value)}><option value="">Pilih…</option><option value="low">Masih membangun dasar</option><option value="medium">Cukup percaya diri</option><option value="high">Percaya diri</option></select></label>
				<label className="ld-settings-field"><span>Bahasa penjelasan</span><select value={value.explanationLanguage} onChange={(e) => update('explanationLanguage', e.target.value)}><option value="">Ikuti bahasa default</option><option value="id">Bahasa Indonesia</option><option value="en">English</option><option value="de">Deutsch</option></select></label>
				<label className="ld-settings-field"><span>Gaya bantuan</span><select value={value.supportPreference} onChange={(e) => update('supportPreference', e.target.value)}><option value="">Tidak ada preferensi</option><option value="examples">Contoh konkret</option><option value="steps">Langkah demi langkah</option><option value="concise">Penjelasan ringkas</option></select></label>
			</div>
			<label className="sp-consent-row"><input type="checkbox" checked={value.shareWithLecturer} onChange={(e) => update('shareWithLecturer', e.target.checked)} /><span><strong><UserRound size={16} /> Bagikan kepada dosen mata kuliah saya</strong><small>Jika aktif, dosen dapat melihat tujuan, pengalaman, dan pilihan belajar Anda.</small></span></label>
			<label className="sp-consent-row"><input type="checkbox" checked={value.aiPersonalization} onChange={(e) => update('aiPersonalization', e.target.checked)} /><span><strong><Brain size={16} /> Izinkan preferensi ini menyesuaikan bantuan AI</strong><small>Latihan AI dapat memakai fokus belajar saat ini serta menyesuaikan bahasa penjelasan dan gaya bantuan. Tujuan umum dan pengalaman bebas tidak dikirim.</small></span></label>
			{error && <p className="form-error" role="alert">{error}</p>}{saved && <p className="ld-settings-success"><BadgeCheck size={15} /> Preferensi tersimpan.</p>}
			<div className="ld-settings-actions"><button type="submit" className="ld-btn-primary" disabled={saving}>{saving ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />} Simpan preferensi</button></div>
		</form>}
	</section>;
}
