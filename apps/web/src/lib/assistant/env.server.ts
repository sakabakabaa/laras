/**
 * Shared environment helpers for the assistant runtime.
 *
 * Secrets are read per request inside the modules that use them (model
 * invocation), never at module scope, and never logged.
 */

/** PocketBase origin, proxied through the site under `/hcgi/platform`. */
export const pocketbaseUrl = (): string => process.env.POCKETBASE_URL || 'http://localhost:8090';

/** Reads a required environment variable, throwing a clear error when missing. */
export const requireEnv = (name: string): string => {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
};
