/**
 * Server-owned capability for the enhanced (layout + appearance) visual builder.
 *
 * The capability is decided on the server from deployment environment only and
 * is the single source of truth for both enforcement and UI state:
 *
 *   BUILDER_ENHANCED_AUTHORING=on            → everyone allowed (default when unset)
 *   BUILDER_ENHANCED_AUTHORING=off           → nobody, except listed lecturers
 *   BUILDER_ENHANCED_AUTHORING_ALLOWLIST     → comma-separated user IDs allowed
 *                                              while the mode is off (staged rollout)
 *
 * Only an explicit `off`/`0`/`false` disables the capability. Unset or any
 * unrecognised value keeps today's production behaviour, so a typo can never
 * silently lock lecturers out of drafts that already use advanced features.
 *
 * Shared documents (published activities, read-only rendering, submissions)
 * are never gated: students keep seeing the full layout and appearance.
 */
import { parseResearcherIds } from '@/lib/researcher-ids';

export const ENHANCED_AUTHORING_ENV = 'BUILDER_ENHANCED_AUTHORING';
export const ENHANCED_AUTHORING_ALLOWLIST_ENV = 'BUILDER_ENHANCED_AUTHORING_ALLOWLIST';

/** Marker message for a write refused because enhanced authoring is off. */
export const ENHANCED_AUTHORING_DENIED = 'ENHANCED_AUTHORING_DENIED';

/** True when a thrown request error was the capability refusal (not a conflict). */
export function isEnhancedAuthoringDenied(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error ?? '');
	return message.includes(ENHANCED_AUTHORING_DENIED);
}

export type EnhancedAuthoringMode = 'on' | 'off';

export type EnhancedAuthoringCapability = {
	/** True when the enhanced authoring surfaces may be used by this caller. */
	authoring: boolean;
	/** Always true: shared read-only rendering of advanced documents. */
	readOnlyRendering: true;
	/** Configured deployment mode, independent of the caller's allowlist entry. */
	mode: EnhancedAuthoringMode;
	/** Whether env is the reason this caller is denied (vs. account eligibility). */
	reason: 'enabled' | 'allowlisted' | 'disabled' | 'ineligible';
};

/**
 * Parses the raw flag value. Defaults to `on` unless the value is explicitly
 * one of the documented "off" spellings.
 */
export function parseEnhancedAuthoringMode(raw: string | undefined | null): EnhancedAuthoringMode {
	const value = String(raw ?? '').trim().toLowerCase();
	if (value === 'off' || value === '0' || value === 'false' || value === 'no' || value === 'disabled') {
		return 'off';
	}
	return 'on';
}

/** Comma-separated user IDs; empty entries ignored. */
export function parseEnhancedAuthoringAllowlist(raw: string | undefined | null): string[] {
	const unique = new Set(parseResearcherIds(String(raw ?? '')));
	return [...unique];
}

export function resolveEnhancedAuthoring(input: {
	userId: string | undefined;
	role: string | undefined;
	mode: EnhancedAuthoringMode;
	allowlist: readonly string[];
}): EnhancedAuthoringCapability {
	const { userId, role, mode, allowlist } = input;
	const eligible = role === 'faculty' && Boolean(userId);
	if (!eligible) {
		return { authoring: false, readOnlyRendering: true, mode, reason: 'ineligible' };
	}
	if (mode === 'on') {
		return { authoring: true, readOnlyRendering: true, mode, reason: 'enabled' };
	}
	if (userId && allowlist.includes(userId)) {
		return { authoring: true, readOnlyRendering: true, mode, reason: 'allowlisted' };
	}
	return { authoring: false, readOnlyRendering: true, mode, reason: 'disabled' };
}

/**
 * Reads the capability from the process environment. Server-only (imports the
 * `node:process` env through `process.env`), so never import this module from a
 * component that renders in the browser — pass the resolved value down.
 */
export function serverEnhancedAuthoring(user: { id?: string; role?: string } | null | undefined): EnhancedAuthoringCapability {
	return resolveEnhancedAuthoring({
		userId: user?.id,
		role: user?.role,
		mode: parseEnhancedAuthoringMode(process.env[ENHANCED_AUTHORING_ENV]),
		allowlist: parseEnhancedAuthoringAllowlist(process.env[ENHANCED_AUTHORING_ALLOWLIST_ENV]),
	});
}

/**
 * True when an envelope uses enhanced authoring fields. Level-triggered on the
 * stored document: a draft stays "enhanced" even if the flag is later turned
 * off, which is exactly when saving it through a reduced editor would drop
 * data. Legacy compatibility is never inferred from a merely missing `layout`.
 */
