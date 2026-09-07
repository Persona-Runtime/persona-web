# persona-web — 기획 문서

## 목적

Tailnet 안에서만 접근하는 private persona chat UI를 제공한다. 이 레포는 데모를 보기 쉽게 만드는 역할이며, 인증·권한·RAG·GPU 제어를 직접 구현하지 않는다.

## v1 사용자 흐름

1. 사용자가 workspace와 persona를 고른다.
2. 메시지를 입력한다.
3. Gateway의 SSE를 받아 token stream을 표시한다.
4. 완료 뒤 citation ID와 source type만 표시한다.
5. backend unavailable/queue overload는 사용자가 이해할 수 있는 오류 상태로 보여 준다.

## 책임

- chat UI, SSE rendering, loading/cancel/retry UX
- workspace/persona selector
- citation의 source ID·episode·locator 표시
- request ID를 화면에서만 연결해 trace lookup을 돕는 admin/debug mode
- 합성 fixture로 component/e2e test

## 제외

- OIDC, public user account, billing, public persona gallery
- actual corpus 저장/표시, embedding, Qdrant 직접 접근
- vLLM 호출, admission 제어, Kubernetes API 호출
- 실제 캐릭터 원문·이미지·로고의 공개 포함

## 외부 계약

- Gateway API: `POST /v1/chat/completions`의 SSE event `delta`, `citations`, `done`, `error`
- 오류: `400`, `403`, `429`, `503`, `504`
- 기본 gateway route: `/api`; UI route: `/`

## 구현 루프

### Loop 1 — 정적 shell

- persona selector, chat transcript, 입력창, 오류 영역을 합성 데이터로 만든다.
- 완료 조건: 모바일/데스크톱에서 기본 대화 흐름이 읽히고, 실제 IP/원문은 없다.

### Loop 2 — SSE client

- `delta/citations/done/error` parser와 AbortController 기반 취소를 구현한다.
- 완료 조건: 합성 SSE fixture에서 순서 보장, 취소, 오류 상태가 test된다.

### Loop 3 — Gateway 통합

- Tailnet-only endpoint에서 chat을 호출하고, 429/503/504별 UX를 만든다.
- 완료 조건: 실제 backend가 없어도 재시도 폭주 없이 오류를 표현한다.

### Loop 4 — portfolio polish

- citation, request-id, latency summary를 prompt 원문 없이 보여 준다.
- 완료 조건: screenshot에 private corpus 또는 대사 본문이 포함되지 않는다.

## 검증 기준

- TypeScript lint/typecheck/unit test 통과
- SSE 중단 시 브라우저 fetch와 UI state가 함께 정리됨
- public build에 raw/parsed/vector private data가 포함되지 않음
- accessibility: keyboard input, status announcement, error text 제공
