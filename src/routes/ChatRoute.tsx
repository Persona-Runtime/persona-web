import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router";
import { RetryNotice } from "../components/RetryNotice";
import { WorkspaceHeading } from "../components/WorkspaceHeading";
import { useStudio } from "../lib/studioContext";
import { useChat } from "../lib/useChat";
import type { Generation, MessageTurn } from "../lib/types";

const MAX_MESSAGE_CHARS = 2000;

/**
 * 대화 화면. 캐릭터 자료가 적용된(Draft.status === "ready") 뒤에만 열린다.
 *
 * 실제 fetch 기반 POST SSE로 서버와 통신한다(EventSource 안 씀 — 인증 헤더와 POST
 * body를 보내야 한다). Content-Type을 먼저 검사해 JSON replay와 스트림을 구분하는
 * 책임은 lib/api.ts의 httpPersonaApi가 진다 — 이 화면은 결과 유니온만 본다.
 */
export function ChatRoute() {
  const { personaId } = useParams();
  const { api, findPersona } = useStudio();
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
      api={api}
      personaId={personaId}
      personaName={persona.name}
      activeVersionId={persona.active_version_id}
    />
  );
}

function generationStatusLabel(generation: Generation): string | null {
  switch (generation.status) {
    case "cancelled":
      return "취소됨";
    case "failed":
      return "응답 생성에 실패했습니다.";
    case "reconciling":
      return "결과를 확인하는 중입니다.";
    default:
      return null;
  }
}

function TurnView({
  turn,
  onRetry,
  retryDisabled,
}: {
  turn: MessageTurn;
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
      <p data-role="user" data-user-message-id={turn.user_message.id}>
        {turn.user_message.content}
      </p>
      {latest !== undefined && (
        <div
          data-role="assistant"
          data-generation-status={latest.status}
          data-assistant-message-id={latest.assistant_message_id}
        >
          <p>{latest.content}</p>
          {latest.citations.length > 0 && (
            <ul className="chat-citations" aria-label="참고 자료">
              {latest.citations.map((citation) => (
                <li key={citation.id}>{citation.title}</li>
              ))}
            </ul>
          )}
          {statusLabel !== null && (
            <p className="notice" role="status">
              {statusLabel}
            </p>
          )}
          {latest.can_retry && latest.status !== "completed" && (
            <button
              className="secondary"
              type="button"
              disabled={retryDisabled}
              onClick={() => onRetry(latest.id)}
            >
              다시 시도
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function ChatScreen({
  api,
  personaId,
  personaName,
  activeVersionId,
}: {
  api: ReturnType<typeof useStudio>["api"];
  personaId: string;
  personaName: string;
  activeVersionId: string | null;
}) {
  const chat = useChat(api, personaId);
  const [input, setInput] = useState("");

  // 대화 가능 여부는 **적용본**이 정한다. 초안 상태로 판정하면 안 된다 — 활성화하면
  // 초안 슬롯이 비어 getDraft가 409 draft_not_started를 돌려주므로, 정상적으로
  // 자료를 적용한 캐릭터일수록 대화가 막힌다. 서버도 같은 기준이다: 대화 생성은
  // 적용본이 없으면 409 no_active_version이다(계약 §7).
  if (activeVersionId === null) {
    return (
      <>
        <WorkspaceHeading id="workspace-title">
          {personaName} — 대화
        </WorkspaceHeading>
        <p className="guide">자료를 먼저 적용하세요.</p>
        <Link className="text-button" to={`/personas/${personaId}/draft`}>
          자료 편집으로 이동
        </Link>
      </>
    );
  }

  if (chat.state === "loading" || chat.state === "idle") {
    return (
      <>
        <WorkspaceHeading id="workspace-title">
          {personaName} — 대화
        </WorkspaceHeading>
        <p className="guide" role="status">
          대화를 불러오는 중입니다…
        </p>
      </>
    );
  }

  if (chat.state === "error") {
    return (
      <>
        <WorkspaceHeading id="workspace-title">
          {personaName} — 대화
        </WorkspaceHeading>
        <RetryNotice
          message={chat.loadError ?? "대화를 불러오지 못했습니다."}
          onRetry={() => window.location.reload()}
        />
      </>
    );
  }

  // 사용자당 활성 generation은 1개다 — 지금 스트리밍 중이거나 접수 응답을 기다리는
  // 동안은 전송·재시도를 막는다(서버 409를 굳이 유발하지 않는다).
  const busy = chat.streaming !== null || chat.sendState === "loading";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (trimmed === "" || trimmed.length > MAX_MESSAGE_CHARS || busy) return;
    chat.send(trimmed);
    setInput("");
  };

  return (
    <>
      <WorkspaceHeading id="workspace-title">
        {personaName} — 대화
      </WorkspaceHeading>

      <ul className="chat-messages">
        {chat.turns.map((turn) => (
          <TurnView
            key={turn.user_message.id}
            turn={turn}
            onRetry={chat.retry}
            retryDisabled={busy}
          />
        ))}
        {chat.streaming !== null && (
          <li className="chat-turn">
            <p
              data-role="user"
              data-user-message-id={chat.streaming.userMessage.id}
            >
              {chat.streaming.userMessage.content}
            </p>
            <div
              data-role="assistant"
              data-generation-status={chat.streaming.status}
              data-assistant-message-id={chat.streaming.assistantMessageId}
            >
              <p>{chat.streaming.content}</p>
              {chat.streaming.citations.length > 0 && (
                <ul className="chat-citations" aria-label="참고 자료">
                  {chat.streaming.citations.map((citation) => (
                    <li key={citation.id}>{citation.title}</li>
                  ))}
                </ul>
              )}
              {chat.streaming.status === "cancel_requested" && (
                <p className="notice" role="status">
                  취소를 요청했습니다…
                </p>
              )}
              {chat.streaming.status === "reconciling" && (
                <p className="notice" role="status">
                  결과를 확인하는 중입니다.
                </p>
              )}
            </div>
          </li>
        )}
      </ul>

      {chat.sendError !== null && (
        <p className="error" role="alert">
          {chat.sendError}
        </p>
      )}

      {chat.streaming !== null && chat.streaming.status === "streaming" && (
        <button className="secondary" type="button" onClick={chat.cancel}>
          응답 취소
        </button>
      )}

      <form onSubmit={submit}>
        <label htmlFor="chat-input">메시지</label>
        <input
          id="chat-input"
          value={input}
          disabled={busy}
          onChange={(event) => setInput(event.target.value)}
        />
        <button type="submit" disabled={busy || input.trim() === ""}>
          보내기
        </button>
      </form>
    </>
  );
}
