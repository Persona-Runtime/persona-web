import { useSession } from "../lib/session";

/**
 * 상단바. 로그아웃은 메모리의 토큰·사용자 자료를 지우는 동작이며 서버 토큰을
 * 폐기하지는 않는다. 화면 이동은 RequireSession이 인증 상태를 보고 처리한다.
 */
export function TopBar() {
  const { user, logout, authMode, sessionExpired } = useSession();
  return (
    <>
      <header className="topbar">
        <div className="topbar__identity">
          <p className="eyebrow">Persona Runtime</p>
          <strong>{user?.display_name}</strong>
          {/* subject는 gateway가 판정한 신원 그대로다(ForwardAuth 경로에서는
              github:<login>). 로그인한 계정이 맞는지 눈으로 확인할 수 있게 둔다. */}
          {user !== null && <p className="topbar__subject">{user.id}</p>}
        </div>
        {/* ForwardAuth 경로에는 이 앱이 지울 토큰이 없다. 로그아웃은 앞단
            (oauth2-proxy) 세션을 끊는 동작이어야 하는데 그 경로가 아직 없으므로,
            버튼을 만들어 두면 눌러도 아무 일이 없거나 오히려 토큰 화면으로
            떨어진다. 내부 경로에서만 보여 준다. */}
        {authMode === "bearer" && (
          <button className="secondary" type="button" onClick={logout}>
            로그아웃
          </button>
        )}
      </header>
      {sessionExpired && (
        <p className="error" role="alert">
          로그인이 만료됐습니다. 페이지를 새로고침해 다시 로그인해주세요.
        </p>
      )}
    </>
  );
}
