// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendBlock, appendQuestion, blankBuilder, newActivity, rich, type BlockType, type BuilderEnvelope } from '../src/lib/builder-document';
import { addLayoutGroup, findLayoutGroup, insertBlockIntoLayout } from '../src/lib/builder-layout';
import type { ScheduledAiProposal } from '../src/lib/scheduled-class-ai';

const service = vi.hoisted(() => ({ send: vi.fn(), listener: vi.fn() }));
vi.mock('../src/lib/pocketbase-client', () => ({
	default: {
		authStore: { record: { id: 'faculty-1' }, token: 'test-token', onChange: service.listener },
		send: service.send,
		collection: vi.fn(),
		filter: vi.fn(),
	},
}));
vi.mock('react-router', async (importOriginal) => {
	const actual = await importOriginal<typeof import('react-router')>();
	return { ...actual, useBlocker: () => ({ state: 'unblocked' }) };
});

import { BuilderWorkspace } from '../src/components/app/builder/builder-workspace';

let root: Root;
let host: HTMLDivElement;
let serverEnvelope: BuilderEnvelope;
let record: Record<string, unknown>;
let importedEnvelope: BuilderEnvelope | null = null;
let legacyTemplateEnvelope: BuilderEnvelope | null = null;
let savedItems: Record<string, unknown>[] = [];
let pendingSavedGet: Promise<unknown> | null = null;
let pendingImportGet: Promise<unknown> | null = null;
let nextSaveFailure: Error | null = null;

function fixture(blockTypes: BlockType[] = [], questionVariant?: 'single_choice' | 'short_answer', meetingId = ''): BuilderEnvelope {
	const envelope = blankBuilder('tugas', '', meetingId);
	envelope.document.activities[0].id = 'activity-1';
	envelope.document.activities[0].title = 'Materi';
	for (const type of blockTypes) {
		const id = appendBlock(envelope, 'activity-1', type);
		if (type === 'question_group' && questionVariant === 'short_answer') {
			const block = envelope.document.activities[0].blocks.find(item => item.id === id)!;
			for (const qid of block.questionIds || []) {
				delete envelope.document.questionsById[qid];
				delete envelope.privateKeys.answersByQuestionId[qid];
			}
			block.questionIds = [appendQuestion(envelope, 'short_answer')];
		}
	}
	return envelope;
}

function response(value: unknown, status = 200) {
	return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function importedRecord(envelope = fixture(['instructions'])) {
	return { ...structuredClone(record), id: 'imported-proposal', document: envelope.document, privateKeys: envelope.privateKeys };
}

function aiProposal(activityCount = 1): ScheduledAiProposal {
	const activities: ScheduledAiProposal['draft']['activities'] = [{ kind: 'quiz', title: 'Proposed quiz', content: '', minutes: 12, required: true, url: '', questions: [{ id: 'proposed-question', text: 'Which answer?', options: ['A', 'B'], correctIndex: 1, points: 2, explanation: 'PRIVATE_PROPOSAL_EXPLANATION', sourceId: 'source-1', sourceQuote: 'PRIVATE_PROPOSAL_QUOTE' }], materialIds: [], cpmkIds: [], subCpmkIds: [] }];
	if (activityCount > 1) activities.push({ kind: 'material', title: 'Proposed reading', content: 'Visible proposal content', minutes: 8, required: true, url: '', questions: [], materialIds: [], cpmkIds: [], subCpmkIds: [] });
	return { draft: { title: 'Reviewed proposal', instructions: 'Student-visible instructions', notes: ['PRIVATE_TEACHER_NOTE'], activities }, sources: [], model: 'mock', generatedAt: '', bundleId: '' };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => { resolve = done; });
	return { promise, resolve };
}

function authoringFetch(proposal: ScheduledAiProposal, generated?: Promise<Response>) {
	const requests: { url: string; body: Record<string, unknown> }[] = [];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		if (url === '/api/scheduled-class-draft') {
			const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
			requests.push({ url, body });
			if (body.action === 'context') return response({ context: { session: { duration: '45' } } });
			if (body.action === 'generate') return generated || response({ proposal });
		}
		return response({ authoring: true, readOnlyRendering: true, mode: 'on', reason: 'enabled', notice: '' });
	});
	return { fetchMock, requests };
}

async function openAiGenerator() {
	click(button('Buat dengan AI'));
	await act(async () => { await Promise.resolve(); await Promise.resolve(); });
	expect(button('Buat usulan').disabled).toBe(false);
}

async function generateAiProposal() {
	click(button('Buat usulan'));
	await act(async () => { await Promise.resolve(); await Promise.resolve(); });
	expect(host.querySelector('.bd-tool-proposal')).toBeTruthy();
}

function click(element: Element) {
	act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

function changeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
	act(() => {
		const isInput = element.tagName === 'INPUT';
		const prototype = isInput ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
		Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
		element.dispatchEvent(new Event(isInput ? 'input' : 'change', { bubbles: true }));
	});
}

function changeTextarea(element: HTMLTextAreaElement, value: string) {
	act(() => {
		Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(element, value);
		element.dispatchEvent(new Event('input', { bubbles: true }));
	});
}

function button(name: string) {
	const result = [...host.querySelectorAll('button'), ...document.querySelectorAll('button')].find((item) =>
		item.getAttribute('aria-label') === name || item.textContent?.trim() === name,
	);
	expect(result, `button ${name}`).toBeTruthy();
	return result!;
}

function openSavedItems() {
	act(() => button('Menu lainnya').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })));
	click([...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent?.includes('Riwayat & template'))!);
}

