// 요약 프롬프트. 벨루 core/base_analyzer.py(초록용)와 core/claude_analyzer.py(제목용)를 옮겼다.
// 벨루의 relevance, relevance_reason("PRML 연구실과의 관련성")은 연구실 하나에 묶인 항목이라 뺐다(design 열린 질문 1).
import { JSON_OUTPUT_CONTRACT } from '../ai';

export const abstractPrompt = (abstract: string) => `다음은 논문의 초록입니다.

[초록]
${abstract}

아래 항목을 한국어로 작성하세요. 초록에 직접 언급되지 않더라도 내용을 바탕으로 합리적으로 추론해도 됩니다.

${JSON_OUTPUT_CONTRACT}

<schema>
{
  "keywords": ["핵심 키워드 3~5개 (영문 또는 한문 혼용 가능)"],
  "domain": "이 논문이 속하는 연구 분야 (한 단어 또는 짧은 구, 예: ECG-classification, NLP, computer-vision, RL)",
  "problem_short": "해결하려는 문제 한 줄 요약",
  "problem": "기존 방법의 한계와 배경 (2~3문장)",
  "method_short": "제안 방법 한 줄 요약",
  "method": "핵심 아이디어 및 방법론 (2~3문장, 구체적 기술 요소 포함)",
  "conclusion_short": "주요 결론 한 줄 요약",
  "conclusion": "주요 결론 및 기여 (2~3문장, 성능 수치·비교 실험·의의 포함)"
}
</schema>`;

export const titlePrompt = (title: string, doi: string) => `다음 논문의 제목만 주어집니다. 제목에서 유추 가능한 내용을 바탕으로 분석하세요.
초록이 없으므로 제목으로부터 합리적으로 추론하되, 불확실한 부분은 솔직히 표현하세요.

논문 제목: ${title}
DOI: ${doi}

${JSON_OUTPUT_CONTRACT}

<schema>
{
  "keywords": ["핵심 키워드 3~5개"],
  "domain": "이 논문이 속하는 연구 분야 (한 단어 또는 짧은 구)",
  "problem_short": "해결하려는 문제 한 줄 요약",
  "problem": "제목 기반으로 추정되는 문제 (2~3문장, 추론임을 명시)",
  "method_short": "제안 방법 한 줄 요약",
  "method": "제목 기반으로 추정되는 방법론 (2~3문장, 추론임을 명시)",
  "conclusion_short": "주요 결론 한 줄 요약",
  "conclusion": "제목 기반으로 추정되는 기여 (2~3문장, 추론임을 명시)"
}
</schema>`;
