import { Navigate, useLocation } from "react-router";
import { RetryNotice } from "../components/RetryNotice";
import { ServiceIntro } from "../components/ServiceIntro";
import { TokenForm } from "../components/TokenForm";
import { useSession } from "../lib/session";

/**
 * 히스토리 state에서 돌아갈 주소를 읽는다.
 *
 * 히스토리 state는 사용자가 바꿀 수 있는 입력이므로 그대로 믿지 않는다. 우리가 아는
 * 앱 경로만 허용해 엉뚱한 주소로 보내는 것과, "/"로 되돌아가는 무한 이동을 막는다.
 */
function returnPathFrom(state: unknown): string | null {
  if (typeof state !== "object" || state === null || !("from" in state)) {
    return null;
  }
  const from = (state as { from: unknown }).from;
  return typeof from === "string" && from.startsWith("/personas") ? from : null;
}

export function TokenRoute() {
  const { isAuthenticated, authMode, probeError, retryProbe } = useSession();
  const location = useLocation();

  if (isAuthenticated) {
    const destination = returnPathFrom(location.state) ?? "/personas";
    return <Navigate to={destination} replace />;
  }

  // 판정 중에는 토큰 폼을 그리지 않는다. ForwardAuth 경로에서는 곧 목록으로
  // 넘어갈 화면이라, 입력창을 보여 주면 "무엇을 넣어야 하나"를 고민하게 만든다.
  if (authMode === "probing") {
    return (
      <main className="entry">
        <section className="entry__card">
          <ServiceIntro />
          <p className="guide" role="status">
            접속 상태를 확인하는 중입니다…
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="entry">
      <section className="entry__card">
        <ServiceIntro />
        {probeError === null ? (
          <div className="entry__form">
            <AuthTabs />
            <h2 id="token-title" className="visually-hidden">
              접속 토큰 입력
            </h2>
            <TokenForm />
          </div>
        ) : (
          // 401이 아니라 서버·네트워크 문제로 판정을 못 했다. 토큰을 요구하면
          // 사용자가 넣을 수 없는 값을 찾게 되므로 재시도만 안내한다.
          <div className="entry__form">
            <h2 id="probe-error-title" className="entry__subtitle">
              접속 상태를 확인하지 못했습니다
            </h2>
            <RetryNotice message={probeError} onRetry={retryProbe} />
          </div>
        )}
      </section>
    </main>
  );
}

/**
 * "로그인 | 회원가입" 탭 자리.
 *
 * 계정 로그인 폼은 A-2에서 이 자리에 들어온다. 지금은 모양만 그리고 두 버튼 모두
 * 비활성이다 — 눌러도 아무 일이 없는 활성 탭을 두면 기능이 있는 것처럼 보인다.
 * 아래 토큰 입력이 지금 실제로 쓰는 접속 방법이다.
 */
function AuthTabs() {
  return (
    <div className="auth-tabs" aria-label="계정 로그인(준비 중)" role="group">
      <button
        type="button"
        className="auth-tabs__tab"
        data-active="true"
        disabled
        aria-disabled="true"
      >
        로그인
      </button>
      <button
        type="button"
        className="auth-tabs__tab"
        disabled
        aria-disabled="true"
      >
        회원가입
      </button>
    </div>
  );
}
