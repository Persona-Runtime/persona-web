import { afterEach, expect, test, vi } from "vitest";
import { httpPersonaApi } from "./api";
import { ApiError, type Persona } from "./types";

/*
 * 이 파일만 실제 fetch 경로(api.ts)를 실행한다. 다른 테스트는 PersonaApi를 합성
 * 구현으로 갈아끼우므로 응답 형식 검증을 지나가지 않는다.
 *
 * 공개 테스트는 합성 데이터만 쓴다.
 */

const TOKEN = "synthetic-token";

const validPersona: Persona = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "합성 모루",
  status: "needs_material",
  active_version_id: null,
  draft: null,
  deletion_id: null,
  created_at: "2026-09-10T00:00:00+00:00",
};

/**
 * fetch를 테스트마다 갈아끼운다.
 *
 * 실제 네트워크로 나가지 않게 하는 것이 첫 목적이고, 두 번째는 보낸 요청의 헤더와
 * 경로를 확인하려고 호출 인자를 붙잡아 두는 것이다.
 */
function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/**
 * 수제 객체가 아니라 진짜 Response를 만든다. 그래야 HTML 본문에서 response.json()이
 * 실제로 실패해, 이번에 고친 경로를 우회하지 않고 지나간다.
 */
function respond(body: string, status = 200, contentType = "application/json") {
  return new Response(body, {
    status,
    headers: { "Content-Type": contentType },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("HTML 200 응답을 로그인 성공으로 처리하지 않는다", async () => {
  // /v1 라우팅이 잘못돼 정적 index.html이 돌아오는 상황. 예전에는 이 응답이
  // null 사용자로 조용히 넘어가 아무 안내 없는 막다른 화면이 됐다.
  stubFetch(respond("<!doctype html><html></html>", 200, "text/html"));

  const error = await httpPersonaApi.getMe(TOKEN).catch((reason) => reason);

  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status: 200, code: "invalid_response" });
});

test("본문이 null이거나 비어 있으면 성공으로 보지 않는다", async () => {
  stubFetch(respond("null"), respond(""));

  await expect(httpPersonaApi.getMe(TOKEN)).rejects.toMatchObject({
    code: "invalid_response",
  });
  await expect(httpPersonaApi.getMe(TOKEN)).rejects.toMatchObject({
    code: "invalid_response",
  });
});

test("필수 필드의 타입이 다르거나 빠지면 거부한다", async () => {
  stubFetch(
    respond(JSON.stringify({ id: "u1", display_name: 42 })),
    respond(JSON.stringify({ display_name: "합성 사용자" })),
  );

  await expect(httpPersonaApi.getMe(TOKEN)).rejects.toMatchObject({
    code: "invalid_response",
  });
  await expect(httpPersonaApi.getMe(TOKEN)).rejects.toMatchObject({
    code: "invalid_response",
  });
});

test("모르는 필드가 늘어나도 통과시킨다", async () => {
  // Gateway 계약은 아직 늘어나는 중이다. 필드 하나 추가됐다고 배포된 웹이 멈추면 안 된다.
  stubFetch(
    respond(
      JSON.stringify({
        id: "u1",
        display_name: "합성 사용자",
        email: "synthetic@example.invalid",
      }),
    ),
  );

  // 모르는 필드를 지우지 않고 그대로 통과시킨다. 걸러내는 쪽이 값을 조용히 버리는 일이다.
  await expect(httpPersonaApi.getMe(TOKEN)).resolves.toMatchObject({
    id: "u1",
    display_name: "합성 사용자",
  });
});

test("성공 자리에 온 오류 봉투를 사용자 자료로 받아들이지 않는다", async () => {
  stubFetch(
    respond(
      JSON.stringify({
        error: {
          code: "internal_error",
          message: "...",
          request_id: "00000000-0000-4000-8000-000000000099",
        },
      }),
    ),
  );

  await expect(httpPersonaApi.getMe(TOKEN)).rejects.toMatchObject({
    code: "invalid_response",
  });
});

test("계약대로의 목록은 그대로 통과한다", async () => {
  stubFetch(
    respond(JSON.stringify({ items: [validPersona], next_cursor: null })),
  );

  const page = await httpPersonaApi.listPersonas(TOKEN);

  expect(page.items).toHaveLength(1);
  expect(page.items[0].status).toBe("needs_material");
  expect(page.next_cursor).toBeNull();
});

test("모르는 상태값을 빈 배지로 흘려보내지 않는다", async () => {
  // statusLabel은 모르는 값에 undefined를 돌려줘 빈 배지를 그린다. 조용히 잘못
  // 보여주느니 경계에서 거부한다. 상태가 늘면 라벨·안내와 함께 추가해야 한다.
  stubFetch(
    respond(
      JSON.stringify({
        items: [{ ...validPersona, status: "chatting" }],
        next_cursor: null,
      }),
    ),
  );

  await expect(httpPersonaApi.listPersonas(TOKEN)).rejects.toMatchObject({
    code: "invalid_response",
  });
});

test("items가 배열이 아니거나 next_cursor가 없으면 거부한다", async () => {
  stubFetch(
    respond(JSON.stringify({ items: {}, next_cursor: null })),
    respond(JSON.stringify({ items: [] })),
  );

  await expect(httpPersonaApi.listPersonas(TOKEN)).rejects.toMatchObject({
    code: "invalid_response",
  });
  await expect(httpPersonaApi.listPersonas(TOKEN)).rejects.toMatchObject({
    code: "invalid_response",
  });
});

test("생성의 201도 성공으로 받는다", async () => {
  stubFetch(respond(JSON.stringify(validPersona), 201));

  await expect(
    httpPersonaApi.createPersona(TOKEN, "합성 모루", "key-1"),
  ).resolves.toMatchObject({ id: validPersona.id, name: "합성 모루" });
});

test("정상 오류 봉투는 코드와 요청 ID를 보존한다", async () => {
  stubFetch(
    respond(
      JSON.stringify({
        error: {
          code: "persona_limit_exceeded",
          message: "캐릭터는 최대 3개까지 만들 수 있습니다.",
          request_id: "00000000-0000-4000-8000-000000000009",
        },
      }),
      409,
    ),
  );

  await expect(
    httpPersonaApi.createPersona(TOKEN, "넷", "key-2"),
  ).rejects.toMatchObject({
    status: 409,
    code: "persona_limit_exceeded",
    requestId: "00000000-0000-4000-8000-000000000009",
  });
});

test("오류 응답의 본문을 읽지 못해도 상태 코드는 살린다", async () => {
  // 401을 잃으면 세션 정리가 동작하지 않는다. 본문 이상과 실패 응답은 다른 문제다.
  stubFetch(
    respond("<html>502</html>", 502, "text/html"),
    respond("<html>401</html>", 401, "text/html"),
    respond(JSON.stringify({ detail: "Not Found" }), 404),
  );

  const gatewayError = await httpPersonaApi
    .getMe(TOKEN)
    .catch((reason: unknown) => reason);
  expect(gatewayError).toMatchObject({ status: 502, code: "unknown_error" });
  // 응답 본문은 오류에 담기지 않는다.
  expect(JSON.stringify(gatewayError)).not.toContain("<html");
  expect((gatewayError as ApiError).requestId).toBeUndefined();

  await expect(httpPersonaApi.getMe(TOKEN)).rejects.toMatchObject({
    status: 401,
  });
  // FastAPI 기본 404 본문은 우리 계약 봉투가 아니다.
  await expect(httpPersonaApi.getMe(TOKEN)).rejects.toMatchObject({
    status: 404,
    code: "unknown_error",
  });
});

test("요청에 인증 헤더와 멱등성 키를 함께 보낸다", async () => {
  const fetchMock = stubFetch(
    respond(JSON.stringify({ id: "u1", display_name: "합성 사용자" })),
    respond(JSON.stringify({ items: [], next_cursor: null })),
    respond(JSON.stringify(validPersona), 201),
  );

  await httpPersonaApi.getMe(TOKEN);
  await httpPersonaApi.listPersonas(TOKEN);
  await httpPersonaApi.createPersona(TOKEN, "합성 모루", "key-3");

  const [mePath, meInit] = fetchMock.mock.calls[0];
  expect(mePath).toBe("/v1/me");
  expect(meInit.headers).toMatchObject({
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/json",
  });

  expect(fetchMock.mock.calls[1][0]).toBe("/v1/personas?limit=3");

  const [createPath, createInit] = fetchMock.mock.calls[2];
  expect(createPath).toBe("/v1/personas");
  expect(createInit.method).toBe("POST");
  expect(createInit.body).toBe(JSON.stringify({ name: "합성 모루" }));
  expect(createInit.headers).toMatchObject({
    "Content-Type": "application/json",
    "Idempotency-Key": "key-3",
  });
});

test("취소 신호를 그대로 전달한다", async () => {
  const fetchMock = stubFetch(
    respond(JSON.stringify({ id: "u1", display_name: "합성 사용자" })),
  );
  const controller = new AbortController();

  await httpPersonaApi.getMe(TOKEN, controller.signal);

  expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
});

/*
 * requestBlob — 이미지처럼 JSON이 아닌 응답을 받는 경로.
 * 아직 화면에서 쓰지 않지만, 오류 계약이 request()와 어긋나지 않게 먼저 고정해 둔다.
 */
