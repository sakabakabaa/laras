import { encodeBuilderDraft, uid, type BuilderEnvelope, type BuilderRecord } from './builder-document';

export type BuilderSaveCommand = BuilderEnvelope & {
	id: string;
	baseRevision: number;
	commandId: string;
};

export function createBuilderSaveQueue(send: (command: BuilderSaveCommand) => Promise<BuilderRecord>) {
	let pending: BuilderSaveCommand | null = null;
	let inFlight = false;
	return {
		reset() { pending = null; },
		async save(id: string, baseRevision: number, envelope: BuilderEnvelope) {
			if (inFlight) throw new Error('Penyimpanan masih berlangsung.');
			if (pending && pending.id !== id) throw new Error('Selesaikan penyimpanan draf sebelumnya.');
			pending ??= { ...structuredClone(envelope), id, baseRevision, commandId: uid() };
			const command = pending;
			inFlight = true;
			try {
				const record = await send(structuredClone(command));
				pending = null;
				return { record, hash: encodeBuilderDraft({ document: command.document, privateKeys: command.privateKeys }) };
			} finally {
				inFlight = false;
			}
		},
	};
}
