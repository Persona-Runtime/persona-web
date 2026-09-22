import { afterEach, expect, test, vi } from "vitest";
import { httpPersonaApi } from "./api";
import { ApiError, type ChatEvent, type Persona } from "./types";

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

/*
 * applyDraft — POST draft/apply. 202 접수, 그리고 계약이 정한 세 가지 실패
 * (revision_mismatch·indexing_in_progress·no_content)를 코드 문자열까지 확인한다.
 * 이 세 코드는 PATCH의 revision_conflict와 다른 문자열이라 여기서 섞이면 바로 드러난다.
 */

test("apply의 202 접수를 성공으로 받는다", async () => {
  stubFetch(
    respond(
      JSON.stringify({
        version_id: "00000000-0000-4000-8000-000000000002",
        status: "processing",
      }),
      202,
    ),
  );

  await expect(
    httpPersonaApi.applyDraft(TOKEN, "persona-1", 3, "key-apply-1"),
  ).resolves.toMatchObject({
    version_id: "00000000-0000-4000-8000-000000000002",
    status: "processing",
  });
});

test("revision이 어긋나면 409 revision_mismatch를 그대로 전달한다", async () => {
  stubFetch(
    respond(
      JSON.stringify({
        error: {
          code: "revision_mismatch",
          message: "...",
          request_id: "00000000-0000-4000-8000-000000000010",
        },
      }),
      409,
    ),
  );

  await expect(
    httpPersonaApi.applyDraft(TOKEN, "persona-1", 1, "key-apply-2"),
  ).rejects.toMatchObject({ status: 409, code: "revision_mismatch" });
});

test("이미 처리 중이면 409 indexing_in_progress를 그대로 전달한다", async () => {
  stubFetch(
    respond(
      JSON.stringify({
        error: {
          code: "indexing_in_progress",
          message: "...",
          request_id: "00000000-0000-4000-8000-000000000011",
        },
      }),
      409,
    ),
  );

  await expect(
    httpPersonaApi.applyDraft(TOKEN, "persona-1", 3, "key-apply-3"),
  ).rejects.toMatchObject({ status: 409, code: "indexing_in_progress" });
});

test("색인할 자료가 없으면 422 no_content를 그대로 전달한다", async () => {
  stubFetch(
    respond(
      JSON.stringify({
        error: {
          code: "no_content",
          message: "...",
          request_id: "00000000-0000-4000-8000-000000000012",
        },
      }),
      422,
    ),
  );

  await expect(
    httpPersonaApi.applyDraft(TOKEN, "persona-1", 3, "key-apply-4"),
  ).rejects.toMatchObject({ status: 422, code: "no_content" });
});

test("apply 요청은 경로·Idempotency-Key·expected_revision을 함께 보낸다", async () => {
  const fetchMock = stubFetch(
    respond(
      JSON.stringify({
        version_id: "00000000-0000-4000-8000-000000000002",
        status: "processing",
      }),
      202,
    ),
  );

  await httpPersonaApi.applyDraft(TOKEN, "persona-1", 5, "key-apply-5");

  const [path, init] = fetchMock.mock.calls[0];
  expect(path).toBe("/v1/personas/persona-1/draft/apply");
  expect(init.method).toBe("POST");
  expect(init.body).toBe(JSON.stringify({ expected_revision: 5 }));
  expect(init.headers).toMatchObject({
    Authorization: `Bearer ${TOKEN}`,
    "Idempotency-Key": "key-apply-5",
  });
});

/**
 * 주어진 문자열 조각들을 그대로 개별 network read로 나눠 보내는 SSE 응답을 만든다.
 * "network read 한 번 = 이벤트 하나"라고 가정하면 안 된다는 계약을 실제로
 * 재현하려는 것이다 — 한 이벤트를 일부러 여러 read로 쪼개거나, 멀티바이트 UTF-8
 * 문자를 read 경계에서 자른다.
 */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** UTF-8 바이트 조각을 그대로 여러 read로 나눠 보낸다(문자 중간에서 잘려도 된다). */
