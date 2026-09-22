import { draftStatusLabel } from "../lib/personaCopy";
import type { DraftStatus } from "../lib/types";

/**
 * 초안 상태 배지. StatusBadge(PersonaStatus 전용)와 모양은 같지만 다른 열거값을
 * 다루므로 따로 둔다 — 색인 상태(editing/processing/ready/failed)는 캐릭터 상태와
 * 다른 개념이다.
 */
export function DraftStatusBadge({ status }: { status: DraftStatus }) {
  return (
    <span className="badge" data-status={status}>
      {draftStatusLabel(status)}
    </span>
  );
}
