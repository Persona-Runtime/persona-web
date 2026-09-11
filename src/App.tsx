import { FormEvent, useEffect, useRef, useState } from "react";
import { createPersonaApi } from "./lib/client";
import {
  ApiError,
  type Persona,
  type PersonaApi,
  type PersonaPage,
  type User,
} from "./lib/types";

type View = "token" | "list" | "create";
type LoadState = "idle" | "loading" | "ready" | "error";

interface CreateAttempt {
  name: string;
  key: string;
}

function messageFor(error: unknown): string {
  if (!(error instanceof ApiError))
    return "네트워크 오류가 발생했습니다. 연결을 확인한 뒤 다시 시도해주세요.";
  switch (error.code) {
    case "invalid_persona_name":
      return "캐릭터 이름을 확인해주세요.";
    case "duplicate_persona_name":
      return "같은 이름의 캐릭터가 있습니다. 다른 이름을 입력해주세요.";
    case "persona_limit_exceeded":
      return "캐릭터는 최대 3개까지 만들 수 있습니다. 목록을 다시 확인해주세요.";
    case "idempotency_conflict":
      return "이전 생성 요청과 내용이 달라 요청을 처리할 수 없습니다. 이름을 확인해주세요.";
    case "dependency_unavailable":
      return "서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.";
    default:
      return "요청을 처리하지 못했습니다. 문제가 계속되면 요청 ID를 알려주세요.";
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function statusLabel(status: Persona["status"]): string {
  const labels: Record<Persona["status"], string> = {
    needs_material: "자료 입력 필요",
    preparing: "자료 준비 중",
    review_required: "검토 필요",
    ready: "준비됨",
    deleting: "삭제 중",
  };
  return labels[status];
}

export default function App({
  api = createPersonaApi(),
}: {
  api?: PersonaApi;
}) {
  const [view, setView] = useState<View>("token");
  const [tokenInput, setTokenInput] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authState, setAuthState] = useState<LoadState>("idle");
  const [authError, setAuthError] = useState<string | null>(null);
  const [page, setPage] = useState<PersonaPage | null>(null);
  const [listState, setListState] = useState<LoadState>("idle");
  const [listError, setListError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [createState, setCreateState] = useState<LoadState>("idle");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createRequestId, setCreateRequestId] = useState<string | null>(null);
  const [createdPersona, setCreatedPersona] = useState<Persona | null>(null);
  const [attempt, setAttempt] = useState<CreateAttempt | null>(null);
  const sessionEpoch = useRef(0);
  const listRequestEpoch = useRef(0);
  const controllers = useRef(new Set<AbortController>());

  const startRequest = () => {
    const controller = new AbortController();
    controllers.current.add(controller);
    return controller;
  };

  const finishRequest = (controller: AbortController) =>
    controllers.current.delete(controller);

  const clearSession = () => {
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
    sessionEpoch.current += 1;
    listRequestEpoch.current += 1;
    setTokenInput("");
    setToken(null);
    setUser(null);
    setAuthState("idle");
    setAuthError(null);
    setPage(null);
    setListState("idle");
    setListError(null);
    setName("");
    setAttempt(null);
    setCreateState("idle");
    setCreateError(null);
    setCreatedPersona(null);
    setView("token");
  };

  const loadPersonas = async (activeToken: string, epoch: number) => {
    const requestEpoch = ++listRequestEpoch.current;
    const controller = startRequest();
    setListState("loading");
    setListError(null);
    try {
      const nextPage = await api.listPersonas(activeToken, controller.signal);
      // 같은 로그인 안에서도 새 목록 조회가 먼저 끝날 수 있어 가장 최신 요청만 반영한다.
      if (
        sessionEpoch.current !== epoch ||
        listRequestEpoch.current !== requestEpoch
      ) {
        return;
      }
      setPage(nextPage);
      setListState("ready");
    } catch (error) {
      if (
        isAbort(error) ||
        sessionEpoch.current !== epoch ||
        listRequestEpoch.current !== requestEpoch
      ) {
        return;
      }
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        return;
      }
      setListError(messageFor(error));
      setListState("error");
    } finally {
      finishRequest(controller);
    }
  };

  useEffect(
    () => () => controllers.current.forEach((controller) => controller.abort()),
    [],
  );

  const submitToken = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submittedToken = tokenInput.trim();
    if (!submittedToken) {
      setAuthError("토큰을 입력해주세요.");
      return;
    }
    const epoch = sessionEpoch.current;
    const controller = startRequest();
    setAuthState("loading");
    setAuthError(null);
    try {
      const authenticatedUser = await api.getMe(
        submittedToken,
        controller.signal,
      );
      if (sessionEpoch.current !== epoch) return;
      // 토큰은 React 메모리에만 둔다. 새로고침하면 앱 전체가 초기화되어 다시 입력해야 한다.
      setToken(submittedToken);
      setTokenInput("");
      setUser(authenticatedUser);
      setView("list");
      setAuthState("ready");
      void loadPersonas(submittedToken, epoch);
    } catch (error) {
      if (isAbort(error) || sessionEpoch.current !== epoch) return;
      setAuthState("error");
      if (error instanceof ApiError && error.status === 401) {
        setAuthError("토큰을 확인해주세요.");
      } else {
        setAuthError(messageFor(error));
      }
    } finally {
      finishRequest(controller);
    }
  };

  const submitCreation = async (
    event?: FormEvent<HTMLFormElement>,
    forcedAttempt?: CreateAttempt,
  ) => {
    event?.preventDefault();
    if (!token) return;
    const normalizedName = forcedAttempt?.name ?? name.trim();
    if (!normalizedName) {
      setCreateError("캐릭터 이름을 입력해주세요.");
      return;
    }
    const currentAttempt =
      forcedAttempt ??
      (attempt?.name === normalizedName
        ? attempt
        : { name: normalizedName, key: crypto.randomUUID() });
    setAttempt(currentAttempt);
    setCreateState("loading");
    setCreateError(null);
    setCreateRequestId(null);
    const epoch = sessionEpoch.current;
    const controller = startRequest();
    try {
      const persona = await api.createPersona(
        token,
        currentAttempt.name,
        currentAttempt.key,
        controller.signal,
      );
      if (sessionEpoch.current !== epoch) return;
      setCreatedPersona(persona);
      setCreateState("ready");
      // 생성 성공과 목록 갱신은 별개다. 목록 요청 실패가 생성 실패를 뜻하지 않는다.
      void loadPersonas(token, epoch);
    } catch (error) {
      if (isAbort(error) || sessionEpoch.current !== epoch) return;
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        return;
      }
      setCreateState("error");
      setCreateError(messageFor(error));
      setCreateRequestId(
        error instanceof ApiError ? (error.requestId ?? null) : null,
      );
      if (
        error instanceof ApiError &&
        error.code === "persona_limit_exceeded"
      ) {
        void loadPersonas(token, epoch);
      }
    } finally {
      finishRequest(controller);
    }
  };

  if (view === "token") {
    return (
      <main className="shell">
        <section className="panel narrow" aria-labelledby="token-title">
          <p className="eyebrow">Persona Runtime</p>
          <h1 id="token-title">접속 토큰 입력</h1>
          <p>
            토큰은 이 탭의 메모리에만 보관되며, 새로고침하면 다시 입력해야
            합니다.
          </p>
          <form onSubmit={submitToken}>
            <label htmlFor="token">토큰</label>
            <input
              id="token"
              type="password"
              autoComplete="off"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
            />
            {authError && (
              <p className="error" role="alert">
                {authError}
              </p>
            )}
            <button type="submit" disabled={authState === "loading"}>
              {authState === "loading" ? "확인 중…" : "접속"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  const incomplete =
    page?.next_cursor !== null && page?.next_cursor !== undefined;
  const atLimit = page?.items.length === 3;
  const creationBlocked = incomplete || atLimit;
  const blockMessage = incomplete
    ? "목록이 완전하지 않아 생성 가능 여부를 확인할 수 없습니다."
    : "캐릭터는 최대 3개까지 만들 수 있습니다.";

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Persona Runtime</p>
          <strong>{user?.display_name}</strong>
        </div>
        <button className="secondary" onClick={clearSession}>
          로그아웃
        </button>
      </header>
      {view === "list" ? (
        <section className="panel" aria-labelledby="list-title">
          <div className="section-heading">
            <div>
              <h1 id="list-title">내 캐릭터</h1>
              <p>자료 입력과 채팅은 아직 제공하지 않습니다.</p>
            </div>
            <button
              onClick={() => setView("create")}
              disabled={creationBlocked}
            >
              캐릭터 생성
            </button>
          </div>
          {creationBlocked && <p className="notice">{blockMessage}</p>}
          {listState === "loading" && (
            <p role="status">목록을 불러오는 중입니다…</p>
          )}
          {listState === "error" && (
            <div className="error" role="alert">
              <p>{listError}</p>
              <button
                className="secondary"
                onClick={() =>
                  token && void loadPersonas(token, sessionEpoch.current)
                }
              >
                다시 조회
              </button>
            </div>
          )}
          {listState === "ready" && page?.items.length === 0 && (
            <p className="empty">아직 만든 캐릭터가 없습니다.</p>
          )}
          {listState === "ready" && page && page.items.length > 0 && (
            <ul className="persona-list">
              {page.items.map((persona) => (
                <li key={persona.id}>
                  <strong>{persona.name}</strong>
                  <span>{statusLabel(persona.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="panel narrow" aria-labelledby="create-title">
          <button className="text-button" onClick={() => setView("list")}>
            ← 목록으로
          </button>
          <h1 id="create-title">캐릭터 생성</h1>
          <p>생성 후에는 자료 입력 필요 상태로 표시됩니다.</p>
          <form onSubmit={submitCreation}>
            <label htmlFor="persona-name">이름</label>
            <input
              id="persona-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
            />
            {createError && (
              <div className="error" role="alert">
                <p>{createError}</p>
                {createRequestId && <p>요청 ID: {createRequestId}</p>}
              </div>
            )}
            {createState === "error" && attempt && (
              <button
                className="secondary"
                type="button"
                onClick={() => void submitCreation(undefined, attempt)}
              >
                같은 요청 다시 전송
              </button>
            )}
            {createdPersona && (
              <p className="success" role="status">
                “{createdPersona.name}” 캐릭터를 만들었습니다.
              </p>
            )}
            <button type="submit" disabled={createState === "loading"}>
              {createState === "loading" ? "생성 중…" : "생성"}
            </button>
          </form>
          {listState === "error" && createdPersona && (
            <p className="notice">
              캐릭터는 생성됐지만 목록을 갱신하지 못했습니다. 목록으로 돌아가
              다시 조회해주세요.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
