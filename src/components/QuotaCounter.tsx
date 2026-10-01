import { MAX_PERSONAS_PER_USER } from "../lib/limits";

/**
 * 보유 캐릭터 수 표시. 레일 제목 "내 캐릭터" 옆에 "1/3"처럼 붙는다.
 *
 * 화면에는 숫자만 보이지만 스크린리더에는 "보유 n/3"으로 읽힌다. 숫자만 읽히면
 * 무엇의 개수인지 알 수 없다. 읽히는 문장을 한 덩어리로 두려고 보이는 숫자와 읽히는
 * 문장을 나눠 적는다.
 *
 * 목록이 잘려 있으면 숫자를 지어내지 않고 확인할 수 없다고 말한다. 개수의 근거는
 * 서버 목록 응답뿐이며, 방금 만든 캐릭터를 여기에 더하지 않는다.
 */
export function QuotaCounter({
  count,
  incomplete,
}: {
  count: number;
  incomplete: boolean;
}) {
  if (incomplete) {
    return <p className="quota">보유 개수를 확인할 수 없습니다.</p>;
  }
  return (
    <p className="quota">
      <span className="visually-hidden">
        보유 {count}/{MAX_PERSONAS_PER_USER}
      </span>
      <span aria-hidden="true">
        {count}/{MAX_PERSONAS_PER_USER}
      </span>
    </p>
  );
}
