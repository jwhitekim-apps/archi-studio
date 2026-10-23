import { describe, expect, it } from 'vitest';

// 두 SDK가 Node 20 서버에서 불러와지는지만 확인한다(네트워크는 쓰지 않는다).
describe('AI SDK 불러오기', () => {
	it('@anthropic-ai/sdk', async () => {
		const { default: Anthropic } = await import('@anthropic-ai/sdk');
		expect(new Anthropic({ apiKey: 'test', maxRetries: 0 }).messages).toBeDefined();
	});

	it('@google/genai', async () => {
		const { GoogleGenAI } = await import('@google/genai');
		expect(new GoogleGenAI({ apiKey: 'test' }).models).toBeDefined();
	});
});
