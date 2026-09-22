import { screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { ChatEvent, Conversation, Draft, Generation } from "../lib/types";
import {
  authenticate,
  persona,
  personaApi,
  personaNav,
  renderApp,
} from "../test/renderApp";

const baseDraft: Draft = {
  version_id: "10000000-0000-4000-8000-000000000001",
  revision: 1,
  status: "editing",
  job_id: null,
  requires_processing: true,
  persona_id: persona.id,
  base_version_id: null,
  settings: { name: persona.name, profile: "", speech_examples: "" },
  sources: [],
  warnings: [],
  can_activate: false,
  updated_at: "2026-09-10T00:00:00Z",
  indexed_revision: null,
  indexed_at: null,
  error_code: null,
};

const conversation: Conversation = {
  id: "20000000-0000-4000-8000-000000000001",
  persona_id: persona.id,
  title: persona.name,
  initial_version_id: baseDraft.version_id,
  material_changed: false,
  active_generation_id: null,
  created_at: "2026-09-22T00:00:00Z",
  updated_at: "2026-09-22T00:00:00Z",
};

async function openChatScreen(user: ReturnType<typeof renderApp>["user"]) {
  await authenticate(user);
  await user.click(
    await personaNav().findByRole("link", { name: /합성 모루/ }),
  );
  await screen.findByRole("heading", { name: "합성 모루" });
  await user.click(screen.getByRole("link", { name: "대화" }));
  await screen.findByRole("heading", { name: /대화/ });
}

/**
 * 주어진 이벤트를 그대로 재현하는 startChatCompletion 목. terminal은 이벤트
 * 목록에 done·error가 실제로 있는지로 정한다 — EOF-미확정 시나리오를 만들려면
 * done·error를 빼고 넘기면 된다.
 */
function streamingApi(events: ChatEvent[]) {
  return vi.fn(
    async (
      _token: string,
      _conversationId: string,
      _message: string,
      _key: string,
      onEvent: (event: ChatEvent) => void,
    ) => {
      for (const event of events) onEvent(event);
      const terminal = events.some(
        (event) => event.type === "done" || event.type === "error",
      );
      return { replayed: false as const, terminal };
    },
  );
}

test("상태가 ready가 아니면 자료를 먼저 적용하라고 안내한다", async () => {
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue({ ...baseDraft, status: "editing" }),
    }),
  });

  await openChatScreen(user);

  expect(screen.getByText("자료를 먼저 적용하세요.")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "자료 편집으로 이동" }),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("메시지")).toBeNull();
});

test("자료가 준비되면 기존 대화를 불러와 메시지 입력창을 보여준다", async () => {
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue({ ...baseDraft, status: "ready" }),
      listConversations: vi
        .fn()
        .mockResolvedValue({ items: [conversation], next_cursor: null }),
      listMessages: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    }),
  });

  await openChatScreen(user);

  expect(await screen.findByLabelText("메시지")).toBeInTheDocument();
});

test("메시지를 보내면 SSE 이벤트 순서대로 답변이 누적되고 citations가 보인다", async () => {
  const events: ChatEvent[] = [
    {
      type: "meta",
      data: {
        generation_id: "g1",
        conversation_id: conversation.id,
        user_message_id: "u1",
        assistant_message_id: "g1",
        version_id: conversation.initial_version_id,
        mode: "mock",
      },
    },
    {
      type: "citations",
      data: {
        generation_id: "g1",
        items: [
          {
            id: "c1",
            source_id: "s1",
            version_id: conversation.initial_version_id,
            title: "사건 · ",
            excerpt: "모루는 도서관 앞에서…",
          },
        ],
      },
    },
    { type: "delta", data: { generation_id: "g1", index: 0, text: "합성 " } },
    {
      type: "delta",
      data: { generation_id: "g1", index: 1, text: "응답입니다." },
    },
    {
      type: "done",
      data: { generation_id: "g1", status: "completed", finish_reason: "stop" },
    },
  ];
  const startChatCompletion = streamingApi(events);
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue({ ...baseDraft, status: "ready" }),
      listConversations: vi
        .fn()
        .mockResolvedValue({ items: [conversation], next_cursor: null }),
      listMessages: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      startChatCompletion,
    }),
  });

  await openChatScreen(user);
  const input = await screen.findByLabelText("메시지");
  await user.type(input, "모루야 안녕");
  await user.click(screen.getByRole("button", { name: "보내기" }));

  expect(await screen.findByText("합성 응답입니다.")).toBeInTheDocument();
  expect(screen.getByText("모루야 안녕")).toBeInTheDocument();
  expect(screen.getByText(/사건 ·/)).toBeInTheDocument();
  // 전송 뒤 입력창은 비워진다.
  expect(input).toHaveValue("");
  expect(startChatCompletion).toHaveBeenCalledTimes(1);
});

