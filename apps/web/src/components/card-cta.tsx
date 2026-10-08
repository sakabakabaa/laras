import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';

/**
 * Standard navigation-card call-to-action.
 *
 * Navigation cards (course, assignment, and learning-material cards) must NOT
 * turn the whole card into a link/button. The card is a plain container; this
 * CTA is the single, clearly labeled action that carries the visitor to the
 * destination. Informational and status cards stay non-clickable and simply
 * omit this component.
 *
 * Use `variant="primary"` for the default next action and `variant="ghost"`
 * for secondary or already-completed actions.
 */
type Props = {
	to: string;
	label: string;
	variant?: 'primary' | 'ghost';
};

export function CardCta({ to, label, variant = 'primary' }: Props) {
	return (
		<Link to={to} className={`ld-card-cta${variant === 'ghost' ? ' ghost' : ''}`}>
			{label}
			<ArrowRight size={14} strokeWidth={2.25} />
		</Link>
	);
}
