import { ProfileSection } from './profile-section';
import { SecuritySection } from './security-section';
import { RecoverySection } from './recovery-section';
import { PreferencesSection } from './preferences-section';
import { LanguageSection } from './language-section';
import { AccountInfoSection } from './account-info-section';
import { UsageSection } from './usage-section';
import { LearnerProfileSection } from './learner-profile-section';
import { useAuth } from '@/hooks/use-auth';

/**
 * Account settings. Each section is role-appropriate and backed by real data:
 * profile name + avatar, password change, recovery email (students), display
 * preferences (per-browser), and read-only account info. No nonfunctional
 * toggles are shown.
 */
export function SettingsPage() {
	const { user } = useAuth();
	const role = (user as { role?: string } | null)?.role || 'faculty';
	const isStudent = role === 'student';

	return (
		<div className="ld-settings">
			<ProfileSection />
			{isStudent && <LearnerProfileSection />}
			<SecuritySection />
			{isStudent && <RecoverySection />}
			{!isStudent && <LanguageSection />}
		{!isStudent && <UsageSection />}
			<PreferencesSection />
			<AccountInfoSection />
		</div>
	);
}
