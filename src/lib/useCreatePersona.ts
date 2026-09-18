import { useCallback, useRef, useState } from "react";
import { messageFor } from "./personaCopy";
import { useSession } from "./session";
import {
  ApiError,
  type LoadState,
  type Persona,
  type PersonaApi,
} from "./types";

/** 한 번의 논리적 생성 시도. 같은 시도의 재전송에는 같은 멱등성 키를 쓴다. */
interface CreateAttempt {
  name: string;
  key: string;
}

/**
 * 성공한 전송과 그 결과.
 *
 * 어느 전송의 결과인지 함께 들고 다닌다. 결과만 보관하면 이전 방문에서 성공한
 * 캐릭터가 남아 있어, 다음 전송의 응답을 기다리지 않고 그 캐릭터로 넘어가 버린다.
 */
export interface CreateResult {
  submissionId: number;
  persona: Persona;
}

export interface CreatePersonaState {
  state: LoadState;
  error: string | null;
  requestId: string | null;
  result: CreateResult | null;
  /** 같은 멱등성 키로 다시 보낼 수 있는 상태인지. */
  canRetrySame: boolean;
  /** 실제로 보냈으면 그 전송의 id, 이름이 비어 보내지 않았으면 null. */
  submit: (name: string) => number | null;
  retrySame: () => number | null;
}

/**
 * 캐릭터 생성 요청을 보낸다.
 *
 * 응답이 유실됐을 때 같은 키로 다시 보내면 서버가 이미 만든 캐릭터를 돌려준다
 * (Gateway의 Idempotency-Key 계약). 그래서 연결 오류에 새 키를 만들면 안 된다.
 * 새 키는 사용자가 이름을 바꿨을 때, 즉 다른 논리적 시도일 때만 만든다.
 *
 * 멱등성 키(시도)와 submissionId(전송)는 다른 개념이다. 같은 키로 두 번 보내면
 * 시도는 하나이고 전송은 둘이다. 화면 이동은 전송 단위로 판단해야 한다.
 *
 * `reloadList`는 생성 성공 뒤 목록을 다시 읽기 위한 것이다. 목록 갱신 실패가 생성
 * 실패로 보이지 않도록 두 결과를 섞지 않는다.
 */
export function useCreatePersona(
  api: PersonaApi,
  reloadList: () => void,
): CreatePersonaState {
  const { request } = useSession();
  const [state, setState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);
  const attemptRef = useRef<CreateAttempt | null>(null);
  const latestSubmission = useRef(0);

  const send = useCallback(
    (attempt: CreateAttempt): number => {
      attemptRef.current = attempt;
      const submissionId = ++latestSubmission.current;
      setState("loading");
      setError(null);
      setRequestId(null);
      void request((token, signal) =>
        api.createPersona(token, attempt.name, attempt.key, signal),
      ).then((outcome) => {
        // 이 전송보다 뒤에 시작한 전송이 있으면 이 결과는 낡았다. 연속 제출에서
        // 먼저 보낸 요청의 늦은 응답이 나중 요청의 결과를 덮지 않게 한다.
        if (latestSubmission.current !== submissionId) return;
        if (outcome.status === "stale") return;
        if (outcome.status === "failed") {
          setState("error");
          setError(messageFor(outcome.error));
          setRequestId(
            outcome.error instanceof ApiError
              ? (outcome.error.requestId ?? null)
              : null,
          );
          // 한도 초과는 우리가 보고 있는 목록이 낡았다는 뜻이므로 다시 읽는다.
          if (
            outcome.error instanceof ApiError &&
            outcome.error.code === "persona_limit_exceeded"
          ) {
            reloadList();
          }
          return;
        }
        setResult({ submissionId, persona: outcome.value });
        setState("ready");
        reloadList();
      });
      return submissionId;
    },
    [api, reloadList, request],
  );

  const submit = useCallback(
    (name: string): number | null => {
      const normalized = name.trim();
      if (!normalized) {
        // 서버에 보내지 않은 입력 오류라 진행 상태는 바꾸지 않는다. 재전송 버튼도 뜨지 않는다.
        setError("캐릭터 이름을 입력해주세요.");
        return null;
      }
      const previous = attemptRef.current;
      return send(
        previous?.name === normalized
          ? previous
          : { name: normalized, key: crypto.randomUUID() },
      );
    },
    [send],
  );

  const retrySame = useCallback((): number | null => {
    const attempt = attemptRef.current;
    return attempt === null ? null : send(attempt);
  }, [send]);

  return {
    state,
    error,
    requestId,
    result,
    // state가 "error"가 되는 경로는 send()뿐이고 send()는 항상 시도를 남긴다.
    // 이름이 비어 오류만 표시한 경우는 state를 바꾸지 않으므로 여기에 걸리지 않는다.
    canRetrySame: state === "error",
    submit,
    retrySame,
  };
}
