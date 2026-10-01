import { nextStepFor } from "../lib/personaCopy";
import type { PersonaStatus } from "../lib/types";

/**
 * 스텝 바 아래의 한 줄 안내. 상태를 경고가 아니라 지금 할 일로 보여준다.
 *
 * 버튼은 개요 상단의 "자료 편집"·"대화하기"가 맡으므로 여기서는 문장만 둔다.
 */
export function NextStepGuide({ status }: { status: PersonaStatus }) {
  return <p className="guide guide--one-line">{nextStepFor(status)}</p>;
}
