import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { CharCounter } from "../components/CharCounter";
import { DraftStatusBadge } from "../components/DraftStatusBadge";
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
import { draftFailedMessage } from "../lib/personaCopy";
import { useStudio } from "../lib/studioContext";
import { useDraft } from "../lib/useDraft";

// 화자: 대사, 또는 화자 (상황): 대사.
const SPEECH_LINE_PATTERN = /^[^:\n]+(\s\([^)]*\))?:\s/;

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
  const { api, findPersona } = useStudio();
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
    <DraftEditForm api={api} personaId={personaId} personaName={persona.name} />
  );
}

function DraftEditForm({
  api,
  personaId,
  personaName,
}: {
  api: ReturnType<typeof useStudio>["api"];
  personaId: string;
  personaName: string;
}) {
  const draftState = useDraft(api, personaId, personaName);
  const { state, draft, loadError, reload } = draftState;

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
  const profileBlocked = profileLen > PROFILE_MAX;
  const canSave =
    nameValid && !profileBlocked && draftState.saveState !== "loading";

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

  const canApply =
    draft.status !== "processing" && draftState.applyState !== "loading";

  return (
    <>
      <WorkspaceHeading id="workspace-title">
        {personaName} — 자료 편집
      </WorkspaceHeading>

      <div className="facts">
        <DraftStatusBadge status={draft.status} />
      </div>

      {draft.status === "failed" && (
        <p className="notice">{draftFailedMessage()}</p>
      )}
      {draft.status === "processing" && (
        <p className="guide" role="status">
          자료를 처리하고 있습니다. 완료되면 자동으로 갱신됩니다.
        </p>
      )}

      {draftState.saveConflict && (
        <RetryNotice
          message="다른 곳에서 수정됨 — 다시 불러오기"
          onRetry={reload}
          actionLabel="다시 불러오기"
        />
      )}

      <form onSubmit={submit}>
        <label htmlFor="draft-name">이름</label>
        <input
          id="draft-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <label htmlFor="draft-profile">기본 소개</label>
        <textarea
          id="draft-profile"
          value={profile}
          onChange={(event) => setProfile(event.target.value)}
        />
        <CharCounter length={profileLen} max={PROFILE_MAX} blocking />

        <label htmlFor="draft-body">
          본문 — corpus-tools --format paste 출력을 그대로
        </label>
        <textarea
          id="draft-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <CharCounter length={bodyLen} max={BODY_MAX} />

        <label htmlFor="draft-speech">대사 — 한 줄에 화자: 대사</label>
        <textarea
          id="draft-speech"
          value={speech}
          onChange={(event) => setSpeech(event.target.value)}
        />
        <CharCounter length={speechLen} max={SPEECH_MAX} />
        {badSpeechLines > 0 && (
          <p className="counter">
            형식과 다른 줄 {badSpeechLines}개 — "화자: 대사" 형식을 확인해주세요
            (저장은 막지 않습니다)
          </p>
        )}

        <button
          type="button"
          className="secondary"
          onClick={() => setShowOptional((value) => !value)}
          aria-expanded={showOptional}
        >
          선택 항목 {showOptional ? "접기" : "펼치기"}(관계·능력)
        </button>
        {showOptional && (
          <div className="optional-sources">
            <label htmlFor="draft-relationships">관계</label>
            <textarea
              id="draft-relationships"
              value={relationships}
              onChange={(event) => setRelationships(event.target.value)}
            />
            <CharCounter length={relationshipsLen} max={OPTIONAL_MAX} />

            <label htmlFor="draft-abilities">능력</label>
            <textarea
              id="draft-abilities"
              value={abilities}
              onChange={(event) => setAbilities(event.target.value)}
            />
            <CharCounter length={abilitiesLen} max={OPTIONAL_MAX} />
          </div>
        )}

        <CharCounter length={totalLen} max={TOTAL_MAX} />

        {draftState.saveError !== null && (
          <div className="error" role="alert">
            <p>{draftState.saveError}</p>
          </div>
        )}

        <button type="submit" disabled={!canSave}>
          {draftState.saveState === "loading" ? "저장 중…" : "저장"}
        </button>
      </form>

      {draftState.applyError !== null && (
        <div className="error" role="alert">
          <p>{draftState.applyError}</p>
        </div>
      )}
      <button type="button" onClick={draftState.apply} disabled={!canApply}>
        {draftState.applyState === "loading" || draft.status === "processing"
          ? "적용 중…"
          : "적용"}
      </button>
    </>
  );
}
