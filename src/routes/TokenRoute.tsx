import { Navigate, useLocation } from "react-router";
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
  const { isAuthenticated } = useSession();
  const location = useLocation();

  if (isAuthenticated) {
    const destination = returnPathFrom(location.state) ?? "/personas";
    return <Navigate to={destination} replace />;
  }

  return (
    <main className="shell shell--entry">
      <section className="panel">
        <ServiceIntro />
      </section>
      <section className="panel" aria-labelledby="token-title">
        <h2 id="token-title">접속 토큰 입력</h2>
        <TokenForm />
      </section>
    </main>
  );
}
