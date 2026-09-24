export type PersonaStatus =
  | "needs_material"
  | "preparing"
  | "review_required"
  | "ready"
  | "deleting";

/** 한 번의 조회·전송이 어디까지 진행됐는지. 빈 결과와 오류를 섞지 않으려고 구분한다. */
export type LoadState = "idle" | "loading" | "ready" | "error";

/**
 * API 호출에 실을 토큰. `null`은 "토큰을 붙이지 않는다"는 뜻이다.
 *
 * ForwardAuth 경로에서는 앞단(oauth2-proxy)이 신원 헤더를 붙여 주므로 브라우저가
 * 보낼 토큰이 없다. 빈 문자열을 센티널로 쓰지 않는 이유는 `Bearer `처럼 값 없는
 * 헤더가 실제로 전송되는 것을 타입으로 막기 위해서다 — 구현은 null일 때
 * Authorization 헤더 자체를 생략한다.
 */
export type SessionToken = string | null;

export interface User {
  id: string;
  display_name: string;
}

export interface Persona {
  id: string;
  name: string;
  status: PersonaStatus;
  active_version_id: string | null;
  draft: unknown | null;
  deletion_id: string | null;
  created_at: string;
}

export interface PersonaPage {
  items: Persona[];
  next_cursor: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    request_id: string;
  };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(code);
  }
}

/** 계약의 Settings. 초안이 들고 있는 편집 가능한 설정이다. */
export interface DraftSettings {
  name: string;
  profile: string;
  speech_examples: string;
}

/**
 * 초안을 시작하는 두 경로. 계약(service-api-v1.md 5절)의 oneOf 그대로이며
 * 둘을 함께 보내면 서버가 422로 거절한다.
 *
 * - `{ settings }`      — 빈 초안으로 새로 시작한다.
 * - `{ base_version_id }` — 적용본에서 파생한다. 서버가 그 version의 설정과 자료를
 *   복사해 새 version을 만든다. 적용본이 있는 캐릭터를 이어서 고칠 때 쓴다.
 */
export type CreateDraftBody =
  | { settings: DraftSettings }
  | { base_version_id: string };

export interface DraftSource {
  id: string;
  kind: string;
  filename: string | null;
  content: string;
  byte_size: number;
  sha256: string;
}

/** 계약이 고정한 초안 상태. 새 상태가 늘면 UI 분기도 함께 늘려야 하므로 리터럴로 좁힌다. */
export type DraftStatus = "editing" | "processing" | "ready" | "failed";

/**
 * 소스 하나를 색인에서 뺐다는 신호. openapi.json에는 있지만 지금 화면은 아직 쓰지 않는다
 * (거부한 이유를 보여줄 자리가 없다 — 있다는 사실만 타입으로 남겨 둔다).
 */
export interface DraftWarning {
  code: string;
  source_id: string | null;
}

export interface Draft {
  version_id: string;
  revision: number;
  status: DraftStatus;
  job_id: string | null;
  requires_processing: boolean;
  persona_id: string;
  base_version_id: string | null;
  settings: DraftSettings;
  sources: DraftSource[];
  warnings: DraftWarning[];
  can_activate: boolean;
  updated_at: string;
  /**
   * status/error_code는 최신 적용 시도 결과이고, indexed_revision/indexed_at은
   * 실제로 검색에 쓸 수 있는 마지막 색인 성공 revision·시각이다 — 둘은 다를 수
   * 있다(rev3 색인 성공 후 rev4가 실패해도 indexed_revision은 3을 유지한다).
   */
  indexed_revision: number | null;
  indexed_at: string | null;
  /** status가 failed일 때만 값이 있다. 다음 색인이 성공하면 다시 null로 돌아간다. */
  error_code: string | null;
}

/** POST draft/apply의 202 응답. status는 accepted 시점에 늘 processing이다. */
export interface DraftApplyAccepted {
  version_id: string;
  status: "processing";
}

/** PATCH가 보내는 변경. expected_revision이 CAS 기준이다. */
export interface DraftPatch {
  expected_revision: number;
  settings?: Partial<DraftSettings>;
  upsert_sources?: {
    id?: string;
    kind: string;
    filename?: string | null;
    content: string;
  }[];
  remove_source_ids?: string[];
}

export type GenerationMode = "mock" | "llm";

/** 계약이 고정한 generation 상태. 활성(queued/running/cancel_requested/reconciling)과
 * terminal(completed/cancelled/failed)을 UI가 구분해서 다뤄야 한다. */
export type GenerationStatus =
  | "queued"
  | "running"
  | "cancel_requested"
  | "reconciling"
  | "completed"
  | "cancelled"
  | "failed";

export interface Citation {
  id: string;
  source_id: string;
  version_id: string;
  title: string;
  excerpt: string;
}

export interface Generation {
  id: string;
  conversation_id: string;
  user_message_id: string;
  assistant_message_id: string;
  version_id: string;
  retry_of_generation_id: string | null;
  mode: GenerationMode;
  status: GenerationStatus;
  content: string;
  citations: Citation[];
  failure_code: string | null;
  can_retry: boolean;
  created_at: string;
  finished_at: string | null;
}

