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
    can_activate: false,
    updated_at: new Date().toISOString(),
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
    const next: Draft = {
      ...draft,
      revision: draft.revision + 1,
      settings: { ...draft.settings, ...(patch.settings ?? {}) },
      updated_at: new Date().toISOString(),
    };
    mockDrafts.set(personaId, next);
    return next;
  },

  async discardDraft(token, personaId, _idempotencyKey, signal) {
    await delay(signal);
    if (!token.trim()) throw new ApiError(401, "unauthorized");
    if (!mockDrafts.delete(personaId))
      throw new ApiError(404, "draft_not_found");
  },
};
