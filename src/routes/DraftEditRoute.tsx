import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { CharCounter } from "../components/CharCounter";
import { DraftStatusBadge } from "../components/DraftStatusBadge";
import { Icon } from "../components/Icon";
import { RetryNotice } from "../components/RetryNotice";
import { WorkspaceHeading } from "../components/WorkspaceHeading";
import {
  BODY_MAX,
  DRAFT_TOTAL_MAX as TOTAL_MAX,
  OPTIONAL_SOURCE_MAX as OPTIONAL_MAX,
  PROFILE_MAX,
  SPEECH_MAX,
  codePointLength,
} from "../lib/limits";
import {
  draftFailedMessage,
  formatCreatedAt,
  statusLabel,
} from "../lib/personaCopy";
import { useStudio } from "../lib/studioContext";
import type { Draft, Persona } from "../lib/types";
import { useDraft } from "../lib/useDraft";

// 화자: 대사, 또는 화자 (상황): 대사.
const SPEECH_LINE_PATTERN = /^[^:\n]+(\s\([^)]*\))?:\s/;

/** 화면이 편집하는 자료 kind. 저장 요청과 미저장 변경 비교가 같은 목록을 쓴다. */
type EditableKind =
  | "events"
  | "speech_examples"
  | "relationships"
  | "abilities";

/**
 * 저장 요청이 서버에 보낼 자료 내용으로 정규화한다.
 *
 * 공백뿐인 입력은 저장 시 "그 소스 삭제"로 처리되므로(useDraft.save), 비교할 때도
 * 빈 값으로 본다. 그래야 공백만 친 입력을 미저장 변경으로 오판하지 않는다.
 */
function normalizedSource(content: string): string {
  return content.trim() === "" ? "" : content;
}

/**
 * 폼 값이 서버에 마지막으로 저장된 초안과 다른지 본다.
 *
 * 색인(apply)은 서버에 저장된 revision을 처리한다. 화면에만 있는 변경을 두고 색인하면
 * 사용자가 본 내용이 아니라 이전 저장본이 색인되므로, 이 값으로 색인·활성화를 막는다.
 */
function hasUnsavedChanges(
  draft: Draft,
  form: {
    name: string;
    profile: string;
    sources: Record<EditableKind, string>;
  },
): boolean {
  if (form.name.trim() !== draft.settings.name) return true;
  if (form.profile !== draft.settings.profile) return true;
  return (Object.keys(form.sources) as EditableKind[]).some((kind) => {
    const saved = draft.sources.find((s) => s.kind === kind)?.content ?? "";
    return normalizedSource(form.sources[kind]) !== saved;
  });
}

function countBadSpeechLines(text: string): number {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  return lines.filter((line) => !SPEECH_LINE_PATTERN.test(line)).length;
}

/**
 * 자료 붙여넣기·초안 편집·적용 화면.
 *
 * 본문(events)과 대사(speech_examples)만 기본으로 보여준다. 검색은 kind를 구분하지
 * 않으므로(BODY_KINDS, persona-gateway retrieval/search.py) 이벤트·관계·능력을 굳이
 * 나눠 넣을 필요가 없다 — 나누는 건 선택 항목으로만 둔다.
 */
export function DraftEditRoute() {
  const { personaId } = useParams();
  const { api, findPersona, list } = useStudio();
  const persona = personaId === undefined ? null : findPersona(personaId);

  return persona === null || personaId === undefined ? (
    <>
      <WorkspaceHeading id="workspace-title">자료 편집</WorkspaceHeading>
      <p className="notice">이 캐릭터를 찾을 수 없습니다.</p>
      <Link className="text-button" to="/personas">
        목록으로 돌아가기
      </Link>
    </>
  ) : (
    // key로 캐릭터마다 폼을 새로 만든다. 같은 경로에서 personaId만 바뀌면 React가
    // 컴포넌트를 재사용해 입력값·initialized가 이전 캐릭터의 것으로 남기 때문이다.
    <DraftEditForm
      key={personaId}
      api={api}
      personaId={personaId}
      personaName={persona.name}
      activeVersionId={persona.active_version_id}
      personaStatus={persona.status}
      onActivated={list.reload}
    />
  );
}

