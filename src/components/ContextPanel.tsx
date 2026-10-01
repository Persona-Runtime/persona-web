import { EMPTY_COPY, formatCreatedAt } from "../lib/personaCopy";
import type { ChatPanelInfo } from "../lib/studioContext";
import { Icon } from "./Icon";

/**
 * 자료 종류별 표시 이름. 키는 초안 source.kind 값이다(DraftEditRoute의 EditableKind와 같다).
 */
const MATERIAL_KINDS = [
  ["events", "본문"],
  ["speech_examples", "대사"],
  ["relationships", "관계"],
  ["abilities", "능력"],
] as const;

/** 적용본 id는 UUID라 길다. 화면에서 구분할 수 있는 앞 8자리만 보여준다. */
function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * 대화 화면의 보조 패널(데스크톱 오른쪽 열, 중간 폭에서는 오른쪽 서랍).
 *
 * 지금 알 수 있는 값만 보여준다.
 * - 대화: 대화 화면이 이미 불러온 대화 1개. 목록·전환은 M1-4에서 채운다.
 * - 자료(적용본): 종류별 글자 수는 적용본 조회 API가 없어 아직 알 수 없다. 숫자를
 *   지어내지 않고 "—"로 둔다(새 /v1 호출을 추가하지 않는 것이 이번 범위의 조건이다).
 *
 * onClose는 서랍으로 열렸을 때 닫기 버튼에 쓰인다. 넓은 화면에서는 CSS가 닫기 버튼을 숨긴다.
 */
export function ContextPanel({
  info,
  onClose,
}: {
  info: ChatPanelInfo;
  onClose: () => void;
}) {
  const { conversation } = info;
  return (
    <>
      <div className="context-panel__header">
        <h2 id="context-panel-title">대화 정보</h2>
        <button
          type="button"
          className="icon-button context-panel__close"
          onClick={onClose}
        >
          <Icon name="close" />
          <span className="visually-hidden">대화 정보 닫기</span>
        </button>
      </div>

      <section aria-labelledby="context-conversation-title">
        <h3 id="context-conversation-title" className="context-panel__label">
          대화
        </h3>
        {conversation === null ? (
          <p className="context-card context-card--muted">
            대화를 불러오는 중이에요.
          </p>
        ) : (
          <div className="context-card" aria-current="true">
            <strong className="context-card__title">
              {conversation.title}
            </strong>
            <span className="context-card__meta">
              질문 {info.turnCount}개 ·{" "}
              {formatCreatedAt(conversation.created_at)} 시작
            </span>
            {conversation.material_changed && (
              // 기존 대화는 시작할 때의 적용본으로 계속 답한다. 기록을 바꾸지 않으므로
              // 실패가 아니라 안내다(Conversation.material_changed 주석 참고).
              <span className="badge" data-tone="warn">
                자료가 바뀜 · 새 대화 권장
              </span>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="context-material-title">
        <h3 id="context-material-title" className="context-panel__label">
          자료 (적용본)
        </h3>
        <p className="context-panel__hint">
          적용본 {shortId(info.activeVersionId)}
        </p>
        <dl className="material-counts">
          {MATERIAL_KINDS.map(([kind, label]) => (
            <div key={kind} className="material-counts__row">
              <dt>{label}</dt>
              <dd>
                {/* "—"는 스크린리더가 건너뛰거나 "대시"로 읽으므로 뜻을 따로 적는다. */}
                <span aria-hidden="true">{EMPTY_COPY.panelEmpty}</span>
                <span className="visually-hidden">아직 알 수 없음</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="context-panel__hint">
          글자 수는 적용본 조회가 연결되면 표시돼요.
        </p>
      </section>
    </>
  );
}
