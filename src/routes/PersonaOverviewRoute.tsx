import { Link, useLocation, useParams } from "react-router";
import { NextStepGuide } from "../components/NextStepGuide";
import { PersonaAvatar } from "../components/PersonaAvatar";
import { RetryNotice } from "../components/RetryNotice";
import { StatusBadge } from "../components/StatusBadge";
import { WorkspaceHeading } from "../components/WorkspaceHeading";
import { formatCreatedAt } from "../lib/personaCopy";
import { useStudio } from "../lib/studioContext";

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
 * 선택한 캐릭터의 개요.
 *
 * 서버에 상세 조회 API가 아직 없으므로 목록 응답에 있는 값만 보여준다.
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

  return (
    <>
      <div className="workspace__identity">
        <PersonaAvatar name={persona.name} />
        <WorkspaceHeading id="workspace-title">{persona.name}</WorkspaceHeading>
      </div>

      {justCreated && (
        <p className="success" role="status">
          “{persona.name}” 캐릭터를 만들었습니다.
        </p>
      )}

      <dl className="facts">
        <dt>상태</dt>
        <dd>
          <StatusBadge status={persona.status} />
        </dd>
        <dt>생성일</dt>
        <dd>{formatCreatedAt(persona.created_at)}</dd>
      </dl>

      <NextStepGuide status={persona.status} />

      <nav className="workspace-nav" aria-label="자료·대화">
        <Link className="text-button" to={`/personas/${persona.id}/draft`}>
          자료 편집
        </Link>
        <Link className="text-button" to={`/personas/${persona.id}/chat`}>
          대화
        </Link>
      </nav>

      {justCreated && list.state === "error" && (
        <p className="notice">
          캐릭터는 생성됐지만 목록을 갱신하지 못했습니다. 목록에서 다시 조회해
          주세요.
        </p>
      )}
    </>
  );
}
