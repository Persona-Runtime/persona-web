import { useEffect, useRef } from "react";
import { Link, NavLink } from "react-router";
import { EMPTY_COPY } from "../lib/personaCopy";
import { personaProgress } from "../lib/progress";
import type { LoadState, Persona } from "../lib/types";
import { Icon } from "./Icon";
import { PersonaCard } from "./PersonaCard";
import { PersonaListSkeleton } from "./PersonaListSkeleton";
import { QuotaCounter } from "./QuotaCounter";
import { RailAccount } from "./RailAccount";
import { RetryNotice } from "./RetryNotice";
import { StepBar } from "./StepBar";

/**
 * 캐릭터 레일. 데스크톱에서는 왼쪽 열, 폰에서는 홈 화면(카드 목록)이 된다.
 *
 * 직접 만든 listbox가 아니라 링크 목록으로 둔다. 여기서 고르는 것은 폼 값이 아니라
 * 이동할 주소이고, 링크여야 Tab·Enter·새 탭 열기가 추가 코드 없이 동작한다.
 *
 * 폰 카드의 주 행동 링크(대화 이어하기·자료 넣기)와 처리 중 스텝 바는 늘 렌더하고
 * CSS로 폰 폭에서만 보인다. 화면 폭에 따라 DOM을 바꾸면 회전·창 크기 변경 때
 * 포커스가 사라질 수 있기 때문이다.
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
  showMockBadge,
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
  /** 모의 응답 모드임을 알았을 때 브랜드 옆에 배지를 단다. */
  showMockBadge: boolean;
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
    <nav className="rail" aria-labelledby={headingId} ref={navRef}>
      <div className="rail__brand">
        <span className="rail__product">Persona Runtime</span>
        {showMockBadge && (
          <span className="badge" data-tone="warn">
            모의 응답
          </span>
        )}
      </div>

      <div className="rail__heading">
        <h2 id={headingId}>내 캐릭터</h2>
        {listState === "ready" && (
          <QuotaCounter count={personas.length} incomplete={listIncomplete} />
        )}
      </div>

      <div className="rail__body">
        {listState === "loading" && <PersonaListSkeleton />}

        {listState === "error" && listError !== null && (
          <RetryNotice message={listError} onRetry={onReload} />
        )}

        {listState === "ready" && personas.length === 0 && (
          <p className="empty">{EMPTY_COPY.personaList}</p>
        )}

        {listState === "ready" && personas.length > 0 && (
          <ul className="persona-list">
            {personas.map((persona) => (
              <PersonaRailItem key={persona.id} persona={persona} />
            ))}
          </ul>
        )}

        {creationBlocked ? (
          // 막혀 있을 때는 링크가 아니라 비활성 버튼이다. 누를 수 없는 링크보다
          // 정직하고, 이유는 aria-describedby로 함께 읽힌다.
          <button
            type="button"
            className="new-persona"
            disabled
            aria-describedby="create-block-reason"
          >
            <Icon name="plus" />새 캐릭터
          </button>
        ) : (
          <Link className="new-persona" to="/personas/new">
            <Icon name="plus" />새 캐릭터
          </Link>
        )}

        {creationBlocked && blockMessage !== null && (
          <p className="notice" id="create-block-reason">
            {blockMessage}
          </p>
        )}
      </div>

      <RailAccount />
    </nav>
  );
}

function PersonaRailItem({ persona }: { persona: Persona }) {
  const progress = personaProgress(persona);
  const canChat = persona.status === "ready";
  return (
    <li className="rail-item">
      {/* NavLink가 현재 항목에 aria-current="page"를 붙인다. */}
      <NavLink
        className="persona-link"
        to={`/personas/${persona.id}`}
        data-persona-id={persona.id}
      >
        <PersonaCard name={persona.name} status={persona.status} />
      </NavLink>
      {/* 아래는 폰 카드 목록에서만 보인다(위 컴포넌트 주석 참고). */}
      <div className="rail-item__mobile">
        {progress !== null && progress.tone !== "current" && (
          <StepBar progress={progress} compact />
        )}
        {persona.status !== "deleting" && (
          <Link
            className="button button--small"
            to={`/personas/${persona.id}/${canChat ? "chat" : "draft"}`}
          >
            {canChat ? "대화 이어하기" : "자료 넣기"}
          </Link>
        )}
      </div>
    </li>
  );
}
