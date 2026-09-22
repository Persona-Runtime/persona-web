import { nextStepFor } from "../lib/personaCopy";
import type { PersonaStatus } from "../lib/types";

/**
 * 상태를 경고가 아니라 다음 단계 안내로 보여준다.
 *
 * 자료 입력·대화는 아직 만들지 않았으므로 여기서 버튼을 약속하지 않는다.
 * 비활성 버튼도 곧 열린다는 인상을 주므로 문장으로만 안내한다.
 */
export function NextStepGuide({ status }: { status: PersonaStatus }) {
  return <p className="guide">{nextStepFor(status)}</p>;
}
