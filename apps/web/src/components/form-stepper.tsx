import { Check } from 'lucide-react';

export type FormStep = {
	id: number;
	label: string;
};

/**
 * Shared multi-step progress: numbered circles, completed checks, a connecting
 * line, and concise labels. Callers keep their own step names, validation, and
 * navigation rules — this only renders the pattern.
 */
export function FormStepper({
	steps,
	current,
	completed,
	onSelect,
	canSelect,
	ariaLabel,
}: {
	steps: readonly FormStep[];
	current: number;
	/** Step ids already finished. Defaults to every step before `current`. */
	completed?: ReadonlySet<number>;
	onSelect?: (id: number) => void;
	/** When omitted, only completed steps and the current step are selectable. */
	canSelect?: (id: number) => boolean;
	ariaLabel: string;
}) {
	const doneIds =
		completed ?? new Set(steps.filter((step) => step.id < current).map((step) => step.id));

	return (
		<nav className="form-stepper" aria-label={ariaLabel}>
			{steps.map((step, index) => {
				const active = step.id === current;
				const done = doneIds.has(step.id) && !active;
				const selectable = canSelect ? canSelect(step.id) : done || active;
				return (
					<button
						key={step.id}
						type="button"
						className={`form-step${active ? ' active' : ''}${done ? ' done' : ''}${selectable ? ' selectable' : ''}`}
						disabled={!selectable}
						aria-current={active ? 'step' : undefined}
						onClick={() => {
							if (selectable && !active) onSelect?.(step.id);
						}}
					>
						<span className="form-step-dot">
							{done ? <Check size={14} strokeWidth={2.75} /> : step.id}
						</span>
						{index < steps.length - 1 && <span className="form-step-line" aria-hidden />}
						<span className="form-step-label">{step.label}</span>
					</button>
				);
			})}
		</nav>
	);
}
