import { createContext, useContext } from "react";
import type { User } from "./types";

export type AuthState = "idle" | "loading" | "ready" | "error";

/**
 * 한 번의 API 호출 결과.
 *
 * `stale`은 "실패"가 아니라 **화면에 반영하면 안 되는 응답**이다. 우리가 취소했거나,
 * 응답을 기다리는 사이 로그아웃·재인증으로 세션이 바뀌었거나, 인증 이후 401을 받아
 * 세션을 정리한 경우가 여기 해당한다. 이 셋을 서버 오류와 같이 처리하면 로그아웃한
 * 화면에 이전 세션의 자료나 오류 문구가 되살아난다.
 */
export type RequestOutcome<T> =
  | { status: "ok"; value: T }
  | { status: "failed"; error: unknown }
  | { status: "stale" };

export interface SessionValue {
  user: User | null;
  isAuthenticated: boolean;
  authState: AuthState;
  authError: string | null;
  /** 이 탭에서 한 번이라도 인증에 성공한 적이 있는지. 로그아웃 뒤 복귀 경로 판단에 쓴다. */
  hasAuthenticated: boolean;
  authenticate: (candidate: string) => Promise<void>;
  logout: () => void;
  /**
   * 인증된 호출을 대신 실행한다.
   *
   * Context에 토큰 필드를 직접 노출하지 않고 호출 시점에만 콜백에 넘긴다.
   * 화면 코드가 토큰을 보관할 이유를 없애려는 것이지, 콜백이 받은 문자열을
   * 붙잡는 것까지 타입으로 막지는 못한다.
   */
  request: <T>(
    call: (token: string, signal: AbortSignal) => Promise<T>,
  ) => Promise<RequestOutcome<T>>;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error(
      "useSession은 SessionProvider 안에서만 사용할 수 있습니다.",
    );
  }
  return value;
}