test("스트림이 error로 끝나면 실패 안내와 다시 시도 버튼을 보여준다", async () => {
  const events: ChatEvent[] = [
    {
      type: "meta",
      data: {
        generation_id: "g1",
        conversation_id: conversation.id,
        user_message_id: "u1",
        assistant_message_id: "g1",
        version_id: conversation.initial_version_id,
        mode: "mock",
      },
    },
    {
      type: "citations",
      data: { generation_id: "g1", items: [] },
    },
    {
      type: "error",
      data: {
        generation_id: "g1",
        code: "upstream_503",
        message: "실패",
        status: "failed",
      },
    },
  ];
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue({ ...baseDraft, status: "ready" }),
      listConversations: vi
        .fn()
        .mockResolvedValue({ items: [conversation], next_cursor: null }),
      listMessages: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      startChatCompletion: streamingApi(events),
    }),
  });

  await openChatScreen(user);
  const input = await screen.findByLabelText("메시지");
  await user.type(input, "실패하는 질문");
  await user.click(screen.getByRole("button", { name: "보내기" }));

  expect(
    await screen.findByText("응답 생성에 실패했습니다."),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
});

test("Idempotency-Key 재전송(JSON replay)은 스트림 없이 현재 저장 상태를 바로 보여준다", async () => {
  const replayedGeneration: Generation = {
    id: "g1",
    conversation_id: conversation.id,
    user_message_id: "u1",
    assistant_message_id: "g1",
    version_id: conversation.initial_version_id,
    retry_of_generation_id: null,
    mode: "mock",
    status: "completed",
    content: "이미 저장된 응답",
    citations: [],
    failure_code: null,
    can_retry: true,
    created_at: "2026-09-22T00:00:00Z",
    finished_at: "2026-09-22T00:00:01Z",
  };
  const startChatCompletion = vi
    .fn()
    .mockResolvedValue({ replayed: true, generation: replayedGeneration });
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue({ ...baseDraft, status: "ready" }),
      listConversations: vi
        .fn()
        .mockResolvedValue({ items: [conversation], next_cursor: null }),
      listMessages: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      startChatCompletion,
    }),
  });

  await openChatScreen(user);
  const input = await screen.findByLabelText("메시지");
  await user.type(input, "재전송 테스트");
  await user.click(screen.getByRole("button", { name: "보내기" }));

  expect(await screen.findByText("이미 저장된 응답")).toBeInTheDocument();
});

/**
 * meta만 보내고 취소(AbortSignal)될 때까지 끝나지 않는 startChatCompletion 목 —
 * 취소 버튼이 실제로 그 signal을 전달하는지 확인하는 테스트들이 공유한다.
 */
function pendingCancelApi() {
  return vi.fn(
    (
      _token: string,
      _conversationId: string,
      _message: string,
      _key: string,
      onEvent: (event: ChatEvent) => void,
      signal: AbortSignal,
    ) => {
      onEvent({
        type: "meta",
        data: {
          generation_id: "g1",
          conversation_id: conversation.id,
          user_message_id: "u1",
          assistant_message_id: "g1",
          version_id: conversation.initial_version_id,
          mode: "mock",
        },
      });
      return new Promise<{ replayed: false; terminal: boolean }>(
        (_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new DOMException("취소됨", "AbortError")),
          );
        },
      );
    },
  );
}

