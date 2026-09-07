# persona-web

Tailnet 안에서만 접근하는 private persona chat UI. 데모를 보기 쉽게 만드는 역할이며
인증·권한·RAG·GPU 제어를 직접 구현하지 않는다.

기획 문서: [`docs/repository-plans/persona-web.md`](../docs/repository-plans/persona-web.md)

## 디렉토리

```
src/
├── routes/       # 화면 단위
├── components/   # chat transcript, persona selector, 오류 영역
├── lib/          # SSE 클라이언트, AbortController 취소, API 타입
└── styles/
tests/fixtures/sse/   # 합성 SSE 스트림
public/
```

## v1 사용자 흐름

1. workspace와 persona 선택
2. 메시지 입력
3. Gateway SSE를 받아 token stream 표시
4. 완료 후 citation ID와 source type만 표시
5. backend unavailable / queue overload를 이해 가능한 오류 상태로 표시

## 하지 않는 것

- OIDC, public user account, billing, public persona gallery
- 실제 corpus 저장/표시, embedding, Qdrant 직접 접근
- vLLM 호출, admission 제어, Kubernetes API 호출
- 실제 캐릭터 원문·이미지·로고의 공개 포함

## 외부 계약

Gateway `POST /api/v1/chat/completions`, SSE event `delta` `citations` `done` `error`,
오류 `400` `403` `429` `503` `504`. UI route는 `/`, gateway route는 `/api`.

## 구현 루프

1. 정적 shell (합성 데이터)
2. SSE 클라이언트 (순서 보장, 취소, 오류 상태)
3. Gateway 통합 (429/503/504별 UX, 재시도 폭주 방지)
4. portfolio polish (citation·request-id·latency 요약을 원문 없이)

현재 상태: 뼈대만 존재. 스크린샷에 private corpus나 대사 본문이 들어가지 않아야 한다.
