import { describe, expect, it } from 'vitest';
import { getAiProvider } from './index';

// 실제 제공자를 한 번씩 부른다. 제공자는 .env의 AI_PROVIDER(또는 AI_PROVIDER_TRANSLATION)로 고른다.
// 실행: AI_LIVE_TEST=1 npm run test:ai-live
describe.skipIf(!process.env.AI_LIVE_TEST)('AI 제공자 실제 호출', () => {
	const provider = () => getAiProvider('translation', { env: process.env });

	it('complete', async () => {
		const text = await provider().complete({ user: '"ok" 한 단어만 답하세요.', maxTokens: 16 });
		expect(text.length).toBeGreaterThan(0);
	});

	it('stream', async () => {
		const chunks: string[] = [];
		for await (const chunk of provider().stream({ user: '1부터 5까지 숫자만 쉼표로 이어 쓰세요.', maxTokens: 32, tier: 'fast' })) {
			chunks.push(chunk);
		}
		expect(chunks.join('').length).toBeGreaterThan(0);
	});
});
