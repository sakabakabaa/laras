import type { BuilderDocument, BuilderKind } from './builder-document';
export type BuilderImportSettings = { kind: BuilderKind; context: BuilderDocument['context']; title?: string; goal?: string };
export type BuilderImportReport = { warnings: string[]; inferredKeys: string[]; missingMedia: string[]; sourceName?: string; activityCount?: number; questionCount?: number };
export type BuilderImportJob = { id: string; status: 'queued'|'running'|'ready'|'failed'; source: string; settings: BuilderImportSettings; documentId: string; report: BuilderImportReport; error: string; attempts: number; leaseUntil: number };
