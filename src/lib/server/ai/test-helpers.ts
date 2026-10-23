// 제공자 단위 시험이 함께 쓰는 도우미. 실제로 기다리지 않고, 로그를 모은다.
import type { AiCallLog } from './log';
import type { ProviderDeps } from './provider';

export function testDeps(): ProviderDeps & { logs: AiCallLog[]; waits: number[] } {
	const logs: AiCallLog[] = [];
	const waits: number[] = [];
	return {
		logs,
		waits,
		logger: (entry) => logs.push(entry),
		sleep: async (ms) => void waits.push(ms),
		now: () => 0
	};
}

export async function collect(source: AsyncIterable<string>): Promise<string[]> {
	const out: string[] = [];
	for await (const chunk of source) out.push(chunk);
	return out;
}
