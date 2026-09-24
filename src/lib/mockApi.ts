import {
  ApiError,
  type ChatCompletionResult,
  type ChatEvent,
  type Conversation,
  type ConversationPage,
  type Draft,
  type DraftSettings,
  type Generation,
  type MessagePage,
  type MessageTurn,
  type Persona,
  type PersonaApi,
  type PersonaPage,
  type SessionToken,
  type User,
} from "./types";

// mock 응답은 타입 리터럴로 만들어 계약 모양이 컴파일 타임에 보장된다. 그래서
// 실제 경로의 응답 형식 검증(api.ts)이 여기서는 작동할 일이 없다.
// mock 통과를 실제 계약 준수의 증거로 쓰지 않는다.
const mockUser: User = { id: "synthetic-user", display_name: "합성 사용자" };
let mockPersonas: Persona[] = [];
// 초안은 캐릭터당 하나다. 실제 저장소도 persona_id를 PK로 두어 같은 규칙을 강제한다.
const mockDrafts = new Map<string, Draft>();
const mockConversations = new Map<string, Conversation>();
const mockMessageTurns = new Map<string, MessageTurn[]>();
let mockGenerationSeq = 0;

function mockDraft(personaId: string, settings: DraftSettings): Draft {
  return {
    version_id: crypto.randomUUID(),
    revision: 1,
    status: "editing",
    job_id: null,
    requires_processing: true,
    persona_id: personaId,
    base_version_id: null,
    settings,
    sources: [],
    warnings: [],
    can_activate: false,
    updated_at: new Date().toISOString(),
    indexed_revision: null,
    indexed_at: null,
    error_code: null,
  };
}

function delay(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, 150);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timeout);
      reject(new DOMException("요청이 취소되었습니다.", "AbortError"));
    });
  });
}

/** 적용 처리 접수 뒤 processing → ready/failed로 바뀌기까지 흉내 내는 지연(ms). */
const APPLY_DELAY_MS = 2000;

/**
 * 테스트에서 적용 실패 경로를 재현하기 위한 스위치. 기본은 성공(ready)이고,
 * 켜면 다음 적용이 failed로 끝난다. 테스트는 각 케이스 뒤 반드시 false로 되돌린다.
 */
export let PERSONA_MOCK_APPLY_FAIL = false;
export function setMockApplyFail(fail: boolean): void {
  PERSONA_MOCK_APPLY_FAIL = fail;
}

/**
 * mock은 내부 Bearer 경로만 흉내 낸다 — 토큰이 없거나 공백이면 401이다.
 *
 * ForwardAuth 경로(token === null)를 성공으로 처리하지 않는 이유: mock에는 앞단
 * 프록시가 없어 "헤더가 붙었다"를 재현할 수 없고, 성공으로 두면 개발자가 mock으로
 * 보는 화면과 실제 공개 경로의 화면이 달라진다. 부트스트랩 프로브는 mock에서
 * 401을 받아 토큰 입력창으로 떨어진다 — 지금까지와 같은 동작이다.
 */
function requireMockToken(token: SessionToken): void {
  if (token === null || !token.trim()) throw new ApiError(401, "unauthorized");
}

