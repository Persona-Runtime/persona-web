import { Navigate, Outlet, useLocation } from "react-router";
import { useSession } from "../lib/session";

/**
 * 인증이 필요한 화면을 감싼다.
 *
 * 화면 이동을 명령형 navigate가 아니라 렌더 결과로 표현한다. 인증 상태와 주소가
 * 같은 렌더에서 결정되므로, 늦게 도착한 응답이 주소만 되돌려 놓는 일이 생기지 않는다.
 */
export function RequireSession() {
  const { isAuthenticated, hasAuthenticated, authMode } = useSession();
  const location = useLocation();

  if (isAuthenticated) return <Outlet />;

  // 어느 인증 경로인지 아직 모르는 동안에는 이동시키지 않는다. 여기서 "/"로
  // 보내면 ForwardAuth 경로에서도 딥링크가 목록으로 튕기고(주소가 replace되어
  // 되돌릴 수도 없다) 토큰 화면이 한 프레임 깜빡인다.
  if (authMode === "probing") {
    return (
      <main className="entry">
        <p className="guide" role="status">
          접속 상태를 확인하는 중입니다…
        </p>
      </main>
    );
  }

  // 딥링크로 처음 들어온 경우에만 원래 주소를 기억한다. 로그아웃 뒤 다시 로그인할
  // 때 이전 세션이 보던 캐릭터로 돌아가면 안 되기 때문이다.
  const from = hasAuthenticated ? null : location.pathname;
  return <Navigate to="/" replace state={from === null ? null : { from }} />;
}
