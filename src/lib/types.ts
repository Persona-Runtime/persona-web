export type PersonaStatus =
  | "needs_material"
  | "preparing"
  | "review_required"
  | "ready"
  | "deleting";

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

export interface PersonaApi {
  getMe(token: string, signal?: AbortSignal): Promise<User>;
  listPersonas(token: string, signal?: AbortSignal): Promise<PersonaPage>;
  createPersona(
    token: string,
    name: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<Persona>;
}