export const mockPersonaApi: PersonaApi = {
  async getMe(token, signal) {
    await delay(signal);
    requireMockToken(token);
    return mockUser;
  },
  async listPersonas(token, signal): Promise<PersonaPage> {
    await delay(signal);
    requireMockToken(token);
    return { items: mockPersonas, next_cursor: null };
  },
  async createPersona(token, name, _idempotencyKey, signal) {
    await delay(signal);
    requireMockToken(token);
    if (mockPersonas.length >= 3)
      throw new ApiError(409, "persona_limit_exceeded");
    if (mockPersonas.some((persona) => persona.name === name)) {
      throw new ApiError(409, "duplicate_persona_name");
    }
    const persona: Persona = {
      id: crypto.randomUUID(),
      name,
      status: "needs_material",
      active_version_id: null,
      draft: null,
      deletion_id: null,
      created_at: new Date().toISOString(),
    };
    mockPersonas = [persona, ...mockPersonas];
    return persona;
  },

  async createDraft(token, personaId, body, _idempotencyKey, signal) {
    await delay(signal);
    requireMockToken(token);
    if (mockDrafts.has(personaId)) throw new ApiError(409, "draft_exists");
    // 파생 경로는 서버가 적용본의 설정을 복사한다. mock에는 보관해 둔 적용본이
    // 없으므로 빈 설정으로 대신한다 — 화면 흐름 확인이 목적이고, 실제 복사 결과는
    // 실 서버에서만 의미가 있다.
    const settings =
      "settings" in body
        ? body.settings
        : { name: "", profile: "", speech_examples: "" };
    const draft = mockDraft(personaId, settings);
    mockDrafts.set(personaId, draft);
    return draft;
  },

  async getDraft(token, personaId, signal) {
    await delay(signal);
    requireMockToken(token);
    const draft = mockDrafts.get(personaId);
    if (draft === undefined) throw new ApiError(404, "draft_not_found");
    return draft;
  },

  async patchDraft(token, personaId, patch, _idempotencyKey, signal) {
    await delay(signal);
    requireMockToken(token);
    const draft = mockDrafts.get(personaId);
    if (draft === undefined) throw new ApiError(404, "draft_not_found");
    // revision CAS. 가짜도 같은 규칙을 지키지 않으면 화면이 낡은 revision을 보내도 통과한다.
    if (draft.revision !== patch.expected_revision) {
      throw new ApiError(409, "revision_conflict");
    }

    let sources = draft.sources;
    const removeIds = new Set(patch.remove_source_ids ?? []);
    if (removeIds.size > 0) {
      sources = sources.filter((source) => !removeIds.has(source.id));
    }
    for (const upsert of patch.upsert_sources ?? []) {
      // 실 서버는 sha256을 실제로 계산하지만, 이 화면은 그 값을 읽지 않으므로
      // 형식만 맞춘 자리표시자를 쓴다(진짜 해시가 아님).
      const byteSize = new TextEncoder().encode(upsert.content).length;
      const existingIndex =
        upsert.id === undefined
          ? -1
          : sources.findIndex((source) => source.id === upsert.id);
      if (existingIndex >= 0) {
        sources = sources.map((source, index) =>
          index === existingIndex
            ? {
                ...source,
                kind: upsert.kind,
                filename: upsert.filename ?? null,
                content: upsert.content,
                byte_size: byteSize,
              }
            : source,
        );
      } else {
        sources = [
          ...sources,
          {
            id: upsert.id ?? crypto.randomUUID(),
            kind: upsert.kind,
            filename: upsert.filename ?? null,
            content: upsert.content,
            byte_size: byteSize,
            sha256: "0".repeat(64),
          },
        ];
      }
    }

    const next: Draft = {
      ...draft,
      revision: draft.revision + 1,
      settings: { ...draft.settings, ...(patch.settings ?? {}) },
      sources,
      updated_at: new Date().toISOString(),
    };
    mockDrafts.set(personaId, next);
    return next;
  },

  async applyDraft(
    token,
    personaId,
    expectedRevision,
    _idempotencyKey,
    signal,
  ) {
    await delay(signal);
    requireMockToken(token);
    const draft = mockDrafts.get(personaId);
    if (draft === undefined) throw new ApiError(404, "draft_not_found");
    // 진행 중 여부를 revision보다 먼저 본다 — 실 서버가 advisory lock을 revision 검사보다
    // 먼저 시도하는 순서를 흉내 낸다.
    if (draft.status === "processing") {
      throw new ApiError(409, "indexing_in_progress");
    }
    if (draft.revision !== expectedRevision) {
      throw new ApiError(409, "revision_mismatch");
    }
    if (draft.sources.length === 0) {
      throw new ApiError(422, "no_content");
    }

    const processing: Draft = {
      ...draft,
      status: "processing",
      job_id: crypto.randomUUID(),
      updated_at: new Date().toISOString(),
    };
    mockDrafts.set(personaId, processing);

    // 실제 백엔드처럼 접수 뒤 백그라운드에서 상태가 바뀐다. 상태 화면의 폴링이 이 전이를
    // 보도록 타이머로 흉내 낸다 — 테스트는 fake timer로 이 지연을 제어한다.
    window.setTimeout(() => {
      const current = mockDrafts.get(personaId);
      if (current === undefined || current.status !== "processing") return;
      // 실패해도 indexed_revision/indexed_at은 건드리지 않는다 — 계약대로 "마지막
      // 색인 성공"은 최신 시도의 성패와 별개다.
      mockDrafts.set(
        personaId,
        PERSONA_MOCK_APPLY_FAIL
          ? {
              ...current,
              status: "failed",
              error_code: "mock_failed",
              updated_at: new Date().toISOString(),
            }
          : {
              ...current,
              status: "ready",
              error_code: null,
              indexed_revision: current.revision,
              indexed_at: new Date().toISOString(),
              can_activate: true,
              updated_at: new Date().toISOString(),
            },
      );
    }, APPLY_DELAY_MS);

    return { version_id: processing.version_id, status: "processing" };
  },

  async discardDraft(token, personaId, _idempotencyKey, signal) {
    await delay(signal);
    requireMockToken(token);
    if (!mockDrafts.delete(personaId))
      throw new ApiError(404, "draft_not_found");
  },

  async createConversation(token, personaId, _idempotencyKey, signal) {
    await delay(signal);
    requireMockToken(token);
    const draft = mockDrafts.get(personaId);
    if (draft === undefined || draft.status !== "ready") {
      throw new ApiError(409, "not_indexed");
    }
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      persona_id: personaId,
      title: draft.settings.name,
      initial_version_id: draft.version_id,
      material_changed: false,
      active_generation_id: null,
      created_at: now,
      updated_at: now,
    };
    mockConversations.set(conversation.id, conversation);
    mockMessageTurns.set(conversation.id, []);
    return conversation;
  },

  async listConversations(
    token,
    personaId,
    _cursor,
    signal,
  ): Promise<ConversationPage> {
    await delay(signal);
    requireMockToken(token);
    const items = [...mockConversations.values()]
      .filter((conversation) => conversation.persona_id === personaId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { items, next_cursor: null };
  },

  async listMessages(
    token,
    conversationId,
    _cursor,
    signal,
  ): Promise<MessagePage> {
    await delay(signal);
    requireMockToken(token);
    return {
      items: mockMessageTurns.get(conversationId) ?? [],
      next_cursor: null,
    };
  },

  async startChatCompletion(
    token,
    conversationId,
    message,
    _idempotencyKey,
    onEvent,
    signal,
  ): Promise<ChatCompletionResult> {
    requireMockToken(token);
    const conversation = mockConversations.get(conversationId);
    if (conversation === undefined)
      throw new ApiError(404, "conversation_not_found");
    return runMockGeneration(conversation, message, onEvent, signal);
  },

  async cancelGeneration(token, generationId, signal): Promise<Generation> {
    await delay(signal);
    requireMockToken(token);
    // mock 스트림은 delay()만으로 끝나 취소 시점에 가로챌 실제 스트림이 없다 —
    // 합성 응답이므로 이미 끝났다고 보고 그대로 완료 상태를 돌려준다.
    for (const turns of mockMessageTurns.values()) {
      for (const turn of turns) {
        const found = turn.generations.find((g) => g.id === generationId);
        if (found !== undefined) return found;
      }
    }
    throw new ApiError(404, "generation_not_found");
  },

  async retryGeneration(
    token,
    generationId,
    _idempotencyKey,
    onEvent,
    signal,
  ): Promise<ChatCompletionResult> {
    requireMockToken(token);
    for (const [conversationId, turns] of mockMessageTurns) {
      for (const turn of turns) {
        const original = turn.generations.find((g) => g.id === generationId);
        if (original === undefined) continue;
        const conversation = mockConversations.get(conversationId);
        if (conversation === undefined) break;
        return runMockGeneration(
          conversation,
          turn.user_message.content,
          onEvent,
          signal,
          original.id,
        );
      }
    }
    throw new ApiError(404, "generation_not_found");
  },
};

