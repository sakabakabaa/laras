import { describe, expect, it, vi } from 'vitest';
import { blankBuilder, type BuilderRecord } from '../src/lib/builder-document';
import { createBuilderSaveQueue, type BuilderSaveCommand } from '../src/lib/builder-save';

const record = (command: BuilderSaveCommand): BuilderRecord => ({ ...command, revision: command.baseRevision + 1, updated: '', title: command.document.title, kind: command.document.kind });

describe('builder save retry identity', () => {
	it('rejects concurrent saves without generating a second command', async () => {
		let finish!: (value: BuilderRecord) => void;
		const send = vi.fn((command: BuilderSaveCommand) => new Promise<BuilderRecord>(resolve => { finish = () => resolve(record(command)); }));
		const queue = createBuilderSaveQueue(send), draft = blankBuilder('tugas', 'course000000001');
		const first = queue.save('draft', 1, draft);
		await expect(queue.save('draft', 1, draft)).rejects.toThrow('masih berlangsung');
		expect(send).toHaveBeenCalledTimes(1);
		finish(record(send.mock.calls[0][0]));
		await expect(first).resolves.toHaveProperty('record.revision', 2);
	});
	it('replays the exact committed snapshot after a lost response, then saves newer edits', async () => {
		const commands: BuilderSaveCommand[] = [];
		let committed: BuilderRecord | null = null;
		const send = vi.fn(async (command: BuilderSaveCommand) => {
			commands.push(command);
			if (!committed) {
				committed = record(command);
				throw new Error('Response lost after commit');
			}
			if (command.commandId === commands[0].commandId) return committed;
			expect(command.baseRevision).toBe(committed.revision);
			committed = record(command);
			return committed;
		});
		const queue = createBuilderSaveQueue(send);
		const draft = blankBuilder('tugas', 'course000000001');
		await expect(queue.save('draft', 1, draft)).rejects.toThrow('Response lost');
		draft.document.title = 'Newer edit';
		const retried = await queue.save('draft', 1, draft);
		expect(commands[1]).toEqual(commands[0]);
		expect(retried.hash).not.toContain('Newer edit');
		await queue.save('draft', retried.record.revision, draft);
		expect(commands[2].document.title).toBe('Newer edit');
		expect(commands[2].commandId).not.toBe(commands[0].commandId);
	});

	it('keeps genuine conflicts explicit until the server revision is reloaded', async () => {
		const send = vi.fn(async (command: BuilderSaveCommand) => record(command));
		send.mockRejectedValueOnce(new Error('REVISION_CONFLICT'));
		const queue = createBuilderSaveQueue(send), draft = blankBuilder('kelas', 'course000000001');
		await expect(queue.save('draft', 1, draft)).rejects.toThrow('REVISION_CONFLICT');
		queue.reset();
		await queue.save('draft', 5, draft);
		expect(send.mock.calls[1][0].baseRevision).toBe(5);
		expect(send.mock.calls[1][0].commandId).not.toBe(send.mock.calls[0][0].commandId);
	});
});
