# translation 시나리오와 테스트 대응표

`openspec/specs/translation/spec.md`의 요구사항 7개(기존 4개와 `archi-studio-translation`이 더한 3개)의 시나리오를 시험과 짝지은 표다. 더한 3개(AI 호출 실패 처리, 번역 이력 개수 제한, paperId 형식 확인)는 그 change의 델타 스펙에 있고 보관 때 메인 스펙에 합쳐진다.

테스트 파일은 `src/lib/server/translation/`에 있다. 통합 테스트(`*.integration.ts`)는 로컬 Supabase가 떠 있어야 하며 `npm run test:auth`로 돌린다. 단위 테스트(`*.test.ts`)는 `npm test`로 돌린다. 이름에 `%s` 등이 있는 것은 표 형태 시험(`it.each`)이다.

| # | 요구사항 / 시나리오 | 테스트 파일 | 테스트 이름 |
|---|---|---|---|
| 1 | 스트리밍 번역 / 같은 문장을 다른 논문에서 다시 번역 | `service.test.ts` | `다른 논문으로 요청하면 모델 0번에 행 1개 추가, 같은 논문으로 다시 요청하면 행이 늘지 않는다` |
| 2 | 스트리밍 번역 / 새 번역 | `translation.integration.ts` | `200으로 조각을 보내고 이력 1행을 저장하며, 같은 문장 재요청은 모델을 부르지 않는다` |
| 2 | (같은 시나리오, 조각이 차례로 도착) | `route-stream.test.ts` | `두 번째 조각이 막혀 있어도 첫 조각이 먼저 도착한다` |
| 3 | 스트리밍 번역 / 캐시된 번역 | `translation.integration.ts` | `200으로 조각을 보내고 이력 1행을 저장하며, 같은 문장 재요청은 모델을 부르지 않는다` |
| 3 | (같은 시나리오, 서비스) | `service.test.ts` | `같은 원문을 다시 요청하면 모델을 부르지 않고 같은 번역문을 돌려준다` |
| 4 | 번역 입력 제한과 종류 구분 / 빈 텍스트 | `translation.integration.ts` | `400 %s` (`빈 값`) |
| 4 | (같은 시나리오, 입력 확인) | `input.test.ts` | `%s` (`빈 문자열`, `공백뿐`) |
| 5 | 번역 입력 제한과 종류 구분 / 너무 긴 텍스트 | `translation.integration.ts` | `413 5001자, 모델을 부르지 않는다` |
| 6 | 번역 입력 제한과 종류 구분 / 단어와 문장 구분 | `translation.integration.ts` | `attention 다음 attention is all you need를 번역하면 이력 type이 word, sentence 순이다` |
| 7 | 논문 연결 / 내 논문에 연결 | `translation.integration.ts` | `200으로 조각을 보내고 이력 1행을 저장하며, 같은 문장 재요청은 모델을 부르지 않는다` |
| 8 | 논문 연결 / paperId 없이 번역 | `translation.integration.ts` | `attention 다음 attention is all you need를 번역하면 이력 type이 word, sentence 순이다` |
| 9 | 논문 연결 / 남의 논문 id | `translation.integration.ts` | `404 없는 id와 남의 id가 같은 본문이고 모델을 부르지 않으며 저장하지 않는다` |
| 10 | 논문 연결 / 없는 논문 id | `translation.integration.ts` | `404 없는 id와 남의 id가 같은 본문이고 모델을 부르지 않으며 저장하지 않는다` |
| 10 | (연결된 논문 삭제 시 이력도 삭제) | `translation.integration.ts` | `저장 후 조회하고, 논문 행을 지우면 연결된 이력이 함께 지워진다` |
| 11 | 번역 이력 조회 / 논문별 이력 | `translation.integration.ts` | `paperId를 주면 그 논문의 이력만, 남의 논문 id는 빈 목록` |
| 12 | AI 호출 실패 처리 / 시작 전에 모델 호출 실패 | `translation.integration.ts` | `502 ai_unavailable, 503 ai_not_configured` |
| 12 | (같은 시나리오, 저장 없음) | `service.test.ts` | `%s → %i %s, 스트림을 만들지 않고 저장하지 않는다` |
| 13 | AI 호출 실패 처리 / 모델이 설정되지 않음 | `translation.integration.ts` | `502 ai_unavailable, 503 ai_not_configured` |
| 13 | (같은 시나리오, 제공자 생성 실패) | `service.test.ts` | `제공자 생성이 설정 오류로 실패하면 503` |
| 14 | AI 호출 실패 처리 / 스트림 도중 실패 | `service.test.ts` | `도중 실패는 스트림을 오류로 끝내고 저장하지 않으며, 다시 요청하면 새로 번역한다` |
| 15 | AI 호출 실패 처리 / 요청자가 연결을 끊음 | `service.test.ts` | `연결을 끊으면 제공자의 중단이 호출되고 저장하지 않는다` |
| 16 | 번역 이력 개수 제한 / 기본 개수 | `translation.integration.ts` | `limit 없이 최근 50개를 최신순으로, 필드는 {id, sourceText, translatedText, type, paperId, createdAt}` |
| 17 | 번역 이력 개수 제한 / limit 지정 | `translation.integration.ts` | `limit=5는 5개` |
| 18 | 번역 이력 개수 제한 / 범위를 벗어난 limit | `translation.integration.ts` | `%s는 400 invalid_request` (`limit=0`, `limit=201`, `limit=abc`) |
| 19 | paperId 형식 확인 / uuid가 아닌 paperId | `translation.integration.ts` | `400 %s` (`paperId 형식`) |
| 20 | paperId 형식 확인 / 이력 필터의 잘못된 paperId | `translation.integration.ts` | `%s는 400 invalid_request` (`paperId=abc`) |

스펙 밖에서 설계가 정한 동작의 시험: 저장 실패(`저장이 실패해도 번역은 끝까지 전달되고 로그에는 오류 이름만 남는다`), 조회 실패(`저장된 번역 조회가 실패하면 로그만 남기고 새로 번역한다`), 본문 64 KiB(`64 KiB를 넘는 본문은 413`), 인증(`401 쿠키 없음, 미승인 계정`, `쿠키 없음은 401`), 프롬프트(`system-prompt.test.ts`).
