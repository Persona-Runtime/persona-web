import { screen } from "@testing-library/react";
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

/** meta → citations → delta(들) → done을 그대로 재현하는 startChatCompletion 목. */
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
      return { replayed: false as const };
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

test("스트리밍 중에는 취소 버튼이 보이고 누르면 cancel API를 호출한다", async () => {
  // 스트림은 취소(AbortSignal)될 때까지 끝나지 않는다 — 취소 버튼이 실제로 그
  // signal을 전달하는지가 이 테스트의 핵심이다.
  const startChatCompletion = vi.fn(
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
      return new Promise<{ replayed: false }>((_resolve, reject) => {
        signal.addEventListener("abort", () =>
          reject(new DOMException("취소됨", "AbortError")),
        );
      });
    },
  );
  const cancelGeneration = vi.fn().mockResolvedValue({
    id: "g1",
    conversation_id: conversation.id,
    user_message_id: "u1",
    assistant_message_id: "g1",
    version_id: conversation.initial_version_id,
    retry_of_generation_id: null,
    mode: "mock",
    status: "cancelled",
    content: "",
    citations: [],
    failure_code: null,
    can_retry: true,
    created_at: "2026-09-22T00:00:00Z",
    finished_at: "2026-09-22T00:00:01Z",
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
});
