import { useEffect, useRef } from "react";
import { Link, NavLink } from "react-router";
import type { LoadState, Persona } from "../lib/types";
import { PersonaCard } from "./PersonaCard";
import { PersonaListSkeleton } from "./PersonaListSkeleton";
import { QuotaCounter } from "./QuotaCounter";
import { RetryNotice } from "./RetryNotice";

/**
 * 좌측 캐릭터 목록.
 *
 * 직접 만든 listbox가 아니라 링크 목록으로 둔다. 여기서 고르는 것은 폼 값이 아니라
 * 이동할 주소이고, 링크여야 Tab·Enter·새 탭 열기가 추가 코드 없이 동작한다.
 */
export function PersonaNav({
  headingId,
  personas,
  listState,
  listError,
  onReload,
  listIncomplete,
  creationBlocked,
  blockMessage,
  selectedId,
}: {
  headingId: string;
  personas: Persona[];
  listState: LoadState;
  listError: string | null;
  onReload: () => void;
  listIncomplete: boolean;
  creationBlocked: boolean;
  blockMessage: string | null;
  selectedId: string | null;
}) {
  const navRef = useRef<HTMLElement>(null);
  const previousSelected = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousSelected.current;
    previousSelected.current = selectedId;
    // 상세를 보다가 목록으로 돌아온 경우에만 직전에 보던 항목으로 포커스를 되돌린다.
    // 좁은 화면에서는 목록이 가려져 있다가 다시 나타나므로 포커스가 문서 처음으로
    // 떨어지면 방금 어디에 있었는지 잃어버린다.
    if (selectedId !== null || previous === null) return;
    navRef.current
      ?.querySelector<HTMLElement>(`[data-persona-id="${previous}"]`)
      ?.focus();
  }, [selectedId]);

  return (
    <nav className="studio__list" aria-labelledby={headingId} ref={navRef}>
      <div className="section-heading">
        <div>
          <h2 id={headingId}>내 캐릭터</h2>
          {listState === "ready" && (
            <QuotaCounter count={personas.length} incomplete={listIncomplete} />
          )}
        </div>
        {creationBlocked ? (
          // 막혀 있을 때는 링크가 아니라 비활성 버튼이다. 누를 수 없는 링크보다
          // 정직하고, 이유는 aria-describedby로 함께 읽힌다.
          <button type="button" disabled aria-describedby="create-block-reason">
            캐릭터 생성
          </button>
        ) : (
          <Link className="button" to="/personas/new">
            캐릭터 생성
          </Link>
        )}
      </div>

      {creationBlocked && blockMessage !== null && (
        <p className="notice" id="create-block-reason">
          {blockMessage}
        </p>
      )}

      {listState === "loading" && <PersonaListSkeleton />}

      {listState === "error" && listError !== null && (
        <RetryNotice message={listError} onRetry={onReload} />
      )}

      {listState === "ready" && personas.length === 0 && (
        <p className="empty">아직 만든 캐릭터가 없습니다.</p>
      )}

      {listState === "ready" && personas.length > 0 && (
        <ul className="persona-list">
          {personas.map((persona) => (
            <li key={persona.id}>
              {/* NavLink가 현재 항목에 aria-current="page"를 붙인다. */}
              <NavLink
                className="persona-link"
                to={`/personas/${persona.id}`}
                data-persona-id={persona.id}
              >
                <PersonaCard
                  name={persona.name}
                  status={persona.status}
                  createdAt={persona.created_at}
                />
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
