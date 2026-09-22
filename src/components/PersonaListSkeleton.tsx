/**
 * 목록 로딩 자리표시자.
 *
 * 빈 목록과 로딩 중이 같은 화면으로 보이면 "아직 없음"과 "아직 모름"을 구분할 수
 * 없다. 모양은 보조기술에서 숨기고 상태 문구만 읽히게 한다.
 */
export function PersonaListSkeleton() {
  return (
    <div className="persona-skeletons" role="status">
      <span className="visually-hidden">목록을 불러오는 중입니다…</span>
      {[0, 1, 2].map((row) => (
        <span className="persona-card" key={row} aria-hidden="true">
          <span className="skeleton skeleton--avatar" />
          <span className="persona-card__body">
            <span className="skeleton skeleton--line" />
            <span className="skeleton skeleton--line skeleton--short" />
          </span>
        </span>
      ))}
    </div>
  );
}
