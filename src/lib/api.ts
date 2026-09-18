import {
  ApiError,
  type ApiErrorBody,
  type Draft,
  type Persona,
  type PersonaApi,
  type PersonaPage,
  type PersonaStatus,
  type User,
} from "./types";

/*
 * 서버 응답을 믿기 전에 계약과 같은 모양인지 확인한다.
 *
 * 예전에는 200이면 본문을 그대로 T로 캐스팅했다. 그래서 /v1 라우팅이 잘못돼
 * 정적 index.html이 200으로 돌아오면 payload가 null이 되고, 그 null이 User로
 * 넘어가 오류도 로그인도 아닌 막다른 화면이 됐다. 그런 응답은 성공이 아니다.
 *
 * 모르는 필드는 거부하지 않는다. Gateway 계약은 아직 늘어나는 중이고, 필드 하나
 * 추가됐다고 이미 배포된 웹이 멈추면 안 된다. 필수 필드의 존재와 타입만 본다.
 */

/** 필드를 읽기 위한 좁히기. 값의 내용은 각 검사 함수가 따로 확인한다. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** 필드가 아예 없으면 undefined라 여기서 걸러진다. 누락과 잘못된 타입을 같게 본다. */
function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/**
 * 계약이 고정한 상태 목록.
 *
 * Record로 적어 두면 PersonaStatus에 값이 늘 때 컴파일이 먼저 깨진다.
 * 새 상태를 statusLabel·nextStepFor의 안내 문구와 함께 추가하도록 강제하려는 것이다.
 */
const PERSONA_STATUSES: Record<PersonaStatus, true> = {
  needs_material: true,
  preparing: true,
  review_required: true,
  ready: true,
  deleting: true,
};

function isPersonaStatus(value: unknown): value is PersonaStatus {
  // in 연산자는 프로토타입 키("toString")까지 참이 되므로 hasOwn을 쓴다.
  return typeof value === "string" && Object.hasOwn(PERSONA_STATUSES, value);
}

function isUser(value: unknown): value is User {
  const record = asRecord(value);
  if (record === null) return false;
  return isString(record.id) && isString(record.display_name);
}

/**
 * 캐릭터 한 건을 검사한다.
 *
 * created_at은 문자열인지만 본다. 실제 Gateway는 Postgres datetime을 직렬화해
 * "+00:00" 형태로 보내므로 RFC3339 정규식을 넣으면 정상 응답이 막힌다.
 * 해석할 수 없는 값은 formatCreatedAt이 원본 그대로 표시한다.
 *
 * draft는 아직 타입을 정하지 않았으므로 있는지만 본다. 계약상 필수 필드이고,
 * 없다면 Gateway가 아닌 다른 응답을 보고 있다는 뜻이다.
 */
function isPersona(value: unknown): value is Persona {
  const record = asRecord(value);
  if (record === null) return false;
  return (
    isString(record.id) &&
    isString(record.name) &&
    isPersonaStatus(record.status) &&
    isNullableString(record.active_version_id) &&
    "draft" in record &&
    isNullableString(record.deletion_id) &&
    isString(record.created_at)
  );
}

function isPersonaPage(value: unknown): value is PersonaPage {
  const record = asRecord(value);
  if (record === null) return false;
  if (!Array.isArray(record.items)) return false;
  // 일부 항목만 버리면 실패를 성공으로 숨기는 셈이므로 한 건이라도 어긋나면 거부한다.
  return record.items.every(isPersona) && isNullableString(record.next_cursor);
}

/**
 * 오류 봉투에서 code·request_id를 꺼낼 수 있는지 본다.
 *
 * 계약은 message도 필수로 정하지만 여기서는 검사하지 않는다. UI는 code로만 분기하고
 * message를 쓰지 않는데, message가 없다는 이유로 멀쩡한 code와 요청 ID까지 버리면
 * 사용자에게 줄 안내와 문의 단서를 함께 잃는다.
 */
function isApiErrorBody(value: unknown): value is ApiErrorBody {
  const record = asRecord(value);
  if (record === null) return false;
  const error = asRecord(record.error);
  if (error === null) return false;
  return isString(error.code) && isString(error.request_id);
}

/** 본문을 JSON으로 읽은 결과. 파싱 실패를 예외가 아니라 값으로 다뤄 한 곳에서 분기한다. */
type JsonBody = { parsed: true; value: unknown } | { parsed: false };

