import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router";
import { CharCounter } from "../components/CharCounter";
import { Icon } from "../components/Icon";
import { PersonaAvatar } from "../components/PersonaAvatar";
import { RetryNotice } from "../components/RetryNotice";
import { StatusBadge } from "../components/StatusBadge";
import { WorkspaceHeading } from "../components/WorkspaceHeading";
import { QUESTION_MAX, codePointLength } from "../lib/limits";
import {
  EMPTY_COPY,
  formatCreatedAt,
  generationFailedMessage,
} from "../lib/personaCopy";
import { useStudio } from "../lib/studioContext";
import { useChat } from "../lib/useChat";
import type {
  Citation,
  Conversation,
  Generation,
  GenerationMode,
  MessageTurn,
  PersonaStatus,
} from "../lib/types";

/**
 * 대화 화면. 캐릭터에 적용본(active_version_id)이 있어야 열린다.
 *
 * 실제 fetch 기반 POST SSE로 서버와 통신한다(EventSource 안 씀 — 인증 헤더와 POST
 * body를 보내야 한다). Content-Type을 먼저 검사해 JSON replay와 스트림을 구분하는
 * 책임은 lib/api.ts의 httpPersonaApi가 진다 — 이 화면은 결과 유니온만 본다.
 */
export function ChatRoute() {
  const { personaId } = useParams();
  const { findPersona } = useStudio();
  const persona = personaId === undefined ? null : findPersona(personaId);

  if (persona === null || personaId === undefined) {
    return (
      <>
        <WorkspaceHeading id="workspace-title">대화</WorkspaceHeading>
        <p className="notice">이 캐릭터를 찾을 수 없습니다.</p>
        <Link className="text-button" to="/personas">
          목록으로 돌아가기
        </Link>
      </>
    );
  }

  return (
    <ChatScreen
      personaId={personaId}
      personaName={persona.name}
      personaStatus={persona.status}
      activeVersionId={persona.active_version_id}
    />
  );
}

function generationStatusLabel(generation: Generation): string | null {
  switch (generation.status) {
    case "cancelled":
      return "취소됨";
    case "failed":
      return generationFailedMessage(generation.failure_code);
    case "reconciling":
      return "결과를 확인하는 중입니다.";
    default:
      return null;
  }
}

/** 상태 안내 띠의 색. 실패만 로즈로 두고, 취소·확인 중은 경고 띠로 둔다. */
function statusTone(status: Generation["status"]): "error" | "notice" {
  return status === "failed" ? "error" : "notice";
}

/**
 * 가장 최근에 관측한 generation.mode. 스트리밍 중이면 그 값, 아니면 마지막 질문의
 * 마지막 시도 값이다. 아직 응답이 하나도 없으면 null.
 */
function latestMode(
  turns: MessageTurn[],
  streamingMode: GenerationMode | null,
): GenerationMode | null {
  if (streamingMode !== null) return streamingMode;
  const lastTurn = turns[turns.length - 1];
  const lastGeneration = lastTurn?.generations[lastTurn.generations.length - 1];
  return lastGeneration?.mode ?? null;
}

/** 적용본 id(UUID)는 길어서 헤더 한 줄에 앞 8자리만 보여준다. */
function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * 답변 아래의 참고 자료. 기본은 접어 두고 개수만 보여준다.
 *
 * 인용은 서버가 준 title·excerpt를 **텍스트 그대로** 표시한다. 업로드 원문에서 온
 * 문자열이므로 Markdown/HTML로 해석하지 않는다(React가 문자열을 이스케이프한다).
 */
