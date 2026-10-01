import { Link } from "react-router";

/**
 * 알 수 없는 주소.
 *
 * 조용히 목록으로 돌려보내지 않는다. 잘못된 링크가 정상 화면처럼 보이면 어디가
 * 깨졌는지 알 수 없다.
 */
export function NotFoundRoute() {
  return (
    <main className="entry">
      <section className="entry__card">
        <h1>주소를 찾을 수 없습니다</h1>
        <p>입력한 주소에 해당하는 화면이 없습니다.</p>
        <Link className="text-button" to="/">
          처음 화면으로
        </Link>
      </section>
    </main>
  );
}
