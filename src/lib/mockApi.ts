import {
  ApiError,
  type Persona,
  type PersonaApi,
  type PersonaPage,
  type User,
} from "./types";

const mockUser: User = { id: "synthetic-user", display_name: "합성 사용자" };
let mockPersonas: Persona[] = [];

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
};
