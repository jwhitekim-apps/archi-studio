// 오류 코드별 한국어 안내(design 결정 11). 모르는 코드는 서버 문구, 그것도 없으면 공통 문구를 쓴다.
import { ApiError } from './client';

export const MESSAGES: Record<string, string> = {
	invalid_credentials: '이메일 또는 비밀번호가 맞지 않습니다.',
	pending_approval: '관리자 승인이 끝나야 쓸 수 있습니다. 승인되면 다시 로그인해 주세요.',
	too_many_attempts: '로그인 시도가 너무 많습니다. 잠시 뒤 다시 시도해 주세요.',
	email_taken: '이미 가입된 이메일입니다. 로그인해 주세요.',
	invalid_request: '입력한 값이 올바르지 않습니다.',
	unauthenticated: '세션이 끝났습니다. 다시 로그인해 주세요.',
	forbidden_origin: '허용되지 않은 곳에서 보낸 요청입니다. 페이지를 새로 고친 뒤 다시 시도해 주세요.',
	forbidden: '이 작업을 할 권한이 없습니다.',
	not_found: '요청한 내용을 찾을 수 없습니다.',
	method_not_allowed: '지원하지 않는 요청입니다.',
	conflict: '다른 작업과 겹쳐 처리하지 못했습니다. 다시 시도해 주세요.',
	payload_too_large: '보낸 내용이 너무 큽니다.',
	internal_error: '서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
	network_error: '서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.',
	zotero_not_connected: 'Zotero가 연결되어 있지 않습니다. 먼저 Zotero를 연결해 주세요.',
	zotero_unavailable: 'Zotero가 응답하지 않습니다. 잠시 뒤 다시 시도해 주세요.',
	paper_not_found: '논문을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.',
	attachment_not_found: '이 논문에는 원문 파일이 없습니다.',
	analysis_not_found: '아직 분석한 결과가 없습니다.',
	briefing_not_found: '브리핑을 찾을 수 없습니다.',
	no_source_for_analysis: '분석할 원문이나 초록이 없습니다.',
	upstream_unavailable: '외부 서비스가 응답하지 않습니다. 잠시 뒤 다시 시도해 주세요.',
	ai_unavailable: 'AI 모델이 응답하지 않습니다. 잠시 뒤 다시 시도해 주세요.',
	ai_not_configured: 'AI 모델이 설정되어 있지 않습니다. 관리자에게 문의해 주세요.'
};

export const GENERIC_MESSAGE = '요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';

export function errorMessage(error: unknown): string {
	if (error instanceof ApiError) return MESSAGES[error.code] ?? (error.message || GENERIC_MESSAGE);
	return GENERIC_MESSAGE;
}
