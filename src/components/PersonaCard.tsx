import { formatCreatedAt } from "../lib/personaCopy";
import type { PersonaStatus } from "../lib/types";
import { PersonaAvatar } from "./PersonaAvatar";
import { StatusBadge } from "./StatusBadge";

/**
 * 카드 한 장의 표시. 목록 항목과 생성 미리보기가 같은 모양을 쓰도록 공유한다.
 *
 * 링크 안에 들어가므로 바깥 요소를 span으로 두어 잘못된 중첩을 만들지 않는다.
 * 생성 미리보기에는 아직 생성일이 없으므로 createdAt은 선택 값이다.
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
          <StatusBadge status={status} />
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