function cancelResponse(status: "cancel_requested" | "cancelled"): Generation {
  return {
    id: "g1",
    conversation_id: conversation.id,
    user_message_id: "u1",
    assistant_message_id: "g1",
    version_id: conversation.initial_version_id,
    retry_of_generation_id: null,
    mode: "mock",
    status,
    content: "",
    citations: [],
    failure_code: null,
    can_retry: true,
    created_at: "2026-09-22T00:00:00Z",
    finished_at: status === "cancelled" ? "2026-09-22T00:00:01Z" : null,
  };
}

test("스트리밍 중에는 취소 버튼이 보이고 누르면 cancel API를 호출한다", async () => {
  const startChatCompletion = pendingCancelApi();
  const cancelGeneration = vi
    .fn()
    .mockResolvedValue(cancelResponse("cancelled"));
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue({ ...baseDraft, status: "ready" }),
      listConversations: vi
        .fn()
        .mockResolvedValue({ items: [conversation], next_cursor: null }),
      listMessages: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      startChatCompletion,
      cancelGeneration,
    }),
  });

  await openChatScreen(user);
  const input = await screen.findByLabelText("메시지");
  await user.type(input, "취소할 질문");
  await user.click(screen.getByRole("button", { name: "보내기" }));

  const cancelButton = await screen.findByRole("button", { name: "응답 취소" });
  await user.click(cancelButton);

  expect(cancelGeneration).toHaveBeenCalledWith(
    "synthetic-token",
    "g1",
    expect.anything(),
  );
  // cancel 응답이 실제로 cancelled(terminal)이므로 turns로 확정되고
  // "취소를 요청했습니다…" 안내는 사라진다.
  expect(await screen.findByText("취소됨")).toBeInTheDocument();
  expect(screen.queryByText("취소를 요청했습니다…")).not.toBeInTheDocument();
});

test("cancel 응답이 cancel_requested(아직 미확정)면 turns로 확정하지 않는다", async () => {
  // 리뷰 P1: 200 cancel 응답만으로 취소 완료를 주장하면 안 된다 — cancel_requested는
  // 접수됐을 뿐 종료가 아니다.
  const startChatCompletion = pendingCancelApi();
  const cancelGeneration = vi
    .fn()
    .mockResolvedValue(cancelResponse("cancel_requested"));
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue({ ...baseDraft, status: "ready" }),
      listConversations: vi
        .fn()
        .mockResolvedValue({ items: [conversation], next_cursor: null }),
      listMessages: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      startChatCompletion,
      cancelGeneration,
    }),
  });

  await openChatScreen(user);
  const input = await screen.findByLabelText("메시지");
  await user.type(input, "취소할 질문");
  await user.click(screen.getByRole("button", { name: "보내기" }));

  const cancelButton = await screen.findByRole("button", { name: "응답 취소" });
  await user.click(cancelButton);

  await waitFor(() => expect(cancelGeneration).toHaveBeenCalledTimes(1));
  // 아직 미확정 — "취소를 요청했습니다…" 안내가 계속 보이고, 완료 상태
  // "취소됨"은 turns에 나타나지 않는다.
  expect(await screen.findByText("취소를 요청했습니다…")).toBeInTheDocument();
  expect(screen.queryByText("취소됨")).not.toBeInTheDocument();
});

/**
 * EOF(done·error 없이 스트림 종료) 뒤 재조회(listMessages) 결과가 각각
 * completed/cancelled/reconciling일 때 화면이 올바르게 반영하는지 — 리뷰 P1.
 * listMessages는 초기 로드(빈 목록) 뒤 재조회에서 주어진 결과를 반환한다.
 */