export interface Conversation {
  id: string;
  persona_id: string;
  title: string;
  initial_version_id: string;
  /** initial_version_id와 현재 적용본이 다르다는 신호. 새 대화 권장 안내일 뿐 기존
   * 기록을 바꾸지 않는다. */
  material_changed: boolean;
  active_generation_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationPage {
  items: Conversation[];
  next_cursor: string | null;
}

export interface UserMessage {
  id: string;
  content: string;
  created_at: string;
}

export interface MessageTurn {
  user_message: UserMessage;
  generations: Generation[];
}

export interface MessagePage {
  items: MessageTurn[];
  next_cursor: string | null;
}

/** SSE meta 이벤트. 스트림당 1회, 항상 첫 이벤트다. */
export interface SseMeta {
  generation_id: string;
  conversation_id: string;
  user_message_id: string;
  assistant_message_id: string;
  version_id: string;
  mode: GenerationMode;
}

/** SSE citations 이벤트. 스트림당 1회. */
export interface SseCitations {
  generation_id: string;
  items: Citation[];
}

/** SSE delta 이벤트. index는 0부터 단조 증가한다. */
export interface SseDelta {
  generation_id: string;
  index: number;
  text: string;
}

/** SSE done 이벤트. 정상 종료에서만 온다(취소·실패는 error). */
export interface SseDone {
  generation_id: string;
  status: "completed";
  finish_reason: string;
}

/** SSE error 이벤트. status로 취소·실패·reconciling을 구분한다. */
export interface SseError {
  generation_id: string;
  code: string;
  message: string;
  status: "failed" | "cancelled" | "reconciling";
}

/**
 * 파싱된 SSE 이벤트 하나. Content-Type: text/event-stream 응답을 소비하는 쪽이 이
 * 유니온으로 분기한다 — meta 1회 → citations 1회 → delta 0회 이상 → done 또는
 * error로 끝난다(둘 다 안 오면 스트림이 비정상 종료된 것이다).
 */
export type ChatEvent =
  | { type: "meta"; data: SseMeta }
  | { type: "citations"; data: SseCitations }
  | { type: "delta"; data: SseDelta }
  | { type: "done"; data: SseDone }
  | { type: "error"; data: SseError };

/**
 * POST /v1/chat/completions·retry의 200 응답 두 형태.
 *
 * Content-Type이 text/event-stream이면 onEvent 콜백으로 이벤트를 받고
 * {replayed:false, terminal}로 끝난다(스트림 자체가 상태다). application/json이면
 * 동일 Idempotency-Key 재전송이라 새 스트림을 열지 않고 현재 저장 상태를 바로 준다 —
 * Web은 반드시 이 Content-Type을 먼저 검사해야 한다(JSON을 SSE로 파싱하면 안 된다).
 *
 * terminal은 done 또는 error 이벤트를 실제로 봤는지다 — false면 연결이 그 둘 없이
 * 끝난(EOF) 비정상 종료라, 성공으로 넘겨짚지 말고 메시지 조회로 재확인해야 한다
 * (계약: "살아 있는 생성을 이어받는 API는 없다").
 */
export type ChatCompletionResult =
  | { replayed: true; generation: Generation }
  | { replayed: false; terminal: boolean };

export interface PersonaApi {
  getMe(token: SessionToken, signal?: AbortSignal): Promise<User>;
  listPersonas(token: SessionToken, signal?: AbortSignal): Promise<PersonaPage>;
  createPersona(
    token: SessionToken,
    name: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<Persona>;
  createDraft(
    token: SessionToken,
    personaId: string,
    body: CreateDraftBody,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<Draft>;
  getDraft(
    token: SessionToken,
    personaId: string,
    signal?: AbortSignal,
  ): Promise<Draft>;
  patchDraft(
    token: SessionToken,
    personaId: string,
    patch: DraftPatch,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<Draft>;
  /**
   * expected_revision이 지금 초안과 다르면 409 revision_mismatch, 이미 진행 중이면
   * 409 indexing_in_progress, 색인할 자료가 없으면 422 no_content.
   * PATCH의 409 revision_conflict와 코드 문자열이 다르다 — 계약상 의도적 구분이다.
   */
  applyDraft(
    token: SessionToken,
    personaId: string,
    expectedRevision: number,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<DraftApplyAccepted>;
  discardDraft(
    token: SessionToken,
    personaId: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<void>;

  createConversation(
    token: SessionToken,
    personaId: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<Conversation>;
  listConversations(
    token: SessionToken,
    personaId: string,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<ConversationPage>;
  listMessages(
    token: SessionToken,
    conversationId: string,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<MessagePage>;
  /**
   * message 1건을 접수하고 SSE 또는 JSON replay로 응답한다. onEvent는 스트림일
   * 때만 호출된다(replay는 호출 없이 바로 반환).
   */
  startChatCompletion(
    token: SessionToken,
    conversationId: string,
    message: string,
    idempotencyKey: string,
    onEvent: (event: ChatEvent) => void,
    signal?: AbortSignal,
  ): Promise<ChatCompletionResult>;
  cancelGeneration(
    token: SessionToken,
    generationId: string,
    signal?: AbortSignal,
  ): Promise<Generation>;
  retryGeneration(
    token: SessionToken,
    generationId: string,
    idempotencyKey: string,
    onEvent: (event: ChatEvent) => void,
    signal?: AbortSignal,
  ): Promise<ChatCompletionResult>;
}
