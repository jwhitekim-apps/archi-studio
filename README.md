# Archi Studio

번역, 논문 분석, 서재, 메모, 브리핑을 하나의 앱으로 묶은 연구용 웹앱입니다. Zotero 서재의 논문을 중심으로 원문, 메모, 번역 이력, 분석 결과를 연결합니다.

![왼쪽 메뉴(서재·번역·분석·메모·브리핑), 가운데 원문 입력과 번역 결과 칸, 오른쪽 자동 번역 설정이 있는 번역 화면](docs/images/translate.png)

<sub>로컬에서 띄운 빈 계정의 번역 화면입니다.</sub>

## 시작하기

로컬에서 가입·로그인해 빈 서재를 여는 경로입니다. Node.js `^20.19.0 || >=22.12.0`과 실행 중인 Docker가 필요합니다.

[로컬 개발 환경 안내](docs/dev/setup.md)에 따라 의존성 설치, 로컬 Supabase 시작, 마이그레이션 적용과 접속 정보 설정을 마친 뒤 저장소 루트에서 실행합니다.

```sh
npm run dev -- --host 127.0.0.1
```

<http://127.0.0.1:5173>에서 가입하고, 로컬 DB의 `archi_profiles.approved`를 해당 계정에 대해 `true`로 바꾼 뒤 로그인합니다.

## 관련 문서

- [개발 환경·테스트·Zotero 설정](docs/dev/setup.md)
- [번역·분석용 AI 제공자 설정](docs/dev/ai-provider.md)
- [HTTP API](docs/api/openapi.yaml) · [데이터 모델](docs/api/data-model.md)
- [브리핑 연동 계약](docs/dev/briefing-contract.md)
- [배포 되돌리기](docs/deploy/rollback.md)

## 라이선스

LICENSE 파일이 없습니다. 라이선스는 확인이 필요합니다.