async function runEofReconcileCase(
  reconciledGeneration: Generation,
): Promise<void> {
  const eofEvents: ChatEvent[] = [
    {
      type: "meta",
      data: {
        generation_id: "g1",
        conversation_id: conversation.id,
        user_message_id: "u1",
        assistant_message_id: "g1",
        version_id: conversation.initial_version_id,
        mode: "mock",
      },
    },
    { type: "citations", data: { generation_id: "g1", items: [] } },
  ];
  const listMessages = vi
    .fn()
    .mockResolvedValueOnce({ items: [], next_cursor: null })
    .mockResolvedValueOnce({
      items: [
        {
          user_message: {
            id: "u1",
            content: "EOF 뒤 재조회 질문",
            created_at: "2026-09-22T00:00:00Z",
          },
          generations: [reconciledGeneration],
        },
      ],
      next_cursor: null,
    });
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue({ ...baseDraft, status: "ready" }),
      listConversations: vi
        .fn()
        .mockResolvedValue({ items: [conversation], next_cursor: null }),
      listMessages,
      startChatCompletion: streamingApi(eofEvents),
    }),
  });

  await openChatScreen(user);
  const input = await screen.findByLabelText("메시지");
  await user.type(input, "EOF 뒤 재조회 질문");
  await user.click(screen.getByRole("button", { name: "보내기" }));

  await waitFor(() => expect(listMessages).toHaveBeenCalledTimes(2));
}

function reconciledGenerationWith(
  status: "completed" | "cancelled" | "reconciling",
  content: string,
): Generation {
  return {
    id: "g1",
    conversation_id: conversation.id,
    user_message_id: "u1",
    assistant_message_id: "g1",
    version_id: conversation.initial_version_id,
    retry_of_generation_id: null,
    mode: "mock",
    status,
    content,
    citations: [],
    failure_code: status === "reconciling" ? null : null,
    can_retry: status !== "reconciling",
    created_at: "2026-09-22T00:00:00Z",
    finished_at: status === "reconciling" ? null : "2026-09-22T00:00:02Z",
  };
}

test("EOF 뒤 재조회 결과가 completed면 turns로 확정한다", async () => {
  await runEofReconcileCase(
    reconciledGenerationWith("completed", "재조회로 확인한 완료 응답"),
  );
  expect(
    await screen.findByText("재조회로 확인한 완료 응답"),
  ).toBeInTheDocument();
});

test("EOF 뒤 재조회 결과가 cancelled면 취소됨으로 확정한다", async () => {
  await runEofReconcileCase(reconciledGenerationWith("cancelled", ""));
  expect(await screen.findByText("취소됨")).toBeInTheDocument();
});

test("EOF 뒤 재조회 결과가 reconciling이면 계속 지켜본다(확정하지 않는다)", async () => {
  await runEofReconcileCase(reconciledGenerationWith("reconciling", ""));
  expect(
    await screen.findByText("결과를 확인하는 중입니다."),
  ).toBeInTheDocument();
  expect(screen.queryByText("취소됨")).not.toBeInTheDocument();
});

test("delta가 meta보다 먼저 오면 크래시 없이 무시된다", async () => {
  const events: ChatEvent[] = [
    {
      type: "delta",
      data: { generation_id: "g1", index: 0, text: "무시되어야 함" },
    },
    {
      type: "meta",
      data: {
        generation_id: "g1",
        conversation_id: conversation.id,
        user_message_id: "u1",
        assistant_message_id: "g1",
        version_id: conversation.initial_version_id,
        mode: "mock",
      },
    },
    { type: "citations", data: { generation_id: "g1", items: [] } },
    {
      type: "done",
      data: { generation_id: "g1", status: "completed", finish_reason: "stop" },
    },
  ];
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue({ ...baseDraft, status: "ready" }),
      listConversations: vi
        .fn()
        .mockResolvedValue({ items: [conversation], next_cursor: null }),
      listMessages: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      startChatCompletion: streamingApi(events),
    }),
  });

  await openChatScreen(user);
  const input = await screen.findByLabelText("메시지");
  await user.type(input, "순서 오류 질문");
  await user.click(screen.getByRole("button", { name: "보내기" }));

  // meta 이전 delta는 streaming이 아직 없어 조용히 버려진다 — 크래시도, 내용
  // 오염도 없다.
  await screen.findByText("순서 오류 질문");
  expect(screen.queryByText("무시되어야 함")).not.toBeInTheDocument();
});

