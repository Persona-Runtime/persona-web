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

export interface Draft {
  version_id: string;
  revision: number;
  status: string;
  job_id: string | null;
  requires_processing: boolean;
  persona_id: string;
  base_version_id: string | null;
  settings: DraftSettings;
  sources: DraftSource[];
  can_activate: boolean;
  updated_at: string;
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
  discardDraft(
    token: string,
    personaId: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<void>;
}
