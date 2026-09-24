import { createContext, useContext } from "react";
import type { User } from "./types";

export type AuthState = "idle" | "loading" | "ready" | "error";

/**
 * 이 탭이 어느 인증 경로에 있는지.
 *
 * 빌드 타임 플래그로 가르지 않는다 — 같은 이미지가 공개 경로(oauth2-proxy가
 * GitHub 로그인 뒤 X-Auth-Request-User를 붙여 gateway가 Bearer 없이 200을 준다)와
 * 내부 port-forward 경로(그 헤더가 제거되어 Bearer가 필요하다)에서 모두 돌아야
 * 하기 때문이다. 판정은 앱 시작 시 토큰 없이 보내는 GET /v1/me 한 번이 한다.
 *
 * - probing: 그 호출의 답을 기다리는 중. 아직 어느 쪽인지 모른다.
 * - forward: 토큰 없이 200이 왔다. 이후 호출도 Authorization 없이 보낸다.
 * - bearer:  401이거나 판정이 불가능했다. 토큰을 입력받아 Bearer로 보낸다.
 */
export type AuthMode = "probing" | "forward" | "bearer";

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
  authMode: AuthMode;
  /**
   * 판정 자체를 못 한 이유. 401이 아니라 5xx·네트워크 오류로 끝났을 때만 채워진다.
   *
   * 이 경우 토큰 입력창을 띄우면 안 된다 — 서버가 잠시 이상한 것이지 사용자가
   * 토큰을 안 넣은 것이 아니다. 화면은 이 값을 재시도 안내로 보여준다.
   */
  probeError: string | null;
  /**
   * ForwardAuth 경로에서 세션이 만료됐는지. 만료되면 새로고침해 다시 로그인해야 한다.
   *
   * 내부 경로(bearer)의 401과 다르게 다룬다 — 공개 경로 사용자에게는 붙여넣을
   * Bearer 토큰이 없으므로 입력창을 띄우는 것이 잘못된 안내다.
   */
  sessionExpired: boolean;
  retryProbe: () => void;
  authenticate: (candidate: string) => Promise<void>;
  logout: () => void;
  /**
   * 인증된 호출을 대신 실행한다.
   *
   * Context에 토큰 필드를 직접 노출하지 않고 호출 시점에만 콜백에 넘긴다.
   * 화면 코드가 토큰을 보관할 이유를 없애려는 것이지, 콜백이 받은 문자열을
   * 붙잡는 것까지 타입으로 막지는 못한다.
   *
   * token이 null로 오는 경우가 있다 — ForwardAuth 경로다. 이때 호출자는
   * Authorization 헤더를 붙이지 않아야 한다(빈 `Bearer `를 보내지 않는다).
   */
  request: <T>(
    call: (token: string | null, signal: AbortSignal) => Promise<T>,
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