test("meta 이후 다른 generation_id의 이벤트는 무시된다", async () => {
  const events: ChatEvent[] = [
    {
      type: "meta",
      data: {
        generation_id: "g1",
        conversation_id: conversation.id,
        user_message_id: "u1",
        assistant_message_id: "g1",
        version_id: conversation.initial_version_id,
        mode: "mock",
      },
    },
    { type: "citations", data: { generation_id: "g1", items: [] } },
    {
      type: "delta",
      data: {
        generation_id: "other-generation",
        index: 0,
        text: "다른 generation 오염",
      },
    },
    {
      type: "delta",
      data: { generation_id: "g1", index: 0, text: "정상 응답" },
    },
    {
      type: "done",
      data: { generation_id: "g1", status: "completed", finish_reason: "stop" },
    },
  ];
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue({ ...baseDraft, status: "ready" }),
      listConversations: vi
        .fn()
        .mockResolvedValue({ items: [conversation], next_cursor: null }),
      listMessages: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      startChatCompletion: streamingApi(events),
    }),
  });

  await openChatScreen(user);
  const input = await screen.findByLabelText("메시지");
  await user.type(input, "generation ID 확인");
  await user.click(screen.getByRole("button", { name: "보내기" }));

  expect(await screen.findByText("정상 응답")).toBeInTheDocument();
  expect(screen.queryByText(/다른 generation 오염/)).not.toBeInTheDocument();
});

test("중복 terminal 이벤트(done 두 번)는 두 번째가 무시된다", async () => {
  const events: ChatEvent[] = [
    {
      type: "meta",
      data: {
        generation_id: "g1",
        conversation_id: conversation.id,
        user_message_id: "u1",
        assistant_message_id: "g1",
        version_id: conversation.initial_version_id,
        mode: "mock",
      },
    },
    { type: "citations", data: { generation_id: "g1", items: [] } },
    {
      type: "delta",
      data: { generation_id: "g1", index: 0, text: "완료 응답" },
    },
    {
      type: "done",
      data: { generation_id: "g1", status: "completed", finish_reason: "stop" },
    },
    {
      type: "done",
      data: { generation_id: "g1", status: "completed", finish_reason: "stop" },
    },
  ];
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue({ ...baseDraft, status: "ready" }),
      listConversations: vi
        .fn()
        .mockResolvedValue({ items: [conversation], next_cursor: null }),
      listMessages: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      startChatCompletion: streamingApi(events),
    }),
  });

  await openChatScreen(user);
  const input = await screen.findByLabelText("메시지");
  await user.type(input, "중복 이벤트 질문");
  await user.click(screen.getByRole("button", { name: "보내기" }));

  expect(await screen.findAllByText("완료 응답")).toHaveLength(1);
});

test("meta가 확정한 user_message_id·assistant_message_id를 그대로 쓴다", async () => {
  // 리뷰 P2: 클라이언트가 미리 만든 UUID로 서버 확정 ID를 덮으면 안 된다.
  const events: ChatEvent[] = [
    {
      type: "meta",
      data: {
        generation_id: "g1",
        conversation_id: conversation.id,
        user_message_id: "server-user-msg-id",
        assistant_message_id: "server-assistant-msg-id",
        version_id: conversation.initial_version_id,
        mode: "mock",
      },
    },
    { type: "citations", data: { generation_id: "g1", items: [] } },
    {
      type: "delta",
      data: { generation_id: "g1", index: 0, text: "서버 확정 응답" },
    },
    {
      type: "done",
      data: { generation_id: "g1", status: "completed", finish_reason: "stop" },
    },
  ];
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue({ ...baseDraft, status: "ready" }),
      listConversations: vi
        .fn()
        .mockResolvedValue({ items: [conversation], next_cursor: null }),
      listMessages: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
      startChatCompletion: streamingApi(events),
    }),
  });

  await openChatScreen(user);
  const input = await screen.findByLabelText("메시지");
  await user.type(input, "ID 확인 질문");
  await user.click(screen.getByRole("button", { name: "보내기" }));

  const userParagraph = await screen.findByText("ID 확인 질문");
  expect(userParagraph).toHaveAttribute(
    "data-user-message-id",
    "server-user-msg-id",
  );
  const assistantParagraph = await screen.findByText("서버 확정 응답");
  const assistantBlock = assistantParagraph.closest('[data-role="assistant"]');
  expect(assistantBlock).toHaveAttribute(
    "data-assistant-message-id",
    "server-assistant-msg-id",
  );
});
