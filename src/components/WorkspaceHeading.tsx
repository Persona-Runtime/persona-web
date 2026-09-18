import { type ReactNode, useEffect, useRef } from "react";
import { useLocation } from "react-router";

/**
 * 작업 영역의 제목이자 포커스 착지점.
 *
 * 좁은 화면에서는 캐릭터를 고르면 목록이 사라지고 상세가 나타난다. 이때 포커스를
 * 옮기지 않으면 키보드·스크린리더 사용자는 화면이 바뀐 것을 알 수 없다.
 *
 * 다만 주소창에 직접 입력해 들어온 첫 화면에서는 포커스를 빼앗지 않는다. 그 구분에
 * history 항목의 key를 쓴다. 앱에 처음 들어온 항목은 "default"이고, 이 세션에서
 * 사용자가 이동해 만든 항목에는 새 key가 붙는다.
 */
export function WorkspaceHeading({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { key } = useLocation();

  useEffect(() => {
    if (key === "default") return;
    headingRef.current?.focus();
  }, [key]);

  return (
    <h1 id={id} className="workspace__heading" tabIndex={-1} ref={headingRef}>
      {children}
    </h1>
  );
}
