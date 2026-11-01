import pb from '@/lib/pocketbase-client';
import type { BuilderDocument } from './builder-document';
export type BuilderAssessment = {
	earned: number;
	total: number;
	score: number;
	pending: number;
	items: Record<
		string,
		{
			score: number;
			max: number;
			pending: boolean;
			feedback: string;
			overridden: boolean;
			criteria?: Record<string, number>;
		}
	>;
	at?: string;
};
export type BuilderResponse = {
	id: string;
	revision: number;
	answers: Record<string, string>;
	startedAt: string;
	submittedAt: string;
	submittedActivities: string[];
	deadline: string;
	released: BuilderAssessment | null;
};
export type BuilderRunState = {
	id: string;
	title: string;
	kind: 'kelas' | 'tugas';
	owner: boolean;
	serverNow: string;
	closed: boolean;
	revision: number;
	available: boolean;
	document: BuilderDocument | null;
	delivery: BuilderDocument['delivery'];
	response: BuilderResponse | null;
	openActivityIds: string[];
	activeIndex: number;
};
export type BuilderRunItem = {
	id: string;
	title: string;
	kind: string;
	closed: boolean;
	revision: number;
	startsAt: string;
	dueAt: string;
	courseTitle: string;
	checkInClosesAt?: string;
	closesAt?: string;
	startedAt?: string;
	submittedAt?: string;
	feedbackReady?: boolean;
};
export async function deliveryRequest<T>(
	action: string,
	body: Record<string, unknown> = {},
): Promise<T> {
	try {
		return await pb.send<T>('/api/laras/builder-delivery', {
			method: 'POST',
			body: { ...body, action },
			requestKey: null,
		});
	} catch (e) {
		const error = e as { response?: { message?: string }; message?: string };
		throw new Error(
			error.response?.message || error.message || 'Perintah belum berhasil.',
		);
	}
}
