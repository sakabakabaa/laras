import { useEffect, useState } from 'react';
import { Gauge, LoaderCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import pb from '@/lib/pocketbase-client';
import { errorMessage, isAbortError } from '@/lib/learning';

type UsageSummary = {
	consumed: number;
	budget: number;
	remaining: number;
	period: string;
};

/**
 * A simple, non-noisy AI usage indicator for lecturers. Shows the current
 * daily AI usage budget consumption as a single compact line + progress bar.
 * Intentionally not shown to students (internal rate-limit data is never
 * exposed to them) and not added to the evaluation workflow.
 */
export function UsageSection() {
	const { user } = useAuth();
	const [summary, setSummary] = useState<UsageSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			setLoading(true);
			setError('');
			try {
				const res = await fetch('/api/ai-usage', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'summary' }),
				});
				if (!res.ok) throw new Error('Gagal memuat penggunaan AI.');
				const data = (await res.json()) as UsageSummary;
				if (!cancelled) setSummary(data);
			} catch (err) {
				if (!cancelled && !isAbortError(err)) setError(errorMessage(err));
			} finally {
				if (!cancelled) setLoading(false);
			}
		};
		void load();
		return () => {
			cancelled = true;
		};
	}, [user?.id]);

	const consumed = summary?.consumed ?? 0;
	const budget = summary?.budget ?? 1;
	const pct = Math.min(100, Math.round((consumed / budget) * 100));

	return (
		<section className="ld-panel ld-settings-panel">
			<div className="ld-card-head">
				<div>
					<span className="ld-eyebrow">
						<Gauge size={13} /> Penggunaan AI
					</span>
					<h2>Bantuan AI</h2>
				</div>
			</div>
			<p className="ld-settings-lede">
				Ringkasan penggunaan asisten AI Anda hari ini. Batas ini melindungi biaya dan
				stabilitas layanan; penggunaan normal tidak akan terganggu.
			</p>

			{loading ? (
				<p className="ld-settings-note">
					<LoaderCircle size={13} className="spin" /> Memuat…
				</p>
			) : error ? (
				<p className="form-error" role="alert">
					{error}
				</p>
			) : (
				<div className="ld-usage">
					<div className="ld-usage-row">
						<strong>
							{consumed} / {budget}
						</strong>
						<span>terpakai hari ini</span>
					</div>
					<div className="ld-usage-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
						<span style={{ width: `${pct}%` }} />
					</div>
					<p className="ld-settings-note">
						<Gauge size={13} /> Sisa {summary?.remaining ?? 0} untuk hari ini. Reset otomatis setiap hari.
					</p>
				</div>
			)}
		</section>
	);
}
