# persona-web

캐릭터를 만들고 상태를 확인하는 React·TypeScript 웹 애플리케이션이다.
Gateway의 HTTP API를 사용하며 DB·Kubernetes·모델 서버에 직접 접속하지 않는다.

## 현재 기능

- 토큰 접속·로그아웃, 캐릭터 목록·이름 입력 생성·개요 화면
- 중복 이름과 사용자당 3개 제한에 대한 오류 안내
- 이름 기반 이니셜 아바타
- 인증 후 원래 화면으로 복귀하는 딥링크 처리
- 자료 붙여넣기·편집·적용(`/personas/:personaId/draft`): 본문(events)·대사
  (speech_examples) 입력, 관계·능력은 선택 항목. 검색은 kind를 구분하지 않으므로
  (`BODY_KINDS`, persona-gateway `retrieval/search.py`) 본문·관계·능력을 굳이
  나눠 넣을 필요가 없다 — 나누는 건 선택이다. profile(1,500자)만 서버가 실제로
  강제하고, 나머지 크기 상한은 서버 미구현이라 안내용 카운터로만 보여준다
- 대화 화면 골격(`/personas/:personaId/chat`): status가 ready가 아니면 자료 편집으로
  안내, ready라도 실제 응답은 없다(GPU 연결 전) — vLLM 호출 없음

사진 업로드는 제공하지 않는다.

| 주소                         | 화면                      |
| ---------------------------- | ------------------------- |
| `/`                          | 접속 토큰 입력            |
| `/personas`                  | 캐릭터 목록·작업 영역     |
| `/personas/new`              | 캐릭터 생성               |
| `/personas/:personaId`       | 캐릭터 개요               |
| `/personas/:personaId/draft` | 자료 편집·초안 적용       |
| `/personas/:personaId/chat`  | 대화 화면 골격(응답 없음) |

토큰은 브라우저 메모리에만 보관한다. 새로고침하면 다시 입력하며 URL에는 넣지 않는다.
2026-09-17 사용자 제공 운영 결과에서 웹 2개 배치와 기본 접속 흐름을 확인했다.
현재 작업 트리의 모든 변경이 운영에 배포된 것은 아니다.

## 로컬 실행

Node 22.23.1 기준이며, 명령은 이 저장소 루트에서 실행한다.

```sh
nvm use
npm ci
VITE_API_MODE=mock npm run dev
```

실제 Gateway를 연결할 때는 별도로 기동한 로컬 API 주소를 지정한다.

```sh
VITE_API_MODE=real VITE_LOCAL_API_TARGET=http://127.0.0.1:18080 npm run dev
```

위 주소는 예시다. 실제 스택이 출력한 주소를 사용한다.
실제 API 오류를 mock 응답으로 대체하지 않는다.

## 검증

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:scripts
npm run build
```

| 검사 층               | 검증 범위                                                |
| --------------------- | -------------------------------------------------------- |
| 화면 테스트           | 합성 PersonaApi를 통한 화면 동작                         |
| API 클라이언트 테스트 | 실제 api.ts와 가짜 fetch 응답으로 요청·응답 계약 확인    |
| 실제 HTTP 테스트      | 별도 Gateway·PostgreSQL에 접속해 데이터·오류·재시작 확인 |

실제 HTTP 검사는 `PERSONA_LIVE_API`와 `PERSONA_LIVE_TOKEN`을 지정해야 실행된다.
미설정 시 skip되므로 기본 테스트 통과를 실연동 통과로 읽지 않는다.
테스트는 캐릭터·초안을 생성하고 Gateway를 재시작하므로 운영이나 보존할 데이터가 있는 스택에 실행하지 않는다.

```sh
# 격리 스택을 먼저 준비하고, 출력된 주소와 합성 토큰만 사용한다.
PERSONA_LIVE_API=http://127.0.0.1:18080 PERSONA_LIVE_TOKEN='<합성 스택 토큰>' \
  npx vitest run src/lib/api.live.test.ts
```

## 배포 방식

운영 이미지는 Vite 개발 서버가 아니라 비루트 Nginx로 정적 번들을 제공한다.
Traefik이 같은 origin의 `/v1`을 Gateway로, 웹 경로를 이 컨테이너로 전달한다.
웹 컨테이너 자체는 API 프록시가 아니다.

컨테이너 포트는 8080, 생존 확인 경로는 `/healthz`다.
read-only root filesystem과 쓰기 가능한 `/tmp`가 필요하다.
이미지의 로컬 검증은 Docker가 준비된 환경에서 실행한다.

```sh
npm run container:verify
```

amd64 이미지를 다른 아키텍처에서 실행하면 에뮬레이션 결과일 수 있다.
이미지 검증과 운영 배포·라우팅 검증은 별개다.
