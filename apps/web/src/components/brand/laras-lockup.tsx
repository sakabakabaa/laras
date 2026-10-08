const LARAS_LOCKUP =
	'https://horizons-cdn.hostinger.com/a1e3d273-0bc9-4b07-987d-ecfbfd5fb3dc/14236b4a10f4830e3c8445084626c696.png';
const LARAS_LEAF_MARK =
	'https://horizons-cdn.hostinger.com/a1e3d273-0bc9-4b07-987d-ecfbfd5fb3dc/minimal-white-leaf-emblem-kuLpT.webp';

/** Horizontal LARAS lockup, or the white leaf mark for dark app chrome. */
export function LarasLockup({
	height = 36,
	className = '',
	markOnly = false,
}: {
	height?: number;
	className?: string;
	markOnly?: boolean;
}) {
	return (
		<span className={`laras-lockup${markOnly ? ' laras-lockup-mark' : ''} ${className}`.trim()} style={{ height }}>
			<img src={markOnly ? LARAS_LEAF_MARK : LARAS_LOCKUP} alt={markOnly ? 'LARAS' : 'LARAS Academic Workspace'} />
		</span>
	);
}

export function LarasMark({ size = 36 }: { size?: number }) {
	return (
		<svg
			className="laras-mark"
			width={size}
			height={size}
			viewBox="0 0 64 64"
			aria-hidden="true"
		>
			<defs>
				<linearGradient id="laras-mark-g" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor="#ff4d3a" />
					<stop offset="1" stopColor="#b10c12" />
				</linearGradient>
			</defs>
			<path
				fill="url(#laras-mark-g)"
				d="M10 14c10-8 22-6 28 2 2-8 12-12 20-8-8 8-10 18-6 26 8 2 14 10 12 20-10-2-18-10-20-18-2 10-10 18-20 18 2-10 10-16 18-16-8-2-16-8-18-16 6 2 10 0 14-4-8 0-16-2-20-8 4 2 6 3 8 4z"
			/>
		</svg>
	);
}