function sseResponseFromBytes(chunks: Uint8Array[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

test("SSE 이벤트가 여러 network read로 나뉘어도 순서대로 조립한다", async () => {
  const metaFrame =
    'event: meta\ndata: {"generation_id":"g1","conversation_id":"c1","user_message_id":"u1","assistant_message_id":"g1","version_id":"v1","mode":"mock"}\n\n';
  const doneFrame =
    'event: done\ndata: {"generation_id":"g1","status":"completed","finish_reason":"stop"}\n\n';
  const combined = metaFrame + doneFrame;
  // 이벤트 경계와 무관한 임의 지점(중간)에서 두 read로 쪼갠다.
  const cut = Math.floor(combined.length / 2);
  stubFetch(sseResponse([combined.slice(0, cut), combined.slice(cut)]));

  const events: ChatEvent[] = [];
  const result = await httpPersonaApi.startChatCompletion(
    TOKEN,
    "c1",
    "질문",
    "key-1",
    (event) => events.push(event),
  );

  expect(result).toEqual({ replayed: false, terminal: true });
  expect(events.map((e) => e.type)).toEqual(["meta", "done"]);
  expect(events[0]).toMatchObject({ data: { generation_id: "g1" } });
});

test("meta → citations → EOF(done 없음)은 terminal:false를 돌려준다", async () => {
  // 리뷰 P1: done·error 없이 연결이 끝나면(upstream 중간 단절 등) 성공으로
  // 넘겨짚지 않아야 한다 — 그 판단 근거가 이 반환값이다.
  const frames = [
    'event: meta\ndata: {"generation_id":"g1","conversation_id":"c1","user_message_id":"u1","assistant_message_id":"g1","version_id":"v1","mode":"mock"}\n\n',
    'event: citations\ndata: {"generation_id":"g1","items":[]}\n\n',
  ];
  stubFetch(sseResponse(frames));

  const events: ChatEvent[] = [];
  const result = await httpPersonaApi.startChatCompletion(
    TOKEN,
    "c1",
    "질문",
    "key-1",
    (event) => events.push(event),
  );

  expect(result).toEqual({ replayed: false, terminal: false });
  expect(events.map((e) => e.type)).toEqual(["meta", "citations"]);
});

test("meta → delta → EOF(done 없음)은 terminal:false를 돌려준다", async () => {
  const frames = [
    'event: meta\ndata: {"generation_id":"g1","conversation_id":"c1","user_message_id":"u1","assistant_message_id":"g1","version_id":"v1","mode":"mock"}\n\n',
    'event: delta\ndata: {"generation_id":"g1","index":0,"text":"합성"}\n\n',
  ];
  stubFetch(sseResponse(frames));

  const events: ChatEvent[] = [];
  const result = await httpPersonaApi.startChatCompletion(
    TOKEN,
    "c1",
    "질문",
    "key-1",
    (event) => events.push(event),
  );

  expect(result).toEqual({ replayed: false, terminal: false });
  expect(events.map((e) => e.type)).toEqual(["meta", "delta"]);
});

test("delta 인덱스가 0부터 단조 증가하는 SSE 스트림을 그대로 전달한다", async () => {
  const frames = [
    'event: meta\ndata: {"generation_id":"g1","conversation_id":"c1","user_message_id":"u1","assistant_message_id":"g1","version_id":"v1","mode":"mock"}\n\n',
    'event: citations\ndata: {"generation_id":"g1","items":[]}\n\n',
    'event: delta\ndata: {"generation_id":"g1","index":0,"text":"합"}\n\n',
    'event: delta\ndata: {"generation_id":"g1","index":1,"text":"성"}\n\n',
    'event: done\ndata: {"generation_id":"g1","status":"completed","finish_reason":"stop"}\n\n',
  ];
  stubFetch(sseResponse(frames));

  const events: ChatEvent[] = [];
  await httpPersonaApi.startChatCompletion(
    TOKEN,
    "c1",
    "질문",
    "key-1",
    (event) => events.push(event),
  );

  const deltas = events.filter((e) => e.type === "delta");
  expect(deltas.map((d) => d.data.index)).toEqual([0, 1]);
  expect(deltas.map((d) => d.data.text).join("")).toBe("합성");
});

test("멀티바이트 UTF-8 문자가 network read 경계에서 잘려도 올바르게 디코딩한다", async () => {
  const frame =
    'event: delta\ndata: {"generation_id":"g1","index":0,"text":"한글"}\n\n';
  const bytes = new TextEncoder().encode(frame);
  // "한"(3바이트) 중간에서 자른다 — 일부러 문자 경계가 아닌 바이트 경계로 쪼갠다.
  const cut = 3 + 1;
  stubFetch(sseResponseFromBytes([bytes.slice(0, cut), bytes.slice(cut)]));

  const events: ChatEvent[] = [];
  await httpPersonaApi.startChatCompletion(
    TOKEN,
    "c1",
    "질문",
    "key-1",
    (event) => events.push(event),
  );

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ type: "delta", data: { text: "한글" } });
});

