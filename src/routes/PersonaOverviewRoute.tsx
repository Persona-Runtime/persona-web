import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { NextStepGuide } from "../components/NextStepGuide";
import { PersonaAvatar } from "../components/PersonaAvatar";
import { RetryNotice } from "../components/RetryNotice";
import { StatusBadge } from "../components/StatusBadge";
import { StepBar } from "../components/StepBar";
import { WorkspaceHeading } from "../components/WorkspaceHeading";
import { formatCreatedAt } from "../lib/personaCopy";
import { personaProgress } from "../lib/progress";
import { useStudio } from "../lib/studioContext";
import type { Persona } from "../lib/types";
import { useDeletePersona } from "../lib/useDeletePersona";

/**
 * 방금 생성을 마치고 이 화면으로 옮겨 왔는지.
 *
 * 생성 결과를 그대로 보고 판단하면 나중에 목록에서 같은 캐릭터를 다시 열 때도
 * "만들었습니다"가 또 뜬다. 이동 그 자체에 표시를 남겨 한 번만 안내한다.
 * 히스토리 state는 사용자가 바꿀 수 있는 입력이므로 정확히 true일 때만 믿는다.
 */
function arrivedFromCreation(state: unknown): boolean {
  if (typeof state !== "object" || state === null || !("created" in state)) {
    return false;
  }
  return (state as { created: unknown }).created === true;
}

/**
 * 목록에서 캐릭터를 찾지 못했을 때의 안내.
 *
 * "없다"고 말할 수 있는 경우는 완전한 목록을 성공적으로 읽었을 때뿐이다.
 * 조회에 실패했거나 아직 읽는 중이면 존재 여부를 모르는 것이지 없는 것이 아니다.
 * 좁은 화면에서는 목록 영역이 가려지므로 재조회 수단도 여기에 둔다.
 */
function LookupNotice({
  listState,
  listError,
  listIncomplete,
  onReload,
}: {
  listState: ReturnType<typeof useStudio>["list"]["state"];
  listError: string | null;
  listIncomplete: boolean;
  onReload: () => void;
}) {
  if (listState === "error") {
    return (
      <>
        <p className="guide">
          목록을 읽지 못해 이 캐릭터가 있는지 아직 확인하지 못했습니다.
        </p>
        <RetryNotice
          message={listError ?? "목록을 확인하지 못했습니다."}
          onRetry={onReload}
          actionLabel="목록 다시 조회"
        />
      </>
    );
  }

  if (listState !== "ready") {
    return (
      <p className="guide" role="status">
        캐릭터를 확인하는 중입니다…
      </p>
    );
  }

  if (listIncomplete) {
    return (
      <p className="notice">
        목록이 완전하지 않아 이 캐릭터를 확인할 수 없습니다.
      </p>
    );
  }

  return <p className="notice">이 캐릭터를 찾을 수 없습니다.</p>;
}

/**
 * 캐릭터 삭제 버튼과 확인 영역.
 *
 * 브라우저 confirm 창 대신 페이지 안에 확인 영역을 연다 — 캐릭터 이름과 되돌릴 수
 * 없다는 경고를 함께 보여주고, 취소와 삭제를 서로 다른 모양의 버튼으로 나눈다.
 * 삭제 성공 뒤 목록을 다시 읽고 /personas로 이동한다. 편집·대화 화면은 라우트를
 * 떠나면 언마운트되며 진행 중 조회도 함께 정리되므로 따로 지울 상태는 없다.
 */
