import {
  ApiError,
  type Draft,
  type DraftSettings,
  type Persona,
  type PersonaApi,
  type PersonaPage,
  type User,
} from "./types";

// mock 응답은 타입 리터럴로 만들어 계약 모양이 컴파일 타임에 보장된다. 그래서
// 실제 경로의 응답 형식 검증(api.ts)이 여기서는 작동할 일이 없다.
// mock 통과를 실제 계약 준수의 증거로 쓰지 않는다.
const mockUser: User = { id: "synthetic-user", display_name: "합성 사용자" };
let mockPersonas: Persona[] = [];
// 초안은 캐릭터당 하나다. 실제 저장소도 persona_id를 PK로 두어 같은 규칙을 강제한다.
const mockDrafts = new Map<string, Draft>();

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

export const mockPersonaApi: PersonaApi = {
  async getMe(token, signal) {
    await delay(signal);
    if (!token.trim()) throw new ApiError(401, "unauthorized");
    return mockUser;
  },
  async listPersonas(token, signal): Promise<PersonaPage> {
    await delay(signal);
    if (!token.trim()) throw new ApiError(401, "unauthorized");
    return { items: mockPersonas, next_cursor: null };
  },
  async createPersona(token, name, _idempotencyKey, signal) {
    await delay(signal);
    if (!token.trim()) throw new ApiError(401, "unauthorized");
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

  async createDraft(token, personaId, settings, _idempotencyKey, signal) {
    await delay(signal);
    if (!token.trim()) throw new ApiError(401, "unauthorized");
    if (mockDrafts.has(personaId)) throw new ApiError(409, "draft_exists");
    const draft = mockDraft(personaId, settings);
    mockDrafts.set(personaId, draft);
    return draft;
  },

  async getDraft(token, personaId, signal) {
    await delay(signal);
    if (!token.trim()) throw new ApiError(401, "unauthorized");
    const draft = mockDrafts.get(personaId);
    if (draft === undefined) throw new ApiError(404, "draft_not_found");
    return draft;
  },

  async patchDraft(token, personaId, patch, _idempotencyKey, signal) {
    await delay(signal);
    if (!token.trim()) throw new ApiError(401, "unauthorized");
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
    if (!token.trim()) throw new ApiError(401, "unauthorized");
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
    if (!token.trim()) throw new ApiError(401, "unauthorized");
    if (!mockDrafts.delete(personaId))
      throw new ApiError(404, "draft_not_found");
  },
};
