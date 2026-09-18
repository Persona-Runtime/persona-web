import { statusLabel } from "../lib/personaCopy";
import type { PersonaStatus } from "../lib/types";

/** 상태 배지. 색만으로 의미를 전달하지 않도록 라벨 텍스트를 항상 함께 둔다. */
export function StatusBadge({ status }: { status: PersonaStatus }) {
  return (
    <span className="badge" data-status={status}>
      {statusLabel(status)}
    </span>
  );
}
