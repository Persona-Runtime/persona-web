import { useCallback, useState } from "react";
import { messageFor } from "./personaCopy";
import { useSession } from "./session";
import type { LoadState, PersonaApi } from "./types";

export interface DeletePersonaState {
  state: LoadState;
  error: string | null;
  /** 캐릭터를 삭제한다. 성공(204)하면 onDeleted를 한 번 부른다. */
  remove: (personaId: string, onDeleted: () => void) => void;
}

/**
 * 캐릭터 삭제 요청(DELETE /v1/personas/{id})을 보낸다.
 *
 * 성공으로 확정되기 전에는 목록에서 먼저 지우지 않는다(낙관적 삭제 금지). 서버가
 * 진행 중인 응답 생성·색인 때문에 409 persona_busy로 거절하면 캐릭터는 그대로 남아
 * 있으므로, 화면도 그대로 두고 오류만 보여줘야 한다.
 *
 * 멱등 키는 클릭마다 새로 만든다. 같은 캐릭터를 두 번 지우면 두 번째는 404이고,
 * 연속 클릭은 화면이 state "loading" 동안 버튼을 막아 줄인다.
 */
export function useDeletePersona(api: PersonaApi): DeletePersonaState {
  const { request } = useSession();
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  const remove = useCallback(
    (personaId: string, onDeleted: () => void) => {
      setState("loading");
      setError(null);
      void request((token, signal) =>
        api.deletePersona(token, personaId, crypto.randomUUID(), signal),
      ).then((outcome) => {
        if (outcome.status === "stale") return;
        if (outcome.status === "failed") {
          setError(messageFor(outcome.error));
          setState("error");
          return;
        }
        setState("ready");
        onDeleted();
      });
    },
    [api, request],
  );

  return { state, error, remove };
}
