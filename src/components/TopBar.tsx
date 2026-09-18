import { useSession } from "../lib/session";

/**
 * 상단바. 로그아웃은 메모리의 토큰·사용자 자료를 지우는 동작이며 서버 토큰을
 * 폐기하지는 않는다. 화면 이동은 RequireSession이 인증 상태를 보고 처리한다.
 */
export function TopBar() {
  const { user, logout } = useSession();
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Persona Runtime</p>
        <strong>{user?.display_name}</strong>
      </div>
      <button className="secondary" type="button" onClick={logout}>
        로그아웃
      </button>
    </header>
  );
}
