import { Link } from 'react-router';

/**
 * Settings navigation.
 *
 * The settings page shows one section at a time, so this list is the only way to
 * move between them. Items are real links with a `?bagian=` query, not buttons:
 * a lecturer can middle-click or bookmark a section, and the browser's back
 * button works as expected.
 *
 * Groups are labels only. They carry no behaviour, so a screen reader hears a
 * flat list of links rather than a nested tree of one-item groups.
 */

export type SettingsSectionId =
	| 'profil'
	| 'akun'
	| 'keamanan'
	| 'pemulihan'
	| 'bahasa'
	| 'penggunaan'
	| 'model'
	| 'tampilan'
	| 'profil-belajar';

export type SettingsNavItem = { id: SettingsSectionId; label: string };
export type SettingsNavGroup = { label: string; items: SettingsNavItem[] };

/**
 * Section order follows how often a lecturer changes each thing, not how the
 * account is structured: the model they teach with comes before their password.
 */
export const facultySettingsNav: SettingsNavGroup[] = [
	{ label: 'Akun', items: [{ id: 'profil', label: 'Profil' }, { id: 'akun', label: 'Info akun' }] },
	{ label: 'Keamanan', items: [{ id: 'keamanan', label: 'Kata sandi' }] },
	{
		label: 'AI & tampilan',
		items: [
			{ id: 'model', label: 'Model AI' },
			{ id: 'penggunaan', label: 'Penggunaan AI' },
			{ id: 'tampilan', label: 'Tampilan' },
			{ id: 'bahasa', label: 'Bahasa' },
		],
	},
];

export const studentSettingsNav: SettingsNavGroup[] = [
	{
		label: 'Akun',
		items: [
			{ id: 'profil', label: 'Profil' },
			{ id: 'profil-belajar', label: 'Profil belajar' },
			{ id: 'akun', label: 'Info akun' },
		],
	},
	{
		label: 'Keamanan',
		items: [
			{ id: 'keamanan', label: 'Kata sandi' },
			{ id: 'pemulihan', label: 'Email pemulihan' },
		],
	},
	{ label: 'Tampilan', items: [{ id: 'tampilan', label: 'Tampilan' }, { id: 'bahasa', label: 'Bahasa' }] },
];

/** Every id the nav can produce, for validating a deep link. */
export const allSectionIds = (groups: SettingsNavGroup[]): SettingsSectionId[] =>
	groups.flatMap((group) => group.items.map((item) => item.id));

export function SettingsNav({ groups, active }: { groups: SettingsNavGroup[]; active: SettingsSectionId }) {
	return (
		<nav className="ld-settings-nav" aria-label="Bagian pengaturan">
			{groups.map((group) => (
				<div key={group.label} className="ld-settings-nav-block">
					<p className="ld-settings-nav-label">{group.label}</p>
					<ul>
						{group.items.map((item) => (
							<li key={item.id}>
								<Link
									to={`/app/pengaturan?bagian=${item.id}`}
									aria-current={active === item.id ? 'page' : undefined}
								>
									{item.label}
								</Link>
							</li>
						))}
					</ul>
				</div>
			))}
		</nav>
	);
}

export default SettingsNav;
