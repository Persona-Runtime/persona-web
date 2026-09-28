import { useStudio } from "../lib/studioContext";

/** 캐릭터를 아직 고르지 않았을 때의 작업 영역. */
export function StudioHome() {
  const { list, personas, creationBlocked } = useStudio();

  return (
    <>
      {/* 목록으로 돌아왔을 때 포커스는 직전에 보던 항목으로 가야 하므로
          이 제목은 포커스를 가져가지 않는 평범한 제목으로 둔다. */}
      <h1 id="workspace-title" className="workspace__heading">
        캐릭터 작업 공간
      </h1>
      {list.state === "ready" && personas.length === 0 ? (
        <p className="guide">
          아직 캐릭터가 없습니다. 왼쪽에서 캐릭터를 만들면 여기에 상태와 다음
          단계가 표시됩니다.
        </p>
      ) : (
        <p className="guide">
          왼쪽 목록에서 캐릭터를 선택하면 상태와 다음 단계를 볼 수 있습니다.
        </p>
      )}
      {creationBlocked && (
        <p className="guide">
          새 캐릭터를 만들려면 기존 캐릭터를 삭제해야 합니다. 캐릭터를 선택한 뒤
          개요 화면의 “캐릭터 삭제”를 쓰세요. 서버에 삭제 기능이 배포되기 전에는
          삭제 요청이 실패할 수 있습니다.
        </p>
      )}
    </>
  );
}
