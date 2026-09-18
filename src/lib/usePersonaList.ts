import { useCallback, useRef, useState } from "react";
import { messageFor } from "./personaCopy";
import { useSession } from "./session";
import type { LoadState, PersonaApi, PersonaPage } from "./types";

export interface PersonaListState {
  page: PersonaPage | null;
  state: LoadState;
  error: string | null;
  reload: () => void;
}

/**
 * 캐릭터 목록 조회 상태를 관리한다.
 *
 * 세션 단위 판정(취소·로그아웃·401)은 session.request()가 끝낸다. 여기서 추가로
 * 막는 것은 **같은 세션 안에서의 순서 뒤바뀜**이다. 생성 직후 갱신처럼 조회가
 * 겹치면 늦게 시작한 요청이 먼저 끝날 수 있어, 가장 최근 요청의 결과만 반영한다.
 */
export function usePersonaList(api: PersonaApi): PersonaListState {
  const { request } = useSession();
  const [page, setPage] = useState<PersonaPage | null>(null);
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const latestRequest = useRef(0);

  // request는 Provider에서 참조가 고정돼 있으므로 reload도 렌더마다 새로 만들어지지
  // 않는다. 이 훅을 쓰는 화면이 reload를 effect 의존성에 넣어도 재조회가 반복되지 않는다.
  const reload = useCallback(() => {
    const requestId = ++latestRequest.current;
    setState("loading");
    setError(null);
    void request((token, signal) => api.listPersonas(token, signal)).then(
      (outcome) => {
        if (latestRequest.current !== requestId) return;
        if (outcome.status === "stale") return;
        if (outcome.status === "failed") {
          setError(messageFor(outcome.error));
          setState("error");
          return;
        }
        setPage(outcome.value);
        setState("ready");
      },
    );
  }, [api, request]);

  return { page, state, error, reload };
}
