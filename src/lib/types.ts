export type PersonaStatus =
  | "needs_material"
  | "preparing"
  | "review_required"
  | "ready"
  | "deleting";

/** 한 번의 조회·전송이 어디까지 진행됐는지. 빈 결과와 오류를 섞지 않으려고 구분한다. */
export type LoadState = "idle" | "loading" | "ready" | "error";

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

export interface PersonaApi {
  getMe(token: string, signal?: AbortSignal): Promise<User>;
  listPersonas(token: string, signal?: AbortSignal): Promise<PersonaPage>;
  createPersona(
    token: string,
    name: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<Persona>;
  createDraft(
    token: string,
    personaId: string,
    settings: DraftSettings,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<Draft>;
  getDraft(
    token: string,
    personaId: string,
    signal?: AbortSignal,
  ): Promise<Draft>;
  patchDraft(
    token: string,
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
    token: string,
    personaId: string,
    expectedRevision: number,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<DraftApplyAccepted>;
  discardDraft(
    token: string,
    personaId: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<void>;
}