async function readJsonBody(response: Response): Promise<JsonBody> {
  try {
    return { parsed: true, value: (await response.json()) as unknown };
  } catch {
    // index.html, 프록시 오류 페이지, 빈 본문이 여기로 온다. 본문에는 사용자 자료가
    // 섞일 수 있으므로 내용은 남기지 않고 읽지 못했다는 사실만 전한다.
    return { parsed: false };
  }
}

/**
 * 실패 응답을 ApiError로 바꾼다.
 *
 * JSON 요청과 바이너리 요청이 같은 오류 계약을 쓰게 하려고 따로 뺐다. 특히 401은
 * 그대로 올라가야 SessionProvider가 세션을 정리한다.
 */
async function failureFor(response: Response): Promise<ApiError> {
  const body = await readJsonBody(response);
  if (body.parsed && isApiErrorBody(body.value)) {
    return new ApiError(
      response.status,
      body.value.error.code,
      body.value.error.request_id,
    );
  }
  // 오류 응답의 본문까지 읽을 수 없는 경우다. 이미 드러난 실패이므로 코드는
  // 그대로 두고 상태 코드만 살린다.
  return new ApiError(response.status, "unknown_error");
}

/**
 * 초안 응답인지 확인한다.
 *
 * 형식 검증을 건너뛰면 /v1 라우팅이 어긋났을 때 정적 index.html이 200으로 돌아와도
 * 초안으로 받아들인다. 필수 필드의 존재와 타입만 본다.
 */
function isDraft(value: unknown): value is Draft {
  const record = asRecord(value);
  if (record === null) return false;
  const settings = asRecord(record.settings);
  return (
    isString(record.version_id) &&
    typeof record.revision === "number" &&
    isString(record.status) &&
    isNullableString(record.job_id) &&
    typeof record.requires_processing === "boolean" &&
    isString(record.persona_id) &&
    isNullableString(record.base_version_id) &&
    settings !== null &&
    isString(settings.name) &&
    isString(settings.profile) &&
    isString(settings.speech_examples) &&
    Array.isArray(record.sources) &&
    typeof record.can_activate === "boolean" &&
    isString(record.updated_at)
  );
}

/**
 * 성공 본문이 없는 응답을 보낸다.
 *
 * request()는 본문을 JSON으로 읽고 형식까지 확인하므로 204에 쓸 수 없다.
 * 실패 처리만 공유하고 성공은 아무것도 읽지 않는다.
 */
async function requestNoContent(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<void> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) throw await failureFor(response);
}

async function request<T>(
  path: string,
  token: string,
  isExpected: (value: unknown) => value is T,
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

  if (!response.ok) throw await failureFor(response);

  const body = await readJsonBody(response);
  if (!body.parsed || !isExpected(body.value)) {
    // 전송은 성공했으므로 상태 코드를 지어내지 않고 실제 값을 그대로 붙인다.
    // 여기에 401을 붙이면 본문만 깨진 정상 응답이 사용자를 로그아웃시킨다.
    throw new ApiError(response.status, "invalid_response");
  }
  return body.value;
}

function draftPath(personaId: string): string {
  return `/v1/personas/${encodeURIComponent(personaId)}/draft`;
}

export const httpPersonaApi: PersonaApi = {
  getMe: (token, signal) => request("/v1/me", token, isUser, { signal }),
  listPersonas: (token, signal) =>
    request("/v1/personas?limit=3", token, isPersonaPage, { signal }),
  createPersona: (token, name, idempotencyKey, signal) =>
    request("/v1/personas", token, isPersona, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ name }),
    }),

  createDraft: (token, personaId, settings, idempotencyKey, signal) =>
    request(draftPath(personaId), token, isDraft, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      // 계약은 settings 또는 base_version_id 중 하나만 받는다. 웹은 새로 시작하는 쪽만 쓴다.
      body: JSON.stringify({ settings }),
    }),

  getDraft: (token, personaId, signal) =>
    request(draftPath(personaId), token, isDraft, { signal }),

  patchDraft: (token, personaId, patch, idempotencyKey, signal) =>
    request(draftPath(personaId), token, isDraft, {
      method: "PATCH",
      signal,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(patch),
    }),

  discardDraft: (token, personaId, idempotencyKey, signal) =>
    requestNoContent(draftPath(personaId), token, {
      method: "DELETE",
      signal,
      headers: { "Idempotency-Key": idempotencyKey },
    }),
};
