type LoginFailure = { status?: number; isAbort?: boolean };

function loginFailure(error: unknown): LoginFailure {
	return error && typeof error === 'object' ? error as LoginFailure : {};
}

export function isLoginCredentialError(error: unknown): boolean {
	const { status, isAbort } = loginFailure(error);
	return !isAbort && (status === 400 || status === 401);
}

export function loginErrorMessage(error: unknown): string {
	const { status, isAbort } = loginFailure(error);
	if (isAbort) return 'Permintaan masuk dibatalkan. Silakan coba lagi.';
	if (status === 0) return 'Tidak dapat terhubung ke server. Periksa koneksi internet Anda, lalu coba lagi.';
	if (status === 429) return 'Terlalu banyak percobaan masuk. Tunggu beberapa saat, lalu coba lagi.';
	if (typeof status === 'number' && status >= 500) return 'Server sedang mengalami gangguan. Silakan coba lagi beberapa saat.';
	if (isLoginCredentialError(error)) return 'NIM/username/email atau kata sandi salah. Periksa kembali data masuk Anda.';
	if (status === 403) return 'Akses masuk belum diizinkan. Hubungi dosen atau administrator jika masalah berlanjut.';
	return 'Tidak dapat masuk. Silakan coba lagi atau hubungi administrator jika masalah berlanjut.';
}
