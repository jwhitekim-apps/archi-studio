// 호출 기록은 제공자, 등급, 걸린 시간, 성공 여부, 오류 코드만 남긴다.
// 프롬프트와 응답 문장, 키는 남기지 않는다(분석 프롬프트에 논문 본문이 들어간다).
import type { AiErrorCode, AiProvider, AiTier } from './types';

export interface AiCallLog {
	provider: AiProvider['name'];
	tier: AiTier | string;
	ms: number;
	ok: boolean;
	code?: AiErrorCode;
	// 내용이 아닌 진단 정보: 제공자의 HTTP 상태와 종료 이유
	status?: number;
	finishReason?: string;
}

export type AiLogger = (entry: AiCallLog) => void;

export const defaultAiLogger: AiLogger = (entry) => {
	console.info(JSON.stringify({ event: 'ai_call', ...entry }));
};
