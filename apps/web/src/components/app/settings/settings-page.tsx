import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ProfileSection } from './profile-section';
import { SecuritySection } from './security-section';
import { RecoverySection } from './recovery-section';
import { PreferencesSection } from './preferences-section';
import { LanguageSection } from './language-section';
import { AccountInfoSection } from './account-info-section';
import { UsageSection } from './usage-section';
import { LearnerProfileSection } from './learner-profile-section';
import { AiModelSection } from './ai-model-section';
import {
	SettingsNav,
	allSectionIds,
	facultySettingsNav,
	studentSettingsNav,
	type SettingsSectionId,
} from './settings-nav';
import { useAuth } from '@/hooks/use-auth';

/**
 * Account settings.
 *
 * One section is shown at a time, chosen by `?bagian=`. Two decisions worth
 * keeping:
 *
 * - Every section stays MOUNTED and inactive ones are only `hidden`. Unmounting
 *   would throw away a half-typed password, an edited AI provider form, or a
 *   Codex device login that is still polling. Hiding costs nothing and removes
 *   the need for an unsaved-changes guard on navigation.
 * - An unknown or absent `bagian` falls back to the first section rather than
 *   rendering an empty page, so old links and typos still land somewhere useful.
 */
export function SettingsPage() {
	const { user } = useAuth();
	const role = (user as { role?: string } | null)?.role || 'faculty';
	const isStudent = role === 'student';
	const [params] = useSearchParams();

	const groups = isStudent ? studentSettingsNav : facultySettingsNav;
	const ids = allSectionIds(groups);
	const requested = params.get('bagian') as SettingsSectionId | null;
	const active: SettingsSectionId = requested && ids.includes(requested) ? requested : ids[0]!;

	// Rendered in a fixed order; the nav decides which one is visible.
	const sections: { id: SettingsSectionId; node: ReactNode }[] = [
		{ id: 'profil', node: <ProfileSection /> },
		{ id: 'profil-belajar', node: isStudent ? <LearnerProfileSection /> : null },
		{ id: 'akun', node: <AccountInfoSection /> },
		{ id: 'keamanan', node: <SecuritySection /> },
		{ id: 'pemulihan', node: isStudent ? <RecoverySection /> : null },
		{ id: 'model', node: isStudent ? null : <AiModelSection /> },
		{ id: 'penggunaan', node: isStudent ? null : <UsageSection /> },
		{ id: 'tampilan', node: <PreferencesSection /> },
		{ id: 'bahasa', node: <LanguageSection /> },
	];

	return (
		<div className="ld-settings-shell">
			<SettingsNav groups={groups} active={active} />
			<div className="ld-settings">
				{sections
					.filter((section) => section.node && ids.includes(section.id))
					.map((section) => (
						<div key={section.id} hidden={section.id !== active}>
							{section.node}
						</div>
					))}
			</div>
		</div>
	);
}
