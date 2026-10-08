import { formatCount, runeCount } from '@/lib/rps-limits';

export function CharMeter({ value, max }: { value: string; max: number }) {
	const count = runeCount(value);
	const over = count > max;
	const near = !over && max > 0 && count >= Math.floor(max * 0.85);
	return (
		<span className={`rps-char-count${over ? ' over' : ''}${near ? ' near' : ''}`} aria-live="polite">
			{formatCount(count)} / {formatCount(max)}
			{over ? ' — melebihi batas' : near ? ' — mendekati batas' : ''}
		</span>
	);
}