const MOCK_REPLY_CHUNKS = ["합성 ", "응답", "입니다."];

/**
 * mock 모드 전용 합성 생성. 실제 InferenceClient 계약(첫 토큰 지연·취소·오류)을
 * 재현하지 않는다 — 화면 배선을 눈으로 확인하기 위한 최소 동작이다.
 */
async function runMockGeneration(
  conversation: Conversation,
  message: string,
  onEvent: (event: ChatEvent) => void,
  signal: AbortSignal | undefined,
  retryOfGenerationId: string | null = null,
): Promise<ChatCompletionResult> {
  const generationId = `mock-generation-${++mockGenerationSeq}`;
  const userMessageId = `mock-message-${mockGenerationSeq}`;
  const now = new Date().toISOString();

  onEvent({
    type: "meta",
    data: {
      generation_id: generationId,
      conversation_id: conversation.id,
      user_message_id: userMessageId,
      assistant_message_id: generationId,
      version_id: conversation.initial_version_id,
      mode: "mock",
    },
  });
  await delay(signal);
  onEvent({
    type: "citations",
    data: { generation_id: generationId, items: [] },
  });

  let content = "";
  for (const [index, chunk] of MOCK_REPLY_CHUNKS.entries()) {
    await delay(signal);
    content += chunk;
    onEvent({
      type: "delta",
      data: { generation_id: generationId, index, text: chunk },
    });
  }
  await delay(signal);
  onEvent({
    type: "done",
    data: {
      generation_id: generationId,
      status: "completed",
      finish_reason: "stop",
    },
  });

  const generation: Generation = {
    id: generationId,
    conversation_id: conversation.id,
    user_message_id: userMessageId,
    assistant_message_id: generationId,
    version_id: conversation.initial_version_id,
    retry_of_generation_id: retryOfGenerationId,
    mode: "mock",
    status: "completed",
    content,
    citations: [],
    failure_code: null,
    can_retry: true,
    created_at: now,
    finished_at: new Date().toISOString(),
  };
  const turns = mockMessageTurns.get(conversation.id) ?? [];
  if (retryOfGenerationId === null) {
    turns.push({
      user_message: { id: userMessageId, content: message, created_at: now },
      generations: [generation],
    });
  } else {
    const turn = turns.find((t) =>
      t.generations.some((g) => g.id === retryOfGenerationId),
    );
    turn?.generations.push(generation);
  }
  mockMessageTurns.set(conversation.id, turns);

  return { replayed: false, terminal: true };
}
