import { ClientResponseError } from 'pocketbase';
import { describe, expect, it } from 'vitest';
import { isLoginCredentialError, loginErrorMessage } from '../src/lib/login-error';

const failure = (status: number) => new ClientResponseError({ status, response: { message: 'Failed to authenticate.' } });

describe('login errors', () => {
	it.each([400, 401])('explains invalid credentials without identifying which credential is wrong (%s)', status => {
		const error = failure(status);
		expect(isLoginCredentialError(error)).toBe(true);
		expect(loginErrorMessage(error)).toBe('NIM/username/email atau kata sandi salah. Periksa kembali data masuk Anda.');
	});

	it.each([
		[0, 'Periksa koneksi internet'],
		[429, 'Terlalu banyak percobaan'],
		[500, 'Server sedang mengalami gangguan'],
		[503, 'Server sedang mengalami gangguan'],
		[403, 'Akses masuk belum diizinkan'],
	] as const)('distinguishes failure %s from wrong credentials', (status, message) => {
		expect(loginErrorMessage(failure(status))).toContain(message);
		expect(isLoginCredentialError(failure(status))).toBe(false);
	});

	it('does not retry cancelled requests or expose raw error details', () => {
		const cancelled = new ClientResponseError({ status: 400, isAbort: true });
		expect(isLoginCredentialError(cancelled)).toBe(false);
		expect(loginErrorMessage(cancelled)).toContain('dibatalkan');
		for (const error of [null, undefined, 'Failed to authenticate.', new Error('internal details'), { status: 418, response: { message: 'internal details' } }]) {
			expect(loginErrorMessage(error)).toContain('Tidak dapat masuk');
			expect(loginErrorMessage(error)).not.toContain('internal details');
		}
	});
});
