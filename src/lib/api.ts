import {
  ApiError,
  type ApiErrorBody,
  type Persona,
  type PersonaApi,
  type PersonaPage,
  type User,
} from "./types";

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value))
    return false;
  const error = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "request_id" in error &&
    typeof error.request_id === "string"
  );
}

async function request<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...init.headers,
    },
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (isApiErrorBody(payload)) {
      throw new ApiError(
        response.status,
        payload.error.code,
        payload.error.request_id,
      );
    }
    throw new ApiError(response.status, "unknown_error");
  }
  return payload as T;
}

export const httpPersonaApi: PersonaApi = {
  getMe: (token, signal) => request<User>("/v1/me", token, { signal }),
  listPersonas: (token, signal) =>
    request<PersonaPage>("/v1/personas?limit=3", token, { signal }),
  createPersona: (token, name, idempotencyKey, signal) =>
    request<Persona>("/v1/personas", token, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ name }),
    }),
};
