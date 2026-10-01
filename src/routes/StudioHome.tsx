import { EMPTY_COPY } from "../lib/personaCopy";
import { useStudio } from "../lib/studioContext";

/**
 * 캐릭터를 아직 고르지 않았을 때의 메인 영역(데스크톱).
 *
 * 첫 캐릭터로 자동 진입하지 않는다 — 들어오자마자 다른 화면으로 옮겨지면 사용자가
 * 고르지 않은 캐릭터의 작업을 보게 된다. 폰에서는 이 영역 대신 레일이 홈(카드 목록)이다.
 */
export function StudioHome() {
  const { list, personas, creationBlocked } = useStudio();
  const isEmpty = list.state === "ready" && personas.length === 0;

  return (
    <div className="home-empty">
      {/* 목록으로 돌아왔을 때 포커스는 직전에 보던 항목으로 가야 하므로
          이 제목은 포커스를 가져가지 않는 평범한 제목으로 둔다. */}
      <h1 id="workspace-title" className="home-empty__title">
        {isEmpty ? EMPTY_COPY.homeTitleEmpty : EMPTY_COPY.homeTitle}
      </h1>
      <p className="home-empty__body">
        {isEmpty ? EMPTY_COPY.homeBodyEmpty : EMPTY_COPY.homeBody}
      </p>
      {creationBlocked && (
        <p className="home-empty__body">{EMPTY_COPY.homeBlocked}</p>
      )}
    </div>
  );
}