test("알 수 없는 이벤트 이름은 조용히 건너뛰고 나머지는 처리한다", async () => {
  const frames = [
    'event: unknown_future_event\ndata: {"whatever":true}\n\n',
    'event: done\ndata: {"generation_id":"g1","status":"completed","finish_reason":"stop"}\n\n',
  ];
  stubFetch(sseResponse(frames));

  const events: ChatEvent[] = [];
  await httpPersonaApi.startChatCompletion(
    TOKEN,
    "c1",
    "질문",
    "key-1",
    (event) => events.push(event),
  );

  expect(events.map((e) => e.type)).toEqual(["done"]);
});

test("Content-Type이 application/json이면 SSE로 파싱하지 않고 replay를 바로 반환한다", async () => {
  const generation = {
    id: "g1",
    conversation_id: "c1",
    user_message_id: "u1",
    assistant_message_id: "g1",
    version_id: "v1",
    retry_of_generation_id: null,
    mode: "mock",
    status: "completed",
    content: "이미 저장된 응답",
    citations: [],
    failure_code: null,
    can_retry: true,
    created_at: "2026-09-22T00:00:00+00:00",
    finished_at: "2026-09-22T00:00:01+00:00",
  };
  stubFetch(respond(JSON.stringify({ replayed: true, generation })));

  const onEvent = vi.fn();
  const result = await httpPersonaApi.startChatCompletion(
    TOKEN,
    "c1",
    "질문",
    "key-1",
    onEvent,
  );

  expect(onEvent).not.toHaveBeenCalled();
  expect(result).toEqual({ replayed: true, generation });
});

test("chat/completions 요청은 Idempotency-Key와 conversation_id·message 본문을 보낸다", async () => {
  const frames = [
    'event: meta\ndata: {"generation_id":"g1","conversation_id":"c1","user_message_id":"u1","assistant_message_id":"g1","version_id":"v1","mode":"mock"}\n\n',
    'event: citations\ndata: {"generation_id":"g1","items":[]}\n\n',
    'event: done\ndata: {"generation_id":"g1","status":"completed","finish_reason":"stop"}\n\n',
  ];
  const fetchMock = stubFetch(sseResponse(frames));

  await httpPersonaApi.startChatCompletion(
    TOKEN,
    "c1",
    "모루야 안녕",
    "key-42",
    () => {},
  );

  const [path, init] = fetchMock.mock.calls[0];
  expect(path).toBe("/v1/chat/completions");
  expect(init.method).toBe("POST");
  expect(init.body).toBe(
    JSON.stringify({ conversation_id: "c1", message: "모루야 안녕" }),
  );
  expect(init.headers).toMatchObject({
    Authorization: `Bearer ${TOKEN}`,
    "Idempotency-Key": "key-42",
    Accept: "text/event-stream",
  });
});
