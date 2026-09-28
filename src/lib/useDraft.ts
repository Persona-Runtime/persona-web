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
  /** 최초 조회의 진행 상태. 초안이 없으면(needsInitialDraft) 조회 자체는 ready다. */
  state: LoadState;
  draft: Draft | null;
  loadError: string | null;
  reload: () => void;
  /**
   * true면 적용본은 있는데 초안 슬롯이 비었다(409 draft_not_started) — 활성화 직후의
   * 정상 상태다. 화면은 "다시 조회"가 아니라 "새 초안 만들기"를 안내해야 한다.
   */
  notStarted: boolean;
  /** 적용본에서 파생한 새 초안을 시작한다. notStarted일 때만 의미가 있다. */
  startFromActive: (baseVersionId: string) => void;

  /**
   * true면 초안이 아직 한 번도 만들어지지 않았다(404 draft_not_found). 화면은 오류 대신
   * 이름·소개 초기 입력 폼을 보여주고, 사용자가 저장할 때 createInitial을 부른다.
   */
  needsInitialDraft: boolean;
  createState: LoadState;
  createError: string | null;
  /** 사용자가 입력한 이름·소개로 첫 초안을 만든다. needsInitialDraft일 때만 의미가 있다. */
  createInitial: (settings: { name: string; profile: string }) => void;

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
 * 초안이 없으면(404 draft_not_found) 자동으로 만들지 않고 needsInitialDraft만 알린다.
 * Gateway는 settings 경로에서 비공백 name·profile을 요구하므로(422 invalid_settings)
 * 빈 소개로 자동 생성하면 늘 실패한다. 가짜 소개를 채워 우회하면 사용자가 쓰지 않은
 * 내용이 초안에 남으므로, 사용자가 직접 입력한 값으로만 생성한다(createInitial).
 *
 * status가 processing이면 5초 간격으로 폴링한다. 언마운트나 processing 이탈 시
 * 정리한다 — 안 그러면 적용 뒤 화면을 떠나도 백그라운드에서 계속 조회하게 된다.
 */
export function useDraft(api: PersonaApi, personaId: string): DraftHookState {
  const { request } = useSession();
  const [state, setState] = useState<LoadState>("idle");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<LoadState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveConflict, setSaveConflict] = useState(false);
  const [applyState, setApplyState] = useState<LoadState>("idle");
  const [applyError, setApplyError] = useState<string | null>(null);
  // 적용본은 있는데 초안 슬롯이 비었다(409 draft_not_started). 오류가 아니라
  // "새 초안을 시작하면 이어서 고칠 수 있다"는 상태이므로 따로 들고 있는다 —
  // saveConflict(revision_conflict)와 같은 방식이다.
  const [notStarted, setNotStarted] = useState(false);
  const [needsInitialDraft, setNeedsInitialDraft] = useState(false);
  const [createState, setCreateState] = useState<LoadState>("idle");
  const [createError, setCreateError] = useState<string | null>(null);
  const latestLoad = useRef(0);

  const reload = useCallback(() => {
    const loadId = ++latestLoad.current;
    setState("loading");
    setLoadError(null);
    setNotStarted(false);
    setNeedsInitialDraft(false);
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
      // 초안이 아직 없다 — 오류가 아니라 첫 입력을 기다리는 상태다. 여기서 생성
      // API를 부르지 않는다(빈 소개는 Gateway가 422로 거절한다).
      if (
        outcome.error instanceof ApiError &&
        outcome.error.code === "draft_not_found"
      ) {
        setNeedsInitialDraft(true);
        setState("ready");
        return;
      }
      // 활성화 직후의 정상 상태다. 화면이 "새 초안 만들기"를 안내할 수 있도록
      // 실패 문구만 띄우지 않고 이 사실을 따로 알린다.
      if (
        outcome.error instanceof ApiError &&
        outcome.error.code === "draft_not_started"
      ) {
        setNotStarted(true);
        setLoadError(messageFor(outcome.error));
        setState("error");
        return;
      }
      setLoadError(messageFor(outcome.error));
      setState("error");
    });
  }, [api, personaId, request]);

  /**
   * 적용본에서 파생한 새 초안을 시작한다.
   *
   * base_version_id 경로를 쓰는 이유: 적용본의 설정과 자료를 서버가 복사해 주므로
   * 사용자가 "지금 적용된 내용"을 이어서 고칠 수 있다. 빈 초안으로 시작하면 이미
   * 적용한 자료를 다시 붙여넣어야 한다. 적용본의 version 행·색인 조각은 그대로
   * 남으므로 진행 중인 대화도 끊기지 않는다.
   */
  const startFromActive = useCallback(
    (baseVersionId: string) => {
      const loadId = ++latestLoad.current;
      setState("loading");
      setLoadError(null);
      setNotStarted(false);
      void request((token, signal) =>
        api.createDraft(
          token,
          personaId,
          { base_version_id: baseVersionId },
          crypto.randomUUID(),
          signal,
        ),
      ).then((outcome) => {
        if (latestLoad.current !== loadId) return;
        if (outcome.status === "stale") return;
        if (outcome.status === "failed") {
          setLoadError(messageFor(outcome.error));
          setState("error");
          return;
        }
        setDraft(outcome.value);
        setState("ready");
      });
    },
    [api, personaId, request],
  );

  /**
   * 사용자가 입력한 이름·소개로 첫 초안을 만든다.
   *
   * 실패해도 needsInitialDraft를 유지해 입력 폼과 내용을 그대로 둔다 — 사용자는 값을
   * 고쳐 다시 저장하면 된다. 멱등 키는 저장 시도마다 새로 만든다. 연속 클릭은 화면이
   * createState "loading" 동안 버튼을 막아 줄이지만, 그것이 서버 멱등성을 대신하지는
   * 않는다. 같은 캐릭터에 이미 초안이 생겼다면 서버가 409 draft_exists로 거절한다.
   */
  const createInitial = useCallback(
    (settings: { name: string; profile: string }) => {
      const loadId = latestLoad.current;
      setCreateState("loading");
      setCreateError(null);
      void request((token, signal) =>
        api.createDraft(
          token,
          personaId,
          { settings: { ...settings, speech_examples: "" } },
          crypto.randomUUID(),
          signal,
        ),
      ).then((outcome) => {
        // 그사이 다른 조회가 시작됐다면(캐릭터 이동·다시 조회) 이 결과는 낡았다.
        if (latestLoad.current !== loadId) return;
        if (outcome.status === "stale") return;
        if (outcome.status === "failed") {
          setCreateError(messageFor(outcome.error));
          setCreateState("error");
          return;
        }
        setDraft(outcome.value);
        setNeedsInitialDraft(false);
        setCreateState("ready");
      });
    },
    [api, personaId, request],
  );

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
    notStarted,
    startFromActive,
    needsInitialDraft,
    createState,
    createError,
    createInitial,
    saveState,
    saveError,
    saveConflict,
    save,
    applyState,
    applyError,
    apply,
  };
}
