import { describe, expect, it } from 'vitest';
import { readAuthoringRecovery, writeAuthoringRecovery } from '../src/lib/authoring-recovery';

const valid = (value: unknown): value is { title: string } => Boolean(value && typeof value === 'object' && typeof (value as { title?: unknown }).title === 'string');
const storage = () => {
	const items = new Map<string, string>();
	return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); }, removeItem: (key: string) => { items.delete(key); } };
};
describe('account and entity scoped authoring recovery', () => {
	it('retains base revision for an explicit recovery comparison without crossing keys', () => {
		const device = storage();
		writeAuthoringRecovery(device, 'teacher:session:one', { title: 'Recovered' }, 'revision-3', 1000);
		expect(readAuthoringRecovery(device, 'teacher:session:one', valid, 2000)).toMatchObject({ baseRevision: 'revision-3', value: { title: 'Recovered' } });
		expect(readAuthoringRecovery(device, 'other:session:one', valid, 2000)).toBeNull();
		expect(readAuthoringRecovery(device, 'teacher:session:two', valid, 2000)).toBeNull();
	});
	it('ignores expired, corrupt, future, and invalid recovery data', () => {
		const device = storage();
		writeAuthoringRecovery(device, 'key', { title: 'Old' }, '1', 1000);
		expect(readAuthoringRecovery(device, 'key', valid, 1000 + 8 * 86400000)).toBeNull();
		expect(readAuthoringRecovery(device, 'key', valid, 999)).toBeNull();
		device.setItem('key', '{');
		expect(readAuthoringRecovery(device, 'key', valid)).toBeNull();
		writeAuthoringRecovery(device, 'key', { title: 42 }, '1');
		expect(readAuthoringRecovery(device, 'key', valid)).toBeNull();
	});
	it('does not swallow quota errors so the editor can warn that recovery is unavailable', () => {
		const device = storage(); device.setItem = () => { throw new Error('Quota'); };
		expect(() => writeAuthoringRecovery(device, 'key', { title: 'Unsaved' }, '1')).toThrow('Quota');
	});
});
