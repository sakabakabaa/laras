export type AuthoringRecovery<T> = { schemaVersion: 1; at: number; baseRevision: string; value: T };
type DeviceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readAuthoringRecovery<T>(storage: DeviceStorage, key: string, valid: (value: unknown) => value is T, now = Date.now()): AuthoringRecovery<T> | null {
	const raw = storage.getItem(key);
	if (!raw) return null;
	try {
		const candidate = JSON.parse(raw) as AuthoringRecovery<unknown>;
		if (candidate.schemaVersion !== 1 || !Number.isFinite(candidate.at) || candidate.at > now || now - candidate.at > 7 * 86400000 || typeof candidate.baseRevision !== 'string' || !valid(candidate.value)) return null;
		return candidate as AuthoringRecovery<T>;
	} catch { return null; }
}

export function writeAuthoringRecovery<T>(storage: DeviceStorage, key: string, value: T, baseRevision: string, now = Date.now()) {
	storage.setItem(key, JSON.stringify({ schemaVersion: 1, at: now, baseRevision, value } satisfies AuthoringRecovery<T>));
}
