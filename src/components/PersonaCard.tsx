import { formatCreatedAt } from "../lib/personaCopy";
import type { PersonaStatus } from "../lib/types";
import { PersonaAvatar } from "./PersonaAvatar";
import { StatusBadge } from "./StatusBadge";

/**
 * 카드 한 장의 표시. 레일 항목과 생성 미리보기가 같은 모양을 쓰도록 공유한다.
 *
 * 링크 안에 들어가므로 바깥 요소를 span으로 두어 잘못된 중첩을 만들지 않는다.
 * 레일은 한 줄 상태만 보여주므로 createdAt을 넘기지 않는다. 생성일이 필요한 자리에서만 넘긴다.
 */
export function PersonaCard({
  name,
  status,
  createdAt,
}: {
  name: string;
  status: PersonaStatus;
  createdAt?: string;
}) {
  return (
    <span className="persona-card">
      <PersonaAvatar name={name} />
      <span className="persona-card__body">
        <strong className="persona-card__name">{name}</strong>
        <span className="persona-card__meta">
          <StatusBadge status={status} variant="dot" />
          {createdAt !== undefined && (
            <span className="persona-card__date">
              {formatCreatedAt(createdAt)} 생성
            </span>
          )}
        </span>
      </span>
    </span>
  );
}
