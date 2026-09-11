# persona-web

Tailnet 전용 캐릭터 생성·채팅 UI. 최신 설계는 [통합 기획](../docs/current-plan.md)을 따른다.

## 담당

- 캐릭터 이름과 소개, 사건·관계·능력·상황별 말투 예시 입력.
- 업로드 접수와 처리 상태 표시.
- 생성된 캐릭터 설정의 확인·수정.
- 캐릭터 선택, SSE 답변 표시, 취소·오류·재시도 UI.
- 사용자에게 허용된 출처 정보 표시. 공개 시연에는 합성 자료 사용.

권한은 Gateway가 검증한다. 웹은 Qdrant·vLLM·Kubernetes API에 직접 접속하지 않는다.
두 홈 워커 어디든 배치할 수 있으나 replica 수는 미정이다.

## 코드 위치

- `src/routes/`, `src/components/`: 화면과 구성요소.
- `src/lib/`: API·SSE 클라이언트.
- `tests/fixtures/sse/`: 합성 응답 예시.

## 현재 구현: 첫 사용자 흐름

토큰 입력 → 내 캐릭터 목록 → 자료 없는 캐릭터 생성만 구현했다. 업로드·설정 편집·채팅·삭제는 아직 제공하지 않는다.

2026-09-10 사용자 수동 검증: 실제 Python API·격리 Postgres 연결, 새로고침·API 재시작 후 목록 유지,
중복 이름·3개 한도·로그아웃 확인. 홈 K8s 배포는 아직 미검증이다.
[검증 근거와 다음 컨테이너 준비](../docs/local-first-flow-verification-2026-09-10.md).

운영 요청은 같은 origin의 `/v1` Python API로 보낸다. 토큰은 브라우저 메모리에만 보관하므로 새로고침하면 다시 입력해야 한다.

```sh
nvm use
npm ci
npm run dev
```

이 프로젝트는 Node 22.23.1 LTS를 기준으로 한다. nvm을 쓰지 않는 환경도 `package.json`의 Node 범위를 만족해야 한다.

로컬 Python API 프록시는 `.env.example`을 참고해 `VITE_LOCAL_API_TARGET`에만 설정한다. 합성 개발 모드는 `VITE_API_MODE=mock`으로 명시적으로 선택하며 실제 API 오류를 mock 성공으로 바꾸지 않는다.

검사 명령은 `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run build`이다.
검증 스크립트의 금지 경로 규칙은 `npm run test:scripts`로 회귀 테스트한다.

## 운영 정적 이미지

운영 이미지는 Vite 개발 서버를 실행하지 않는다. `Dockerfile`은 Node 22.23.1에서 정적 번들을
만든 뒤, 비루트 Nginx 정적 서버로 `dist/`만 복사한다. API 모드는 빌드 시 실제 모드로 고정되며,
브라우저 요청은 같은 origin의 `/v1`을 그대로 사용한다. 웹 컨테이너는 `/v1`을 프록시하지 않는다.
배포 환경의 Traefik HTTPRoute가 `/v1`을 Gateway로 라우팅해야 한다.

```sh
docker buildx build --platform linux/amd64 --load -t persona-web:local .
docker run --rm --platform linux/amd64 --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,uid=101,gid=101,mode=1777 \
  -p 8080:8080 persona-web:local
```

정적 서버 포트는 `8080`, probe 경로는 `/healthz`다. `/healthz`는 `200`과 `no-store`를 반환한다.
실제 해시 `/assets/`는 장기 immutable cache를, 누락 자산은 `no-store`, HTML shell은 재검증 cache 정책을 사용한다. 잘못된
정적 경로와 컨테이너에 직접 도달한 `/v1` 요청은 `404`이며 `index.html`로 바꾸지 않는다.

Nginx는 read-only root filesystem에서 실행할 수 있고, PID와 내부 임시 디렉터리를 위해 쓰기 가능한
`/tmp` tmpfs가 필요하다. Kubernetes 보안 설정도 비루트 사용자, read-only root filesystem, `/tmp`
emptyDir 또는 동등한 tmpfs를 제공해야 한다.

다음은 linux/amd64 이미지 빌드, 비루트·read-only 실행, 페이지·JS/CSS·health·404·캐시 정책과
런타임 번들의 로컬 설정/토큰 부재를 검사한다.

```sh
npm run container:verify
```

검증 스크립트는 기본적으로 사용 가능한 loopback 포트를 자동 할당한다. 특정 포트를 써야 하면
`PERSONA_WEB_VERIFY_PORT=18080 npm run container:verify`처럼 지정한다.

커밋 `95d7a55` 기준 실행 결과와 미검증 항목은 [검증 기록](docs/verification-95d7a55.md)에 있다.
소스와 연결되지 않는 옛 태그(`persona-web:review-9890e3d`)는 배포 후보가 아니다.

스크립트는 호스트와 Docker 서버 아키텍처를 함께 출력한다. x86_64가 아닌 호스트에서는
`linux/amd64` 실행이 에뮬레이션일 수 있으므로 그 결과를 검증 기록에 명시한다. 이 레포에서는
이미지 push, Kubernetes manifest 변경, Argo CD Sync를 수행하지 않는다.
