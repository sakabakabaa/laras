import { useAuth } from '@/hooks/use-auth';
import { dateLabel } from '@/lib/learning';

/**
 * Read-only account summary. Surfaces the role, login email, student number
 * (NIM, students only), and registration date. None of these are editable here
 * — role and NIM are locked by collection rules, and the login email is the
 * account identifier.
 */
export function AccountInfoSection() {
	const { user } = useAuth();
	const role = (user as { role?: string } | null)?.role || 'faculty';
	const isStudent = role === 'student';
	const nim = (user as { nim?: string } | null)?.nim || '';

	const rows: [string, string][] = [
		['Peran', isStudent ? 'Mahasiswa' : 'Dosen'],
		['Email login', user?.email || '—'],
	];
	if (isStudent) {
		rows.push(['NIM', nim || '—']);
	}
	rows.push(['Terdaftar sejak', dateLabel(user?.created || '')]);

	return (
		<section className="ld-panel ld-settings-panel">
			<div className="ld-card-head">
				<div>
					<span className="ld-eyebrow">Info akun</span>
					<h2>Ringkasan akun</h2>
				</div>
			</div>
			<dl className="ld-settings-info-grid">
				{rows.map(([label, value]) => (
					<div key={label}>
						<dt>{label}</dt>
						<dd>{value}</dd>
					</div>
				))}
			</dl>
			<p className="ld-settings-note">
				Email login, peran, dan NIM dikelola oleh sistem dan dosen. Hubungi dosen Anda jika
				data perlu diperbarui.
			</p>
		</section>
	);
}
