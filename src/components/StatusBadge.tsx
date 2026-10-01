import { statusLabel } from "../lib/personaCopy";
import type { PersonaStatus } from "../lib/types";

/**
 * 상태 배지. 색만으로 의미를 전달하지 않도록 라벨 텍스트를 항상 함께 둔다.
 *
 * variant="dot"은 레일처럼 좁은 자리에서 쓰는 "점 + 한 줄 상태" 모양이다. 글자는
 * pill과 같으므로 읽히는 내용은 달라지지 않는다.
 */
export function StatusBadge({
  status,
  variant = "pill",
}: {
  status: PersonaStatus;
  variant?: "pill" | "dot";
}) {
  return (
    <span
      className={variant === "dot" ? "status-line" : "badge"}
      data-status={status}
    >
      {statusLabel(status)}
    </span>
  );
}
