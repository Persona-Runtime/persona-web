import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isAbort, messageFor } from "../lib/personaCopy";
import {
  type AuthMode,
  type AuthState,
  type RequestOutcome,
  SessionContext,
  type SessionValue,
} from "../lib/session";
import { ApiError, type PersonaApi, type User } from "../lib/types";

/**
 * 토큰·사용자와 진행 중 요청의 수명주기를 한곳에서 관리한다.
 *
 * 여기 모으는 이유는 "응답을 언제 버려야 하는가"를 화면마다 다시 구현하지 않기
 * 위해서다. 로그아웃 뒤 늦게 도착한 응답이 화면을 되살리는 사고는 조건 하나만
 * 빠뜨려도 생기므로, 판정을 request() 한 곳에 둔다.
 */
export function SessionProvider({
  api,
  children,
}: {
  api: PersonaApi;
  children: ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [authError, setAuthError] = useState<string | null>(null);
  const [hasAuthenticated, setHasAuthenticated] = useState(false);
  // 시작은 항상 probing이다. 판정 전에 토큰 화면을 그리면 ForwardAuth 경로에서
  // 입력창이 한 프레임 깜빡이고, 딥링크는 RequireSession에 의해 "/"로 튕긴다.
  const [authMode, setAuthMode] = useState<AuthMode>("probing");
  const [probeError, setProbeError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  // 프로브를 다시 돌리기 위한 값. 재시도 버튼이 증가시킨다.
  const [probeAttempt, setProbeAttempt] = useState(0);

  // 토큰은 이 클로저 밖으로 나가지 않는다. 계약상 브라우저 저장소·URL·로그에 남기지
  // 않으므로 state로 노출하지 않고 ref에만 둔다. 새로고침하면 사라져 재입력이 필요하다.
  const tokenRef = useRef<string | null>(null);
  // 로그아웃·재인증마다 증가한다. await 전에 잡아둔 값과 다르면 지난 세션의 응답이다.
  const sessionEpoch = useRef(0);
  const controllers = useRef(new Set<AbortController>());

  const abortAll = useCallback(() => {
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
  }, []);

  // 진행 중 요청 정리는 라우트가 아니라 이 Provider에 둔다. 라우트에 두면 화면을
  // 옮길 때마다 남은 요청이 취소되고, StrictMode의 이중 마운트에도 걸린다.
  useEffect(() => abortAll, [abortAll]);

  const logout = useCallback(() => {
    abortAll();
    sessionEpoch.current += 1;
    tokenRef.current = null;
    setUser(null);
    setAuthState("idle");
    setAuthError(null);
  }, [abortAll]);

  /**
   * 앱 시작 시 **토큰 없이** GET /v1/me를 한 번 보내 어느 경로인지 판정한다.
   *
   * 200이면 앞단이 신원을 붙여 주는 ForwardAuth 경로이므로 토큰을 받지 않는다.
   * 401이면 gateway가 Bearer를 요구하는 내부 경로다. 그 외(5xx·네트워크 오류·
   * 계약과 다른 200·Traefik 없이 뜬 nginx의 404)는 판정 자체를 못 한 것이므로
   * 토큰 입력창을 띄우지 않고 재시도를 안내한다 — 서버가 잠시 이상한 것을
   * "토큰을 안 넣었다"로 오해시키지 않기 위해서다.
   */
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setAuthMode("probing");
    setProbeError(null);

    void (async () => {
      try {
        const probed = await api.getMe(null, controller.signal);
        if (cancelled) return;
        setUser(probed);
        setAuthMode("forward");
        setAuthState("ready");
      } catch (error) {
        if (cancelled || isAbort(error)) return;
        setAuthMode("bearer");
        if (error instanceof ApiError && error.status === 401) return;
        setProbeError(messageFor(error));
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [api, probeAttempt]);

  const retryProbe = useCallback(() => setProbeAttempt((n) => n + 1), []);

  const request = useCallback(
    async <T,>(
      call: (token: string | null, signal: AbortSignal) => Promise<T>,
    ): Promise<RequestOutcome<T>> => {
      const token = tokenRef.current;
      // ForwardAuth 경로에는 실을 토큰이 없다. 여기서 막으면 모든 호출이 조용히
      // stale이 되어 화면이 로딩 상태로 굳는다(오류조차 뜨지 않는다).
      // 그 외의 경로에서 토큰이 없다는 것은 로그아웃 직후 출발한 호출이라는 뜻이다.
      if (token === null && authMode !== "forward") return { status: "stale" };

      const epoch = sessionEpoch.current;
      const controller = new AbortController();
      controllers.current.add(controller);
      try {
        const value = await call(token, controller.signal);
        if (sessionEpoch.current !== epoch) return { status: "stale" };
        return { status: "ok", value };
      } catch (error) {
        if (isAbort(error) || sessionEpoch.current !== epoch) {
          return { status: "stale" };
        }
        if (error instanceof ApiError && error.status === 401) {
          // ForwardAuth 경로의 401은 앞단 세션(oauth2-proxy 쿠키)이 만료됐다는
          // 뜻이다. 붙여넣을 Bearer 토큰이 없는 사용자에게 입력창을 띄우는 것은
          // 잘못된 안내이므로, 로그아웃 대신 재로그인을 안내한다.
          if (authMode === "forward") {
            setSessionExpired(true);
            return { status: "stale" };
          }
          // 내부 경로의 401은 토큰이 더는 유효하지 않다는 뜻이므로 세션을 정리한다.
          // 인증 단계의 401과 달리 다시 입력하라고 안내할 화면이 이미 지나갔다.
          logout();
          return { status: "stale" };
        }
        return { status: "failed", error };
      } finally {
        controllers.current.delete(controller);
      }
    },
    [authMode, logout],
  );

  /**
   * 입력한 토큰을 서버로 확인하고 성공하면 세션을 시작한다.
   *
   * request()를 쓰지 않는 이유: 아직 세션에 넣지 않은 후보 토큰을 써야 하고,
   * 여기서의 401은 세션 정리가 아니라 "다시 입력해달라"는 인라인 안내이기 때문이다.
   */
  const authenticate = useCallback(
    async (candidate: string) => {
      const submitted = candidate.trim();
      if (!submitted) {
        setAuthError("토큰을 입력해주세요.");
        return;
      }

      const epoch = sessionEpoch.current;
      const controller = new AbortController();
      controllers.current.add(controller);
      setAuthState("loading");
      setAuthError(null);
      try {
        const authenticatedUser = await api.getMe(submitted, controller.signal);
        if (sessionEpoch.current !== epoch) return;
        tokenRef.current = submitted;
        setUser(authenticatedUser);
        setAuthState("ready");
        setHasAuthenticated(true);
      } catch (error) {
        if (isAbort(error) || sessionEpoch.current !== epoch) return;
        setAuthState("error");
        setAuthError(
          error instanceof ApiError && error.status === 401
            ? "토큰을 확인해주세요."
            : messageFor(error),
        );
      } finally {
        controllers.current.delete(controller);
      }
    },
    [api],
  );

  const value = useMemo<SessionValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      authState,
      authError,
      hasAuthenticated,
      authMode,
      probeError,
      sessionExpired,
      retryProbe,
      authenticate,
      logout,
      request,
    }),
    [
      user,
      authState,
      authError,
      hasAuthenticated,
      authMode,
      probeError,
      sessionExpired,
      retryProbe,
      authenticate,
      logout,
      request,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
