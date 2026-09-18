import { MAX_PERSONAS_PER_USER } from "../lib/limits";

/**
 * 보유 캐릭터 수 표시.
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
      보유 {count}/{MAX_PERSONAS_PER_USER}
    </p>
  );
}