function DeletePersonaSection({ persona }: { persona: Persona }) {
  const { api, list } = useStudio();
  const navigate = useNavigate();
  const deletion = useDeletePersona(api);
  const [confirming, setConfirming] = useState(false);
  const deleting = deletion.state === "loading";

  const confirmDelete = () => {
    if (deleting) return;
    deletion.remove(persona.id, () => {
      list.reload();
      navigate("/personas");
    });
  };

  if (!confirming) {
    return (
      <button
        type="button"
        className="secondary"
        onClick={() => setConfirming(true)}
      >
        캐릭터 삭제
      </button>
    );
  }

  return (
    <section
      className="danger-zone"
      role="alertdialog"
      aria-labelledby="delete-persona-title"
      aria-describedby="delete-persona-warning"
    >
      <h2 id="delete-persona-title">“{persona.name}” 캐릭터를 삭제할까요?</h2>
      <p id="delete-persona-warning">
        캐릭터의 자료와 대화 기록이 영구 삭제됩니다. 되돌릴 수 없습니다.
      </p>
      {deletion.error !== null && (
        <p className="error" role="alert">
          {deletion.error}
        </p>
      )}
      <div className="danger-zone__actions">
        <button
          type="button"
          className="secondary"
          disabled={deleting}
          onClick={() => setConfirming(false)}
        >
          취소
        </button>
        <button
          type="button"
          className="danger"
          disabled={deleting}
          onClick={confirmDelete}
        >
          {deleting ? "삭제 중…" : "삭제"}
        </button>
      </div>
    </section>
  );
}

/**
 * 선택한 캐릭터의 개요.
 *
 * 서버에 상세 조회 API가 아직 없으므로 목록 응답에 있는 값만 보여준다.
 * 기본 소개·경고 카드는 상세 초안(getDraft)에만 있는 값이라 이 화면에서는 그리지
 * 않는다 — 카드를 그리려고 새 요청을 보내지 않는 것이 이번 디자인 전환의 범위다.
 * 소개문·이미지·최근 대화처럼 서버가 주지 않는 내용은 만들지 않는다.
 */
export function PersonaOverviewRoute() {
  const { personaId } = useParams();
  const location = useLocation();
  const { list, listIncomplete, findPersona } = useStudio();
  const persona = personaId === undefined ? null : findPersona(personaId);

  if (persona === null) {
    return (
      <>
        <WorkspaceHeading id="workspace-title">캐릭터 확인</WorkspaceHeading>
        <LookupNotice
          listState={list.state}
          listError={list.error}
          listIncomplete={listIncomplete}
          onReload={list.reload}
        />
        <Link className="text-button" to="/personas">
          목록으로 돌아가기
        </Link>
      </>
    );
  }

  const justCreated = arrivedFromCreation(location.state);
  const progress = personaProgress(persona);

  return (
    <div className="overview">
      <header className="overview__header">
        <PersonaAvatar name={persona.name} size={72} />
        <div className="overview__identity">
          <WorkspaceHeading id="workspace-title">
            {persona.name}
          </WorkspaceHeading>
          <dl className="overview__facts">
            <div>
              <dt className="visually-hidden">상태</dt>
              <dd>
                <StatusBadge status={persona.status} />
              </dd>
            </div>
            <div>
              <dt>생성일</dt>
              <dd>{formatCreatedAt(persona.created_at)}</dd>
            </div>
          </dl>
        </div>
        <nav className="overview__actions" aria-label="자료·대화">
          <Link
            className="button button--secondary"
            to={`/personas/${persona.id}/draft`}
          >
            자료 편집
          </Link>
          <Link className="button" to={`/personas/${persona.id}/chat`}>
            대화하기
          </Link>
        </nav>
      </header>

      {justCreated && (
        <p className="success" role="status">
          “{persona.name}” 캐릭터를 만들었습니다.
        </p>
      )}

      {progress !== null && <StepBar progress={progress} />}
      <NextStepGuide status={persona.status} />

      {justCreated && list.state === "error" && (
        <p className="notice">
          캐릭터는 생성됐지만 목록을 갱신하지 못했습니다. 목록에서 다시 조회해
          주세요.
        </p>
      )}

      {/* 되돌릴 수 없는 동작은 맨 아래에 접어 둔다. 자주 쓰지 않는 버튼이 화면 위쪽의
          주 행동과 같은 무게로 보이지 않게 하려는 것이다. 열면 기존 확인 UI 그대로다. */}
      <details className="manage">
        <summary>캐릭터 관리</summary>
        <DeletePersonaSection key={persona.id} persona={persona} />
      </details>
    </div>
  );
}
