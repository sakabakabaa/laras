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
		<img
			className="laras-mark"
			width={size}
			height={size}
			src="/laras-mark.png"
			alt=""
			aria-hidden="true"
		/>
	);
}
