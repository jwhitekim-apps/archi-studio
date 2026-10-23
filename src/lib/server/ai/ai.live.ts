import { describe, expect, it } from 'vitest';
import { getAiProvider } from './index';

// 실제 제공자를 한 번씩 부른다. 제공자는 .env의 AI_PROVIDER(또는 AI_PROVIDER_TRANSLATION)로 고른다.
// 실행: AI_LIVE_TEST=1 npm run test:ai-live
// 출력 한도는 넉넉히 준다. 생각하는 모델(학교 qwen 등)은 한도가 작으면 생각만 하다 빈 응답으로 끝난다.
describe.skipIf(!process.env.AI_LIVE_TEST)('AI 제공자 실제 호출', () => {
	const provider = () => getAiProvider('translation', { env: process.env });

	it('complete', async () => {
		const text = await provider().complete({ user: '"ok" 한 단어만 답하세요.', maxTokens: 4096 });
		expect(text.length).toBeGreaterThan(0);
	});

	it('stream', async () => {
		const chunks: string[] = [];
		for await (const chunk of provider().stream({ user: '1부터 5까지 숫자만 쉼표로 이어 쓰세요.', maxTokens: 4096, tier: 'fast' })) {
			chunks.push(chunk);
		}
		expect(chunks.join('').length).toBeGreaterThan(0);
	});
});
