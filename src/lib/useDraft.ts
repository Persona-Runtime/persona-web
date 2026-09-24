import { useCallback, useEffect, useRef, useState } from "react";
import { messageFor } from "./personaCopy";
import { useSession } from "./session";
import {
  ApiError,
  type Draft,
  type DraftSource,
  type LoadState,
  type PersonaApi,
} from "./types";

const POLL_INTERVAL_MS = 3000;

export interface DraftSourceInput {
  kind: string;
  content: string;
}

export interface DraftHookState {
  /** 최초 조회(또는 자동 생성)의 진행 상태. */
  state: LoadState;
  draft: Draft | null;
  loadError: string | null;
  reload: () => void;

  saveState: LoadState;
  saveError: string | null;
  /** true면 PATCH가 409 revision_conflict로 거부됐다는 뜻 — 일반 오류와 다르게 안내한다. */
  saveConflict: boolean;
  save: (
    settings: { name: string; profile: string },
    sources: DraftSourceInput[],
  ) => void;

  applyState: LoadState;
  applyError: string | null;
  apply: () => void;
}

/** kind별로 소스를 하나만 쓰는 이 화면의 규칙에 맞춰 기존 소스를 찾는다. */
function findSourceByKind(
  sources: DraftSource[],
  kind: string,
): DraftSource | undefined {
  return sources.find((source) => source.kind === kind);
}

/**
 * 캐릭터 하나의 초안(자료 편집·적용) 상태를 관리한다.
 *
 * 초안이 없으면(404 draft_not_found) 빈 설정으로 새로 만든다 — 이 화면에 들어온다는
 * 것 자체가 자료를 입력하겠다는 뜻이라 빈 초안을 먼저 보여주고 기다릴 이유가 없다.
 *
 * status가 processing이면 5초 간격으로 폴링한다. 언마운트나 processing 이탈 시
 * 정리한다 — 안 그러면 적용 뒤 화면을 떠나도 백그라운드에서 계속 조회하게 된다.
 */
export function useDraft(
  api: PersonaApi,
  personaId: string,
  personaName: string,
): DraftHookState {
  const { request } = useSession();
  const [state, setState] = useState<LoadState>("idle");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<LoadState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveConflict, setSaveConflict] = useState(false);
  const [applyState, setApplyState] = useState<LoadState>("idle");
  const [applyError, setApplyError] = useState<string | null>(null);
  const latestLoad = useRef(0);

  const reload = useCallback(() => {
    const loadId = ++latestLoad.current;
    setState("loading");
    setLoadError(null);
    void request((token, signal) =>
      api.getDraft(token, personaId, signal),
    ).then((outcome) => {
      if (latestLoad.current !== loadId) return;
      if (outcome.status === "stale") return;
      if (outcome.status === "ok") {
        setDraft(outcome.value);
        setState("ready");
        return;
      }
      // 초안이 아직 없으면 빈 값으로 새로 만든다. 다른 실패는 그대로 오류로 보여준다.
      if (
        outcome.error instanceof ApiError &&
        outcome.error.code === "draft_not_found"
      ) {
        void request((token, signal) =>
          api.createDraft(
            token,
            personaId,
            {
              settings: { name: personaName, profile: "", speech_examples: "" },
            },
            crypto.randomUUID(),
            signal,
          ),
        ).then((createOutcome) => {
          if (latestLoad.current !== loadId) return;
          if (createOutcome.status === "stale") return;
          if (createOutcome.status === "failed") {
            setLoadError(messageFor(createOutcome.error));
            setState("error");
            return;
          }
          setDraft(createOutcome.value);
          setState("ready");
        });
        return;
      }
      setLoadError(messageFor(outcome.error));
      setState("error");
    });
  }, [api, personaId, personaName, request]);

  useEffect(() => {
    reload();
    // personaId가 바뀌면(다른 캐릭터로 이동) 처음부터 다시 조회해야 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  // processing 동안만 폴링한다. 화면 이탈·상태 변화 시 반드시 정리한다.
  useEffect(() => {
    if (draft?.status !== "processing") return;
    const timer = window.setInterval(reload, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [draft?.status, reload]);

  const save = useCallback(
    (
      settings: { name: string; profile: string },
      sources: DraftSourceInput[],
    ) => {
      if (draft === null) return;
      setSaveState("loading");
      setSaveError(null);
      setSaveConflict(false);

      const upsert_sources: {
        id?: string;
        kind: string;
        content: string;
      }[] = [];
      const remove_source_ids: string[] = [];
      for (const { kind, content } of sources) {
        const existing = findSourceByKind(draft.sources, kind);
        if (content.trim() === "") {
          if (existing !== undefined) remove_source_ids.push(existing.id);
          continue;
        }
        upsert_sources.push({ id: existing?.id, kind, content });
      }

      void request((token, signal) =>
        api.patchDraft(
          token,
          personaId,
          {
            expected_revision: draft.revision,
            settings,
            upsert_sources,
            remove_source_ids,
          },
          crypto.randomUUID(),
          signal,
        ),
      ).then((outcome) => {
        if (outcome.status === "stale") return;
        if (outcome.status === "failed") {
          if (
            outcome.error instanceof ApiError &&
            outcome.error.code === "revision_conflict"
          ) {
            // 배너로 안내하고 입력 내용은 지우지 않는다 — 화면(useDraft를 쓰는 쪽)이
            // 여기서 draft를 갱신하지 않으므로 폼 상태는 그대로 남는다.
            setSaveConflict(true);
            setSaveState("error");
            return;
          }
          setSaveError(messageFor(outcome.error));
          setSaveState("error");
          return;
        }
        setDraft(outcome.value);
        setSaveState("ready");
      });
    },
    [api, draft, personaId, request],
  );

  const apply = useCallback(() => {
    if (draft === null) return;
    setApplyState("loading");
    setApplyError(null);
    void request((token, signal) =>
      api.applyDraft(
        token,
        personaId,
        draft.revision,
        crypto.randomUUID(),
        signal,
      ),
    ).then((outcome) => {
      if (outcome.status === "stale") return;
      if (outcome.status === "failed") {
        setApplyError(messageFor(outcome.error));
        setApplyState("error");
        return;
      }
      setApplyState("ready");
      // 202는 version_id·status만 준다. 실제 job_id·revision 등 나머지 필드를 얻으려면
      // 다시 조회한다 — 이 reload가 processing 폴링도 함께 켠다.
      reload();
    });
  }, [api, draft, personaId, reload, request]);

  return {
    state,
    draft,
    loadError,
    reload,
    saveState,
    saveError,
    saveConflict,
    save,
    applyState,
    applyError,
    apply,
  };
}
