import { describe, expect, it } from 'vitest';
import { blankBuilder } from '../src/lib/builder-document';
import { builderPublishWarnings } from '../src/components/app/builder/builder-publish-dialog';

describe('builder publish preflight warnings', () => {
	it('warns about overplanned class time without changing the schedule', () => {
		const envelope = blankBuilder('kelas', 'course000000001');
		envelope.document.delivery.startsAt = '2030-01-01T10:00:00Z';
		envelope.document.delivery.endsAt = '2030-01-01T10:10:00Z';
		envelope.document.activities[0].plannedMinutes = 20;
		const before = structuredClone(envelope);
		expect(builderPublishWarnings(envelope)).toEqual(['Rencana 20 menit melebihi waktu kelas 10 menit. Durasi tidak diubah otomatis.']);
		expect(envelope).toEqual(before);
	});

	it('distinguishes unlimited late submissions from an ignored hard close', () => {
		const envelope = blankBuilder('tugas', 'course000000001');
		envelope.document.delivery.allowLate = true;
		expect(builderPublishWarnings(envelope)).toEqual(['Kiriman terlambat diterima tanpa tanggal penutupan.']);
		envelope.document.delivery.hardCloseAt = '2030-01-01T11:00:00Z';
		expect(builderPublishWarnings(envelope)).toEqual([]);
		envelope.document.delivery.allowLate = false;
		expect(builderPublishWarnings(envelope)[0]).toContain('bukan tanggal tutup tambahan');
	});
});