function CitationList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;
  return (
    <details className="citations">
      <summary>참고 자료 {citations.length}개</summary>
      <ul className="chat-citations" aria-label="참고 자료">
        {citations.map((citation) => (
          <li key={citation.id} className="citation">
            <strong className="citation__title">{citation.title}</strong>
            <p className="citation__excerpt">{citation.excerpt}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** 모의 응답임을 숨기지 않는다. 실제 모델 답변으로 오해하지 않게 말풍선마다 단다. */
function MockBadge({ mode }: { mode: GenerationMode }) {
  if (mode !== "mock") return null;
  return (
    <span className="badge" data-tone="warn">
      모의 응답
    </span>
  );
}

function TurnView({
  turn,
  personaName,
  onRetry,
  retryDisabled,
}: {
  turn: MessageTurn;
  personaName: string;
  onRetry: (generationId: string) => void;
  retryDisabled: boolean;
}) {
  // 재시도가 쌓이면 같은 질문에 여러 시도가 남는다 — 마지막(최신) 시도만 답변으로
  // 보여주고, 그 이전 것들은 "실패 기록"으로 취급해 화면에 다시 안 띄운다(계약:
  // "중단·실패 기록이 완성 답변처럼 섞이지 않는다").
  const latest = turn.generations[turn.generations.length - 1];
  const statusLabel =
    latest === undefined ? null : generationStatusLabel(latest);
  return (
    <li className="chat-turn">
      <p
        className="bubble bubble--user"
        data-role="user"
        data-user-message-id={turn.user_message.id}
      >
        {turn.user_message.content}
      </p>
      {latest !== undefined && (
        <div className="assistant-row">
          <PersonaAvatar name={personaName} size={32} />
          <div
            className="assistant-block"
            data-role="assistant"
            data-generation-status={latest.status}
            data-assistant-message-id={latest.assistant_message_id}
          >
            {latest.content !== "" && (
              <p className="bubble bubble--assistant">{latest.content}</p>
            )}
            <CitationList citations={latest.citations} />
            {statusLabel !== null && (
              <p className={statusTone(latest.status)} role="status">
                {statusLabel}
              </p>
            )}
            <div className="assistant-block__meta">
              <MockBadge mode={latest.mode} />
              {latest.can_retry && latest.status !== "completed" && (
                <button
                  className="button--secondary button--small"
                  type="button"
                  disabled={retryDisabled}
                  onClick={() => onRetry(latest.id)}
                >
                  다시 시도
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function ChatHeader({
  personaId,
  personaName,
  personaStatus,
  activeVersionId,
  conversation,
}: {
  personaId: string;
  personaName: string;
  personaStatus: PersonaStatus;
  activeVersionId: string | null;
  conversation: Conversation | null;
}) {
  return (
    <header className="chat-header">
      <PersonaAvatar name={personaName} size={40} />
      <div className="chat-header__identity">
        <div className="chat-header__title">
          {/* 화면에는 이름만 보이지만 제목으로는 "이름 — 대화"로 읽히게 한다. 같은
              이름의 개요·자료 편집 제목과 구분하기 위해서다. */}
          <WorkspaceHeading id="workspace-title">
            {personaName}
            <span className="visually-hidden"> — 대화</span>
          </WorkspaceHeading>
          <StatusBadge status={personaStatus} />
        </div>
        {activeVersionId !== null && (
          <p className="chat-header__meta">
            적용본 {shortId(activeVersionId)}
            {conversation !== null &&
              ` · ${formatCreatedAt(conversation.created_at)} 대화 시작`}
          </p>
        )}
      </div>
      <Link
        className="button button--secondary button--small"
        to={`/personas/${personaId}/draft`}
      >
        자료 편집
      </Link>
    </header>
  );
}

function ChatScreen({
  personaId,
  personaName,
  personaStatus,
  activeVersionId,
}: {
  personaId: string;
  personaName: string;
  personaStatus: PersonaStatus;
  activeVersionId: string | null;
}) {
  const { api, reportGenerationMode, setChatPanel } = useStudio();
  const chat = useChat(api, personaId);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // 새 메시지·스트리밍 조각이 올 때마다 목록 끝으로 내린다. 폰에서는 입력줄이
  // 하단에 붙어 있어, 내리지 않으면 방금 온 답이 그 뒤에 가려진다.
  // scrollIntoView는 jsdom에 없으므로(레이아웃 자체가 없다) 옵셔널로 부른다.
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [chat.turns, chat.streaming]);

  // 레일의 "모의 응답" 배지가 쓸 값을 셸에 알린다. 표시만을 위한 값이고 요청은 늘지 않는다.
  const observedMode = latestMode(chat.turns, chat.streaming?.mode ?? null);
  useEffect(() => {
    if (observedMode !== null) reportGenerationMode(observedMode);
  }, [observedMode, reportGenerationMode]);

  // 보조 패널은 이 화면이 이미 가진 대화 정보로만 채운다. 적용본이 없으면 대화도
  // 없으므로 패널을 접는다.
  const turnCount = chat.turns.length;
  useEffect(() => {
    setChatPanel(
      activeVersionId === null
        ? null
        : {
            personaName,
            activeVersionId,
            conversation: chat.conversation,
            turnCount,
          },
    );
  }, [
    setChatPanel,
    personaName,
    activeVersionId,
    chat.conversation,
    turnCount,
  ]);
  // 화면을 떠나면 패널을 비운다. 위 효과와 나눈 이유: 값이 바뀔 때마다 null을 거쳐
  // 패널이 깜빡이지 않게, 정리는 언마운트 때 한 번만 한다.
  useEffect(() => () => setChatPanel(null), [setChatPanel]);

  const header = (
    <ChatHeader
      personaId={personaId}
      personaName={personaName}
      personaStatus={personaStatus}
      activeVersionId={activeVersionId}
      conversation={chat.conversation}
    />
  );

  // 대화 가능 여부는 **적용본**이 정한다. 초안 상태로 판정하면 안 된다 — 활성화하면
  // 초안 슬롯이 비어 getDraft가 409 draft_not_started를 돌려주므로, 정상적으로
  // 자료를 적용한 캐릭터일수록 대화가 막힌다. 서버도 같은 기준이다: 대화 생성은
  // 적용본이 없으면 409 no_active_version이다(계약 §7).
  if (activeVersionId === null) {
    return (
      <div className="chat">
        {header}
        <div className="chat__notice">
          <p className="guide">자료를 먼저 적용하세요.</p>
          <Link className="text-button" to={`/personas/${personaId}/draft`}>
            자료 편집으로 이동
          </Link>
        </div>
      </div>
    );
  }

  if (chat.state === "loading" || chat.state === "idle") {
    return (
      <div className="chat">
        {header}
        <p className="guide chat__notice" role="status">
          대화를 불러오는 중입니다…
        </p>
      </div>
    );
  }

  if (chat.state === "error") {
    return (
      <div className="chat">
        {header}
        <div className="chat__notice">
          <RetryNotice
            message={chat.loadError ?? "대화를 불러오지 못했습니다."}
            onRetry={() => window.location.reload()}
          />
        </div>
      </div>
    );
  }

  // 사용자당 활성 generation은 1개다 — 지금 스트리밍 중이거나 접수 응답을 기다리는
  // 동안은 전송·재시도를 막는다(서버 409를 굳이 유발하지 않는다).
  const busy = chat.streaming !== null || chat.sendState === "loading";

  // 질문 길이는 코드 포인트로 센다(서버 Python len과 같은 기준). 한도를 넘으면
  // 안내를 보여주고 전송을 막는다 — 보내면 서버가 QuestionTooLong으로 실패시킨다.
  const questionLength = codePointLength(input.trim());
  const questionTooLong = questionLength > QUESTION_MAX;
  const canSend = !busy && input.trim() !== "" && !questionTooLong;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (trimmed === "" || questionTooLong || busy) return;
    chat.send(trimmed);
    setInput("");
  };

  // 한 줄 입력창이던 때처럼 Enter로 보낸다. 줄을 바꾸려면 Shift+Enter.
  // IME 조합 중의 Enter는 글자를 확정하는 키라 보내지 않는다 — 여기서 보내면 한글
  // 마지막 글자가 빠지거나 확정 뒤 한 번 더 전송된다. Safari는 조합 확정 Enter에서
  // isComposing이 false인 경우가 있어 keyCode 229(조합 중 키)도 함께 본다.
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
      return;
    }
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const streaming = chat.streaming;
  const isEmpty = chat.turns.length === 0 && streaming === null;

  return (
    <div className="chat">
      {header}

      <div className="chat__scroll">
        {isEmpty && <p className="chat-empty">{EMPTY_COPY.chatEmpty}</p>}
        <ul className="chat-messages">
          {chat.turns.map((turn) => (
            <TurnView
              key={turn.user_message.id}
              turn={turn}
              personaName={personaName}
              onRetry={chat.retry}
              retryDisabled={busy}
            />
          ))}
          {streaming !== null && (
            <li className="chat-turn">
              <p
                className="bubble bubble--user"
                data-role="user"
                data-user-message-id={streaming.userMessage.id}
              >
                {streaming.userMessage.content}
              </p>
              <div className="assistant-row">
                <PersonaAvatar name={personaName} size={32} />
                <div
                  className="assistant-block"
                  data-role="assistant"
                  data-generation-status={streaming.status}
                  data-assistant-message-id={streaming.assistantMessageId}
                >
                  <p className="bubble bubble--assistant">
                    {streaming.content}
                    {/* 글이 이어서 나오는 중임을 보여주는 커서. 내용이 아니므로 읽지 않는다. */}
                    {streaming.status === "streaming" && (
                      <span className="stream-cursor" aria-hidden="true" />
                    )}
                  </p>
                  <CitationList citations={streaming.citations} />
                  {streaming.status === "streaming" && (
                    <div className="generating">
                      <span role="status">
                        답변 생성 중 · 참고 자료 {streaming.citations.length}개
                      </span>
                      <button
                        className="button--secondary button--small"
                        type="button"
                        onClick={chat.cancel}
                      >
                        <Icon name="stop" size={14} />
                        중단
                      </button>
                    </div>
                  )}
                  {streaming.status === "cancel_requested" && (
                    <p className="notice" role="status">
                      취소를 요청했습니다…
                    </p>
                  )}
                  {streaming.status === "reconciling" && (
                    <p className="notice" role="status">
                      결과를 확인하는 중입니다.
                    </p>
                  )}
                  <div className="assistant-block__meta">
                    <MockBadge mode={streaming.mode} />
                  </div>
                </div>
              </div>
            </li>
          )}
        </ul>
        {/* 스크롤 목적지. ul 안에 두면 li가 아닌 자식이 되어 마크업이 어긋난다. */}
        <div ref={bottomRef} aria-hidden="true" />
      </div>

      <div className="composer-dock">
        {chat.sendError !== null && (
          <p className="error" role="alert">
            {chat.sendError}
          </p>
        )}

        <form className="composer" onSubmit={submit}>
          {/* 라벨은 화면에서 숨기지만 지우지 않는다. 입력창의 접근성 이름이고 테스트도
              이 이름으로 찾는다. */}
          <label htmlFor="chat-input" className="visually-hidden">
            메시지
          </label>
          <div className="composer__box">
            <textarea
              id="chat-input"
              rows={1}
              value={input}
              disabled={busy}
              placeholder={`${personaName}에게 질문하기`}
              aria-describedby="chat-input-note"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <div className="composer__foot">
              <CharCounter
                length={questionLength}
                max={QUESTION_MAX}
                blocking
                overText=" — 상한 초과, 전송 불가"
              />
              <button type="submit" className="send-button" disabled={!canSend}>
                <Icon name="send" />
                <span className="visually-hidden">보내기</span>
              </button>
            </div>
          </div>
          {questionTooLong && (
            <p className="error" role="alert">
              질문은 최대 {QUESTION_MAX.toLocaleString("ko-KR")}자까지 보낼 수
              있습니다. 질문을 줄여주세요.
            </p>
          )}
          <p id="chat-input-note" className="composer__note">
            답변은 {personaName}의 자료만 참고해서 만들어져요
          </p>
        </form>
      </div>
    </div>
  );
}
