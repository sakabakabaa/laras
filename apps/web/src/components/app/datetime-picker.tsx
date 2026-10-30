import { useState } from 'react';
import { Calendar as CalendarIcon, Clock, X } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type DateTimePickerProps = {
	/** `datetime-local` formatted value (`YYYY-MM-DDTHH:MM`) or '' for none. */
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
};

function parseValue(value: string): { date: Date | undefined; time: string } {
	if (!value) return { date: undefined, time: '23:59' };
	const [datePart, timePart] = value.split('T');
	const date = datePart ? new Date(`${datePart}T00:00:00`) : undefined;
	return {
		date: date && !Number.isNaN(date.getTime()) ? date : undefined,
		time: timePart || '23:59',
	};
}

function compose(date: Date | undefined, time: string): string {
	if (!date) return '';
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time || '23:59'}`;
}

function formatDisplay(value: string): string {
	if (!value) return '';
	const { date, time } = parseValue(value);
	if (!date) return '';
	const dateLabel = date.toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
	return `${dateLabel} · ${time}`;
}

/**
 * Themed date + time picker that replaces the native `datetime-local` input.
 * Stores/accepts the same `YYYY-MM-DDTHH:MM` value so existing conversion
 * helpers (`deadlineToLocalInput` / `localInputToDeadline`) keep working.
 */
export function DateTimePicker({ value, onChange, placeholder = 'Pilih tanggal dan waktu' }: DateTimePickerProps) {
	const [open, setOpen] = useState(false);
	const { date, time } = parseValue(value);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button type="button" className="dtp-trigger">
					<CalendarIcon size={15} />
					<span className={value ? '' : 'dtp-placeholder'}>
						{value ? formatDisplay(value) : placeholder}
					</span>
					{value ? (
						<span
							role="button"
							tabIndex={0}
							className="dtp-clear"
							aria-label="Hapus tanggal"
							onClick={(e) => {
								e.stopPropagation();
								onChange('');
							}}
							onKeyDown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									e.stopPropagation();
									onChange('');
								}
							}}
						>
							<X size={14} />
						</span>
					) : null}
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="dtp-popover">
				<Calendar
					mode="single"
					selected={date}
					onSelect={(next) => {
						onChange(compose(next ?? date, time));
						if (next) setOpen(false);
					}}
					initialFocus
				/>
				<div className="dtp-time">
					<label className="dtp-time-label">
						<Clock size={14} /> Waktu
					</label>
					<input
						type="time"
						className="dtp-time-input"
						value={time}
						onChange={(e) => onChange(compose(date, e.target.value))}
					/>
				</div>
			</PopoverContent>
		</Popover>
	);
}
