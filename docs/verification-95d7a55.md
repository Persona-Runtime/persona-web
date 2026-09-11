# 컨테이너 검증 기록 — 95d7a55

`scripts/verify-container.sh`로 실행한 결과다. 이 문서는 **로컬 검증까지의 기록**이며
GHCR push와 Kubernetes 배포는 포함하지 않는다.

## 대상

| 항목        | 값                                                                        |
| ----------- | ------------------------------------------------------------------------- |
| 소스 커밋   | `95d7a55` (`fix: 이미지 금지 경로 검사를 디렉터리와 하위 파일까지 확장`)  |
| 브랜치      | `feat/api-connect`                                                        |
| 이미지 태그 | `persona-web:95d7a55`                                                     |
| 이미지 ID   | `sha256:1e261efdcd04a57f3338bf9880524f237ad7205195bc2ae7c2b2634e42ff039e` |
| 아키텍처    | `linux/amd64`                                                             |
| 실행 사용자 | UID `101` (nginx-unprivileged)                                            |
| 포트        | 8080                                                                      |
| health 경로 | `/healthz`                                                                |

빌드 스테이지는 Node 22.23.1-alpine3.23, 런타임은 nginx-unprivileged 1.29.5-alpine이며
둘 다 `Dockerfile`에서 immutable digest로 고정했다. `VITE_API_MODE=real`이 빌드 시 고정되어
운영 번들은 항상 같은 origin의 `/v1`을 호출한다.

## 이전 이미지 폐기

`persona-web:review-9890e3d`는 **이 레포에 존재하지 않는 SHA**를 태그로 달고 있다
(`git cat-file -t 9890e3d` 실패). 대응하는 소스를 확인할 수 없으므로 **배포 후보에서 제외**한다.
`persona-web:container-verify`도 커밋과 연결되지 않은 임시 태그다.

## 실행 조건

호스트는 arm64 macOS이며 Docker가 **linux/amd64를 에뮬레이션**했다. 기능 검증으로만 쓰고
성능 기준선으로 사용하지 않는다. 실제 amd64 하드웨어 실행은 미검증이다.

```
--read-only --tmpfs /tmp:rw,nosuid,nodev,noexec,uid=101,gid=101,mode=1777
```

**필요한 쓰기 경로는 `/tmp` 하나다.** 실행 중 컨테이너에서 확인한 결과 `nginx.pid`와
`client_temp`·`proxy_temp`·`fastcgi_temp`·`scgi_temp`·`uwsgi_temp`가 모두 `/tmp` 아래에 있고
`/var/cache/nginx`는 비어 있다. Kubernetes에서는 `/tmp`에 `emptyDir` 하나만 주면 된다.

## 검증 결과

| 항목                          | 결과                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| linux/amd64 빌드              | 통과                                                                               |
| 비루트 실행                   | 통과 — 이미지 기본 사용자 101, 컨테이너 내 `id -u` ≠ 0                             |
| read-only rootfs              | 통과 — `/tmp` tmpfs만으로 기동                                                     |
| 런타임 이미지 내용            | 통과 — 2218개 경로에 `.env*`·`node_modules`·`src` 성분·`package*.json` 없음        |
| `/healthz`                    | 통과 — 200, 본문 `ok`, `Cache-Control: no-store`                                   |
| `/` HTML shell                | 통과 — 200, `no-cache` 재검증 정책                                                 |
| `/assets/*` 실제 자산         | 통과 — 200, `immutable` 장기 cache                                                 |
| 누락 자산 `/assets/...`       | 통과 — 404, `no-store` (immutable 아님)                                            |
| 잘못된 정적 경로              | 통과 — 404, `index.html`로 대체되지 않음                                           |
| `/v1`, `/v1/me`               | 통과 — 404. 웹 컨테이너는 프록시하지 않으며 Traefik이 담당한다                     |
| 런타임 번들 내 로컬 설정·토큰 | 통과 — `VITE_LOCAL_API_TARGET`·`127.0.0.1:8000`·`PERSONA_STATIC_BEARER_TOKEN` 없음 |

코드 검사: `npm run lint`, `npm run format:check`, `npm run typecheck`,
`npm test`(10 passed), `npm run test:scripts`(25건), `npm run build` 모두 통과.

**금지 경로 검사 규칙** — `scripts/check-image-listing.sh`가 소유하며 `--self-test`에 회귀 케이스가
붙어 있다. 디렉터리는 `/` 또는 경로 끝을 경계로 성분 단위로 보고, `.env*`·`package*.json`은 파일
이름으로 본다. `app/src/main.py`처럼 하위 파일까지 딸려 들어온 경우를 놓치지 않기 위함이다.
`grep`의 1(매치 없음)과 2 이상(검사 오류)을 구분해, 검사가 깨진 상태가 "깨끗함"으로 통과하지
않게 한다. 번들 비밀값 검사도 같은 방식으로 처리한다.

## 미검증 항목

- 실제 linux/amd64 하드웨어 실행 (이번은 에뮬레이션)
- 성능·지연 수치
- GHCR registry digest — 아직 push하지 않았다. **위 이미지 ID를 registry digest로 쓰지 않는다.**
  로컬 이미지 ID도 content-addressed 식별자라 그 객체를 불변하게 가리킨다. 다만 같은 소스를
  다시 빌드하면 buildx provenance attestation이 달라져 **다른 객체**가 만들어지고 새 ID가 생긴다.
  기존 ID가 변하는 것이 아니라 소스와 ID가 1:1로 대응하지 않는 것이다. 그래서 배포 선언에는
  **registry에서 pull 가능한 digest**를 쓴다.
- 실제 Gateway API와 같은 origin에서 결합된 상태의 브라우저 시나리오
  (로컬 검증은 Vite 개발 서버 기준이며, Traefik `/v1` 라우팅은 platform 배포 후 확인)
- Kubernetes probe·자원 설정

## 재실행

```sh
npm run container:verify -- persona-web:<commit-sha>
```

특정 포트가 필요하면 `PERSONA_WEB_VERIFY_PORT=18080`을 함께 지정한다.
스크립트는 `docker`·`curl`·`grep`·`tar`·`awk`가 없으면 검사를 조용히 건너뛰지 않고 즉시 멈춘다.