export function usesEnhancedAuthoring(envelope: unknown): boolean {
	if (!envelope || typeof envelope !== 'object') return false;
	// Accept either a ``BuilderDocument`` or the ``{ document, privateKeys }``
	// envelope that the builder API and workspace actually use.
	const candidate = (envelope as { document?: unknown }).document ?? envelope;
	if (!candidate || typeof candidate !== 'object') return false;
	const activities = (candidate as { activities?: unknown }).activities;
	if (!Array.isArray(activities)) return false;
	return activities.some((activity) => {
		if (!activity || typeof activity !== 'object') return false;
		const { layout, blocks } = activity as { layout?: unknown; blocks?: unknown };
		if (layout !== undefined && layout !== null) return true;
		if (!Array.isArray(blocks)) return false;
		return blocks.some((block) => {
			if (!block || typeof block !== 'object') return false;
			const record = block as { layoutLocked?: unknown; appearance?: unknown; sections?: unknown; images?: unknown; transcript?: unknown; playback?: unknown; body?: { content?: unknown } };
			return record.layoutLocked !== undefined || record.appearance !== undefined || Array.isArray(record.sections) || record.transcript !== undefined || record.playback !== undefined || (Array.isArray(record.images) && record.images.some((image: any) => image?.presentation !== undefined)) || Boolean(record.body?.content && Array.isArray(record.body.content) && record.body.content.some((node: any) => node?.type === 'heading' || node?.type === 'list_item'));
		});
	});
}

export type BuilderAuthoringGate =
	| { allowed: true }
	| { allowed: false; status: 403 | 409; message: string };

/**
 * Decides whether a write may proceed. Shared by the builder API and the
 * workspace UI so buttons and enforcement always agree.
 *
 * - `featureOff`: the caller has no enhanced capability but the document being
 *   written uses enhanced fields → refused (would silently drop layout/appearance).
 * - `featureOff` + a legacy flat document → allowed, because the legacy editor
 *   and this server normalizer round-trip flat documents unchanged.
 */
export function builderAuthoringGate(input: {
	capability: EnhancedAuthoringCapability;
	envelope?: unknown;
}): BuilderAuthoringGate {
	const { capability, envelope } = input;
	const enhanced = usesEnhancedAuthoring(envelope);
	if (capability.authoring) return { allowed: true };
	if (enhanced) {
		return {
			allowed: false,
			status: 409,
			message: `${ENHANCED_AUTHORING_DENIED}: Penyunting visual lanjutan sedang dinonaktifkan untuk akun ini. Draf memakai tata letak atau tampilan lanjutan, sehingga tidak dapat diubah tanpa menghilangkan data. Unduh salinan, atau minta admin mengaktifkan kembali penyunting lanjutan.`,
		};
	}
	return { allowed: true };
}

/**
 * Message shown in the workspace banner when the capability is denied.
 */
export function enhancedAuthoringNotice(capability: EnhancedAuthoringCapability, enhancedDocument: boolean): string {
	if (capability.reason === 'ineligible') {
		return 'Penyunting visual lanjutan hanya tersedia untuk dosen.';
	}
	if (capability.authoring) return '';
	if (enhancedDocument) {
		return 'Penyunting visual lanjutan dinonaktifkan oleh admin. Draf ini memakai tata letak atau tampilan lanjutan sehingga ditampilkan hanya-baca; perubahan, penyimpanan, dan penerbitan diblokir agar tata letak, tampilan, dan kunci jawaban tidak hilang. Anda tetap dapat mengunduh salinan pribadi dan melihat pratinjau mahasiswa.';
	}
	return 'Penyunting visual lanjutan dinonaktifkan oleh admin. Draf ini belum memakai tata letak atau tampilan lanjutan sehingga tetap dapat disunting dengan penyunting lama; tata letak, tampilan, dan kunci jawaban tetap utuh.';
}

export type BuilderCapabilityPayload = {
	authoring: boolean;
	readOnlyRendering: true;
	mode: EnhancedAuthoringMode;
	reason: EnhancedAuthoringCapability['reason'];
	notice: string;
};

/** Shape returned to browsers by `POST /api/builder-capability`. */
export function builderCapabilityPayload(
	capability: EnhancedAuthoringCapability,
	enhancedDocument: boolean,
): BuilderCapabilityPayload {
	return {
		authoring: capability.authoring,
		readOnlyRendering: true,
		mode: capability.mode,
		reason: capability.reason,
		notice: enhancedAuthoringNotice(capability, enhancedDocument),
	};
}

/**
 * Fetch the server-owned capability for the current session. `document` (when
 * known) lets the server phrase the notice for this specific draft. Never
 * throws: an unreachable server keeps today's production behaviour (enhanced
 * authoring usable) because the builder API still enforces the capability.
 */
export async function fetchBuilderCapability(document?: unknown): Promise<BuilderCapabilityPayload> {
	const fallback: BuilderCapabilityPayload = {
		authoring: true,
		readOnlyRendering: true,
		mode: 'on',
		reason: 'enabled',
		notice: '',
	};
	try {
		const { default: pb } = await import('./pocketbase-client');
		const response = await fetch('/api/builder-capability', {
			method: 'POST',
			headers: { Authorization: 'Bearer ' + pb.authStore.token, 'Content-Type': 'application/json' },
			body: JSON.stringify(document === undefined ? {} : { document }),
			signal: AbortSignal.timeout(10000),
		});
		if (!response.ok) return fallback;
		const result: BuilderCapabilityPayload = await response.json();
		if (!result || typeof result.authoring !== 'boolean') return fallback;
		return result;
	} catch {
		return fallback;
	}
}
