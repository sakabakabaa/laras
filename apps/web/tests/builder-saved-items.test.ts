// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../src/lib/pocketbase-client', () => ({ default: { send: service.send } }));

import { BuilderSavedItems } from '../src/components/app/builder/builder-saved-items';

const features = [
	['themePaletteInDocument', 'themePalette'],
	['nestedRichTextInDocument', 'nestedRichText'],
	['mediaCaptionsInDocument', 'mediaCaptions'],
	['mediaPlaybackInDocument', 'mediaPlayback'],
	['responsiveStylesInDocument', 'responsiveBorderRadius'],
	['documentAnchorsInDocument', 'documentAnchors'],
	['presentationVisibilityInDocument', 'presentationVisibility'],
] as const;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
	vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
	service.send.mockReset();
	host = document.createElement('div');
	document.body.append(host);
	root = createRoot(host);
});

afterEach(async () => {
	await act(async () => root.unmount());
	host.remove();
	vi.unstubAllGlobals();
});

describe('saved-item feature reads', () => {
	it.each([
		...features.map(feature => ({ selectedFeatures: [feature] })),
		{ selectedFeatures: features },
		{ selectedFeatures: [] },
	])('loads saved items with feature markers $selectedFeatures', async ({ selectedFeatures }) => {
		const props: Partial<ComponentProps<typeof BuilderSavedItems>> = Object.fromEntries(
			selectedFeatures.map(([property]) => [property, true]),
		);
		service.send.mockImplementation(async (_path: string, options: { body: Record<string, unknown> }) => {
			if (options.body.action !== 'savedList') throw new Error('Unsupported builder action');
			for (const [, marker] of selectedFeatures) {
				if (options.body[marker] !== true) throw new Error(`Missing feature marker ${marker}`);
			}
			return { items: [{ id: 'saved-1', title: 'Existing snapshot', kind: 'snapshot', revision: 1, created: '2026-01-01T00:00:00Z' }] };
		});
		await act(async () => {
			root.render(createElement(BuilderSavedItems, {
				id: 'draft-1', revision: 7, dirty: false,
				onRestore: vi.fn(), onInsert: vi.fn(), onClose: vi.fn(), ...props,
			}));
		});
		expect(document.querySelector('[role="alert"]')).toBeNull();
		expect(document.querySelector('.bd-saved-list')?.textContent).toContain('Existing snapshot');
		expect(service.send).toHaveBeenCalledTimes(1);
		const body = service.send.mock.calls[0][1].body;
		expect(body.action).toBe('savedList');
		for (const [property, marker] of features) expect(body[marker]).toBe(props[property] ? true : undefined);
	});
});