async function mount(envelope = fixture(), capabilities: { customColors?: boolean; detailedBorderRadius?: boolean; responsiveBorderRadius?: boolean; mediaCaptions?: boolean; mediaPlayback?: boolean; nestedRichText?: boolean; documentAnchors?: boolean; presentationVisibility?: boolean; themePalette?: boolean } = {}, fetchMock?: typeof fetch) {
	serverEnvelope = structuredClone(envelope);
	record = { id: 'draft-1', document: serverEnvelope.document, privateKeys: serverEnvelope.privateKeys, revision: 7, layoutLocks: true, customColors: capabilities.customColors ?? true, detailedBorderRadius: capabilities.detailedBorderRadius ?? true, responsiveBorderRadius: capabilities.responsiveBorderRadius ?? true, mediaCaptions: capabilities.mediaCaptions ?? true, mediaPlayback: capabilities.mediaPlayback ?? true, nestedRichText: capabilities.nestedRichText ?? true, documentAnchors: capabilities.documentAnchors ?? true, presentationVisibility: capabilities.presentationVisibility ?? true, themePalette: capabilities.themePalette ?? true };
	service.send.mockImplementation(async (_path: string, options: { body: { action: string; envelope?: BuilderEnvelope; document?: unknown } }) => {
		if (['savedList', 'presentationVisibility:savedList', 'documentAnchors:savedList'].includes(options.body.action)) return { items: structuredClone(savedItems) };
		if (options.body.action === 'savedGet') {
			if (pendingSavedGet) return pendingSavedGet;
			return { envelope: structuredClone(legacyTemplateEnvelope), id: 'legacy-template', kind: 'template', title: 'Legacy template' };
		}
		if (options.body.action === 'get' && options.body.id === 'imported-proposal') {
			if (pendingImportGet) return pendingImportGet;
			if (importedEnvelope) return { ...structuredClone(record), id: 'imported-proposal', document: importedEnvelope.document, privateKeys: importedEnvelope.privateKeys };
		}
		if (options.body.action === 'get') return structuredClone(record);
		if (options.body.action === 'save' || options.body.action === 'layoutLocks:save' || options.body.action === 'themeColors:save' || options.body.action === 'themePalette:save' || options.body.action === 'detailedStyles:save' || options.body.action === 'responsiveStyles:save' || options.body.action === 'mediaCaptions:save' || options.body.action === 'mediaPlayback:save' || options.body.action === 'nestedLists:save' || options.body.action === 'documentAnchors:save' || options.body.action === 'presentationVisibility:save') {
			if (nextSaveFailure) { const failure = nextSaveFailure; nextSaveFailure = null; throw failure; }
			return { ...structuredClone(record), ...options.body, revision: 8 };
		}
		throw new Error(`Unexpected builder action ${options.body.action}`);
	});
	vi.stubGlobal('fetch', fetchMock || vi.fn(async () => response({ authoring: true, readOnlyRendering: true, mode: 'on', reason: 'enabled', notice: '' })));
	host = document.createElement('div');
	document.body.append(host);
	root = createRoot(host);
	await act(async () => {
		root.render(createElement(MemoryRouter, null, createElement(BuilderWorkspace, { id: 'draft-1' })));
		await Promise.resolve();
		await Promise.resolve();
	});
	await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function unmount() {
	if (root) await act(async () => { root.unmount(); });
	host?.remove();
}

beforeEach(() => {
	vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
	localStorage.clear();
	service.send.mockReset();
	importedEnvelope = null;
	legacyTemplateEnvelope = null;
	savedItems = [];
	pendingSavedGet = null;
	pendingImportGet = null;
	nextSaveFailure = null;
	service.listener.mockReset();
	service.listener.mockImplementation(() => vi.fn());
});

afterEach(async () => {
	if (root) await act(async () => root.unmount());
	host?.remove();
	localStorage.clear();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('mounted BuilderWorkspace events', () => {
	it.each(['selection', 'draft edit', 'target deletion'] as const)('does not apply delayed book import after %s changes', async (transition) => {
		const read = deferred<unknown>();
		pendingImportGet = read.promise;
		const uploadFetch = vi.fn(async (input: RequestInfo | URL) => String(input) === '/api/builder-import'
			? response({ id: 'job-1', status: 'ready', documentId: 'imported-proposal', report: { activityCount: 1, missingMedia: [], warnings: [] } })
			: response({ authoring: true, readOnlyRendering: true, mode: 'on', reason: 'enabled', notice: '' }));
		const initial = fixture(['instructions', 'question_group', 'image']);
		const answerId = initial.document.activities[0].blocks[1].questionIds![0];
		initial.privateKeys.answersByQuestionId[answerId].explanation = rich('PRIVATE_KEEP');
		initial.document.activities[0].blocks[2].images = [{ id: 'legacy-image', url: 'https://example.org/keep.png', alt: 'Keep', caption: 'Preserve caption' }];
		const secondActivity = newActivity('Second activity');
		if (transition === 'selection') initial.document.activities.push(secondActivity);
		await mount(initial, {}, uploadFetch);
		click(button('Unggah bahan'));
		const file = new File(['mock page'], 'page.png', { type: 'image/png' });
		const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]')!;
		Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
		act(() => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
		click(button('Baca halaman'));
		await act(async () => { await Promise.resolve(); await Promise.resolve(); });
		click(button('Tinjau usulan'));
		await act(async () => { await Promise.resolve(); await Promise.resolve(); });
		const history = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
		if (transition === 'selection') {
			changeValue(host.querySelector<HTMLSelectElement>('.bd-library-activity select')!, secondActivity.id);
		} else if (transition === 'draft edit') {
			changeValue(host.querySelector<HTMLInputElement>('.bd-activity input[aria-label^="Judul kegiatan"]')!, 'Changed during import');
		} else {
			click(host.querySelector<HTMLButtonElement>('button[aria-label="Hapus elemen"]')!);
		}
		const afterTransition = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
		await act(async () => { read.resolve(importedRecord()); await read.promise; await Promise.resolve(); });
		expect(host.querySelector('.bd-tool-proposal')).toBeTruthy();
		expect(button('Terapkan APPEND').disabled).toBe(true);
		click(button('Terapkan APPEND'));
		expect(host.querySelector('.bd-workspace')!.getAttribute('data-history-version')).toBe(afterTransition);
		expect(host.querySelector('[role="alert"]')?.textContent).toContain('berubah');
		expect(host.querySelectorAll('.bd-activity')).toHaveLength(initial.document.activities.length);
		expect(Number(afterTransition)).toBe(Number(history) + (transition === 'draft edit' || transition === 'target deletion' ? 1 : 0));
		if (transition !== 'selection') {
			click(button('Simpan'));
			await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
			const saved = service.send.mock.calls.find(call => ['save', 'layoutLocks:save'].includes(call[1].body.action));
			expect(saved?.[1].body.privateKeys.answersByQuestionId[answerId].explanation).toEqual(rich('PRIVATE_KEEP'));
			expect(saved?.[1].body.document.activities[0].blocks.find((block: { type: string }) => block.type === 'image').images[0].caption).toBe('Preserve caption');
			if (transition === 'draft edit') expect(saved?.[1].body.document.activities[0].title).toBe('Changed during import');
		}
	});

	it('rejects delayed book import after conflict and read-only capability transition without changing the local draft', async () => {
		for (const mode of ['conflict', 'read-only'] as const) {
			const read = deferred<unknown>();
			pendingImportGet = read.promise;
			const uploadFetch = vi.fn(async (input: RequestInfo | URL) => String(input) === '/api/builder-import'
				? response({ id: 'job-1', status: 'ready', documentId: 'imported-proposal', report: { activityCount: 1, missingMedia: [], warnings: [] } })
				: response({ authoring: true, readOnlyRendering: true, mode: 'on', reason: 'enabled', notice: '' }));
			await mount(fixture(['instructions']), {}, uploadFetch);
			click(button('Unggah bahan'));
			const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]')!;
			Object.defineProperty(fileInput, 'files', { configurable: true, value: [new File(['mock'], 'page.png', { type: 'image/png' })] });
			act(() => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
			click(button('Baca halaman'));
			await act(async () => { await Promise.resolve(); await Promise.resolve(); });
			click(button('Tinjau usulan'));
			await act(async () => { await Promise.resolve(); await Promise.resolve(); });
			changeValue(host.querySelector<HTMLInputElement>('.bd-activity input[aria-label^="Judul kegiatan"]')!, `Local ${mode}`);
			const historyAfterEdit = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
			if (mode === 'conflict') nextSaveFailure = new Error('REVISION_CONFLICT: changed elsewhere');
			else nextSaveFailure = new Error('ENHANCED_AUTHORING_DENIED: capability disabled');
			click(button('Simpan'));
			await act(async () => { await Promise.resolve(); await Promise.resolve(); });
			expect(host.textContent).toContain(mode === 'conflict' ? 'Konflik' : 'hanya-baca');
			await act(async () => { read.resolve(importedRecord()); await read.promise; await Promise.resolve(); });
			expect(host.querySelector('.bd-tool-proposal')).toBeNull();
			expect(host.querySelector('.bd-workspace')!.getAttribute('data-history-version')).toBe(historyAfterEdit);
			expect(host.textContent).toContain('Selesaikan pemulihan atau konflik draf');
			expect(host.querySelector<HTMLInputElement>('.bd-activity input[aria-label^="Judul kegiatan"]')!.value).toBe(`Local ${mode}`);
			await act(async () => root.unmount());
			host.remove();
			pendingImportGet = null;
			localStorage.clear();
		}
	});

	it('does not install a delayed book import response after the workspace unmounts', async () => {
		const read = deferred<unknown>();
		pendingImportGet = read.promise;
		const uploadFetch = vi.fn(async (input: RequestInfo | URL) => String(input) === '/api/builder-import'
			? response({ id: 'job-1', status: 'ready', documentId: 'imported-proposal', report: { activityCount: 1, missingMedia: [], warnings: [] } })
			: response({ authoring: true, readOnlyRendering: true, mode: 'on', reason: 'enabled', notice: '' }));
		await mount(fixture(['instructions']), {}, uploadFetch);
		click(button('Unggah bahan'));
		const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]')!;
		Object.defineProperty(fileInput, 'files', { configurable: true, value: [new File(['mock'], 'page.png', { type: 'image/png' })] });
		act(() => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
		click(button('Baca halaman'));
		await act(async () => { await Promise.resolve(); await Promise.resolve(); });
		click(button('Tinjau usulan'));
		await act(async () => { await Promise.resolve(); await Promise.resolve(); });
		await act(async () => root.unmount());
		read.resolve(importedRecord());
		await read.promise;
		expect(host.querySelector('.bd-tool-proposal')).toBeNull();
		expect(host.querySelectorAll('.bd-activity')).toHaveLength(0);
	});

	it('blocks book import while a recovered local draft awaits a user decision', async () => {
		const server = fixture(['instructions']);
		const recovery = structuredClone(server);
		recovery.document.activities[0].title = 'Recovered local title';
		localStorage.setItem('laras-builder:faculty-1:draft-1', JSON.stringify({ at: Date.now(), baseRevision: 6, envelope: recovery }));
		const fetchMock = vi.fn(async (_input: RequestInfo | URL) => response({ authoring: true, readOnlyRendering: true, mode: 'on', reason: 'enabled', notice: '' }));
		await mount(server, {}, fetchMock);
		expect(host.querySelector('.bd-recovery')).toBeTruthy();
		click(button('Unggah bahan'));
		expect(button('Unggah bahan').disabled).toBe(true);
		expect(fetchMock.mock.calls.some(([input]) => String(input) === '/api/builder-import')).toBe(false);
		expect(service.send.mock.calls.some(call => call[1].body.action === 'savedGet')).toBe(false);
	});

	it('inserts a scope-less legacy activity template through mounted picker, then undo/redo/save with remapped assessment keys', async () => {
		const legacy = fixture(['question_group']);
		legacy.document.activities[0].title = 'Legacy equal columns';
		legacy.document.activities[0].layout = undefined;
		for (const block of legacy.document.activities[0].blocks) delete block.appearance;
		legacyTemplateEnvelope = legacy;
		savedItems = [{ id: 'legacy-item', title: 'Legacy activity', kind: 'template', revision: 2, created: '2020-01-01T00:00:00.000Z' }];
		await mount(fixture(['instructions']));
		openSavedItems();
		await act(async () => { await Promise.resolve(); await Promise.resolve(); });
		click(button('Template kegiatan'));
		click(button('Sisipkan salinan'));
		await act(async () => { await Promise.resolve(); await Promise.resolve(); });
		const titles = [...host.querySelectorAll<HTMLInputElement>('.bd-activity input[aria-label^="Judul kegiatan"]')].map(item => item.value);
		expect(titles).toEqual(['Materi', 'Legacy equal columns']);
		const copy = service.send.mock.calls.find(call => call[1].body.action === 'savedGet');
		expect(copy?.[1].body.itemId).toBe('legacy-item');
		const historyAfterInsert = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
		expect(historyAfterInsert).toBe('1');
		click(button('Urungkan'));
		expect(host.querySelectorAll('.bd-activity')).toHaveLength(1);
		click(button('Ulangi'));
		expect([...host.querySelectorAll<HTMLInputElement>('.bd-activity input[aria-label^="Judul kegiatan"]')].map(item => item.value)).toEqual(titles);
		click(button('Simpan'));
		await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find(call => ['save', 'layoutLocks:save'].includes(call[1].body.action));
		const savedEnvelope = saved?.[1].body;
		const blocks = savedEnvelope.document.activities[1].blocks;
		const questionId = blocks[0].questionIds[0];
		expect(questionId).not.toBe(legacy.document.activities[0].blocks[0].questionIds[0]);
		expect(savedEnvelope.document.questionsById[questionId]).toBeTruthy();
		expect(savedEnvelope.privateKeys.answersByQuestionId[questionId]).toBeTruthy();
		expect(Object.keys(savedEnvelope.document.questionsById)).toEqual(Object.keys(savedEnvelope.privateKeys.answersByQuestionId));
	});
 it('cancels proposals and keeps multi-activity replacement unavailable without history changes', async () => {
		const ai = authoringFetch(aiProposal(2));
		await mount(fixture(['instructions'], undefined, 'meeting-00000001'), {}, ai.fetchMock);
		await openAiGenerator();
		await generateAiProposal();
		const version = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
		const operation = host.querySelector<HTMLSelectElement>('.bd-tool-proposal select')!;
		changeValue(operation, 'replace');
		expect(operation.selectedOptions[0].disabled).toBe(true);
		expect(button('Terapkan REPLACE').disabled).toBe(true);
		click(button('Batal'));
		expect(host.querySelector('.bd-tool-proposal')).toBeNull();
		expect(host.querySelector('.bd-workspace')!.getAttribute('data-history-version')).toBe(version);
		expect(button('Urungkan').disabled).toBe(true);
	});

	it.each(['selection', 'draft edit'] as const)('rejects a delayed AI proposal after captured %s changes', async (change) => {
		const pending = deferred<Response>();
		const ai = authoringFetch(aiProposal(), pending.promise);
		const envelope = fixture(['instructions'], undefined, 'meeting-00000001');
		const otherActivity = newActivity('Other activity');
		envelope.document.activities.push(otherActivity);
		await mount(envelope, {}, ai.fetchMock);
		await openAiGenerator();
		const version = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
		click(button('Buat usulan'));
		if (change === 'selection') changeValue([...host.querySelectorAll<HTMLSelectElement>('.bd-library-activity select')][0], otherActivity.id);
		else {
			click(host.querySelector('.bd-block')!);
			click([...host.querySelectorAll('aside.bd-inspector button')].find(item => item.textContent?.trim() === 'Isi')!);
			changeValue(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Isi instruksi"]')!, 'Edited while waiting');
		}
		await act(async () => { pending.resolve(response({ proposal: aiProposal() })); await pending.promise; await Promise.resolve(); });
		expect(host.querySelector('.bd-tool-proposal')).toBeNull();
		expect(host.querySelector('[role="alert"]')?.textContent).toContain('berubah saat AI bekerja');
		expect(host.querySelector('.bd-workspace')!.getAttribute('data-history-version')).toBe(version);
		expect(button('Urungkan').disabled).toBe(true);
	});

	it('rejects a delayed AI proposal after its selected target is deleted without adding another history entry', async () => {
		const pending = deferred<Response>();
		const ai = authoringFetch(aiProposal(), pending.promise);
		await mount(fixture(['instructions'], undefined, 'meeting-00000001'), {}, ai.fetchMock);
		click(host.querySelector('.bd-block')!);
		await openAiGenerator();
		click(button('Buat usulan'));
		click(host.querySelector<HTMLButtonElement>('button[aria-label="Hapus elemen"]')!);
		const afterDelete = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
		await act(async () => { pending.resolve(response({ proposal: aiProposal() })); await pending.promise; await Promise.resolve(); });
		expect(host.querySelector('.bd-tool-proposal')).toBeNull();
		expect(host.querySelector('.bd-workspace')!.getAttribute('data-history-version')).toBe(afterDelete);
		expect(host.querySelector('[role="alert"]')?.textContent).toContain('berubah saat AI bekerja');
	});

	it('blocks a reviewed AI proposal after the workspace enters read-only mode', async () => {
		const ai = authoringFetch(aiProposal());
		await mount(fixture(['instructions'], undefined, 'meeting-00000001'), {}, ai.fetchMock);
		changeValue(host.querySelector<HTMLInputElement>('.bd-activity input[aria-label^="Judul kegiatan"]')!, 'Local title');
		await openAiGenerator();
		await generateAiProposal();
		const version = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
		nextSaveFailure = new Error('ENHANCED_AUTHORING_DENIED: capability disabled');
		click(button('Simpan'));
		await act(async () => { await Promise.resolve(); await Promise.resolve(); });
		expect(host.textContent).toContain('hanya-baca');
		expect(button('Terapkan APPEND').disabled).toBe(true);
		click(button('Terapkan APPEND'));
		expect(host.querySelector('.bd-workspace')!.getAttribute('data-history-version')).toBe(version);
		expect([...host.querySelectorAll<HTMLInputElement>('.bd-activity input[aria-label^="Judul kegiatan"]')].map(item => item.value)).toEqual(['Local title']);
	});

	it('applies a ready book import through shared proposal undo and save path', async () => {
		const uploadCalls: { settings: Record<string, unknown> }[] = [];
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			if (String(input) === '/api/builder-import' && init?.body instanceof FormData) {
				const settings = JSON.parse(String(init.body.get('settings'))) as Record<string, unknown>;
				uploadCalls.push({ settings });
				return response({ id: 'job-1', status: 'ready', documentId: 'imported-proposal', report: { activityCount: 1, missingMedia: [], warnings: [] } });
			}
			return response({ authoring: true, readOnlyRendering: true, mode: 'on', reason: 'enabled', notice: '' });
		});
		const imported = fixture(['instructions']);
		imported.document.title = 'Imported book lesson';
		imported.document.activities[0].title = 'Book activity';
		imported.document.activities[0].blocks[0].content = rich('Imported page content');
		imported.document.activities[0].blocks[0].anchor = 'section';
		imported.document.activities[0].blocks[0].body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'inside imported', link: { href: '#section' } }] }] };
		importedEnvelope = imported;
		const initial = fixture(['instructions']);
		initial.document.activities[0].blocks[0].anchor = 'section';
		initial.document.activities[0].blocks[0].body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'original', link: { href: '#section' } }] }] };
		await mount(initial, {}, fetchMock);
		click(button('Unggah bahan'));
		const file = new File(['mock page'], 'page.png', { type: 'image/png' });
		const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
		Object.defineProperty(input, 'files', { configurable: true, value: [file] });
		act(() => input.dispatchEvent(new Event('change', { bubbles: true })));
		click(button('Baca halaman'));
		await act(async () => { await Promise.resolve(); await Promise.resolve(); });
		click(button('Tinjau usulan'));
		await act(async () => { await Promise.resolve(); await Promise.resolve(); });
		expect(uploadCalls).toHaveLength(1);
		expect(uploadCalls[0].settings).toMatchObject({ selection: { activityId: 'activity-1', blockIds: [] } });
		expect(JSON.stringify(uploadCalls[0].settings)).not.toMatch(/answer|privateKeys|correctOptionId/i);
		expect(host.querySelector('.bd-tool-proposal')).toBeTruthy();
		const before = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
		click(button('Terapkan APPEND'));
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(Number(before) + 1);
		expect([...host.querySelectorAll<HTMLInputElement>('.bd-activity input[aria-label^="Judul kegiatan"]')].map(item => item.value)).toEqual(['Materi', 'Book activity']);
		click(button('Urungkan'));
		expect(host.querySelectorAll('.bd-activity input[aria-label^="Judul kegiatan"]')).toHaveLength(1);
		click(button('Ulangi'));
		expect(host.querySelectorAll('.bd-activity input[aria-label^="Judul kegiatan"]')).toHaveLength(2);
		click(button('Simpan'));
		await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find(call => call[1].body.action === 'documentAnchors:save');
		const copied = saved?.[1].body.document.activities[1].blocks[0];
		expect(copied.anchor).toBe('section-2');
		expect(copied.body.content[0].content[0].link.href).toBe('#section-2');
		expect(saved?.[1].body.document.activities[0].blocks[0].body.content[0].content[0].link.href).toBe('#section');
	});

 it.each(['append', 'insert'] as const)('applies mounted %s once with captured selection, private keys, and exact undo/redo state', async (operation) => {
		const envelope = fixture(['instructions'], undefined, 'meeting-00000001');
		const originalActivity = envelope.document.activities[0];
		const second = newActivity('Insert target');
		envelope.document.activities.push(second);
		const questionBlockId = appendBlock(envelope, second.id, 'question_group');
		const questionId = second.blocks.find(item => item.id === questionBlockId)!.questionIds![0];
		envelope.privateKeys.answersByQuestionId[questionId].explanation = rich('PRIVATE_EXISTING_ANSWER');
		const baseline = structuredClone(envelope);
		const ai = authoringFetch(aiProposal(2));
		await mount(envelope, {}, ai.fetchMock);
		changeValue([...host.querySelectorAll<HTMLSelectElement>('.bd-library-activity select')][0], second.id);
		click(host.querySelector(`#builder-block-${questionBlockId}`)!);
		await openAiGenerator();
		const beforeHistory = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
		await generateAiProposal();
		const generateRequest = ai.requests.find(item => item.body.action === 'generate')!;
		const sent = JSON.stringify(generateRequest.body);
		expect(generateRequest.body.selection).toEqual({ activityId: second.id, blockIds: [questionBlockId], groupId: undefined });
		for (const secret of ['PRIVATE_EXISTING_ANSWER', 'PRIVATE_PROPOSAL_EXPLANATION', 'PRIVATE_PROPOSAL_QUOTE', 'PRIVATE_TEACHER_NOTE', 'correctOptionId', 'privateKeys']) expect(sent).not.toContain(secret);
		expect(host.querySelector('.bd-tool-proposal')?.textContent).not.toContain('PRIVATE_PROPOSAL_EXPLANATION');
		changeValue(host.querySelector<HTMLSelectElement>('.bd-tool-proposal select')!, operation);
		click(button(`Terapkan ${operation.toUpperCase()}`));
		const appliedTitles = [...host.querySelectorAll<HTMLInputElement>('.bd-activity input[aria-label^="Judul kegiatan"]')].map(input => input.value);
		expect(appliedTitles).toEqual(operation === 'append'
			? [originalActivity.title, second.title, 'Proposed quiz', 'Proposed reading']
			: [originalActivity.title, 'Proposed quiz', 'Proposed reading', second.title]);
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(Number(beforeHistory) + 1);
		const appliedBlockIds = [...host.querySelectorAll<HTMLElement>('.bd-block')].map(item => item.id);
		expect(button('Urungkan').disabled).toBe(false);
		click(button('Urungkan'));
		expect(button('Urungkan').disabled).toBe(true);
		expect([...host.querySelectorAll<HTMLInputElement>('.bd-activity input[aria-label^="Judul kegiatan"]')].map(input => input.value)).toEqual(baseline.document.activities.map(item => item.title));
		click(button('Ulangi'));
		expect([...host.querySelectorAll<HTMLElement>('.bd-block')].map(item => item.id)).toEqual(appliedBlockIds);
		click(button('Simpan'));
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find(call => call[1].body.action === 'save');
		expect(saved?.[1].body.privateKeys.answersByQuestionId[questionId].explanation, JSON.stringify(service.send.mock.calls.map(call => ({ action: call[1].body.action, nested: call[1].body.nestedRichText })))).toEqual(rich('PRIVATE_EXISTING_ANSWER'));
		expect(Object.values(saved?.[1].body.privateKeys.answersByQuestionId || {}).some((key: any) => key.explanation?.content?.[0]?.content?.[0]?.text === 'PRIVATE_PROPOSAL_EXPLANATION')).toBe(true);
	});

	it.each(['activity', 'block', 'group'] as const)('confirms mounted replacement of a captured %s while preserving its scope and unrelated locks/keys', async (scope) => {
		const envelope = fixture(['instructions', 'question_group', 'acknowledgement'], undefined, 'meeting-00000001');
		const activity = envelope.document.activities[0];
		const replacedBlock = activity.blocks[1];
		const removedQuestionId = replacedBlock.questionIds![0];
		envelope.privateKeys.answersByQuestionId[removedQuestionId].explanation = rich('PRIVATE_REMOVED_ANSWER');
		const activityId = activity.id;
		let innerId = '', outerId = '';
		if (scope !== 'activity') {
			outerId = addLayoutGroup(activity, 'section');
			innerId = addLayoutGroup(activity, 'container', outerId);
			insertBlockIntoLayout(activity, replacedBlock.id, innerId);
			const outer = findLayoutGroup(activity.layout!, outerId)!;
			outer.title = 'Preserved section';
			outer.appearance = { padding: 'lg', shadow: 'sm' };
			outer.background = { mode: 'solid', token: 'surface-2' };
			const inner = findLayoutGroup(activity.layout!, innerId)!;
			inner.title = 'Preserved container';
			inner.appearance = { radius: 'lg', hover: 'lift' };
			inner.responsive = { mobile: { columns: 1, padding: 'sm' } };
		}
		const otherActivity = newActivity('Locked outside activity');
		envelope.document.activities.push(otherActivity);
		const outsideQuestionBlockId = appendBlock(envelope, otherActivity.id, 'question_group');
		otherActivity.blocks[0].layoutLocked = true;
		const outsideQuestionId = otherActivity.blocks.find(item => item.id === outsideQuestionBlockId)!.questionIds![0];
		envelope.privateKeys.answersByQuestionId[outsideQuestionId].explanation = rich('PRIVATE_PRESERVED_ANSWER');
		const baseline = structuredClone(envelope);
		const ai = authoringFetch(aiProposal());
		await mount(envelope, {}, ai.fetchMock);
		if (scope === 'block') click(host.querySelector(`#builder-block-${replacedBlock.id}`)!);
		if (scope === 'group') click(host.querySelector(`#builder-group-${innerId}`)!);
		if (scope === 'activity') click(button('Pengaturan kegiatan 1'));
		await openAiGenerator();
		const beforeHistory = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
		await generateAiProposal();
		const beforeRenderedBlockIds = [...host.querySelectorAll<HTMLElement>('.bd-block')].map(item => item.id);
		changeValue(host.querySelector<HTMLSelectElement>('.bd-tool-proposal select')!, 'replace');
		const pane = host.querySelector('.bd-tool-proposal')!;
		const applyButton = [...pane.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Terapkan REPLACE')!;
		expect(applyButton.disabled).toBe(true);
		click(pane.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
		expect(applyButton.disabled).toBe(false);
		click(applyButton);
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(Number(beforeHistory) + 1);
		const replacedActivityId = host.querySelector<HTMLElement>(`#builder-activity-${activityId}`);
		expect(replacedActivityId).toBeTruthy();
		const historyAfterApply = [...host.querySelectorAll<HTMLElement>('.bd-block')].map(item => item.id);
		click(button('Urungkan'));
		expect(button('Urungkan').disabled).toBe(true);
		expect([...host.querySelectorAll<HTMLElement>('.bd-block')].map(item => item.id)).toEqual(beforeRenderedBlockIds);
		click(button('Ulangi'));
		expect([...host.querySelectorAll<HTMLElement>('.bd-block')].map(item => item.id)).toEqual(historyAfterApply);
		click(button('Simpan'));
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find(call => ['save', 'layoutLocks:save', 'themeColors:save', 'detailedStyles:save', 'responsiveStyles:save'].includes(call[1].body.action));
		const savedActivities = saved?.[1].body.document.activities;
		const savedActivity = savedActivities.find((item: { id: string }) => item.id === activityId);
		expect(savedActivities[1].id).toBe(otherActivity.id);
		expect(savedActivity.blocks.some((block: { id: string }) => block.id === replacedBlock.id)).toBe(false);
		expect(savedActivity.blocks.some((block: { type: string }) => block.type === 'question_group')).toBe(true);
		expect(saved?.[1].body.privateKeys.answersByQuestionId[removedQuestionId]).toBeUndefined();
		expect(saved?.[1].body.privateKeys.answersByQuestionId[outsideQuestionId].explanation).toEqual(rich('PRIVATE_PRESERVED_ANSWER'));
		expect(savedActivities[1].blocks[0].layoutLocked).toBe(true);
		if (scope !== 'activity') {
			const savedOuter = findLayoutGroup(savedActivity.layout, outerId)!;
			const savedInner = findLayoutGroup(savedActivity.layout, innerId)!;
			expect(savedOuter).toMatchObject({ title: 'Preserved section', appearance: { padding: 'lg', shadow: 'sm' }, background: { mode: 'solid', token: 'surface-2' } });
			expect(savedInner).toMatchObject({ title: 'Preserved container', appearance: { radius: 'lg', hover: 'lift' }, responsive: { mobile: { columns: 1, padding: 'sm' } } });
			if (scope === 'block') expect(savedInner.children[0]).toMatchObject({ kind: 'block', blockId: savedActivity.blocks.find((block: { type: string }) => block.type === 'question_group').id });
		}
	});

	it.each([
		['instructions', undefined, 'Isi instruksi'], ['image', undefined, 'bd-media-editor'],
		['audio', undefined, 'bd-media-editor'], ['video', undefined, 'bd-media-editor'],
		['reference', undefined, 'Tautan HTTPS'], ['question_group', 'single_choice', 'Pertanyaan'],
		['question_group', 'short_answer', 'Pertanyaan'], ['matching', undefined, 'Pernyataan'],
		['gap_passage', undefined, 'Susun teks dan isian'], ['writing', undefined, 'Pertanyaan'],
		['reflection', undefined, 'Pertanyaan'], ['acknowledgement', undefined, 'Teks konfirmasi'],
		['lesson', undefined, 'Tujuan'],
	] as const)('dispatches selected %s %s through its mounted inspector and saves the selected style', async (kind, variant, expected) => {
		await mount(fixture([kind], variant));
		click(host.querySelector('.bd-block')!);
		const inspector = host.querySelector('aside.bd-inspector')!;
		expect(inspector.textContent).toContain('Pengaturan elemen');
		const contentTab = [...inspector.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Isi')!;
		click(contentTab);
		if (expected === 'bd-media-editor') expect(inspector.querySelector('.bd-media-editor')).toBeTruthy();
		else expect(inspector.textContent).toContain(expected);
		click(button('Tampilan'));
		const shadow = [...inspector.querySelectorAll<HTMLSelectElement>('.bd-appearance-controls select')]
			.find(select => select.closest('label')?.textContent?.includes('Bayangan'))!;
		changeValue(shadow, 'sm');
		expect(host.querySelector('.bl-block[data-block-id]')?.className).toContain('ba-shadow-sm');
		click(button('Simpan'));
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find((call) => call[1].body.action === 'detailedStyles:save');
		expect(saved?.[1].body.document.activities[0].blocks[0].appearance.shadow).toBe('sm');
		expect(saved?.[1].body.privateKeys).toEqual(serverEnvelope.privateKeys);
	});

	it('applies, cancels, undoes, redoes, and saves a document-scoped block anchor in one history step', async () => {
		const initial = fixture(['instructions']);
		initial.document.activities[0].blocks[0].body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'jump', link: { href: '#intro' } }] }] };
		await mount(initial);
		click(host.querySelector('.bd-block')!);
		click(button('Ubah'));
		changeValue(host.querySelector<HTMLInputElement>('input[aria-label="Nama tautan bagian"]')!, 'discarded');
		click(button('Batal'));
		expect(host.textContent).toContain('Belum diatur');
		click(button('Ubah'));
		changeValue(host.querySelector<HTMLInputElement>('input[aria-label="Nama tautan bagian"]')!, 'intro');
		click(button('Terapkan'));
		expect(host.querySelector('[data-block-id]')?.id).toMatch(/-intro$/);
		click(button('Urungkan'));
		expect(host.querySelector('[data-block-id]')?.id).toBe('');
		click(button('Ulangi'));
		expect(host.querySelector('[data-block-id]')?.id).toMatch(/-intro$/);
		click(button('Simpan'));
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find(call => call[1].body.action === 'documentAnchors:save');
		expect(saved?.[1].body.document.activities[0].blocks[0].anchor).toBe('intro');
		expect(saved?.[1].body.document.activities[0].blocks[0].body.content[0].content[0].link.href).toBe('#intro');
	});

	it('keeps an anchor-bearing draft read-only when the backend omits the anchor capability', async () => {
		const initial = fixture(['instructions']);
		initial.document.activities[0].blocks[0].anchor = 'intro';
		await mount(initial, { documentAnchors: false });
		expect(host.textContent).toContain('Backend belum mendukung tautan bagian');
		click(host.querySelector('.bd-block')!);
		expect(button('Ubah').matches(':disabled')).toBe(true);
	});

	it('commits, resets, undoes, and saves timed captions without changing protected media or assessment data', async () => {
		const initial = fixture(['audio', 'question_group']);
		const audio = initial.document.activities[0].blocks[0];
		audio.asset = { fileId: 'audio-file-000001', filename: 'lesson.mp3', version: 3, name: 'Lesson audio' };
		audio.transcript = 'Existing full transcript';
		audio.label = 'Descriptive caption';
		audio.playback = { loop: true, muted: true };
		audio.captions = { language: 'en', cues: [{ start: 0, end: 2, text: 'Old cue' }] };
		const questionId = initial.document.activities[0].blocks[1].questionIds![0];
		initial.privateKeys.answersByQuestionId[questionId].explanation = rich('PRIVATE_CAPTION_TEST');
		await mount(initial);
		click(host.querySelector('.bd-block')!);
		click(button('Isi'));
		const textarea = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Cue subtitel"]')!;
		changeTextarea(textarea, '0\t2\tNew cue');
		expect(textarea.value).toBe('0\t2\tNew cue');
		const historyBeforeCancel = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
		click(button('Batalkan draf cue'));
		expect(textarea.value).toBe('0\t2\tOld cue');
		expect(host.querySelector('.bd-workspace')!.getAttribute('data-history-version')).toBe(historyBeforeCancel);
		changeTextarea(textarea, '0\t2\tNew cue');
		click(button('Terapkan cue'));
		const version1 = Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'));
		expect(button('Urungkan').disabled).toBe(false);
		expect(host.querySelector('.bd-workspace')!.textContent).toContain('New cue');
		click(button('Urungkan'));
		expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Cue subtitel"]')!.value).toBe('0\t2\tOld cue');
		click(button('Ulangi'));
		expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Cue subtitel"]')!.value).toBe('0\t2\tNew cue');
		click(button('Hapus cue'));
		expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Cue subtitel"]')!.value).toBe('');
		click(button('Urungkan'));
		expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Cue subtitel"]')!.value).toBe('0\t2\tNew cue');
		click(button('Ulangi'));
		expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Cue subtitel"]')!.value).toBe('');
		click(button('Urungkan'));
		expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Cue subtitel"]')!.value).toBe('0\t2\tNew cue');
		click(button('Simpan'));
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find(call => call[1].body.action === 'mediaCaptions:save');
		const savedBlock = saved?.[1].body.document.activities[0].blocks[0];
		expect(savedBlock.captions).toEqual({ language: 'en', cues: [{ start: 0, end: 2, text: 'New cue' }] });
		expect(savedBlock).toMatchObject({ asset: audio.asset, transcript: audio.transcript, label: audio.label, playback: audio.playback });
		expect(saved?.[1].body.privateKeys.answersByQuestionId[questionId].explanation).toEqual(rich('PRIVATE_CAPTION_TEST'));
		expect(version1).toBeGreaterThan(0);
	});

	it('applies playback range and speed as one undoable edit and saves through its capability fence', async () => {
		const initial = fixture(['audio', 'question_group']);
		const audio = initial.document.activities[0].blocks[0];
		audio.url = 'https://example.org/lesson.mp3';
		audio.transcript = 'Keep transcript'; audio.playback = { loop: true, muted: true };
		const qid = initial.document.activities[0].blocks[1].questionIds![0];
		initial.privateKeys.answersByQuestionId[qid].explanation = rich('PRIVATE_PLAYBACK_KEY');
		await mount(initial);
		click(host.querySelector('.bd-block')!); click(button('Isi'));
		const start = host.querySelector<HTMLInputElement>('input[aria-label="Mulai pemutaran pada detik"]')!;
		const end = host.querySelector<HTMLInputElement>('input[aria-label="Akhiri pemutaran pada detik"]')!;
		changeValue(start, '0'); changeValue(end, '25');
		const beforeCancel = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
		click(button('Batalkan draf pemutaran'));
		expect(start.value).toBe(''); expect(host.querySelector('.bd-workspace')!.getAttribute('data-history-version')).toBe(beforeCancel);
		changeValue(start, '0'); changeValue(end, '25');
		const speed = host.querySelector<HTMLSelectElement>('select[aria-label="Kecepatan awal pemutaran"]')!;
		changeValue(speed, '1.5'); click(button('Terapkan pemutaran'));
		const committed = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
		expect(host.querySelector('.bd-workspace')!.textContent).toContain('25');
		click(button('Urungkan')); expect(host.querySelector<HTMLInputElement>('input[aria-label="Mulai pemutaran pada detik"]')!.value).toBe('');
		click(button('Ulangi')); expect(host.querySelector<HTMLInputElement>('input[aria-label="Mulai pemutaran pada detik"]')!.value).toBe('0'); expect(host.querySelector<HTMLSelectElement>('select[aria-label="Kecepatan awal pemutaran"]')!.value).toBe('1.5');
		click(button('Reset pemutaran')); expect(host.querySelector<HTMLInputElement>('input[aria-label="Mulai pemutaran pada detik"]')!.value).toBe('');
		click(button('Urungkan')); expect(host.querySelector<HTMLInputElement>('input[aria-label="Mulai pemutaran pada detik"]')!.value).toBe('0');
		click(button('Simpan')); await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find(call => call[1].body.action === 'mediaPlayback:save');
		const savedBlock = saved?.[1].body.document.activities[0].blocks[0];
		expect(savedBlock.playback).toMatchObject({ loop: true, muted: true, start: 0, end: 25, rate: 1.5 });
		expect(saved?.[1].body.mediaPlayback).toBe(true);
		expect(savedBlock).toMatchObject({ url: audio.url, transcript: audio.transcript });
		expect(saved?.[1].body.privateKeys.answersByQuestionId[qid].explanation).toEqual(rich('PRIVATE_PLAYBACK_KEY'));
		expect(Number(committed)).toBeGreaterThan(0);
	});

	it('indents and outdents selected list rows through the mounted workspace and saves one undoable versioned draft', async () => {
		const initial = fixture(['instructions', 'question_group']);
		const instructions = initial.document.activities[0].blocks[0];
		instructions.body = { type: 'doc', content: [
			{ type: 'heading', level: 2, content: [{ type: 'text', text: 'Keep heading' }] },
			{ type: 'list_item', list: 'number', content: [{ type: 'text', text: 'Parent', marks: ['bold'] }] },
			{ type: 'list_item', list: 'bullet', content: [{ type: 'text', text: 'Child', marks: ['italic'], link: { href: 'https://example.org' } }] },
			{ type: 'list_item', list: 'number', content: [{ type: 'text', text: 'Sibling' }] },
		] };
		const protectedEnvelope = structuredClone(initial);
		await mount(initial, { nestedRichText: true });
		click(host.querySelector('.bd-block')!); click(button('Isi'));
		const textarea = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Isi instruksi"]')!;
		const start = textarea.value.indexOf('Child'); textarea.focus(); textarea.setSelectionRange(start, start + 5);
		const before = Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'));
		click(button('Tambah inden'));
		click(button('Urungkan'));
		expect(button('Urungkan').disabled).toBe(true);
		click(button('Ulangi'));
		click(button('Simpan'));
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find(call => call[1].body.action === 'nestedLists:save');
		expect(saved?.[1].body.nestedRichText).toBe(true);
		expect(saved?.[1].body.document.activities[0].blocks[0].body.content[2]).toMatchObject({ list: 'bullet', depth: 1, content: [{ marks: ['italic'], link: { href: 'https://example.org' } }] });
		expect(saved?.[1].body.document.activities[0].blocks[0].body.content[0]).toEqual(protectedEnvelope.document.activities[0].blocks[0].body!.content[0]);
		expect(saved?.[1].body.document.activities[0].blocks[1].questionIds).toEqual(protectedEnvelope.document.activities[0].blocks[1].questionIds);
		expect(saved?.[1].body.privateKeys).toEqual(protectedEnvelope.privateKeys);
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBeGreaterThan(before);
	});

	it('keeps nested lists read-only when the advertised backend cannot preserve them', async () => {
		const initial = fixture(['instructions']);
		initial.document.activities[0].blocks[0].body = { type: 'doc', content: [
			{ type: 'list_item', list: 'number', content: [{ type: 'text', text: 'Parent' }] },
			{ type: 'list_item', list: 'bullet', depth: 1, content: [{ type: 'text', text: 'Protected nested item' }] },
		] };
		await mount(initial, { nestedRichText: false });
		click(host.querySelector('.bd-block')!);
		expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Isi instruksi"]')).toBeNull();
		expect(host.textContent).toContain('hanya-baca agar struktur');
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
		expect(service.send.mock.calls.some(call => /^(?:nestedLists:)?save$/.test(call[1].body.action))).toBe(false);
		expect(host.querySelector('.bd-block')?.querySelector('ol ul')?.textContent).toContain('Protected nested item');
	});

	it('does not fall back to unversioned save after nested-list capability rollback', async () => {
		const initial = fixture(['instructions']);
		initial.document.activities[0].blocks[0].body = { type: 'doc', content: [
			{ type: 'list_item', list: 'number', content: [{ type: 'text', text: 'Parent' }] },
			{ type: 'list_item', list: 'bullet', depth: 1, content: [{ type: 'text', text: 'Keep nested item' }] },
		] };
		await mount(initial, { nestedRichText: true });
		click(host.querySelector('.bd-block')!); click(button('Isi'));
		const textarea = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Isi instruksi"]')!;
		changeTextarea(textarea, 'Parent changed\nKeep nested item');
		nextSaveFailure = new Error('Unsupported builder action nestedLists:save');
		click(button('Simpan'));
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
		expect(service.send.mock.calls.some(call => call[1].body.action === 'nestedLists:save' && call[1].body.nestedRichText === true)).toBe(true);
		expect(service.send.mock.calls.some(call => call[1].body.action === 'save')).toBe(false);
		expect(host.textContent).toContain('Unsupported builder action nestedLists:save');
		expect(host.querySelector('.bd-block')?.textContent).toContain('Keep nested item');
	});

	it.each(['audio', 'video'] as const)('synchronizes accessible safe-text captions on native %s time updates and keeps transcript disclosure', async (kind) => {
		const initial = fixture([kind]);
		const audio = initial.document.activities[0].blocks[0];
		audio.url = kind === 'audio' ? 'https://example.org/lesson.mp3' : 'https://example.org/lesson.mp4';
		audio.transcript = 'Complete written transcript';
		audio.captions = { language: 'en', cues: [{ start: 0, end: 2, text: '<script>plain text cue</script>' }, { start: 2, end: 4, text: 'Second cue' }] };
		await mount(initial);
		const player = host.querySelector<HTMLMediaElement>('audio, video')!;
		expect(player.controls).toBe(true);
		expect(host.querySelector('.bd-media-transcript')?.textContent).toContain('Transkrip teks');
		const liveCaption = host.querySelector<HTMLElement>('.bd-media-cue')!;
		expect(liveCaption.getAttribute('aria-live')).toBe('polite');
		expect(liveCaption.getAttribute('lang')).toBe('en');
		expect(liveCaption.querySelector('script')).toBeNull();
		Object.defineProperty(player, 'readyState', { configurable: true, value: 1 });
		Object.defineProperty(player, 'currentTime', { configurable: true, writable: true, value: 0.5 });
		act(() => player.dispatchEvent(new Event('timeupdate', { bubbles: true })));
		expect(liveCaption.textContent).toBe('<script>plain text cue</script>');
		Object.defineProperty(player, 'currentTime', { configurable: true, writable: true, value: 2.5 });
		act(() => player.dispatchEvent(new Event('timeupdate', { bubbles: true })));
		expect(liveCaption.textContent).toBe('Second cue');
	});

	it('clamps authored playback ranges to finite media duration, loops within range, and preserves student speed changes', async () => {
		const initial = fixture(['audio']);
		const audio = initial.document.activities[0].blocks[0]; audio.url = 'https://example.org/range.mp3';
		audio.playback = { start: 5, end: 10, loop: true, rate: 1.5 };
		audio.captions = { cues: [{ start: 5, end: 8, text: 'Absolute cue' }] };
		await mount(initial);
		const player = host.querySelector<HTMLMediaElement>('audio')!;
		Object.defineProperty(player, 'duration', { configurable: true, value: 8 });
		Object.defineProperty(player, 'readyState', { configurable: true, value: 1 });
		let currentTime = 0;
		Object.defineProperty(player, 'currentTime', { configurable: true, get: () => currentTime, set: value => { currentTime = value; } });
		const play = vi.fn(() => Promise.resolve()); Object.defineProperty(player, 'play', { configurable: true, value: play });
		Object.defineProperty(player, 'paused', { configurable: true, value: false });
		act(() => player.dispatchEvent(new Event('loadedmetadata')));
		expect(player.currentTime).toBe(5);
		expect(player.playbackRate).toBe(1.5);
		Object.defineProperty(player, 'playbackRate', { configurable: true, writable: true, value: 1.75 });
		currentTime = 8; act(() => player.dispatchEvent(new Event('timeupdate')));
		expect(player.currentTime).toBe(5); expect(play).toHaveBeenCalledTimes(1);
		expect(host.querySelector('.bd-media-cue')?.textContent).toBe('Absolute cue');
		expect(player.playbackRate).toBe(1.75);
	});

	it('uses authored bounds safely with live duration and removes native handlers on unmount', async () => {
		const initial = fixture(['video']);
		const video = initial.document.activities[0].blocks[0]; video.url = 'https://example.org/live.webm'; video.playback = { start: 2, end: 4 };
		await mount(initial);
		const player = host.querySelector<HTMLVideoElement>('video')!;
		Object.defineProperty(player, 'duration', { configurable: true, value: Infinity });
		Object.defineProperty(player, 'readyState', { configurable: true, value: 1 });
		let currentTime = 0; Object.defineProperty(player, 'currentTime', { configurable: true, get: () => currentTime, set: value => { currentTime = value; } });
		const pause = vi.fn(); Object.defineProperty(player, 'pause', { configurable: true, value: pause });
		act(() => player.dispatchEvent(new Event('loadedmetadata'))); expect(player.currentTime).toBe(2);
		currentTime = 5; act(() => player.dispatchEvent(new Event('timeupdate'))); expect(player.currentTime).toBe(4); expect(pause).toHaveBeenCalledTimes(1);
		act(() => { root!.unmount(); }); root = null;
		act(() => player.dispatchEvent(new Event('ended'))); expect(pause).toHaveBeenCalledTimes(1);
	});

	it('reconfigures range handlers after a protected media source URL changes without autoplay', async () => {
		const initial = fixture(['video']); const video = initial.document.activities[0].blocks[0];
		video.url = 'https://example.org/old.mp4'; video.playback = { start: 3, end: 6 };
		await mount(initial); click(host.querySelector('.bd-block')!); click(button('Isi'));
		const player = host.querySelector<HTMLVideoElement>('video')!;
		let currentTime = 0; Object.defineProperty(player, 'currentTime', { configurable: true, get: () => currentTime, set: value => { currentTime = value; } });
		Object.defineProperty(player, 'duration', { configurable: true, value: 20 }); Object.defineProperty(player, 'readyState', { configurable: true, value: 1 });
		const play = vi.fn(() => Promise.resolve()); const pause = vi.fn();
		Object.defineProperty(player, 'play', { configurable: true, value: play }); Object.defineProperty(player, 'pause', { configurable: true, value: pause });
		click(button('Gunakan tautan'));
		changeValue(host.querySelector<HTMLInputElement>('input[aria-label="Tautan media"]')!, 'https://example.org/new.mp4');
		click(button('Gunakan'));
		act(() => player.dispatchEvent(new Event('loadedmetadata')));
		expect(player.currentTime).toBe(3); expect(play).not.toHaveBeenCalled();
		currentTime = 7; act(() => player.dispatchEvent(new Event('timeupdate')));
		expect(player.currentTime).toBe(6); expect(pause).toHaveBeenCalledTimes(1);
	});

	it('retains local caption data and blocks writes when the initially advertised backend capability is absent', async () => {
		const initial = fixture(['audio']);
		initial.document.activities[0].blocks[0].captions = { cues: [{ start: 0, end: 1, text: 'Keep this cue' }] };
		initial.document.activities[0].blocks[0].url = 'https://example.org/audio.mp3';
		await mount(initial, { mediaCaptions: false });
		click(button('Tambah Teks & instruksi'));
		click(button('Simpan'));
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
		expect(service.send.mock.calls.some(call => /^(?:mediaCaptions:)?save$/.test(call[1].body.action))).toBe(false);
		expect(host.textContent).toContain('Backend belum mendukung keterangan media bertanda waktu');
		expect(host.querySelector('.bd-media-cue')?.textContent).toBe('Keep this cue');
	});

	it('refuses playback range writes when backend capability is absent without unversioned fallback', async () => {
		const initial = fixture(['audio']);
		initial.document.activities[0].blocks[0].playback = { start: 0, end: 6, rate: 1.25 };
		await mount(initial, { mediaPlayback: false });
		click(host.querySelector('.bd-block')!); click(button('Isi'));
		const end = host.querySelector<HTMLInputElement>('input[aria-label="Akhiri pemutaran pada detik"]')!;
		changeValue(end, '8'); const before = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
		click(button('Terapkan pemutaran'));
		expect(host.querySelector('.bd-workspace')!.getAttribute('data-history-version')).toBe(before);
		expect(host.textContent).toContain('Backend belum mendukung rentang dan kecepatan pemutaran media');
		click(button('Tambah Teks & instruksi')); click(button('Simpan'));
		await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
		expect(service.send.mock.calls.some(call => /^(?:mediaPlayback:)?save$/.test(call[1].body.action))).toBe(false);
		expect(host.textContent).toContain('Backend belum mendukung rentang dan kecepatan pemutaran media');
	});

	it('does not fall back to an unversioned write when caption capability rolls back during the session', async () => {
		const initial = fixture(['audio']);
		const audio = initial.document.activities[0].blocks[0];
		audio.url = 'https://example.org/audio.mp3';
		audio.captions = { cues: [{ start: 0, end: 1, text: 'Before edit' }] };
		await mount(initial, { mediaCaptions: true });
		click(host.querySelector('.bd-block')!);
		click(button('Isi'));
		changeTextarea(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Cue subtitel"]')!, '0\t1\tAfter rollback');
		click(button('Terapkan cue'));
		nextSaveFailure = new Error('Unsupported builder action mediaCaptions:save');
		click(button('Simpan'));
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
		expect(service.send.mock.calls.some(call => call[1].body.action === 'mediaCaptions:save')).toBe(true);
		expect(service.send.mock.calls.some(call => call[1].body.action === 'save')).toBe(false);
		expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Cue subtitel"]')!.value).toBe('0\t1\tAfter rollback');
		expect(host.textContent).toContain('Unsupported builder action mediaCaptions:save');
	});

	it.each([
		{ initial: [] as ('instructions' | 'image' | 'reflection')[], where: 'position 0', before: 'end' },
		{ initial: ['image'] as ('instructions' | 'image' | 'reflection')[], where: 'position 1', before: 'end' },
		{ initial: ['instructions', 'image', 'reflection'] as ('instructions' | 'image' | 'reflection')[], where: 'many blocks', before: 'before first' },
	])('adds through the rendered library at $where', async ({ initial, before }) => {
		await mount(fixture(initial));
		if (before === 'before first') click(button('Sisipkan elemen sebelum Teks & instruksi'));
		click(button('Tambah Teks & instruksi'));
		const blocks = [...host.querySelectorAll('.bd-block')];
		expect(blocks).toHaveLength(initial.length + 1);
		if (before === 'before first') expect(blocks[0].textContent).toContain('Teks & instruksi');
		else expect(blocks.at(-1)?.textContent).toContain('Teks & instruksi');
	});

	it('undoes and redoes one mounted add, then sends the current document envelope on save', async () => {
		await mount();
		click(button('Tambah Teks & instruksi'));
		expect(host.querySelectorAll('.bd-block')).toHaveLength(1);
		click(button('Urungkan'));
		expect(host.querySelectorAll('.bd-block')).toHaveLength(0);
		click(button('Ulangi'));
		expect(host.querySelectorAll('.bd-block')).toHaveLength(1);
		click(button('Simpan'));
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find((call) => call[1].body.action === 'save');
		expect(saved).toBeTruthy();
		expect(Object.keys(saved![1].body).sort()).toEqual(['action', 'baseRevision', 'commandId', 'document', 'id', 'privateKeys']);
		expect(saved![1].body).toEqual({
			id: 'draft-1',
			baseRevision: 7,
			commandId: expect.any(String),
			document: expect.objectContaining({ activities: [expect.objectContaining({ blocks: [expect.objectContaining({ type: 'instructions' })] })] }),
			privateKeys: serverEnvelope.privateKeys,
			action: 'save',
		});
	});

	it('commits detailed appearance through the mounted inspector with reset, undo/redo, and versioned save', async () => {
		await mount(fixture(['instructions']));
		click(host.querySelector('.bd-block')!);
		click([...host.querySelectorAll('summary')].find(item => item.textContent?.trim() === 'Garis tepi dan sudut terperinci')!);
		const detail = host.querySelector('.bd-detail-style-panel')!;
		changeValue([...detail.querySelectorAll<HTMLSelectElement>('select')].find(select => select.closest('label')?.textContent?.includes('Gaya garis'))!, 'dashed');
		const borderInputs = [...detail.querySelectorAll<HTMLInputElement>('input[type="number"]')].slice(0, 4);
		for (const input of borderInputs) changeValue(input, '2');
		click([...detail.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Terapkan lebar garis')!);
		let canvasBlock = host.querySelector<HTMLElement>('.bl-block[data-block-id]')!;
		expect(canvasBlock.className).toContain('ba-has-border-detail');
		expect(canvasBlock.getAttribute('style')).toContain('--ba-border-top-width: 2px');
		click(button('Urungkan'));
		canvasBlock = host.querySelector<HTMLElement>('.bl-block[data-block-id]')!;
		expect(canvasBlock.getAttribute('style')).not.toContain('--ba-border-top-width');
		click(button('Ulangi'));
		canvasBlock = host.querySelector<HTMLElement>('.bl-block[data-block-id]')!;
		expect(canvasBlock.getAttribute('style')).toContain('--ba-border-top-width: 2px');
		const numericInputs = [...detail.querySelectorAll<HTMLInputElement>('input[type="number"]')];
		for (const input of numericInputs.slice(4)) changeValue(input, '6');
		click([...detail.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Terapkan radius')!);
		canvasBlock = host.querySelector<HTMLElement>('.bl-block[data-block-id]')!;
		expect(canvasBlock.className).toContain('ba-has-corners');
		click(button('Reset gaya'));
		canvasBlock = host.querySelector<HTMLElement>('.bl-block[data-block-id]')!;
		expect(canvasBlock.className).not.toContain('ba-has-border-detail');
		expect(canvasBlock.className).not.toContain('ba-has-corners');
		click(button('Urungkan'));
		canvasBlock = host.querySelector<HTMLElement>('.bl-block[data-block-id]')!;
		expect(canvasBlock.className).toContain('ba-has-corners');
		click(button('Simpan'));
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find((call) => call[1].body.action === 'detailedStyles:save');
		expect(saved?.[1].body.document.activities[0].blocks[0].appearance).toEqual({
			borderDetail: { style: 'dashed', linked: true, widths: { top: 2, right: 2, bottom: 2, left: 2 } },
			corners: { linked: true, topLeft: 6, topRight: 6, bottomRight: 6, bottomLeft: 6 },
		});
	});

	it('commits hover appearance through the mounted inspector with reset, undo/redo, and versioned save', async () => {
		await mount(fixture(['instructions']));
		click(host.querySelector('.bd-block')!);
		const hover = [...host.querySelectorAll<HTMLSelectElement>('.bd-appearance-controls select')].find(select => select.closest('label')?.textContent?.includes('Efek saat diarahkan'))!;
		expect(hover).toBeTruthy();
		changeValue(hover, 'lift');
		let canvasBlock = host.querySelector<HTMLElement>('.bl-block[data-block-id]')!;
		expect(canvasBlock.className).toContain('ba-hover-lift');
		click(button('Urungkan'));
		canvasBlock = host.querySelector<HTMLElement>('.bl-block[data-block-id]')!;
		expect(canvasBlock.className).not.toContain('ba-hover-');
		click(button('Ulangi'));
		canvasBlock = host.querySelector<HTMLElement>('.bl-block[data-block-id]')!;
		expect(canvasBlock.className).toContain('ba-hover-lift');
		click(button('Reset gaya'));
		canvasBlock = host.querySelector<HTMLElement>('.bl-block[data-block-id]')!;
		expect(canvasBlock.className).not.toContain('ba-hover-');
		click(button('Urungkan'));
		expect(host.querySelector('.bl-block[data-block-id]')?.className).toContain('ba-hover-lift');
		click(button('Simpan'));
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find((call) => call[1].body.action === 'detailedStyles:save');
		expect(saved?.[1].body.document.activities[0].blocks[0].appearance).toEqual({ hover: 'lift' });
	});

	it('edits and locally resets responsive detail through one undoable workspace mutation and saves the responsive envelope', async () => {
		const envelope = fixture(['instructions']);
		envelope.document.activities[0].blocks[0].appearance = { borderDetail: { style: 'solid', widths: { top: 1 } }, corners: { topLeft: 12 }, responsive: { tablet: { borderDetail: { style: 'dotted', widths: { top: 2 } } }, mobile: { corners: { topLeft: 24 } } } };
		await mount(envelope, { responsiveBorderRadius: true });
		click(host.querySelector('.bd-block')!);
		click([...host.querySelectorAll('summary')].find(item => item.textContent?.trim() === 'Garis tepi dan sudut terperinci')!);
		const detail = host.querySelector('.bd-detail-style-panel')!;
		const device = [...detail.querySelectorAll<HTMLSelectElement>('select')].find(item => item.getAttribute('aria-label') === 'Perangkat tampilan garis dan sudut')!;
		changeValue(device, 'tablet');
		const border = [...detail.querySelectorAll<HTMLInputElement>('input[type="number"]')].slice(0, 4);
		for (const input of border) changeValue(input, '0');
		click([...detail.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Terapkan lebar garis')!);
		let canvasBlock = host.querySelector<HTMLElement>('.bl-block[data-block-id]')!;
		expect(canvasBlock.getAttribute('style')).toMatch(/--ba-tablet-border-top-width:\s*0px/);
		click(button('Urungkan'));
		expect(host.querySelector('.bl-block[data-block-id]')?.getAttribute('style')).toMatch(/--ba-tablet-border-top-width:\s*2px/);
		click(button('Ulangi'));
		canvasBlock = host.querySelector<HTMLElement>('.bl-block[data-block-id]')!;
		expect(canvasBlock.getAttribute('style')).toMatch(/--ba-tablet-border-top-width:\s*0px/);
		click([...detail.querySelectorAll('button')].find(item => item.textContent?.includes('Reset override tablet'))!);
		canvasBlock = host.querySelector<HTMLElement>('.bl-block[data-block-id]')!;
		expect(canvasBlock.className).not.toContain('ba-tablet-has-border-detail');
		expect(canvasBlock.className).toContain('ba-mobile-has-corners');
		click(button('Urungkan'));
		expect(host.querySelector('.bl-block[data-block-id]')?.className).toContain('ba-tablet-has-border-detail');
		click(button('Ulangi'));
		changeValue(device, 'mobile');
		const corners = [...detail.querySelectorAll<HTMLInputElement>('input[type="number"]')].slice(4);
		for (const input of corners) changeValue(input, '0');
		click([...detail.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Terapkan radius')!);
		click(button('Simpan'));
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find(call => call[1].body.action === 'responsiveStyles:save');
		expect(saved?.[1].body.responsiveBorderRadius).toBe(true);
		expect(saved?.[1].body.document.activities[0].blocks[0].appearance).toEqual({ borderDetail: { style: 'solid', widths: { top: 1 } }, corners: { topLeft: 12 }, responsive: { mobile: { corners: { linked: true, topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 } } } });
	});

	it('confirms or cancels one document-wide appearance reset with one undo/redo and preserved data', async () => {
		const envelope = fixture(['instructions', 'image']);
		envelope.document.theme = { palette: { light: { base: { foreground: '#101010', background: '#FAFAFA' }, accent: { foreground: '#FFFFFF', background: '#8A0000' } }, dark: { base: { foreground: '#EEEEEE', background: '#101010' }, accent: { foreground: '#FFFFFF', background: '#740000' } } } };
		const first = envelope.document.activities[0];
		const outerId = addLayoutGroup(first, 'section');
		const innerId = addLayoutGroup(first, 'container', outerId);
		const imageId = first.blocks[1].id;
		insertBlockIntoLayout(first, imageId, innerId);
		const outer = findLayoutGroup(first.layout!, outerId)!;
		const inner = findLayoutGroup(first.layout!, innerId)!;
		outer.background = { mode: 'solid', token: 'surface-2' };
		outer.responsive = { tablet: { columns: 2, background: { mode: 'solid', token: 'action' } }, mobile: { columns: 1 } };
		outer.paddingSides = { top: 12, left: 8 };
		outer.appearance = { padding: 'lg', shadow: 'md', hover: 'lift' };
		inner.layoutLocked = true;
		inner.appearance = { color: 'accent', borderDetail: { style: 'dashed' }, corners: { topLeft: 6 } };
		first.blocks[0].layoutLocked = true;
		first.blocks[0].appearance = { size: 'xl', customColors: { light: { foreground: '#000000', background: '#FFFFFF' }, dark: { foreground: '#FFFFFF', background: '#000000' } } };
		first.blocks[1].appearance = { radius: 'lg', shadow: 'sm', hover: 'emphasis' };
		const second = newActivity('Kegiatan kedua');
		envelope.document.activities.push(second);
		appendBlock(envelope, second.id, 'reflection');
		second.blocks[0].appearance = { background: 'accent', border: 'accent', padding: 'md' };
		const baseline = structuredClone(envelope);
		await mount(envelope);
		const baselineHistory = host.querySelector('.bd-workspace')?.getAttribute('data-history-version');
		const trigger = button('Reset tampilan dokumen');
		expect(trigger.disabled).toBe(false);
		click(trigger);
		expect(document.body.querySelector('[role="alertdialog"]')?.textContent).toContain('Latar khusus bagian dan latar tablet/ponsel');
		expect(document.body.querySelector('[role="alertdialog"]')?.textContent).toContain('palet warna dokumen');
		expect(document.body.querySelector('[role="alertdialog"]')?.textContent).toContain('kunci jawaban');
		click([...document.body.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Batal')!);
		expect(button('Urungkan').disabled).toBe(true);
		expect(host.querySelector('.bd-workspace')?.getAttribute('data-history-version')).toBe(baselineHistory);
		expect(host.querySelector('.bl-block')?.className).toContain('ba-size-xl');
		click(button('Reset tampilan dokumen'));
		click([...document.body.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Reset tampilan')!);
		expect(button('Urungkan').disabled).toBe(false);
		expect(Number(host.querySelector('.bd-workspace')?.getAttribute('data-history-version'))).toBe(Number(baselineHistory) + 1);
		expect(host.querySelector('.bl-block')?.className).not.toContain('ba-size-xl');
		click(button('Urungkan'));
		expect(button('Urungkan').disabled).toBe(true);
		expect(button('Ulangi').disabled).toBe(false);
		expect(host.querySelector('.bl-block')?.className).toContain('ba-size-xl');
		click(button('Ulangi'));
		expect(button('Ulangi').disabled).toBe(true);
		expect(host.querySelector('.bl-block')?.className).not.toContain('ba-size-xl');
		click(button('Simpan'));
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find(call => call[1].body.action === 'themePalette:save');
		const savedDocument = saved?.[1].body.document;
		expect(saved?.[1].body.themePalette).toBe(true);
		expect(savedDocument.theme).toEqual(baseline.document.theme);
		expect(savedDocument.activities[0].blocks.map((item: { appearance?: unknown }) => item.appearance)).toEqual([undefined, undefined]);
		expect(savedDocument.activities[1].blocks[0].appearance).toBeUndefined();
		const savedOuter = findLayoutGroup(savedDocument.activities[0].layout, outerId)!;
		const savedInner = findLayoutGroup(savedDocument.activities[0].layout, innerId)!;
		expect(savedOuter.appearance).toEqual({ padding: 'lg' });
		expect(savedOuter.background).toEqual(baseline.document.activities[0].layout && findLayoutGroup(baseline.document.activities[0].layout!, outerId)?.background);
		expect(savedOuter.responsive).toEqual(findLayoutGroup(baseline.document.activities[0].layout!, outerId)?.responsive);
		expect(savedOuter.paddingSides).toEqual({ top: 12, left: 8 });
		expect(savedInner.layoutLocked).toBe(true);
		expect(savedInner.appearance).toBeUndefined();
		expect(saved?.[1].body.privateKeys).toEqual(baseline.privateKeys);
	});

	it('disables document-wide reset when the backend cannot preserve advanced appearance fields', async () => {
		const envelope = fixture(['instructions']);
		envelope.document.activities[0].blocks[0].appearance = { shadow: 'md', hover: 'lift', customColors: { light: { foreground: '#000000', background: '#FFFFFF' }, dark: { foreground: '#FFFFFF', background: '#000000' } } };
		await mount(envelope, { customColors: false });
		expect(button('Reset tampilan dokumen').disabled).toBe(true);
	});

	it('keeps local edits after a save revision conflict and exposes recovery actions', async () => {
		await mount();
		service.send.mockImplementation(async (_path: string, options: { body: { action: string } }) => {
			if (options.body.action === 'get') return structuredClone(record);
			throw new Error('REVISION_CONFLICT: draft changed');
		});
		click(button('Tambah Teks & instruksi'));
		click(button('Simpan'));
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
		expect(host.querySelector('[role="alert"]')?.textContent).toContain('REVISION_CONFLICT');
		expect(host.querySelectorAll('.bd-block')).toHaveLength(1);
		expect(button('Unduh salinan draf')).toBeTruthy();
		expect(button('Muat versi server')).toBeTruthy();
	});

	it('blocks delete and reorder for a locked block, then allows them after unlocking', async () => {
		const envelope = fixture(['instructions', 'image']);
		envelope.document.activities[0].blocks[0].layoutLocked = true;
		await mount(envelope);
		const articles = [...host.querySelectorAll<HTMLElement>('.bd-block')];
		const deleteLocked = articles[0].querySelector<HTMLButtonElement>('[aria-label="Hapus elemen"]')!;
		const moveLocked = articles[0].querySelector<HTMLButtonElement>('[aria-label="Turunkan elemen"]')!;
		expect(deleteLocked.disabled).toBe(true);
		expect(moveLocked.disabled).toBe(true);
		click(articles[0]);
		click(button('Buka kunci tata letak sendiri'));
		const unlocked = [...host.querySelectorAll<HTMLElement>('.bd-block')][0];
		expect(unlocked.querySelector<HTMLButtonElement>('[aria-label="Turunkan elemen"]')!.disabled).toBe(false);
		click(unlocked.querySelector<HTMLButtonElement>('[aria-label="Turunkan elemen"]')!);
		expect([...host.querySelectorAll('.bd-block-title')].map((item) => item.textContent?.trim())).toEqual(['Gambar', 'Teks & instruksi']);
		const firstNowImage = [...host.querySelectorAll<HTMLElement>('.bd-block')][1];
		click(firstNowImage.querySelector<HTMLButtonElement>('[aria-label="Hapus elemen"]')!);
		expect(host.querySelectorAll('.bd-block')).toHaveLength(1);
	});

	it('edits responsive presentation visibility through the mounted inspector with reset, undo/redo, and versioned save', async () => {
		await mount(fixture(['instructions']));
		click(host.querySelector('.bd-block')!);
		click(button('Tampilan'));
		const mode = host.querySelector<HTMLSelectElement>('select[aria-label="Tampilan perangkat"]')!;
		expect(mode).toBeTruthy();
		changeValue(mode, 'hidden');
		const canvasBlock = host.querySelector<HTMLElement>('.bl-block[data-block-id]')!;
		expect(canvasBlock.dataset.presentationDesktop).toBe('hidden');
		expect(canvasBlock.dataset.editorPresentationHidden).toBe('true');
		click(button('Urungkan'));
		expect(host.querySelector('.bl-block[data-block-id]')?.getAttribute('data-presentation-desktop')).toBeNull();
		click(button('Ulangi'));
		expect(host.querySelector('.bl-block[data-block-id]')?.getAttribute('data-presentation-desktop')).toBe('hidden');
		changeValue(host.querySelector<HTMLSelectElement>('select[aria-label="Tampilan perangkat"]')!, '');
		expect(host.querySelector('.bl-block[data-block-id]')?.getAttribute('data-presentation-desktop')).toBeNull();
		click(button('Urungkan'));
		click(button('Simpan'));
		await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find(call => call[1].body.action === 'presentationVisibility:save');
		expect(saved?.[1].body.presentationVisibility).toBe(true);
		expect(saved?.[1].body.document.activities[0].blocks[0].presentation).toEqual({ desktop: false });
	});

	it('rejects an assessment proposal into a hidden group atomically without history', async () => {
		const envelope = fixture(['instructions'], undefined, 'meeting-00000001');
		const activity = envelope.document.activities[0];
		const groupId = addLayoutGroup(activity, 'section');
		insertBlockIntoLayout(activity, activity.blocks[0].id, groupId);
		findLayoutGroup(activity.layout!, groupId)!.presentation = { mobile: false };
		const ai = authoringFetch(aiProposal());
		await mount(envelope, {}, ai.fetchMock);
		click(host.querySelector(`#builder-group-${groupId}`)!);
		await openAiGenerator();
		await generateAiProposal();
		changeValue(host.querySelector<HTMLSelectElement>('.bd-tool-proposal select')!, 'replace');
		const before = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
		const pane = host.querySelector('.bd-tool-proposal')!;
		click(pane.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
		click([...pane.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Terapkan REPLACE')!);
		expect(host.querySelector('.bd-workspace')!.getAttribute('data-history-version')).toBe(before);
		expect(button('Urungkan').disabled).toBe(true);
		expect(host.textContent).toContain('Visibilitas ditolak');
		expect(host.textContent).toContain('Teks & instruksi');
	});

	it.each([
		['question', 'Tambah Pilihan ganda'],
		['acknowledgement', 'Tambah Konfirmasi membaca'],
		['reference', 'Tambah Tautan & referensi'],
	] as const)('rejects %s insertion through the mounted library into a hidden group without changing the draft', async (_kind, control) => {
		const envelope = fixture(['image'], undefined, 'meeting-00000001');
		const activity = envelope.document.activities[0];
		activity.blocks[0].asset = { fileId: 'protected-image-asset', filename: 'keep.png', version: 2, name: 'Keep image' };
		activity.blocks[0].images = [{ id: 'protected-image', url: 'https://example.org/keep.png', alt: 'Keep', caption: 'Protected asset' }];
		const groupId = addLayoutGroup(activity, 'section');
		insertBlockIntoLayout(activity, activity.blocks[0].id, groupId);
		const group = findLayoutGroup(activity.layout!, groupId)!;
		group.presentation = { desktop: false };
		const documentBefore = structuredClone(envelope.document);
		const questionIds = structuredClone(envelope.document.questionsById);
		const privateKeys = structuredClone(envelope.privateKeys);
		const blockIds = activity.blocks.map(block => block.id);
		await mount(envelope);
		click(host.querySelector(`#builder-group-${groupId}`)!);
		const before = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
		click(button(control));
		expect(host.querySelector('.bd-workspace')!.getAttribute('data-history-version')).toBe(before);
		expect(serverEnvelope.document).toEqual(documentBefore);
		expect(serverEnvelope.document.activities[0].blocks.map(block => block.id)).toEqual(blockIds);
		expect(serverEnvelope.document.questionsById).toEqual(questionIds);
		expect(serverEnvelope.privateKeys).toEqual(privateKeys);
		expect(host.textContent).toContain('Visibilitas ditolak');
	});

	it('allows mounted static content in a hidden group with one undo and redo', async () => {
		const envelope = fixture(['instructions']);
		const activity = envelope.document.activities[0];
		const groupId = addLayoutGroup(activity, 'section');
		insertBlockIntoLayout(activity, activity.blocks[0].id, groupId);
		findLayoutGroup(activity.layout!, groupId)!.presentation = { mobile: false };
		await mount(envelope);
		click(host.querySelector(`#builder-group-${groupId}`)!);
		click(button('Tambah Gambar'));
		expect(host.querySelectorAll('.bd-block')).toHaveLength(2);
		expect(button('Urungkan').disabled).toBe(false);
		click(button('Urungkan'));
		expect(host.querySelectorAll('.bd-block')).toHaveLength(1);
		click(button('Ulangi'));
		expect(host.querySelectorAll('.bd-block')).toHaveLength(2);
		click(button('Simpan'));
		await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find(call => call[1].body.action === 'presentationVisibility:save');
		expect(saved?.[1].body.document.activities[0].blocks).toHaveLength(2);
	});

	it('rejects moving an existing assessment under a hidden group without history or reference changes', async () => {
		const envelope = fixture(['instructions', 'question_group']);
		const activity = envelope.document.activities[0];
		const groupId = addLayoutGroup(activity, 'section');
		insertBlockIntoLayout(activity, activity.blocks[0].id, groupId);
		findLayoutGroup(activity.layout!, groupId)!.presentation = { desktop: false };
		const assessmentId = activity.blocks[1].id;
		const questionId = activity.blocks[1].questionIds![0];
		const protectedBefore = structuredClone(envelope.privateKeys);
		await mount(envelope);
		const grip = host.querySelector<HTMLButtonElement>(`#builder-block-${assessmentId} .bd-block-grip`)!;
		const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => assessmentId), effectAllowed: '', dropEffect: '' };
		const start = new Event('dragstart', { bubbles: true });
		Object.defineProperty(start, 'dataTransfer', { value: dataTransfer });
		act(() => grip.dispatchEvent(start));
		const destination = host.querySelector('.bd-layout-group-tail .bd-insertion-slot')!;
		const drop = new Event('drop', { bubbles: true, cancelable: true });
		Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer });
		act(() => destination.dispatchEvent(drop));
		expect(host.querySelectorAll('.bd-block')).toHaveLength(2);
		expect(host.querySelector('.bd-workspace')!.getAttribute('data-history-version')).toBe('0');
		expect(host.textContent).toContain('Visibilitas ditolak');
		expect(serverEnvelope.document.activities[0].blocks[1].questionIds).toContain(questionId);
		expect(serverEnvelope.privateKeys).toEqual(protectedBefore);
	});

	it('rejects making a hidden instruction interactive through the mounted inline-link editor', async () => {
		const envelope = fixture(['instructions']);
		const block = envelope.document.activities[0].blocks[0];
		block.body = rich('Intro text');
		block.presentation = { desktop: false };
		await mount(envelope);
		click(host.querySelector('.bd-block')!);
		click(button('Isi'));
		const input = host.querySelector<HTMLTextAreaElement>('.bd-inline-text-editor textarea')!;
		input.focus();
		input.setSelectionRange(0, 5);
		const prompt = vi.fn(() => 'https://example.org');
		vi.stubGlobal('prompt', prompt);
		const before = host.querySelector('.bd-workspace')!.getAttribute('data-history-version');
		click(button('Tambahkan tautan'));
		expect(prompt).toHaveBeenCalledOnce();
		expect(host.querySelector('.bd-workspace')!.getAttribute('data-history-version')).toBe(before);
		expect(host.textContent).toContain('Visibilitas ditolak');
		expect(serverEnvelope.document.activities[0].blocks[0].body!.content[0].content[0].link).toBeUndefined();
	});

	it('rejects a group template containing assessments when inserted into a hidden target group', async () => {
		const source = fixture(['question_group']);
		const sourceActivity = source.document.activities[0];
		const sourceGroup = addLayoutGroup(sourceActivity, 'section');
		insertBlockIntoLayout(sourceActivity, sourceActivity.blocks[0].id, sourceGroup);
		legacyTemplateEnvelope = { ...source, scope: 'group' } as BuilderEnvelope;
		savedItems = [{ id: 'protected-group-template', title: 'Protected group', kind: 'template', revision: 1, created: '2020-01-01T00:00:00.000Z', scope: 'group' }];
		const target = fixture(['instructions']);
		const activity = target.document.activities[0];
		const targetGroup = addLayoutGroup(activity, 'section');
		insertBlockIntoLayout(activity, activity.blocks[0].id, targetGroup);
		findLayoutGroup(activity.layout!, targetGroup)!.presentation = { mobile: false };
		const before = structuredClone(target);
		await mount(target);
		click(host.querySelector(`#builder-group-${targetGroup}`)!);
		click([...host.querySelectorAll('button')].filter(item => item.textContent?.trim() === 'Simpan template').at(-1)!);
		await act(async () => { await Promise.resolve(); await Promise.resolve(); });
		await act(async () => { await Promise.resolve(); await Promise.resolve(); });
		click(button('Sisipkan salinan'));
		await act(async () => { await Promise.resolve(); await Promise.resolve(); });
		expect(host.querySelector('.bd-workspace')!.getAttribute('data-history-version')).toBe('0');
		expect(serverEnvelope.document).toEqual(before.document);
		expect(serverEnvelope.privateKeys).toEqual(before.privateKeys);
		expect(host.textContent).toContain('Visibilitas ditolak');
	});

	it('rejects an unknown-kind group template in a hidden target without adding history', async () => {
		const source = fixture(['instructions']);
		const sourceActivity = source.document.activities[0];
		(sourceActivity.blocks[0] as { type: string }).type = 'future_widget';
		const sourceGroup = addLayoutGroup(sourceActivity, 'section');
		insertBlockIntoLayout(sourceActivity, sourceActivity.blocks[0].id, sourceGroup);
		legacyTemplateEnvelope = { ...source, scope: 'group' } as BuilderEnvelope;
		savedItems = [{ id: 'future-group-template', title: 'Future group', kind: 'template', revision: 1, created: '2020-01-01T00:00:00.000Z', scope: 'group' }];
		const target = fixture(['instructions']);
		const activity = target.document.activities[0];
		const targetGroup = addLayoutGroup(activity, 'section');
		insertBlockIntoLayout(activity, activity.blocks[0].id, targetGroup);
		findLayoutGroup(activity.layout!, targetGroup)!.presentation = { desktop: false };
		await mount(target);
		click(host.querySelector(`#builder-group-${targetGroup}`)!);
		click([...host.querySelectorAll('button')].filter(item => item.textContent?.trim() === 'Simpan template').at(-1)!);
		await act(async () => { await Promise.resolve(); await Promise.resolve(); });
		click(button('Sisipkan salinan'));
		await act(async () => { await Promise.resolve(); await Promise.resolve(); });
		expect(host.querySelector('.bd-workspace')!.getAttribute('data-history-version')).toBe('0');
		expect(host.textContent).toContain('Visibilitas ditolak');
	});

	it('remaps mounted group-template anchor collisions and copied internal fragments', async () => {
		const source = fixture(['instructions']);
		const sourceActivity = source.document.activities[0];
		const sourceGroup = addLayoutGroup(sourceActivity, 'section');
		insertBlockIntoLayout(sourceActivity, sourceActivity.blocks[0].id, sourceGroup);
		sourceActivity.blocks[0].anchor = 'details';
		sourceActivity.blocks[0].body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'jump', link: { href: '#details' } }] }] };
		legacyTemplateEnvelope = { ...source, scope: 'group' } as BuilderEnvelope;
		savedItems = [{ id: 'anchored-group-template', title: 'Anchored group', kind: 'template', revision: 1, created: '2020-01-01T00:00:00.000Z', scope: 'group' }];
		const target = fixture(['instructions']);
		const activity = target.document.activities[0];
		activity.blocks[0].anchor = 'details';
		const targetGroup = addLayoutGroup(activity, 'section');
		await mount(target);
		click(host.querySelector(`#builder-group-${targetGroup}`)!);
		click([...host.querySelectorAll('button')].filter(item => item.textContent?.trim() === 'Simpan template').at(-1)!);
		await act(async () => { await Promise.resolve(); await Promise.resolve(); });
		click(button('Sisipkan salinan'));
		await act(async () => { await Promise.resolve(); await Promise.resolve(); });
		click(button('Simpan'));
		await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find(call => call[1].body.action === 'documentAnchors:save');
		const blocks = saved?.[1].body.document.activities[0].blocks;
		expect(blocks[0].anchor).toBe('details');
		expect(blocks[1].anchor).toBe('details-2');
		expect(blocks[1].body.content[0].content[0].link.href).toBe('#details-2');
	});

	it('remaps mounted duplicated activity anchors and its internal links without changing original or unrelated links', async () => {
		const envelope = fixture(['instructions', 'instructions']);
		const [target, other] = envelope.document.activities[0].blocks;
		target.anchor = 'intro';
		target.body = { type: 'doc', content: [{ type: 'paragraph', content: [
			{ type: 'text', text: 'inside', link: { href: '#intro' } },
			{ type: 'text', text: 'other', link: { href: '#faq' } },
			{ type: 'text', text: 'unrelated', link: { href: '#external' } },
		] }] };
		other.anchor = 'faq';
		await mount(envelope);
		click(button('Struktur'));
		click(button('Duplikat kegiatan 1'));
		click(button('Simpan'));
		await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
		const save = service.send.mock.calls.find(call => call[1].body.action === 'documentAnchors:save');
		const activities = save?.[1].body.document.activities;
		expect(activities).toHaveLength(2);
		expect(activities[0].blocks[0].anchor).toBe('intro');
		expect(activities[1].blocks[0].anchor).toBe('intro-2');
		expect(activities[1].blocks[0].body!.content[0].content.map(run => run.link?.href)).toEqual(['#intro-2', '#faq-2', '#external']);
		expect(activities[0].blocks[0].body!.content[0].content[0].link?.href).toBe('#intro');
	});

	it('does not downgrade a versioned visibility save after backend capability rollback', async () => {
		const envelope = fixture(['instructions']);
		envelope.document.activities[0].blocks[0].presentation = { desktop: false };
		await mount(envelope, { presentationVisibility: true });
		service.send.mockImplementation(async (_path: string, options: { body: { action: string } }) => {
			if (options.body.action === 'get') return structuredClone(record);
			if (options.body.action === 'presentationVisibility:save') throw new Error('COMMAND_UNSUPPORTED');
			throw new Error(`Unexpected fallback ${options.body.action}`);
		});
		changeValue(host.querySelector<HTMLInputElement>('input[aria-label^="Judul kegiatan"]')!, 'Edited activity title');
		click(button('Simpan'));
		await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
		const actions = service.send.mock.calls.map(call => call[1].body.action);
		expect(actions).toContain('presentationVisibility:save');
		expect(actions).not.toContain('save');
		expect(host.querySelector('[role="alert"]')?.textContent).toContain('COMMAND_UNSUPPORTED');
	});

	it('moves a block with a captured touch pointer through a canonical nested drop slot in one history step', async () => {
		const envelope = fixture(['instructions', 'image']);
		const activity = envelope.document.activities[0];
		addLayoutGroup(activity, 'section');
		const movingId = activity.blocks[0].id;
		const remainingId = activity.blocks[1].id;
		const groupId = activity.layout!.nodes.find((node): node is Extract<typeof node, { kind: 'section' | 'container' }> => node.kind !== 'block')!.id;
		insertBlockIntoLayout(activity, remainingId, groupId);
		await mount(envelope);
		const history = Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'));
		const grip = host.querySelector<HTMLButtonElement>('.bd-block-grip')!;
		const slot = host.querySelector<HTMLElement>(`[data-builder-drop-activity="activity-1"][data-builder-drop-parent="${groupId}"]`)!;
		Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
		vi.stubGlobal('PointerEvent', class extends Event {
			pointerId = 3; pointerType = 'touch'; isPrimary = true; clientX = 10; clientY = 10;
			constructor(type: string, init?: EventInit & { clientX?: number; clientY?: number }) { super(type, init); this.clientX = init?.clientX ?? 10; this.clientY = init?.clientY ?? 10; }
		});
		Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => slot });
		const dispatchPointer = (element: Element, type: string, x: number, y: number) => {
			const event = new PointerEvent(type, { bubbles: true, clientX: x, clientY: y });
			Object.defineProperties(event, { pointerId: { value: 3 }, pointerType: { value: 'touch' }, isPrimary: { value: true } });
			act(() => element.dispatchEvent(event));
		};
		dispatchPointer(grip, 'pointerdown', 10, 10);
		dispatchPointer(host.querySelector('.bd-workspace')!, 'pointermove', 10, 24);
		dispatchPointer(host.querySelector('.bd-workspace')!, 'pointerup', 10, 24);
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(history + 1);
		click(button('Urungkan'));
		click(button('Ulangi'));
		click(button('Simpan'));
		await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
		const save = service.send.mock.calls.find(call => ['save', 'layoutLocks:save'].includes(call[1].body.action));
		const savedActivity = save?.[1].body.document.activities[0];
		expect(savedActivity.blocks.map((block: { id: string }) => block.id)).toEqual([remainingId, movingId]);
		expect(savedActivity.layout.nodes.find((node: { kind: string }) => node.kind !== 'block').children.map((child: { blockId?: string }) => child.blockId)).toEqual([remainingId, movingId]);
	});

	it('auto-scrolls only the canvas scroll ancestor and retests a stationary pointer before one drop', async () => {
		const envelope = fixture(['instructions', 'image']);
		await mount(envelope);
		host.style.overflowY = 'auto';
		Object.defineProperties(host, {
			clientHeight: { configurable: true, value: 400 },
			scrollHeight: { configurable: true, value: 1000 },
			getBoundingClientRect: { configurable: true, value: () => ({ top: 0, bottom: 400, left: 0, right: 600, width: 600, height: 400, x: 0, y: 0, toJSON() {} }) },
		});
		Object.defineProperty(host.querySelector('.bd-canvas'), 'getBoundingClientRect', { configurable: true, value: () => ({ top: 0, bottom: 1200, left: 0, right: 500, width: 500, height: 1200, x: 0, y: 0, toJSON() {} }) });
		host.scrollTop = 100;
		const grip = host.querySelector<HTMLButtonElement>('.bd-block-grip')!;
		const blockSlots = [...host.querySelectorAll<HTMLElement>('[data-builder-drop-activity="activity-1"]')];
		const beforeSlot = blockSlots[1];
		let hit: Element = beforeSlot;
		Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
		vi.stubGlobal('PointerEvent', class extends Event {
			pointerId = 21; pointerType = 'touch'; isPrimary = true; clientX = 20; clientY = 0;
			constructor(type: string, init?: EventInit & { clientX?: number; clientY?: number }) { super(type, init); this.clientX = init?.clientX ?? 20; this.clientY = init?.clientY ?? 0; }
		});
		Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => hit });
		const frames: FrameRequestCallback[] = [];
		const cancelled = vi.fn();
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
		vi.stubGlobal('cancelAnimationFrame', cancelled);
		vi.spyOn(performance, 'now').mockReturnValue(0);
		const send = (element: Element, type: string, y: number) => {
			const event = new PointerEvent(type, { bubbles: true, clientX: 20, clientY: y });
			Object.defineProperties(event, { pointerId: { value: 21 }, pointerType: { value: 'touch' }, isPrimary: { value: true } });
			act(() => element.dispatchEvent(event));
		};
		const history = Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'));
		send(grip, 'pointerdown', 0);
		send(host.querySelector('.bd-workspace')!, 'pointermove', 9);
		expect(frames).toHaveLength(1);
		hit = blockSlots.at(-1)!;
		await act(async () => { frames.shift()!(50); });
		expect(host.scrollTop).toBeLessThan(100);
		expect(host.querySelector('.bd-workspace')!.textContent).toContain('Tujuan seret:');
		expect(frames).toHaveLength(1);
		send(host.querySelector('.bd-workspace')!, 'pointerup', 9);
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(history + 1);
		expect(cancelled).toHaveBeenCalled();
		click(button('Urungkan'));
		click(button('Ulangi'));
		click(button('Simpan'));
		await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find(call => ['save', 'layoutLocks:save'].includes(call[1].body.action));
		expect(saved?.[1].body.document.activities[0].blocks.map((block: { type: string }) => block.type)).toEqual(['image', 'instructions']);
	});

	it('uses the same bounded auto-scroll lifecycle for native mouse drag-over and stops at release', async () => {
		await mount(fixture(['instructions', 'image']));
		host.style.overflowY = 'auto';
		Object.defineProperties(host, {
			clientHeight: { configurable: true, value: 300 },
			scrollHeight: { configurable: true, value: 900 },
			getBoundingClientRect: { configurable: true, value: () => ({ top: 0, bottom: 300, left: 0, right: 600, width: 600, height: 300, x: 0, y: 0, toJSON() {} }) },
		});
		Object.defineProperty(host.querySelector('.bd-canvas'), 'getBoundingClientRect', { configurable: true, value: () => ({ top: 0, bottom: 1200, left: 0, right: 500, width: 500, height: 1200, x: 0, y: 0, toJSON() {} }) });
		host.scrollTop = 200;
		const grip = host.querySelector<HTMLButtonElement>('.bd-block-grip')!;
		const slots = [...host.querySelectorAll<HTMLElement>('[data-builder-drop-activity="activity-1"]')];
		let dragPayload = '';
		const payload = { setData: vi.fn((_type: string, value: string) => { dragPayload = value; }), getData: () => dragPayload, effectAllowed: 'move', dropEffect: 'move' };
		const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
		let frames: FrameRequestCallback[] = [];
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
		const cancelFrame = vi.fn(() => { frames = []; });
		vi.stubGlobal('cancelAnimationFrame', cancelFrame);
		vi.spyOn(performance, 'now').mockReturnValue(0);
		let hit: Element = slots[1];
		Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => hit });
		const dragStartItem = () => {
			Object.defineProperty(dragStart, 'dataTransfer', { configurable: true, value: payload });
			act(() => grip.dispatchEvent(dragStart));
		};
		dragStartItem();
		const over = new Event('dragover', { bubbles: true, cancelable: true });
		Object.defineProperties(over, { clientX: { value: 20 }, clientY: { value: 295 }, dataTransfer: { value: payload } });
		act(() => slots[1].dispatchEvent(over));
		expect(frames).toHaveLength(1);
		hit = slots.at(-1)!;
		await act(async () => { frames.shift()!(50); });
		expect(host.scrollTop).toBeGreaterThan(200);
		const drop = new Event('drop', { bubbles: true, cancelable: true });
		Object.defineProperty(drop, 'dataTransfer', { value: payload });
		act(() => slots.at(-1)!.dispatchEvent(drop));
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(1);
		expect(frames).toHaveLength(0);
		expect(cancelFrame).toHaveBeenCalled();
	});

	it('cancels an active edge-scroll frame on pointer cancel and unmount without history', async () => {
		await mount(fixture(['instructions']));
		host.style.overflowY = 'auto';
		Object.defineProperties(host, {
			clientHeight: { configurable: true, value: 300 },
			scrollHeight: { configurable: true, value: 900 },
			getBoundingClientRect: { configurable: true, value: () => ({ top: 0, bottom: 300, left: 0, right: 600, width: 600, height: 300, x: 0, y: 0, toJSON() {} }) },
		});
		Object.defineProperty(host.querySelector('.bd-canvas'), 'getBoundingClientRect', { configurable: true, value: () => ({ top: 0, bottom: 1200, left: 0, right: 500, width: 500, height: 1200, x: 0, y: 0, toJSON() {} }) });
		const slot = host.querySelector<HTMLElement>('[data-builder-drop-activity="activity-1"]')!;
		Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => slot });
		Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
		vi.stubGlobal('PointerEvent', class extends Event {
			pointerId = 22; pointerType = 'pen'; isPrimary = true; clientX = 20; clientY = 0;
			constructor(type: string, init?: EventInit & { clientX?: number; clientY?: number }) { super(type, init); this.clientX = init?.clientX ?? 20; this.clientY = init?.clientY ?? 0; }
		});
		let frames: FrameRequestCallback[] = [];
		const cancelFrame = vi.fn(() => { frames = []; });
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
		vi.stubGlobal('cancelAnimationFrame', cancelFrame);
		vi.spyOn(performance, 'now').mockReturnValue(0);
		const send = (element: Element, type: string) => {
			const event = new PointerEvent(type, { bubbles: true, clientX: 20, clientY: type === 'pointerdown' ? 0 : 9 });
			Object.defineProperties(event, { pointerId: { value: 22 }, pointerType: { value: 'pen' }, isPrimary: { value: true } });
			act(() => element.dispatchEvent(event));
		};
		const history = Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'));
		const grip = host.querySelector('.bd-block-grip')!;
		const workspace = host.querySelector('.bd-workspace')!;
		send(grip, 'pointerdown'); send(workspace, 'pointermove');
		expect(frames).toHaveLength(1);
		send(workspace, 'pointercancel');
		expect(frames).toHaveLength(0);
		expect(Number(workspace.getAttribute('data-history-version'))).toBe(history);
		send(grip, 'pointerdown'); send(workspace, 'pointermove');
		expect(frames).toHaveLength(1);
		await unmount();
		expect(frames).toHaveLength(0);
		expect(cancelFrame).toHaveBeenCalled();
	});

	it('inserts a library block with pen input and leaves a cancelled touch gesture without history', async () => {
		await mount(fixture());
		Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
		vi.stubGlobal('PointerEvent', class extends Event {
			pointerId = 4; pointerType = 'pen'; isPrimary = true; clientX = 0; clientY = 0;
			constructor(type: string, init?: EventInit & { clientX?: number; clientY?: number }) { super(type, init); this.clientX = init?.clientX ?? 0; this.clientY = init?.clientY ?? 0; }
		});
		const send = (element: Element, type: string, pointerType: string, y: number) => {
			const event = new PointerEvent(type, { bubbles: true, clientX: 20, clientY: y });
			Object.defineProperties(event, { pointerId: { value: 4 }, pointerType: { value: pointerType }, isPrimary: { value: true } });
			act(() => element.dispatchEvent(event));
		};
		const history = Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'));
		const grip = host.querySelector<HTMLButtonElement>('.bd-tile-pointer-grip')!;
		const slot = host.querySelector<HTMLElement>('[data-builder-drop-activity="activity-1"]')!;
		Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => slot });
		send(grip, 'pointerdown', 'touch', 0);
		send(host.querySelector('.bd-workspace')!, 'pointercancel', 'touch', 20);
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(history);
		send(grip, 'pointerdown', 'pen', 0);
		send(host.querySelector('.bd-workspace')!, 'pointermove', 'pen', 12);
		send(host.querySelector('.bd-workspace')!, 'pointerup', 'pen', 12);
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(history + 1);
		click(button('Urungkan'));
		expect(host.querySelectorAll('.bd-block')).toHaveLength(0);
		const staleStart = Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'));
		const currentGrip = host.querySelector<HTMLButtonElement>('.bd-tile-pointer-grip')!;
		send(currentGrip, 'pointerdown', 'pen', 0);
		send(host.querySelector('.bd-workspace')!, 'pointermove', 'pen', 12);
		changeValue(host.querySelector<HTMLInputElement>('.bd-activity input[aria-label^="Judul kegiatan"]')!, 'Changed during drag');
		send(host.querySelector('.bd-workspace')!, 'pointerup', 'pen', 12);
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(staleStart + 1);
		expect(host.querySelectorAll('.bd-block')).toHaveLength(0);
	});

	it('moves native-dragged groups as intact subtrees in one history entry and saves the same identities', async () => {
		const envelope = fixture(['instructions', 'question_group']);
		const activity = envelope.document.activities[0];
		const targetId = addLayoutGroup(activity, 'section');
		const sourceId = addLayoutGroup(activity, 'section');
		const nestedId = addLayoutGroup(activity, 'container', sourceId);
		const otherId = addLayoutGroup(activity, 'section');
		insertBlockIntoLayout(activity, activity.blocks[0].id, nestedId);
		insertBlockIntoLayout(activity, activity.blocks[1].id, sourceId);
		const source = findLayoutGroup(activity.layout!, sourceId)!;
		source.anchor = 'source-anchor';
		source.appearance = { shadow: 'md', hover: 'lift' };
		source.responsive = { mobile: { columns: 1 } };
		const questionId = activity.blocks[1].questionIds![0];
		const blockIds = activity.blocks.map(block => block.id);
		const privateKeys = structuredClone(envelope.privateKeys);
		await mount(envelope);
		const handle = host.querySelector<HTMLButtonElement>(`#builder-group-${sourceId}`)!.closest('.bd-layout-group-head')!.querySelector<HTMLButtonElement>('.bd-group-grip')!;
		const slot = host.querySelector<HTMLElement>(`[data-builder-drop-activity="activity-1"][data-builder-drop-before="${targetId}"]`)!;
		const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => sourceId), effectAllowed: '', dropEffect: '' };
		const start = new Event('dragstart', { bubbles: true });
		Object.defineProperty(start, 'dataTransfer', { value: dataTransfer });
		act(() => handle.dispatchEvent(start));
		const drop = new Event('drop', { bubbles: true, cancelable: true });
		Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer });
		act(() => slot.dispatchEvent(drop));
		expect(host.querySelector('.bd-workspace')!.getAttribute('data-history-version')).toBe('1');
		const undoState = () => [...host.querySelector('.bd-activity .bl-layout')!.children].filter(node => node.hasAttribute('data-layout-node')).map(node => node.getAttribute('data-layout-node'));
		expect(undoState()).toEqual([sourceId, targetId, otherId]);
		const movedNode = host.querySelector(`[data-layout-node="${sourceId}"]`)!;
		expect([...movedNode.querySelectorAll(':scope > .bd-layout-group-head, :scope > [data-layout-node]')].length).toBeGreaterThan(0);
		click(button('Urungkan'));
		expect(undoState()).toEqual([targetId, sourceId, otherId]);
		click(button('Ulangi'));
		expect(undoState()).toEqual([sourceId, targetId, otherId]);
		click(button('Simpan'));
		await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
		const saved = service.send.mock.calls.find(call => String(call[1].body.action).endsWith(':save'))?.[1].body.document;
		const savedSource = findLayoutGroup(saved.activities[0].layout, sourceId)!;
		expect(savedSource.children[0]).toMatchObject({ kind: 'container', id: nestedId });
		expect(savedSource.anchor).toBe('source-anchor');
		expect(savedSource.appearance).toEqual(source.appearance);
		expect(savedSource.responsive).toEqual(source.responsive);
		expect(saved.activities[0].blocks.map((block: { id: string }) => block.id)).toEqual(blockIds);
		expect(saved.activities[0].blocks.find((block: { id: string }) => block.id === blockIds[1]).questionIds).toContain(questionId);
		expect(service.send.mock.calls.find(call => String(call[1].body.action).endsWith(':save'))?.[1].body.privateKeys).toEqual(privateKeys);
	});

	it('moves groups with touch and pen, rejecting descendant, cross-activity, and cancelled drops without history', async () => {
		const envelope = fixture(['instructions']);
		const activity = envelope.document.activities[0];
		const sourceId = addLayoutGroup(activity, 'section');
		const nestedId = addLayoutGroup(activity, 'container', sourceId);
		const emptyTargetId = addLayoutGroup(activity, 'section');
		const otherActivity = newActivity('Kegiatan kedua');
		envelope.document.activities.push(otherActivity);
		await mount(envelope);
		Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
		vi.stubGlobal('PointerEvent', class extends Event {
			pointerId = 12; pointerType = 'touch'; isPrimary = true; clientX = 0; clientY = 0;
			constructor(type: string, init?: EventInit & { clientX?: number; clientY?: number }) { super(type, init); this.clientX = init?.clientX ?? 0; this.clientY = init?.clientY ?? 0; }
		});
		const dispatch = (element: Element, type: string, pointerType: string, y: number) => {
			const event = new PointerEvent(type, { bubbles: true, clientX: 8, clientY: y });
			Object.defineProperties(event, { pointerId: { value: 12 }, pointerType: { value: pointerType }, isPrimary: { value: true } });
			act(() => element.dispatchEvent(event));
		};
		const history = Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'));
		const grip = host.querySelector<HTMLButtonElement>(`[aria-label^="Seret bagian "]`)!;
		const descendantSlot = host.querySelector<HTMLElement>(`[data-builder-drop-parent="${nestedId}"]`)!;
		Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => descendantSlot });
		dispatch(grip, 'pointerdown', 'touch', 0);
		dispatch(host.querySelector('.bd-workspace')!, 'pointermove', 'touch', 14);
		dispatch(host.querySelector('.bd-workspace')!, 'pointerup', 'touch', 14);
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(history);
		const emptyTarget = host.querySelector<HTMLElement>(`[data-builder-drop-activity="activity-1"][data-builder-drop-parent="${emptyTargetId}"]`)!;
		Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => host.querySelector(`[data-builder-drop-activity="activity-1"][data-builder-drop-parent="${emptyTargetId}"]`) });
		dispatch(grip, 'pointerdown', 'touch', 0);
		dispatch(host.querySelector('.bd-workspace')!, 'pointermove', 'touch', 14);
		dispatch(host.querySelector('.bd-workspace')!, 'pointerup', 'touch', 14);
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(history + 1);
		expect(host.querySelector(`[data-layout-node="${sourceId}"]`)?.parentElement?.closest('[data-layout-node]')?.getAttribute('data-layout-node')).toBe(emptyTargetId);
		const staleHistory = Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'));
		const staleGrip = host.querySelector<HTMLButtonElement>(`[aria-label^="Seret bagian "]`)!;
		Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => host.querySelector('[data-builder-drop-activity="activity-1"]:not([data-builder-drop-parent]):not([data-builder-drop-before])') });
		dispatch(staleGrip, 'pointerdown', 'touch', 0);
		dispatch(host.querySelector('.bd-workspace')!, 'pointermove', 'touch', 14);
		changeValue(host.querySelector<HTMLInputElement>('.bd-activity input[aria-label^="Judul kegiatan"]')!, 'Edited during group drag');
		dispatch(host.querySelector('.bd-workspace')!, 'pointerup', 'touch', 14);
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(staleHistory + 1);
		expect(host.querySelector(`[data-layout-node="${sourceId}"]`)?.parentElement?.closest('[data-layout-node]')?.getAttribute('data-layout-node')).toBe(emptyTargetId);
		await unmount();
		localStorage.clear();
		await mount(envelope);
		const rootEndSelector = '[data-builder-drop-activity="activity-1"]:not([data-builder-drop-parent]):not([data-builder-drop-before])';
		Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => host.querySelector(rootEndSelector) });
		const rootGrip = host.querySelector<HTMLButtonElement>(`[aria-label^="Seret bagian "]`)!;
		const rootHistory = Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'));
		dispatch(rootGrip, 'pointerdown', 'pen', 0);
		dispatch(host.querySelector('.bd-workspace')!, 'pointermove', 'pen', 14);
		dispatch(host.querySelector('.bd-workspace')!, 'pointerup', 'pen', 14);
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(rootHistory + 1);
		expect(host.querySelector(`[data-layout-node="${sourceId}"]`)).toBeTruthy();
		const crossActivitySlot = host.querySelector<HTMLElement>('[data-builder-drop-activity="' + otherActivity.id + '"]:not([data-builder-drop-parent]):not([data-builder-drop-before])')!;
		const nativeData = { setData: vi.fn(), getData: vi.fn(() => sourceId), effectAllowed: '', dropEffect: '' };
		const nativeStart = new Event('dragstart', { bubbles: true });
		Object.defineProperty(nativeStart, 'dataTransfer', { value: nativeData });
		const currentGrip = host.querySelector<HTMLButtonElement>(`[aria-label^="Seret bagian "]`)!;
		act(() => currentGrip.dispatchEvent(nativeStart));
		const crossDrop = new Event('drop', { bubbles: true, cancelable: true });
		Object.defineProperty(crossDrop, 'dataTransfer', { value: nativeData });
		const afterCross = Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'));
		act(() => crossActivitySlot.dispatchEvent(crossDrop));
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(afterCross);
	});

	it('keeps group keyboard move alternatives available from the structure inspector', async () => {
		const envelope = fixture(['instructions']);
		const activity = envelope.document.activities[0];
		const first = addLayoutGroup(activity, 'section');
		const second = addLayoutGroup(activity, 'container');
		await mount(envelope);
		click(host.querySelector(`#builder-group-${second}`)!);
		click(button('Lanjutan'));
		const moveUp = button('Naikkan');
		expect((moveUp as HTMLButtonElement).disabled).toBe(false);
		click(moveUp);
		expect(host.querySelector('.bd-workspace')!.getAttribute('data-history-version')).toBe('1');
		expect(host.textContent).toContain('Gunakan tombol atau Alt+panah');
		void first;
	});

	it('applies a lesson palette once, supports undo/redo, saves the versioned envelope and preserves legacy fallback', async () => {
		await mount(fixture());
		const before = Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'));
		click(button('Palet warna dokumen'));
		changeValue(document.querySelector<HTMLInputElement>('[aria-label="Terang utama warna teks"]')!, '#123456');
		click(button('Terapkan palet'));
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(before + 1);
		expect(host.querySelector('.bd-canvas')?.getAttribute('style')).toContain('--bt-light-base-foreground: #123456');
		click(button('Urungkan'));
		expect(host.querySelector('.bd-canvas')?.getAttribute('style')).toBeNull();
		click(button('Ulangi'));
		expect(host.querySelector('.bd-canvas')?.getAttribute('style')).toContain('--bt-light-base-foreground: #123456');
		click(button('Simpan'));
		await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
		const save = service.send.mock.calls.find(call => call[1].body.action === 'themePalette:save');
		expect(save?.[1].body.themePalette).toBe(true);
		expect(save?.[1].body.document.theme.palette.light.base.foreground).toBe('#123456');
		const appliedHistory = Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'));
		click(button('Palet warna dokumen'));
		click(button('Terapkan palet'));
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(appliedHistory);
		click(button('Palet warna dokumen'));
		changeValue(document.querySelector<HTMLInputElement>('[aria-label="Terang utama warna teks"]')!, '#654321');
		click(button('Batal'));
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(appliedHistory);
		expect(host.querySelector('.bd-canvas')?.getAttribute('style')).toContain('--bt-light-base-foreground: #123456');
		click(button('Palet warna dokumen'));
		click(button('Kembalikan palet standar'));
		expect(Number(host.querySelector('.bd-workspace')!.getAttribute('data-history-version'))).toBe(appliedHistory + 1);
		expect(host.querySelector('.bd-canvas')?.getAttribute('style')).toBeNull();
		click(button('Urungkan'));
		expect(host.querySelector('.bd-canvas')?.getAttribute('style')).toContain('--bt-light-base-foreground: #123456');
		click(button('Ulangi'));
		expect(host.querySelector('.bd-canvas')?.getAttribute('style')).toBeNull();

		const oldBackend = fixture();
		oldBackend.document.theme = { palette: { light: { base: { foreground: '#000000', background: '#FFFFFF' }, accent: { foreground: '#FFFFFF', background: '#990000' } }, dark: { base: { foreground: '#FFFFFF', background: '#000000' }, accent: { foreground: '#FFFFFF', background: '#770000' } } } };
		await unmount();
		localStorage.clear();
		await mount(oldBackend, { themePalette: false });
		expect(host.querySelector('.bd-capability-banner')?.textContent).toMatch(/belum mendukung palet tema dokumen/i);
		expect(button('Palet warna dokumen').disabled).toBe(true);
	});
});