function DraftEditForm({
  api,
  personaId,
  personaName,
  activeVersionId,
  personaStatus,
  onActivated,
}: {
  api: ReturnType<typeof useStudio>["api"];
  personaId: string;
  personaName: string;
  activeVersionId: string | null;
  personaStatus: Persona["status"];
  /** 활성화 성공 뒤 캐릭터 목록(=상세 상태의 출처)을 다시 조회한다. */
  onActivated: () => void;
}) {
  const draftState = useDraft(api, personaId);
  const { state, draft, loadError, reload, notStarted, startFromActive } =
    draftState;

  const [name, setName] = useState(personaName);
  const [profile, setProfile] = useState("");
  const [body, setBody] = useState("");
  const [speech, setSpeech] = useState("");
  const [relationships, setRelationships] = useState("");
  const [abilities, setAbilities] = useState("");
  const [showOptional, setShowOptional] = useState(false);
  // 초안을 처음 읽었을 때만 폼을 채운다. 그 뒤 폴링·재조회로 draft가 갱신돼도
  // 입력 중인 내용을 덮어쓰지 않는다(특히 revision_conflict 배너의 "입력 보존" 요구).
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || draft === null) return;
    initialized.current = true;
    setName(draft.settings.name);
    setProfile(draft.settings.profile);
    setBody(draft.sources.find((s) => s.kind === "events")?.content ?? "");
    setSpeech(
      draft.sources.find((s) => s.kind === "speech_examples")?.content ?? "",
    );
    setRelationships(
      draft.sources.find((s) => s.kind === "relationships")?.content ?? "",
    );
    setAbilities(
      draft.sources.find((s) => s.kind === "abilities")?.content ?? "",
    );
    if (
      draft.sources.some(
        (s) => s.kind === "relationships" || s.kind === "abilities",
      )
    ) {
      setShowOptional(true);
    }
  }, [draft]);

  // 채팅에 적용 성공. 이 초안은 이제 적용본이라 더 편집·색인하지 않는다(서버가 초안
  // 슬롯을 비웠다). 채팅 이동 버튼은 목록 재조회로 캐릭터가 준비됨이 된 뒤에만 보인다 —
  // 대화 화면은 목록의 적용본(active_version_id)으로 대화 가능 여부를 판정하기 때문에,
  // 갱신 전에 보내면 "자료를 먼저 적용하세요"를 보게 된다.
  if (draftState.activateState === "ready") {
    const chatReady = personaStatus === "ready" && activeVersionId !== null;
    return (
      <>
        <WorkspaceHeading id="workspace-title">
          {personaName} — 자료 편집
        </WorkspaceHeading>
        <p className="guide" role="status">
          채팅에 적용했습니다. 캐릭터 상태: {statusLabel(personaStatus)}
        </p>
        {chatReady ? (
          <Link className="text-button" to={`/personas/${personaId}/chat`}>
            채팅으로 이동
          </Link>
        ) : (
          <p className="guide">캐릭터 상태를 갱신하는 중입니다…</p>
        )}
      </>
    );
  }

  // 적용본은 있는데 초안 슬롯이 비어 있다(활성화 직후). 실패가 아니라 다음 행동이
  // 정해져 있는 상태이므로, "다시 조회"가 아니라 새 초안을 시작하게 안내한다.
  if (notStarted && activeVersionId !== null) {
    return (
      <>
        <WorkspaceHeading id="workspace-title">
          {personaName} — 자료 편집
        </WorkspaceHeading>
        <p className="guide">
          적용된 자료는 바로 고칠 수 없습니다. 새 초안을 시작하면 지금 적용된
          내용을 그대로 이어받아 고칠 수 있고, 적용본은 새 초안을 활성화할
          때까지 그대로 쓰입니다.
        </p>
        <button type="button" onClick={() => startFromActive(activeVersionId)}>
          새 초안 만들기
        </button>
      </>
    );
  }

  if (state === "error") {
    return (
      <>
        <WorkspaceHeading id="workspace-title">
          {personaName} — 자료 편집
        </WorkspaceHeading>
        <RetryNotice
          message={loadError ?? "초안을 불러오지 못했습니다."}
          onRetry={reload}
        />
      </>
    );
  }

  // 초안이 아직 없다. 빈 소개로 자동 생성하지 않고 사용자가 이름·소개를 먼저
  // 입력하게 한다 — Gateway가 둘 다 필수로 검증하기 때문이다.
  if (draftState.needsInitialDraft) {
    return (
      <>
        <WorkspaceHeading id="workspace-title">
          {personaName} — 자료 편집
        </WorkspaceHeading>
        <InitialDraftForm
          defaultName={personaName}
          createState={draftState.createState}
          createError={draftState.createError}
          onCreate={draftState.createInitial}
        />
      </>
    );
  }

  if (draft === null) {
    return (
      <>
        <WorkspaceHeading id="workspace-title">
          {personaName} — 자료 편집
        </WorkspaceHeading>
        <p className="guide" role="status">
          초안을 불러오는 중입니다…
        </p>
      </>
    );
  }

  const profileLen = codePointLength(profile);
  const bodyLen = codePointLength(body);
  const speechLen = codePointLength(speech);
  const relationshipsLen = codePointLength(relationships);
  const abilitiesLen = codePointLength(abilities);
  const totalLen =
    profileLen + bodyLen + speechLen + relationshipsLen + abilitiesLen;
  const badSpeechLines = countBadSpeechLines(speech);

  const nameValid = name.trim() !== "";
  // Gateway는 저장된 초안에도 비공백 소개를 요구한다(422 invalid_settings). 보내서
  // 실패시키지 않고 여기서 먼저 막는다.
  const profileMissing = profile.trim() === "";
  const profileBlocked = profileLen > PROFILE_MAX;
  const unsaved = hasUnsavedChanges(draft, {
    name,
    profile,
    sources: {
      events: body,
      speech_examples: speech,
      relationships,
      abilities,
    },
  });
  const saving = draftState.saveState === "loading";
  const canSave =
    unsaved && nameValid && !profileMissing && !profileBlocked && !saving;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    draftState.save({ name: name.trim(), profile }, [
      { kind: "events", content: body },
      { kind: "speech_examples", content: speech },
      { kind: "relationships", content: relationships },
      { kind: "abilities", content: abilities },
    ]);
  };

  // 이 버튼은 색인(POST draft/apply)이다 — 활성화(POST draft/activate, 색인 결과를
  // 적용본으로 만들기)가 아니다. can_activate는 활성화 판정값이라 여기 쓰면 안 된다
  // (지금 늘 false라 그러면 색인 자체가 영원히 막힌다). 자료 1개 이상 조건은
  // 422 no_content를 미리 걸러 불필요한 요청을 줄이려는 것이다.
  const hasSource = draft.sources.length > 0;
  // 저장 중이거나 미저장 변경이 있으면 색인·활성화를 막는다 — 저장 → 색인 → 채팅에
  // 적용 순서가 어긋나면 화면 내용과 다른 revision이 색인·적용된다.
  const canApply =
    draft.status !== "processing" &&
    hasSource &&
    !unsaved &&
    !saving &&
    draftState.applyState !== "loading";
  const canActivate =
    draft.can_activate &&
    !unsaved &&
    !saving &&
    draftState.activateState !== "loading";

  const indexing =
    draftState.applyState === "loading" || draft.status === "processing";

  return (
    <div className="draft-edit">
      <WorkspaceHeading id="workspace-title">
        {personaName} — 자료 편집
      </WorkspaceHeading>

      <div className="draft-edit__status">
        <DraftStatusBadge status={draft.status} />
        {/* status(최신 적용 시도)와 indexed_revision(마지막 색인 성공)은 계약상
            다를 수 있다 — 실패 뒤에도 이전 색인이 살아 있음을 보여주려면 같은
            배지로 합치지 않고 따로 표시해야 한다. */}
        <span className="draft-edit__indexed">
          {draft.indexed_revision === null
            ? "아직 색인된 자료 없음"
            : `현재 색인: rev ${draft.indexed_revision}${
                draft.indexed_at === null
                  ? ""
                  : ` (${formatCreatedAt(draft.indexed_at)})`
              }`}
        </span>
        <span className="draft-edit__order">
          순서: 저장 → 색인 → 채팅에 적용
        </span>
      </div>

      {draft.can_activate && (
        <p className="success">
          이 색인 결과는 적용본으로 활성화할 수 있습니다.
        </p>
      )}

      {draft.status === "failed" && (
        <p className="error">{draftFailedMessage(draft.error_code)}</p>
      )}

      {draftState.saveConflict && (
        <RetryNotice
          message="다른 곳에서 수정됨 — 다시 불러오기"
          onRetry={reload}
          actionLabel="다시 불러오기"
        />
      )}

      {/* 저장 버튼은 아래 고정 액션 바에 있고 form 속성으로 이 폼을 제출한다.
          색인·채팅에 적용과 한 줄에 두려는 배치 변경이며, 제출 경로(submit)는 같다. */}
      {/* 카드 section에 aria-labelledby를 달지 않는다. "본문·대사" 같은 카드 제목이
          그 안 입력의 라벨("본문 — …")과 겹쳐, 라벨로 입력을 찾는 보조기술·테스트가
          카드와 입력을 구분하지 못한다. 카드 구분은 h2 제목으로 충분하다. */}
      <form id="draft-form" className="draft-form" onSubmit={submit}>
        <section className="card">
          <h2 className="card__title">이름·기본 소개</h2>
          <div className="field">
            <label htmlFor="draft-name">이름</label>
            <input
              id="draft-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="draft-profile">기본 소개</label>
            <textarea
              id="draft-profile"
              value={profile}
              onChange={(event) => setProfile(event.target.value)}
            />
            <div className="field__foot">
              <p
                className={profileMissing ? "counter counter--over" : "counter"}
              >
                기본 소개는 필수입니다. 비워두면 저장할 수 없습니다.
              </p>
              <CharCounter length={profileLen} max={PROFILE_MAX} blocking />
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="card__title">본문·대사</h2>
          <div className="field">
            <label htmlFor="draft-body">
              본문 — corpus-tools --format paste 출력을 그대로
            </label>
            <textarea
              id="draft-body"
              className="textarea--tall"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
            <div className="field__foot">
              <CharCounter length={bodyLen} max={BODY_MAX} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="draft-speech">대사 — 한 줄에 화자: 대사</label>
            <textarea
              id="draft-speech"
              className="textarea--tall"
              value={speech}
              onChange={(event) => setSpeech(event.target.value)}
            />
            <div className="field__foot">
              {badSpeechLines > 0 && (
                <p className="counter">
                  형식과 다른 줄 {badSpeechLines}개 — "화자: 대사" 형식을
                  확인해주세요 (저장은 막지 않습니다)
                </p>
              )}
              <CharCounter length={speechLen} max={SPEECH_MAX} />
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="card__title">관계·능력</h2>
          <button
            type="button"
            className="disclosure"
            onClick={() => setShowOptional((value) => !value)}
            aria-expanded={showOptional}
          >
            <Icon name="chevron" size={16} />
            선택 항목 {showOptional ? "접기" : "펼치기"}(관계·능력)
          </button>
          {showOptional && (
            <div className="optional-sources">
              <div className="field">
                <label htmlFor="draft-relationships">관계</label>
                <textarea
                  id="draft-relationships"
                  value={relationships}
                  onChange={(event) => setRelationships(event.target.value)}
                />
                <div className="field__foot">
                  <CharCounter length={relationshipsLen} max={OPTIONAL_MAX} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="draft-abilities">능력</label>
                <textarea
                  id="draft-abilities"
                  value={abilities}
                  onChange={(event) => setAbilities(event.target.value)}
                />
                <div className="field__foot">
                  <CharCounter length={abilitiesLen} max={OPTIONAL_MAX} />
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="draft-form__total">
          <span>전체</span>
          <CharCounter length={totalLen} max={TOTAL_MAX} />
        </div>

        {draftState.saveError !== null && (
          <div className="error" role="alert">
            <p>{draftState.saveError}</p>
          </div>
        )}
      </form>

      <div className="action-bar">
        {draft.status === "processing" && (
          <p className="action-bar__strip" role="status">
            색인 중 · 자료를 처리하고 있습니다. 완료되면 자동으로 갱신됩니다.
          </p>
        )}
        {unsaved && (
          <p className="notice" role="status">
            저장하지 않은 변경이 있습니다. 먼저 저장하세요 — 색인과 채팅에
            적용은 저장된 내용으로만 진행됩니다.
          </p>
        )}
        {draftState.applyError !== null && (
          <div className="error" role="alert">
            <p>{draftState.applyError}</p>
          </div>
        )}
        {/* 활성화(POST draft/activate)는 색인 결과를 캐릭터의 적용본으로 세운다. 누를 수
            있는지는 서버 판정값 can_activate만 따른다 — 화면이 조건을 다시 계산하면
            서버의 활성화 규칙과 어긋날 수 있다. */}
        {draftState.activateError !== null && (
          <div className="error" role="alert">
            <p>{draftState.activateError}</p>
          </div>
        )}
        <div className="action-bar__buttons">
          <button
            type="submit"
            form="draft-form"
            className="button--secondary"
            disabled={!canSave}
          >
            {draftState.saveState === "loading" ? "저장 중…" : "저장"}
          </button>
          <button
            type="button"
            className="button--secondary"
            onClick={draftState.apply}
            disabled={!canApply}
          >
            {indexing ? "색인 중…" : "색인"}
          </button>
          <button
            type="button"
            onClick={() => draftState.activate(onActivated)}
            disabled={!canActivate}
          >
            {draftState.activateState === "loading"
              ? "적용 중…"
              : "채팅에 적용"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 첫 초안을 만들기 전에 이름·기본 소개를 받는 폼.
 *
 * 둘 다 비공백이고 소개가 PROFILE_MAX 이하일 때만 저장을 허용한다. 이 검사는 안내용이며
 * 최종 검증은 Gateway가 한다(422 invalid_settings·settings_too_large). 저장이 성공하면
 * 상위 화면이 기존 편집 폼으로 바뀌고, 그 폼이 새 초안의 값으로 채워진다.
 */
function InitialDraftForm({
  defaultName,
  createState,
  createError,
  onCreate,
}: {
  defaultName: string;
  createState: ReturnType<typeof useDraft>["createState"];
  createError: string | null;
  onCreate: (settings: { name: string; profile: string }) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [profile, setProfile] = useState("");

  const profileLen = codePointLength(profile);
  const canCreate =
    name.trim() !== "" &&
    profile.trim() !== "" &&
    profileLen <= PROFILE_MAX &&
    createState !== "loading";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate) return;
    onCreate({ name: name.trim(), profile });
  };

  return (
    <form onSubmit={submit}>
      <p className="guide">
        아직 초안이 없습니다. 이름과 기본 소개를 입력하고 저장하면 초안이
        만들어지고, 이어서 본문·대사를 붙여넣을 수 있습니다.
      </p>

      <label htmlFor="initial-name">이름</label>
      <input
        id="initial-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />

      <label htmlFor="initial-profile">기본 소개</label>
      <textarea
        id="initial-profile"
        value={profile}
        onChange={(event) => setProfile(event.target.value)}
      />
      <CharCounter length={profileLen} max={PROFILE_MAX} blocking />

      {createError !== null && (
        <div className="error" role="alert">
          <p>{createError}</p>
        </div>
      )}

      <button type="submit" disabled={!canCreate}>
        {createState === "loading" ? "초안 만드는 중…" : "초안 만들기"}
      </button>
    </form>
  );
}
