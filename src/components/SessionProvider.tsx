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

  const request = useCallback(
    async <T,>(
      call: (token: string, signal: AbortSignal) => Promise<T>,
    ): Promise<RequestOutcome<T>> => {
      const token = tokenRef.current;
      // 로그아웃 직후 출발한 호출은 보낼 토큰이 없다. 익명 요청을 만들지 않는다.
      if (token === null) return { status: "stale" };

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
        // 인증 이후의 401은 토큰이 더는 유효하지 않다는 뜻이므로 세션을 정리한다.
        // 인증 단계의 401과 달리 다시 입력하라고 안내할 화면이 이미 지나갔다.
        if (error instanceof ApiError && error.status === 401) {
          logout();
          return { status: "stale" };
        }
        return { status: "failed", error };
      } finally {
        controllers.current.delete(controller);
      }
    },
    [logout],
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
      authenticate,
      logout,
      request,
    }),
    [
      user,
      authState,
      authError,
      hasAuthenticated,
      authenticate,
      logout,
      request,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
