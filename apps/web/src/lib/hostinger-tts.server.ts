/** Server-only Hostinger AI Router text-to-speech client. */

export const HOSTINGER_TTS_MODELS = ['text-to-speech', 'text-to-speech-1-eu', 'text-to-speech-1-us'] as const;
export type HostingerTtsModel = (typeof HOSTINGER_TTS_MODELS)[number];
export type HostingerTtsVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export async function synthesizeHostingerSpeech({
	text,
	model = 'text-to-speech',
	voice = 'alloy',
	speed = 1,
}: {
	text: string;
	model?: HostingerTtsModel;
	voice?: HostingerTtsVoice;
	speed?: number;
}): Promise<Uint8Array> {
	const apiKey = process.env.HROUTER_API_KEY;
	if (!apiKey) throw new Error('HROUTER_API_KEY is not set');
	const baseUrl = (process.env.HROUTER_BASE_URL || 'https://router.hostinger.com/v1').replace(/\/+$/, '');
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 90_000);
	try {
		const response = await fetch(`${baseUrl}/audio/speech`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ model, voice, input: text, speed: Math.min(1.2, Math.max(0.8, speed)), response_format: 'mp3' }),
			signal: controller.signal,
		});
		if (!response.ok) throw new Error(`Hostinger TTS request failed (HTTP ${response.status})`);
		return new Uint8Array(await response.arrayBuffer());
	} finally {
		clearTimeout(timeout);
	}
}
