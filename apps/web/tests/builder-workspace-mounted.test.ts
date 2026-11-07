// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendBlock, blankBuilder, type BuilderEnvelope } from '../src/lib/builder-document';

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

function fixture(blockTypes: ('instructions' | 'image' | 'reflection')[] = []): BuilderEnvelope {
	const envelope = blankBuilder('tugas', '');
	envelope.document.activities[0].id = 'activity-1';
	envelope.document.activities[0].title = 'Materi';
	for (const type of blockTypes) appendBlock(envelope, 'activity-1', type);
	return envelope;
}

function click(element: Element) {
	act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

function changeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
	act(() => {
		const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
		Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
		element.dispatchEvent(new Event(element instanceof HTMLInputElement ? 'input' : 'change', { bubbles: true }));
	});
}

function button(name: string) {
	const result = [...host.querySelectorAll('button')].find((item) =>
		item.getAttribute('aria-label') === name || item.textContent?.trim() === name,
	);
	expect(result, `button ${name}`).toBeTruthy();
	return result!;
}

async function mount(envelope = fixture()) {
	serverEnvelope = structuredClone(envelope);
	record = { id: 'draft-1', document: serverEnvelope.document, privateKeys: serverEnvelope.privateKeys, revision: 7, layoutLocks: true, customColors: true, detailedBorderRadius: true };
	service.send.mockImplementation(async (_path: string, options: { body: { action: string; envelope?: BuilderEnvelope; document?: unknown } }) => {
		if (options.body.action === 'get') return structuredClone(record);
		if (options.body.action === 'save' || options.body.action === 'layoutLocks:save' || options.body.action === 'themeColors:save' || options.body.action === 'detailedStyles:save') {
			return { ...structuredClone(record), ...options.body, revision: 8 };
		}
		throw new Error(`Unexpected builder action ${options.body.action}`);
	});
	vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ authoring: true, readOnlyRendering: true, mode: 'on', reason: 'enabled', notice: '' }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
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

beforeEach(() => {
	vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
	localStorage.clear();
	service.send.mockReset();
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
		changeValue(detail.querySelector('select')!, 'dashed');
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
});
